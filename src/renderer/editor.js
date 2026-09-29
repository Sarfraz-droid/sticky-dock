// editor.js
// Makes one writing box behave like a note made of pages.
//
// The box only ever shows ONE page of the note. Every edit is turned into an
// edit of the full note text, the note is re-paginated, and the cursor is put
// back at the same character position - on whatever page that is now.
// Undo/redo is ours too (the built-in one only knows about a single page).

class PagedEditor {
  constructor(textarea, { onChange, onPageChange }) {
    this.ta = textarea;
    this.paginator = new Paginator(textarea);
    this.onChange = onChange;           // called after the text changed
    this.onPageChange = onPageChange;   // called when page number/count changes
    this.text = '';
    this.pages = [[0, 0]];
    this.page = 0;
    this.undoStack = [];
    this.redoStack = [];
    this.lastTypingAt = 0;
    this.composing = false;
    this.pendingBefore = null;

    this.ta.addEventListener('beforeinput', (e) => this._beforeInput(e));
    this.ta.addEventListener('input', (e) => this._input(e));
    this.ta.addEventListener('keydown', (e) => this._keydown(e));
    this.ta.addEventListener('compositionstart', () => { this.composing = true; });
    this.ta.addEventListener('compositionend', () => { this.composing = false; this._input({ inputType: 'insertCompositionText' }); });
    // The box must never scroll: each page fits exactly.
    this.ta.addEventListener('scroll', () => { this.ta.scrollTop = 0; });
  }

  // ----- loading a note -----

  load(text, cursor = 0) {
    this.text = text;
    this.undoStack = [];
    this.redoStack = [];
    this.paginator.sync();
    this.pages = this.paginator.paginate(text);
    this._show(pageOfOffset(this.pages, cursor), cursor, cursor);
  }

  // Window resized or font size changed: re-measure everything.
  relayout() {
    if (!this.paginator.sync()) return;
    const [s, e] = this.absSelection();
    this.pages = this.paginator.paginate(this.text);
    this._show(pageOfOffset(this.pages, s), s, e);
  }

  // ----- positions -----

  pageStart() { return this.pages[this.page][0]; }
  pageEndPos() { return this.pages[this.page][1]; }
  absSelection() {
    const s = this.pageStart();
    return [s + this.ta.selectionStart, s + this.ta.selectionEnd];
  }

  // Show a page and place the cursor / selection (absolute positions).
  _show(pageIndex, selStart, selEnd = selStart) {
    this.page = Math.max(0, Math.min(pageIndex, this.pages.length - 1));
    const [ps, pe] = this.pages[this.page];
    const value = this.text.slice(ps, pe);
    if (this.ta.value !== value) this.ta.value = value;
    const clampRel = (v) => Math.max(0, Math.min(v - ps, value.length));
    this.ta.setSelectionRange(clampRel(selStart), clampRel(selEnd));
    this.ta.scrollTop = 0;
    this.onPageChange && this.onPageChange(this.page, this.pages.length);
  }

  goToPage(i, where = 'start') {
    if (i < 0 || i >= this.pages.length) return;
    const pos = where === 'end' ? this.pages[i][1] : this.pages[i][0];
    this._show(i, pos, pos);
    this.ta.focus();
    // Put the caret at the very end of the page if asked (position == page break).
    if (where === 'end') this.ta.setSelectionRange(this.ta.value.length, this.ta.value.length);
  }

  // Select a range (used by search) and show its page.
  selectRange(start, end) {
    this._show(pageOfOffset(this.pages, start), start, end);
    this.ta.focus();
  }

  // ----- the one place where text changes -----
  // Replace the whole text with newText, keep the cursor at `cursor`.
  setText(newText, cursor, { recordUndo = true, kind = 'other' } = {}) {
    const old = this.text;
    if (newText === old) return;

    if (recordUndo) {
      // Group quick typing into one undo step; start a new step after a pause or a space.
      const now = Date.now();
      const typing = kind === 'insertText';
      const lastChar = newText[cursor - 1];
      const group = typing && this.lastKind === 'insertText' && now - this.lastTypingAt < 1000 && lastChar !== ' ' && lastChar !== '\n';
      if (!group) {
        const [s, e] = this.pendingBefore || this.absSelection();
        this.undoStack.push({ text: old, selStart: s, selEnd: e });
        if (this.undoStack.length > 300) this.undoStack.shift();
      }
      this.redoStack = [];
      this.lastKind = kind;
      this.lastTypingAt = now;
    }

    // Find what changed (common start and end) so only affected pages are re-measured.
    let a = 0;
    const minLen = Math.min(old.length, newText.length);
    while (a < minLen && old.charCodeAt(a) === newText.charCodeAt(a)) a++;
    let oldB = old.length, newB = newText.length;
    while (oldB > a && newB > a && old.charCodeAt(oldB - 1) === newText.charCodeAt(newB - 1)) { oldB--; newB--; }

    const prevPage = this.page;
    this.text = newText;
    this.paginator.sync();
    this.pages = this.paginator.repaginate(newText, this.pages, a, oldB, newB);

    // Stay on the current page when the cursor is still on it; otherwise follow the cursor.
    let target = pageOfOffset(this.pages, cursor);
    const cur = this.pages[prevPage];
    if (cur && cursor >= cur[0] && cursor <= cur[1]) {
      const onBreakAfterNewline = cursor === cur[1] && prevPage < this.pages.length - 1 && newText[cursor - 1] === '\n';
      if (!onBreakAfterNewline) target = prevPage;
    }
    this._show(target, cursor, cursor);
    this.onChange && this.onChange(this.text);
  }

  // ----- undo / redo -----
  undo() {
    const step = this.undoStack.pop();
    if (!step) return;
    const [s, e] = this.absSelection();
    this.redoStack.push({ text: this.text, selStart: s, selEnd: e });
    this.lastKind = null;
    this.setText(step.text, step.selStart, { recordUndo: false });
    this.selectRange(step.selStart, step.selEnd);
  }

  redo() {
    const step = this.redoStack.pop();
    if (!step) return;
    const [s, e] = this.absSelection();
    this.undoStack.push({ text: this.text, selStart: s, selEnd: e });
    this.lastKind = null;
    this.setText(step.text, step.selStart, { recordUndo: false });
    this.selectRange(step.selStart, step.selEnd);
  }

  // ----- events -----

  _beforeInput(e) {
    if (e.inputType === 'historyUndo') { e.preventDefault(); this.undo(); return; }
    if (e.inputType === 'historyRedo') { e.preventDefault(); this.redo(); return; }
    // Remember the selection before the browser changes the page, for undo.
    this.pendingBefore = this.absSelection();
  }

  _input(e) {
    if (this.composing) return; // wait until the IME finishes a character
    const [ps, pe] = this.pages[this.page];
    const newText = this.text.slice(0, ps) + this.ta.value + this.text.slice(pe);
    const cursor = ps + this.ta.selectionEnd;
    this.setText(newText, cursor, { kind: e.inputType });
    this.pendingBefore = null;
  }

  _keydown(e) {
    const ctrl = e.ctrlKey || e.metaKey;
    const ta = this.ta;
    const collapsed = ta.selectionStart === ta.selectionEnd;

    if (ctrl && !e.shiftKey && e.key.toLowerCase() === 'z') { e.preventDefault(); this.undo(); return; }
    if (ctrl && (e.key.toLowerCase() === 'y' || (e.shiftKey && e.key.toLowerCase() === 'z'))) { e.preventDefault(); this.redo(); return; }
    if (ctrl && e.key === 'PageUp') { e.preventDefault(); this.goToPage(this.page - 1); return; }
    if (ctrl && e.key === 'PageDown') { e.preventDefault(); this.goToPage(this.page + 1); return; }
    if (ctrl && e.key === 'Home' && !e.shiftKey) { e.preventDefault(); this.goToPage(0); return; }
    if (ctrl && e.key === 'End' && !e.shiftKey) { e.preventDefault(); this.goToPage(this.pages.length - 1, 'end'); return; }

    const atStart = collapsed && ta.selectionStart === 0;
    const atEnd = collapsed && ta.selectionStart === ta.value.length;
    const hasPrev = this.page > 0;
    const hasNext = this.page < this.pages.length - 1;

    // Backspace at the top of a page keeps deleting into the previous page.
    if (e.key === 'Backspace' && atStart && hasPrev && !e.altKey) {
      e.preventDefault();
      const pos = this.pageStart();
      this.pendingBefore = [pos, pos];
      this.setText(this.text.slice(0, pos - 1) + this.text.slice(pos), pos - 1, { kind: 'deleteContentBackward' });
      return;
    }
    // Delete at the end of a page pulls in text from the next page.
    if (e.key === 'Delete' && atEnd && hasNext) {
      e.preventDefault();
      const pos = this.pageEndPos();
      this.pendingBefore = [pos, pos];
      this.setText(this.text.slice(0, pos) + this.text.slice(pos + 1), pos, { kind: 'deleteContentForward' });
      return;
    }
    // Arrow keys walk across page edges.
    if (!e.shiftKey && !ctrl) {
      if ((e.key === 'ArrowLeft' || e.key === 'ArrowUp') && atStart && hasPrev) {
        e.preventDefault(); this.goToPage(this.page - 1, 'end'); return;
      }
      if ((e.key === 'ArrowRight' || e.key === 'ArrowDown') && atEnd && hasNext) {
        e.preventDefault(); this.goToPage(this.page + 1, 'start'); return;
      }
    }
  }
}

window.PagedEditor = PagedEditor;
