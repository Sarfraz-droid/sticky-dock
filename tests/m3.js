const { sleep, check, shot, js, waitFor, done } = require('./helpers');

// Injected into the note window: checks every rule pagination must follow.
const CHECKER = `
window.__check = () => {
  const ed = window.__stickyDock.editor;
  const errs = [];
  const P = ed.pages, T = ed.text;
  if (P[0][0] !== 0) errs.push('first page does not start at 0');
  if (P[P.length-1][1] !== T.length) errs.push('last page does not end at text end');
  for (let i = 0; i + 1 < P.length; i++) if (P[i][1] !== P[i+1][0]) errs.push('gap/overlap at page ' + i);
  for (let i = 0; i < P.length; i++) {
    if (P.length > 1 && P[i][1] === P[i][0]) errs.push('empty page ' + i);
    if (!ed.paginator.fits(T.slice(P[i][0], P[i][1]))) errs.push('page ' + i + ' overflows');
  }
  const full = ed.paginator.paginate(T);
  if (JSON.stringify(full) !== JSON.stringify(P)) errs.push('incremental != full paginate');
  const ta = document.getElementById('page');
  if (ta.value !== T.slice(P[ed.page][0], P[ed.page][1])) errs.push('box shows wrong text');
  return errs.join('; ');
};
window.__state = () => { const ed = window.__stickyDock.editor; const [s,e] = ed.absSelection();
  return { len: ed.text.length, pages: ed.pages.length, page: ed.page, sel: s, selEnd: e }; };
0;
`;

const WORDS = 'strawberry jam on toast tomorrow remember the dentist at ten call Aisha about the ' +
  'birthday cake pick up oat milk fix the leaky tap water the basil plant send the invoice before Friday';

module.exports = async (api) => {
  const { app } = api;
  await waitFor(() => api.strip.isVisible()); await sleep(600);
  api.openNote(); await sleep(400);
  const wc = api.note.webContents;
  await js(api.note, CHECKER);
  await js(api.note, `document.getElementById('page').focus()`);
  const st = () => js(api.note, `window.__state()`);
  const inv = () => js(api.note, `window.__check()`);
  const key = async (keyCode, modifiers = []) => {
    wc.sendInputEvent({ type: 'keyDown', keyCode, modifiers });
    wc.sendInputEvent({ type: 'keyUp', keyCode, modifiers });
    await sleep(30);
  };

  // A. Type character by character until there are 3 pages.
  let typed = 0, badAt = null, cursorBad = null;
  const words = WORDS.split(' ');
  outer: for (let round = 0; round < 40; round++) {
    for (const w of words) {
      const piece = (round % 3 === 2 && w === 'tomorrow') ? w + '\n' : w + ' ';
      for (const ch of piece) {
        wc.insertText(ch); typed++;
        const e = await inv();
        if (e && !badAt) badAt = `after ${typed} chars: ${e}`;
        const s = await st();
        if (s.sel !== s.len && !cursorBad) cursorBad = `after ${typed} chars cursor=${s.sel} len=${s.len}`;
        if (s.pages >= 3 && ch === ' ') break outer;
      }
    }
  }
  let s = await st();
  check('A. typing char-by-char reached 3 pages', s.pages >= 3, JSON.stringify(s));
  check('A. rules held after every keystroke', !badAt, badAt || `${typed} chars`);
  check('A. cursor followed typing onto new pages', !cursorBad && s.page === s.pages - 1, cursorBad || '');
  await shot(api.note, 'm3-page3');

  // B. Backspace at the very start of page 2 deletes the last char of page 1.
  await js(api.note, `window.__stickyDock.editor.goToPage(1, 'start')`);
  const before = await js(api.note, `(() => { const ed = window.__stickyDock.editor; return { t: ed.text, p1: ed.pages[1][0] }; })()`);
  await key('Backspace');
  s = await st();
  const after = await js(api.note, `window.__stickyDock.editor.text`);
  check('B. backspace at page start removed the char before the break',
    after === before.t.slice(0, before.p1 - 1) + before.t.slice(before.p1), `len ${before.t.length} -> ${after.length}`);
  const shown = await js(api.note, `(() => { const ed = window.__stickyDock.editor; const [a] = ed.absSelection(); return a >= ed.pages[ed.page][0] && a <= ed.pages[ed.page][1]; })()`);
  check('B. cursor sits at the deleted spot and its page is shown', s.sel === before.p1 - 1 && shown, JSON.stringify(s));
  check('B. rules hold', !(await inv()), await inv());

  // C. Typing in the MIDDLE of a full page pushes overflow forward, cursor stays put.
  await js(api.note, `window.__stickyDock.editor.selectRange(10, 10)`);
  wc.insertText('INSERTED WORDS HERE ');
  s = await st();
  check('C. mid-page insert keeps cursor on page 1', s.page === 0 && s.sel === 30, JSON.stringify(s));
  check('C. rules hold', !(await inv()), await inv());

  // D. Paste a big block (~6000 chars) in the middle.
  const big = Array.from({ length: 60 }, (_, i) => `Line ${i + 1}: ${words.slice(i % 10, (i % 10) + 12).join(' ')}.`).join('\n');
  await js(api.note, `window.__stickyDock.editor.selectRange(50, 50)`);
  const t0 = Date.now();
  wc.insertText(big);
  await sleep(50);
  const pasteMs = Date.now() - t0;
  s = await st();
  check('D. big paste: cursor lands right after the pasted text', s.sel === 50 + big.length, JSON.stringify(s));
  check('D. big paste: shown page contains the cursor', await js(api.note, `(() => { const ed = window.__stickyDock.editor; const [a] = ed.absSelection(); return a >= ed.pages[ed.page][0] && a <= ed.pages[ed.page][1]; })()`));
  check('D. rules hold', !(await inv()), `${s.pages} pages, ${pasteMs}ms`);

  // E. Delete a big chunk: select all of page 2 and delete.
  await js(api.note, `window.__stickyDock.editor.goToPage(1)`);
  const pagesBefore = s.pages;
  await js(api.note, `(() => { const ta = document.getElementById('page'); ta.setSelectionRange(0, ta.value.length); })()`);
  await key('Delete');
  s = await st();
  check('E. big delete: text flowed back, fewer or equal pages', s.pages <= pagesBefore, `${pagesBefore} -> ${s.pages}`);
  check('E. rules hold', !(await inv()), await inv());

  // F. Undo / redo across pages.
  const textAfterDelete = await js(api.note, `window.__stickyDock.editor.text`);
  await key('Z', ['control']);
  let t = await js(api.note, `window.__stickyDock.editor.text`);
  check('F. ctrl+z brings the deleted page back', t.length > textAfterDelete.length);
  check('F. rules hold after undo', !(await inv()), await inv());
  await key('Y', ['control']);
  t = await js(api.note, `window.__stickyDock.editor.text`);
  check('F. ctrl+y deletes it again', t === textAfterDelete);
  // undo all the way back: first state was empty
  for (let i = 0; i < 400; i++) await js(api.note, `window.__stickyDock.editor.undo()`);
  t = await js(api.note, `window.__stickyDock.editor.text`);
  check('F. undo all the way back to empty', t === '', `len ${t.length}`);
  for (let i = 0; i < 400; i++) await js(api.note, `window.__stickyDock.editor.redo()`);
  t = await js(api.note, `window.__stickyDock.editor.text`);
  check('F. redo all the way forward', t === textAfterDelete, `len ${t.length} vs ${textAfterDelete.length}`);

  // G. Resizing repaginates and keeps the cursor on the same character.
  await js(api.note, `window.__stickyDock.editor.selectRange(900, 900)`);
  api.note.setBounds({ ...api.note.getBounds(), width: 520, height: 520 });
  await sleep(300);
  s = await st();
  const pagesBig = s.pages;
  check('G. bigger window = fewer pages, cursor kept', s.sel === 900 && !(await inv()), `${pagesBefore} -> ${pagesBig} pages`);
  await shot(api.note, 'm3-resized');
  api.note.setBounds({ ...api.note.getBounds(), width: 300, height: 300 });
  await sleep(300);
  s = await st();
  check('G. smaller window = more pages, cursor kept', s.pages > pagesBig && s.sel === 900 && !(await inv()), `${s.pages} pages`);
  api.note.setBounds({ ...api.note.getBounds(), width: 360, height: 360 });
  await sleep(300);

  // H. Font size change repaginates.
  const pMed = (await st()).pages;
  await api.setSetting('fontSize', 'large'); await sleep(300);
  const pLarge = (await st()).pages;
  check('H. large font = more pages', pLarge > pMed && !(await inv()), `${pMed} -> ${pLarge}`);
  await shot(api.note, 'm3-large-font');
  await api.setSetting('fontSize', 'medium'); await sleep(300);

  // I. Enter at the very end of a full (non-last) page: cursor goes to the next page.
  await js(api.note, `window.__stickyDock.editor.goToPage(0, 'end')`);
  const p0end = await js(api.note, `window.__stickyDock.editor.pages[0][1]`);
  wc.sendInputEvent({ type: 'keyDown', keyCode: 'Return' });
  wc.sendInputEvent({ type: 'char', keyCode: '\r' });
  wc.sendInputEvent({ type: 'keyUp', keyCode: 'Return' });
  await sleep(50);
  s = await st();
  check('I. enter at end of full page moves cursor to next page', s.page === 1 && s.sel === p0end + 1, JSON.stringify(s));
  check('I. rules hold', !(await inv()), await inv());

  // J. Delete everything: only one empty page is left.
  await js(api.note, `window.__stickyDock.editor.setText('', 0)`);
  s = await st();
  check('J. empty note = page 1 of 1', s.pages === 1 && s.page === 0);
  const label = await js(api.note, `document.getElementById('pageLabel').textContent`);
  check('J. label reads "page 1 of 1"', label === 'page 1 of 1', label);

  // K. Arrow keys + ctrl+pagedown walk between pages.
  await js(api.note, `window.__stickyDock.editor.undo()`);
  await js(api.note, `window.__stickyDock.editor.goToPage(0)`);
  await key('PageDown', ['control']);
  s = await st();
  check('K. ctrl+pagedown goes to page 2', s.page === 1);
  await key('PageUp', ['control']);
  s = await st();
  check('K. ctrl+pageup back to page 1', s.page === 0);
  await js(api.note, `window.__stickyDock.editor.goToPage(0, 'end')`);
  await key('Right');
  s = await st();
  check('K. right arrow at end of page 1 goes to page 2', s.page === 1);
  await key('Left');
  s = await st();
  check('K. left arrow at start of page 2 goes back to page 1', s.page === 0);

  // L. Speed: re-paginating a very long note (200+ pages) after a single keystroke.
  await js(api.note, `window.__stickyDock.editor.setText(${JSON.stringify(big)}.repeat(8), 0)`);
  const nPages = (await st()).pages;
  await js(api.note, `window.__stickyDock.editor.selectRange(5, 5)`);
  const tk = await js(api.note, `(() => { const t = performance.now(); const ed = window.__stickyDock.editor;
     ed.setText(ed.text.slice(0,5) + 'x' + ed.text.slice(5), 6, {kind:'insertText'}); return performance.now() - t; })()`);
  check('L. one keystroke in a long note is quick', tk < 40, `${nPages} pages, ${tk.toFixed(1)} ms`);
  check('L. rules hold', !(await inv()), await inv());
  done(app);
};
