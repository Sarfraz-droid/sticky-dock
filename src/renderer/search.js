// search.js
// Finds words across every note (titles and text, all pages), ignoring case.
// Lower-cased copies of each note are cached, so searching hundreds of notes
// is just a quick scan through memory.

const MAX_RESULTS = 40;
const MAX_PER_NOTE = 5;

const lowerCache = new WeakMap(); // note object -> { text, lower, title, lowerTitle }

function lowered(note) {
  let c = lowerCache.get(note);
  if (!c || c.text !== note.text || c.title !== note.title) {
    c = { text: note.text, lower: note.text.toLowerCase(), title: note.title, lowerTitle: (note.title || '').toLowerCase() };
    lowerCache.set(note, c);
  }
  return c;
}

// Returns [{ note, start, end, inTitle }], most recently edited notes first.
function searchNotes(notes, query) {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const results = [];
  const sorted = [...notes].sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
  for (const note of sorted) {
    const c = lowered(note);
    let found = 0;
    let i = c.lower.indexOf(q);
    while (i !== -1 && found < MAX_PER_NOTE) {
      results.push({ note, start: i, end: i + q.length, inTitle: false });
      found++;
      i = c.lower.indexOf(q, i + q.length);
    }
    // A custom name counts on its own only if the text itself didn't match
    // (auto-titles are just the first line, which the text search already covers).
    if (!found && note.customTitle && note.customTitle.toLowerCase().includes(q)) {
      results.push({ note, start: 0, end: 0, inTitle: true });
    }
    if (results.length >= MAX_RESULTS) break;
  }
  return results.slice(0, MAX_RESULTS);
}

function escapeHtml(s) {
  return s.replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
}

// A short piece of text around the match, with the match highlighted.
function snippetHtml(text, start, end) {
  const from = Math.max(0, start - 22);
  const to = Math.min(text.length, end + 40);
  const clean = (s) => escapeHtml(s.replace(/\s+/g, ' '));
  return (from > 0 ? '…' : '') + clean(text.slice(from, start)) +
    '<mark>' + clean(text.slice(start, end)) + '</mark>' + clean(text.slice(end, to)) + (to < text.length ? '…' : '');
}

window.searchNotes = searchNotes;
window.snippetHtml = snippetHtml;
window.escapeHtml = escapeHtml;
