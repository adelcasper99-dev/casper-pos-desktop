const fs = require('fs');
const path = require('path');
const util = require('util');

function ensureDir(targetPath) {
  try {
    if (typeof targetPath === 'string') {
      const dir = path.dirname(targetPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
    }
  } catch (e) {}
}

function wrapAsyncRename(originalFn) {
  if (typeof originalFn !== 'function') return originalFn;
  return async function (oldPath, newPath) {
    ensureDir(newPath);
    try {
      return await originalFn.call(this, oldPath, newPath);
    } catch (e) {
      if (e.code === 'ENOENT' && !fs.existsSync(oldPath)) {
        console.warn(`[patch-next-build] Ignored ENOENT on missing source: ${oldPath}`);
        return;
      }
      throw e;
    }
  };
}

function wrapSyncRename(originalFn) {
  if (typeof originalFn !== 'function') return originalFn;
  return function (oldPath, newPath) {
    ensureDir(newPath);
    try {
      return originalFn.call(this, oldPath, newPath);
    } catch (e) {
      if (e.code === 'ENOENT' && !fs.existsSync(oldPath)) {
        console.warn(`[patch-next-build] Ignored ENOENT on missing source: ${oldPath}`);
        return;
      }
      throw e;
    }
  };
}

const noop = () => {};

function wrapCallbackRename(originalFn) {
  if (typeof originalFn !== 'function') return originalFn;
  const wrapped = function (oldPath, newPath, callback) {
    ensureDir(newPath);
    const cb = typeof callback === 'function' ? callback : noop;
    
    if (typeof oldPath === 'string' && !fs.existsSync(oldPath)) {
       console.warn(`[patch-next-build] Ignored ENOENT on missing source: ${oldPath}`);
       return cb(null);
    }

    return originalFn.call(this, oldPath, newPath, cb);
  };

  if (originalFn[util.promisify.custom]) {
    wrapped[util.promisify.custom] = wrapAsyncRename(originalFn[util.promisify.custom]);
  } else if (fs.promises && fs.promises.rename) {
    wrapped[util.promisify.custom] = wrapAsyncRename(fs.promises.rename);
  }

  return wrapped;
}

// -------------------------------------------------------------
// ReadFile patch for missing .nft.json trace files in Next.js
// -------------------------------------------------------------
function shouldFallbackMissingFile(filePath) {
  if (typeof filePath !== 'string') return null;
  if (filePath.endsWith('.nft.json')) {
    return '{"version":1,"files":[]}';
  }
  if (
    filePath.endsWith('pages-manifest.json') ||
    filePath.endsWith('app-build-manifest.json') ||
    filePath.endsWith('app-paths-manifest.json')
  ) {
    return '{}';
  }
  return null;
}

function wrapAsyncReadFile(originalFn) {
  if (typeof originalFn !== 'function') return originalFn;
  return async function (filePath, ...args) {
    try {
      return await originalFn.call(this, filePath, ...args);
    } catch (e) {
      if (e.code === 'ENOENT') {
        const fallback = shouldFallbackMissingFile(filePath);
        if (fallback !== null) {
          console.warn(`[patch-next-build] Ignored ENOENT on missing file: ${filePath}`);
          return fallback;
        }
      }
      throw e;
    }
  };
}

function wrapSyncReadFile(originalFn) {
  if (typeof originalFn !== 'function') return originalFn;
  return function (filePath, ...args) {
    try {
      return originalFn.call(this, filePath, ...args);
    } catch (e) {
      if (e.code === 'ENOENT') {
        const fallback = shouldFallbackMissingFile(filePath);
        if (fallback !== null) {
          console.warn(`[patch-next-build] Ignored ENOENT on missing file: ${filePath}`);
          return fallback;
        }
      }
      throw e;
    }
  };
}

function wrapCallbackReadFile(originalFn) {
  if (typeof originalFn !== 'function') return originalFn;
  const wrapped = function (filePath, ...args) {
    const callback = args[args.length - 1];
    if (typeof callback === 'function' && !fs.existsSync(filePath)) {
      const fallback = shouldFallbackMissingFile(filePath);
      if (fallback !== null) {
        console.warn(`[patch-next-build] Ignored ENOENT on missing file: ${filePath}`);
        return callback(null, fallback);
      }
    }
    return originalFn.call(this, filePath, ...args);
  };

  if (originalFn[util.promisify.custom]) {
    wrapped[util.promisify.custom] = wrapAsyncReadFile(originalFn[util.promisify.custom]);
  } else if (fs.promises && fs.promises.readFile) {
    wrapped[util.promisify.custom] = wrapAsyncReadFile(fs.promises.readFile);
  }

  return wrapped;
}

// -------------------------------------------------------------
// Rmdir patch for ENOTEMPTY errors in Next.js build cleanup
// -------------------------------------------------------------
let inAsyncRmdirPatch = false;
let inSyncRmdirPatch = false;
let inCallbackRmdirPatch = false;

function wrapAsyncRmdir(originalFn) {
  if (typeof originalFn !== 'function') return originalFn;
  return async function (dirPath, ...args) {
    try {
      return await originalFn.call(this, dirPath, ...args);
    } catch (e) {
      if (!inAsyncRmdirPatch && (e.code === 'ENOTEMPTY' || e.code === 'EEXIST') && typeof dirPath === 'string') {
        inAsyncRmdirPatch = true;
        try {
          console.warn(`[patch-next-build] Handling ENOTEMPTY on rmdir with recursive rm: ${dirPath}`);
          if (fs.promises && fs.promises.rm) {
            return await fs.promises.rm(dirPath, { recursive: true, force: true });
          }
        } finally {
          inAsyncRmdirPatch = false;
        }
      }
      throw e;
    }
  };
}

function wrapSyncRmdir(originalFn) {
  if (typeof originalFn !== 'function') return originalFn;
  return function (dirPath, ...args) {
    try {
      return originalFn.call(this, dirPath, ...args);
    } catch (e) {
      if (!inSyncRmdirPatch && (e.code === 'ENOTEMPTY' || e.code === 'EEXIST') && typeof dirPath === 'string') {
        inSyncRmdirPatch = true;
        try {
          console.warn(`[patch-next-build] Handling ENOTEMPTY on rmdirSync with recursive rmSync: ${dirPath}`);
          if (fs.rmSync) {
            return fs.rmSync(dirPath, { recursive: true, force: true });
          }
        } finally {
          inSyncRmdirPatch = false;
        }
      }
      throw e;
    }
  };
}

function wrapCallbackRmdir(originalFn) {
  if (typeof originalFn !== 'function') return originalFn;
  const wrapped = function (dirPath, ...args) {
    const callback = args[args.length - 1];
    const cb = typeof callback === 'function' ? callback : noop;
    
    return originalFn.call(this, dirPath, ...args.slice(0, args.length - 1), (err, ...res) => {
      if (err && !inCallbackRmdirPatch && (err.code === 'ENOTEMPTY' || err.code === 'EEXIST') && typeof dirPath === 'string') {
        inCallbackRmdirPatch = true;
        try {
          console.warn(`[patch-next-build] Handling ENOTEMPTY callback on rmdir with recursive rmSync: ${dirPath}`);
          if (fs.rmSync) fs.rmSync(dirPath, { recursive: true, force: true });
          return cb(null);
        } catch (rmErr) {
          return cb(rmErr);
        } finally {
          inCallbackRmdirPatch = false;
        }
      }
      return cb(err, ...res);
    });
  };

  if (originalFn[util.promisify.custom]) {
    wrapped[util.promisify.custom] = wrapAsyncRmdir(originalFn[util.promisify.custom]);
  } else if (fs.promises && fs.promises.rmdir) {
    wrapped[util.promisify.custom] = wrapAsyncRmdir(fs.promises.rmdir);
  }

  return wrapped;
}

// 1. Patch main 'fs' module
if (fs.rename) fs.rename = wrapCallbackRename(fs.rename);
if (fs.renameSync) fs.renameSync = wrapSyncRename(fs.renameSync);
if (fs.promises && fs.promises.rename) fs.promises.rename = wrapAsyncRename(fs.promises.rename);

if (fs.readFile) fs.readFile = wrapCallbackReadFile(fs.readFile);
if (fs.readFileSync) fs.readFileSync = wrapSyncReadFile(fs.readFileSync);
if (fs.promises && fs.promises.readFile) fs.promises.readFile = wrapAsyncReadFile(fs.promises.readFile);

if (fs.rmdir) fs.rmdir = wrapCallbackRmdir(fs.rmdir);
if (fs.rmdirSync) fs.rmdirSync = wrapSyncRmdir(fs.rmdirSync);
if (fs.promises && fs.promises.rmdir) fs.promises.rmdir = wrapAsyncRmdir(fs.promises.rmdir);

// 2. Intercept Module.prototype.require for 'fs/promises' & 'node:fs/promises' & 'fs'
const Module = require('module');
const originalRequire = Module.prototype.require;

Module.prototype.require = function (moduleName) {
  const mod = originalRequire.apply(this, arguments);
  
  if (moduleName === 'fs/promises' || moduleName === 'node:fs/promises') {
    if (mod) {
      if (mod.rename && !mod.__patchedAsync) {
        mod.rename = wrapAsyncRename(mod.rename);
        mod.__patchedAsync = true;
      }
      if (mod.readFile && !mod.__patchedReadFileAsync) {
        mod.readFile = wrapAsyncReadFile(mod.readFile);
        mod.__patchedReadFileAsync = true;
      }
      if (mod.rmdir && !mod.__patchedRmdirAsync) {
        mod.rmdir = wrapAsyncRmdir(mod.rmdir);
        mod.__patchedRmdirAsync = true;
      }
    }
  } else if (moduleName === 'fs' || moduleName === 'node:fs') {
    if (mod) {
      if (mod.rename && !mod.__patchedCallback) {
        mod.rename = wrapCallbackRename(mod.rename);
        mod.__patchedCallback = true;
      }
      if (mod.renameSync && !mod.__patchedSync) {
        mod.renameSync = wrapSyncRename(mod.renameSync);
        mod.__patchedSync = true;
      }
      if (mod.promises && mod.promises.rename && !mod.promises.__patchedAsync) {
        mod.promises.rename = wrapAsyncRename(mod.promises.rename);
        mod.promises.__patchedAsync = true;
      }
      if (mod.readFile && !mod.__patchedReadFileCallback) {
        mod.readFile = wrapCallbackReadFile(mod.readFile);
        mod.__patchedReadFileCallback = true;
      }
      if (mod.readFileSync && !mod.__patchedReadFileSync) {
        mod.readFileSync = wrapSyncReadFile(mod.readFileSync);
        mod.__patchedReadFileSync = true;
      }
      if (mod.promises && mod.promises.readFile && !mod.promises.__patchedReadFileAsync) {
        mod.promises.readFile = wrapAsyncReadFile(mod.promises.readFile);
        mod.promises.__patchedReadFileAsync = true;
      }
      if (mod.rmdir && !mod.__patchedRmdirCallback) {
        mod.rmdir = wrapCallbackRmdir(mod.rmdir);
        mod.__patchedRmdirCallback = true;
      }
      if (mod.rmdirSync && !mod.__patchedRmdirSync) {
        mod.rmdirSync = wrapSyncRmdir(mod.rmdirSync);
        mod.__patchedRmdirSync = true;
      }
      if (mod.promises && mod.promises.rmdir && !mod.promises.__patchedRmdirAsync) {
        mod.promises.rmdir = wrapAsyncRmdir(mod.promises.rmdir);
        mod.promises.__patchedRmdirAsync = true;
      }
    }
  }
  
  return mod;
};

// 3. Eagerly patch direct requires
['fs/promises', 'node:fs/promises'].forEach(modName => {
  try {
    const mod = require(modName);
    if (mod) {
      if (mod.rename && !mod.__patchedAsync) {
        mod.rename = wrapAsyncRename(mod.rename);
        mod.__patchedAsync = true;
      }
      if (mod.readFile && !mod.__patchedReadFileAsync) {
        mod.readFile = wrapAsyncReadFile(mod.readFile);
        mod.__patchedReadFileAsync = true;
      }
      if (mod.rmdir && !mod.__patchedRmdirAsync) {
        mod.rmdir = wrapAsyncRmdir(mod.rmdir);
        mod.__patchedRmdirAsync = true;
      }
    }
  } catch (e) {}
});

console.log('[patch-next-build] Next.js build fs.rename & nft.json & rmdir patch active.');
