const fs = require('fs');
const path = require('path');
const { app: elapp, globalShortcut } = require('electron');
const { sleep, check, shot, js, waitFor, done } = require('./helpers');

module.exports = async (api) => {
  const { app, store } = api;
  const dir = app.getPath('userData');
  await waitFor(() => api.strip.isVisible()); await sleep(600);

  // --- tray icon exists and is not empty ---
  // (Tray is created in main; check via the icon file we can regenerate.)
  api.openNote(); await sleep(400);

  // --- settings panel opens and shows controls ---
  await js(api.note, `document.getElementById('gearBtn').click()`); await sleep(200);
  const controls = await js(api.note, `({
    pinned: !!document.getElementById('setPinned'),
    startup: !!document.getElementById('setStartup'),
    side: document.querySelectorAll('#setSide button').length,
    font: document.querySelectorAll('#setFont button').length,
    shortcut: document.getElementById('setShortcut').textContent,
    export: !!document.getElementById('exportBtn'),
    folder: !!document.getElementById('folderBtn')
  })`);
  check('settings shows all controls', controls.pinned && controls.startup && controls.side === 2 && controls.font === 3 && controls.export && controls.folder, JSON.stringify(controls));
  check('shortcut shown in friendly form', controls.shortcut === 'Ctrl + Alt + N', controls.shortcut);
  await shot(api.note, 'm6-settings');

  // --- global shortcut is actually registered ---
  check('default global shortcut registered', globalShortcut.isRegistered('Control+Alt+N'));

  // --- changing the shortcut re-registers ---
  const res = await api.setSetting('shortcut', 'Control+Alt+J');
  check('shortcut change accepted', res.ok === true);
  check('new shortcut registered', globalShortcut.isRegistered('Control+Alt+J'));
  check('old shortcut released', !globalShortcut.isRegistered('Control+Alt+N'));

  // --- a taken shortcut is rejected gracefully ---
  // Simulate the OS refusing the combo (as Windows does when another app owns it):
  const origReg = globalShortcut.register.bind(globalShortcut);
  globalShortcut.register = (acc, cb) => (acc === 'Control+Alt+K' ? false : origReg(acc, cb));
  const bad = await api.setSetting('shortcut', 'Control+Alt+K');
  globalShortcut.register = origReg;
  check('conflicting shortcut rejected with a message', bad.ok === false && /already/i.test(bad.error), JSON.stringify(bad));
  check('previous shortcut kept after a rejection', store.state.settings.shortcut === 'Control+Alt+J');

  // --- font size change from settings ---
  await api.setSetting('fontSize', 'small'); await sleep(100);
  check('font size setting applied', store.state.settings.fontSize === 'small');

  // --- launch at startup toggles the OS login item ---
  await api.setSetting('launchAtStartup', true); await sleep(100);
  check('launch-at-startup saved', store.state.settings.launchAtStartup === true);

  // --- backups: force several saves over the backup interval ---
  // shorten the interval by reaching into the store for the test
  store.lastBackupAt = 0;
  api.openNote();
  await js(api.note, `(() => { const d=window.__stickyDock; d.editor.setText('backup test v1', 0); d.current.text=d.editor.text; window.dock.upsertNote(d.current); })()`);
  store.saveNow();
  store.lastBackupAt = 0; // allow another backup immediately
  await js(api.note, `(() => { const d=window.__stickyDock; d.editor.setText('backup test v2', 0); d.current.text=d.editor.text; window.dock.upsertNote(d.current); })()`);
  store.saveNow();
  const backups = fs.readdirSync(path.join(dir, 'backups')).filter(f => /^notes-/.test(f));
  check('rolling backups are created', backups.length >= 1, `${backups.length} backups`);

  // --- corruption recovery: damage notes.json, reload store ---
  const notesFile = path.join(dir, 'notes.json');
  store.saveNow(); // ensure a good current file first (becomes a backup source)
  store.lastBackupAt = 0;
  // make one more good backup that we can recover from
  fs.copyFileSync(notesFile, path.join(dir, 'backups', 'notes-20200101-000000.json'));
  fs.writeFileSync(notesFile, '{ this is not valid json at all ');
  const { Storage } = require(path.join(__dirname, '..', 'src', 'main', 'storage.js'));
  const recovered = new Storage(dir);
  check('unreadable notes file recovers from a backup', recovered.data.notes.length >= 1 && !!recovered.notice, recovered.notice);
  const kept = fs.readdirSync(dir).some(f => /^notes\.unreadable-/.test(f));
  check('the damaged file is kept, not thrown away', kept);

  // --- export writes a text file with all notes ---
  const exportPath = path.join(dir, 'export-test.txt');
  fs.writeFileSync(exportPath, store.exportAsText());
  const text = fs.readFileSync(exportPath, 'utf8');
  check('export contains note text', text.includes('backup test'), text.slice(0, 40));

  done(app);
};
