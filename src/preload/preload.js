// preload.js
// The only bridge between the windows (HTML/JS) and the main process.
// Windows can't touch your files directly; they can only call the functions
// listed here. This is Electron's recommended secure setup.

const { contextBridge, ipcRenderer } = require('electron');

const on = (channel) => (callback) => {
  const listener = (_event, data) => callback(data);
  ipcRenderer.on(channel, listener);
  return () => ipcRenderer.removeListener(channel, listener);
};

contextBridge.exposeInMainWorld('dock', {
  // start-up data
  getInitial: () => ipcRenderer.invoke('app:get-initial'),
  noticeSeen: () => ipcRenderer.send('app:notice-seen'),

  // note design (theme)
  setTheme: (id) => ipcRenderer.invoke('app:set-theme', id),
  onThemeChanged: on('theme:changed'),

  // notes
  upsertNote: (note) => ipcRenderer.send('notes:upsert', note),
  deleteNote: (id) => ipcRenderer.send('notes:delete', id),
  restoreNote: (id) => ipcRenderer.invoke('notes:restore', id),
  getDeleted: () => ipcRenderer.invoke('notes:get-deleted'),
  setLastNote: (id) => ipcRenderer.send('notes:set-last', id),

  // settings and tools
  setSetting: (key, value) => ipcRenderer.invoke('settings:set', key, value),
  exportNotes: () => ipcRenderer.invoke('app:export'),
  openDataFolder: () => ipcRenderer.send('app:open-data-folder'),
  onSettingsChanged: on('settings:changed'),

  // note window
  collapse: () => ipcRenderer.send('note:collapse'),
  closeDone: () => ipcRenderer.send('note:close-done'),
  dragStart: () => ipcRenderer.send('note:drag-start'),
  dragMove: (dx, dy) => ipcRenderer.send('note:drag-move', { dx, dy }),
  dragEnd: () => ipcRenderer.send('note:drag-end'),
  onAnimateOpen: on('note:animate-open'),
  onAnimateClose: on('note:animate-close'),
  resizeStart: () => ipcRenderer.send('note:resize-start'),
  resizeTo: (size) => ipcRenderer.send('note:resize-to', size),
  resizeEnd: () => ipcRenderer.send('note:resize-end'),

  // strip window
  openFromStrip: () => ipcRenderer.send('strip:open'),
  stripDragStart: () => ipcRenderer.send('strip:drag-start'),
  stripDragMove: (dy) => ipcRenderer.send('strip:drag-move', dy),
  stripDragEnd: () => ipcRenderer.send('strip:drag-end')
});
