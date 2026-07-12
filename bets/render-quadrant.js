/* model + sim → risk-return QUADRANT SVG string (VIEW 2 of /bets, read-only).
   Design: the blotter (render.js) answers "is each bet sound?" row by row;
   this answers what a table can't — the SHAPE of the whole portfolio, as one
   scatter. x = odds of success (fixed 0-100% domain), y = net EV (auto-domain,
   always spans zero, padded). Each bet is a BUBBLE (area ∝ stake, filled in
   its lane's hue) carrying an uncertainty CROSS — a horizontal bar spanning
   odds lo→hi at y=EV.p50, a vertical bar spanning EV.p10→p90 at x=odds-mid —
   a wide cross literally reads "we don't know". The board's audits become
   PLACES here: LOSES AT P50 -> the loss region below the y=0 break-even line;
   ODDS IMPLY CERTAINTY -> the certainty zone (odds >= 90%); NO KILL CRITERION
   -> a dashed ring around the bubble. Lane hues come from the shared,
   ALREADY-VALIDATED PALETTES ramp (assets/series.js: ocean/slate/ember/plum)
   cycled per lane — never an invented hex. Pure; colours + measure from ctx.
   No edit hooks: editing stays on the board. Wide ~960; narrow (<520) fits a
   square-ish plot to the width, drops the per-bet microcopy line (name label
   only), and wraps the legend — mirrors render.js's wide/narrow split. */
import {esc, txt} from '../assets/svg.js';
import {PALETTES, niceTicks} from '../assets/series.js';

const WIDE = 960;
const SANS = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif";
const MINUS = '−';
const r2 = n => Math.round(n * 100) / 100;
const num = v => (v < 0 ? MINUS : '') + Math.round(Math.abs(v));
const sgn = v => (v < 0 ? MINUS : '+') + Math.round(Math.abs(v));
const axisNum = v => Math.abs(v) < 1e-9 ? '0' : sgn(v);
const rng = r => !r ? '—' : r[0] === r[1] ? num(r[0]) : num(r[0]) + '–' + num(r[1]);
const pct = r => !r ? '—' : r[0] === r[1] ? r[0] + '%' : r[0] + '–' + r[1] + '%';
const recOf = (sim, b) => sim.bets.get(b.srcLine) || {ev: {p10: 0, p50: 0, p90: 0}, audits: []};
const stakeMid = b => b.stake ? (b.stake[0] + b.stake[1]) / 2 : 0;
const oddsOf = b => b.odds || [0, 0];
const payoffOf = b => b.payoff || [0, 0];

/* lane hues: the shared, contrast-validated ramp — cycled, never invented.
   `dark` defaults false (bets/app.js doesn't thread a theme flag into the
   board renderer either; the future toggle-wiring task can pass ctx.dark). */
const LANE_HUES = Object.values(PALETTES);
const laneHue = (i, dark) => LANE_HUES[i % LANE_HUES.length][dark ? 'dark' : 'light'];

export function renderQuadrant(model, sim, ctx = {}){
  return (!!ctx.width && ctx.width < 520) ? renderNarrow(model, sim, ctx) : renderWide(model, sim, ctx);
}

/* shared prep: flat bet list w/ lane index, portfolio EV domain (always ⊇ 0,
   padded — mirrors render.js's prep so both views agree on scale logic). */
function prep(model, sim){
  const flat = [];
  model.groups.forEach((g, gi) => { for(const b of g.bets) flat.push({b, gi}); });
  let elo = 0, ehi = 1, maxStake = 0, totalStake = 0;
  for(const {b} of flat){
    const e = recOf(sim, b).ev;
    elo = Math.min(elo, e.p10); ehi = Math.max(ehi, e.p90);
    const sm = stakeMid(b);
    maxStake = Math.max(maxStake, sm);
    totalStake += sm;
  }
  const epad = (ehi - elo) * 0.08 || 1;
  return {flat, elo: elo - epad, ehi: ehi + epad, maxStake: maxStake || 1, totalStake, pf: sim.portfolio};
}

const microFor = b => num(stakeMid(b)) + ' @ ' + pct(oddsOf(b)) + ' → pays ' + rng(payoffOf(b));

/* place a name (+ optional microcopy) beside each bubble: right by default,
   flipped left near the right edge; a simple top-to-bottom vertical nudge
   keeps boxes whose horizontal spans actually overlap from stacking on top
   of each other. Deterministic, single pass — not a general solver, but the
   task tolerates imperfection on dense portfolios; nothing may overlap
   illegibly in the shipped fixture (verified by eye, see the commit). */
function placeLabels(items, plotX0, plotX1, measure, {nameSize, microSize, gap}){
  const nameFont = '600 ' + nameSize + 'px ' + SANS;
  const microFont = microSize + 'px ' + SANS;
  const sorted = items.slice().sort((a, b) => a.cx - b.cx);
  const boxes = [], placed = [];
  for(const it of sorted){
    const nameW = measure(it.name, nameFont);
    const microW = it.micro ? measure(it.micro, microFont) : 0;
    const w = Math.max(nameW, microW) + 4;
    const lineH = it.micro ? (nameSize + microSize + 6) : (nameSize + 4);
    let side = 'right', ax = it.cx + it.radius + gap;
    if(ax + w > plotX1){ side = 'left'; ax = it.cx - it.radius - gap - w; }
    if(ax < plotX0) ax = plotX0;
    let ay = it.cy - lineH / 2;
    for(const p of boxes){
      const xOverlap = ax < p.x + p.w + 4 && ax + w + 4 > p.x;
      if(xOverlap && ay < p.y + p.h && ay + lineH > p.y) ay = p.y + p.h + 4;
    }
    boxes.push({x: ax, y: ay, w, h: lineH});
    placed.push({...it, ax, ay, side, w, lineH});
  }
  return placed;
}

/* the whole chart body — plot box, zones, gridlines, bubbles+crosses, labels,
   legend — shared by wide and narrow (geo carries every sizing knob so the
   two callers differ only in numbers, not logic). Returns {parts, bottomY}. */
function plotAndLegend(model, sim, c, measure, P, geo){
  const {plotX0, plotY0, plotX1, plotY1, dark, rMin, rMax, nameSize, microSize, tickSize,
    axisTitleSize, legendSize, unit} = geo;
  const {flat, elo, ehi, maxStake} = P;
  const innerX0 = plotX0 + rMax, innerX1 = plotX1 - rMax;
  const innerY0 = plotY0 + rMax, innerY1 = plotY1 - rMax;
  const sx = v => innerX0 + v / 100 * (innerX1 - innerX0);
  const sy = v => innerY1 - (v - elo) / ((ehi - elo) || 1) * (innerY1 - innerY0);
  const parts = [];

  // plot surface
  parts.push('<rect x="' + r2(plotX0) + '" y="' + r2(plotY0) + '" width="' + r2(plotX1 - plotX0) +
    '" height="' + r2(plotY1 - plotY0) + '" fill="' + c.card + '" stroke="' + c.border + '" stroke-width="1"/>');

  // loss region (EV < 0): the LOSES AT P50 audit, as a place, not a stamp
  parts.push('<rect data-zone="loss" x="' + r2(plotX0) + '" y="' + r2(sy(0)) + '" width="' + r2(plotX1 - plotX0) +
    '" height="' + r2(plotY1 - sy(0)) + '" fill="' + c.err + '" fill-opacity="0.055"/>');

  // certainty zone (odds >= 90%): the ODDS IMPLY CERTAINTY audit, as a place
  const zx0 = sx(90);
  parts.push('<rect data-zone="certainty" x="' + r2(zx0) + '" y="' + r2(plotY0) + '" width="' + r2(plotX1 - zx0) +
    '" height="' + r2(plotY1 - plotY0) + '" fill="' + c.muted + '" fill-opacity="0.05"/>');
  parts.push('<line x1="' + r2(zx0) + '" y1="' + r2(plotY0) + '" x2="' + r2(zx0) + '" y2="' + r2(plotY1) +
    '" stroke="' + c.muted + '" stroke-width="1" stroke-dasharray="3 3" stroke-opacity="0.7"/>');
  /* label sits in the top MARGIN of the plot box, not vertically centred in
     the zone strip — a bet that actually triggers "odds >= 90%" lands its
     bubble right in this column, so a full-height label would run straight
     through it. Right-anchored near the top keeps it clear of the typical
     bubble band and still reads as "about" the right-hand zone. */
  parts.push(txt(plotX1 - 6, plotY0 + tickSize + 6, 'CERTAINTY ZONE — ODDS ≥ 90%', tickSize, c.muted,
    {weight: 700, anchor: 'end', tracking: '0.06em', halo: c.card}));

  // y gridlines + ticks (0 is always in-domain by construction — drawn prominent)
  for(const t of niceTicks(elo, ehi)){
    const y = sy(t), zero = Math.abs(t) < 1e-9;
    parts.push('<line x1="' + r2(plotX0) + '" y1="' + r2(y) + '" x2="' + r2(plotX1) + '" y2="' + r2(y) +
      '" stroke="' + (zero ? c.ink : c.border) + '" stroke-width="' + (zero ? 1.5 : 1) +
      '"' + (zero ? '' : ' stroke-opacity="0.6"') + '/>');
    parts.push(txt(plotX0 - 8, y + 3, axisNum(t), tickSize, c.muted, {anchor: 'end', mono: true}));
  }
  // x ticks: fixed 0/25/50/75/100 (the axis domain is fixed, unlike y)
  for(const t of [0, 25, 50, 75, 100]){
    const x = sx(t);
    parts.push('<line x1="' + r2(x) + '" y1="' + r2(plotY1) + '" x2="' + r2(x) + '" y2="' + r2(plotY1 + 4) +
      '" stroke="' + c.muted + '" stroke-width="1"/>');
    parts.push(txt(x, plotY1 + 4 + tickSize + 2, t + '%', tickSize, c.muted, {anchor: 'middle', mono: true}));
  }
  // axis titles
  parts.push(txt((plotX0 + plotX1) / 2, plotY1 + 4 + tickSize + 2 + axisTitleSize + 8, 'ODDS OF SUCCESS',
    axisTitleSize, c.muted, {weight: 700, anchor: 'middle', tracking: '0.1em'}));
  {
    const ax = plotX0 - 8 - 30, ay = (plotY0 + plotY1) / 2;
    parts.push('<g transform="rotate(-90 ' + r2(ax) + ' ' + r2(ay) + ')">' +
      txt(ax, ay, 'NET EV' + (unit ? ', ' + unit.toUpperCase() : ''), axisTitleSize, c.muted,
        {weight: 700, anchor: 'middle', tracking: '0.1em'}) + '</g>');
  }

  // per-bet marks (crosses + bubble + no-kill ring), then labels on top
  const marks = [], labelItems = [];
  for(const {b, gi} of flat){
    const rec = recOf(sim, b), e = rec.ev;
    const [oLo, oHi] = oddsOf(b), oMid = (oLo + oHi) / 2;
    const stake = stakeMid(b);
    const radius = rMin + (rMax - rMin) * Math.sqrt(Math.max(0, stake / maxStake));
    const hue = laneHue(gi, dark);
    const cx = sx(oMid), cy = sy(e.p50);
    const hx0 = sx(oLo), hx1 = sx(oHi), vy0 = sy(e.p10), vy1 = sy(e.p90);
    marks.push('<line x1="' + r2(hx0) + '" y1="' + r2(cy) + '" x2="' + r2(hx1) + '" y2="' + r2(cy) +
      '" stroke="' + hue + '" stroke-width="1.5" stroke-opacity="0.55"/>');
    marks.push('<line x1="' + r2(cx) + '" y1="' + r2(vy0) + '" x2="' + r2(cx) + '" y2="' + r2(vy1) +
      '" stroke="' + hue + '" stroke-width="1.5" stroke-opacity="0.55"/>');
    marks.push('<circle cx="' + r2(cx) + '" cy="' + r2(cy) + '" r="' + r2(radius) + '" fill="' + hue +
      '" fill-opacity="0.32" stroke="' + hue + '" stroke-width="1.5"/>');
    if(!b.kill) marks.push('<circle cx="' + r2(cx) + '" cy="' + r2(cy) + '" r="' + r2(radius + 4) +
      '" fill="none" stroke="' + c.err + '" stroke-width="1.5" stroke-dasharray="3 3"/>');
    labelItems.push({cx, cy, radius, name: b.name, micro: microSize ? microFor(b) : null});
  }
  parts.push(...marks);
  const placed = placeLabels(labelItems, plotX0, plotX1, measure, {nameSize, microSize: microSize || nameSize, gap: 6});
  for(const p of placed){
    const anchor = p.side === 'right' ? 'start' : 'end';
    const tx = p.side === 'right' ? p.ax : p.ax + p.w;
    parts.push(txt(tx, p.ay + nameSize, p.name, nameSize, c.ink, {weight: 600, anchor, halo: c.card}));
    if(p.micro) parts.push(txt(tx, p.ay + nameSize + microSize + 3, p.micro, microSize, c.muted, {anchor, halo: c.card}));
  }

  // legend: lane swatches + mark-language notes, flow-wrapped
  const legendFont = '700 ' + legendSize + 'px ' + SANS;
  const legendItems = model.groups.map((g, gi) => ({text: '● ' + g.name.toUpperCase(), color: laneHue(gi, dark)}));
  legendItems.push({text: '⊘ dashed ring = no kill criterion', color: c.err});
  legendItems.push({text: '○ bubble area ∝ stake', color: c.muted});
  let lx = plotX0, ly = plotY1 + 4 + tickSize + 2 + axisTitleSize + 22;
  const rowH = legendSize + 8;
  for(const it of legendItems){
    const w = measure(it.text, legendFont) + 20;
    if(lx + w - 20 > plotX1 && lx > plotX0){ lx = plotX0; ly += rowH; }
    parts.push(txt(lx, ly, it.text, legendSize, it.color, {weight: 700, tracking: '0.02em'}));
    lx += w;
  }
  return {parts, bottomY: ly + 6};
}

/* ---------------- WIDE ---------------- */
function renderWide(model, sim, ctx){
  const c = ctx.colors, measure = ctx.measure || ((s) => String(s).length * 7);
  const dark = !!ctx.dark;
  const P = prep(model, sim);
  const pl = Math.round((P.pf.pLoss || 0) * 100);
  const parts = [];
  const right = 930;

  parts.push('<text x="30" y="52" font-family="Charter, Georgia, serif" font-size="24" fill="' + c.ink + '">' +
    esc(model.title || 'Bets board') + '</text>');
  parts.push(txt(30, 74, P.flat.length + ' BETS · ' + model.groups.length + ' LANES · TOTAL STAKE ' + num(P.totalStake),
    10, c.muted, {mono: true, tracking: '0.05em'}));
  parts.push(txt(right, 50, 'P(LOSES MONEY) ' + pl + '%', 17, pl >= 50 ? c.err : c.accentInk, {weight: 700, mono: true, anchor: 'end'}));
  parts.push(txt(right, 72, 'NET EV ' + sgn(P.pf.p50) + ' · P10 ' + sgn(P.pf.p10) + ' · P90 ' + sgn(P.pf.p90), 10, c.muted, {mono: true, anchor: 'end'}));

  const panelTop = 90;
  const geo = {plotX0: 92, plotY0: panelTop + 22, plotX1: right - 4, plotY1: panelTop + 22 + 400,
    dark, rMin: 10, rMax: 30, nameSize: 12.5, microSize: 10, tickSize: 9.5, axisTitleSize: 10.5,
    legendSize: 9.5, unit: model.unit};
  const {parts: body, bottomY} = plotAndLegend(model, sim, c, measure, P, geo);

  const panelBot = bottomY + 14;
  parts.push('<rect x="16" y="' + panelTop + '" width="' + (WIDE - 32) + '" height="' + (panelBot - panelTop) +
    '" rx="10" fill="' + c.card + '" stroke="' + c.border + '" stroke-width="1"/>');
  parts.push(...body);
  parts.push(txt(30, panelBot + 22, 'RANGES ARE P10–P90 FROM 4,000 SEEDED RUNS · BUBBLE AREA ∝ STAKE · BETS ASSUMED INDEPENDENT', 9, c.muted, {tracking: '0.04em'}));
  parts.push(txt(right, panelBot + 22, 'ALL FIGURES ' + (model.unit || '').toUpperCase(), 9, c.muted, {anchor: 'end', tracking: '0.05em'}));

  const H = panelBot + 40;
  return svgShell(WIDE, H, c, parts.join(''), false);
}

/* ---------------- NARROW: square-ish plot fit to the width ---------------- */
function renderNarrow(model, sim, ctx){
  const c = ctx.colors, measure = ctx.measure || ((s) => String(s).length * 7);
  const dark = !!ctx.dark;
  const W = Math.max(300, Math.round(ctx.width)), pad = 16;
  const P = prep(model, sim);
  const pl = Math.round((P.pf.pLoss || 0) * 100);
  const parts = [];
  let y = 30;
  parts.push('<text x="' + pad + '" y="' + y + '" font-family="Charter, Georgia, serif" font-size="21" fill="' + c.ink + '">' +
    esc(model.title || 'Bets board') + '</text>');
  y += 22;
  parts.push(txt(pad, y, 'P(LOSES MONEY) ' + pl + '%', 15, pl >= 50 ? c.err : c.accentInk, {weight: 700, mono: true})); y += 18;
  parts.push(txt(pad, y, 'NET EV ' + sgn(P.pf.p50) + ' [' + sgn(P.pf.p10) + ' – ' + sgn(P.pf.p90) + '] ' + (model.unit || ''), 11.5, c.muted, {mono: true})); y += 16;
  parts.push(txt(pad, y, P.flat.length + ' bets · ' + model.groups.length + ' lanes · stake ' + num(P.totalStake), 11, c.muted)); y += 18;

  const plotX0 = pad + 40, plotX1 = W - pad - 4, plotW = plotX1 - plotX0;
  const plotY0 = y + 4, plotY1 = plotY0 + plotW;   // square-ish: height ≈ width
  const geo = {plotX0, plotY0, plotX1, plotY1, dark, rMin: 6, rMax: 16, nameSize: 11, microSize: null,
    tickSize: 8.5, axisTitleSize: 9, legendSize: 8.5, unit: model.unit};
  const {parts: body, bottomY} = plotAndLegend(model, sim, c, measure, P, geo);
  parts.push(...body);
  parts.push('<rect data-narrow="" width="0" height="0" fill="none"/>');
  return svgShell(W, bottomY + 20, c, parts.join(''), true);
}

function svgShell(W, H, c, inner, narrow){
  H = Math.ceil(H);
  return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + W + ' ' + H + '" width="' + W + '" height="' + H +
    '" font-family="' + SANS + '"><rect width="' + W + '" height="' + H + '" fill="' + c.bg + '"/>' + inner + '</svg>';
}
