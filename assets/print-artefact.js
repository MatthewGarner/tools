/* Print prints the current view's artefact alone: no controls, no essay, light theme, landscape. On beforeprint the
   artefact is rendered afresh in the light theme (whatever the page is showing) and laid out for the sheet:
   - if it fits one sheet at 70% or more of its width-fitted size, it is shrunk onto one sheet;
   - otherwise it is cut into sheets only in the gaps between rows (never through one), each later sheet repeating the
     axis / column header, and the last sheet never carries the legend alone.
   The pieces go in a holder the print stylesheet shows instead of the page; afterprint takes it away. */
import {stripEmbeddedFonts} from './chapter-fonts.js';

/* A4 landscape with the stylesheet's 10mm margins: 277mm wide by 190mm tall is 0.686; 0.68 leaves a rounding margin. A sheet's
   height in artefact units is at most PAGE_RATIO times its width. Letter's body is taller (0.755), so a sheet there has spare room. */
export const PAGE_RATIO = .68;
const SHRINK_LIMIT = .7;  // shrink onto one sheet when that keeps at least this fraction of the width-fitted size

/* A lane's heading, where the lane continues on a sheet that does not start with it: the sheet names it again. */
const continuation = (headings, start) => {
  const prev = headings.filter(h => h.top < start - .5).at(-1);
  if(!prev || !prev.name || headings.some(h => Math.abs(h.top - start) < 1)) return 0;
  return prev.height;
};

const TRAIL = 12;   // a sheet keeps this much under its last row: that row's own rule and the foot of its lane bar

/* Where a sheet that starts at `start` and is followed by one starting at `cut` stops drawing: just under its last row, never
   running into the gap that belongs to the next row. */
export function sliceEnd(boxes, start, cut){
  const bottoms = boxes.filter(b => b.bottom <= cut + .5 && b.bottom > start + .5).map(b => b.bottom);
  return bottoms.length ? Math.min(cut, Math.max(...bottoms) + TRAIL) : cut;
}

/* Where each later sheet starts: at the top of its first row (or of the lane heading, which travels with its first row), so a
   sheet shows nothing of a row that is not on it, and no row crosses the line. A sheet is closed only when the next row would
   not fit under it. The first sheet has `pageHeight`; later ones lose the repeated header and, where a lane continues, its
   named heading. The last sheet keeps at least `minRows` rows. */
export function cutPoints(boxes, total, pageHeight, headerH = 0, minRows = 2, headings = []){
  const tops = [...new Set(boxes.map(b => b.top))].sort((a, b) => a - b);
  const crosses = y => boxes.some(b => b.top < y - .5 && b.bottom > y + .5);
  const roomAt = start => start > 0 ? pageHeight - headerH - continuation(headings, start) : pageHeight;
  const after = c => boxes.filter(b => b.top >= c - .5).length;
  const fits = (start, y) => sliceEnd(boxes, start, y) - start <= roomAt(start) + .01;
  const cuts = [];
  let start = 0;
  while(total - start > roomAt(start) + .5){
    const room = roomAt(start);
    const valid = tops.filter(y => y > start + .5 && !crosses(y) && fits(start, y));
    // a row taller than a sheet is the only thing that is cut
    const cut = valid.length ? Math.max(...valid) : start + room;
    cuts.push(cut); start = cut;
  }
  // never leave the legend (or one stray row) alone on the last sheet
  if(cuts.length){
    while(after(cuts.at(-1)) < minRows){
      const prev = cuts.length > 1 ? cuts.at(-2) : 0;
      const earlier = tops.filter(y => y > prev + .5 && y < cuts.at(-1) - .5 && after(y) >= minRows && !crosses(y) && fits(prev, y) && total - y <= roomAt(y) + .5);
      if(!earlier.length) break;
      cuts[cuts.length - 1] = Math.max(...earlier);
    }
  }
  return cuts;
}

/* How the artefact sits on the sheets: one shrunken sheet, or slices. Pure, so it can be tested. */
export function plan(vw, vh, boxes, band, headings = []){
  const pageH = vw * PAGE_RATIO;
  if(vh <= pageH + .5) return {mode: 'one', scale: 1, slices: [[0, vh]]};
  const fit = pageH / vh;
  if(fit >= SHRINK_LIMIT) return {mode: 'one', scale: fit, slices: [[0, vh]]};
  const headerH = band ? band[1] - band[0] : 0;
  const cuts = cutPoints(boxes, vh, pageH, headerH, 2, headings);
  const starts = [0, ...cuts];
  return {mode: 'slices', scale: 1, headerH, headings, slices: starts.map((s, i) => [s, i < cuts.length ? sliceEnd(boxes, s, cuts[i]) : vh])};
}

export function printPages(svgText, doc = document){
  const holder = doc.createElement('div');
  holder.style.cssText = 'position:absolute;left:-99999px;top:0;width:1000px';
  // the print stylesheet hides every other child of <body>, and a hidden SVG measures as zero: keep this holder displayed while it is measured
  holder.style.setProperty('display', 'block', 'important');
  holder.innerHTML = svgText;
  doc.body.appendChild(holder);
  const root = holder.querySelector('svg');
  const [, , vw, vh] = root.getAttribute('viewBox').split(/\s+/).map(Number);
  const band = (root.getAttribute('data-header-band') || '').split(/\s+/).map(Number);
  const hasBand = band.length === 2 && band.every(Number.isFinite);
  const boxes = [...root.querySelectorAll('[data-key],[data-field-item]')].map(g => { const b = g.getBBox(); return {top: b.y, bottom: b.y + b.height}; });
  // a lane heading travels with the row under it: its box reaches to that row's bottom
  const headingNodes = [...root.querySelectorAll('[data-lane-heading]')];
  // a heading beside its rows (a lane name in the left rail) marks where the lane starts; one above them is also tied to the first row
  const headings = headingNodes.map(h => {
    const b = h.getBBox(), laneTop = +h.getAttribute('data-lane-top');
    return {top: Number.isFinite(laneTop) ? laneTop : b.y, bboxTop: b.y, height: b.height, name: h.getAttribute('data-lane-heading'), node: h, above: !boxes.some(r => r.top < b.y + b.height - 1 && r.bottom > b.y + 1)};
  });
  for(const h of headings.filter(x => x.above)){
    const next = boxes.filter(r => r.top >= h.bboxTop + h.height - 1).sort((x, y) => x.top - y.top)[0];
    if(next) boxes.push({top: h.top, bottom: next.bottom});
  }
  const layout = plan(vw, vh, boxes, hasBand ? band : null, headings);
  const body = root.innerHTML, ns = 'http://www.w3.org/2000/svg';
  const pages = layout.slices.map(([y0, y1], i) => {
    const page = root.cloneNode(true);
    page.removeAttribute('width'); page.removeAttribute('height');
    if(layout.mode === 'one'){
      page.setAttribute('style', `display:block;margin:0 auto;width:${Math.round(layout.scale * 100)}%;height:auto`);
      return page;
    }
    const h = i > 0 ? layout.headerH || 0 : 0, contH = i > 0 ? continuation(headings, y0) : 0;
    if(!h && !contH){
      page.setAttribute('viewBox', `0 ${y0} ${vw} ${y1 - y0}`);
      page.setAttribute('style', 'display:block;width:100%;height:auto');
      return page;
    }
    // a later sheet: the repeated header and, where a lane continues, its heading again, above its own slice
    const wrap = doc.createElementNS(ns, 'svg');
    wrap.setAttribute('xmlns', ns);
    wrap.setAttribute('viewBox', `0 0 ${vw} ${h + contH + y1 - y0}`);
    wrap.setAttribute('style', 'display:block;width:100%;height:auto');
    const parts = [];
    if(h) parts.push([0, band[0], h]);
    parts.push([h + contH, y0, y1 - y0]);
    for(const [y, sy, sh] of parts){
      const inner = doc.createElementNS(ns, 'svg');
      inner.setAttribute('x', 0); inner.setAttribute('y', y); inner.setAttribute('width', vw); inner.setAttribute('height', sh);
      inner.setAttribute('viewBox', `0 ${sy} ${vw} ${sh}`);
      inner.setAttribute('overflow', 'hidden');
      inner.innerHTML = body;
      wrap.appendChild(inner);
    }
    if(contH){
      const prev = headings.filter(x => x.top < y0 - .5).at(-1);
      const g = prev.node.cloneNode(true);
      g.setAttribute('data-continued', prev.name);
      g.removeAttribute('data-lane-heading');
      g.setAttribute('transform', `translate(0 ${h - prev.bboxTop})`);
      const texts = g.querySelectorAll('text');
      const lastText = texts[texts.length - 1];
      if(lastText) lastText.textContent += ' (continued)';
      wrap.appendChild(g);
    }
    return wrap;
  });
  holder.remove();
  return pages;
}

export function wirePrintArtefact({getSvg}){
  let holder = null;
  addEventListener('beforeprint', () => {
    holder?.remove(); holder = null;   // a second beforeprint (some browsers send two) must not print the artefact twice
    const svg = getSvg();
    if(!svg) return;
    holder = document.createElement('div');
    holder.id = 'print-artefact';
    // the page's own CSS already carries the faces; a data: font inside the page would be refused by its CSP
    for(const page of printPages(stripEmbeddedFonts(svg))){
      const sheet = document.createElement('div');
      sheet.className = 'print-page';
      sheet.appendChild(page);
      holder.appendChild(sheet);
    }
    document.body.appendChild(holder);
  });
  addEventListener('afterprint', () => { holder?.remove(); holder = null; });
}
