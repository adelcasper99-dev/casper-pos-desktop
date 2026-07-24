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
function wrapAsyncReadFile(originalFn) {
  if (typeof originalFn !== 'function') return originalFn;
  return async function (filePath, ...args) {
    try {
      return await originalFn.call(this, filePath, ...args);
    } catch (e) {
      if (e.code === 'ENOENT' && typeof filePath === 'string' && filePath.endsWith('.nft.json')) {
        console.warn(`[patch-next-build] Ignored ENOENT on missing nft trace: ${filePath}`);
        return '{"version":1,"files":[]}';
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
      if (e.code === 'ENOENT' && typeof filePath === 'string' && filePath.endsWith('.nft.json')) {
        console.warn(`[patch-next-build] Ignored ENOENT on missing nft trace: ${filePath}`);
        return '{"version":1,"files":[]}';
      }
      throw e;
    }
  };
}

function wrapCallbackReadFile(originalFn) {
  if (typeof originalFn !== 'function') return originalFn;
  const wrapped = function (filePath, ...args) {
    const callback = args[args.length - 1];
    if (typeof callback === 'function' && typeof filePath === 'string' && filePath.endsWith('.nft.json') && !fs.existsSync(filePath)) {
      console.warn(`[patch-next-build] Ignored ENOENT on missing nft trace: ${filePath}`);
      return callback(null, '{"version":1,"files":[]}');
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

// 1. Patch main 'fs' module
if (fs.rename) fs.rename = wrapCallbackRename(fs.rename);
if (fs.renameSync) fs.renameSync = wrapSyncRename(fs.renameSync);
if (fs.promises && fs.promises.rename) fs.promises.rename = wrapAsyncRename(fs.promises.rename);

if (fs.readFile) fs.readFile = wrapCallbackReadFile(fs.readFile);
if (fs.readFileSync) fs.readFileSync = wrapSyncReadFile(fs.readFileSync);
if (fs.promises && fs.promises.readFile) fs.promises.readFile = wrapAsyncReadFile(fs.promises.readFile);

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
    }
  } catch (e) {}
});

console.log('[patch-next-build] Next.js build fs.rename & nft.json patch active.');
