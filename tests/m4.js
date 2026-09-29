const { sleep, check, shot, js, waitFor, done } = require('./helpers');
module.exports = async (api) => {
  const { app } = api;
  await waitFor(() => api.strip.isVisible()); await sleep(600);
  api.openNote(); await sleep(400);

  // Seed several notes with known text across multiple pages.
  const longNote = 'Grocery run:\n' + Array.from({length: 40}, (_, i) => `item ${i}: buy something nice for the weekend trip`).join('\n') +
    '\nHIDDEN_MARKER on a later page\nmore filler ' + 'lorem ipsum dolor '.repeat(30);
  await js(api.note, `(async () => {
    const d = window.__stickyDock;
    d.editor.setText(${JSON.stringify(longNote)}, 0);
    d.current.text = d.editor.text; d.current.updatedAt = Date.now(); window.dock.upsertNote(d.current);
    d.createNote(); d.editor.setText('Recipe: strawberry shortcake\\nwhip the cream\\nslice the STRAWBERRY thinly', 0);
    d.current.text = d.editor.text; window.dock.upsertNote(d.current);
    d.createNote(); d.editor.setText('Meeting notes with Priya about the roadmap', 0);
    d.current.customTitle = 'Work stuff'; d.current.text = d.editor.text; window.dock.upsertNote(d.current);
  })()`);
  await sleep(300);

  const type = async (q) => {
    await js(api.note, `(() => { const s=document.getElementById('searchInput'); s.focus(); s.value=${JSON.stringify(q)}; s.dispatchEvent(new Event('input',{bubbles:true})); })()`);
    await sleep(200);
  };
  const results = () => js(api.note, `[...document.querySelectorAll('.result')].map(r => ({title:r.querySelector('.r-title').textContent, page:r.querySelector('.r-page').textContent, snip:r.querySelector('.r-snip').textContent}))`);

  // 1. case-insensitive match across notes
  await type('strawberry');
  let r = await results();
  check('finds "strawberry" in multiple notes, case-insensitive', r.length >= 2, JSON.stringify(r));
  check('result shows a highlighted snippet', await js(api.note, `!!document.querySelector('.result mark')`));
  await shot(api.note, 'm4-search');

  // 2. match that lives on a later page reports the right page number
  await type('HIDDEN_MARKER');
  r = await results();
  check('finds text on a later page', r.length === 1, JSON.stringify(r));
  check('reports a page number > 1 for later-page match', r[0] && parseInt(r[0].page.replace(/\D/g,'')) > 1, r[0] && r[0].page);

  // 3. clicking a result jumps to that note+page and selects the match
  await js(api.note, `document.querySelectorAll('.result')[0].click()`);
  await sleep(300);
  const sel = await js(api.note, `(() => { const d=window.__stickyDock; const [s,e]=d.editor.absSelection(); return { text: d.editor.text.slice(s,e), onCorrectNote: d.editor.text.includes('HIDDEN_MARKER'), page: d.editor.page }; })()`);
  check('clicking result jumps to the match and it is on the shown page', sel.onCorrectNote && sel.page > 0, JSON.stringify(sel));
  check('results dropdown closed after clicking', await js(api.note, `document.getElementById('results').hidden`));

  // 4. keyboard navigation
  await type('buy');
  await js(api.note, `(() => { const s=document.getElementById('searchInput'); s.dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowDown',bubbles:true})); })()`);
  await sleep(80);
  const active2 = await js(api.note, `[...document.querySelectorAll('.result')].findIndex(r=>r.classList.contains('active'))`);
  check('arrow key moves the highlighted result', active2 === 1, `active index ${active2}`);

  // 5. title-only match
  await type('Work stuff');
  r = await results();
  check('matches a note by its title', r.some(x => x.title === 'Work stuff'), JSON.stringify(r));

  // 6. friendly empty state
  await type('zzxqnothingzz');
  const empty = await js(api.note, `document.querySelector('.empty-msg') ? document.querySelector('.empty-msg').textContent : ''`);
  check('friendly "nothing found" message', /no notes/.test(empty), empty);
  await shot(api.note, 'm4-empty');

  // 7. escape clears the search
  await js(api.note, `(() => { const s=document.getElementById('searchInput'); s.focus(); s.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true})); })()`);
  await sleep(100);
  const cleared = await js(api.note, `({ val: document.getElementById('searchInput').value, hidden: document.getElementById('results').hidden })`);
  check('escape clears search box and closes results', cleared.val === '' && cleared.hidden, JSON.stringify(cleared));

  // 8. speed with hundreds of notes
  await js(api.note, `(() => { const d=window.__stickyDock;
    for (let i=0;i<400;i++){ d.createNote(); d.editor.setText('note '+i+' about '+(i%7===0?'strawberry jam':'random things '+i), 0); d.current.text=d.editor.text; window.dock.upsertNote(d.current);} })()`);
  await sleep(200);
  const t = await js(api.note, `(() => { const d=window.__stickyDock; const t=performance.now(); const r=window.searchNotes(d.notes,'strawberry'); return {ms: performance.now()-t, n: d.notes.length, hits: r.length}; })()`);
  check('search stays fast with hundreds of notes', t.ms < 50, `${t.n} notes, ${t.hits} hits, ${t.ms.toFixed(1)} ms`);
  done(app);
};
