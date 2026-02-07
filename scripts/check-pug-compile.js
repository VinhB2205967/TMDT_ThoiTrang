// đây là script để kiểm tra tất cả các file .pug trong dự án có thể biên dịch được hay không

const fs = require('fs');
const path = require('path');
const pug = require('pug');
const { walkFilesSync } = require('./_lib/walk-files');

const projectRoot = path.resolve(__dirname, '..');
const viewsRoot = path.join(projectRoot, 'views');

function main() {
  if (!fs.existsSync(viewsRoot)) {
    console.error('Missing views directory:', viewsRoot);
    process.exitCode = 2;
    return;
  }

  const files = walkFilesSync(viewsRoot, (fullPath) => fullPath.toLowerCase().endsWith('.pug'));
  let ok = 0;
  let fail = 0;

  for (const file of files) {
    try {
      // Compile only (do not render) so undefined locals won't matter.
      pug.compileFile(file, {
        filename: file,
        basedir: viewsRoot,
        compileDebug: true
      });
      ok++;
    } catch (err) {
      fail++;
      console.error('\n[FAIL]', file);
      console.error(String(err && err.message ? err.message : err));
      if (err && err.code) console.error('code:', err.code);
      if (err && err.line) console.error('line:', err.line);
      if (err && err.column) console.error('column:', err.column);
      if (err && err.filename) console.error('filename:', err.filename);
    }
  }

  console.log(`\nPug compile summary: ok=${ok} fail=${fail} total=${files.length}`);
  process.exitCode = fail ? 1 : 0;
}

main();
