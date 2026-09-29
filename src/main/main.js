// main.js
// The "behind the scenes" part of Sticky Dock. It:
//   - creates two windows: the thin STRIP on the screen edge and the NOTE
//   - opens / collapses the note, docks the strip, remembers positions
//   - owns your saved notes (via storage.js) so text is safe even if the
//     note window crashes
//   - runs the tray icon, the global shortcut and "launch at startup"

const path = require('path');
const {
  app, BrowserWindow, ipcMain, screen, Tray, Menu, nativeImage,
  globalShortcut, dialog, shell
} = require('electron');
const { Storage } = require('./storage');
const { THEMES, DEFAULT_THEME, themeById } = require('../shared/themes');

// ---------- constants ----------
const ASSETS = path.join(__dirname, '..', '..', 'assets');
const THEMES_DIR = path.join(ASSETS, 'themes');
const themeImagePath = (t) => path.join(THEMES_DIR, t.file);
const STRIP_W = 40; // window width; the visible strip is 30 px and grows to 36 on hover
const STRIP_H = 140;
const NOTE_MIN = 280;
const NOTE_DEFAULT = 360;
const TOP_LEVEL = 'floating'; // above normal apps, below Windows' own start menu

// Tests can use a separate, throw-away data folder.
if (process.env.STICKY_DOCK_DATA) app.setPath('userData', process.env.STICKY_DOCK_DATA);

// ---------- only one copy of the app ----------
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => openNote());
}

let store; // Storage instance
let currentTheme = themeById(DEFAULT_THEME);
let themeIconDataUrl = null; // cropped character for the strip
let strip = null;
let note = null;
let tray = null;
let noteState = 'collapsed'; // 'collapsed' | 'open' | 'closing'
let openedAt = 0;
let lastProgrammaticMove = 0;
let suppressBlur = false; // true while a save dialog is open
let closeTimer = null;
let resizeStart = null;
let stripDragStartY = null;
let quitting = false;

const settings = () => store.state.settings;

// ---------- geometry helpers ----------
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

function stripDisplay() {
  const all = screen.getAllDisplays();
  if (strip && !strip.isDestroyed()) {
    // Dock on whichever monitor the strip currently sits on.
    const d = screen.getDisplayMatching(strip.getBounds());
    if (d) return d;
  }
  return all.find((d) => d.id === store.state.strip.displayId) || screen.getPrimaryDisplay();
}

function stripBounds(display = stripDisplay()) {
  const wa = display.workArea; // screen minus the taskbar
  const x = settings().dockSide === 'left' ? wa.x : wa.x + wa.width - STRIP_W;
  const y = wa.y + Math.round(clamp(store.state.strip.yRatio, 0, 1) * (wa.height - STRIP_H));
  return { x, y, width: STRIP_W, height: STRIP_H };
}

function placeStrip() {
  if (!strip || strip.isDestroyed()) return;
  const d = stripDisplay();
  store.state.strip.displayId = d.id;
  strip.setBounds(stripBounds(d));
}

// Is enough of this rectangle's top bar visible on some monitor to grab it?
function isReachable(r) {
  return screen.getAllDisplays().some((d) => {
    const wa = d.workArea;
    const w = Math.min(r.x + r.width, wa.x + wa.width) - Math.max(r.x, wa.x);
    const h = Math.min(r.y + 40, wa.y + wa.height) - Math.max(r.y, wa.y);
    return w >= 80 && h >= 20;
  });
}

function noteSizeFor(display) {
  const wa = display.workArea;
  return clamp(Math.round(store.state.note.size || NOTE_DEFAULT), NOTE_MIN, Math.min(wa.width, wa.height));
}

function dockedNoteBounds() {
  const d = stripDisplay();
  const wa = d.workArea;
  const size = noteSizeFor(d);
  const s = stripBounds(d);
  const x = settings().dockSide === 'left' ? wa.x : wa.x + wa.width - size;
  const y = clamp(Math.round(s.y + STRIP_H / 2 - size / 2), wa.y, wa.y + wa.height - size);
  return { x, y, width: size, height: size };
}

function noteBoundsForOpen() {
  const cp = store.state.note.customPos;
  if (cp) {
    const d = screen.getDisplayNearestPoint({ x: cp.x, y: cp.y });
    const size = noteSizeFor(d);
    const r = { x: cp.x, y: cp.y, width: size, height: size };
    if (isReachable(r)) return r;
    store.state.note.customPos = null; // it was on a monitor that's gone: dock it again
  }
  return dockedNoteBounds();
}

function setNoteBounds(r) {
  lastProgrammaticMove = Date.now();
  note.setBounds(r);
}

// ---------- windows ----------
const webPrefs = {
  preload: path.join(__dirname, '..', 'preload', 'preload.js'),
  contextIsolation: true,
  nodeIntegration: false,
  sandbox: true,
  spellcheck: false,
  // Keep the page rendering at full speed even while the window is hidden, so the
  // slide animation starts on the very first frame (throttling made it stutter on macOS).
  backgroundThrottling: false
};

const IS_MAC = process.platform === 'darwin';
// On macOS use a non-activating "panel" window: it floats over full-screen apps,
// doesn't pull the app to the front and behaves like a native utility popover.
const macPanel = IS_MAC ? { type: 'panel', roundedCorners: false } : {};

function createStrip() {
  strip = new BrowserWindow({
    ...stripBounds(),
    frame: false,
    transparent: true,
    resizable: false,
    movable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    focusable: false, // clicking the strip never steals typing focus from your other apps
    alwaysOnTop: true,
    show: false,
    hasShadow: false,
    ...macPanel,
    webPreferences: webPrefs
  });
  strip.setAlwaysOnTop(true, TOP_LEVEL);
  if (process.platform === 'darwin') strip.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  strip.loadFile(path.join(__dirname, '..', 'renderer', 'strip.html'));
  strip.once('ready-to-show', () => strip.showInactive());
}

function createNote() {
  note = new BrowserWindow({
    ...noteBoundsForOpen(),
    frame: false,
    transparent: true,
    resizable: false, // we resize ourselves with the corner grip (keeps it square)
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    show: false,
    hasShadow: false,
    ...macPanel,
    webPreferences: webPrefs
  });
  note.setAlwaysOnTop(true, TOP_LEVEL);
  if (IS_MAC) note.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  note.loadFile(path.join(__dirname, '..', 'renderer', 'note.html'));

  // Not pinned + you clicked somewhere else = tuck the note away.
  note.on('blur', () => {
    if (noteState !== 'open' || settings().pinned || suppressBlur) return;
    if (Date.now() - openedAt < 300) return; // ignore the focus shuffle right after opening
    collapseNote();
  });

  // You dragged the note somewhere: remember that spot.
  note.on('moved', () => {
    if (noteState !== 'open' || Date.now() - lastProgrammaticMove < 400) return;
    const b = note.getBounds();
    store.state.note.customPos = { x: b.x, y: b.y };
    store.saveStateSoon();
  });

  // Save straight away if Windows is shutting down or logging off.
  note.on('session-end', () => store.flushAll());

  // Closing the window (Alt+F4) just collapses it; "Quit" is in the tray menu.
  note.on('close', (e) => {
    if (!quitting) { e.preventDefault(); collapseNote(); }
  });
}

// ---------- open / collapse ----------
function openNote() {
  if (!note || note.isDestroyed()) return;
  if (noteState === 'open') { note.show(); note.focus(); return; }
  clearTimeout(closeTimer);
  setNoteBounds(noteBoundsForOpen());
  note.setAlwaysOnTop(true, TOP_LEVEL);
  noteState = 'open';
  openedAt = Date.now();
  // Tell the page first so it parks the note off-screen, then reveal the window;
  // otherwise macOS can flash one un-animated frame before the slide starts.
  note.webContents.send('note:animate-open', { side: settings().dockSide });
  note.show();
  note.focus();
  if (strip && !strip.isDestroyed()) strip.hide();
}

function collapseNote() {
  if (noteState !== 'open') return;
  noteState = 'closing';
  note.webContents.send('note:animate-close', { side: settings().dockSide });
  // If the animation message gets lost, collapse anyway.
  closeTimer = setTimeout(finishCollapse, 600);
}

function finishCollapse() {
  clearTimeout(closeTimer);
  if (noteState !== 'closing') return;
  noteState = 'collapsed';
  note.hide();
  placeStrip();
  strip.showInactive();
  strip.setAlwaysOnTop(true, TOP_LEVEL);
}

function toggleNote() {
  if (noteState === 'open') collapseNote();
  else openNote();
}

// ---------- settings ----------
function broadcastSettings() {
  for (const w of [note, strip]) {
    if (w && !w.isDestroyed()) w.webContents.send('settings:changed', settings());
  }
  updateTrayMenu();
}

function registerShortcut(accel) {
  globalShortcut.unregisterAll();
  if (!accel) return true;
  try {
    return globalShortcut.register(accel, toggleNote);
  } catch (_) {
    return false; // not a valid key combination
  }
}

function applyLoginItem(on) {
  if (process.platform !== 'win32' && process.platform !== 'darwin') return;
  app.setLoginItemSettings({ openAtLogin: !!on });
}

function setSetting(key, value) {
  const s = settings();
  switch (key) {
    case 'pinned':
      s.pinned = !!value;
      break;
    case 'launchAtStartup':
      s.launchAtStartup = !!value;
      applyLoginItem(s.launchAtStartup);
      break;
    case 'dockSide':
      if (value !== 'left' && value !== 'right') return { ok: false, error: 'Unknown side.' };
      s.dockSide = value;
      placeStrip();
      if (noteState === 'open' && !store.state.note.customPos) setNoteBounds(dockedNoteBounds());
      break;
    case 'fontSize':
      if (!['small', 'medium', 'large'].includes(value)) return { ok: false, error: 'Unknown size.' };
      s.fontSize = value;
      break;
    case 'shortcut': {
      const old = s.shortcut;
      if (!registerShortcut(value)) {
        registerShortcut(old); // put the previous one back
        return {
          ok: false,
          error: 'That shortcut is already used by another app (or isn\'t a valid key combo). Try a different one.'
        };
      }
      s.shortcut = value;
      break;
    }
    default:
      return { ok: false, error: 'Unknown setting.' };
  }
  store.saveStateSoon();
  broadcastSettings();
  return { ok: true, settings: s };
}

// ---------- the character on its own (strip + tray icon) ----------
function makeThemeIcon(theme) {
  // Crop the character region out of the theme picture. No fancy cut-out - the
  // strip's inner panel uses the theme's cream colour, so a plain crop blends in.
  const img = nativeImage.createFromPath(themeImagePath(theme));
  const c = theme.strip;
  const { width, height } = img.getSize();
  let x = Math.floor(c.l * width), y = Math.floor(c.t * height);
  let w = Math.max(1, Math.round((c.r - c.l) * width));
  let h = Math.max(1, Math.round((c.b - c.t) * height));
  const side = Math.min(Math.max(w, h), width, height);
  x = clamp(x - Math.floor((side - w) / 2), 0, width - side);
  y = clamp(y - Math.floor((side - h) / 2), 0, height - side);
  return img.crop({ x, y, width: side, height: side });
}

function refreshThemeIcon() {
  try {
    const icon = makeThemeIcon(currentTheme);
    themeIconDataUrl = icon.resize({ width: 96, height: 96, quality: 'best' }).toDataURL();
    if (tray) tray.setImage(trayImageFrom(icon));
  } catch (err) {
    console.error('Could not build theme icon:', err);
  }
}

function trayImageFrom(icon) {
  const t = icon.resize({ width: 18, height: 18, quality: 'best' });
  t.addRepresentation({ scaleFactor: 2, buffer: icon.resize({ width: 36, height: 36, quality: 'best' }).toPNG() });
  return t;
}

function updateTrayMenu() {
  if (!tray) return;
  const s = settings();
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: 'Open note', click: openNote },
    { label: 'Pin note', type: 'checkbox', checked: s.pinned, click: (i) => setSetting('pinned', i.checked) },
    { label: 'Launch at startup', type: 'checkbox', checked: s.launchAtStartup, click: (i) => setSetting('launchAtStartup', i.checked) },
    { type: 'separator' },
    { label: 'Quit Sticky Dock', click: () => app.quit() }
  ]));
}

function createTray() {
  tray = new Tray(trayImageFrom(makeThemeIcon(currentTheme)));
  tray.setToolTip('Sticky Dock');
  tray.on('click', toggleNote);
  updateTrayMenu();
}

// ---------- messages from the windows ----------
function setupIpc() {
  ipcMain.handle('app:get-initial', () => ({
    notesData: store.getNotesData(),
    settings: settings(),
    themes: THEMES,
    themeChosen: !!settings().theme,
    theme: currentTheme,
    themeIcon: themeIconDataUrl,
    notice: store.notice
  }));
  ipcMain.on('app:notice-seen', () => { store.notice = null; });

  // choosing / changing the note design
  ipcMain.handle('app:set-theme', (_e, id) => {
    const t = themeById(id);
    currentTheme = t;
    settings().theme = t.id;
    store.saveStateSoon();
    refreshThemeIcon();
    for (const w of [note, strip]) {
      if (w && !w.isDestroyed()) w.webContents.send('theme:changed', { theme: t, themeIcon: themeIconDataUrl });
    }
    return { ok: true, theme: t, themeIcon: themeIconDataUrl };
  });

  // notes
  ipcMain.on('notes:upsert', (_e, n) => store.upsertNote(n));
  ipcMain.on('notes:delete', (_e, id) => store.deleteNote(id));
  ipcMain.handle('notes:restore', (_e, id) => store.restoreNote(id));
  ipcMain.on('notes:set-last', (_e, id) => store.setLastNote(id));
  ipcMain.handle('notes:get-deleted', () => store.getNotesData().deleted);

  // settings
  ipcMain.handle('settings:set', (_e, key, value) => setSetting(key, value));
  ipcMain.handle('app:export', async () => {
    suppressBlur = true;
    try {
      const { canceled, filePath } = await dialog.showSaveDialog(note, {
        title: 'Export all notes',
        defaultPath: path.join(app.getPath('documents'), 'sticky-dock-notes.txt'),
        filters: [{ name: 'Text file', extensions: ['txt'] }]
      });
      if (canceled || !filePath) return { ok: false, canceled: true };
      require('fs').writeFileSync(filePath, store.exportAsText(), 'utf8');
      return { ok: true, filePath };
    } catch (err) {
      return { ok: false, error: String(err.message || err) };
    } finally {
      suppressBlur = false;
      if (note && !note.isDestroyed()) note.focus();
    }
  });
  ipcMain.on('app:open-data-folder', () => shell.openPath(app.getPath('userData')));

  // note window
  ipcMain.on('note:collapse', collapseNote);
  ipcMain.on('note:close-done', finishCollapse);

  // dragging the open note by its top row (done here so it's smooth and
  // works on macOS transparent windows, where the CSS drag region is unreliable)
  let noteDragStart = null;
  ipcMain.on('note:drag-start', () => { noteDragStart = note.getBounds(); });
  ipcMain.on('note:drag-move', (_e, { dx, dy }) => {
    if (!noteDragStart) return;
    lastProgrammaticMove = Date.now();
    let x = Math.round(noteDragStart.x + dx);
    let y = Math.round(noteDragStart.y + dy);
    // Keep at least part of the top bar on some screen so it's always grabbable.
    const r = { x, y, width: noteDragStart.width, height: noteDragStart.height };
    if (!isReachable(r)) {
      const wa = screen.getDisplayMatching(r).workArea;
      x = clamp(x, wa.x - r.width + 90, wa.x + wa.width - 90);
      y = clamp(y, wa.y, wa.y + wa.height - 30);
    }
    note.setBounds({ x, y, width: noteDragStart.width, height: noteDragStart.height });
  });
  ipcMain.on('note:drag-end', () => {
    if (!noteDragStart) return;
    noteDragStart = null;
    const b = note.getBounds();
    store.state.note.customPos = { x: b.x, y: b.y };
    store.saveStateSoon();
  });
  ipcMain.on('note:resize-start', () => {
    const b = note.getBounds();
    const wa = screen.getDisplayMatching(b).workArea;
    resizeStart = { b, wa, docked: !store.state.note.customPos };
  });
  ipcMain.on('note:resize-to', (_e, wanted) => {
    if (!resizeStart) return;
    const { b, wa, docked } = resizeStart;
    const maxSize = Math.min(wa.width, wa.height);
    const size = clamp(Math.round(wanted), NOTE_MIN, maxSize);
    let x = b.x;
    // When docked on the right, grow to the left so it stays glued to the edge.
    if (docked && settings().dockSide === 'right') x = b.x + b.width - size;
    x = clamp(x, wa.x, wa.x + wa.width - size);
    const y = clamp(b.y, wa.y, wa.y + wa.height - size);
    setNoteBounds({ x, y, width: size, height: size });
  });
  ipcMain.on('note:resize-end', () => {
    if (!resizeStart) return;
    const b = note.getBounds();
    store.state.note.size = b.width;
    if (!resizeStart.docked) store.state.note.customPos = { x: b.x, y: b.y };
    resizeStart = null;
    store.saveStateSoon();
  });

  // strip window
  ipcMain.on('strip:open', openNote);
  ipcMain.on('strip:drag-start', () => { stripDragStartY = strip.getBounds().y; });
  ipcMain.on('strip:drag-move', (_e, dy) => {
    if (stripDragStartY === null) return;
    const wa = stripDisplay().workArea;
    const y = clamp(Math.round(stripDragStartY + dy), wa.y, wa.y + wa.height - STRIP_H);
    const b = strip.getBounds();
    strip.setBounds({ ...b, y });
  });
  ipcMain.on('strip:drag-end', () => {
    if (stripDragStartY === null) return;
    stripDragStartY = null;
    const d = stripDisplay();
    const wa = d.workArea;
    store.state.strip.yRatio = (strip.getBounds().y - wa.y) / Math.max(1, wa.height - STRIP_H);
    store.state.strip.displayId = d.id;
    store.saveStateSoon();
  });
}

// ---------- screens changing (resolution, monitors plugged in/out) ----------
function onDisplaysChanged() {
  placeStrip();
  if (note && !note.isDestroyed() && noteState === 'open') {
    const b = note.getBounds();
    if (!isReachable(b)) {
      store.state.note.customPos = null;
      setNoteBounds(dockedNoteBounds());
    } else if (!store.state.note.customPos) {
      setNoteBounds(dockedNoteBounds());
    }
  }
}

// ---------- start up ----------
app.whenReady().then(() => {
  if (process.platform === 'win32') app.setAppUserModelId('com.sarfraz.stickydock');
  // On macOS this is a menu-bar utility, so keep it out of the Dock and Cmd-Tab.
  if (IS_MAC && app.dock) app.dock.hide(); // menu-bar utility, no Dock icon
  store = new Storage(app.getPath('userData'));
  currentTheme = themeById(settings().theme || DEFAULT_THEME);
  refreshThemeIcon();

  setupIpc();
  createStrip();
  createNote();
  createTray();

  // First launch (no design chosen yet): open the note so the picker shows.
  if (!settings().theme) note.once('ready-to-show', () => openNote());

  if (!registerShortcut(settings().shortcut)) {
    const msg = `The shortcut ${settings().shortcut} is already used by another app, so it's switched off for now. ` +
      'You can pick a different one in settings.';
    store.notice = store.notice ? `${store.notice}\n\n${msg}` : msg;
  }
  applyLoginItem(settings().launchAtStartup);

  screen.on('display-added', onDisplaysChanged);
  screen.on('display-removed', onDisplaysChanged);
  screen.on('display-metrics-changed', onDisplaysChanged);

  // Keep the strip above other "always on top" windows that may appear later.
  setInterval(() => {
    if (strip && !strip.isDestroyed() && strip.isVisible()) strip.setAlwaysOnTop(true, TOP_LEVEL);
  }, 5000);

  // If something went wrong loading notes, open the note so you see the message.
  if (store.notice) note.once('ready-to-show', () => openNote());

  if (process.env.STICKY_DOCK_TEST) {
    require(path.resolve(process.env.STICKY_DOCK_TEST))({
      app, store, get strip() { return strip; }, get note() { return note; },
      openNote, collapseNote, setSetting, getState: () => noteState,
      get theme() { return currentTheme; }
    });
  }
});

app.on('before-quit', () => {
  quitting = true;
  if (store) store.flushAll();
});
app.on('will-quit', () => globalShortcut.unregisterAll());
app.on('window-all-closed', (e) => e.preventDefault && e.preventDefault());
