// note.js - everything you see and click in the open note.

const $ = (id) => document.getElementById(id);
const el = {
  body: document.body, note: $('note'), page: $('page'), title: $('title'), titleInput: $('titleInput'),
  pinBtn: $('pinBtn'), gearBtn: $('gearBtn'), collapseBtn: $('collapseBtn'), collapseArrow: $('collapseArrow'),
  searchInput: $('searchInput'), results: $('results'),
  listBtn: $('listBtn'), listLabel: $('listLabel'), notesList: $('notesList'), newBtn: $('newBtn'), deleteBtn: $('deleteBtn'),
  typeToggle: $('typeToggle'), pageWrap: $('pageWrap'), todoWrap: $('todoWrap'),
  themePicker: $('themePicker'), pickerGrid: $('pickerGrid'), designBtn: $('designBtn'),
  prevBtn: $('prevBtn'), nextBtn: $('nextBtn'), pageLabel: $('pageLabel'),
  settingsPanel: $('settingsPanel'), settingsClose: $('settingsClose'),
  setPinned: $('setPinned'), setStartup: $('setStartup'), setSide: $('setSide'), setFont: $('setFont'),
  setShortcut: $('setShortcut'), shortcutMsg: $('shortcutMsg'), exportBtn: $('exportBtn'), folderBtn: $('folderBtn'),
  deletedToggle: $('deletedToggle'), deletedList: $('deletedList'),
  confirmBox: $('confirmBox'), confirmText: $('confirmText'), confirmYes: $('confirmYes'), confirmNo: $('confirmNo'),
  toast: $('toast'), grip: $('grip')
};

let notes = [];        // all notes (the same objects the main process saves)
let current = null;    // the note on screen
let settings = {};
let editor = null;

// ---------- helpers ----------

function newId() {
  return (crypto.randomUUID && crypto.randomUUID()) || `n${Date.now()}${Math.random().toString(36).slice(2)}`;
}

// The text a note's automatic name comes from (first task for a to-do list).
function firstText(note) {
  if (note && note.type === 'todo' && Array.isArray(note.todos)) {
    const t = note.todos.find((x) => x.text.trim());
    return t ? t.text : '';
  }
  return (note && note.text) || '';
}

// A note without a custom name is called after its first line / first task.
function autoTitle(note) {
  const src = typeof note === 'string' ? note : firstText(note);
  const line = src.split('\n').find((l) => l.trim()) || '';
  const t = line.trim();
  const fallback = typeof note === 'object' && note && note.type === 'todo' ? 'new list' : 'new note';
  return t ? (t.length > 60 ? t.slice(0, 60) + '…' : t) : fallback;
}

// The name shown for a note (custom name if set, otherwise the automatic one).
function noteName(note) { return note.customTitle || autoTitle(note); }

function saveNote(note) {
  note.title = noteName(note);
  window.dock.upsertNote(note);
}

let toastTimer = null;
function toast(message, { sticky = false } = {}) {
  el.toast.textContent = message;
  el.toast.hidden = false;
  clearTimeout(toastTimer);
  if (!sticky) toastTimer = setTimeout(() => { el.toast.hidden = true; }, 3500);
}
el.toast.addEventListener('click', () => { el.toast.hidden = true; });

// ---------- layout from the picture ----------

let currentTheme = null;

function applyTheme(theme, themeIcon) {
  currentTheme = theme;
  const pct = (v) => `${(v * 100).toFixed(2)}%`;
  const s = document.documentElement.style;
  const p = theme.palette;
  // palette (controls are drawn with these; --pink kept as the accent name)
  s.setProperty('--ink', p.ink);
  s.setProperty('--ink-soft', mix(p.ink, p.cream, 0.42));
  s.setProperty('--pink', p.accent);
  s.setProperty('--accent', p.accent);
  s.setProperty('--pink-deep', p.accentDeep);
  s.setProperty('--accent-deep', p.accentDeep);
  s.setProperty('--berry', p.berry);
  s.setProperty('--cream', p.cream);
  s.setProperty('--paper', p.paper);
  s.setProperty('--mark', p.mark);
  s.setProperty('--grey', mix(p.ink, p.cream, 0.55));
  // layout boxes
  const c = theme.content, pg = theme.pager;
  s.setProperty('--cl', pct(c.l)); s.setProperty('--ct', pct(c.t));
  s.setProperty('--cr', pct(c.r)); s.setProperty('--cb', pct(c.b));
  s.setProperty('--pl', pct(pg.l)); s.setProperty('--pt', pct(pg.t));
  s.setProperty('--pr', pct(pg.r)); s.setProperty('--pb', pct(pg.b));
  // background picture + whether to draw our own writing lines
  el.note.style.backgroundImage = `url("../../assets/themes/${theme.file}")`;
  el.body.classList.toggle('no-rule', !theme.rule);
  if (editor) editor.relayout();
}

// Blend two "#rrggbb" colours; amount 0 = a, 1 = b.
function mix(a, b, amount) {
  const h = (c) => [parseInt(c.slice(1, 3), 16), parseInt(c.slice(3, 5), 16), parseInt(c.slice(5, 7), 16)];
  const [ar, ag, ab] = h(a), [br, bg, bb] = h(b);
  const r = Math.round(ar + (br - ar) * amount), g = Math.round(ag + (bg - ag) * amount), bl = Math.round(ab + (bb - ab) * amount);
  return `#${[r, g, bl].map((v) => v.toString(16).padStart(2, '0')).join('')}`;
}

// ---------- theme picker ----------
let allThemes = [];
function renderPicker() {
  el.pickerGrid.innerHTML = '';
  for (const t of allThemes) {
    const card = document.createElement('button');
    card.className = 'theme-card' + (currentTheme && t.id === currentTheme.id ? ' current' : '');
    card.innerHTML = `<img src="../../assets/themes/${t.file}" alt=""><span>${escapeHtml(t.name)}</span>`;
    card.addEventListener('click', async () => {
      const res = await window.dock.setTheme(t.id);
      if (res.ok) { applyTheme(res.theme, res.themeIcon); closePicker(); }
    });
    el.pickerGrid.appendChild(card);
  }
}
function openPicker() {
  el.notesList.hidden = true; closeResults();
  if (!el.settingsPanel.hidden) { el.settingsPanel.hidden = true; }
  renderPicker();
  el.themePicker.hidden = false;
}
function closePicker() { el.themePicker.hidden = true; el.page.focus(); }

// ---------- settings ----------

function applySettings(s) {
  settings = s;
  el.pinBtn.setAttribute('aria-pressed', String(!!s.pinned));
  el.pinBtn.title = s.pinned ? 'Pinned: stays open and on top (click to unpin)' : 'Pin note (stay open and on top)';
  el.setPinned.checked = !!s.pinned;
  el.setStartup.checked = !!s.launchAtStartup;
  for (const b of el.setSide.children) b.classList.toggle('on', b.dataset.v === s.dockSide);
  for (const b of el.setFont.children) b.classList.toggle('on', b.dataset.v === s.fontSize);
  el.setShortcut.textContent = prettyShortcut(s.shortcut);
  el.body.classList.toggle('side-left', s.dockSide === 'left');
  el.collapseArrow.setAttribute('d', s.dockSide === 'left' ? 'M15 6l-6 6 6 6' : 'M9 6l6 6-6 6');

  const fontClass = `font-${s.fontSize || 'medium'}`;
  if (!el.body.classList.contains(fontClass)) {
    el.body.classList.remove('font-small', 'font-medium', 'font-large');
    el.body.classList.add(fontClass);
    if (editor) editor.relayout(); // new font size = new pages
  }
}

async function changeSetting(key, value) {
  const res = await window.dock.setSetting(key, value);
  if (res.ok) applySettings(res.settings);
  return res;
}

// ---------- notes: open, create, rename, delete ----------

function openNote(note, cursor) {
  if (current && editor && current.type !== 'todo') current.cursor = editor.absSelection()[0];
  current = note;
  if (note.type === 'todo') {
    showTodoMode(true);
    renderTodo();
  } else {
    showTodoMode(false);
    editor.load(note.text, cursor ?? note.cursor ?? note.text.length);
  }
  updateTypeToggle();
  renderTitle();
  window.dock.setLastNote(note.id);
}

function createNote() {
  const now = Date.now();
  const note = { id: newId(), type: 'note', text: '', customTitle: '', title: 'new note', createdAt: now, updatedAt: now, cursor: 0 };
  notes.push(note);
  saveNote(note);
  openNote(note, 0);
  el.page.focus();
}

// ---------- notes vs to-do lists ----------

function showTodoMode(on) {
  el.pageWrap.hidden = on;
  el.todoWrap.hidden = !on;
  el.body.classList.toggle('todo-mode', on);
  el.prevBtn.hidden = on;
  el.nextBtn.hidden = on;
}

function updateTypeToggle() {
  const type = (current && current.type) || 'note';
  for (const b of el.typeToggle.children) b.classList.toggle('on', b.dataset.type === type);
}

function linesToTodos(text) {
  const items = (text || '').split('\n').filter((l) => l.trim()).map((l) => ({ id: newId(), text: l, done: false }));
  return items.length ? items : [{ id: newId(), text: '', done: false }];
}
function ensureTodos(note) {
  if (!Array.isArray(note.todos) || !note.todos.length) note.todos = linesToTodos(note.text);
}
function syncTodoText(note) { note.text = note.todos.map((t) => t.text).join('\n'); }

function saveTodo() {
  syncTodoText(current);
  current.updatedAt = Date.now();
  saveNote(current);
  renderTitle();
  updateTodoProgress();
}

function updateTodoProgress() {
  if (!current || current.type !== 'todo') return;
  const done = current.todos.filter((t) => t.done).length;
  const any = current.todos.some((t) => t.text.trim());
  el.pageLabel.textContent = any ? `☑ ${done} of ${current.todos.length} done` : 'to-do list';
}

function autoGrow(ta) { ta.style.height = 'auto'; ta.style.height = ta.scrollHeight + 'px'; }

function focusTodo(idx, atEnd = true) {
  const tas = el.todoWrap.querySelectorAll('.todo-text');
  const ta = tas[idx];
  if (ta) { ta.focus(); const p = atEnd ? ta.value.length : 0; ta.setSelectionRange(p, p); }
}

function renderTodo() {
  ensureTodos(current);
  el.todoWrap.innerHTML = '';
  current.todos.forEach((item, idx) => {
    const row = document.createElement('div');
    row.className = 'todo-item' + (item.done ? ' done' : '');
    const check = document.createElement('button');
    check.className = 'todo-check' + (item.done ? ' done' : '');
    check.title = item.done ? 'Mark not done' : 'Mark done';
    check.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12l5 5 9-11"/></svg>';
    check.addEventListener('click', () => { item.done = !item.done; row.classList.toggle('done', item.done); check.classList.toggle('done', item.done); saveTodo(); });
    const ta = document.createElement('textarea');
    ta.className = 'todo-text'; ta.rows = 1; ta.value = item.text; ta.placeholder = 'task'; ta.spellcheck = false;
    ta.addEventListener('input', () => { item.text = ta.value; autoGrow(ta); saveTodo(); });
    ta.addEventListener('keydown', (e) => onTodoKey(e, idx, ta));
    const del = document.createElement('button');
    del.className = 'todo-del'; del.textContent = '✕'; del.title = 'Delete task';
    del.addEventListener('click', () => {
      current.todos.splice(idx, 1);
      if (!current.todos.length) current.todos.push({ id: newId(), text: '', done: false });
      renderTodo(); saveTodo(); focusTodo(Math.max(0, idx - 1));
    });
    row.append(check, ta, del);
    el.todoWrap.appendChild(row);
  });
  const add = document.createElement('div');
  add.className = 'todo-add';
  add.innerHTML = '<span class="plus">+</span> add a task';
  add.addEventListener('click', () => { current.todos.push({ id: newId(), text: '', done: false }); renderTodo(); saveTodo(); focusTodo(current.todos.length - 1); });
  el.todoWrap.appendChild(add);
  el.todoWrap.querySelectorAll('.todo-text').forEach(autoGrow);
  updateTodoProgress();
}

function onTodoKey(e, idx, ta) {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    const before = ta.value.slice(0, ta.selectionStart);
    const after = ta.value.slice(ta.selectionStart);
    current.todos[idx].text = before;
    current.todos.splice(idx + 1, 0, { id: newId(), text: after, done: false });
    renderTodo(); saveTodo(); focusTodo(idx + 1, false);
  } else if (e.key === 'Backspace' && ta.selectionStart === 0 && ta.selectionEnd === 0 && idx > 0) {
    e.preventDefault();
    const prev = current.todos[idx - 1];
    const joinAt = prev.text.length;
    prev.text += current.todos[idx].text;
    current.todos.splice(idx, 1);
    renderTodo(); saveTodo();
    const t = el.todoWrap.querySelectorAll('.todo-text')[idx - 1];
    if (t) { t.focus(); t.setSelectionRange(joinAt, joinAt); }
  } else if (e.key === 'ArrowDown' && ta.selectionStart === ta.value.length && idx < current.todos.length - 1) {
    e.preventDefault(); focusTodo(idx + 1, false);
  } else if (e.key === 'ArrowUp' && ta.selectionStart === 0 && idx > 0) {
    e.preventDefault(); focusTodo(idx - 1, true);
  }
}

function switchType(type) {
  if (!current || (current.type || 'note') === type) return;
  if (type === 'todo') {
    current.todos = linesToTodos(current.text); // build fresh from the written text
    current.type = 'todo';
    syncTodoText(current);
    saveNote(current);
    showTodoMode(true); renderTodo();
    focusTodo(0);
  } else {
    if (Array.isArray(current.todos)) current.text = current.todos.map((t) => t.text).join('\n');
    current.type = 'note';
    saveNote(current);
    showTodoMode(false);
    editor.load(current.text, current.text.length);
    el.page.focus();
  }
  updateTypeToggle();
  renderTitle();
}

el.typeToggle.addEventListener('click', (e) => {
  const btn = e.target.closest('button');
  if (btn) switchType(btn.dataset.type);
});

function renderTitle() {
  const name = current ? noteName(current) : '';
  el.title.textContent = name;
  // the note-selector chip shows which note you're on (updates on search jumps too)
  el.listLabel.textContent = name || 'my notes';
}

function startRename() {
  el.titleInput.value = noteName(current);
  el.title.hidden = true;
  el.titleInput.hidden = false;
  el.titleInput.focus();
  el.titleInput.select();
}

function finishRename(save) {
  if (el.titleInput.hidden) return;
  if (save) {
    const v = el.titleInput.value.trim();
    // Clearing the name (or leaving the automatic one) goes back to "first line" titles.
    current.customTitle = v && v !== autoTitle(current) ? v : '';
    current.updatedAt = Date.now();
    saveNote(current);
  }
  el.titleInput.hidden = true;
  el.title.hidden = false;
  renderTitle();
  el.page.focus();
}

el.title.addEventListener('dblclick', startRename);
el.titleInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') { e.preventDefault(); finishRename(true); }
  if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); finishRename(false); }
});
el.titleInput.addEventListener('blur', () => finishRename(true));

let confirmAction = null;
function askConfirm(text, action) {
  el.confirmText.textContent = text;
  confirmAction = action;
  el.confirmBox.hidden = false;
  el.confirmNo.focus();
}
function closeConfirm() { el.confirmBox.hidden = true; confirmAction = null; }
el.confirmNo.addEventListener('click', () => { closeConfirm(); el.page.focus(); });
el.confirmYes.addEventListener('click', () => { const a = confirmAction; closeConfirm(); if (a) a(); });

el.deleteBtn.addEventListener('click', () => {
  const name = noteName(current);
  askConfirm(`Delete "${name}"? You can get it back from "recently deleted" in settings for 30 days.`, () => {
    const gone = current;
    notes = notes.filter((n) => n !== gone);
    current = null;
    window.dock.deleteNote(gone.id);
    const next = [...notes].sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))[0];
    if (next) openNote(next); else createNote();
    renderTitle();
    toast('Note moved to recently deleted.');
  });
});

el.newBtn.addEventListener('click', createNote);

// ---------- notes list dropdown ----------

function toggleNotesList(show = el.notesList.hidden) {
  if (!show) { el.notesList.hidden = true; return; }
  closeResults();
  const sorted = [...notes].sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
  el.notesList.innerHTML = '';
  for (const n of sorted) {
    const b = document.createElement('button');
    b.className = 'list-item' + (n === current ? ' current' : '');
    b.textContent = noteName(n);
    b.addEventListener('click', () => { toggleNotesList(false); openNote(n); el.page.focus(); });
    el.notesList.appendChild(b);
  }
  el.notesList.hidden = false;
}
el.listBtn.addEventListener('click', () => toggleNotesList());

// ---------- pager ----------

function onPageChange(page, count) {
  el.pageLabel.textContent = `page ${page + 1} of ${count}`;
  el.prevBtn.disabled = page === 0;
  el.nextBtn.disabled = page >= count - 1;
}
el.prevBtn.addEventListener('click', () => editor.goToPage(editor.page - 1));
el.nextBtn.addEventListener('click', () => editor.goToPage(editor.page + 1));

// ---------- search ----------

const pageCache = new Map(); // note id -> { text, key, pages } for notes not on screen
function pagesFor(note) {
  if (note === current) return editor.pages;
  const key = editor.paginator.layoutKey;
  const c = pageCache.get(note.id);
  if (c && c.text === note.text && c.key === key) return c.pages;
  const pages = editor.paginator.paginate(note.text);
  pageCache.set(note.id, { text: note.text, key, pages });
  return pages;
}

let results = [];
let activeResult = -1;
let searchTimer = null;

function closeResults() { el.results.hidden = true; results = []; activeResult = -1; }

function runSearch() {
  const q = el.searchInput.value;
  if (!q.trim()) { closeResults(); return; }
  el.notesList.hidden = true;
  results = searchNotes(notes, q);
  activeResult = results.length ? 0 : -1;
  el.results.innerHTML = '';
  if (!results.length) {
    el.results.innerHTML = `<div class="empty-msg">no notes mention "${escapeHtml(q.trim())}" yet 🍓</div>`;
  }
  results.forEach((r, i) => {
    const b = document.createElement('button');
    b.className = 'result' + (i === activeResult ? ' active' : '');
    const title = noteName(r.note);
    const isTodo = r.note.type === 'todo';
    const where = r.inTitle ? '' : (isTodo ? 'list' : 'p. ' + (pageOfOffset(pagesFor(r.note), r.start) + 1));
    const snip = r.inTitle ? 'matches the note name' : snippetHtml(r.note.text, r.start, r.end);
    b.innerHTML = `<div class="r-head"><span class="r-title">${escapeHtml(title)}</span><span class="r-page">${where}</span></div>` +
      `<div class="r-snip">${snip}</div>`;
    b.addEventListener('mousedown', (e) => e.preventDefault()); // keep focus in the search box
    b.addEventListener('click', () => pickResult(i));
    el.results.appendChild(b);
  });
  el.results.hidden = false;
}

function highlightActive() {
  [...el.results.children].forEach((c, i) => c.classList.toggle('active', i === activeResult));
  const a = el.results.children[activeResult];
  if (a) a.scrollIntoView({ block: 'nearest' });
}

function pickResult(i) {
  const r = results[i];
  if (!r) return;
  if (r.note !== current) openNote(r.note, r.start);
  closeResults();
  if (current.type === 'todo') { highlightTodoAt(r.start); return; }
  editor.selectRange(r.start, r.end); // shows the page and selects the match
  el.page.classList.remove('flash');
  void el.page.offsetWidth; // restart the animation
  el.page.classList.add('flash');
  // After a moment, drop the highlight and leave the cursor right after the match.
  setTimeout(() => {
    const [s, e] = editor.absSelection();
    if (s === r.start && e === r.end && document.activeElement === el.page) editor.selectRange(r.end, r.end);
  }, 1200);
}

// Find which to-do item a character offset falls in, then flash it.
function highlightTodoAt(offset) {
  let acc = 0, idx = 0;
  for (let k = 0; k < current.todos.length; k++) {
    const len = current.todos[k].text.length;
    if (offset <= acc + len) { idx = k; break; }
    acc += len + 1; // + the joining newline
    idx = Math.min(k + 1, current.todos.length - 1);
  }
  const row = el.todoWrap.querySelectorAll('.todo-item')[idx];
  if (!row) return;
  row.scrollIntoView({ block: 'nearest' });
  row.classList.remove('flash'); void row.offsetWidth; row.classList.add('flash');
  const ta = row.querySelector('.todo-text');
  if (ta) ta.focus();
  setTimeout(() => row.classList.remove('flash'), 1100);
}

el.searchInput.addEventListener('input', () => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(runSearch, 120);
});
el.searchInput.addEventListener('keydown', (e) => {
  if (e.key === 'ArrowDown' && results.length) { e.preventDefault(); activeResult = (activeResult + 1) % results.length; highlightActive(); }
  if (e.key === 'ArrowUp' && results.length) { e.preventDefault(); activeResult = (activeResult - 1 + results.length) % results.length; highlightActive(); }
  if (e.key === 'Enter') { e.preventDefault(); clearTimeout(searchTimer); if (el.results.hidden) runSearch(); else pickResult(activeResult); }
});

// ---------- settings panel ----------

function prettyShortcut(accel) {
  return (accel || 'none').replace(/Control/g, 'Ctrl').replace(/CommandOrControl/g, 'Ctrl').replace(/\+/g, ' + ');
}

async function openSettings() {
  el.notesList.hidden = true;
  closeResults();
  el.shortcutMsg.hidden = true;
  el.deletedList.hidden = true;
  const deleted = await window.dock.getDeleted();
  el.deletedToggle.textContent = `recently deleted (${deleted.length})`;
  el.settingsPanel.hidden = false;
}
function closeSettings() { el.settingsPanel.hidden = true; stopListening(); el.page.focus(); }

el.gearBtn.addEventListener('click', () => (el.settingsPanel.hidden ? openSettings() : closeSettings()));
el.settingsClose.addEventListener('click', closeSettings);
el.pinBtn.addEventListener('click', () => changeSetting('pinned', !settings.pinned));
el.setPinned.addEventListener('change', () => changeSetting('pinned', el.setPinned.checked));
el.setStartup.addEventListener('change', () => changeSetting('launchAtStartup', el.setStartup.checked));
el.setSide.addEventListener('click', (e) => { if (e.target.dataset.v) changeSetting('dockSide', e.target.dataset.v); });
el.setFont.addEventListener('click', (e) => { if (e.target.dataset.v) changeSetting('fontSize', e.target.dataset.v); });

el.exportBtn.addEventListener('click', async () => {
  const res = await window.dock.exportNotes();
  if (res.ok) toast('All notes exported.');
  else if (res.error) toast(`Export didn't work: ${res.error}`);
});
el.folderBtn.addEventListener('click', () => window.dock.openDataFolder());

el.deletedToggle.addEventListener('click', async () => {
  if (!el.deletedList.hidden) { el.deletedList.hidden = true; return; }
  const deleted = await window.dock.getDeleted();
  el.deletedList.innerHTML = '';
  if (!deleted.length) el.deletedList.innerHTML = '<div class="empty-msg">nothing here. all your notes are safe.</div>';
  for (const n of deleted) {
    const days = Math.max(0, 30 - Math.floor((Date.now() - n.deletedAt) / 86400000));
    const row = document.createElement('div');
    row.className = 'deleted-item';
    row.innerHTML = `<span>${escapeHtml(n.title || 'untitled note')} <small>(${days}d left)</small></span>`;
    const b = document.createElement('button');
    b.className = 'chip';
    b.textContent = 'restore';
    b.addEventListener('click', async () => {
      const note = await window.dock.restoreNote(n.id);
      if (!note) return;
      notes.push(note);
      closeSettings();
      openNote(note);
      renderTitle();
      toast('Note restored.');
    });
    row.appendChild(b);
    el.deletedList.appendChild(row);
  }
  el.deletedList.hidden = false;
});

// Shortcut picker: click the button, then press the keys you want.
let listening = false;
function stopListening() {
  listening = false;
  el.setShortcut.classList.remove('listening');
  el.setShortcut.textContent = prettyShortcut(settings.shortcut);
}
el.setShortcut.addEventListener('click', () => {
  listening = true;
  el.shortcutMsg.hidden = true;
  el.setShortcut.classList.add('listening');
  el.setShortcut.textContent = 'press keys…';
});
el.setShortcut.addEventListener('keydown', async (e) => {
  if (!listening) return;
  e.preventDefault();
  e.stopPropagation();
  if (e.key === 'Escape') { stopListening(); return; }
  const mods = [];
  if (e.ctrlKey) mods.push('Control');
  if (e.altKey) mods.push('Alt');
  if (e.shiftKey) mods.push('Shift');
  if (e.metaKey) mods.push('Super');
  let key = null;
  if (/^Key[A-Z]$/.test(e.code)) key = e.code.slice(3);
  else if (/^Digit\d$/.test(e.code)) key = e.code.slice(5);
  else if (/^F\d{1,2}$/.test(e.code)) key = e.code;
  else if (e.code === 'Space') key = 'Space';
  if (!key) return; // still waiting for the main key
  if (!mods.length && !/^F\d/.test(key)) {
    el.shortcutMsg.textContent = 'Add Ctrl, Alt or Shift so it doesn\'t fire while you type.';
    el.shortcutMsg.hidden = false;
    return;
  }
  const accel = [...mods, key].join('+');
  const res = await changeSetting('shortcut', accel);
  listening = false;
  el.setShortcut.classList.remove('listening');
  el.setShortcut.textContent = prettyShortcut(settings.shortcut);
  el.shortcutMsg.textContent = res.ok ? `Saved. Press ${prettyShortcut(accel)} anywhere to open or close the note.` : res.error;
  el.shortcutMsg.hidden = false;
});

// ---------- keyboard: Escape and friends ----------

document.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape') return;
  e.preventDefault();
  if (!el.themePicker.hidden) { closePicker(); return; }
  if (!el.confirmBox.hidden) { closeConfirm(); el.page.focus(); return; }
  if (document.activeElement === el.searchInput && (el.searchInput.value || !el.results.hidden)) {
    el.searchInput.value = ''; closeResults(); return;
  }
  if (!el.results.hidden) { closeResults(); return; }
  if (!el.notesList.hidden) { el.notesList.hidden = true; return; }
  if (!el.settingsPanel.hidden) { closeSettings(); return; }
  if (document.activeElement === el.page && el.page.selectionStart !== el.page.selectionEnd) {
    el.page.setSelectionRange(el.page.selectionEnd, el.page.selectionEnd); return;
  }
  window.dock.collapse();
});

// Click anywhere else closes the little drop-down lists.
document.addEventListener('pointerdown', (e) => {
  if (!el.notesList.hidden && !el.notesList.contains(e.target) && !el.listBtn.contains(e.target)) el.notesList.hidden = true;
  if (!el.results.hidden && !el.results.contains(e.target) && e.target !== el.searchInput) closeResults();
});

el.collapseBtn.addEventListener('click', () => window.dock.collapse());

// ---------- open / close animation ----------

window.dock.onAnimateOpen(({ side }) => {
  el.body.classList.toggle('side-left', side === 'left');
  el.body.classList.add('no-anim');
  el.note.classList.remove('open');
  void el.note.offsetWidth; // start from the tucked-away position
  el.body.classList.remove('no-anim');
  // Wait for the window to actually be on screen before sliding in, so the
  // first frames of the animation are never dropped.
  requestAnimationFrame(() => requestAnimationFrame(() => el.note.classList.add('open')));
  editor.relayout();
  setTimeout(() => el.page.focus(), 30);
});

window.dock.onAnimateClose(() => {
  finishRename(true);
  closeResults();
  el.notesList.hidden = true;
  closeConfirm();
  if (!el.settingsPanel.hidden) { el.settingsPanel.hidden = true; stopListening(); }
  if (current) current.cursor = editor.absSelection()[0];
  el.note.classList.remove('open');
  // Tell the app the moment the slide ends (fallback timer in case it never fires).
  let done = false;
  const finish = () => { if (done) return; done = true; el.note.removeEventListener('transitionend', onEnd); window.dock.closeDone(); };
  const onEnd = (ev) => { if (ev.target === el.note && ev.propertyName === 'transform') finish(); };
  el.note.addEventListener('transitionend', onEnd);
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  setTimeout(finish, reduced ? 150 : 300);
});

// ---------- dragging the whole note by its top row ----------
// Done in JS (not CSS -webkit-app-region) so it also works on macOS, where the
// transparent-window drag region is unreliable. A drag only begins once the
// pointer actually moves, so double-clicking the title to rename still works.
const toprow = document.querySelector('.toprow');
let noteDrag = null;
toprow.addEventListener('pointerdown', (e) => {
  if (e.button !== 0) return;
  // Leave the buttons and the rename box alone.
  if (e.target.closest('button') || e.target === el.titleInput) return;
  noteDrag = { id: e.pointerId, x: e.screenX, y: e.screenY, moving: false };
});
toprow.addEventListener('pointermove', (e) => {
  if (!noteDrag || e.pointerId !== noteDrag.id) return;
  const dx = e.screenX - noteDrag.x, dy = e.screenY - noteDrag.y;
  if (!noteDrag.moving) {
    if (Math.abs(dx) < 4 && Math.abs(dy) < 4) return; // still just a click/double-click
    noteDrag.moving = true;
    try { toprow.setPointerCapture(noteDrag.id); } catch (_) {}
    document.body.classList.add('dragging');
    window.dock.dragStart();
  }
  // Send at most one move per frame: flooding the main process with
  // setBounds calls is what makes window dragging choppy on macOS.
  noteDrag.dx = dx; noteDrag.dy = dy;
  if (!noteDrag.queued) {
    noteDrag.queued = true;
    requestAnimationFrame(() => {
      if (!noteDrag) return;
      noteDrag.queued = false;
      window.dock.dragMove(noteDrag.dx, noteDrag.dy); // deltas from where the drag began
    });
  }
});
function endNoteDrag(e) {
  if (!noteDrag || (e && e.pointerId !== noteDrag.id)) return;
  if (noteDrag.moving) { window.dock.dragEnd(); document.body.classList.remove('dragging'); }
  try { toprow.releasePointerCapture(noteDrag.id); } catch (_) {}
  noteDrag = null;
}
toprow.addEventListener('pointerup', endNoteDrag);
toprow.addEventListener('pointercancel', endNoteDrag);

// ---------- resizing with the corner grip (keeps it square) ----------

let resizing = null;
el.grip.addEventListener('pointerdown', (e) => {
  if (e.button !== 0) return;
  e.preventDefault();
  el.grip.setPointerCapture(e.pointerId);
  resizing = { x: e.screenX, y: e.screenY, size: window.innerWidth };
  window.dock.resizeStart();
});
el.grip.addEventListener('pointermove', (e) => {
  if (!resizing) return;
  const d = Math.max(e.screenX - resizing.x, e.screenY - resizing.y);
  window.dock.resizeTo(resizing.size + d);
});
el.grip.addEventListener('pointerup', () => {
  if (!resizing) return;
  resizing = null;
  window.dock.resizeEnd();
});

// Window changed size: re-measure pages (once per frame at most).
let relayoutQueued = false;
window.addEventListener('resize', () => {
  if (relayoutQueued) return;
  relayoutQueued = true;
  requestAnimationFrame(() => { relayoutQueued = false; editor.relayout(); });
});

// ---------- start ----------

async function start() {
  const init = await window.dock.getInitial();
  allThemes = init.themes || [];
  applyTheme(init.theme, init.themeIcon); // always show a real design; picker can change it
  applySettings(init.settings);
  await document.fonts.load(`19px Gaegu`); // measure pages with the real font, not a fallback

  editor = new PagedEditor(el.page, {
    onChange: (text) => {
      current.text = text;
      current.updatedAt = Date.now();
      current.cursor = editor.absSelection()[0];
      saveNote(current);
      renderTitle();
    },
    onPageChange
  });

  notes = init.notesData.notes;
  const last = notes.find((n) => n.id === init.notesData.lastNoteId) ||
    [...notes].sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))[0];
  if (last) openNote(last); else createNote();
  renderTitle();

  if (init.notice) {
    toast(`${init.notice}\n(click to dismiss)`, { sticky: true });
    window.dock.noticeSeen();
  }
  window.dock.onSettingsChanged(applySettings);

  // The design can be changed from another window (e.g. the strip) too.
  window.dock.onThemeChanged(({ theme, themeIcon }) => applyTheme(theme, themeIcon));

  // "change design" in settings re-opens the chooser.
  el.designBtn.addEventListener('click', () => { closeSettings(); openPicker(); });

  // First ever launch: let them pick a design before they start writing.
  if (!init.themeChosen) openPicker();

  // Handy for automated tests.
  window.__stickyDock = { get editor() { return editor; }, get notes() { return notes; }, get current() { return current; }, get theme() { return currentTheme; }, openNote, createNote, runSearch, pickResult, openPicker, closePicker };
}

start();
