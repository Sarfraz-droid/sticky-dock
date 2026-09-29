const { sleep, check, js, waitFor, done } = require('./helpers');
module.exports = async (api) => {
  const { app } = api;
  await sleep(1200);
  check('starts collapsed (not auto-open)', api.getState() === 'collapsed', 'state=' + api.getState());
  check('strip visible on normal launch', api.strip.isVisible());
  api.openNote();
  await waitFor(() => api.getState() === 'open', 4000);
  await sleep(500);
  const pickerHidden = await js(api.note, 'document.getElementById("themePicker").hidden');
  check('no picker on a normal launch', pickerHidden === true);
  const theme = await js(api.note, 'window.__stickyDock.theme.id');
  check('saved design (orange) loaded', theme === 'orange', 'theme=' + theme);
  done(app);
};
