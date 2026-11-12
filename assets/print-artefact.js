/* Print prints the current view's artefact alone: no controls, no essay, light theme, landscape. On beforeprint the
   artefact is rendered afresh in the light theme (whatever the page is showing) and laid out for the sheet:
   - if it fits one sheet at 70% or more of its width-fitted size, it is shrunk onto one sheet;
   - otherwise it is cut into sheets only in the gaps between rows (never through one), each later sheet repeating the
     axis / column header, and the last sheet never carries the legend alone.
   The pieces go in a holder the print stylesheet shows instead of the page; afterprint takes it away. */
import {stripEmbeddedFonts} from './chapter-fonts.js';

const PAGE_RATIO = .66;   // landscape A4/Letter body, a little conservative: height / width
const SHRINK_LIMIT = .7;  // shrink onto one sheet when that keeps at least this fraction of the width-fitted size

/* y positions where a sheet may end: just under a row, with no row crossing the line. The first sheet has `pageHeight`,
   later ones `pageHeight - headerH` (they repeat the header). The last sheet keeps at least `minRows` rows. */
export function cutPoints(boxes, total, pageHeight, headerH = 0, minRows = 2){
  const cuts = [];
  let start = 0, room = pageHeight;
  while(total - start > room + .5){
    const limit = start + room;
    const valid = boxes.map(b => b.bottom)   // rows can abut (no gap), so a sheet may end exactly on a row's bottom edge
      .filter(y => y > start + room * .3 && y <= limit && !boxes.some(b => b.top < y - .5 && b.bottom > y + .5));
    const cut = valid.length ? Math.max(...valid) : limit;   // a row taller than a sheet is the only thing that is cut
    cuts.push(cut); start = cut; room = pageHeight - headerH;
  }
  // never leave the legend (or one stray row) alone on the last sheet
  if(cuts.length){
    const after = c => boxes.filter(b => b.top >= c - .5).length;
    while(after(cuts.at(-1)) < minRows){
      const prev = cuts.length > 1 ? cuts.at(-2) : 0;
      const earlier = boxes.map(b => b.bottom).filter(y => y > prev + room * .3 && y < cuts.at(-1) - .5 && after(y) >= minRows && !boxes.some(b => b.top < y - .5 && b.bottom > y + .5));
      if(!earlier.length) break;
      cuts[cuts.length - 1] = Math.max(...earlier);
    }
  }
  return cuts;
}

/* How the artefact sits on the sheets: one shrunken sheet, or slices. Pure, so it can be tested. */
export function plan(vw, vh, boxes, band){
  const pageH = vw * PAGE_RATIO;
  if(vh <= pageH + .5) return {mode: 'one', scale: 1, slices: [[0, vh]]};
  const fit = pageH / vh;
  if(fit >= SHRINK_LIMIT) return {mode: 'one', scale: fit, slices: [[0, vh]]};
  const headerH = band ? band[1] - band[0] : 0;
  const cuts = cutPoints(boxes, vh, pageH, headerH);
  const edges = [0, ...cuts, vh];
  return {mode: 'slices', scale: 1, headerH, slices: edges.slice(0, -1).map((e, i) => [e, edges[i + 1]])};
}

export function printPages(svgText, doc = document){
  const holder = doc.createElement('div');
  holder.style.cssText = 'position:absolute;left:-99999px;top:0;width:1000px';
  holder.innerHTML = svgText;
  doc.body.appendChild(holder);
  const root = holder.querySelector('svg');
  const [, , vw, vh] = root.getAttribute('viewBox').split(/\s+/).map(Number);
  const band = (root.getAttribute('data-header-band') || '').split(/\s+/).map(Number);
  const hasBand = band.length === 2 && band.every(Number.isFinite);
  const boxes = [...root.querySelectorAll('[data-key],[data-field-item]')].map(g => { const b = g.getBBox(); return {top: b.y, bottom: b.y + b.height}; });
  // a lane heading travels with the row under it: its box reaches to that row's bottom
  for(const band of root.querySelectorAll('rect[data-lane]')){
    const b = band.getBBox(), next = boxes.filter(r => r.top >= b.y + b.height - 1).sort((x, y) => x.top - y.top)[0];
    if(next) boxes.push({top: b.y, bottom: next.bottom});
  }
  const layout = plan(vw, vh, boxes, hasBand ? band : null);
  const body = root.innerHTML, ns = 'http://www.w3.org/2000/svg';
  const pages = layout.slices.map(([y0, y1], i) => {
    const page = root.cloneNode(true);
    page.removeAttribute('width'); page.removeAttribute('height');
    const repeat = i > 0 && layout.headerH;
    if(layout.mode === 'one'){
      page.setAttribute('style', `display:block;margin:0 auto;width:${Math.round(layout.scale * 100)}%;height:auto`);
    } else if(!repeat){
      page.setAttribute('viewBox', `0 ${y0} ${vw} ${y1 - y0}`);
      page.setAttribute('style', 'display:block;width:100%;height:auto');
    } else {
      // a later sheet: the repeated header above its own slice
      const h = layout.headerH, wrap = doc.createElementNS(ns, 'svg');
      for(const a of ['xmlns']) wrap.setAttribute(a, ns);
      wrap.setAttribute('viewBox', `0 0 ${vw} ${h + y1 - y0}`);
      wrap.setAttribute('style', 'display:block;width:100%;height:auto');
      for(const [y, sy, sh] of [[0, band[0], h], [h, y0, y1 - y0]]){
        const inner = doc.createElementNS(ns, 'svg');
        inner.setAttribute('x', 0); inner.setAttribute('y', y); inner.setAttribute('width', vw); inner.setAttribute('height', sh);
        inner.setAttribute('viewBox', `0 ${sy} ${vw} ${sh}`);
        inner.setAttribute('overflow', 'hidden');
        inner.innerHTML = body;
        wrap.appendChild(inner);
      }
      return Object.assign(wrap, {});
    }
    return page;
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
