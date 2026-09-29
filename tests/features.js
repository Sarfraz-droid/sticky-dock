// Tests the new features: theme picker, per-note to-do lists, note drag, and
// the note-selector label updating on search jumps. Screenshots the OPEN note
// (which is visible) for each design.
const { sleep, check, shot, js, waitFor, done } = require('./helpers');
module.exports = async (api) => {
  const { app } = api;
  const N = api.note;
  await waitFor(() => api.getState() === 'open', 5000); // first launch auto-opens with picker
  await sleep(700);

  // ---- 1. First-launch picker ----
  const pickerShown = await js(N, '!document.getElementById("themePicker").hidden');
  check('picker shows on first launch', pickerShown === true);
  const cards = await js(N, 'document.querySelectorAll("#pickerGrid .theme-card").length');
  check('picker offers all 6 designs', cards === 6, 'cards=' + cards);
  await shot(N, 'feat-picker');

  // ---- 2. Pick a design (panda) ----
  await js(N, `(function(){const cs=[...document.querySelectorAll('#pickerGrid .theme-card')];const i=cs.findIndex(c=>/Panda/i.test(c.textContent));cs[i].click();})(); 0;`);
  await sleep(500);
  const themeAfter = await js(N, 'window.__stickyDock.theme.id');
  check('chosen design applied', themeAfter === 'panda', 'theme=' + themeAfter);
  const savedTheme = api.store.state.settings.theme;
  check('chosen design saved to settings', savedTheme === 'panda', 'saved=' + savedTheme);
  const pickerClosed = await js(N, 'document.getElementById("themePicker").hidden');
  check('picker closes after choosing', pickerClosed === true);

  // ---- 3. Other settings unchanged ----
  const s = api.store.state.settings;
  check('other settings intact (side/font/shortcut present)',
    !!s.dockSide && !!s.fontSize && !!s.shortcut, JSON.stringify({side:s.dockSide,font:s.fontSize}));

  // ---- 4. To-do list mode ----
  await js(N, 'window.__stickyDock.createNote(); 0;');
  await sleep(200);
  await js(N, `document.querySelector('#typeToggle button[data-type="todo"]').click(); 0;`);
  await sleep(300);
  const inTodo = await js(N, 'document.body.classList.contains("todo-mode") && !document.getElementById("todoWrap").hidden');
  check('switched to to-do mode', inTodo === true);
  const noteType = await js(N, 'window.__stickyDock.current.type');
  check('note marked as to-do', noteType === 'todo', 'type=' + noteType);
  // type first task, add a second, tick the first
  await js(N, `(function(){const ta=document.querySelector('#todoWrap .todo-text');ta.focus();ta.value='buy milk';ta.dispatchEvent(new Event('input',{bubbles:true}));})(); 0;`);
  await sleep(200);
  const firstTask = await js(N, 'window.__stickyDock.current.todos[0].text');
  check('to-do captures typed task', firstTask === 'buy milk', 'task=' + firstTask);
  const listName = await js(N, 'document.getElementById("listLabel").textContent');
  check('to-do list named after first task', /buy milk/.test(listName), 'label=' + listName);
  await js(N, `(function(){const c=document.querySelector('#todoWrap .todo-check');c.click();})(); 0;`);
  await sleep(200);
  const doneState = await js(N, 'window.__stickyDock.current.todos[0].done');
  check('ticking a task marks it done', doneState === true);
  await shot(N, 'feat-todo');
  // switch back to notes
  await js(N, `document.querySelector('#typeToggle button[data-type="note"]').click(); 0;`);
  await sleep(300);
  const backToNotes = await js(N, 'window.__stickyDock.current.type === "note" && document.getElementById("todoWrap").hidden');
  check('can switch back to free notes', backToNotes === true);

  // ---- 5. Drag the open note (renderer -> preload -> main -> setBounds) ----
  const before = N.getBounds();
  await js(N, 'window.dock.dragStart(); 0;');
  await js(N, 'window.dock.dragMove(-150, 60); 0;');
  await sleep(150);
  const mid = N.getBounds();
  await js(N, 'window.dock.dragEnd(); 0;');
  await sleep(150);
  check('note moves while dragging', mid.x === before.x - 150 && mid.y === before.y + 60,
    `before=${before.x},${before.y} mid=${mid.x},${mid.y}`);
  const savedPos = api.store.state.note.customPos;
  check('dragged position remembered', savedPos && savedPos.x === mid.x && savedPos.y === mid.y,
    JSON.stringify(savedPos));

  // ---- 6. Search jump updates the note-selector label ----
  await js(N, `(function(){const n=window.__stickyDock.notes;const t=n.find(x=>x.type!=='todo');})(); 0;`);
  // make two clearly named notes
  await js(N, `window.__stickyDock.createNote(); window.__stickyDock.editor.load('zebra crossing notes'); window.__stickyDock.current.text='zebra crossing notes'; window.dock.upsertNote(window.__stickyDock.current); 0;`);
  await sleep(150);
  await js(N, `window.__stickyDock.createNote(); window.__stickyDock.editor.load('apple pie recipe'); window.__stickyDock.current.text='apple pie recipe'; window.dock.upsertNote(window.__stickyDock.current); 0;`);
  await sleep(200);
  // now search for zebra and jump to it
  await js(N, `(function(){const s=document.getElementById('searchInput');s.value='zebra';s.dispatchEvent(new Event('input',{bubbles:true}));})(); 0;`);
  await sleep(300);
  await js(N, 'window.__stickyDock.runSearch(); 0;');
  await sleep(200);
  await js(N, 'window.__stickyDock.pickResult(0); 0;');
  await sleep(300);
  const label = await js(N, 'document.getElementById("listLabel").textContent');
  check('search jump updates selector label', /zebra/i.test(label), 'label=' + label);

  // ---- 7. Screenshot every design on the open note ----
  for (const id of ['strawberry','cherry','panda','orange','tap','pets']) {
    await js(N, `window.dock.setTheme(${JSON.stringify(id)}); 0;`);
    await sleep(350);
    await shot(N, 'theme-' + id);
  }
  const finalTheme = await js(N, 'window.__stickyDock.theme.id');
  check('final theme set for screenshots', finalTheme === 'pets', 'theme=' + finalTheme);

  done(app);
};
