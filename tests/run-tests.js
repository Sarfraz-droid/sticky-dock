// Runs the automated checks: starts the app with a throw-away data folder and
// a test script that clicks around, types, and saves screenshots to tests/output.
// Usage: node tests/run-tests.js [testfile]   (default: tests/e2e.js)
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');
const electron = require('electron');

const testFile = path.resolve(process.argv[2] || path.join(__dirname, 'e2e.js'));
const dataDir = process.env.STICKY_DOCK_DATA || fs.mkdtempSync(path.join(os.tmpdir(), 'sticky-dock-test-'));
fs.mkdirSync(path.join(__dirname, 'output'), { recursive: true });
const child = spawn(electron, [path.join(__dirname, '..'), '--no-sandbox'], {
  stdio: 'inherit',
  env: { ...process.env, STICKY_DOCK_TEST: testFile, STICKY_DOCK_DATA: dataDir }
});
child.on('exit', (code) => process.exit(code));
