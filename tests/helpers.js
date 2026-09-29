// Small helpers shared by the test scripts.
const fs = require('fs');
const path = require('path');
const OUT = path.join(__dirname, 'output');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let failures = 0;
function check(name, ok, extra = '') {
  if (!ok) failures++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? '  (' + extra + ')' : ''}`);
}
async function shot(win, name) {
  const img = await win.webContents.capturePage();
  fs.writeFileSync(path.join(OUT, name + '.png'), img.toPNG());
}
const js = (win, code) => win.webContents.executeJavaScript(code);
async function waitFor(fn, ms = 5000) {
  const t = Date.now();
  while (Date.now() - t < ms) { if (await fn()) return true; await sleep(50); }
  return false;
}
function done(app) {
  console.log(failures ? `\n${failures} check(s) FAILED` : '\nall checks passed');
  app.exit(failures ? 1 : 0);
}
module.exports = { sleep, check, shot, js, waitFor, done };
