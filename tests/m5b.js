const { sleep, check, js, waitFor, done } = require('./helpers');
module.exports = async (api) => {
  const { app, store } = api;
  await waitFor(() => api.strip.isVisible(), 3000); await sleep(600);
  // restored settings
  check('restored pin=on', store.state.settings.pinned === true);
  check('restored dock side=left', store.state.settings.dockSide === 'left');
  check('restored font size=large', store.state.settings.fontSize === 'large');
  check('restored size=300', store.state.note.size === 300);
  check('restored custom position', store.state.note.customPos && store.state.note.customPos.x === 250);
  // note reopens at saved size + position
  api.openNote(); await sleep(500);
  const b = api.note.getBounds();
  check('reopened at saved size', b.width === 300 && b.height === 300, JSON.stringify(b));
  check('reopened at saved position', b.x === 250 && b.y === 180, JSON.stringify(b));
  // last used note loaded, with big font applied
  const loaded = await js(api.note, `({ title: document.getElementById('title').textContent, font: getComputedStyle(document.body).getPropertyValue('--fs'), side: document.body.classList.contains('side-left') })`);
  check('last used note loaded on launch', loaded.title === 'Kept', loaded.title);
  check('large font class applied', loaded.font.trim() === '23px', loaded.font);
  check('dock side left applied to body', loaded.side === true);
  done(app);
};
