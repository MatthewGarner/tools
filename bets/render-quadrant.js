/* model + sim → read-only Allocation Plane (VIEW 2 of /bets). Board owns
   position editing and comparison; this view owns portfolio shape. Probability
   runs left-to-right and P50 outcome runs vertically through a single zero
   rule. Every Bet is one measured mark: horizontal odds interval, vertical
   P10–P90 interval, and a stake-weighted dot. A loss earns a red mark; a
   missing kill earns only its dashed ring. There are deliberately no coloured
   zones: guides establish geometry and colour stays semantic. Lane hues use
   the shared validated ramp. Dense work switches to source IDs plus a full
   in-plane key. The narrow projection preserves the same field, not a Board
   fallback; it remains read-only. */
import {esc, txt} from '../assets/svg.js';
import {PALETTES, niceTicks} from '../assets/series.js';
import {conditionReadings, measuredLines, quadrantDensity, sourceBets} from './layout.js';

const WIDE = 960;
const SANS = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif";
const MINUS = '−';
const r2 = n => Math.round(n * 100) / 100;
const num = v => (v < 0 ? MINUS : '') + Math.round(Math.abs(v));
const sgn = v => (v < 0 ? MINUS : '+') + Math.round(Math.abs(v));
const axisNum = v => Math.abs(v) < 1e-9 ? '0' : sgn(v);
const rng = r => !r ? '—' : r[0] === r[1] ? num(r[0]) : num(r[0]) + '–' + num(r[1]);
const pct = r => !r ? '—' : r[0] === r[1] ? r[0] + '%' : r[0] + '–' + r[1] + '%';
const recOf = (sim, b) => sim.bets.get(b.srcLine) || {ev: {p10: 0, p50: 0, p90: 0}, audits: [], scoreable: false};
const stakeMid = b => b.stake ? (b.stake[0] + b.stake[1]) / 2 : 0;
const oddsOf = b => b.odds || [0, 0];
const payoffOf = b => b.payoff || [0, 0];
const lossPct = pf => pf ? Math.round((pf.pLoss || 0) * 100) : null;

function conditionReceipt(readings, x0, y0, width, c, narrow){
  const gap = narrow ? 10 : 18, receiptW = (width - gap) / 2, h = narrow ? 72 : 58;
  const parts = [];
  [readings.baseline, readings.stress].forEach((item, i) => {
    const x = x0 + i * (receiptW + gap), pf = item.result, pl = lossPct(pf);
    parts.push('<g data-condition-receipt="" data-condition="' + item.key + '">');
    if(i) parts.push('<line x1="' + r2(x - gap / 2) + '" y1="' + (y0 + 2) + '" x2="' + r2(x - gap / 2) +
      '" y2="' + (y0 + h - 2) + '" stroke="' + c.border + '"/>');
    parts.push(txt(x, y0 + 13, item.label.toUpperCase(), narrow ? 8.5 : 8.2, c.muted,
      {weight: 700, tracking: '0.035em'}));
    parts.push(txt(x, y0 + 33, pl == null ? 'P(LOSES MONEY) —' : 'P(LOSES MONEY) ' + pl + '%', narrow ? 11 : 12.5,
      pl != null && pl >= 50 ? c.err : c.accentInk, {weight: 700, mono: true}));
    parts.push(txt(x, y0 + 50, pf ? 'MEDIAN OUTCOME ' + sgn(pf.p50) + ' · ' + sgn(pf.p10) + '–' + sgn(pf.p90) : 'ADD SCOREABLE BETS',
      narrow ? 8.2 : 8.6, c.ink, {weight: 600, mono: true}));
    if(narrow) parts.push(txt(x, y0 + 67, i ? 'Whole portfolio moves together' : 'Each bet resolves on its own', 8.5, c.muted));
    parts.push('</g>');
  });
  return {parts, height: h};
}

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
  const records = sourceBets(model, sim).map(record => ({...record, gi: record.groupIndex}));
  const flat = records.filter(record => record.rec.scoreable !== false);
  const unscored = records.filter(record => record.rec.scoreable === false);
  let elo = 0, ehi = 1, maxStake = 0, totalStake = 0;
  for(const {b} of flat){
    const e = recOf(sim, b).ev;
    elo = Math.min(elo, e.p10); ehi = Math.max(ehi, e.p90);
    const sm = stakeMid(b);
    maxStake = Math.max(maxStake, sm);
    totalStake += sm;
  }
  const epad = (ehi - elo) * 0.08 || 1;
  return {flat, unscored, elo: elo - epad, ehi: ehi + epad, maxStake: maxStake || 1, totalStake,
    pf: sim.portfolio, conditions: conditionReadings(sim)};
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
export const NAME_ONLY_THRESHOLD = 9;   // retained as the direct/key density boundary
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

export function labelsAreClear(placed, bounds, avoid = []){
  for(let i = 0; i < placed.length; i++){
    const p = placed[i];
    if(!inBounds(p.box, bounds)) return false;
    if(avoid.some(box => boxesOverlap(p.box, box))) return false;
    for(let j = i + 1; j < placed.length; j++) if(boxesOverlap(p.box, placed[j].box)) return false;
    for(const bubble of placed){
      const nx = Math.max(p.box.x, Math.min(bubble.cx, p.box.x + p.box.w));
      const ny = Math.max(p.box.y, Math.min(bubble.cy, p.box.y + p.box.h));
      if(Math.hypot(bubble.cx - nx, bubble.cy - ny) < bubble.radius - 0.01) return false;
    }
  }
  return true;
}

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
    const nameLines = it.nameLines || [it.name];
    const nameW = Math.max(...nameLines.map(line => measure(line, nameFont)));
    const microW = it.micro ? measure(it.micro, microFont) : 0;
    const w = Math.max(nameW, microW) + 4;
    const nameBlockH = nameLines.length * (nameSize + 3);
    const lineH = it.micro ? (nameBlockH + microSize + 3) : (nameBlockH + 1);
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
    out[idx] = {...it, nameLines, box: chosen, anchor: chosen.anchor, w, lineH,
      leader: chosen.off > it.radius + smallGap};
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
  return P.flat.map(({b, gi, id, sourceOrder}) => {
    const rec = recOf(sim, b), e = rec.ev;
    const [oLo, oHi] = oddsOf(b), oMid = (oLo + oHi) / 2;
    const stake = stakeMid(b);
    const radius = rMin + (rMax - rMin) * Math.sqrt(Math.max(0, stake / P.maxStake));
    return {
      b, gi, id, sourceOrder, e, oLo, oHi, radius, hue: laneHue(gi, dark), kill: !!b.kill,
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

  /* The plane stays as paper and rules. A shaded quadrant reads as a generic
     dashboard heatmap; here loss and certainty remain explicit facts at the
     zero rule and probability thresholds. */
  const zx1 = sx(10);
  const zx0 = sx(90);
  for(const x of [zx1, sx(25), sx(50), sx(75), zx0])
    parts.push('<line data-allocation-guide="" x1="' + r2(x) + '" y1="' + r2(plotY0) + '" x2="' + r2(x) + '" y2="' + r2(plotY1) +
      '" stroke="' + c.border + '" stroke-width="1" stroke-dasharray="2 4" stroke-opacity="0.82"/>');
  /* label sits in the top MARGIN of the plot box, not vertically centred in
     the zone strip — a bet that actually triggers "odds >= 90%" lands its
     bubble right in this column, so a full-height label would run straight
     through it. Right-anchored near the top keeps it clear of the typical
     bubble band and still reads as "about" the right-hand zone. */
  const capText = 'IMPLIED CERTAINTY — LOW ≥ 90%';
  const lowCapText = 'HIGH ≤ 10%';
  parts.push(txt(plotX1 - 6, plotY0 + tickSize + 6, capText, tickSize, c.muted,
    {weight: 700, anchor: 'end', tracking: '0.06em', halo: c.bg}));
  parts.push(txt(plotX0 + 6, plotY0 + tickSize + 6, lowCapText, tickSize, c.muted,
    {weight: 700, anchor: 'start', tracking: '0.06em', halo: c.bg}));

  // y gridlines + ticks (0 is always in-domain by construction — drawn prominent)
  for(const t of niceTicks(elo, ehi)){
    const y = sy(t), zero = Math.abs(t) < 1e-9;
    if(zero) parts.push('<line data-allocation-zero="" x1="' + r2(plotX0) + '" y1="' + r2(y) + '" x2="' + r2(plotX1) + '" y2="' + r2(y) +
      '" stroke="' + c.ink + '" stroke-width="1.5"/>');
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
      txt(ax, ay, 'P50 EV' + (unit ? ', ' + unit.toUpperCase() : ''), axisTitleSize, c.muted,
        {weight: 700, anchor: 'middle', tracking: '0.1em'}) + '</g>');
  }

  // per-bet marks (crosses + bubble + no-kill ring)
  const items = layoutBubbles(P, sim, geo);
  const marks = [];
  for(const it of items){
    const mark = it.e.p50 < 0 ? c.err : it.hue;
    marks.push('<g data-allocation-mark="" data-id="' + it.id + '">');
    marks.push('<line x1="' + r2(it.hx0) + '" y1="' + r2(it.cy) + '" x2="' + r2(it.hx1) + '" y2="' + r2(it.cy) +
      '" stroke="' + mark + '" stroke-width="1.5" stroke-opacity="0.55"/>');
    marks.push('<line x1="' + r2(it.cx) + '" y1="' + r2(it.vy0) + '" x2="' + r2(it.cx) + '" y2="' + r2(it.vy1) +
      '" stroke="' + mark + '" stroke-width="1.5" stroke-opacity="0.55"/>');
    marks.push('<circle data-key="' + it.id + '" cx="' + r2(it.cx) + '" cy="' + r2(it.cy) + '" r="' + r2(it.radius) + '" fill="' + mark +
      '" fill-opacity="0.22" stroke="' + mark + '" stroke-width="1.5"/>');
    if(!it.kill) marks.push('<circle cx="' + r2(it.cx) + '" cy="' + r2(it.cy) + '" r="' + r2(it.radius + 4) +
      '" fill="none" stroke="' + c.err + '" stroke-width="1.5" stroke-dasharray="3 3"/>');
    marks.push('</g>');
  }
  parts.push(...marks);

  // labels: greedy free-space placement + leader lines (placeLabels above)
  const capFont = '700 ' + tickSize + 'px ' + SANS;
  const capW = measure(capText, capFont) + 8;
  const captionBox = {x: plotX1 - 6 - capW, y: plotY0 + 4, w: capW, h: tickSize + 6};
  const lowCapW = measure(lowCapText, capFont) + 8;
  const lowCaptionBox = {x: plotX0 + 2, y: plotY0 + 4, w: lowCapW, h: tickSize + 6};
  const bounds = {x0: Math.max(2, plotX0 - (padX || 0)), x1: plotX1 + (padX || 0),
    y0: Math.max(2, plotY0 - (padTop || 0)), y1: plotY1};
  let keyBottom = 0;
  if(geo.key){
    for(const it of items){
      parts.push('<rect x="' + r2(it.cx - 13) + '" y="' + r2(it.cy - 7) + '" width="26" height="14" fill="' + c.card +
        '" stroke="' + it.hue + '" stroke-width="1"/>');
      parts.push(txt(it.cx, it.cy + 3, it.id, 7.5, c.ink, {weight: 700, mono: true, anchor: 'middle'}));
    }
    const K = geo.key;
    parts.push('<rect data-quadrant-key="" x="' + K.x0 + '" y="' + K.y0 + '" width="' + (K.x1 - K.x0) + '" height="' + K.height +
      '" fill="' + c.card + '" stroke="' + c.border + '"/>');
    parts.push(txt(K.x0 + 14, K.y0 + 24, 'FULL BET KEY · SOURCE ORDER', 10, c.accentInk, {weight: 700, tracking: '0.09em'}));
    let ky = K.y0 + 38;
    for(const row of K.rows){
      parts.push('<line x1="' + (K.x0 + 12) + '" y1="' + ky + '" x2="' + (K.x1 - 12) + '" y2="' + ky + '" stroke="' + c.border + '"/>');
      parts.push(txt(K.x0 + 14, ky + 20, row.id, 9.5, row.hue, {weight: 700, mono: true}));
      row.nameLines.forEach((line, i) => parts.push(txt(K.x0 + 58, ky + 19 + i * 14, line, 11.5, c.ink, {weight: 600})));
      parts.push(txt(K.x0 + 58, ky + 21 + row.nameLines.length * 14, row.micro, 9.5, c.muted, {mono: true}));
      ky += row.height;
    }
    keyBottom = K.y0 + K.height;
  } else {
    const placed = geo.placed || placeLabels(items, {bounds, measure, nameSize, microSize, gap: 6, avoid: [captionBox, lowCaptionBox]});
    for(const p of placed){
      const tx = p.anchor === 'start' ? p.box.x : p.anchor === 'end' ? p.box.x + p.box.w : p.box.x + p.box.w / 2;
      if(p.leader){
        const L = leaderFor(p.cx, p.cy, p.radius, p.box);
        parts.push('<line x1="' + r2(L.x1) + '" y1="' + r2(L.y1) + '" x2="' + r2(L.x2) + '" y2="' + r2(L.y2) +
          '" stroke="' + c.muted + '" stroke-width="1" stroke-opacity="0.6"/>');
      }
      p.nameLines.forEach((line, i) => parts.push(txt(tx, p.box.y + nameSize + i * (nameSize + 3), line,
        nameSize, c.ink, {weight: 600, anchor: p.anchor, halo: c.bg})));
      if(p.micro) parts.push(txt(tx, p.box.y + p.nameLines.length * (nameSize + 3) + microSize,
        p.micro, microSize, c.muted, {anchor: p.anchor, halo: c.bg}));
    }
  }

  // legend: lane swatches + mark-language notes, flow-wrapped
  const legendFont = '700 ' + legendSize + 'px ' + SANS;
  const legendItems = model.groups.map((g, gi) => ({text: '● ' + g.name.toUpperCase(), color: laneHue(gi, dark)}));
  legendItems.push({text: '⊘ dashed ring = no kill criterion', color: c.err});
  legendItems.push({text: '○ bubble area ∝ stake', color: c.muted});
  let lx = plotX0, ly = Math.max(plotY1 + 4 + tickSize + 2 + axisTitleSize + 22, keyBottom ? keyBottom + 20 : 0);
  const rowH = legendSize + 8;
  for(const it of legendItems){
    const w = measure(it.text, legendFont) + 20;
    if(lx + w - 20 > plotX1 && lx > plotX0){ lx = plotX0; ly += rowH; }
    parts.push(txt(lx, ly, it.text, legendSize, it.color, {weight: 700, tracking: '0.02em'}));
    lx += w;
  }
  return {parts, bottomY: ly + 6};
}

function makeKey(P, geo, measure, x0, x1, y0){
  const nameWidth = x1 - x0 - 72;
  const rows = P.flat.map(record => {
    const lines = measuredLines(record.b.name, '600 11.5px ' + SANS, nameWidth, measure);
    return {id: record.id, hue: laneHue(record.gi, geo.dark), nameLines: lines, micro: microFor(record.b),
      height: Math.max(42, 28 + lines.length * 14)};
  });
  return {x0, x1, y0, rows, height: 38 + rows.reduce((sum, row) => sum + row.height, 0) + 10};
}

function directPlacement(P, sim, geo, measure){
  const maxNameWidth = 180;
  const lines = P.flat.map(record => measuredLines(record.b.name, '600 ' + geo.nameSize + 'px ' + SANS, maxNameWidth, measure));
  if(lines.some(value => value.length > 2)) return null;
  const items = layoutBubbles(P, sim, geo).map((item, i) => ({...item, nameLines: lines[i]}));
  const bounds = {x0: Math.max(2, geo.plotX0 - (geo.padX || 0)), x1: geo.plotX1 + (geo.padX || 0),
    y0: Math.max(2, geo.plotY0 - (geo.padTop || 0)), y1: geo.plotY1};
  const capText = 'IMPLIED CERTAINTY — LOW ≥ 90%';
  const capW = measure(capText, '700 ' + geo.tickSize + 'px ' + SANS) + 8;
  const lowCapText = 'HIGH ≤ 10%';
  const lowCapW = measure(lowCapText, '700 ' + geo.tickSize + 'px ' + SANS) + 8;
  /* The zero rule is the plane's hinge. A label may lead toward it, but the
     type itself never sits on it: reserve a real quiet gutter, not a halo
     that merely hides the clash after the fact. */
  const zeroY = geo.plotY1 - (0 - P.elo) / ((P.ehi - P.elo) || 1) * (geo.plotY1 - geo.plotY0);
  const avoid = [
    {x: geo.plotX1 - 6 - capW, y: geo.plotY0 + 4, w: capW, h: geo.tickSize + 6},
    {x: geo.plotX0 + 2, y: geo.plotY0 + 4, w: lowCapW, h: geo.tickSize + 6},
    {x: bounds.x0, y: zeroY - 16, w: bounds.x1 - bounds.x0, h: 32},
  ];
  const placed = placeLabels(items, {bounds, measure, nameSize: geo.nameSize, microSize: geo.microSize, gap: 6, avoid});
  return labelsAreClear(placed, bounds, avoid) ? placed : null;
}

/* ---------------- WIDE ---------------- */
function renderWide(model, sim, ctx){
  const c = ctx.colors, measure = ctx.measure || ((s) => String(s).length * 7);
  const dark = !!ctx.dark;
  const P = prep(model, sim);
  const pl = lossPct(P.pf);
  const nameOnly = P.flat.length > NAME_ONLY_THRESHOLD;
  const parts = [];
  const right = 930;

  parts.push('<text x="30" y="52" font-family="\'Helvetica Neue\',Helvetica,\'Segoe UI\',Roboto,sans-serif" font-size="24" fill="' + c.ink + '">' +
      esc(model.title || 'Bets board') + '</text>');
  parts.push(txt(30, 74, P.flat.length + ' BETS · ' + model.groups.length + ' LANES · TOTAL STAKE ' + num(P.totalStake),
    10, c.muted, {mono: true, tracking: '0.05em'}));
  const receipt = conditionReceipt(P.conditions, 460, 16, right - 460, c, false);
  parts.push(...receipt.parts);

  let panelTop = 102;
  if(P.unscored.length){
    const copy = 'NOT SCORED · ' + P.unscored.map(record => record.id + ' ' + record.b.name).join(', ');
    for(const line of measuredLines(copy, '700 9px ' + SANS, right - 60, measure)){
      parts.push(txt(30, panelTop + 12, line, 9, c.err, {weight: 700, tracking: '0.03em'}));
      panelTop += 13;
    }
    panelTop += 5;
  }
  let geo = {plotX0: 92, plotY0: panelTop + 22, plotX1: right - 4, plotY1: panelTop + 22 + 400,
    dark, rMin: 10, rMax: 30, nameSize: 12.5, microSize: nameOnly ? null : 10, tickSize: 9.5, axisTitleSize: 10.5,
    legendSize: 9.5, unit: model.unit, padX: 16, padTop: 16};
  const density = quadrantDensity(P.flat.length);
  const placed = density === 'keyed' ? null : directPlacement(P, sim, geo, measure);
  if(!placed){
    geo = {...geo, plotX1: 590, microSize: null};
    geo.key = makeKey(P, geo, measure, 620, right, geo.plotY0);
  } else geo.placed = placed;
  const {parts: body, bottomY} = plotAndLegend(model, sim, c, measure, P, geo);

  const panelBot = bottomY + 14;
  parts.push(...body);
  parts.push(txt(30, panelBot + 22, 'PER-BET P50 EV · BOTH PORTFOLIO CONDITIONS SHOWN · RANGES ARE P10–P90 FROM 4,000 SEEDED RUNS', 9, c.muted, {tracking: '0.04em'}));
  parts.push(txt(right, panelBot + 22, 'ALL FIGURES ' + (model.unit || '').toUpperCase(), 9, c.muted, {anchor: 'end', tracking: '0.05em'}));

  const H = panelBot + 40;
  const stress = P.conditions.stress.result;
  return svgShell(WIDE, H, c, parts.join(''), false,
    model.title || 'Bets quadrant',
    'Risk-return view. ' + P.conditions.baseline.label + ': ' + (P.pf ? pl + '% lose money, median outcome ' + sgn(P.pf.p50) : 'not available') + '. ' +
      P.conditions.stress.label + ': ' + (stress ? lossPct(stress) + '% lose money, median outcome ' + sgn(stress.p50) : 'not available') +
      '. The horizontal axis is odds of success; the vertical axis is per-bet P50 expected value. Implied-certainty zones cover odds ranges wholly at or below 10%, or wholly at or above 90%.');
}

/* ---------------- NARROW: square-ish plot fit to the width ---------------- */
function renderNarrow(model, sim, ctx){
  const c = ctx.colors, measure = ctx.measure || ((s) => String(s).length * 7);
  const dark = !!ctx.dark;
  const W = Math.max(300, Math.round(ctx.width)), pad = 16;
  const P = prep(model, sim);
  const pl = lossPct(P.pf);
  const parts = [];
  let y = 30;
  const titleLines = measuredLines(model.title || 'Bets board', '600 21px ' + SANS, W - pad * 2, measure);
  titleLines.forEach((line, i) => parts.push('<text data-bets-title-line="" x="' + pad + '" y="' + (y + i * 24) +
    '" font-family="\'Helvetica Neue\',Helvetica,\'Segoe UI\',Roboto,sans-serif" font-size="21" font-weight="600" fill="' + c.ink + '">' +
    esc(line) + '</text>'));
  y += titleLines.length * 24 - 2;
  parts.push(txt(pad, y, P.flat.length + ' bets · ' + model.groups.length + ' lanes · stake ' + num(P.totalStake), 11, c.muted)); y += 12;
  const receipt = conditionReceipt(P.conditions, pad, y, W - pad * 2, c, true);
  parts.push(...receipt.parts); y += receipt.height + 12;
  if(P.unscored.length){
    const copy = 'NOT SCORED · ' + P.unscored.map(record => record.id + ' ' + record.b.name).join(', ');
    for(const line of measuredLines(copy, '700 9px ' + SANS, W - pad * 2, measure)){
      parts.push(txt(pad, y, line, 9, c.err, {weight: 700})); y += 13;
    }
    y += 4;
  }

  const plotX0 = pad + 40, plotX1 = W - pad - 4, plotW = plotX1 - plotX0;
  const plotY0 = y + 4, plotY1 = plotY0 + plotW;   // square-ish: height ≈ width
  const geo = {plotX0, plotY0, plotX1, plotY1, dark, rMin: 6, rMax: 16, nameSize: 11, microSize: null,
    // The narrow surface can be scaled a little by the workspace chrome; keep
    // its smallest authored labels above the 8px displayed legibility floor.
    tickSize: 9, axisTitleSize: 9.5, legendSize: 9, unit: model.unit, padX: 10, padTop: 8};
  const density = quadrantDensity(P.flat.length);
  const placed = density === 'keyed' ? null : directPlacement(P, sim, geo, measure);
  if(!placed) geo.key = makeKey(P, geo, measure, pad, W - pad, plotY1 + 42);
  else geo.placed = placed;
  const {parts: body, bottomY} = plotAndLegend(model, sim, c, measure, P, geo);
  parts.push(...body);
  parts.push('<rect data-narrow="" width="0" height="0" fill="none"/>');
  const stress = P.conditions.stress.result;
  return svgShell(W, bottomY + 20, c, parts.join(''), true,
    model.title || 'Bets quadrant',
    'Risk-return view. ' + P.conditions.baseline.label + ': ' + (P.pf ? pl + '% lose money, median outcome ' + sgn(P.pf.p50) : 'not available') + '. ' +
      P.conditions.stress.label + ': ' + (stress ? lossPct(stress) + '% lose money, median outcome ' + sgn(stress.p50) : 'not available') + '.');
}

function svgShell(W, H, c, inner, narrow, title = 'Bets quadrant', desc = 'A risk-return view of explicit portfolio bets.'){
  H = Math.ceil(H);
  return '<svg data-bets-surface="allocation-plane" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + W + ' ' + H + '" width="' + W + '" height="' + H +
    '" font-family="' + SANS + '" role="img" aria-labelledby="bets-quadrant-title bets-quadrant-desc"><title id="bets-quadrant-title">' +
    esc(title) + '</title><desc id="bets-quadrant-desc">' + esc(desc) + '</desc><rect width="' + W + '" height="' + H + '" fill="' + c.bg + '"/>' + inner + '</svg>';
}
