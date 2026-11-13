/* The distribution export: the result card as the reader sees it (the question, P10 / P50 / P90, the verdict, the histogram,
   the spread and the method line), as an SVG string. Pure: colours, fonts and text measure come from ctx. The PNG is this SVG
   rasterised at 2x, so Copy PNG and Download PNG are one picture, drawn the same on every device. No link text. */
import {esc, txt, wrapText} from '../assets/svg.js';

const W = 800, PAD = 36, CW = W - 2 * PAD, CHART_H = 150, PAD_T = 30, PAD_B = 22;
export const RESULT_CW = CW;
const f2 = n => (Math.round(n * 100) / 100).toString();

/* labels along one row never overlap: nudge each label right of its left neighbour, then pull the row back inside the edges */
export function placeLabels(items, widths, {min = 0, max, gap = 6}){
  const order = items.map((x, i) => i).sort((a, b) => items[a] - items[b]);
  const left = new Array(items.length);
  let edge = min;
  for(const i of order){ left[i] = Math.max(items[i] - widths[i] / 2, edge); edge = left[i] + widths[i] + gap; }
  /* then pull the row back inside the right edge, each label clear of the one after it */
  for(let k = order.length - 1; k >= 0; k--){
    const i = order[k], next = order[k + 1];
    left[i] = Math.min(left[i], next === undefined ? max - widths[i] : left[next] - gap - widths[i]);
  }
  return left;
}

export function renderResultCard(m, ctx){
  const c = ctx.colors, measure = ctx.measure, SANS = ctx.fonts.sans;
  const F = (w, s) => w + ' ' + s + 'px ' + SANS;
  const out = [];
  let y = PAD;
  const block = (text, size, weight, fill, {gap = 6, lead = 1.32, x = PAD, w = CW} = {}) => {
    for(const line of wrapText(text, F(weight, size), w, measure)){
      y += size * lead * 0.82;
      out.push(txt(x, y, line, size, fill, {weight}));
      y += size * lead * 0.18;
    }
    y += gap;
  };
  /* heading: the question (else the formula), then what the numbers are in */
  block(m.question || m.formula, 21, 600, c.ink, {gap: 4});
  if(m.unit) block('Results in ' + m.unit, 13, 400, c.muted, {gap: 4});
  if(m.compare) block('Variant ' + m.compare.active + ' is filled' + (m.compare.other ? ', ' + m.compare.other + ' is outlined' : '') + '.', 12.5, 400, c.muted, {gap: 4});
  y += 10;
  /* the three figures */
  const cols = [['P10 · low', m.p10Text, PAD], ['P50 · best guess', m.p50Text, PAD + CW / 2], ['P90 · high', m.p90Text, PAD + CW]];
  const anchors = ['start', 'middle', 'end'];
  cols.forEach(([label, value, x], i) => {
    out.push(txt(x, y + 11, label.toUpperCase(), 10.5, c.muted, {weight: 600, tracking: '0.08em', anchor: anchors[i]}));
    const big = i === 1;
    if(big){
      const vw = measure(value, F(700, 36));
      out.push('<rect x="' + f2(x - vw / 2 - 6) + '" y="' + f2(y + 20) + '" width="' + f2(vw + 12) + '" height="42" fill="' + c.accent + '" fill-opacity="0.16"/>');
    }
    out.push(txt(x, y + (big ? 54 : 50), value, big ? 36 : 27, c.ink, {weight: big ? 700 : 600, anchor: anchors[i]}));
  });
  y += 82;
  /* the verdict */
  if(m.verdict) block(m.verdict, 16, 600, c.ink, {gap: 14, w: CW});
  /* the histogram */
  const top = y, plotH = CHART_H - PAD_T - PAD_B, base = top + PAD_T + plotH;
  if(m.layout && m.layout.ok){
    const L = m.layout, NB = L.NB, bw = CW / NB, tv = m.threshold;
    for(let b = 0; b < NB; b++){
      const bin = L.bins[b], h = bin.count / L.cmax * plotH;
      if(h < .5) continue;
      const op = tv === null ? 0.82 : ((bin.v0 + bin.v1) / 2 > tv ? 0.95 : 0.4);
      out.push('<rect x="' + f2(PAD + b * bw + 1) + '" y="' + f2(base - h) + '" width="' + f2(Math.max(1, bw - 2)) + '" height="' + f2(h) + '" fill="' + m.fill + '" fill-opacity="' + op + '"/>');
    }
    out.push('<line x1="' + PAD + '" y1="' + f2(base + .5) + '" x2="' + (PAD + CW) + '" y2="' + f2(base + .5) + '" stroke="' + c.border + '"/>');
    if(m.outline){
      let d = '';
      m.outline.forEach((v, b) => { const yy = base - v * plotH; d += (b ? 'L' : 'M') + f2(PAD + b * bw) + ' ' + f2(yy) + 'L' + f2(PAD + (b + 1) * bw) + ' ' + f2(yy); });
      out.push('<path d="' + d + '" fill="none" stroke="' + m.outlineColor + '" stroke-width="2"/>');
    }
    /* percentile lines, and their labels in one row that never overlaps itself */
    const marks = [[m.p10, 'P10'], [m.p50, 'P50'], [m.p90, 'P90']].map(([v, name]) => ({name, x: PAD + L.px(v)})).filter(k => k.x >= PAD - 1 && k.x <= PAD + CW + 1);
    for(const k of marks) out.push('<line x1="' + f2(k.x) + '" y1="' + f2(top + PAD_T - 4) + '" x2="' + f2(k.x) + '" y2="' + f2(base) + '" stroke="' + c.ink + '" stroke-width="' + (k.name === 'P50' ? 1.5 : 1) + '"' + (k.name === 'P50' ? '' : ' stroke-dasharray="3 3"') + '/>');
    const widths = marks.map(k => measure(k.name, F(600, 11)));
    const left = placeLabels(marks.map(k => k.x), widths, {min: PAD, max: PAD + CW});
    marks.forEach((k, i) => out.push(txt(left[i], top + PAD_T - 9, k.name, 11, c.ink, {weight: 600})));
    if(tv !== null && tv >= L.lo && tv <= L.hi){
      const x = PAD + L.px(tv);
      out.push('<line x1="' + f2(x) + '" y1="' + f2(top + PAD_T - 4) + '" x2="' + f2(x) + '" y2="' + f2(base) + '" stroke="' + c.err + '" stroke-width="1.5"/>');
    }
    out.push(txt(PAD, base + 16, m.loText, 11, c.muted), txt(PAD + CW, base + 16, m.hiText, 11, c.muted, {anchor: 'end'}));
  } else {
    /* a point estimate has no spread: draw the one value, marked, not an empty chart */
    const x = PAD + CW / 2;
    out.push('<line x1="' + PAD + '" y1="' + f2(base + .5) + '" x2="' + (PAD + CW) + '" y2="' + f2(base + .5) + '" stroke="' + c.border + '"/>');
    out.push('<line x1="' + f2(x) + '" y1="' + f2(top + 6) + '" x2="' + f2(x) + '" y2="' + f2(base) + '" stroke="' + c.ink + '" stroke-width="2"/>');
    out.push('<circle cx="' + f2(x) + '" cy="' + f2(top + 6) + '" r="5" fill="' + m.fill + '"/>');
    out.push(txt(x, base + 16, m.p50Text + ' — one value, no spread', 12, c.muted, {anchor: 'middle'}));
  }
  y = top + CHART_H + 12;
  if(m.spread) block(m.spread, 13, 400, c.muted, {gap: 6});
  if(m.threshText) block(m.threshText, 13, 400, c.ink, {gap: 6});
  /* the variants, both described */
  if(m.variants) for(const v of m.variants) block('Variant ' + v.name + ': ' + v.formula + ' — P10 ' + v.p10 + ' · P50 ' + v.p50 + ' · P90 ' + v.p90, 12.5, 400, c.ink, {gap: 4});
  if(m.compareText) block(m.compareText, 12.5, 400, c.muted, {gap: 6});
  if(m.question) block('Formula: ' + m.formula, 12.5, 400, c.muted, {gap: 6});
  if(m.method) block(m.method, 12, 400, c.muted, {gap: 0});
  const H = Math.ceil(y + PAD);
  const summary = (m.question || m.formula) + '. P10 ' + m.p10Text + ', P50 ' + m.p50Text + ', P90 ' + m.p90Text + '.';
  return '<svg xmlns="http://www.w3.org/2000/svg" width="' + W + '" height="' + H + '" viewBox="0 0 ' + W + ' ' + H + '" font-family="' + SANS +
    '" role="img" aria-label="' + esc(summary) + '"><title>' + esc(m.question || m.formula) + '</title><desc>' + esc(summary + (m.verdict ? ' ' + m.verdict : '')) + '</desc>' +
    '<rect width="' + W + '" height="' + H + '" fill="' + c.card + '"/>' + out.join('') + '</svg>';
}
