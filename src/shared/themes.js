// themes.js
// The look and layout for each note design. Each theme says:
//   - file:    the background picture (in assets/themes/)
//   - palette: the colours the controls use, picked to match the picture
//   - content: the box (as fractions 0..1 of the picture) where the title,
//              search, notes row and writing area go - kept clear of characters
//   - pager:   the box for the page arrows ("page 1 of 3"), also character-free
//   - strip:   the part of the picture to show on the collapsed edge strip
//   - rule:    true to draw faint writing lines (off when the picture already
//              has its own lines or grid)
//
// To add another design later: drop a square PNG in assets/themes/ and add an
// entry here with its boxes. Nothing else needs to change.

const THEMES = [
  {
    id: 'strawberry',
    name: 'Strawberry cat',
    file: 'strawberry.png',
    rule: true,
    palette: { ink: '#5B3A32', accent: '#F4B6C4', accentDeep: '#E98AA0', berry: '#E5546B', cream: '#FFF8E8', paper: '#FFFDF6', mark: '#FFD3DC' },
    content: { l: 0.075, t: 0.06, r: 0.925, b: 0.68 },
    pager: { l: 0.34, t: 0.70, r: 0.92, b: 0.90 },
    strip: { l: 0.066, t: 0.69, r: 0.316, b: 0.965 }
  },
  {
    id: 'cherry',
    name: 'Cherry baby',
    file: 'cherry.png',
    rule: false,
    palette: { ink: '#8E2B3A', accent: '#E59AA6', accentDeep: '#C85A6B', berry: '#C0203A', cream: '#FAE4E6', paper: '#FDEEF0', mark: '#F5C9D0' },
    content: { l: 0.15, t: 0.24, r: 0.85, b: 0.72 },
    pager: { l: 0.14, t: 0.75, r: 0.56, b: 0.90 },
    strip: { l: 0.40, t: 0.05, r: 0.64, b: 0.24 }
  },
  {
    id: 'panda',
    name: 'Panda note',
    file: 'panda.png',
    rule: false,
    palette: { ink: '#42536E', accent: '#A9C0E0', accentDeep: '#7F9DC8', berry: '#5A7FC0', cream: '#FFFFFF', paper: '#FFFFFF', mark: '#D6E2F2' },
    content: { l: 0.09, t: 0.17, r: 0.80, b: 0.82 },
    pager: { l: 0.10, t: 0.84, r: 0.66, b: 0.93 },
    strip: { l: 0.62, t: 0.55, r: 0.99, b: 0.99 }
  },
  {
    id: 'orange',
    name: 'Orange note',
    file: 'orange.png',
    rule: false,
    palette: { ink: '#8A4A1E', accent: '#F0A860', accentDeep: '#E0862A', berry: '#E8702A', cream: '#FDF6EC', paper: '#FFF9F0', mark: '#FFE0C0' },
    content: { l: 0.12, t: 0.31, r: 0.89, b: 0.82 },
    pager: { l: 0.12, t: 0.84, r: 0.89, b: 0.92 },
    strip: { l: 0.04, t: 0.07, r: 0.30, b: 0.30 }
  },
  {
    id: 'tap',
    name: 'Tap tap',
    file: 'tap.png',
    rule: false,
    palette: { ink: '#3A3A3A', accent: '#C3CCD6', accentDeep: '#93A2B2', berry: '#7A9CC4', cream: '#FFFFFF', paper: '#FFFFFF', mark: '#DBE7F2' },
    content: { l: 0.04, t: 0.03, r: 0.96, b: 0.58 },
    pager: { l: 0.04, t: 0.62, r: 0.31, b: 0.80 },
    strip: { l: 0.34, t: 0.62, r: 0.57, b: 0.90 }
  },
  {
    id: 'pets',
    name: 'Fruit pets',
    file: 'pets.png',
    rule: false,
    palette: { ink: '#5A5348', accent: '#D8CCB2', accentDeep: '#B0A182', berry: '#C08A54', cream: '#F6F2E5', paper: '#FBF8EF', mark: '#E8DCC4' },
    content: { l: 0.05, t: 0.04, r: 0.95, b: 0.62 },
    pager: { l: 0.31, t: 0.66, r: 0.69, b: 0.86 },
    strip: { l: 0.02, t: 0.64, r: 0.33, b: 0.99 }
  }
];

const DEFAULT_THEME = 'strawberry';
const themeById = (id) => THEMES.find((t) => t.id === id) || THEMES[0];

const api = { THEMES, DEFAULT_THEME, themeById };
if (typeof module !== 'undefined' && module.exports) module.exports = api;
if (typeof window !== 'undefined') window.THEMES_DATA = api;
