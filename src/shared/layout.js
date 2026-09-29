// layout.js
// Works out WHERE things go inside the note, based on assets/note-bg.png.
//
// When the app starts it looks at the picture and finds:
//   - the cream writing area (all text and buttons live inside it)
//   - the character in the bottom-left corner (nothing may cover it)
// Every position is stored as a fraction of the picture (0 = left/top edge,
// 1 = right/bottom edge), so the layout scales when you resize the note.
//
// If you ever swap the picture and the automatic detection gets it wrong,
// set autoMeasure to false and type the numbers into FALLBACK_LAYOUT by hand.

const LAYOUT_CONFIG = {
  autoMeasure: true
};

const FALLBACK_LAYOUT = {
  cream: { l: 0.065, t: 0.065, r: 0.935, b: 0.935 },
  character: { l: 0.065, t: 0.72, r: 0.245, b: 0.945 }
};

// A pixel counts as "cream" if it is light, warm and not very colourful.
function isCream(r, g, b, a) {
  return a > 200 && r >= 236 && g >= 224 && b >= 196 && r - g <= 22 && r - b <= 64 && g >= b - 6;
}

// Distance from colour p to the straight line between colours c1 and c2.
// Pixels on that line are soft "blend" pixels at the edge between two areas.
function distToSegment(p, c1, c2) {
  const d = [c2[0] - c1[0], c2[1] - c1[1], c2[2] - c1[2]];
  const len2 = d[0] * d[0] + d[1] * d[1] + d[2] * d[2] || 1;
  let t = ((p[0] - c1[0]) * d[0] + (p[1] - c1[1]) * d[1] + (p[2] - c1[2]) * d[2]) / len2;
  t = Math.max(0, Math.min(1, t));
  const q = [c1[0] + t * d[0] - p[0], c1[1] + t * d[1] - p[1], c1[2] + t * d[2] - p[2]];
  return Math.sqrt(q[0] * q[0] + q[1] * q[1] + q[2] * q[2]);
}

// pixels: raw image bytes, 4 per pixel. order: 'rgba' or 'bgra'.
// Returns a layout object like FALLBACK_LAYOUT, or null if detection failed.
function measureLayout(pixels, W, H, order = 'rgba') {
  const R = order === 'bgra' ? 2 : 0;
  const B = order === 'bgra' ? 0 : 2;
  const px = (x, y) => {
    const i = (y * W + x) * 4;
    return [pixels[i + R], pixels[i + 1], pixels[i + B], pixels[i + 3]];
  };

  // 1. Find the cream area: rows and columns that are mostly cream.
  const rowCount = new Array(H).fill(0);
  const colCount = new Array(W).fill(0);
  const creamSum = [0, 0, 0];
  let creamN = 0;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const [r, g, b, a] = px(x, y);
      if (isCream(r, g, b, a)) {
        rowCount[y]++; colCount[x]++;
        creamSum[0] += r; creamSum[1] += g; creamSum[2] += b; creamN++;
      }
    }
  }
  const rows = rowCount.map((c, i) => (c >= W * 0.35 ? i : -1)).filter((i) => i >= 0);
  const cols = colCount.map((c, i) => (c >= H * 0.35 ? i : -1)).filter((i) => i >= 0);
  if (!rows.length || !cols.length) return null;
  const top = rows[0], bottom = rows[rows.length - 1];
  const left = cols[0], right = cols[cols.length - 1];
  if (right - left < W * 0.4 || bottom - top < H * 0.4) return null;
  const creamColor = creamSum.map((s) => s / creamN);

  // 2. Learn the border colours by walking from the picture edges to the cream area.
  const palette = [];
  const addColor = (x, y) => {
    const [r, g, b, a] = px(x, y);
    if (a < 200 || isCream(r, g, b, a)) return;
    if (!palette.some((p) => Math.abs(p[0] - r) + Math.abs(p[1] - g) + Math.abs(p[2] - b) < 12)) palette.push([r, g, b]);
  };
  const midX = Math.floor(W / 2), midY = Math.floor(H / 2);
  for (let x = 0; x < left; x++) addColor(x, midY);
  for (let x = right + 1; x < W; x++) addColor(x, midY);
  for (let y = 0; y < top; y++) addColor(midX, y);
  for (let y = bottom + 1; y < H; y++) addColor(midX, y);

  // 3. Find the character: non-cream, non-border pixels in the bottom-left of the cream area.
  const cw = right - left, ch = bottom - top;
  const x0 = left, x1 = Math.min(W - 1, left + Math.floor(cw * 0.55));
  const y0 = top + Math.floor(ch * 0.45), y1 = Math.min(H - 1, bottom + Math.floor(H * 0.02));
  const charRows = {}, charCols = {};
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const [r, g, b, a] = px(x, y);
      if (a < 200 || isCream(r, g, b, a)) continue;
      const p = [r, g, b];
      // skip the border itself and soft edge pixels between border and cream
      if (palette.some((c) => distToSegment(p, creamColor, c) < 20)) continue;
      charRows[y] = (charRows[y] || 0) + 1;
      charCols[x] = (charCols[x] || 0) + 1;
    }
  }
  const minHits = Math.max(3, Math.round(W / 85));
  const cRows = Object.keys(charRows).map(Number).filter((y) => charRows[y] >= minHits).sort((a, b) => a - b);
  const cCols = Object.keys(charCols).map(Number).filter((x) => charCols[x] >= minHits).sort((a, b) => a - b);

  const layout = {
    cream: { l: left / W, t: top / H, r: (right + 1) / W, b: (bottom + 1) / H },
    character: null,
    // colours learned from the picture, used to cut the character out cleanly
    colors: { cream: creamColor, border: palette }
  };
  if (cRows.length && cCols.length) {
    let cl = cCols[0] / W;
    let ct = cRows[0] / H;
    let cr = (cCols[cCols.length - 1] + 1) / W;
    let cb = (cRows[cRows.length - 1] + 1) / H;
    // A corner mascot may have pale parts (a white face) that read as "cream"
    // and get missed. If the detected shape hugs the bottom-left corner, anchor
    // the protected box to that corner so the whole character is always covered.
    if (cl <= layout.cream.l + 0.05 && cb >= layout.cream.b - 0.08) {
      cl = Math.min(cl, layout.cream.l);
      // Below the cream writing area, the only things in the corner are the pink
      // border and the character. So scan down and count anything that ISN'T
      // border as character - that recovers a pale face the colour test missed.
      const isBorderPix = (p) => palette.some((c) => Math.abs(p[0] - c[0]) + Math.abs(p[1] - c[1]) + Math.abs(p[2] - c[2]) < 40);
      const xL = Math.max(0, Math.floor(cl * W));
      const xR = Math.min(W - 1, Math.ceil(cr * W));
      let contentBottom = Math.round(cb * H);
      for (let y = bottom + 1; y < H; y++) {
        let hits = 0;
        for (let x = xL; x <= xR; x++) {
          const [r, g, b, a] = px(x, y);
          if (a >= 200 && !isBorderPix([r, g, b])) hits++;
        }
        if (hits >= minHits) contentBottom = y + 1;
      }
      cb = Math.max(cb, contentBottom / H);
    }
    layout.character = { l: cl, t: ct, r: cr, b: cb };
  }
  return layout;
}

// Make the cream and border pixels around the character see-through, so the
// strawberry can be used on its own (strip icon, tray icon).
function cutOutCharacter(pixels, W, H, order, colors) {
  const R = order === 'bgra' ? 2 : 0;
  const B = order === 'bgra' ? 0 : 2;
  for (let i = 0; i < W * H * 4; i += 4) {
    const r = pixels[i + R], g = pixels[i + 1], b = pixels[i + B], a = pixels[i + 3];
    if (a < 10) continue;
    const p = [r, g, b];
    const background = isCream(r, g, b, a) ||
      (colors && colors.border.some((c) => distToSegment(p, colors.cream, c) < 20));
    if (background) { pixels[i] = pixels[i + 1] = pixels[i + 2] = pixels[i + 3] = 0; } // fully clear
  }
  return pixels;
}

const api = { LAYOUT_CONFIG, FALLBACK_LAYOUT, measureLayout, cutOutCharacter };
if (typeof module !== 'undefined' && module.exports) module.exports = api;
