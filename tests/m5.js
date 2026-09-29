const fs = require('fs');
const path = require('path');
const { BrowserWindow, screen } = require('electron');
const { sleep, check, shot, js, waitFor, done } = require('./helpers');

module.exports = async (api) => {
  const { app, store } = api;
  const stateFile = path.join(app.getPath('userData'), 'state.json');
  await waitFor(() => api.strip.isVisible()); await sleep(600);

  // a decoy window we can focus to make the note lose focus (simulates clicking elsewhere)
  const decoy = new BrowserWindow({ width: 200, height: 150, x: 100, y: 100, show: true, skipTaskbar: true });
  await sleep(200);

  // --- click-outside collapses when NOT pinned ---
  api.openNote(); await sleep(400);
  check('starts unpinned', store.state.settings.pinned === false);
  decoy.focus();
  await waitFor(() => api.getState() === 'collapsed', 1500);
  check('click outside collapses an unpinned note', api.getState() === 'collapsed', api.getState());

  // --- pin keeps it open when clicking elsewhere ---
  await api.setSetting('pinned', true); await sleep(100);
  api.openNote(); await sleep(400);
  decoy.focus();
  await sleep(600);
  check('pinned note stays open when clicking elsewhere', api.getState() === 'open', api.getState());
  const st1 = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
  check('pin state saved to disk', st1.settings.pinned === true);
  await shot(api.note, 'm5-pinned');

  // pin button look reflects state
  const pinLook = await js(api.note, `({ pressed: document.getElementById('pinBtn').getAttribute('aria-pressed') })`);
  check('pin button shows pressed state', pinLook.pressed === 'true');

  // --- Escape collapses (even pinned) ---
  api.note.focus(); await sleep(100);
  await js(api.note, `document.getElementById('page').focus()`);
  await js(api.note, `document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}))`);
  await waitFor(() => api.getState() !== 'open', 1500);
  check('Escape collapses even when pinned', api.getState() !== 'open', api.getState());
  await sleep(400);

  // --- dragging the note is remembered ---
  await api.setSetting('pinned', false); await sleep(50);
  api.openNote(); await sleep(400);
  const target = { x: 300, y: 220 };
  api.note.setBounds({ ...api.note.getBounds(), ...target });
  api.note.emit('moved'); // main process listens for this to record the position
  await sleep(400);
  check('dragged position saved', store.state.note.customPos && Math.abs(store.state.note.customPos.x - 300) < 3, JSON.stringify(store.state.note.customPos));

  // collapse (goes back to the edge strip), then reopen where we dragged it
  api.collapseNote(); await sleep(500);
  check('collapsing a moved note shows the edge strip', api.strip.isVisible());
  api.openNote(); await sleep(400);
  const reopened = api.note.getBounds();
  check('reopens where it was last dragged', Math.abs(reopened.x - 300) < 3 && Math.abs(reopened.y - 220) < 3, JSON.stringify(reopened));

  // --- remembered size ---
  api.note.setBounds({ ...api.note.getBounds(), width: 300, height: 300 });
  api.note.webContents.send('note:resize-start'); // not used directly; set size via state
  store.state.note.size = 300; store.saveStateNow();
  const st2 = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
  check('note size saved to disk', st2.note.size === 300);

  // --- strip vertical position remembered ---
  store.state.strip.yRatio = 0.15; store.saveStateNow();
  const st3 = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
  check('strip vertical position saved', Math.abs(st3.strip.yRatio - 0.15) < 0.001);

  decoy.destroy();
  done(app);
};
