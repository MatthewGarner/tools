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
  for(const m of svg.matchAll(/<g\b([^>]*\bdata-key="[^"]*"[^>]*)>\s*<rect\b([^>]*)>([\s\S]*?)<\/g>/g)){
    const g = m[1], r = m[2], inner = m[3];
    const legacy = /Item part (\d+) of (\d+)/.exec(inner);
    cards.push({key: unesc(attr(g, 'data-key')), src: num(g, 'data-source-index'), frag: attr(g, 'data-fragment') || (legacy ? legacy[1] + '/' + legacy[2] : null),
      x: num(r, 'x'), y: num(r, 'y'), w: num(r, 'width'), h: num(r, 'height')});
  }
  const texts = [];
  for(const m of svg.matchAll(/<text\b([^>]*)>([^<]*)<\/text>/g))
    texts.push({x: num(m[1], 'x'), y: num(m[1], 'y'), size: num(m[1], 'font-size'), text: unesc(m[2]), anchor: attr(m[1], 'text-anchor')});
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
export function checkFill(slides, {style} = {}){
  const out = [];
  const early = [];
  for(let i = 0; i + 1 < slides.length && style !== 'focus'; i++){   // Focus moves cards between its hero and rail columns, so a column test says nothing there
    const a = slides[i], b = slides[i + 1];
    if((a.group || '') !== (b.group || '') && a.group != null) continue;   // different lane run / window: not a continuation
    const first = b.cards[0];
    if(!first) continue;
    const colBottom = Math.max(a.bodyTop, ...a.cards.filter(c => Math.abs(c.x - first.x) < 2 || (c.x < first.x + first.w && c.x + c.w > first.x + 2)).map(c => c.y + c.h));
    const free = a.bodyBottom - colBottom;
    /* S3 beats S2: moving the card back would leave the next slide thin, which balancing the last two slides exists to avoid */
    const lastOfRun = !slides[i + 2] || slides[i + 2].group !== b.group;
    const usableB = b.bodyBottom - b.bodyTop, usedAfter = (b.contentBottom - b.bodyTop) - (first.h + 8);
    if(lastOfRun && b.cards.length - 1 < 3 && usedAfter < usableB / 3) continue;
    if(first.h + 12 + (style === 'register' ? 56 : 0) <= free) early.push({slide: i + 1, next: first.key.slice(0, 40), cardHeight: r1(first.h), freeBelowColumn: r1(free)});
  }
  out.push({check: 'slides:closed-early', pass: early.length === 0, values: {count: early.length, hits: early.slice(0, 20)}, note: 'S2: a slide closed with room under its column for the first card of the next slide'});
  const thin = [];
  const thinRule = (s, label, index) => {
    const usable = s.bodyBottom - s.bodyTop, used = s.contentBottom - s.bodyTop;
    if(s.cards.length < 3 && used < usable / 3 - 0.5) thin.push({slide: index + 1, where: label, cards: s.cards.length, fill: r1(used / usable)});
  };
  if(slides.length > 1){
    thinRule(slides.at(-1), 'last slide of set', slides.length - 1);
    for(let i = 0; i < slides.length; i++){
      const g = slides[i].group;
      if(g != null && g !== '' && slides[i + 1]?.group !== g && i !== slides.length - 1) thinRule(slides[i], 'last slide of its run', i);
    }
  }
  out.push({check: 'slides:orphans', pass: thin.length === 0, values: {count: thin.length, hits: thin}, note: 'S3: the last slide of a set or of a lane run has fewer than 3 cards and less than a third of the usable height'});
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
      const pos = [r1(t.y), t.size, isFooter ? r1(t.x) : null];
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

export function checkSlideSet(svgs, opts = {}){
  const slides = svgs.map(slideGeometry);
  return [...checkSplits(slides), ...checkFill(slides, opts), ...checkScale(slides), ...checkFurniture(slides, opts), ...checkWording(slides)];
}

/* A1, A2, A4 on a saved Timeline SVG: month continuity and the one-step rule. */
export function checkAxisMonths(svg){
  const M = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const ticks = [];
  for(const m of svg.matchAll(/<text[^>]*\bx="([\d.]+)"[^>]*>(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)( \d{4})?<\/text>/g)) ticks.push({x: +m[1], mo: M.indexOf(m[2]), label: m[2] + (m[3] || '')});
  ticks.sort((a, b) => a.x - b.x);
  const gaps = [];
  for(let i = 1; i < ticks.length; i++) if((ticks[i].mo - ticks[i - 1].mo + 12) % 12 !== 1) gaps.push(`${ticks[i - 1].label} -> ${ticks[i].label}`);
  return {ticks: ticks.length, gaps};
}
