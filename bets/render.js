/* model + sim → bet-slip board SVG string. Pure; colours + measure from ctx.
   Wide: lane bands, each bet a horizontal slip row. Narrow (<520): lanes as
   section headers, slips stacked full-width cards (a relayout, not a pan —
   exports omit ctx.width so they always render wide). Every user string via
   txt()/esc; edit hooks + ≥44px hit rects on stake/odds/payoff/kill. */
import {esc, txt, tint, editTarget, wrapText} from '../assets/svg.js';

const WIDE = 960, PAD = 28;
const SANS = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif";
const r2 = n => Math.round(n * 100) / 100;
const money = (v, u) => (v < 0 ? '−' : '') + Math.round(Math.abs(v)) + (u ? ' ' + u : '');
const rngText = (r, suffix = '') => !r ? '—' : (r[0] === r[1] ? r[0] : r[0] + '–' + r[1]) + suffix;

export function renderBoard(model, sim, ctx = {}){
  const c = ctx.colors || {};
  const measure = ctx.measure || ((s) => String(s).length * 8);
  const narrow = !!ctx.width && ctx.width < 520;
  const W = narrow ? Math.max(280, Math.round(ctx.width)) : WIDE;
  const u = model.unit || '';
  const parts = [];
  let y = PAD;

  // ---- header: title + portfolio fan + verdict + caveat + audit count ----
  parts.push(txt(PAD, y + 16, model.title || 'Bets board', 22, c.ink, {weight: 700}));
  y += 34;
  const counts = auditCounts(model, sim);
  y = fanHeader(parts, sim.portfolio, u, c, PAD, y, W - PAD, counts, narrow);
  y += 18;

  // ---- lanes ----
  for(const g of model.groups){
    const bets = g.bets.slice().sort((a, b) => med(sim, b) - med(sim, a));
    // lane rail label
    parts.push('<rect x="' + PAD + '" y="' + y + '" width="4" height="20" rx="2" fill="' + (c.accent || '#888') + '"/>');
    parts.push(txt(PAD + 12, y + 15, g.name.toUpperCase(), 12, c.muted, {weight: 700, tracking: '0.08em'}));
    y += 30;
    const scale = laneScale(sim, bets);
    for(const b of bets){
      y = narrow ? slipCard(parts, b, sim, scale, c, measure, u, PAD, y, W - PAD)
                 : slipRow(parts, b, sim, scale, c, measure, u, PAD, y, W - PAD);
      y += 10;
    }
    y += 8;
  }

  const H = Math.ceil(y + PAD);
  return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + W + ' ' + H + '" width="' + W + '" height="' + H +
    '" font-family="-apple-system,BlinkMacSystemFont,\'Segoe UI\',Roboto,sans-serif">' +
    '<rect width="' + W + '" height="' + H + '" fill="' + (c.bg || '#fff') + '"/>' +
    (narrow ? '<rect data-narrow="" width="0" height="0" fill="none"/>' : '') +
    parts.join('') + '</svg>';
}

const med = (sim, b) => (sim.bets.get(b.srcLine)?.ev.p50 ?? 0);

/* per-lane shared EV scale, always including zero so the loss line reads */
function laneScale(sim, bets){
  let lo = 0, hi = 0;
  for(const b of bets){ const e = sim.bets.get(b.srcLine)?.ev; if(e){ lo = Math.min(lo, e.p10); hi = Math.max(hi, e.p90); } }
  if(hi <= lo) hi = lo + 1;
  return {lo, hi};
}

function fanHeader(parts, pf, u, c, x0, y, x1, counts, narrow){
  const w = x1 - x0, h = 46, bx = x0, by = y;
  const bins = pf.histogram || [];
  const lo = bins.length ? bins[0][0] : 0, hi = bins.length ? bins[bins.length - 1][1] : 1;
  const span = hi - lo || 1;
  const sx = v => bx + (v - lo) / span * w;
  const maxCount = Math.max(1, ...bins.map(b => b[2]));
  // loss region shade (x < 0)
  if(lo < 0){ const zx = sx(0);
    parts.push('<rect x="' + r2(bx) + '" y="' + by + '" width="' + r2(zx - bx) + '" height="' + h +
      '" fill="' + (c.status?.risk || '#b44') + '" fill-opacity="0.08"/>'); }
  // histogram bars
  for(const b of bins){
    const bh = b[2] / maxCount * h, xx = sx(b[0]), bw = Math.max(0.5, sx(b[1]) - sx(b[0]) - 0.5);
    parts.push('<rect x="' + r2(xx) + '" y="' + r2(by + h - bh) + '" width="' + r2(bw) + '" height="' + r2(bh) +
      '" fill="' + (c.accent || '#888') + '" fill-opacity="0.55"/>');
  }
  // P10–P90 band + P50 tick
  const p10 = sx(pf.p10), p50 = sx(pf.p50), p90 = sx(pf.p90);
  parts.push('<rect x="' + r2(p10) + '" y="' + (by + h) + '" width="' + r2(Math.max(0, p90 - p10)) + '" height="4" rx="2" fill="' + (c.accent || '#888') + '" fill-opacity="0.35"/>');
  parts.push('<line x1="' + r2(p50) + '" y1="' + by + '" x2="' + r2(p50) + '" y2="' + (by + h + 4) + '" stroke="' + (c.ink || '#000') + '" stroke-width="1.5"/>');
  if(lo < 0){ const zx = sx(0);
    parts.push('<line x1="' + r2(zx) + '" y1="' + by + '" x2="' + r2(zx) + '" y2="' + (by + h) + '" stroke="' + (c.muted || '#888') + '" stroke-width="1" stroke-dasharray="2 2"/>'); }
  let yy = by + h + 20;
  const pct = Math.round((pf.pLoss || 0) * 100);
  const riskC = pct >= 50 ? (c.status?.risk || '#b44') : c.ink;
  const auditLine = counts.kill ? counts.kill + ' bet' + (counts.kill === 1 ? '' : 's') + ' with no kill criterion' : 'Every bet can say when to fold';
  const caveat = 'The fan assumes the bets are independent; correlated bets swing wider.';
  parts.push(txt(x0, yy, 'Portfolio net EV ' + money(pf.p50, u) + '  [' + money(pf.p10, u) + ' – ' + money(pf.p90, u) + ']', 14, c.ink, {weight: 600}));
  if(narrow){                                             // stack — 360px can't hold two on a line
    yy += 18; parts.push(txt(x0, yy, 'P(loses money) ' + pct + '%', 14, riskC, {weight: 700}));
    yy += 18; parts.push(txt(x0, yy, 'The fan assumes the bets are independent.', 11.5, c.muted));
    yy += 15; parts.push(txt(x0, yy, auditLine, 11.5, c.muted));
  } else {
    parts.push(txt(x1, yy, 'P(loses money) ' + pct + '%', 14, riskC, {weight: 700, anchor: 'end'}));
    yy += 18;
    parts.push(txt(x0, yy, caveat, 11.5, c.muted));
    parts.push(txt(x1, yy, auditLine, 11.5, c.muted, {anchor: 'end'}));
  }
  return yy + 6;
}

/* wide slip = one horizontal row */
function slipRow(parts, b, sim, scale, c, measure, u, x0, y, x1){
  const rec = sim.bets.get(b.srcLine) || {ev: {p10: 0, p50: 0, p90: 0}, audits: []};
  const nameW = 250;
  const nameLines = wrapText(b.name, '600 14px ' + SANS, nameW - 12, measure);
  const top = y;
  nameLines.forEach((ln, i) => parts.push(txt(x0, y + 15 + i * 17, ln, 14, c.ink, {weight: 600})));
  let ny = y + 15 + nameLines.length * 17;
  // chips row under the name
  let cx = x0;
  cx = chip(parts, editStake(b, u), cx, ny, c, c.ink, editHooks(b, 'stake', u));
  cx = chip(parts, rngText(b.odds, '%'), cx + 6, ny, c, c.accent, editHooks(b, 'odds'));
  cx = chip(parts, 'pays ' + rngText(b.payoff), cx + 6, ny, c, c.muted, editHooks(b, 'payoff'));
  const killBottom = killLine(parts, b, c, x0, ny + 34, measure, nameW + 200);
  const leftBottom = Math.max(ny + 22, killBottom);
  // right column: badges on top, EV bar below (no overlap)
  const barX = x0 + nameW + 40, barW = x1 - barX;
  badges(parts, rec.audits, x1, top + 12, c, 'end');
  evBar(parts, rec.ev, scale, c, u, barX, top + 30, barW);
  const bottom = Math.max(leftBottom, top + 58);
  parts.push('<line x1="' + x0 + '" y1="' + r2(bottom) + '" x2="' + x1 + '" y2="' + r2(bottom) + '" stroke="' + (c.border || '#eee') + '" stroke-width="1"/>');
  return bottom;
}

/* narrow slip = stacked card */
function slipCard(parts, b, sim, scale, c, measure, u, x0, y, x1){
  const rec = sim.bets.get(b.srcLine) || {ev: {p10: 0, p50: 0, p90: 0}, audits: []};
  const w = x1 - x0, top = y;
  const nameLines = wrapText(b.name, '600 15px ' + SANS, w - 90, measure);
  const cardTop = y;
  parts.push('<g data-menu="" data-line="' + b.srcLine + '">');
  y += 6;
  nameLines.forEach((ln, i) => parts.push(txt(x0 + 12, y + 15 + i * 18, ln, 15, c.ink, {weight: 600})));
  badges(parts, rec.audits, x1 - 12, y + 12, c, 'end');
  y += 12 + nameLines.length * 18;
  let cx = x0 + 12;
  cx = chip(parts, editStake(b, u), cx, y, c, c.ink, editHooks(b, 'stake', u));
  cx = chip(parts, rngText(b.odds, '%'), cx + 6, y, c, c.accent, editHooks(b, 'odds'));
  cx = chip(parts, 'pays ' + rngText(b.payoff), cx + 6, y, c, c.muted, editHooks(b, 'payoff'));
  y += 30;
  evBar(parts, rec.ev, scale, c, u, x0 + 12, y, w - 24);
  y += 22;
  if(b.kill){ killLine(parts, b, c, x0 + 12, y, measure, w - 24); y += 16; }
  else y += 4;
  const cardH = y - cardTop;
  parts.push('<rect x="' + x0 + '" y="' + cardTop + '" width="' + w + '" height="' + r2(cardH) +
    '" rx="10" fill="' + (c.card || '#fff') + '" fill-opacity="0.5" stroke="' + (c.border || '#eee') + '" stroke-width="1.4"/>');
  parts.push('<rect data-hit="" x="' + x0 + '" y="' + cardTop + '" width="' + w + '" height="' + r2(cardH) + '" fill="transparent"/></g>');
  return y;
}

function evBar(parts, ev, scale, c, u, x, y, w){
  const span = (scale.hi - scale.lo) || 1;
  const sx = v => x + (v - scale.lo) / span * w;
  parts.push('<rect x="' + r2(x) + '" y="' + r2(y) + '" width="' + r2(w) + '" height="8" rx="4" fill="' + (c.track || '#eee') + '"/>');
  if(scale.lo < 0){ const zx = sx(0);
    parts.push('<rect x="' + r2(x) + '" y="' + r2(y) + '" width="' + r2(Math.max(0, zx - x)) + '" height="8" rx="4" fill="' + (c.status?.risk || '#b44') + '" fill-opacity="0.16"/>');
    parts.push('<line x1="' + r2(zx) + '" y1="' + r2(y - 3) + '" x2="' + r2(zx) + '" y2="' + r2(y + 11) + '" stroke="' + (c.muted || '#888') + '" stroke-width="1" stroke-dasharray="2 2"/>'); }
  const bl = sx(ev.p10), bh = sx(ev.p90), dot = sx(ev.p50);
  const neg = ev.p50 < 0;
  parts.push('<rect x="' + r2(Math.min(bl, bh)) + '" y="' + r2(y) + '" width="' + r2(Math.max(1, Math.abs(bh - bl))) + '" height="8" rx="4" fill="' + (neg ? (c.status?.risk || '#b44') : (c.accent || '#888')) + '" fill-opacity="0.5"/>');
  parts.push('<circle cx="' + r2(dot) + '" cy="' + r2(y + 4) + '" r="4" fill="' + (neg ? (c.status?.risk || '#b44') : (c.accent || '#888')) + '"/>');
  parts.push(txt(x + w, y + 22, 'EV ' + money(ev.p50, u), 11.5, neg ? (c.status?.risk || '#b44') : c.muted, {anchor: 'end', weight: neg ? 700 : 400}));
}

function chip(parts, label, x, y, c, fill, hooks){
  const w = Math.max(30, label.length * 6.4 + 16), h = 22;
  const inner = '<rect x="' + r2(x) + '" y="' + r2(y) + '" width="' + r2(w) + '" height="' + h + '" rx="11" fill="' + tint(fill || c.ink) + '"/>' +
    txt(x + w / 2, y + 15, label, 12, fill || c.ink, {weight: 600, anchor: 'middle'});
  if(hooks) parts.push(editTarget(inner, {x: r2(x), y: r2(y - 11), w: r2(w), h: 44, bg: c.bg}, hooks));
  else parts.push(inner);
  return x + w;
}

function badges(parts, audits, x, y, c, anchor){
  let cx = x;
  for(const a of audits){
    const w = a.length * 5.6 + 16;
    const bx = anchor === 'end' ? cx - w : cx;
    parts.push('<rect x="' + r2(bx) + '" y="' + r2(y) + '" width="' + r2(w) + '" height="18" rx="9" fill="' + tint(c.status?.risk || '#b44') + '" stroke="' + (c.status?.risk || '#b44') + '" stroke-width="1"/>');
    parts.push(txt(bx + w / 2, y + 13, a, 9.5, c.statusInk?.risk || c.status?.risk || '#b44', {weight: 700, anchor: 'middle', tracking: '0.03em'}));
    cx = anchor === 'end' ? bx - 6 : cx + w + 6;
  }
}

/* draws the "fold if …" line when a kill exists (the NO KILL badge carries the
   absence, so no redundant inline flag); returns the y it consumed to. */
function killLine(parts, b, c, x, y, measure, maxW){
  if(!b.kill) return y - 12;
  const label = 'fold if ' + b.kill.text + (b.kill.by ? ' · by ' + b.kill.by : '');
  const line = wrapText(label, '11.5px ' + SANS, maxW, measure)[0] || label;
  const inner = txt(x, y, line, 11.5, c.muted);
  parts.push(editTarget(inner, {x: r2(x), y: r2(y - 12), w: r2(Math.min(maxW, measure(line, '11.5px ' + SANS) + 8)), h: 24, bg: c.bg},
    {kind: 'kill', line: b.kill.srcLine, raw: b.kill.text + (b.kill.by ? ' by ' + b.kill.by : '')}));
  return y + 6;
}

const editHooks = (b, kind, u) => ({kind, line: b.srcLine, raw: rawAttr(b, kind, u)});
function rawAttr(b, kind, u){
  if(kind === 'stake') return rngText(b.stake);
  if(kind === 'odds') return rngText(b.odds, '%');
  return rngText(b.payoff);
}
const editStake = (b, u) => rngText(b.stake) + (u ? ' ' + u : '');

function auditCounts(model, sim){
  const counts = {kill: 0, certainty: 0, loses: 0};
  for(const g of model.groups) for(const b of g.bets){
    const a = sim.bets.get(b.srcLine)?.audits || [];
    if(a.includes('NO KILL CRITERION')) counts.kill++;
    if(a.includes('ODDS IMPLY CERTAINTY')) counts.certainty++;
    if(a.includes('LOSES AT P50')) counts.loses++;
  }
  return counts;
}
