/* Pure export checks shared by dev/pw/export-audit.mjs (full matrix) and dev/pw/export-fidelity.mjs (gate).
   Nothing here touches a browser: every function reads strings or plain geometry and returns records
   {check, pass, values, note}. Rule numbers (S1, A1 ...) are those of the export contract. */

const r1 = n => Math.round(n * 10) / 10;
const num = (s, name, d = null) => { const m = new RegExp('\\b' + name + '="(-?[\\d.]+)"').exec(s); return m ? +m[1] : d; };
const attr = (s, name) => { const m = new RegExp('\\b' + name + '="([^"]*)"').exec(s); return m ? m[1] : null; };
const unesc = s => String(s).replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&');

/* Words the slide furniture must never carry (S6). */
export const FURNITURE_FORBIDDEN = /Theme group|Item part|\bR\d{2}\b|Featured horizon|Supporting horizons|\bPage \d+ of \d+/;

/* Slide geometry from the slide's SVG text. The product writes data-body-top / data-body-bottom on the
   root; for older output without them the bounds are derived (first card minus a header allowance,
   canvas height minus the footer reserve), which is why these are fallbacks and not the contract. */
export function slideGeometry(svg){
  const head = /<svg\b[^>]*>/.exec(svg)?.[0] || '';
  const vb = (attr(head, 'viewBox') || '0 0 1440 810').split(/\s+/).map(Number);
  const cards = [];
  for(const m of svg.matchAll(/<g\b([^>]*\bdata-(?:key|field-item)="[^"]*"[^>]*)>\s*<rect\b([^>]*)>([\s\S]*?)<\/g>/g)){
    const g = m[1], r = m[2], inner = m[3];
    const legacy = /Item part (\d+) of (\d+)/.exec(inner);
    cards.push({key: unesc(attr(g, 'data-key') ?? attr(g, 'data-field-item')), src: num(g, 'data-source-index'), frag: attr(g, 'data-fragment') || (legacy ? legacy[1] + '/' + legacy[2] : null),
      x: num(r, 'x'), y: num(r, 'y'), w: num(r, 'width'), h: num(r, 'height'),
      // what the card draws: a board card's rect can be shorter than its text, so closed-early reads the drawn extent
      drawnBottom: Math.max(num(r, 'y') + num(r, 'height'), ...[...inner.matchAll(/<text\b[^>]*\by="(-?[\d.]+)"[^>]*font-size="([\d.]+)"|<text\b[^>]*font-size="([\d.]+)"[^>]*\by="(-?[\d.]+)"/g)].map(t => +(t[1] ?? t[4]) + .3 * +(t[2] ?? t[3])))});
  }
  const texts = [];
  for(const m of svg.matchAll(/<text\b([^>]*)>([^<]*)<\/text>/g))
    texts.push({x: num(m[1], 'x'), y: num(m[1], 'y'), size: num(m[1], 'font-size'), text: unesc(m[2]), anchor: attr(m[1], 'text-anchor'), weight: attr(m[1], 'font-weight')});
  const minY = cards.length ? Math.min(...cards.map(c => c.y)) : 0;
  const bodyTop = num(head, 'data-body-top', Math.max(0, minY - 30));
  const bodyBottom = num(head, 'data-body-bottom', vb[3] - 60);
  const contentBottom = num(head, 'data-content-bottom', cards.length ? Math.max(...cards.map(c => c.y + c.h)) : bodyTop);
  return {vbW: vb[2], vbH: vb[3], cards, texts, bodyTop, bodyBottom, contentBottom,
    scale: num(head, 'data-scale'), group: attr(head, 'data-slide-group'), exact: head.includes('data-body-top')};
}

/* S1: a split item's parts never share a slide, and an item that would fit a slide whole is never split. */
export function checkSplits(slides){
  const shared = [], fitting = [];
  const parts = new Map();
  slides.forEach((s, i) => {
    const seen = new Set();
    for(const c of s.cards){
      if(c.src == null || !c.frag) continue;
      if(seen.has(c.src)) shared.push({slide: i + 1, item: c.key.slice(0, 50)});
      seen.add(c.src);
      (parts.get(c.src) || parts.set(c.src, []).get(c.src)).push({...c, slide: i});
    }
  });
  for(const [, list] of parts){
    const g = slides[list[0].slide], usable = g.bodyBottom - g.bodyTop;
    const total = list.reduce((s, p) => s + p.h, 0);
    if(total <= usable * .9) fitting.push({item: list[0].key.slice(0, 50), parts: list.length, combinedHeight: r1(total), usable: r1(usable)});
  }
  return [
    {check: 'slides:split-parts-share-slide', pass: shared.length === 0, values: {count: shared.length, hits: shared.slice(0, 20)}, note: 'S1: two cards of one source item on the same slide'},
    {check: 'slides:split-would-fit-whole', pass: fitting.length === 0, values: {count: fitting.length, hits: fitting.slice(0, 20)}, note: 'S1: a split item whose parts together are under 90% of one slide body'},
  ];
}

/* S2 and S3: slides closed while the next card would have fit, and thin last slides. */
export function checkFill(slides, {style, laneBand = 0} = {}){   // laneBand: height a new lane heading needs (Timeline), which travels with the card
  const out = [];
  const early = [];
  for(let i = 0; i + 1 < slides.length && style !== 'focus'; i++){   // Focus moves cards between its hero and rail columns, so a column test says nothing there
    const a = slides[i], b = slides[i + 1];
    if((a.group || '') !== (b.group || '') && a.group != null) continue;   // different lane run / window: not a continuation
    const first = b.cards[0];
    if(!first) continue;
    const colBottom = Math.max(a.bodyTop, ...a.cards.filter(c => Math.abs(c.x - first.x) < 2 || (c.x < first.x + first.w && c.x + c.w > first.x + 2)).map(c => style === 'board' ? c.drawnBottom : c.y + c.h));
    const free = a.bodyBottom - colBottom;
    /* S3 beats S2: moving the card back would leave the next slide thin, which balancing the last two slides exists to avoid */
    const lastOfRun = !slides[i + 2] || slides[i + 2].group !== b.group;
    const usableB = b.bodyBottom - b.bodyTop, usedAfter = (b.contentBottom - b.bodyTop) - (first.h + 8);
    if(lastOfRun && b.cards.length - 1 < 3 && usedAfter < usableB / 2) continue;
    /* Timeline: a lane of three rows or fewer moves as one unit (F5), so the unit is the lane's leading rows */
    if(laneBand && String(first.key).split('|')[0] !== String(a.cards.at(-1)?.key).split('|')[0]) continue;   // F5 prefers a lane boundary to a fuller slide
    let unit = style === 'board' ? first.drawnBottom - first.y : first.h;
    /* Board: a column split evenly across slides, or left with under two cards on the next, was balanced (S3) */
    if(style === 'board'){ const same = b.cards.filter(x => Math.abs(x.x - first.x) < 2).length, here = a.cards.filter(x => Math.abs(x.x - first.x) < 2).length; if(same - 1 < 2 || same <= here) continue; }   // or the column is split evenly (3 + 3): a balanced tail beats a fuller first slide
    /* Register by outcome: the card travels with its group heading */
    if(style === 'register'){ const head = b.texts.filter(t => t.y < first.y && t.y > first.y - 90 && t.x <= first.x + 6).sort((p, q) => q.y - p.y)[0]; if(head) unit = first.y + first.h - (head.y - head.size); }
    if(laneBand){ const lane = String(first.key).split('|')[0]; const lead = []; for(const x of b.cards){ if(String(x.key).split('|')[0] !== lane) break; lead.push(x); } if(lead.length <= 3) unit = lead.reduce((n, x) => n + x.h, 0); }
    /* Board: the layout keeps one card gap above a card and one below it, so "would have fit" needs both. A flat 12 was
       stricter than the layout and misfired on other fonts (CI: card 185, room 202, gap 16). The gap is read from the column. */
    let pad = 12;
    if(style === 'board'){
      const gaps = [a, b].flatMap(s => { const col = s.cards.filter(x => Math.abs(x.x - first.x) < 2).sort((p, q) => p.y - q.y); return col.slice(1).map((x, n) => x.y - (col[n].y + col[n].h)); }).filter(g => g > 0);
      if(gaps.length) pad = 2 * Math.min(...gaps);
    }
    if(unit + pad + laneBand + (style === 'register' ? 90 : 0) <= free) early.push({slide: i + 1, next: first.key.slice(0, 40), cardHeight: r1(first.h), freeBelowColumn: r1(free)});
  }
  out.push({check: 'slides:closed-early', pass: early.length === 0, values: {count: early.length, hits: early.slice(0, 20)}, note: 'S2: a slide closed with room under its column for the first card of the next slide'});
  const thin = [];
  /* S3 (round 2: ANY slide of a multi-slide set, not only the last) fewer than 3 cards and under a third of the usable height */
  if(slides.length > 1) slides.forEach((s, i) => {
    const usable = s.bodyBottom - s.bodyTop, used = s.contentBottom - s.bodyTop;
    if(s.texts.some(t => t.text.trim() === 'Changed work')) return;   // a comparison's dropped-work slide is its own page, not a leftover
    if(style === 'focus' && !/\(continued\)/.test(footerLeft(s))) return;   // a Focus slide is a whole horizon; only a continued one can be an orphan
    if(s.cards.length < 3 && used < usable / 2 - 0.5) thin.push({slide: i + 1, cards: s.cards.length, fill: r1(used / usable)});
  });
  out.push({check: 'slides:orphans', pass: thin.length === 0, values: {count: thin.length, hits: thin}, note: 'S3 (round 2): no slide of a multi-slide set has fewer than 3 cards and less than half the usable height'});
  return out;
}

/* S4: one scale per set, in range, no small text. */
export function checkScale(slides, {slidePx = 1920} = {}){
  const scales = [...new Set(slides.map(s => s.scale))];
  const small = [];
  slides.forEach((s, i) => { for(const t of s.texts) if(t.size && t.size * (slidePx / s.vbW) < 15.99) small.push({slide: i + 1, text: t.text.slice(0, 30), px: r1(t.size * slidePx / s.vbW)}); });
  const out = [{check: 'slides:text-size-floor', pass: small.length === 0, values: {count: small.length, hits: small.slice(0, 15)}, note: 'S4: no text under 16px on a 1920x1080 slide'}];
  const known = slides.every(s => s.scale != null);
  out.push({check: 'slides:one-scale', pass: known && scales.length === 1 && scales[0] >= .88 - 1e-9 && scales[0] <= 1.35 + 1e-9,
    values: {scales, known}, note: 'S4: every slide of a set carries the same data-scale, in 0.88 to 1.35'});
  return out;
}

/* S5: furniture at the same place on every slide. strings: texts that are furniture (title, horizon names). */
export function checkFurniture(slides, {furniture = [], windowKey = s => s.cards.length ? '' : ''} = {}){
  const moved = [];
  const first = new Map();
  const names = new Set(furniture.map(f => String(f).trim()).filter(Boolean));
  slides.forEach((s, i) => {
    for(const t of s.texts){
      const isFooter = /^(Page )?\d+ of \d+$/.test(t.text);
      if(!names.has(t.text.trim()) && !isFooter) continue;
      const k = isFooter ? 'footer-right' : t.text.trim();
      const pos = [r1(t.y), t.size, null];   // the page number's x depends on whether the slide has a rail: slides:page-number-edge covers it
      if(!first.has(k)) first.set(k, {pos, slide: i + 1});
      else { const f = first.get(k); if(f.pos[0] !== pos[0] || f.pos[1] !== pos[1] || f.pos[2] !== pos[2]) moved.push({text: k.slice(0, 40), slide: i + 1, vs: f.slide, y: [f.pos[0], pos[0]], size: [f.pos[1], pos[1]]}); }
    }
  });
  return [{check: 'slides:furniture-stable', pass: moved.length === 0, values: {count: moved.length, hits: moved.slice(0, 20)}, note: 'S5: title, column headers and footer sit at the same y and size on every slide of the set'}];
}

/* S6 */
export function checkWording(slides){
  const bad = [];
  slides.forEach((s, i) => { for(const t of s.texts) if(FURNITURE_FORBIDDEN.test(t.text)) bad.push({slide: i + 1, text: t.text.slice(0, 60)}); });
  return [{check: 'slides:plain-words', pass: bad.length === 0, values: {count: bad.length, hits: bad.slice(0, 20)}, note: 'S6: no "Theme group", "Item part", "R01", "Featured horizon", "Supporting horizons", "Page n of m"'}];
}

/* footer left text of a slide: the lowest-left text that is not "k of n" */
const footerLeft = s => s.texts.filter(t => t.y >= s.vbH - 60 && t.anchor !== 'end' && !/^\d+ of \d+$/.test(t.text)).map(t => t.text).join(' ');
const laneOf = c => String(c.key).split('|')[0];

/* F2: "continued" is attached to the name it belongs to, and only where that name began on an earlier slide */
export function checkContinued(slides){
  const bad = [];
  slides.forEach((s, i) => {
    const f = footerLeft(s);
    if(/, continued\b|^Continued\b/.test(f)) bad.push({slide: i + 1, footer: f, problem: 'continued is not attached to a name'});
    for(const token of f.split(/ · |, | and /)){
      const m = /^(.*?) \(continued\)$/.exec(token.trim());
      if(!m) continue;
      const name = m[1].trim();
      if(!slides.slice(0, i).some(p => footerLeft(p).includes(name))) bad.push({slide: i + 1, footer: f, problem: name + ' did not appear on an earlier slide'});
    }
  });
  return [{check: 'slides:continued-honest', pass: bad.length === 0, values: {count: bad.length, hits: bad.slice(0, 10)}, note: 'F2: "continued" only for a name that began on an earlier slide, written "Name (continued)"'}];
}

/* F4a/F4b: lanes keep plan order; up to five horizons stay on one slide */
export function checkGridPlan(slides, {lanes = [], horizons = []}){
  const out = [];
  const order = [];
  const sig = s => horizons.filter(h => s.texts.some(t => t.text.trim() === h)).join('|');
  let runSig = null, highest = -1;
  slides.forEach((s, i) => {
    const seq = s.texts.filter(t => lanes.includes(t.text.trim()) && t.x < s.vbW * .3).sort((a, b) => a.y - b.y).map(t => lanes.indexOf(t.text.trim()));
    if(sig(s) !== runSig){ runSig = sig(s); highest = -1; }
    for(const n of seq){ if(n < highest) order.push({slide: i + 1, lane: lanes[n], after: lanes[highest]}); highest = Math.max(highest, n); }
  });
  out.push({check: 'slides:lane-order', pass: order.length === 0, values: {count: order.length, hits: order.slice(0, 8)}, note: 'F4a: lanes appear in plan order on every slide and across the slides of one time window'});
  const split = [];
  if(horizons.length > 1 && horizons.length <= 5) slides.forEach((s, i) => { const have = horizons.filter(h => s.texts.some(t => t.text.trim() === h)); if(have.length !== horizons.length) split.push({slide: i + 1, shows: have.length, of: horizons.length}); });
  out.push({check: 'slides:columns-whole', pass: split.length === 0, values: {count: split.length, hits: split.slice(0, 8)}, note: 'F4b: a plan of up to five horizons shows every horizon on every slide'});
  return out;
}

/* F3: board columns flow independently: a column is never empty on a slide while it has cards on a later one */
export function checkBoardFlow(slides, {horizons = []}){
  const bad = [];
  const columns = s => horizons.map(h => s.texts.find(t => t.text.trim() === h && t.size >= 24)).filter(Boolean).sort((a, b) => a.x - b.x);
  const counts = slides.map(s => {
    const cols = columns(s), n = new Map();
    for(const c of s.cards){ let idx = -1; cols.forEach((h, k) => { if(c.x >= h.x - 14) idx = k; }); if(idx >= 0) n.set(cols[idx].text.trim(), (n.get(cols[idx].text.trim()) || 0) + 1); }
    return n;
  });
  slides.forEach((s, i) => { for(const h of horizons){ if(!columns(s).some(t => t.text.trim() === h)) continue; if(!(counts[i].get(h) > 0) && counts.slice(i + 1).some(n => n.get(h) > 0)) bad.push({slide: i + 1, column: h}); } });
  return [{check: 'slides:board-flow', pass: bad.length === 0, values: {count: bad.length, hits: bad.slice(0, 8)}, note: 'F3: slide k shows the k-th page of every column; no column is empty while it has cards on a later slide'}];
}

/* H1: "2 of 3" ends at the right content edge of its slide: never left of the rightmost card, which on a slide with no rail is the edge the rules end on. */
export function checkPageNumber(slides, svgs = []){
  const bad = [];
  slides.forEach((s, i) => {
    const n = s.texts.find(t => t.anchor === 'end' && /^\d+ of \d+$/.test(t.text));
    if(!n || !s.cards.length) return;
    // a slide with a rail (a full-height panel to the right of x = 400) puts its number left of the rail by design
    if([...(svgs[i] || '').matchAll(/<rect\b([^>]*)>/g)].some(m => num(m[1], 'x', 0) > 400 && num(m[1], 'y', 1) === 0 && num(m[1], 'height', 0) >= s.vbH - 1)) return;
    const right = Math.max(...s.cards.map(c => c.x + c.w));
    if(right - n.x > 6) bad.push({slide: i + 1, numberEdge: r1(n.x), contentEdge: r1(right)});
  });
  return [{check: 'slides:page-number-edge', pass: bad.length === 0, values: {count: bad.length, hits: bad.slice(0, 8)}, note: 'H1: the page number is right-aligned to the content edge of its slide'}];
}

/* F5/F6/F7 on Timeline slides */
export function checkTimelineSlides(slides, svgs, {style} = {}){
  const out = [];
  const lanes = new Map();
  slides.forEach((s, i) => { for(const c of s.cards){ const k = laneOf(c); (lanes.get(k) || lanes.set(k, new Map()).get(k)).set(i, (lanes.get(k).get(i) || 0) + 1); } });
  const bad = [];
  for(const [lane, per] of lanes){ const at = [...per.keys()].sort((a, b) => a - b); if(at.length > 1) at.forEach((i, n) => { if(per.get(i) < 2) bad.push({lane, slide: i + 1, rows: per.get(i)}); }); }
  out.push({check: 'slides:lane-split', pass: style === 'decisions' || bad.length === 0, values: {count: bad.length, hits: bad.slice(0, 8)}, note: 'F5: a lane split across slides leaves at least two rows on each side'});
  if(style === 'register'){
    const off = [];
    slides.forEach((s, i) => {
      const head = s.texts.find(t => t.text === 'P50');
      if(!head) return;
      const labels = s.texts.filter(t => t.weight === '500' && t.x < head.x);
      for(const d of s.texts.filter(t => t.x === head.x && t.y > head.y && /^\d{1,2} [A-Z][a-z]{2} \d{4}$/.test(t.text))){
        const near = labels.filter(l => Math.abs(l.y - d.y) < 30).sort((a, b) => Math.abs(a.y - d.y) - Math.abs(b.y - d.y))[0];
        if(near && Math.abs(near.y - d.y) > 1) off.push({slide: i + 1, date: d.text, dateBaseline: r1(d.y), titleBaseline: r1(near.y)});
      }
    });
    out.push({check: 'slides:register-baseline', pass: off.length === 0, values: {count: off.length, hits: off.slice(0, 8)}, note: 'H2: a register date shares the milestone title baseline'});
  }
  const wrapped = [];
  slides.forEach((s, i) => { const ts = s.texts; for(let k = 0; k + 1 < ts.length; k++) if(/^\d{1,2}$/.test(ts[k].text) && /^[A-Z][a-z]{2} \d{4}$/.test(ts[k + 1].text) && Math.abs(ts[k].x - ts[k + 1].x) < 1 && ts[k + 1].y > ts[k].y && ts[k + 1].y - ts[k].y < ts[k].size * 1.6) wrapped.push({slide: i + 1, date: ts[k].text + ' ' + ts[k + 1].text}); });
  out.push({check: 'slides:date-never-wraps', pass: wrapped.length === 0, values: {count: wrapped.length, hits: wrapped.slice(0, 8)}, note: 'F6: a date in a P50/P90 column is one line'});
  const legend = [];
  svgs.forEach((svg, i) => {
    const text = [...svg.matchAll(/<text\b[^>]*>([^<]*)<\/text>/g)].map(m => m[1]).join(' | ');
    if(/data-ms="lrm"/.test(svg) && !/Decide by/.test(text.split('P50 finish')[1] || '')) legend.push({slide: i + 1, missing: 'Decide by'});
    if(/data-field-history=/.test(svg) && !/Previous/.test(text)) legend.push({slide: i + 1, missing: 'Previous forecast'});
  });
  out.push({check: 'slides:legend-marks', pass: legend.length === 0, values: {count: legend.length, hits: legend.slice(0, 8)}, note: 'F7: the legend names every mark drawn on the slide'});
  return out;
}

export function checkSlideSet(svgs, opts = {}){
  const slides = svgs.map(slideGeometry);
  const out = [...checkSplits(slides), ...checkFill(slides, opts), ...checkScale(slides), ...checkFurniture(slides, opts), ...checkWording(slides), ...checkContinued(slides), ...checkPageNumber(slides, svgs)];
  if(opts.tool === 'timeline') out.push(...checkTimelineSlides(slides, svgs, opts));
  if(opts.tool === 'roadmap' && opts.style === 'grid') out.push(...checkGridPlan(slides, opts));
  if(opts.tool === 'roadmap' && opts.style === 'board') out.push(...checkBoardFlow(slides, opts), ...checkGridPlan(slides, {horizons: opts.horizons, lanes: []}).filter(c => c.check === 'slides:columns-whole'));
  return out;
}

/* P3: the PNG is the SVG at 2x; only when 2x would pass the canvas limit may the scale drop (floor 1x). */
export const CANVAS_PIXELS = 16_777_216;
export function checkPngScale(stats, svgW, svgH){
  const sx = stats.w / svgW, sy = stats.h / svgH;
  const at2x = svgW * 2 * svgH * 2;
  const same = Math.abs(sx - sy) < .02;
  const full = Math.abs(sx - 2) < .01 && at2x <= CANVAS_PIXELS;
  const reduced = sx >= .99 && sx < 2 && at2x > CANVAS_PIXELS && stats.w * stats.h <= CANVAS_PIXELS + svgW + svgH + 1 && stats.w * stats.h >= CANVAS_PIXELS * .9;
  const oneX = Math.abs(sx - 1) < .01 && svgW * svgH * 4 > CANVAS_PIXELS;
  return {check: 'png:scale-vs-svg', pass: same && (full || reduced || oneX), values: {scaleX: Math.round(sx * 100) / 100, scaleY: Math.round(sy * 100) / 100, pixels: stats.w * stats.h, at2x},
    note: 'P3: 2x unless 2x would exceed the 16,777,216-pixel canvas, then the largest scale that fits (not below 1x)'};
}

/* ------------------------------------------------------------------ moved from the audit: SVG-level checks */
const round = (n, p = 2) => Math.round(n * 10 ** p) / 10 ** p;
const r2 = n => round(n, 2);
const normText = s => String(s ?? '').replace(/[\u00a0\u202f]/g, ' ').replace(/\s+/g, ' ').trim();

/* Geometry + computed paint for every text and shape of an SVG. svgString=null measures
   the document the page is showing (a standalone .svg file); otherwise the string is
   injected inline into the app page so the site's fonts apply. */
export async function measureSvgInPage(svgString){
  let root, holder = null;
  if(svgString){
    holder = document.createElement('div');
    holder.style.cssText = 'position:absolute;left:0;top:0;';
    holder.innerHTML = svgString;
    document.body.appendChild(holder);
    root = holder.querySelector('svg');
  } else root = document.documentElement;
  try{ await document.fonts.ready; }catch(_){}
  await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
  const rootCTM = root.getScreenCTM();
  const inv = rootCTM.inverse();
  const vb = root.viewBox.baseVal;
  const toRoot = (el, x, y) => { const m = inv.multiply(el.getScreenCTM()); const p = new DOMPoint(x, y).matrixTransform(m); return [p.x, p.y]; };
  const boxOf = (el, x0, y0, x1, y1) => {
    const pts = [toRoot(el, x0, y0), toRoot(el, x1, y0), toRoot(el, x0, y1), toRoot(el, x1, y1)];
    return [Math.min(...pts.map(p => p[0])), Math.min(...pts.map(p => p[1])), Math.max(...pts.map(p => p[0])), Math.max(...pts.map(p => p[1]))];
  };
  const parse = c => {
    if(!c || c === 'none') return null;
    const m = c.match(/rgba?\(([^)]+)\)/);
    if(!m) return null;
    const p = m[1].split(/[\s,/]+/).filter(Boolean).map(Number);
    return [p[0], p[1], p[2], p.length > 3 ? p[3] : 1];
  };
  const skip = el => el.closest('defs,clipPath,mask,pattern,symbol,style,title,desc,metadata');
  let order = 0;
  const all = [...root.querySelectorAll('*')];
  all.forEach(el => { el.__o = order++; });
  const cards = [...root.querySelectorAll('[data-key]')];   // one per card (fragments of one item share a key but not an element)
  const cumOpacity = el => { let o = 1; for(let n = el; n && n.nodeType === 1; n = n.parentNode){ const v = parseFloat(getComputedStyle(n).opacity); if(!Number.isNaN(v)) o *= v; if(n === root) break; } return o; };
  const cvs = document.createElementNS('http://www.w3.org/1999/xhtml', 'canvas').getContext('2d');
  const texts = [], shapes = [];
  for(const el of all){
    const tag = el.localName;
    if(skip(el) || tag === 'svg' || tag === 'g' || tag === 'a' || tag === 'tspan') continue;
    const cs = getComputedStyle(el);
    if(cs.display === 'none') continue;
    if(tag === 'text'){
      const text = el.textContent;
      if(!el.getNumberOfChars()) continue;
      const bb = el.getBBox();
      const base = el.getStartPositionOfChar(0).y;
      cvs.font = `${cs.fontStyle} ${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
      const m = cvs.measureText(text);
      const asc = m.actualBoundingBoxAscent || parseFloat(cs.fontSize) * .75, desc = m.actualBoundingBoxDescent || 0;
      const box = boxOf(el, bb.x, base - asc, bb.x + bb.width, base + desc);
      const adv = boxOf(el, bb.x, bb.y, bb.x + bb.width, bb.y + bb.height);
      const fill = parse(cs.fill);
      const clipHost = el.closest('[clip-path]');
      let clip = null;
      if(clipHost){
        const id = (clipHost.getAttribute('clip-path').match(/#([^)'"]+)/) || [])[1];
        const cp = id && root.querySelector('#' + CSS.escape(id));
        const r = cp && cp.querySelector('rect');
        if(r) clip = boxOf(clipHost, +r.getAttribute('x') || 0, +r.getAttribute('y') || 0, (+r.getAttribute('x') || 0) + +r.getAttribute('width'), (+r.getAttribute('y') || 0) + +r.getAttribute('height'));
      }
      const baseRoot = toRoot(el, bb.x, base)[1];
      texts.push({i: texts.length, text, ink: box, adv, base: baseRoot, size: parseFloat(cs.fontSize), weight: cs.fontWeight, family: cs.fontFamily,
        fill, fillOpacity: parseFloat(cs.fillOpacity), opacity: cumOpacity(el), len: el.getComputedTextLength(),
        anchor: cs.textAnchor, key: el.closest('[data-key]')?.getAttribute('data-key') ?? null, cardId: cards.indexOf(el.closest('[data-key]')), clip, order: el.__o,
        decoration: cs.textDecorationLine, rtl: /[֐-ࣿ]/.test(text)});
      continue;
    }
    if(!['rect', 'circle', 'ellipse', 'path', 'line', 'polygon', 'polyline'].includes(tag)) continue;
    let bb; try{ bb = el.getBBox(); }catch(_){ continue; }
    const sw = parseFloat(cs.strokeWidth) || 0, stroke = parse(cs.stroke), fill = parse(cs.fill);
    const pad = stroke ? sw / 2 : 0;
    const box = boxOf(el, bb.x - pad, bb.y - pad, bb.x + bb.width + pad, bb.y + bb.height + pad);
    const rec = {i: shapes.length, tag, box, fill, fillOpacity: parseFloat(cs.fillOpacity), stroke, strokeOpacity: parseFloat(cs.strokeOpacity), sw,
      opacity: cumOpacity(el), order: el.__o, dash: cs.strokeDasharray !== 'none' ? cs.strokeDasharray : null,
      inCard: el.parentNode?.getAttribute?.('data-key') ?? null, cardId: cards.indexOf(el.parentNode), cardRect: false};
    if(tag === 'line'){
      const a = toRoot(el, +el.getAttribute('x1'), +el.getAttribute('y1')), b = toRoot(el, +el.getAttribute('x2'), +el.getAttribute('y2'));
      rec.line = [a[0], a[1], b[0], b[1]];
    }
    if(tag === 'rect' && el.parentNode?.getAttribute?.('data-key') && el.parentNode.querySelector('rect') === el) rec.cardRect = true;
    shapes.push(rec);
  }
  const fonts = [...document.fonts].map(f => ({family: f.family.replace(/["']/g, ''), status: f.status, range: f.unicodeRange}));
  const out = {viewBox: [vb.x, vb.y, vb.width, vb.height], attrW: root.getAttribute('width'), attrH: root.getAttribute('height'),
    texts, shapes, fonts, title: root.querySelector('title')?.textContent ?? null, desc: root.querySelector('desc')?.textContent ?? null,
    keys: [...root.querySelectorAll('[data-key]')].map(g => g.getAttribute('data-key'))};
  if(holder) holder.remove();
  return out;
}

const lum = ([r, g, b]) => { const f = c => { c /= 255; return c <= .03928 ? c / 12.92 : ((c + .055) / 1.055) ** 2.4; }; return .2126 * f(r) + .7152 * f(g) + .0722 * f(b); };
export const contrast = (a, b) => { const la = lum(a), lb = lum(b); return (Math.max(la, lb) + .05) / (Math.min(la, lb) + .05); };
const over = (fg, bg) => { const a = fg[3]; return [0, 1, 2].map(i => fg[i] * a + bg[i] * (1 - a)); };
const inter = (a, b) => ({w: Math.min(a[2], b[2]) - Math.max(a[0], b[0]), h: Math.min(a[3], b[3]) - Math.max(a[1], b[1])});
const area = b => Math.max(0, b[2] - b[0]) * Math.max(0, b[3] - b[1]);

const GENERIC = new Set(['serif', 'sans-serif', 'monospace', 'cursive', 'fantasy', 'system-ui', 'ui-sans-serif', 'ui-serif', 'ui-monospace', 'emoji', 'math', 'fangsong']);

export function checkSelfContained(svg, geo){
  const out = [];
  const external = [], links = [], inlineFonts = [];
  for(const m of svg.matchAll(/<a\b[^>]*\bhref="([^"]*)"/g)) links.push(m[1]);
  for(const m of svg.matchAll(/\b(?:xlink:)?href="([^"]*)"/g)){
    const v = m[1];
    if(v.startsWith('#') || v.startsWith('data:') || links.includes(v)) continue;
    external.push({kind: 'href', value: v.slice(0, 120)});
  }
  for(const m of svg.matchAll(/url\(\s*['"]?([^'")]+)['"]?\s*\)/g)){
    const v = m[1];
    if(v.startsWith('#') || v.startsWith('data:')) continue;
    external.push({kind: 'url()', value: v.slice(0, 120)});
  }
  if(/@import/.test(svg)) external.push({kind: '@import'});
  for(const tag of ['image', 'foreignObject', 'script', 'iframe', 'use']) if(new RegExp('<' + tag + '\\b').test(svg)) external.push({kind: '<' + tag + '> present'});
  const faceBlocks = [...svg.matchAll(/@font-face\{[^}]*\}/g)].map(m => m[0]);
  const embedded = new Set();
  for(const b of faceBlocks){
    const fam = (b.match(/font-family:\s*['"]?([^;'"]+)['"]?/) || [])[1];
    const dataSrc = /src:\s*url\(\s*['"]?data:/.test(b);
    if(fam){ if(dataSrc) embedded.add(fam.trim()); else external.push({kind: 'font-face src not data:', value: fam}); }
    inlineFonts.push({family: fam, data: dataSrc});
  }
  out.push({check: 'self-contained:external-refs', pass: external.length === 0, values: {external, count: external.length}, note: 'any href/url()/@import/image/foreignObject/script not data: or in-document'});
  out.push({check: 'self-contained:user-links', pass: null, values: {links: links.slice(0, 20), count: links.length}, note: 'item links the author wrote (-> url); informational'});
  const used = new Map();
  for(const t of geo.texts){
    const fams = t.family.split(',').map(s => s.trim().replace(/^["']|["']$/g, ''));
    const k = fams.join(' | ');
    used.set(k, (used.get(k) || 0) + 1);
  }
  const familyIssues = [];
  for(const [k] of used){
    const fams = k.split(' | ');
    if(!fams.some(f => embedded.has(f)) && !fams.every(f => GENERIC.has(f))) familyIssues.push({stack: k, problem: 'primary family not embedded'});
    if(!fams.some(f => GENERIC.has(f))) familyIssues.push({stack: k, problem: 'no generic fallback in the stack'});
  }
  out.push({check: 'self-contained:font-families', pass: !familyIssues.some(i => i.problem === 'primary family not embedded'), values: {embedded: [...embedded], stacksUsed: Object.fromEntries(used), issues: familyIssues, fontFaceBlocks: faceBlocks.length}, note: 'embedded = @font-face with data: src'});
  out.push({check: 'self-contained:generic-fallback', pass: !familyIssues.some(i => i.problem === 'no generic fallback in the stack'), values: {stacks: [...used.keys()]}, note: 'a font-family stack with no generic fallback falls to the viewer default if a glyph or face is missing'});
  const statuses = geo.fonts.map(f => `${f.family}:${f.status}`);
  const failed = geo.fonts.filter(f => f.status === 'error');
  out.push({check: 'self-contained:font-load', pass: failed.length === 0, values: {faces: statuses.length, failed: failed.map(f => f.family), statuses: [...new Set(statuses)]}, note: 'FontFace status when the SVG is opened alone'});
  /* glyphs outside the embedded unicode ranges fall back to the viewer's system fonts */
  const ranges = [];
  for(const b of faceBlocks){ const m = b.match(/unicode-range:\s*([^;]+);/); if(m) for(const part of m[1].split(',')){ const [a, z] = part.trim().replace(/^U\+/i, '').split('-'); ranges.push([parseInt(a, 16), parseInt(z || a, 16)]); } }
  const outside = new Map();
  if(ranges.length) for(const t of geo.texts) for(const ch of t.text){
    const cp = ch.codePointAt(0);
    if(cp === 0x20 || cp === 0xa0) continue;
    if(!ranges.some(([a, z]) => cp >= a && cp <= z)) outside.set(ch, (outside.get(ch) || 0) + 1);
  }
  out.push({check: 'self-contained:glyph-coverage', pass: outside.size === 0, values: {charsOutsideEmbeddedFonts: outside.size, examples: [...outside.keys()].slice(0, 40).join(''), textsAffected: geo.texts.filter(t => [...t.text].some(ch => outside.has(ch))).length}, note: 'characters not covered by the embedded Latin/Latin-ext faces render in whatever system font the viewer has (CJK, RTL, emoji, some symbols)'});
  return out;
}

export function checkWidthParity(standalone, inApp){
  const diffs = [];
  const n = Math.min(standalone.texts.length, inApp.texts.length);
  for(let i = 0; i < n; i++){
    const a = standalone.texts[i], b = inApp.texts[i];
    if(a.text !== b.text){ diffs.push({i, problem: 'text order mismatch', a: a.text.slice(0, 40), b: b.text.slice(0, 40)}); continue; }
    const d = Math.abs(a.len - b.len);
    if(d > 1) diffs.push({i, text: a.text.slice(0, 60), standalone: r2(a.len), inApp: r2(b.len), delta: r2(d)});
  }
  return {check: 'self-contained:text-width-parity', pass: diffs.length === 0 && standalone.texts.length === inApp.texts.length,
    values: {compared: n, standaloneTexts: standalone.texts.length, inAppTexts: inApp.texts.length, differing: diffs.length, worst: diffs.sort((x, y) => (y.delta || 0) - (x.delta || 0)).slice(0, 8)},
    note: 'text advance width opened alone (embedded fonts) vs injected into the app page (site fonts); >1px means a font fell back'};
}

export function checkGeometry(geo, svgString){
  const out = [];
  const [vx, vy, vw, vh] = geo.viewBox, vbox = [vx, vy, vx + vw, vy + vh];
  const texts = geo.texts.filter(t => t.opacity > 0.01);
  const rects = geo.shapes.filter(s => s.tag === 'rect' && area(s.box) < area(vbox) * .9);
  /* clipped / outside */
  const clipped = [];
  for(const t of texts){
    const [x0, y0, x1, y1] = t.ink;
    const ov = {left: vbox[0] - x0, top: vbox[1] - y0, right: x1 - vbox[2], bottom: y1 - vbox[3]};
    const worst = Math.max(...Object.values(ov));
    if(worst > 0.5) clipped.push({rule: 'outside-viewBox', text: t.text.slice(0, 60), overflow: {left: r2(ov.left), top: r2(ov.top), right: r2(ov.right), bottom: r2(ov.bottom)}, worst: r2(worst)});
    if(t.clip){
      const c = t.clip, o = Math.max(c[0] - x0, c[1] - y0, x1 - c[2], y1 - c[3]);
      if(o > 0.5) clipped.push({rule: 'outside-clip-path', text: t.text.slice(0, 60), worst: r2(o)});
    }
    /* container: the card rect of its group, else the smallest rect whose bounds hold the text's centre */
    /* the point that says which box the text belongs to: its anchor (start/middle/end), at mid-height */
    const cy = (y0 + y1) / 2, cx = t.anchor === 'end' ? x1 - 1 : t.anchor === 'middle' ? (x0 + x1) / 2 : x0 + 1;
    let container = null;
    if(t.key !== null) container = geo.shapes.find(s => s.cardRect && s.cardId === t.cardId && s.order < t.order) || null;
    if(!container){
      let best = null;
      for(const s of rects) if(s.order < t.order && s.box[0] <= cx && s.box[2] >= cx && s.box[1] <= cy && s.box[3] >= cy && (s.fill && s.fill[3] > 0.02 || s.stroke)){
        if(!best || area(s.box) < area(best.box)) best = s;
      }
      container = best;
    }
    if(container){
      const b = container.box, o = {left: b[0] - x0, top: b[1] - y0, right: x1 - b[2], bottom: y1 - b[3]};
      const w = Math.max(...Object.values(o));
      if(w > 1) clipped.push({rule: 'outside-container-rect', text: t.text.slice(0, 60), container: b.map(r1), ink: t.ink.map(r1), worst: r2(w)});
    }
  }
  out.push({check: 'clipped-text', pass: clipped.length === 0, values: {count: clipped.length, byRule: clipped.reduce((m, c) => (m[c.rule] = (m[c.rule] || 0) + 1, m), {}), hits: clipped.sort((a, b) => b.worst - a.worst).slice(0, 25)},
    note: 'ink box (canvas ascent/descent over advance width) beyond viewBox (>0.5px), clip-path (>0.5px) or its card/containing rect (>1px)'});
  /* orphans: the last line of a wrapped block is a single short word */
  const orphans = [];
  const byX = new Map();
  for(const t of texts){ const k = Math.round(t.ink[0]) + '|' + t.size + '|' + t.weight; (byX.get(k) || byX.set(k, []).get(k)).push(t); }
  for(const list of byX.values()){
    list.sort((a, b) => a.base - b.base);
    for(let i = 1; i < list.length; i++){
      const prev = list[i - 1], cur = list[i], step = cur.base - prev.base;
      const last = !list[i + 1] || list[i + 1].base - cur.base > step * 1.4;
      if(step > cur.size * 1.05 && step < cur.size * 1.6 && last && !/\s/.test(cur.text.trim()) && cur.text.trim().length <= 12 && prev.text.trim().split(/\s+/).length >= 4)
        orphans.push({orphan: cur.text.trim(), after: prev.text.trim().slice(-50)});
    }
  }
  out.push({check: 'orphans', pass: null, values: {count: orphans.length, hits: orphans.slice(0, 15)}, note: 'wrapped blocks (same x, size, weight, line step 1.05-1.6x) whose last line is a single word of <=12 chars after a line of 4+ words; informational'});
  /* overlap text/text */
  const over2 = [];
  for(let i = 0; i < texts.length; i++) for(let j = i + 1; j < texts.length; j++){
    const a = texts[i], b = texts[j], q = inter(a.ink, b.ink);
    if(q.w > 2 && q.h > 2) over2.push({a: a.text.slice(0, 40), b: b.text.slice(0, 40), w: r2(q.w), h: r2(q.h), at: [r2(Math.max(a.ink[0], b.ink[0])), r2(Math.max(a.ink[1], b.ink[1]))]});
  }
  out.push({check: 'overlap:text-text', pass: over2.length === 0, values: {count: over2.length, hits: over2.sort((a, b) => b.w * b.h - a.w * a.h).slice(0, 25)}, note: 'ink boxes intersecting by >2px in both dimensions'});
  /* text vs shape: partial overlap with a visible non-background shape that does not wholly contain the text */
  const crossings = [];
  const visible = geo.shapes.filter(s => area(s.box) < area(vbox) * .5 && s.opacity > .05 && ((s.fill && s.fill[3] * s.fillOpacity > .08) || (s.stroke && s.sw > 0 && s.strokeOpacity > .05)));
  for(const t of texts){
    for(const s of visible){
      if(s.line){
        const [x1, y1, x2, y2] = s.line, [a0, b0, a1, b1] = t.ink, m = 1;
        /* a rule painted before an opaque rect that holds the crossing is hidden by it (a column rule behind a spanning card) */
        const covered = geo.shapes.some(r => r.tag === 'rect' && r.order > s.order && r.order < t.order && r.fill && r.fill[3] * (r.fillOpacity || 1) >= .95 && r.opacity >= .95 && r.box[0] <= Math.min(x1, x2) + .5 && r.box[2] >= Math.max(x1, x2) - .5 && r.box[1] <= Math.max(b0, Math.min(y1, y2)) + .5 && r.box[3] >= Math.min(b1, Math.max(y1, y2)) - .5);
        if(covered) continue;
        if(Math.abs(x1 - x2) < .5 && x1 > a0 + m && x1 < a1 - m && Math.min(y1, y2) < b1 - 2 && Math.max(y1, y2) > b0 + 2 && inter([x1, Math.min(y1, y2), x1, Math.max(y1, y2)], [a0, b0, a1, b1]).h > 2)
          crossings.push({text: t.text.slice(0, 40), shape: 'vertical line', x: r2(x1), dash: !!s.dash, order: s.order < t.order ? 'under text' : 'over text'});
        else if(Math.abs(y1 - y2) < .5 && y1 > b0 + m && y1 < b1 - m && Math.min(x1, x2) < a1 - 2 && Math.max(x1, x2) > a0 + 2 && inter([Math.min(x1, x2), y1, Math.max(x1, x2), y1], [a0, b0, a1, b1]).w > 2)
          crossings.push({text: t.text.slice(0, 40), shape: 'horizontal line', y: r2(y1), dash: !!s.dash, order: s.order < t.order ? 'under text' : 'over text'});
        continue;
      }
      const q = inter(t.ink, s.box);
      if(q.w > 2 && q.h > 2){
        const inside = t.ink[0] >= s.box[0] - 1 && t.ink[2] <= s.box[2] + 1 && t.ink[1] >= s.box[1] - 1 && t.ink[3] <= s.box[3] + 1;
        const swallowed = s.box[0] >= t.ink[0] - 1 && s.box[2] <= t.ink[2] + 1 && s.box[1] >= t.ink[1] - 1 && s.box[3] <= t.ink[3] + 1;
        if(!inside && !swallowed && !s.cardRect) crossings.push({text: t.text.slice(0, 40), shape: s.tag, box: s.box.map(r1), overlap: [r2(q.w), r2(q.h)], order: s.order < t.order ? 'under text' : 'over text'});
      }
    }
  }
  out.push({check: 'overlap:text-shape', pass: crossings.length === 0, values: {count: crossings.length, hits: crossings.slice(0, 25)}, note: 'text partly on/over a visible shape that does not wholly contain it (rect/circle/path) or crossed by a vertical/horizontal rule (>2px, not at its edge)'});
  /* truncation */
  const trunc = texts.filter(t => /(…|\.\.\.)\s*$/.test(t.text));
  const attrValues = [...svgString.matchAll(/="([^"]{4,})"/g)].map(m => normText(m[1]));
  const allText = geo.texts.map(t => normText(t.text));
  const rec = trunc.map(t => {
    const stem = normText(t.text).replace(/(…|\.\.\.)\s*$/, '').trim();
    const found = allText.some(x => x !== normText(t.text) && x.startsWith(stem) && x.length > stem.length) || attrValues.some(v => v.startsWith(stem) && v.length > stem.length) || normText(geo.title || '').startsWith(stem) && normText(geo.title || '').length > stem.length;
    return {text: t.text.slice(0, 60), recoverableInExport: found};
  });
  out.push({check: 'truncation', pass: null, values: {ellipsisTexts: trunc.length, recoverable: rec.filter(r => r.recoverableInExport).length, unrecoverable: rec.filter(r => !r.recoverableInExport).length, hits: rec.slice(0, 20)}, note: 'texts ending in an ellipsis; informational, fails only when the full text is nowhere in the export (see unrecoverable)', unrecoverableFail: rec.some(r => !r.recoverableInExport)});
  /* off-canvas */
  const off = [];
  for(const s of geo.shapes){
    if(s.opacity < .01) continue;
    const full = Math.abs(s.box[0] - vbox[0]) < .6 && Math.abs(s.box[2] - vbox[2]) < .6 && Math.abs(s.box[1] - vbox[1]) < .6 && Math.abs(s.box[3] - vbox[3]) < .6;
    if(full) continue;
    const o = {left: vbox[0] - s.box[0], top: vbox[1] - s.box[1], right: s.box[2] - vbox[2], bottom: s.box[3] - vbox[3]};
    const w = Math.max(...Object.values(o));
    if(w > 0.5){
      const entirely = s.box[2] < vbox[0] || s.box[0] > vbox[2] || s.box[3] < vbox[1] || s.box[1] > vbox[3];
      off.push({tag: s.tag, box: s.box.map(r1), worst: r2(w), entirelyOutside: entirely});
    }
  }
  out.push({check: 'off-canvas:shapes', pass: off.length === 0, values: {count: off.length, hits: off.slice(0, 20)}, note: 'any shape bounding box beyond the viewBox by >0.5px (the full-canvas background rect is exempt)'});
  /* contrast and theme */
  const root = geo.shapes.filter(s => s.tag === 'rect' && area(s.box) >= area(vbox) * .9 && s.fill && s.fill[3] > .5).sort((a, b) => a.order - b.order)[0];
  const rootBg = root ? root.fill.slice(0, 3) : [255, 255, 255];
  const low = [], ratios = [];
  for(const t of texts){
    if(!t.fill) continue;
    const cx = (t.ink[0] + t.ink[2]) / 2, cy = (t.ink[1] + t.ink[3]) / 2;
    let bg = rootBg.slice();
    for(const s of geo.shapes) if(s.order < t.order && s.tag === 'rect' && s.fill && s.fill[3] * s.fillOpacity > .01 && s.box[0] <= cx && s.box[2] >= cx && s.box[1] <= cy && s.box[3] >= cy)
      bg = over([s.fill[0], s.fill[1], s.fill[2], s.fill[3] * s.fillOpacity * s.opacity], bg);
    const fg = over([t.fill[0], t.fill[1], t.fill[2], t.fill[3] * (t.fillOpacity || 1) * t.opacity], bg);
    const ratio = contrast(fg, bg);
    ratios.push(ratio);
    if(ratio < 4.5) low.push({text: t.text.slice(0, 40), ratio: r2(ratio), size: t.size, weight: t.weight, fg: fg.map(Math.round), bg: bg.map(Math.round)});
  }
  out.push({check: 'contrast', pass: low.length === 0, values: {texts: ratios.length, below4_5: low.length, min: ratios.length ? r2(Math.min(...ratios)) : null, hits: low.sort((a, b) => a.ratio - b.ratio).slice(0, 20)}, note: 'WCAG ratio of each text fill against what is painted under it (alpha and opacity composited); every text held to 4.5:1 regardless of size'});
  const rootLum = lum(rootBg);
  const panelTones = [...new Set(geo.shapes.filter(s => s.tag === 'rect' && s.fill && s.fill[3] > .5 && area(s.box) > area(vbox) * .05 && area(s.box) < area(vbox) * .9).map(s => lum(s.fill.slice(0, 3)) < .2 ? 'dark' : 'light'))];
  out.push({check: 'theme:root-background', pass: null, values: {rootBackground: rootBg.map(Math.round), luminance: r2(rootLum), tone: rootLum < .2 ? 'dark' : 'light', panelTones}, note: 'tone of the export background (compare with the theme the page was in)'});
  /* hairlines */
  const odd = {x1: 0, x2: 0, total: 0};
  for(const s of geo.shapes) if(s.line && s.stroke && s.sw > 0 && s.sw <= 1.5){
    const [x1, y1, x2, y2] = s.line;
    const pos = Math.abs(x1 - x2) < .01 ? x1 : Math.abs(y1 - y2) < .01 ? y1 : null;
    if(pos === null) continue;
    odd.total++;
    if(Math.abs(pos - Math.round(pos) - 0.5) > .02 && Math.abs(pos * 2 - Math.round(pos * 2)) > .02) odd.x2++;
    if(Math.abs((pos - Math.floor(pos)) - 0.5) > .02) odd.x1++;
  }
  out.push({check: 'hairlines', pass: null, values: {hairlines: odd.total, offPixelGridAt1x: odd.x1, offHalfPixelGridAt2x: odd.x2}, note: 'orthogonal strokes <=1.5px: 1x blurs unless the position is n+0.5; the 2x PNG is crisp when position*2 is an integer'});
  return out;
}


/* Pure-text check on saved timeline SVGs: are consecutive month ticks on the axis all present? */
export function checkAxisMonths(svg){
  const M = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const ticks = [];
  for(const m of svg.matchAll(/<text[^>]*\bx="([\d.]+)"[^>]*>(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)( \d{4})?<\/text>/g)) ticks.push({x: +m[1], mo: M.indexOf(m[2]), label: m[2] + (m[3] || '')});
  ticks.sort((a, b) => a.x - b.x);
  const gaps = [];
  for(let i = 1; i < ticks.length; i++) if((ticks[i].mo - ticks[i - 1].mo + 12) % 12 !== 1) gaps.push(`${ticks[i - 1].label} -> ${ticks[i].label}`);
  return {ticks: ticks.length, gaps};
}

/* P1, P2, G1 on a standalone picture's geometry (measureSvgInPage output). */
export function checkPicture(geo, {style} = {}){
  const [vx, vy, vw, vh] = geo.viewBox;
  const out = [];
  const lines = geo.shapes.filter(s => s.line && s.stroke);
  const horiz = lines.filter(s => Math.abs(s.line[1] - s.line[3]) < .01 && Math.abs(s.line[2] - s.line[0]) > vw * .5);
  const verts = lines.filter(s => Math.abs(s.line[0] - s.line[2]) < .01 && Math.abs(s.line[3] - s.line[1]) > 20);
  if(horiz.length && (!style || style === 'grid')){   // the other compositions end their rules at a region's edge, not the canvas's
    const left = Math.min(...horiz.map(s => Math.min(s.line[0], s.line[2]))), right = Math.max(...horiz.map(s => Math.max(s.line[0], s.line[2])));
    const closed = !verts.length || verts.some(s => Math.abs(s.line[0] - right) <= 1);   // a ledger has no column rules to close
    const symmetric = Math.abs((left - vx) - (vx + vw - right)) <= 2;
    out.push({check: 'picture:rules-closed', pass: closed && symmetric, values: {ruleLeft: r2(left), ruleRight: r2(right), canvasRight: r2(vx + vw), rightMargin: r2(vx + vw - right), leftMargin: r2(left - vx), closedByColumnLine: closed},
      note: 'P2: row rules end at the content edge, the last column is closed by its own line, and the margin left of the rules equals the margin right of them'});
  }
  /* P1: paint bbox, ignoring the background and full-height panels (spine, rail) that bleed to an edge */
  const paint = [], bleed = [];
  for(const s of geo.shapes){
    const b = s.box;
    if((b[2] - b[0]) < vw * .98 && (b[3] - b[1]) >= vh * .98 && (b[0] <= vx + .5 || b[2] >= vx + vw - .5)) bleed.push(b);
  }
  const inBleed = b => bleed.some(p => b[0] >= p[0] - 1 && b[2] <= p[2] + 1);
  for(const s of geo.shapes){
    const b = s.box, w = b[2] - b[0], h = b[3] - b[1];
    if(w >= vw * .98 && h >= vh * .98) continue;
    if(h >= vh * .98 && (b[0] <= vx + .5 || b[2] >= vx + vw - .5)) continue;
    if(s.fill && s.fill[3] * (s.fillOpacity || 1) < .02 && !s.stroke) continue;
    paint.push(b);
  }
  for(const t of geo.texts) if(!inBleed(t.ink)) paint.push(t.ink);
  if(paint.length){
    const L = Math.min(...paint.map(b => b[0])) - vx, R = vx + vw - Math.max(...paint.map(b => b[2]));
    const T = Math.min(...paint.map(b => b[1])) - vy, B = vy + vh - Math.max(...paint.map(b => b[3]));
    out.push({check: 'picture:margins', pass: Math.abs(L - R) <= 3 && Math.abs(T - B) <= 14, values: {left: r2(L), right: r2(R), top: r2(T), bottom: r2(B)},
      note: 'P1: left margin equals right margin (3px), the bottom margin is the top margin (14px: ink versus text box); full-bleed side panels excluded'});
  }
  /* G1: the Today marker is a short tick: any vertical rule in a colour other than the grid rules' must be short */
  const ruleStroke = (horiz[0] || {}).stroke;
  const same = (p, q) => p && q && [0, 1, 2].every(i => Math.abs(p[i] - q[i]) < 2);
  const tall = verts.filter(s => ruleStroke && !same(s.stroke, ruleStroke) && Math.abs(s.line[3] - s.line[1]) > 14)
    .map(s => ({x: r2(s.line[0]), length: r2(Math.abs(s.line[3] - s.line[1]))}));
  out.push({check: 'picture:no-line-through-cards', pass: tall.length === 0, values: {count: tall.length, hits: tall.slice(0, 8)}, note: 'G1: no coloured vertical rule longer than a 14px tick (the Today marker is a label and a short tick in the header band)'});
  return out;
}

/* A1-A4 on a Timeline SVG (native picture or a slide): uniform month step, year line, Today clear, one date. */
export function checkTimelineAxis(svg){
  const out = [];
  const texts = [...svg.matchAll(/<text\b([^>]*)>([^<]*)<\/text>/g)].map(m => ({attrs: m[1], text: unesc(m[2]), x: num(m[1], 'x'), y: num(m[1], 'y'), size: num(m[1], 'font-size')}));
  const ticks = texts.filter(t => /data-axis="tick"/.test(t.attrs)).sort((a, b) => a.x - b.x);
  const years = texts.filter(t => /data-axis="year"/.test(t.attrs));
  const today = texts.find(t => /data-axis="today"/.test(t.attrs));
  const M = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const step = ticks.length > 1 ? new Set(ticks.slice(1).map((t, i) => {
    const a = M.indexOf(ticks[i].text), b = M.indexOf(t.text);
    if(a >= 0 && b >= 0) return (b - a + 12) % 12 || 12;
    const q = s => /^Q[1-4]$/.test(s) ? (+s[1] - 1) * 3 : null;
    if(q(ticks[i].text) != null && q(t.text) != null) return (q(t.text) - q(ticks[i].text) + 12) % 12 || 12;
    return +t.text - +ticks[i].text;
  })) : new Set();
  out.push({check: 'axis:uniform-step', pass: step.size <= 1, values: {steps: [...step], labels: ticks.map(t => t.text).slice(0, 40)}, note: 'A1: one step between every pair of tick labels (no label dropped ad hoc)'});
  const stray = ticks.filter(t => /\d{4}/.test(t.text) && !/^\d{4}$/.test(t.text));
  out.push({check: 'axis:year-on-own-line', pass: stray.length === 0, values: {labelsCarryingAYear: stray.map(t => t.text), years: years.map(t => t.text)}, note: 'A2: no month or quarter label carries a year; years sit on their own line'});
  if(today && ticks.length){
    const lowest = Math.max(...texts.filter(t => /data-axis="(tick|year)"/.test(t.attrs)).map(t => t.y));
    const clear = today.y - today.size - lowest;
    out.push({check: 'axis:today-clear', pass: clear >= 6, values: {clearance: Math.round(clear * 10) / 10}, note: 'A3: the Today label is on its own line, 6px or more below the axis labels'});
  }
  const same = [...svg.matchAll(/(\d{1,2} [A-Z][a-z]{2} \d{4}) \u2013 \1(?!\d)/g)].map(m => m[0]);
  out.push({check: 'axis:same-day-range', pass: same.length === 0, values: {hits: same.slice(0, 5)}, note: 'A4: a range that starts and ends on one day prints one date'});
  return out;
}


/* ---- Print sheets (H4, H5, H6): read from the sheets the browser prints, in print media, after beforeprint. ---- */

/* Runs in the page (page.evaluate): what each printed sheet shows. */
export function printProbe(){
  const sheets = [];
  for(const sheet of document.querySelectorAll('#print-artefact .print-page')){
    const root = sheet.firstElementChild;
    const nested = root.querySelector('svg');
    const leaves = nested ? [...root.querySelectorAll('svg')] : [root];
    // a later sheet is a wrapper of nested svgs: the repeated header first (when there is one), the body slice last
    const bodySvg = leaves.at(-1), headerSvg = leaves.length > 1 ? leaves[0] : null;
    const vb = s => s.viewBox.baseVal;
    const body = [vb(bodySvg).y, vb(bodySvg).y + vb(bodySvg).height];
    const total = vb(root).height;
    const rows = [...bodySvg.querySelectorAll('[data-key],[data-field-item]')].map(g => { const b = g.getBBox(); return [b.y, b.y + b.height]; }).filter(([t, b]) => t >= body[0] - .5 && b <= body[1] + .5);
    const headings = [...bodySvg.querySelectorAll('[data-lane-heading]')].map(g => { const b = g.getBBox(), t = parseFloat(g.getAttribute('data-lane-top')); return {top: Number.isFinite(t) ? t : b.y, bboxTop: b.y, bottom: b.y + b.height, name: g.getAttribute('data-lane-heading')}; });
    const cont = root.querySelector('[data-continued]');
    const slivers = [];
    for(const el of bodySvg.querySelectorAll('line,rect,circle,ellipse,path,polygon,polyline')){
      if(el.closest('[data-key],[data-field-item],[data-lane-heading]')) continue;
      const b = el.getBBox();
      const over = Math.min(b.y + b.height, body[1]) - Math.max(b.y, body[0]);
      const crossing = b.y < body[0] - .01 || b.y + b.height > body[1] + .01;
      if(crossing && over > .4 && over < 12 && !(b.width > vb(root).width * .9 && b.height > 100)) slivers.push({tag: el.tagName, top: Math.round(b.y * 10) / 10, bottom: Math.round((b.y + b.height) * 10) / 10});
    }
    const hh = headerSvg ? vb(headerSvg).height : 0, ch = total ? Math.max(0, total - hh - (body[1] - body[0])) : 0;
    // K2: the strip a continuing lane's heading sits in has paper behind it, edge to edge: a rect child of the sheet covering [header, header + strip]
    const paperStrip = ch > 0 ? [...root.children].some(e => e.tagName.toLowerCase() === 'rect' && +e.getAttribute('y') <= hh + .5 && +e.getAttribute('y') + +e.getAttribute('height') >= hh + ch - .5 && +e.getAttribute('x') <= .5 && +e.getAttribute('width') >= vb(root).width - .5) : null;
    sheets.push({vbW: vb(root).width, header: headerSvg ? [vb(headerSvg).y, vb(headerSvg).y + vb(headerSvg).height] : null,
      headerH: headerSvg ? vb(headerSvg).height : 0, contH: total ? Math.max(0, total - (headerSvg ? vb(headerSvg).height : 0) - (body[1] - body[0])) : 0,
      contLabel: cont ? cont.textContent.replace(/\s+/g, ' ').trim() : null, paperStrip, body, rows, headings, slivers});
  }
  return sheets;
}

/* A4 landscape less the stylesheet's margins is 277 x 190mm (0.686); the breaker uses 0.68 and so does this. */
const PAPER_RATIO = .68, TRAIL = 12;

export function checkPrintSheets(sheets, {ratio = PAPER_RATIO} = {}){
  const early = [], neighbours = [], unnamed = [], bare = [];
  const all = sheets.flatMap(s => s.headings);
  sheets.forEach((s, i) => {
    const used = s.headerH + s.contH + (s.body[1] - s.body[0]);
    const next = sheets[i + 1];
    if(next && next.rows.length){
      // could the cut move down to a later row top, crossing no row, and still fit this sheet? Then it closed early.
      const rows = [...s.rows, ...next.rows], cut = next.body[0];
      const tops = [...new Set(next.rows.map(r => r[0]))].filter(y => y > cut + .5 && !rows.some(r => r[0] < y - .5 && r[1] > y + .5));
      for(const y of tops){
        const bottoms = rows.filter(r => r[1] <= y + .5 && r[1] > s.body[0] + .5).map(r => r[1] + TRAIL);
        const end = Math.min(y, Math.max(...bottoms));
        const left = next.rows.filter(r => r[0] >= y - .5).length;
        const lastSheet = i + 1 === sheets.length - 1;
        const moves = next.rows.some(r => r[0] >= cut - .5 && r[1] <= y + .5);   // a row of the next sheet would come up onto this one
        if(moves && end - s.body[0] + s.headerH + s.contH <= ratio * s.vbW - .5 && !(lastSheet && left < 2)){ early.push({sheet: i + 1, usedOf: Math.round(ratio * s.vbW), used: Math.round(used), couldEndAt: Math.round(end)}); break; }
      }
    }
    if(i > 0){
      const tops = [...s.rows.map(r => r[0]), ...s.headings.filter(h => h.top >= s.body[0] - 1).map(h => h.top)];
      const firstTop = tops.length ? Math.min(...tops) : s.body[0];
      if(firstTop - s.body[0] > 1) neighbours.push({sheet: i + 1, emptyAboveFirstRow: Math.round((firstTop - s.body[0]) * 10) / 10});
      const own = all.some(h => Math.abs(h.top - s.body[0]) < 1);
      const prev = all.filter(h => h.top < s.body[0] - .5).at(-1);
      if(!own && prev && prev.name && !(s.contLabel && s.contLabel.toLowerCase().includes((prev.name + ' (continued)').toLowerCase()))) unnamed.push({sheet: i + 1, lane: prev.name, label: s.contLabel});
    }
    // K3: a lane heading that is not on this sheet shows nothing: its top rule must lie a unit past where the sheet stops
    // a heading that abuts the last row shares its rule, which is not a second one
    if(next){ const edge = s.headings.filter(h => h.bottom > s.body[1] + .5 && h.bboxTop > s.body[0] && h.bboxTop < s.body[1] + .99 && h.bboxTop - Math.max(0, ...s.rows.map(r => r[1])) >= .5); if(edge.length) neighbours.push({sheet: i + 1, headingRuleOnSheet: edge.map(h => ({lane: h.name.slice(0, 20), top: Math.round(h.bboxTop * 10) / 10, sheetEnd: Math.round(s.body[1] * 10) / 10}))}); }
    if(s.paperStrip === false) bare.push({sheet: i + 1, strip: Math.round(s.contH)});
    if(s.slivers.length) neighbours.push({sheet: i + 1, slivers: s.slivers.slice(0, 4)});
  });
  return [
    {check: 'print:no-early-close', pass: early.length === 0, values: {count: early.length, hits: early.slice(0, 6)}, note: 'H4: a sheet is not closed while the next row fits (A4 landscape body)'},
    {check: 'print:no-neighbour-slivers', pass: neighbours.length === 0, values: {count: neighbours.length, hits: neighbours.slice(0, 6)}, note: 'H5: a sheet shows nothing of a row that is not on it'},
    {check: 'print:continued-on-paper', pass: bare.length === 0, values: {count: bare.length, hits: bare.slice(0, 6)}, note: 'K2: the (continued) strip has the paper behind it, edge to edge'},
    {check: 'print:lane-continued-named', pass: unnamed.length === 0, values: {count: unnamed.length, hits: unnamed.slice(0, 6)}, note: 'H6: a lane that continues on a later sheet is named again, with (continued)'},
  ];
}
