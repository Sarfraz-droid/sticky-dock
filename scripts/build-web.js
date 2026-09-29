// Builds a static website into dist-web/ from the same renderer code the
// desktop app uses. Upload dist-web/ to any static host (GitHub Pages, Netlify...).
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const out = path.join(root, 'dist-web');
const copy = (from, to) => fs.cpSync(path.join(root, from), path.join(out, to), { recursive: true });

fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(out, { recursive: true });
copy('src/renderer', 'src/renderer');
copy('src/shared', 'src/shared');
copy('assets', 'assets');
fs.copyFileSync(path.join(root, 'src/web/web-shim.js'), path.join(out, 'src/renderer/web-shim.js'));
fs.copyFileSync(path.join(root, 'src/web/web.css'), path.join(out, 'src/renderer/web.css'));

// note.html becomes index.html with the shim loaded before the app scripts.
let html = fs.readFileSync(path.join(root, 'src/renderer/note.html'), 'utf8');
html = html
  .replace('<link rel="stylesheet" href="note.css">', '<link rel="stylesheet" href="note.css">\n  <link rel="stylesheet" href="web.css">')
  .replace('<script src="pagination.js">', '<script src="../shared/themes.js"></script>\n  <script src="web-shim.js"></script>\n  <script src="pagination.js">')
  .replace('<title>Sticky Dock</title>', '<title>Sticky Dock</title>\n  <meta name="viewport" content="width=device-width, initial-scale=1">');
fs.writeFileSync(path.join(out, 'src/renderer/index.html'), html);
fs.writeFileSync(path.join(out, 'index.html'),
  '<!doctype html><meta charset="utf-8"><meta http-equiv="refresh" content="0; url=src/renderer/index.html"><title>Sticky Dock</title>');
fs.writeFileSync(path.join(out, '.nojekyll'), '');
console.log('Web build written to dist-web/');
