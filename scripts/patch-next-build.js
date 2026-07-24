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
    return originalFn.call(this, oldPath, newPath);
  };
}

function wrapSyncRename(originalFn) {
  if (typeof originalFn !== 'function') return originalFn;
  return function (oldPath, newPath) {
    ensureDir(newPath);
    return originalFn.call(this, oldPath, newPath);
  };
}

const noop = () => {};

function wrapCallbackRename(originalFn) {
  if (typeof originalFn !== 'function') return originalFn;
  const wrapped = function (oldPath, newPath, callback) {
    ensureDir(newPath);
    const cb = typeof callback === 'function' ? callback : noop;
    return originalFn.call(this, oldPath, newPath, cb);
  };

  // Preserve util.promisify custom implementation symbol
  if (originalFn[util.promisify.custom]) {
    wrapped[util.promisify.custom] = wrapAsyncRename(originalFn[util.promisify.custom]);
  } else if (fs.promises && fs.promises.rename) {
    wrapped[util.promisify.custom] = wrapAsyncRename(fs.promises.rename);
  }

  return wrapped;
}

// 1. Patch main 'fs' module
if (fs.rename) fs.rename = wrapCallbackRename(fs.rename);
if (fs.renameSync) fs.renameSync = wrapSyncRename(fs.renameSync);
if (fs.promises && fs.promises.rename) fs.promises.rename = wrapAsyncRename(fs.promises.rename);

// 2. Intercept Module.prototype.require for 'fs/promises' & 'node:fs/promises' & 'fs'
const Module = require('module');
const originalRequire = Module.prototype.require;

Module.prototype.require = function (moduleName) {
  const mod = originalRequire.apply(this, arguments);
  if (moduleName === 'fs/promises' || moduleName === 'node:fs/promises' || moduleName === 'fs' || moduleName === 'node:fs') {
    if (mod) {
      if (mod.rename && !mod.__patchedAsync) {
        mod.rename = wrapAsyncRename(mod.rename);
        mod.__patchedAsync = true;
      }
      if (mod.renameSync && !mod.__patchedSync) {
        mod.renameSync = wrapSyncRename(mod.renameSync);
        mod.__patchedSync = true;
      }
      if (mod.promises && mod.promises.rename && !mod.promises.__patchedAsync) {
        mod.promises.rename = wrapAsyncRename(mod.promises.rename);
        mod.promises.__patchedAsync = true;
      }
    }
  }
  return mod;
};

// 3. Eagerly patch direct requires
['fs/promises', 'node:fs/promises'].forEach(modName => {
  try {
    const mod = require(modName);
    if (mod && mod.rename && !mod.__patchedAsync) {
      mod.rename = wrapAsyncRename(mod.rename);
      mod.__patchedAsync = true;
    }
  } catch (e) {}
});

console.log('[patch-next-build] Next.js build fs.rename patch (promisify aware) active.');
