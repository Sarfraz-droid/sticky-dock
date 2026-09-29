// strip.js - the collapsed tab on the screen edge.
// Click it to open the note. Drag it up or down to move it along the edge.

const stripEl = document.getElementById('strip');
const berryEl = document.getElementById('berry');

// The strawberry, already cut out of note-bg.png by the main process.
function showBerry(iconUrl) {
  if (!iconUrl) { berryEl.style.display = 'none'; return; }
  berryEl.style.backgroundImage = `url("${iconUrl}")`;
}

function applySide(side) {
  stripEl.classList.toggle('left', side === 'left');
  stripEl.classList.toggle('right', side !== 'left');
}

// Paint the tab in the chosen design's colours.
function applyTheme(theme, themeIcon) {
  showBerry(themeIcon);
  if (theme && theme.palette) {
    const s = document.documentElement.style, p = theme.palette;
    s.setProperty('--accent', p.accent);
    s.setProperty('--cream', p.cream);
    s.setProperty('--ink', p.ink);
  }
}

window.dock.getInitial().then(({ theme, themeIcon, settings }) => {
  applyTheme(theme, themeIcon);
  applySide(settings.dockSide);
});
window.dock.onSettingsChanged((s) => applySide(s.dockSide));
window.dock.onThemeChanged(({ theme, themeIcon }) => applyTheme(theme, themeIcon));

// Tell a click apart from a drag: moving more than 4 px means "drag".
let downY = null;
let dragging = false;
let pendingDy = 0, moveQueued = false;

stripEl.addEventListener('pointerdown', (e) => {
  if (e.button !== 0) return;
  downY = e.screenY;
  dragging = false;
  stripEl.setPointerCapture(e.pointerId);
});

stripEl.addEventListener('pointermove', (e) => {
  if (downY === null) return;
  const dy = e.screenY - downY;
  if (!dragging && Math.abs(dy) > 4) {
    dragging = true;
    stripEl.classList.add('dragging');
    window.dock.stripDragStart();
  }
  if (dragging) {
    pendingDy = dy;
    if (!moveQueued) {
      moveQueued = true;
      requestAnimationFrame(() => { moveQueued = false; window.dock.stripDragMove(pendingDy); });
    }
  }
});

stripEl.addEventListener('pointerup', () => {
  if (downY === null) return;
  if (dragging) window.dock.stripDragEnd();
  else window.dock.openFromStrip();
  downY = null;
  dragging = false;
  stripEl.classList.remove('dragging');
});

// Hover to peek: resting the pointer on the tab for a moment opens the note with the
// usual slide-out animation. The tab "charges up" (see .arming in strip.css) so it
// never feels like a surprise, and moving away before it finishes cancels it.
const HOVER_OPEN_MS = 450;
let hoverTimer = null;

function cancelHover() {
  clearTimeout(hoverTimer);
  hoverTimer = null;
  stripEl.classList.remove('arming');
}

stripEl.addEventListener('pointerenter', () => {
  if (downY !== null || dragging) return;
  stripEl.classList.add('arming');
  hoverTimer = setTimeout(() => {
    hoverTimer = null;
    if (downY === null) window.dock.openFromStrip();
  }, HOVER_OPEN_MS);
});
stripEl.addEventListener('pointerleave', cancelHover);
stripEl.addEventListener('pointerdown', cancelHover);
