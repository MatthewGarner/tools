/* Print: the current view's artefact alone, light, landscape. On beforeprint it is laid out for the sheet: shrunk onto one
   sheet if that keeps 70% of its size, else cut between rows; later sheets repeat the header, the last never holds only the
   legend. The holder replaces the page in print; afterprint removes it. */
import {stripEmbeddedFonts} from './chapter-fonts.js';

/* A4 landscape body (277 x 190mm) is 0.686 of its width; a sheet is at most this much of the artefact's width tall. */
export const PAGE_RATIO = .68;
const SHRINK_LIMIT = .7;

/* Room for the lane heading a sheet repeats where its lane continues. */
const continuation = (headings, start) => {
  const prev = headings.filter(h => h.top < start - .5).at(-1);
  return !prev || !prev.name || headings.some(h => Math.abs(h.top - start) < 1) ? 0 : prev.height;
};

const TRAIL = 12;

/* Where a sheet from `start` stops when the next begins at `cut`: just under its last row. */
export function sliceEnd(boxes, start, cut){
  const bottoms = boxes.filter(b => b.bottom <= cut + .5 && b.bottom > start + .5).map(b => b.bottom + TRAIL);
  return Math.min(cut, ...bottoms.length ? [Math.max(...bottoms)] : []);
}

/* Where each later sheet starts: at the top of its first row (or lane heading), crossing no row, so a sheet shows nothing of a
   row that is not on it. A sheet closes only when the next row would not fit; later sheets lose room to the header and any
   repeated lane heading. The last sheet keeps `minRows` rows. */
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
    // only a row taller than a sheet is cut
    const cut = valid.length ? Math.max(...valid) : start + room;
    cuts.push(cut); start = cut;
  }
  // not the legend alone on the last sheet
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

export function plan(vw, vh, boxes, band, headings = []){
  const pageH = vw * PAGE_RATIO;
  if(vh <= pageH + .5) return {mode: 'one', scale: 1, slices: [[0, vh]]};
  const fit = pageH / vh;
  if(fit >= SHRINK_LIMIT) return {mode: 'one', scale: fit, slices: [[0, vh]]};
  const headerH = band ? band[1] - band[0] : 0;
  const cuts = cutPoints(boxes, vh, pageH, headerH, 2, headings);
  const starts = [0, ...cuts];
  return {mode: 'slices', scale: 1, headerH, slices: starts.map((s, i) => [s, i < cuts.length ? sliceEnd(boxes, s, cuts[i]) : vh])};
}

export function printPages(svgText, doc = document){
  const holder = doc.createElement('div');
  holder.style.cssText = 'position:absolute;left:-99999px;top:0;width:1000px';
  // print CSS hides other body children and a hidden SVG measures zero: keep this holder displayed
  holder.style.setProperty('display', 'block', 'important');
  holder.innerHTML = svgText;
  doc.body.appendChild(holder);
  const root = holder.querySelector('svg');
  const [, , vw, vh] = root.getAttribute('viewBox').split(/\s+/).map(Number);
  const band = (root.getAttribute('data-header-band') || '').split(/\s+/).map(Number);
  const hasBand = band.length === 2 && band.every(Number.isFinite);
  const boxes = [...root.querySelectorAll('[data-key],[data-field-item]')].map(g => { const b = g.getBBox(); return {top: b.y, bottom: b.y + b.height}; });
  // a heading above its rows is tied to the first; one beside them (left rail) only marks the lane's start
  const headings = [...root.querySelectorAll('[data-lane-heading]')].map(h => {
    const b = h.getBBox(), laneTop = parseFloat(h.getAttribute('data-lane-top'));
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
    ['width', 'height'].forEach(a => page.removeAttribute(a));
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
    // later sheet: repeated header, the lane heading where it continues, then its own slice
    const wrap = doc.createElementNS(ns, 'svg');
    wrap.setAttribute('viewBox', `0 0 ${vw} ${h + contH + y1 - y0}`);
    wrap.setAttribute('style', 'display:block;width:100%;height:auto');
    for(const [y, sy, sh] of [...(h ? [[0, band[0], h]] : []), [h + contH, y0, y1 - y0]]){
      const inner = doc.createElementNS(ns, 'svg');
      for(const [k, v] of [['x', 0], ['y', y], ['width', vw], ['height', sh], ['viewBox', `0 ${sy} ${vw} ${sh}`], ['overflow', 'hidden']]) inner.setAttribute(k, v);
      inner.innerHTML = body;
      wrap.appendChild(inner);
    }
    if(contH){
      const prev = headings.filter(x => x.top < y0 - .5).at(-1), g = prev.node.cloneNode(true);
      g.setAttribute('data-continued', prev.name);
      g.removeAttribute('data-lane-heading');
      g.setAttribute('transform', `translate(0 ${h - prev.bboxTop})`);
      const t = [...g.querySelectorAll('text')].at(-1);
      if(t) t.textContent += ' (continued)';
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
