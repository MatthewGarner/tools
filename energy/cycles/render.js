/* Pure renderer: model + simulate() → SVG string. Two axis systems:
   bands 1–2 share one £/MWh axis with the τ line through both; band 3 is a
   years axis with the revenue fan + a slim state strip (SoH, budget) below.
   Ribbon = days (day-to-day variation); whisker on τ = beliefs. Both named
   on-canvas — a deck screenshot must not depend on a legend.
   XML discipline: txt()/esc() for content; hand-built tags use single-quoted
   attributes (numbers and escaped strings only inside them). */
import {esc, txt, tint, wrapText} from '../../assets/svg.js';
import {fmtUnit, verdict, makeBase, above, N_BASE, DAYS} from './engine.js';

const FONT = 'Charter,Georgia,serif';
const numStr = v => String(Number(Number(v).toPrecision(4)));

/* nice axis ticks: ≤6 steps of 1/2/5×10^k */
function ticks(min, max){
  const span = max - min || 1;
  const mag = Math.pow(10, Math.floor(Math.log10(span / 5)));
  const step = [1, 2, 5, 10].map(s => s * mag).find(s => span / s <= 6) || mag * 10;
  const out = [];
  for(let v = Math.ceil(min / step) * step; v <= max; v += step) out.push(v);
  return out;
}

/* ribbon bins for a sorted base sample over [min,max] */
function bins(S, min, max, n = 64){
  const out = new Array(n).fill(0);
  for(const v of S.v) out[Math.max(0, Math.min(n - 1, Math.floor((v - min) / (max - min || 1) * n)))]++;
  const peak = Math.max(...out) || 1;
  return out.map(b => b / peak);
}

export function render(model, out, ctx, {edit = false} = {}){
  if(!out) return '';
  const C = ctx.colors;
  const accent = model.accent || C.accent;
  const NARROW = 520;
  const isNarrow = !!(ctx.width && ctx.width < NARROW);
  const W = ctx.width ?? (ctx.slide ? 1280 : 1200);
  const x0 = isNarrow ? 48 : 300, x1 = W - 48;
  const titleLines = model.title ? (isNarrow ? wrapText(model.title, '18px ' + FONT, W - 72, ctx.measure) : [model.title]) : [];
  const TOP = model.title ? (isNarrow ? 34 + titleLines.length * 24 : 92) : 56, GAP = 18;
  const parts = [];
  const P = [];   // deferred: parts helper functions below push here then join

  /* base samples for the ribbons (illustrative day shapes; numbers come from out) */
  const base = makeBase(model, 1 ^ 0x9e3779b9);
  const kMid = (1 / ((model.rte.lo + model.rte.hi) / 2) - 1) * ((model.charge.lo + model.charge.hi) / 2);
  /* shared £/MWh NET axis domain for bands 1–2 */
  const netMax = base.S1.v[base.S1.n - 1] - kMid;
  const axMin = 0, axMax = Math.max(netMax * 1.04, out.threshold.p90 * 1.2);
  const vX = v => Math.max(x0, Math.min(x1, x0 + (v - axMin) / (axMax - axMin || 1) * (x1 - x0)));

  /* narrow mode: pills flow-wrap. `flow` (when on) overrides the passed x/y with a
     wrapping cursor so the existing call sites work unchanged in both modes. */
  const flow = {on: false, x: 44, y: 0, rows: 1};
  const MONO = '600 12px -apple-system,sans-serif';
  const place = w => {   // returns [x,y] for a pill of width w, advancing the cursor
    if(!flow.on) return null;
    if(flow.x + w > W - 24 && flow.x > 44){ flow.x = 44; flow.y += 28; flow.rows++; }
    const at = [flow.x, flow.y]; flow.x += w + 8; return at;
  };
  const startFlow = y => { flow.on = true; flow.x = 44; flow.y = y; flow.rows = 1; };
  /* width-only calc (no draw), for pre-measuring wrapped row counts before heights */
  const pillW = label => ctx.measure(label, MONO) + 20;
  const rangePW = (key, loS, hiS, suffix = '') => {
    const single = loS === hiS && suffix !== '!';
    return 20 + ctx.measure(key + ' ', MONO) + ctx.measure(loS, MONO) + (single ? 0 : ctx.measure('..', MONO) + ctx.measure(hiS + suffix, MONO));
  };
  const flowRows = ws => { let x = 44, rows = 1; for(const w of ws){ if(x + w > W - 24 && x > 44){ x = 44; rows++; } x += w + 8; } return rows; };

  const pill = (x, y, label, opts = {}) => {
    const w = ctx.measure(label, MONO) + 20;
    const at = place(w); if(at){ x = at[0]; y = at[1]; }
    let attrs = '';
    if(edit && opts.field) attrs = ' data-edit=\'num\' data-line=\'' + opts.line +
      '\' data-raw=\'' + esc(opts.raw) + '\' data-field=\'' + opts.field + '\' style=\'cursor:text\'';
    parts.push('<g' + attrs + '><rect x=\'' + x.toFixed(1) + '\' y=\'' + y + '\' width=\'' + w.toFixed(1) +
      '\' height=\'22\' rx=\'11\' fill=\'' + tint(opts.col || accent) + '\'/>' +
      txt(x + 10, y + 15, label, 12, opts.col || C.ink, {weight: 600}) + '</g>');
    return w + 8;
  };

  /* one capsule, two editable numbers: "key lo..hi" with lo/hi as separate targets */
  const rangePill = (x, y, key, loS, hiS, fieldBase, line, suffix = '') => {
    const mono = '600 12px -apple-system,sans-serif';
    const wKey = ctx.measure(key + ' ', mono), wLo = ctx.measure(loS, mono),
      wDots = ctx.measure('..', mono), wHi = ctx.measure(hiS + suffix, mono);
    const single = loS === hiS && suffix !== '!';
    const w = 20 + wKey + wLo + (single ? 0 : wDots + wHi);
    const at = place(w); if(at){ x = at[0]; y = at[1]; }
    parts.push('<rect x=\'' + x.toFixed(1) + '\' y=\'' + y + '\' width=\'' + w.toFixed(1) +
      '\' height=\'22\' rx=\'11\' fill=\'' + tint(accent) + '\'/>');
    parts.push(txt(x + 10, y + 15, key, 12, C.muted, {weight: 600}));
    const gAttr = f => edit ? ' data-edit=\'num\' data-line=\'' + line + '\' data-raw=\'' + esc(f.raw) +
      '\' data-field=\'' + f.field + '\' style=\'cursor:text\'' : '';
    parts.push('<g' + gAttr({raw: loS, field: fieldBase + 'Lo'}) + '>' +
      txt(x + 10 + wKey, y + 15, loS + (single ? suffix : ''), 12, C.ink, {weight: 600}) + '</g>');
    if(!single){
      parts.push(txt(x + 10 + wKey + wLo, y + 15, '..', 12, C.muted, {weight: 600}));
      parts.push('<g' + gAttr({raw: hiS, field: fieldBase + 'Hi'}) + '>' +
        txt(x + 10 + wKey + wLo + wDots, y + 15, hiS + suffix, 12, C.ink, {weight: 600}) + '</g>');
    }
    return w + 8;
  };
  const caption = (y, label) => parts.push(txt(44, y, label, 11.5, C.muted, {weight: 700, tracking: '.08em'}));
  const card = (y, h, ghost = false) => parts.push('<rect x=\'24\' y=\'' + y + '\' width=\'' + (W - 48) +
    '\' height=\'' + h + '\' rx=\'8\' fill=\'' + (ghost ? 'none' : C.card) + '\' stroke=\'' + C.border +
    '\'' + (ghost ? ' stroke-dasharray=\'6 4\'' : '') + '/>');
  const verdictLines = (y, text, width) =>
    wrapText(text, '15px ' + FONT, width, ctx.measure).map((l, i) => {
      parts.push(txt(66, y + i * 22, l, 15, C.ink));
      return l;
    }).length;

  /* ---- measure heights first (verdicts wrap) ---- */
  const vw = W - 96 - 40;
  const vT = verdict('threshold', out);
  const vS = verdict('second', out);
  const vA = verdict('augment', out);
  const wrapN = t => t ? wrapText(t, '15px ' + FONT, vw, ctx.measure).length : 0;
  /* narrow: pre-measure how many rows the pills wrap to, so band heights fit */
  const b = model.battery, cy = model.cycles;
  const b1w = [
    pillW(b.mw + 'MW'), pillW(b.mwh + 'MWh'),
    rangePW('spread', numStr(model.spread.lo), numStr(model.spread.hi)),
    rangePW('fade', numStr(model.fade.lo * 100), numStr(model.fade.hi * 100), '%'),
    pillW('budget ' + cy.budget), pillW('over ' + cy.years + 'yr'),
    ...(!model.chargeDefaulted ? [rangePW('charge', numStr(model.charge.lo), numStr(model.charge.hi))] : []),
    rangePW('rte', numStr(model.rte.lo * 100), numStr(model.rte.hi * 100), '%'),
    rangePW('calendar', numStr(model.calendar.lo * 100), numStr(model.calendar.hi * 100), '%'),
    pillW('binds: warranty ' + Math.round(out.threshold.bindingShare * 10) + '/10 · wear ' +
      Math.round((1 - out.threshold.bindingShare) * 10) + '/10')];   // exact drawn string (matches the pill below)
  const b2w = (model.second && out.second) ? [
    pillW('second ' + Math.round(model.second.lo * 100) + '..' + Math.round(model.second.hi * 100) + '%'),
    pillW('+' + fmtUnit(out.second.dRev, '£/yr') + ' gross'), pillW('−' + fmtUnit(out.second.dWear, '£/yr') + ' wear'),
    pillW(fmtUnit(out.second.dNet, '£/yr') + ' net')] : [];
  const b3w = (model.augment && out.augment) ? [
    pillW('augment ' + numStr(model.augment.lo / 1000) + '..' + numStr(model.augment.hi / 1000) + ' £/kWh'),
    ...(model.drift ? [pillW('drift ' + numStr(model.drift.lo * 100) + '..' + numStr(model.drift.hi * 100) + '%/yr')] : []),
    ...(out.augment.pNever > 0.15 ? [pillW('never pays 0/10')] : [])] : [];
  const b1Rows = isNarrow ? flowRows(b1w) : 2;
  const b2Rows = isNarrow ? flowRows(b2w) : 1;
  const b3Rows = isNarrow ? flowRows(b3w) : 1;
  const B1H = isNarrow ? 124 + b1Rows * 28 + wrapN(vT) * 22 : 178 + wrapN(vT) * 22;
  const B2H = model.second ? (isNarrow ? 96 + b2Rows * 28 + wrapN(vS) * 22 : 128 + wrapN(vS) * 22) : 84;
  const b3h = model.augment ? (isNarrow ? 322 + b3Rows * 28 + wrapN(vA) * 22 : 250 + 48 + 30 + wrapN(vA) * 22) : 84;
  const H = TOP + B1H + GAP + B2H + GAP + b3h + 40;

  parts.push('<svg xmlns=\'http://www.w3.org/2000/svg\' width=\'' + W + '\' height=\'' + H +
    '\' viewBox=\'0 0 ' + W + ' ' + H + '\' font-family=\'' + FONT + '\'>');
  parts.push('<rect width=\'' + W + '\' height=\'' + H + '\' fill=\'' + C.bg + '\'/>');
  if(model.title){
    parts.push('<rect x=\'48\' y=\'' + (isNarrow ? 18 : 34) + '\' width=\'34\' height=\'4\' fill=\'' + accent + '\'/>');
    if(isNarrow) titleLines.forEach((l, i) => parts.push(txt(48, 42 + i * 24, l, 18, C.ink, {weight: 700})));
    else parts.push(txt(48, 66, model.title, 26, C.ink, {weight: 700}));
  }

  const tauX = vX(out.threshold.p50);
  const ln = key => model.srcLines[key] ?? 0;

  /* ================= band 1: dispatch threshold ================= */
  let y = TOP;
  card(y, B1H);
  caption(y + 26, isNarrow ? 'THE CYCLE PRICE' : 'THE CYCLE PRICE — DISPATCH THRESHOLD');
  {
    const ry = y + 40, rh = 34, wy = ry + rh;
    /* don't-cycle shading left of τ */
    parts.push('<rect x=\'' + x0 + '\' y=\'' + ry + '\' width=\'' + Math.max(0, tauX - x0).toFixed(1) +
      '\' height=\'' + rh + '\' fill=\'' + tint(C.err) + '\'/>');
    parts.push(txt((x0 + tauX) / 2, ry + 14, 'don’t cycle', 11, C.err, {anchor: 'middle'}));
    /* day ribbon (net £/MWh) */
    let d = 'M' + x0 + ' ' + wy;
    bins({v: base.S1.v.map(v => Math.max(axMin, v - kMid)), n: base.S1.n}, axMin, axMax)
      .forEach((b, i) => { d += ' L' + vX(axMin + (i + 0.5) / 64 * (axMax - axMin)).toFixed(1) + ' ' + (wy - b * rh).toFixed(1); });
    d += ' L' + x1 + ' ' + wy + ' Z';
    parts.push('<path d=\'' + d + '\' fill=\'' + tint(C.ink) + '\' stroke=\'none\'/>');
    parts.push(txt(x1 - 4, ry + 12, 'ribbon = days', 11, C.muted, {anchor: 'end'}));
    /* τ line + belief whisker */
    parts.push('<line x1=\'' + tauX.toFixed(1) + '\' y1=\'' + (ry - 6) + '\' x2=\'' + tauX.toFixed(1) +
      '\' y2=\'' + (wy + 10) + '\' stroke=\'' + accent + '\' stroke-width=\'2.5\'/>');
    parts.push('<line x1=\'' + vX(out.threshold.p10).toFixed(1) + '\' y1=\'' + (wy + 10) + '\' x2=\'' +
      vX(out.threshold.p90).toFixed(1) + '\' y2=\'' + (wy + 10) + '\' stroke=\'' + accent + '\' stroke-width=\'2.5\'/>');
    for(const p of [out.threshold.p10, out.threshold.p90])
      parts.push('<line x1=\'' + vX(p).toFixed(1) + '\' y1=\'' + (wy + 5) + '\' x2=\'' + vX(p).toFixed(1) +
        '\' y2=\'' + (wy + 15) + '\' stroke=\'' + accent + '\' stroke-width=\'2.5\'/>');
    parts.push(txt(isNarrow ? 48 : tauX, wy + 28, fmtUnit(out.threshold.p50, '£/MWh') + (isNarrow ? ' · whisker = beliefs' : ' — whisker = your beliefs (P10–P90)'),
      11.5, C.muted, {anchor: isNarrow ? 'start' : 'middle'}));
    parts.push(txt(Math.min(x1 - 4, tauX + 14), ry + 26,
      '~' + Math.round(out.threshold.clearingDays) + ' days a year clear', 11.5, C.ink));
    /* pills: two rows of editable params, then the binding readout */
    const row1 = y + B1H - wrapN(vT) * 22 - 66, row2 = row1 + 28;
    if(isNarrow) startFlow(y + B1H - wrapN(vT) * 22 - b1Rows * 28 - 10);
    let px = 44;
    px += pill(px, row1, b.mw + 'MW', {field: 'mw', raw: numStr(b.mw), line: ln('battery')});
    px += pill(px, row1, b.mwh + 'MWh', {field: 'mwh', raw: numStr(b.mwh), line: ln('battery')});
    px += rangePill(px, row1, 'spread', numStr(model.spread.lo), numStr(model.spread.hi), 'spread', ln('spread'));
    px += rangePill(px, row1, 'fade', numStr(model.fade.lo * 100), numStr(model.fade.hi * 100), 'fade', ln('fade'), '%');
    px += pill(px, row1, 'budget ' + cy.budget, {field: 'budget', raw: numStr(cy.budget), line: ln('cycles')});
    pill(px, row1, 'over ' + cy.years + 'yr', {field: 'years', raw: numStr(cy.years), line: ln('cycles')});
    px = 44;
    if(!model.chargeDefaulted)
      px += rangePill(px, row2, 'charge', numStr(model.charge.lo), numStr(model.charge.hi), 'charge', ln('charge'));
    px += rangePill(px, row2, 'rte', numStr(model.rte.lo * 100), numStr(model.rte.hi * 100), 'rte', ln('rte'), '%');
    px += rangePill(px, row2, 'calendar', numStr(model.calendar.lo * 100), numStr(model.calendar.hi * 100), 'cal', ln('calendar'), '%');
    pill(px, row2,
      'binds: warranty ' + Math.round(out.threshold.bindingShare * 10) + '/10 · wear ' +
      Math.round((1 - out.threshold.bindingShare) * 10) + '/10', {col: C.muted});
    /* verdict */
    parts.push('<rect x=\'48\' y=\'' + (y + B1H - wrapN(vT) * 22 - 6) + '\' width=\'4\' height=\'' + (wrapN(vT) * 22) + '\' fill=\'' + accent + '\'/>');
    verdictLines(y + B1H - wrapN(vT) * 22 + 10, vT, vw);
  }

  /* ================= band 2: the second cycle ================= */
  y += B1H + GAP;
  if(model.second && out.second){
    card(y, B2H);
    caption(y + 26, 'THE SECOND CYCLE');
    const ry = y + 40, rh = 30, wy = ry + rh;
    let d = 'M' + x0 + ' ' + wy;
    bins({v: base.S2.v.map(v => Math.max(axMin, v - kMid)), n: base.S2.n}, axMin, axMax)
      .forEach((b, i) => { d += ' L' + vX(axMin + (i + 0.5) / 64 * (axMax - axMin)).toFixed(1) + ' ' + (wy - b * rh).toFixed(1); });
    d += ' L' + x1 + ' ' + wy + ' Z';
    parts.push('<rect x=\'' + x0 + '\' y=\'' + ry + '\' width=\'' + Math.max(0, tauX - x0).toFixed(1) +
      '\' height=\'' + rh + '\' fill=\'' + tint(C.err) + '\'/>');
    parts.push('<path d=\'' + d + '\' fill=\'' + tint(C.ink) + '\' stroke=\'none\'/>');
    parts.push('<line x1=\'' + tauX.toFixed(1) + '\' y1=\'' + (ry - 6) + '\' x2=\'' + tauX.toFixed(1) +
      '\' y2=\'' + (wy + 6) + '\' stroke=\'' + accent + '\' stroke-width=\'2.5\'/>');
    parts.push(txt(x1 - 4, ry + 12, isNarrow ? '2nd-cycle days' : 'second-cycle days (same bar)', 11, C.muted, {anchor: 'end'}));
    if(isNarrow) startFlow(y + B2H - wrapN(vS) * 22 - b2Rows * 28 - 10);
    let px = 44;
    px += pill(px, y + B2H - wrapN(vS) * 22 - 36, 'second ' + Math.round(model.second.lo * 100) + '..' + Math.round(model.second.hi * 100) + '%',
      {field: 'secondHi', raw: String(Math.round(model.second.hi * 100)), line: ln('second')});
    px += pill(px, y + B2H - wrapN(vS) * 22 - 36, '+' + fmtUnit(out.second.dRev, '£/yr') + ' gross', {col: C.muted});
    px += pill(px, y + B2H - wrapN(vS) * 22 - 36, '−' + fmtUnit(out.second.dWear, '£/yr') + ' wear', {col: C.muted});
    pill(px, y + B2H - wrapN(vS) * 22 - 36, fmtUnit(out.second.dNet, '£/yr') + ' net', {col: C.muted});
    parts.push('<rect x=\'48\' y=\'' + (y + B2H - wrapN(vS) * 22 - 6) + '\' width=\'4\' height=\'' + (wrapN(vS) * 22) + '\' fill=\'' + accent + '\'/>');
    verdictLines(y + B2H - wrapN(vS) * 22 + 10, vS, vw);
  } else {
    card(y, B2H, true);
    caption(y + 26, 'THE SECOND CYCLE');
    parts.push(txt(44, y + 56, 'add second: 40..60% to price the second cycle', 13.5, C.muted));
  }

  /* ================= shared axis for bands 1–2 ================= */
  {
    const ay = y + B2H + 2;
    for(const t of ticks(axMin, axMax))
      parts.push(txt(vX(t), ay + 12, numStr(t), 11, C.muted, {anchor: 'middle'}));
    if(!isNarrow) parts.push(txt(x0 - 8, ay + 12, '£/MWh net', 11, C.muted, {anchor: 'end', weight: 600}));
  }

  /* ================= band 3: the asset life ================= */
  y += B2H + GAP;
  if(model.augment && out.augment){
    card(y, b3h);
    caption(y + 26, 'THE ASSET LIFE');
    const fy = y + 44, fh = 190;
    const yrX = i => x0 + (i + 0.5) / out.H * (x1 - x0);
    const maxRev = Math.max(...out.fan.map(f => f.p90)) || 1;
    const rY = v => fy + fh - v / maxRev * fh;
    /* augment window shading */
    if(out.augment.window){
      const [w0, w1] = out.augment.window;
      parts.push('<rect x=\'' + (yrX(w0 - 1) - 8).toFixed(1) + '\' y=\'' + fy + '\' width=\'' +
        (yrX(w1 - 1) - yrX(w0 - 1) + 16).toFixed(1) + '\' height=\'' + fh + '\' fill=\'' + tint(accent) + '\'/>');
      parts.push(txt((yrX(w0 - 1) + yrX(w1 - 1)) / 2, isNarrow ? fy + fh - 8 : fy + 14, 'augment window', 11, C.ink, {anchor: 'middle'}));
    }
    /* fan */
    let up = '', dn = '';
    out.fan.forEach((f, i) => {
      up += (i ? ' L' : 'M') + yrX(i).toFixed(1) + ' ' + rY(f.p90).toFixed(1);
      dn = ' L' + yrX(i).toFixed(1) + ' ' + rY(f.p10).toFixed(1) + dn;
    });
    parts.push('<path d=\'' + up + dn.replace(' L', ' L') + ' Z\' fill=\'' + tint(accent) + '\' stroke=\'none\'/>');
    let mid = '';
    out.fan.forEach((f, i) => { mid += (i ? ' L' : 'M') + yrX(i).toFixed(1) + ' ' + rY(f.p50).toFixed(1); });
    parts.push('<path d=\'' + mid + '\' fill=\'none\' stroke=\'' + accent + '\' stroke-width=\'2.5\'/>');
    parts.push(txt(isNarrow ? 48 : x0 - 8, isNarrow ? fy + 12 : rY(out.fan[0].p50) + 4, fmtUnit(out.fan[0].p50, '£/yr'), 11, C.muted, {anchor: isNarrow ? 'start' : 'end'}));
    parts.push(txt(x1 - 4, fy + 12, isNarrow ? 'fan P10–P90' : 'revenue fan P10–P90', 11, C.muted, {anchor: 'end'}));
    /* years axis */
    for(let i = 0; i < out.H; i += (out.H > 10 ? 2 : 1))
      parts.push(txt(yrX(i), fy + fh + 16, 'y' + (i + 1), 10.5, C.muted, {anchor: 'middle'}));
    /* state strip */
    const sy = fy + fh + 26, sh = 40;
    parts.push('<line x1=\'' + x0 + '\' y1=\'' + (sy + sh + 4) + '\' x2=\'' + x1 + '\' y2=\'' + (sy + sh + 4) +
      '\' stroke=\'' + C.border + '\'/>');
    let sohD = '', budD = '';
    const b0 = out.burndown[0] || 1;
    out.soh.forEach((s, i) => { sohD += (i ? ' L' : 'M') + yrX(i).toFixed(1) + ' ' + (sy + sh - s.p50 * sh).toFixed(1); });
    out.burndown.forEach((b, i) => { budD += (i ? ' L' : 'M') + yrX(i).toFixed(1) + ' ' + (sy + sh - (b / b0) * sh).toFixed(1); });
    parts.push('<path d=\'' + sohD + '\' fill=\'none\' stroke=\'' + C.muted + '\' stroke-width=\'1.5\'/>');
    parts.push('<path d=\'' + budD + '\' fill=\'none\' stroke=\'' + accent + '\' stroke-width=\'1.5\' stroke-dasharray=\'4 3\'/>');
    parts.push(txt(x1 + 0, sy + sh - out.soh[out.H - 1].p50 * sh, 'SoH ' + Math.round(out.soh[out.H - 1].p50 * 100) + '%', 10.5, C.muted, {anchor: 'end'}));
    parts.push(txt(x1 + 0, sy + sh - (out.burndown[out.H - 1] / b0) * sh + 12,
      Math.round(out.burndown[out.H - 1]) + ' cycles left', 10.5, C.muted, {anchor: 'end'}));
    /* pills + verdict */
    if(isNarrow) startFlow(y + b3h - wrapN(vA) * 22 - b3Rows * 28 - 10);
    let px = 44;
    px += pill(px, y + b3h - wrapN(vA) * 22 - 36, 'augment ' + numStr(model.augment.lo / 1000) + '..' + numStr(model.augment.hi / 1000) + ' £/kWh',
      {field: 'augHi', raw: numStr(model.augment.hi / 1000), line: ln('augment')});
    if(model.drift) px += pill(px, y + b3h - wrapN(vA) * 22 - 36,
      'drift ' + numStr(model.drift.lo * 100) + '..' + numStr(model.drift.hi * 100) + '%/yr',
      {field: 'driftHi', raw: numStr(model.drift.hi * 100), line: ln('drift')});
    if(out.augment.pNever > 0.15) pill(px, y + b3h - wrapN(vA) * 22 - 36,
      'never pays ' + Math.round(out.augment.pNever * 10) + '/10', {col: C.muted});
    parts.push('<rect x=\'48\' y=\'' + (y + b3h - wrapN(vA) * 22 - 6) + '\' width=\'4\' height=\'' + (wrapN(vA) * 22) + '\' fill=\'' + accent + '\'/>');
    verdictLines(y + b3h - wrapN(vA) * 22 + 10, vA, vw);
  } else {
    card(y, b3h, true);
    caption(y + 26, 'THE ASSET LIFE');
    parts.push(txt(44, y + 56, 'add augment: 120..180 £/kWh to price the augmentation window', 13.5, C.muted));
  }

  parts.push('</svg>');
  return parts.join('');
}

export function toMarkdown(model, out){
  if(!out) return '';
  const t = out.threshold;
  const lines = [
    '| Fact | Value |', '|---|---|',
    '| Cycle price (τ) | ' + fmtUnit(t.p10, '£/MWh') + ' / ' + fmtUnit(t.p50, '£/MWh') + ' / ' + fmtUnit(t.p90, '£/MWh') + ' (P10/P50/P90) |',
    '| Days clearing | ' + Math.round(t.clearingDays) + '/yr |',
    '| Binding | warranty ' + Math.round(t.bindingShare * 100) + '% · wear ' + Math.round((1 - t.bindingShare) * 100) + '% |',
  ];
  if(out.second) lines.push('| Second cycle | +' + fmtUnit(out.second.dRev, '£/yr') + ' gross, −' +
    fmtUnit(out.second.dWear, '£/yr') + ' wear, ' + fmtUnit(out.second.dNet, '£/yr') + ' net |');
  if(out.augment) lines.push('| Augment window | ' + (out.augment.window ? 'years ' + out.augment.window[0] + '–' + out.augment.window[1] : 'never') +
    ' (never in ' + Math.round(out.augment.pNever * 100) + '%) |');
  lines.push('');
  for(const b of ['threshold', 'second', 'augment']){
    const v = verdict(b, out);
    if(v) lines.push('- ' + v);
  }
  return (model.title ? '## ' + model.title + '\n\n' : '') + lines.join('\n');
}
