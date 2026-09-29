// web-shim.js
// Web build only. Provides the same `window.dock` API that preload.js gives the
// desktop app, but stores everything in the browser's localStorage instead of
// files on disk. There is no strip / global shortcut / tray on the web.

(function () {
  const KEY_NOTES = 'stickydock.notes.v1';
  const KEY_STATE = 'stickydock.state.v1';
  const DELETED_KEEP_MS = 30 * 24 * 60 * 60 * 1000;

  const read = (k, fallback) => {
    try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : fallback; } catch (_) { return fallback; }
  };
  const write = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (_) {} };

  const T = window.THEMES_DATA;
  const themes = T.THEMES;
  const themeById = (id) => themes.find((t) => t.id === id) || themes.find((t) => t.id === T.DEFAULT_THEME) || themes[0];

  const data = read(KEY_NOTES, { version: 1, notes: [], deleted: [], lastNoteId: null });
  data.deleted = (data.deleted || []).filter((n) => n.deletedAt > Date.now() - DELETED_KEEP_MS);
  const settings = Object.assign(
    { theme: null, pinned: true, launchAtStartup: false, dockSide: 'right', fontSize: 'medium', shortcut: '' },
    (read(KEY_STATE, {}).settings) || {}
  );

  let timer = null;
  const saveSoon = () => {
    clearTimeout(timer);
    timer = setTimeout(() => { write(KEY_NOTES, data); write(KEY_STATE, { settings }); }, 250);
  };
  window.addEventListener('pagehide', () => { write(KEY_NOTES, data); write(KEY_STATE, { settings }); });

  // The desktop app crops the character out for the strip; the web has no strip.
  const themeIcon = null;
  const listeners = { settings: [], theme: [] };
  const noop = () => () => {};

  window.dock = {
    getInitial: async () => ({
      notesData: data, settings, themes,
      themeChosen: !!settings.theme,
      theme: themeById(settings.theme), themeIcon, notice: null
    }),
    noticeSeen: () => {},

    setTheme: async (id) => {
      const t = themeById(id);
      settings.theme = t.id; saveSoon();
      return { ok: true, theme: t, themeIcon };
    },
    onThemeChanged: (cb) => { listeners.theme.push(cb); return noop(); },

    upsertNote: (n) => {
      const i = data.notes.findIndex((x) => x.id === n.id);
      if (i >= 0) data.notes[i] = n; else data.notes.push(n);
      saveSoon();
    },
    deleteNote: (id) => {
      const i = data.notes.findIndex((n) => n.id === id);
      if (i < 0) return;
      const [n] = data.notes.splice(i, 1);
      n.deletedAt = Date.now(); data.deleted.unshift(n); saveSoon();
    },
    restoreNote: async (id) => {
      const i = data.deleted.findIndex((n) => n.id === id);
      if (i < 0) return null;
      const [n] = data.deleted.splice(i, 1);
      delete n.deletedAt; n.updatedAt = Date.now(); data.notes.push(n); saveSoon();
      return n;
    },
    getDeleted: async () => data.deleted,
    setLastNote: (id) => { data.lastNoteId = id; saveSoon(); },

    setSetting: async (key, value) => {
      if (!(key in settings)) return { ok: false, error: 'Unknown setting.' };
      settings[key] = value; saveSoon();
      listeners.settings.forEach((cb) => cb(settings));
      return { ok: true, settings };
    },
    exportNotes: async () => {
      const line = '='.repeat(40);
      const text = [...data.notes].sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0)).map((n) => {
        const head = `${line}\n${n.title || 'Untitled note'}\n${line}\n`;
        if (n.type === 'todo' && Array.isArray(n.todos)) return head + n.todos.map((t) => `- [${t.done ? 'x' : ' '}] ${t.text}`).join('\n') + '\n';
        return head + n.text + '\n';
      }).join('\n');
      const a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob([text], { type: 'text/plain' }));
      a.download = 'sticky-dock-notes.txt';
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
      return { ok: true, filePath: 'sticky-dock-notes.txt' };
    },
    openDataFolder: () => {},
    onSettingsChanged: (cb) => { listeners.settings.push(cb); return noop(); },

    // window behaviour: on the web the note is just a page, so these do nothing
    collapse: () => {},
    closeDone: () => {},
    dragStart: () => {}, dragMove: () => {}, dragEnd: () => {},
    onAnimateOpen: (cb) => { setTimeout(() => cb({ side: 'right' }), 0); return noop(); },
    onAnimateClose: noop,
    resizeStart: () => {}, resizeTo: () => {}, resizeEnd: () => {},
    openFromStrip: () => {}, stripDragStart: () => {}, stripDragMove: () => {}, stripDragEnd: () => {}
  };
})();
