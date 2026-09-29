// pagination.js
// Splits one long note text into pages that each fit the writing area.
//
// How it works: a hidden copy of the writing box (same font, size, width,
// height, padding) is used as a measuring cup. We pour text in and check
// whether it overflows. A page ends at the last word that still fits.
//
// Pages are just [start, end) positions into the one continuous text, so the
// text itself is never cut up or changed.

class Paginator {
  constructor(sourceEl) {
    this.source = sourceEl; // the real writing box we copy the look from
    this.cup = document.createElement('textarea');
    this.cup.setAttribute('aria-hidden', 'true');
    this.cup.tabIndex = -1;
    Object.assign(this.cup.style, {
      position: 'fixed', left: '-10000px', top: '0', visibility: 'hidden',
      overflow: 'hidden', resize: 'none'
    });
    document.body.appendChild(this.cup);
    this.layoutKey = '';
    this.limit = 0;
    this.avgPageLen = 400;
  }

  // Copy size + font from the real writing box. Returns true if the layout changed.
  sync() {
    const cs = getComputedStyle(this.source);
    const props = ['fontFamily', 'fontSize', 'fontWeight', 'lineHeight', 'letterSpacing', 'wordSpacing',
      'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft', 'borderTopWidth', 'borderRightWidth',
      'borderBottomWidth', 'borderLeftWidth', 'boxSizing', 'whiteSpace', 'overflowWrap', 'wordBreak', 'tabSize'];
    for (const p of props) this.cup.style[p] = cs[p];
    this.cup.style.borderStyle = 'solid';
    this.cup.style.width = this.source.offsetWidth + 'px';
    this.cup.style.height = this.source.offsetHeight + 'px';
    const key = props.map((p) => cs[p]).join('|') + `|${this.source.offsetWidth}x${this.source.offsetHeight}`;
    const changed = key !== this.layoutKey;
    this.layoutKey = key;
    this.cup.value = '';
    this.limit = this.cup.clientHeight + 1; // 1 px of wiggle room for rounding
    return changed;
  }

  // Does this text fit on one page without scrolling?
  fits(str) {
    // A newline at the very end only moves the cursor to a new line; it
    // doesn't need its own visible line on this page.
    if (str.endsWith('\n')) str = str.slice(0, -1);
    this.cup.value = str;
    return this.cup.scrollHeight <= this.limit;
  }

  // Where does the page that starts at `start` end?
  pageEnd(text, start) {
    const len = text.length;
    if (start >= len) return len;

    // 1. Find the largest number of characters that fits (grow, then binary search).
    let lo = 0; // known to fit
    let hi = Math.min(len - start, Math.max(64, Math.round(this.avgPageLen * 1.2)));
    while (this.fits(text.slice(start, start + hi))) {
      lo = hi;
      if (start + hi >= len) return len; // everything left fits: last page
      hi = Math.min(len - start, hi * 2);
    }
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (this.fits(text.slice(start, start + mid))) lo = mid; else hi = mid;
    }
    const n = Math.max(1, lo); // always make progress, even if one character is too big

    // 2. Don't cut a word in half: prefer to break at a space or line break.
    //    Any break we pick must still fit; otherwise use the safe point (start + n).
    const safe = start + n;
    const ok = (end) => end > start && end <= len && this.fits(text.slice(start, end));
    const next = text[safe];
    if ((next === ' ' || next === '\n' || next === '\t') && ok(safe + 1)) return safe + 1; // gap right at the edge
    const slice = text.slice(start, safe);
    const gap = Math.max(slice.lastIndexOf(' '), slice.lastIndexOf('\n'), slice.lastIndexOf('\t'));
    if (gap > 0 && ok(start + gap + 1)) return start + gap + 1;
    return safe; // one enormous word (or no usable gap): cut it here
  }

  // Paginate everything from scratch.
  paginate(text) {
    return this.repaginate(text, null, 0, 0, 0);
  }

  // Re-paginate after an edit. The edit replaced old text [a, oldB) with new text [a, newB).
  // Pages before the edit are reused, and as soon as a page break lines up with an old
  // break after the edit, the rest of the old pages are reused (just shifted).
  repaginate(text, oldPages, a, oldB, newB) {
    const len = text.length;
    if (len === 0) return [[0, 0]];
    const delta = newB - oldB;
    let pages = [];
    let pos = 0;
    let reuse = new Map();

    if (oldPages && oldPages.length) {
      let p = oldPages.findIndex(([s, e]) => a >= s && a < e);
      if (p < 0) p = oldPages.length - 1;
      const first = Math.max(0, p - 1); // the previous page may gain text back
      pages = oldPages.slice(0, first);
      pos = oldPages[first][0];
      oldPages.forEach(([s], k) => { if (s >= oldB && k > first) reuse.set(s + delta, k); });
    }

    let lengthSum = 0, counted = 0;
    while (pos < len) {
      const end = this.pageEnd(text, pos);
      pages.push([pos, end]);
      lengthSum += end - pos; counted++;
      if (end >= len) break;
      if (reuse.has(end)) {
        const k = reuse.get(end);
        for (let j = k; j < oldPages.length; j++) {
          pages.push([oldPages[j][0] + delta, oldPages[j][1] + delta]);
        }
        break;
      }
      pos = end;
    }
    if (counted) this.avgPageLen = Math.max(64, Math.round(lengthSum / counted));
    // Safety: the last page must end exactly at the end of the text.
    if (pages.length && pages[pages.length - 1][1] !== len) return this.repaginate(text, null, 0, 0, 0);
    return pages;
  }
}

// Which page shows a given character position? A position exactly on a
// page break belongs to the NEXT page (the start of it).
function pageOfOffset(pages, off) {
  for (let i = 0; i < pages.length; i++) {
    if (off >= pages[i][0] && off < pages[i][1]) return i;
  }
  return pages.length - 1;
}

window.Paginator = Paginator;
window.pageOfOffset = pageOfOffset;
