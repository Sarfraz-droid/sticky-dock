const fs = require('fs');
const path = require('path');
const { sleep, check, shot, js, waitFor, done } = require('./helpers');
module.exports = async (api) => {
  const { app, store } = api;
  const file = path.join(app.getPath('userData'), 'notes.json');
  await waitFor(() => api.strip.isVisible()); await sleep(600);
  api.openNote(); await sleep(400);
  const wc = api.note.webContents;
  await js(api.note, `document.getElementById('page').focus()`);
  wc.insertText('Buy strawberries\nCall mum about Sunday');
  await sleep(700);
  let saved = JSON.parse(fs.readFileSync(file, 'utf8'));
  check('autosaved to notes.json', saved.notes.length === 1 && saved.notes[0].text.includes('Call mum'));
  check('title = first line', saved.notes[0].title === 'Buy strawberries', saved.notes[0].title);
  check('tmp file cleaned up', !fs.existsSync(file + '.tmp'));

  await js(api.note, `document.getElementById('newBtn').click()`);
  wc.insertText('Second note text');
  await sleep(500);
  saved = JSON.parse(fs.readFileSync(file, 'utf8'));
  check('second note created', saved.notes.length === 2);
  check('last used note remembered', saved.lastNoteId === saved.notes[1].id);

  // rename by double-click
  await js(api.note, `document.getElementById('title').dispatchEvent(new MouseEvent('dblclick', {bubbles:true}))`);
  await sleep(100);
  await js(api.note, `(() => { const i=document.getElementById('titleInput'); i.value='Shopping ideas'; i.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true})); })()`);
  await sleep(500);
  saved = JSON.parse(fs.readFileSync(file, 'utf8'));
  check('rename saved', saved.notes.some((n) => n.customTitle === 'Shopping ideas'));
  await shot(api.note, 'm2-renamed');

  // notes list
  await js(api.note, `document.getElementById('listBtn').click()`);
  await sleep(150);
  await shot(api.note, 'm2-list');
  const items = await js(api.note, `[...document.querySelectorAll('.list-item')].map(b=>b.textContent)`);
  check('list shows both notes', items.length === 2, JSON.stringify(items));
  await js(api.note, `document.querySelectorAll('.list-item')[1].click()`);
  await sleep(100);
  const title = await js(api.note, `document.getElementById('title').textContent`);
  check('switch note via list', title === 'Buy strawberries', title);

  // delete with confirmation
  await js(api.note, `document.getElementById('deleteBtn').click()`);
  await sleep(100);
  await shot(api.note, 'm2-confirm');
  const confirmShown = await js(api.note, `!document.getElementById('confirmBox').hidden`);
  check('delete asks first', confirmShown);
  await js(api.note, `document.getElementById('confirmYes').click()`);
  await sleep(500);
  saved = JSON.parse(fs.readFileSync(file, 'utf8'));
  check('deleted note moved to recently deleted', saved.notes.length === 1 && saved.deleted.length === 1 && saved.deleted[0].deletedAt > 0);
  // restore from settings
  await js(api.note, `document.getElementById('gearBtn').click()`); await sleep(200);
  await js(api.note, `document.getElementById('deletedToggle').click()`); await sleep(200);
  await shot(api.note, 'm2-settings-deleted');
  await js(api.note, `document.querySelector('.deleted-item .chip').click()`); await sleep(500);
  saved = JSON.parse(fs.readFileSync(file, 'utf8'));
  check('restore works', saved.notes.length === 2 && saved.deleted.length === 0);
  done(app);
};
