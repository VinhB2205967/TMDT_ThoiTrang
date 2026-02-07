/* eslint-disable no-console */

const fs = require('fs');
const path = require('path');

/**
 * Recursively walk files under a directory (sync).
 * @param {string} dir
 * @param {(fullPath: string, dirent: import('fs').Dirent) => boolean} [fileFilter]
 * @param {string[]} [out]
 * @returns {string[]}
 */
function walkFilesSync(dir, fileFilter, out = []) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const ent of entries) {
    const full = path.join(dir, ent.name);
    if (ent.isDirectory()) {
      walkFilesSync(full, fileFilter, out);
      continue;
    }
    if (ent.isFile()) {
      if (!fileFilter || fileFilter(full, ent)) out.push(full);
    }
  }
  return out;
}

module.exports = {
  walkFilesSync
};
