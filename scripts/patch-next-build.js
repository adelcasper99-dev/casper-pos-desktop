const fs = require('fs');
const path = require('path');

// Intercept sync fs.rename
const originalRenameSync = fs.renameSync;
fs.renameSync = function (oldPath, newPath) {
  try {
    const dir = path.dirname(newPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  } catch (e) {}
  return originalRenameSync.apply(this, arguments);
};

// Intercept callback fs.rename
const originalRename = fs.rename;
fs.rename = function (oldPath, newPath, callback) {
  try {
    const dir = path.dirname(newPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  } catch (e) {}
  return originalRename.apply(this, arguments);
};

// Intercept promises fs.promises.rename
if (fs.promises && fs.promises.rename) {
  const originalPromisesRename = fs.promises.rename;
  fs.promises.rename = async function (oldPath, newPath) {
    try {
      const dir = path.dirname(newPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
    } catch (e) {}
    return originalPromisesRename.call(this, oldPath, newPath);
  };
}

console.log('[patch-next-build] Next.js build fs.rename patch active.');
