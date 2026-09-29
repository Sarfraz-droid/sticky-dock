// storage.js
// Keeps your notes and app settings safe on disk.
//
// Files live in Electron's "userData" folder (on Windows:
// C:\Users\<you>\AppData\Roaming\Sticky Dock):
//   notes.json        - all notes + recently deleted notes
//   state.json        - settings, window size and positions
//   backups\          - the last 5 versions of notes.json
//
// Every write goes to a temporary file first and is then renamed over the
// real file. A rename is all-or-nothing, so a crash mid-save can never leave
// a half-written notes.json behind.

const fs = require('fs');
const path = require('path');

const MAX_BACKUPS = 5;
const BACKUP_EVERY_MS = 10 * 60 * 1000; // at most one backup per 10 minutes
const DELETED_KEEP_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

const DEFAULT_SETTINGS = {
  theme: null, // null = the user hasn't picked a design yet (show the picker)
  pinned: false,
  launchAtStartup: false,
  dockSide: 'right', // 'right' or 'left'
  fontSize: 'medium', // 'small' | 'medium' | 'large'
  shortcut: 'Control+Alt+N'
};

const DEFAULT_STATE = {
  settings: { ...DEFAULT_SETTINGS },
  strip: { displayId: null, yRatio: 0.5 }, // yRatio: 0 = top of screen, 1 = bottom
  note: { size: 360, customPos: null } // customPos: {x, y, displayId} once dragged
};

// ---------- small helpers ----------

function writeFileAtomic(file, text) {
  const tmp = file + '.tmp';
  const fd = fs.openSync(tmp, 'w');
  try {
    fs.writeSync(fd, text);
    fs.fsyncSync(fd); // make sure the bytes really reached the disk
  } finally {
    fs.closeSync(fd);
  }
  fs.renameSync(tmp, file);
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function stamp(date = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}${p(date.getMonth() + 1)}${p(date.getDate())}-` +
    `${p(date.getHours())}${p(date.getMinutes())}${p(date.getSeconds())}`;
}

function isValidNotesData(d) {
  return d && Array.isArray(d.notes) && d.notes.every((n) => n && typeof n.id === 'string' && typeof n.text === 'string');
}

// ---------- the store ----------

class Storage {
  constructor(dir) {
    this.dir = dir;
    this.notesFile = path.join(dir, 'notes.json');
    this.stateFile = path.join(dir, 'state.json');
    this.backupDir = path.join(dir, 'backups');
    fs.mkdirSync(this.backupDir, { recursive: true });

    this.notice = null; // a plain-English message to show the user, if something went wrong
    this.lastBackupAt = 0;
    this.saveTimer = null;
    this.stateTimer = null;

    this.data = this._loadNotes();
    this.state = this._loadState();
    this._purgeOldDeleted();
  }

  // ----- notes -----

  _loadNotes() {
    const empty = { version: 1, notes: [], deleted: [], lastNoteId: null };
    if (!fs.existsSync(this.notesFile)) return empty;

    try {
      const d = readJson(this.notesFile);
      if (!isValidNotesData(d)) throw new Error('unexpected format');
      d.deleted = Array.isArray(d.deleted) ? d.deleted : [];
      return d;
    } catch (err) {
      // The file is damaged. Keep it aside (never delete it) and use the newest good backup.
      const brokenName = `notes.unreadable-${stamp()}.json`;
      try { fs.copyFileSync(this.notesFile, path.join(this.dir, brokenName)); } catch (_) {}

      for (const b of this.listBackups()) {
        try {
          const d = readJson(path.join(this.backupDir, b));
          if (!isValidNotesData(d)) continue;
          d.deleted = Array.isArray(d.deleted) ? d.deleted : [];
          this.notice = `Your notes file could not be read, so your notes were restored from the backup "${b}". ` +
            `The damaged file was kept as "${brokenName}" in the data folder.`;
          this.lastBackupAt = Date.now(); // don't immediately overwrite backups with this restore
          writeFileAtomic(this.notesFile, JSON.stringify(d));
          return d;
        } catch (_) { /* try the next, older backup */ }
      }
      this.notice = `Your notes file could not be read and no usable backup was found. ` +
        `The damaged file was kept as "${brokenName}" in the data folder, so nothing is thrown away.`;
      return empty;
    }
  }

  listBackups() {
    // Newest first. Names are "notes-YYYYMMDD-HHMMSS.json" so sorting by name sorts by time.
    try {
      return fs.readdirSync(this.backupDir)
        .filter((f) => /^notes-\d{8}-\d{6}\.json$/.test(f))
        .sort()
        .reverse();
    } catch (_) {
      return [];
    }
  }

  _backupIfDue() {
    if (Date.now() - this.lastBackupAt < BACKUP_EVERY_MS) return;
    if (!fs.existsSync(this.notesFile)) return;
    try {
      // Only back up a file we know is readable.
      if (!isValidNotesData(readJson(this.notesFile))) return;
      fs.copyFileSync(this.notesFile, path.join(this.backupDir, `notes-${stamp()}.json`));
      this.lastBackupAt = Date.now();
      for (const old of this.listBackups().slice(MAX_BACKUPS)) {
        fs.unlinkSync(path.join(this.backupDir, old));
      }
    } catch (err) {
      console.error('Backup failed:', err);
    }
  }

  _purgeOldDeleted() {
    const cutoff = Date.now() - DELETED_KEEP_MS;
    const before = this.data.deleted.length;
    this.data.deleted = this.data.deleted.filter((n) => n.deletedAt > cutoff);
    if (this.data.deleted.length !== before) this.scheduleSave();
  }

  getNotesData() {
    this._purgeOldDeleted();
    return this.data;
  }

  upsertNote(note) {
    const i = this.data.notes.findIndex((n) => n.id === note.id);
    if (i >= 0) this.data.notes[i] = note;
    else this.data.notes.push(note);
    this.scheduleSave();
  }

  deleteNote(id) {
    const i = this.data.notes.findIndex((n) => n.id === id);
    if (i < 0) return;
    const [note] = this.data.notes.splice(i, 1);
    note.deletedAt = Date.now();
    this.data.deleted.unshift(note);
    this.scheduleSave();
  }

  restoreNote(id) {
    const i = this.data.deleted.findIndex((n) => n.id === id);
    if (i < 0) return null;
    const [note] = this.data.deleted.splice(i, 1);
    delete note.deletedAt;
    note.updatedAt = Date.now();
    this.data.notes.push(note);
    this.scheduleSave();
    return note;
  }

  setLastNote(id) {
    this.data.lastNoteId = id;
    this.scheduleSave();
  }

  // Autosave: wait ~300 ms after the last change, then write once.
  scheduleSave() {
    clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => this.saveNow(), 300);
  }

  saveNow() {
    clearTimeout(this.saveTimer);
    this.saveTimer = null;
    try {
      this._backupIfDue();
      writeFileAtomic(this.notesFile, JSON.stringify(this.data));
    } catch (err) {
      console.error('Saving notes failed:', err);
    }
  }

  // ----- settings + window state -----

  _loadState() {
    try {
      const s = readJson(this.stateFile);
      return {
        settings: { ...DEFAULT_SETTINGS, ...(s.settings || {}) },
        strip: { ...DEFAULT_STATE.strip, ...(s.strip || {}) },
        note: { ...DEFAULT_STATE.note, ...(s.note || {}) }
      };
    } catch (_) {
      return JSON.parse(JSON.stringify(DEFAULT_STATE));
    }
  }

  saveStateSoon() {
    clearTimeout(this.stateTimer);
    this.stateTimer = setTimeout(() => this.saveStateNow(), 300);
  }

  saveStateNow() {
    clearTimeout(this.stateTimer);
    try {
      writeFileAtomic(this.stateFile, JSON.stringify(this.state, null, 2));
    } catch (err) {
      console.error('Saving state failed:', err);
    }
  }

  // Called on quit / shutdown: write everything right now, synchronously.
  flushAll() {
    if (this.saveTimer) this.saveNow();
    this.saveStateNow();
  }

  // ----- export -----

  exportAsText() {
    const notes = [...this.data.notes].sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
    const line = '='.repeat(40);
    return notes.map((n) => {
      const head = `${line}\n${n.title || 'Untitled note'}\n${line}\n`;
      if (n.type === 'todo' && Array.isArray(n.todos)) {
        return head + n.todos.map((t) => `- [${t.done ? 'x' : ' '}] ${t.text}`).join('\n') + '\n';
      }
      return head + n.text + '\n';
    }).join('\n');
  }
}

module.exports = { Storage, DEFAULT_SETTINGS };
