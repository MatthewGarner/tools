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
   Per-bet labels use a greedy free-space placement pass (16 compass anchors x
   3 rings, priority = biggest stake then most extreme |EV| first) with a
   leader line only when a label can't sit snug against its bubble — see
   placeLabels below. Portfolios over NAME_ONLY_THRESHOLD bets drop the
   microcopy line so blocks stay small enough for the placer to find clean
   space (narrow already drops it regardless of count). No edit hooks:
   editing stays on the board. Wide ~960; narrow (<520) fits a square-ish
   plot to the width and wraps the legend — mirrors render.js's split. */
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
export function prep(model, sim){
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

/* ---------------- label placement: greedy free-space + leaders ----------------
   Each label (name, + microcopy line when microSize is set) gets a measured
   box. For every bet, in PRIORITY order (biggest stake first, ties broken by
   the most extreme |EV p50| — the bets most worth reading clearly get first
   pick of clean space), we try candidate anchors at 16 compass points around
   the bubble at three rings: snug (radius+gap), and two escape rings further
   out (the fine angular resolution + extra ring matter once a bubble's
   immediate neighbourhood is already saturated by other bets' labels). The
   snug ring is exhausted compass-first (E/SE/NE preferred, matching the old
   "right of the bubble" look) before an escape ring is tried. The first
   candidate whose box (a) fits the drawable bounds
   (the plot rect + a small gutter margin — see padX/padTop below) and (b)
   doesn't overlap any already-placed label, any bubble, or the fixed
   certainty-zone caption wins outright. If nothing is clean — a genuinely
   crowded cluster — we never drop the label: fall back to the least-overlap
   candidate (in-bounds preferred). A leader line is drawn only when the
   winning candidate came from the escape ring (i.e. it isn't snug against
   the bubble) — the small-portfolio look stays leader-free. */
export const NAME_ONLY_THRESHOLD = 9;   // >9 bets -> drop microcopy so label blocks are
                                  // small enough for the placer to find clean
                                  // space; tuned by eye against the 12-bet
                                  // crowded fixture (bets-quadrant-crowded).
/* 16-point compass (E first, then fanning out by angle, south/clockwise
   preferred at each tier before north/counter-clockwise — generalises the
   8-point E,SE,NE,S,N,SW,NW,W priority pattern with finer resolution, which
   matters once a bubble's immediate neighbourhood is already saturated with
   other bets' labels in a genuinely crowded cluster). */
const COMPASS = [0, 22.5, -22.5, 45, -45, 67.5, -67.5, 90, -90, 112.5, -112.5, 135, -135, 157.5, -157.5, 180]
  .map(deg => { const r = deg * Math.PI / 180; return {dx: Math.cos(r), dy: Math.sin(r)}; });

const anchorFor = dx => dx > 0.3 ? 'start' : dx < -0.3 ? 'end' : 'middle';

function boxAt(cx, cy, dx, dy, off, w, h){
  const ax = cx + dx * off, ay = cy + dy * off;
  const anchor = anchorFor(dx);
  const x = anchor === 'start' ? ax : anchor === 'end' ? ax - w : ax - w / 2;
  const y = dy > 0.3 ? ay : dy < -0.3 ? ay - h : ay - h / 2;
  return {x, y, w, h, anchor, off};
}

/* boolean overlap test for label boxes — exported so tests can assert
   pairwise non-overlap directly against placeLabels' output. */
export const boxesOverlap = (a, b) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;

function overlapArea(a, b){
  const ox = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
  const oy = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
  return ox > 0 && oy > 0 ? ox * oy : 0;
}
/* box-vs-circle overlap, as a comparable (not literal) magnitude — good
   enough for greedy tie-breaking, which only needs relative ordering. */
function circleOverlap(box, cx, cy, r){
  const nx = Math.max(box.x, Math.min(cx, box.x + box.w));
  const ny = Math.max(box.y, Math.min(cy, box.y + box.h));
  const dx = cx - nx, dy = cy - ny, dist = Math.sqrt(dx * dx + dy * dy);
  return dist < r ? (r - dist) * Math.max(box.w, box.h) : 0;
}
const inBounds = (box, b) => box.x >= b.x0 && box.x + box.w <= b.x1 && box.y >= b.y0 && box.y + box.h <= b.y1;

function scoreOf(box, placed, bubbles){
  let s = 0;
  for(const p of placed) s += overlapArea(box, p);
  for(const bub of bubbles) s += circleOverlap(box, bub.cx, bub.cy, bub.r);
  return s;
}

/* nearest point on `box`'s boundary to (cx,cy) is the leader's box-side end;
   the bubble-side end is that same direction projected out to its edge. */
function leaderFor(cx, cy, radius, box){
  const nx = Math.max(box.x, Math.min(cx, box.x + box.w));
  const ny = Math.max(box.y, Math.min(cy, box.y + box.h));
  const dx = nx - cx, dy = ny - cy, dist = Math.sqrt(dx * dx + dy * dy) || 1;
  return {x1: cx + dx / dist * radius, y1: cy + dy / dist * radius, x2: nx, y2: ny};
}

/* pure + independently testable: items = [{cx, cy, radius, name, micro, stake,
   absEv}]. Returns one placement per item (input order preserved), each
   carrying the chosen `box` ({x,y,w,h,anchor}) and whether it needs a `leader`. */
export function placeLabels(items, {bounds, measure, nameSize, microSize, gap = 6, avoid = []}){
  const nameFont = '600 ' + nameSize + 'px ' + SANS;
  const microFont = (microSize || nameSize) + 'px ' + SANS;
  const smallGap = gap + 1;   // snug tolerance: ring-1's own offset must read as "no leader"

  const order = items.map((it, idx) => ({it, idx}))
    .sort((a, b) => (b.it.stake - a.it.stake) || (Math.abs(b.it.absEv) - Math.abs(a.it.absEv)) || (a.idx - b.idx));

  const placedBoxes = avoid.slice();
  const bubbles = items.map(it => ({cx: it.cx, cy: it.cy, r: it.radius}));
  const out = new Array(items.length);

  for(const {it, idx} of order){
    const nameW = measure(it.name, nameFont);
    const microW = it.micro ? measure(it.micro, microFont) : 0;
    const w = Math.max(nameW, microW) + 4;
    const lineH = it.micro ? (nameSize + microSize + 6) : (nameSize + 4);
    // scaled by line HEIGHT, not box width — a long name/microcopy string must
    // not fling the escape ring (and its leader line) halfway across the plot;
    // it only needs to clear one more row's worth of local obstruction.
    const ringStep = Math.max(16, Math.round(lineH * 1.8));

    let best = null, bestScore = Infinity, any = null, anyScore = Infinity;
    ringLoop:
    for(const off of [it.radius + gap, it.radius + gap + ringStep, it.radius + gap + ringStep * 2.4]){
      for(const dir of COMPASS){
        const box = boxAt(it.cx, it.cy, dir.dx, dir.dy, off, w, lineH);
        const score = scoreOf(box, placedBoxes, bubbles);
        if(score < anyScore){ anyScore = score; any = box; }
        if(inBounds(box, bounds)){
          if(score === 0){ best = box; bestScore = 0; break ringLoop; }
          if(score < bestScore){ best = box; bestScore = score; }
        }
      }
    }
    const chosen = best || any;
    placedBoxes.push(chosen);
    out[idx] = {...it, box: chosen, anchor: chosen.anchor, w, lineH, leader: chosen.off > it.radius + smallGap};
  }
  return out;
}

/* per-bet geometry + label payload — single source of truth for both the
   drawn marks (crosses/bubble/no-kill ring) and the label placer's inputs;
   pure given P (prep()'s output) + sim + geo. Exported so tests can build a
   real item set from an actual model without re-deriving the scale math. */
export function layoutBubbles(P, sim, geo){
  const {plotX0, plotY0, plotX1, plotY1, dark, rMin, rMax, microSize} = geo;
  const innerX0 = plotX0 + rMax, innerX1 = plotX1 - rMax;
  const innerY0 = plotY0 + rMax, innerY1 = plotY1 - rMax;
  const sx = v => innerX0 + v / 100 * (innerX1 - innerX0);
  const sy = v => innerY1 - (v - P.elo) / ((P.ehi - P.elo) || 1) * (innerY1 - innerY0);
  return P.flat.map(({b, gi}) => {
    const rec = recOf(sim, b), e = rec.ev;
    const [oLo, oHi] = oddsOf(b), oMid = (oLo + oHi) / 2;
    const stake = stakeMid(b);
    const radius = rMin + (rMax - rMin) * Math.sqrt(Math.max(0, stake / P.maxStake));
    return {
      b, gi, e, oLo, oHi, radius, hue: laneHue(gi, dark), kill: !!b.kill,
      cx: sx(oMid), cy: sy(e.p50), hx0: sx(oLo), hx1: sx(oHi), vy0: sy(e.p10), vy1: sy(e.p90),
      name: b.name, micro: microSize ? microFor(b) : null, stake, absEv: Math.abs(e.p50),
    };
  });
}

/* the whole chart body — plot box, zones, gridlines, bubbles+crosses, labels,
   legend — shared by wide and narrow (geo carries every sizing knob so the
   two callers differ only in numbers, not logic). Returns {parts, bottomY}. */
function plotAndLegend(model, sim, c, measure, P, geo){
  const {plotX0, plotY0, plotX1, plotY1, dark, rMax, nameSize, microSize, tickSize,
    axisTitleSize, legendSize, unit, padX, padTop} = geo;
  const {elo, ehi} = P;
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
  const capText = 'CERTAINTY ZONE — ODDS ≥ 90%';
  parts.push(txt(plotX1 - 6, plotY0 + tickSize + 6, capText, tickSize, c.muted,
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

  // per-bet marks (crosses + bubble + no-kill ring)
  const items = layoutBubbles(P, sim, geo);
  const marks = [];
  for(const it of items){
    marks.push('<line x1="' + r2(it.hx0) + '" y1="' + r2(it.cy) + '" x2="' + r2(it.hx1) + '" y2="' + r2(it.cy) +
      '" stroke="' + it.hue + '" stroke-width="1.5" stroke-opacity="0.55"/>');
    marks.push('<line x1="' + r2(it.cx) + '" y1="' + r2(it.vy0) + '" x2="' + r2(it.cx) + '" y2="' + r2(it.vy1) +
      '" stroke="' + it.hue + '" stroke-width="1.5" stroke-opacity="0.55"/>');
    marks.push('<circle data-key="' + esc(it.name) + '" cx="' + r2(it.cx) + '" cy="' + r2(it.cy) + '" r="' + r2(it.radius) + '" fill="' + it.hue +
      '" fill-opacity="0.32" stroke="' + it.hue + '" stroke-width="1.5"/>');
    if(!it.kill) marks.push('<circle cx="' + r2(it.cx) + '" cy="' + r2(it.cy) + '" r="' + r2(it.radius + 4) +
      '" fill="none" stroke="' + c.err + '" stroke-width="1.5" stroke-dasharray="3 3"/>');
  }
  parts.push(...marks);

  // labels: greedy free-space placement + leader lines (placeLabels above)
  const capFont = '700 ' + tickSize + 'px ' + SANS;
  const capW = measure(capText, capFont) + 8;
  const captionBox = {x: plotX1 - 6 - capW, y: plotY0 + 4, w: capW, h: tickSize + 6};
  const bounds = {x0: Math.max(2, plotX0 - (padX || 0)), x1: plotX1 + (padX || 0),
    y0: Math.max(2, plotY0 - (padTop || 0)), y1: plotY1};
  const placed = placeLabels(items, {bounds, measure, nameSize, microSize, gap: 6, avoid: [captionBox]});
  for(const p of placed){
    const tx = p.anchor === 'start' ? p.box.x : p.anchor === 'end' ? p.box.x + p.box.w : p.box.x + p.box.w / 2;
    if(p.leader){
      const L = leaderFor(p.cx, p.cy, p.radius, p.box);
      parts.push('<line x1="' + r2(L.x1) + '" y1="' + r2(L.y1) + '" x2="' + r2(L.x2) + '" y2="' + r2(L.y2) +
        '" stroke="' + c.muted + '" stroke-width="1" stroke-opacity="0.6"/>');
    }
    parts.push(txt(tx, p.box.y + nameSize, p.name, nameSize, c.ink, {weight: 600, anchor: p.anchor, halo: c.card}));
    if(p.micro) parts.push(txt(tx, p.box.y + nameSize + microSize + 3, p.micro, microSize, c.muted, {anchor: p.anchor, halo: c.card}));
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
  const nameOnly = P.flat.length > NAME_ONLY_THRESHOLD;
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
    dark, rMin: 10, rMax: 30, nameSize: 12.5, microSize: nameOnly ? null : 10, tickSize: 9.5, axisTitleSize: 10.5,
    legendSize: 9.5, unit: model.unit, padX: 16, padTop: 16};
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
    tickSize: 8.5, axisTitleSize: 9, legendSize: 8.5, unit: model.unit, padX: 10, padTop: 8};
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
