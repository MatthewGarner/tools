/* model + per-question stats → overlay SVG string. Pure; colours from ctx only. */
import {esc, tint, wrapText} from '../assets/svg.js';
import {fmt} from '../assets/series.js';
import {verdict} from './engine.js';

const SANS = '-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif';
const SERIF = 'Charter,Georgia,serif';
const W = 960, PAD = 28, PP = 18;          // page pad, panel pad
const ROW_H = 24, DOT_STEP = 11, DOT_R = 4.5;

function niceTicks(lo, hi, target = 4){
  const span = (hi - lo) || Math.abs(hi) || 1;
  const raw = span / target;
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const norm = raw / mag;
  const step = (norm >= 7.5 ? 10 : norm >= 3.5 ? 5 : norm >= 1.5 ? 2 : 1) * mag;
  const out = [];
  for(let v = Math.ceil(lo / step) * step; v <= hi + step * 1e-6; v += step) out.push(v);
  return out;
}

function pill(xRight, y, label, color, measure){
  const up = label.toUpperCase();
  const w = measure(up, '600 10px ' + SANS) + 16;
  return '<rect x="' + (xRight - w) + '" y="' + y + '" width="' + w + '" height="18" rx="9" fill="' + tint(color) + '"/>' +
    '<text x="' + (xRight - w / 2) + '" y="' + (y + 12.5) + '" text-anchor="middle" font-size="10"' +
    ' font-weight="600" letter-spacing=".06em" fill="' + color + '">' + esc(up) + '</text>';
}

/* Each panel builder returns {h, body} with body in panel-local coords. */
function messagePanel(msg, c){
  return {h: 26, body: '<text x="0" y="17" font-size="13" fill="' + c.muted + '">' + esc(msg) + '</text>'};
}

function rangePanel(q, s, cw, c){
  const named = s.rows.some(r => r.name);
  const labelW = named ? Math.min(150, Math.max(...s.rows.map(r => (r.name || '').length)) * 7 + 14) : 0;
  const x0 = labelW, x1 = cw;
  let lo = s.pooled.lo, hi = s.pooled.hi;
  if(lo === hi){ lo -= 1; hi += 1; }
  const padSpan = (hi - lo) * 0.05;
  lo -= padSpan; hi += padSpan;
  const X = v => x0 + (v - lo) / (hi - lo) * (x1 - x0);
  const rowsTop = s.overlap ? 20 : 4;
  const axisY = rowsTop + s.rows.length * ROW_H + 8;
  const parts = [];
  if(s.overlap){
    parts.push('<rect x="' + X(s.overlap.lo) + '" y="' + rowsTop + '" width="' +
      Math.max(2, X(s.overlap.hi) - X(s.overlap.lo)) + '" height="' + (axisY - rowsTop) +
      '" fill="' + tint(c.status.done) + '"/>');
    parts.push('<text x="' + X((s.overlap.lo + s.overlap.hi) / 2) + '" y="' + (rowsTop - 6) +
      '" text-anchor="middle" font-size="11" font-weight="600" fill="' + c.status.done + '">common ground ' +
      fmt(s.overlap.lo) + '–' + fmt(s.overlap.hi) + (q.unit ? ' ' + esc(q.unit) : '') + '</text>');
  }
  s.rows.forEach((r, i) => {
    const y = rowsTop + i * ROW_H + ROW_H / 2;
    if(r.name) parts.push('<text x="' + (labelW - 10) + '" y="' + (y + 4) +
      '" text-anchor="end" font-size="12" fill="' + c.muted + '">' + esc(r.name) + '</text>');
    parts.push('<line x1="' + X(r.low) + '" y1="' + y + '" x2="' + X(r.high) + '" y2="' + y +
      '" stroke="' + c.accent + '" stroke-width="2.5" stroke-linecap="round"/>');
    for(const v of [r.low, r.high]) parts.push('<line x1="' + X(v) + '" y1="' + (y - 5) +
      '" x2="' + X(v) + '" y2="' + (y + 5) + '" stroke="' + c.accent + '" stroke-width="2.5"/>');
    parts.push('<circle cx="' + X(r.mid) + '" cy="' + y + '" r="3" fill="' + c.accent + '"/>');
  });
  parts.push('<line x1="' + x0 + '" y1="' + axisY + '" x2="' + x1 + '" y2="' + axisY +
    '" stroke="' + c.border + '"/>');
  for(const t of niceTicks(lo, hi)) parts.push('<text x="' + X(t) + '" y="' + (axisY + 16) +
    '" text-anchor="middle" font-size="11" fill="' + c.muted + '">' + fmt(t) + '</text>');
  if(q.unit) parts.push('<text x="' + x1 + '" y="' + (axisY + 32) +
    '" text-anchor="end" font-size="11" fill="' + c.muted + '">' + esc(q.unit) + '</text>');
  return {h: axisY + (q.unit ? 38 : 24), body: parts.join('')};
}

function probPanel(s, cw, c){
  const X = v => v / 100 * cw;
  /* deterministic beeswarm: sorted dots stack upward within x-bins */
  const bins = new Map();
  const dots = s.rows.map(r => {
    const bin = Math.round(X(r.value) / DOT_STEP);
    const k = bins.get(bin) || 0;
    bins.set(bin, k + 1);
    return {x: X(r.value), stack: k};
  });
  const maxStack = Math.max(...dots.map(d => d.stack));
  const top = 16;                                       // room for the median label
  const baseY = top + (maxStack + 1) * DOT_STEP + 4;
  const axisY = baseY + 8;
  const parts = [];
  const mx = X(s.median);
  parts.push('<line x1="' + mx + '" y1="' + top + '" x2="' + mx + '" y2="' + axisY +
    '" stroke="' + c.ink + '" stroke-width="1.5" stroke-dasharray="4 3"/>');
  parts.push('<text x="' + mx + '" y="' + (top - 4) + '" text-anchor="middle" font-size="11"' +
    ' font-weight="600" fill="' + c.ink + '">median ' + Math.round(s.median) + '%</text>');
  for(const d of dots) parts.push('<circle cx="' + d.x + '" cy="' + (baseY - DOT_R - d.stack * DOT_STEP) +
    '" r="' + DOT_R + '" fill="' + c.accent + '" fill-opacity=".85"/>');
  parts.push('<line x1="0" y1="' + axisY + '" x2="' + cw + '" y2="' + axisY + '" stroke="' + c.border + '"/>');
  for(const t of [0, 25, 50, 75, 100]) parts.push('<text x="' + X(t) + '" y="' + (axisY + 16) +
    '" text-anchor="middle" font-size="11" fill="' + c.muted + '">' + t + '%</text>');
  let h = axisY + 24;
  if(s.camps){
    for(const camp of [s.camps.lo, s.camps.hi]) parts.push('<text x="' + X(camp.center) + '" y="' +
      (axisY + 32) + '" text-anchor="middle" font-size="11" font-weight="600" fill="' +
      c.status.risk + '">' + camp.n + ' here</text>');
    h = axisY + 40;
  }
  return {h, body: parts.join('')};
}

export function renderOverlay(model, stats, ctx){
  const c = ctx.colors, measure = ctx.measure;
  const panelW = W - PAD * 2, cw = panelW - PP * 2;
  const count = Math.max(0, ...stats.map(s => s.n));

  /* header */
  const head = [];
  let y = PAD + 24;
  head.push('<text x="' + PAD + '" y="' + y + '" font-family="' + SERIF +
    '" font-size="22" font-weight="700" fill="' + c.ink + '">' +
    esc(model.title || 'Gauge the room') + '</text>');
  y += 24;
  const v = verdict(stats);
  if(v){
    head.push('<text x="' + PAD + '" y="' + y + '" font-size="14" font-weight="600" fill="' +
      c.accent + '">' + esc(v) + '</text>');
    y += 20;
  }
  head.push('<text x="' + PAD + '" y="' + y + '" font-size="12" fill="' + c.muted + '">' +
    count + ' responses · ' + stats.length + ' question' + (stats.length === 1 ? '' : 's') + '</text>');
  y += 18;

  /* panels */
  const parts = [];
  stats.forEach((s, i) => {
    const q = s.question;
    const qLines = wrapText((i + 1) + '. ' + q.text, '600 15px ' + SANS, cw - 110, measure);
    const headH = qLines.length * 20 + 24;
    const inner = (s.kind === 'empty' || s.kind === 'single') ? messagePanel(s.headline, c)
      : q.type === 'range' ? rangePanel(q, s, cw, c) : probPanel(s, cw, c);
    const panelH = PP + headH + inner.h + PP;
    parts.push('<rect x="' + PAD + '" y="' + y + '" width="' + panelW + '" height="' + panelH +
      '" rx="10" fill="' + c.card + '" stroke="' + c.border + '"/>');
    let ty = y + PP + 15;
    for(const lnText of qLines){
      parts.push('<text x="' + (PAD + PP) + '" y="' + ty + '" font-size="15" font-weight="600" fill="' +
        c.ink + '">' + esc(lnText) + '</text>');
      ty += 20;
    }
    const pillSpec = s.kind === 'empty' ? {label: 'no responses', color: c.muted}
      : s.kind === 'single' ? {label: '1 response', color: c.muted}
      : s.discuss ? {label: 'discuss', color: c.status.risk}
      : {label: 'aligned', color: c.status.done};
    parts.push(pill(PAD + panelW - PP, y + PP - 2, pillSpec.label, pillSpec.color, measure));
    if(s.kind !== 'empty' && s.kind !== 'single'){
      parts.push('<text x="' + (PAD + PP) + '" y="' + (ty - 2) + '" font-size="13" fill="' +
        c.muted + '">' + esc(s.headline) + '</text>');
    }
    parts.push('<g transform="translate(' + (PAD + PP) + ',' + (y + PP + headH) + ')">' + inner.body + '</g>');
    y += panelH + 16;
  });

  const H = Math.round(y + PAD - 16);
  return '<svg xmlns="http://www.w3.org/2000/svg" width="' + W + '" height="' + H +
    '" viewBox="0 0 ' + W + ' ' + H + '" font-family="' + SANS + '">' +
    '<rect width="' + W + '" height="' + H + '" fill="' + c.bg + '"/>' +
    head.join('') + parts.join('') + '</svg>';
}
