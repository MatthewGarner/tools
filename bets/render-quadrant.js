/* Pure model + sim → read-only Allocation Plane. Odds run horizontally, P50
   vertically; every Bet is one measured mark. Guides carry geometry; colour
   is reserved for loss and the missing-kill ring. */
import {esc} from '../assets/svg.js';
import {SANS, MONO_FONT, txt, useFace} from './face.js';
import {PALETTES, niceTicks} from '../assets/series.js';
import {conditionReadings, measuredLines, quadrantDensity, sourceBets} from './layout.js';
import {NSIM_TEXT, outcomeText, sgn, pv, amount, lossText, lossIsHigh, p50Text, p50Alt, stakeOf, payoffOf, oddsOf} from './format.js';

const WIDE = 960;
const r2 = n => Math.round(n * 100) / 100;
const axisNum = v => Math.abs(v) < 1e-9 ? '0' : sgn(v);
const recOf = (sim, b) => sim.bets.get(b.srcLine) || {ev: {p10: 0, p50: 0, p90: 0}, audits: [], scoreable: false};
const stakeMid = b => b.stake ? (b.stake[0] + b.stake[1]) / 2 : 0;
const oddsRange = b => b.odds || [0, 0];
const lossAlt = pf => lossText(pf) + ' lose money, ' + p50Alt(pf);

function conditionReceipt(readings, x0, y0, width, c, narrow, measure){
  const gap = narrow ? 10 : 18, receiptW = (width - gap) / 2;
  const parts = [];
  /* narrow: the whole condition, wrapped, so the stress is never described as more than it is */
  const captionOf = item => measuredLines(item.condition, '8.5px ' + SANS, receiptW, s => String(s).length * 4.3);
  /* the reading is worded as on the Board ("P10 −360 · P90 +390"); where it is wider than its column it takes a second line */
  const medFont = (narrow ? 8.2 : 8.6) + 'px ' + MONO_FONT;
  const medOf = item => item.result ? measuredLines(outcomeText(item.result), medFont, receiptW, measure) : ['ADD SCOREABLE BETS'];
  const medLines = Math.max(...[readings.baseline, readings.stress].map(item => medOf(item).length));
  const extra = (medLines - 1) * 10;
  const h = (narrow ? 67 + 10 * Math.max(...[readings.baseline, readings.stress].map(item => captionOf(item).length)) : 58) + extra;
  [readings.baseline, readings.stress].forEach((item, i) => {
    const x = x0 + i * (receiptW + gap), pf = item.result;
    parts.push('<g data-condition-receipt="" data-condition="' + item.key + '">');
    if(i) parts.push('<line x1="' + r2(x - gap / 2) + '" y1="' + (y0 + 2) + '" x2="' + r2(x - gap / 2) +
      '" y2="' + (y0 + h - 2) + '" stroke="' + c.border + '"/>');
    parts.push(txt(x, y0 + 13, item.label.toUpperCase(), narrow ? 8.5 : 8.2, c.muted,
      {weight: 700, tracking: '0.035em'}));
    parts.push(txt(x, y0 + 33, !pf ? 'P(LOSES MONEY) —' : 'P(LOSES MONEY) ' + lossText(pf), narrow ? 11 : 12.5,
      lossIsHigh(pf) ? c.err : c.accentInk, {weight: 700, mono: true}));
    medOf(item).forEach((ln, li) => parts.push(txt(x, y0 + 50 + li * 10, ln, narrow ? 8.2 : 8.6, c.ink, {weight: 600, mono: true})));
    if(narrow) captionOf(item).forEach((line, li) => parts.push(txt(x, y0 + 67 + extra + li * 10, line, 8.5, c.muted)));
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
  useFace(ctx);
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

const microFor = b => stakeOf(b) + ' @ ' + oddsOf(b) + ' · pays ' + payoffOf(b);

/* Measured labels try compass anchors from snug to escape rings. They never
   disappear: the least-overlap in-bounds candidate is the final fallback. */
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
  /* a bubble is kept clear by its bounding square (what a viewer's eye and a checker both take as its extent) */
  for(const bub of bubbles) s += overlapArea(box, {x: bub.cx - bub.r, y: bub.cy - bub.r, w: bub.r * 2, h: bub.r * 2}) * 2;
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
export function placeLabels(items, {bounds, measure, nameSize, microSize, gap = 6, avoid = [], strict = false}){
  const nameFont = '600 ' + nameSize + 'px ' + SANS;
  const microFont = (microSize || nameSize) + 'px ' + SANS;
  const smallGap = gap + 1;   // snug tolerance: ring-1's own offset must read as "no leader"

  const order = items.map((it, idx) => ({it, idx}))
    .sort((a, b) => (b.it.stake - a.it.stake) || (Math.abs(b.it.absEv) - Math.abs(a.it.absEv)) || (a.idx - b.idx));

  const placedBoxes = avoid.slice();
  const bubbles = items.map(it => ({cx: it.cx, cy: it.cy, r: it.radius + 5}));   // the no-kill ring reaches 4px out
  const out = new Array(items.length);

  for(const {it, idx} of order){
    const nameLines = it.nameLines || [it.name];
    const nameW = Math.max(...nameLines.map(line => measure(line, nameFont)));
    const microW = it.micro ? measure(it.micro, microFont) : 0;
    const w = Math.max(nameW, microW) + 8;
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
    /* strict: a label with no clear place is not forced onto one — it is left out (`unplaced`) and the caller prints the
       bet's number there instead, with a key that names it */
    if(strict && bestScore !== 0){ out[idx] = {...it, nameLines, box: null, unplaced: true}; continue; }
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
  const innerX0 = plotX0 + rMax + 5, innerX1 = plotX1 - rMax - 5;   // the no-kill ring (4px out) and strokes stay inside the plot
  const innerY0 = plotY0 + rMax, innerY1 = plotY1 - rMax;
  const sx = v => innerX0 + v / 100 * (innerX1 - innerX0);
  const sy = v => innerY1 - (v - P.elo) / ((P.ehi - P.elo) || 1) * (innerY1 - innerY0);
  const items = P.flat.map(({b, gi, id, sourceOrder}) => {
    const rec = recOf(sim, b), e = rec.ev;
    const [oLo, oHi] = oddsRange(b), oMid = (oLo + oHi) / 2;
    const stake = stakeMid(b);
    const radius = rMin + (rMax - rMin) * Math.sqrt(Math.max(0, stake / P.maxStake));
    return {
      b, gi, id, sourceOrder, e, oLo, oHi, radius, hue: laneHue(gi, dark), kill: !!b.kill,
      cx: sx(oMid), cy: sy(e.p50), hx0: sx(oLo), hx1: sx(oHi), vy0: sy(e.p10), vy1: sy(e.p90),
      name: b.name, micro: microSize ? microFor(b) : null, stake, absEv: Math.abs(e.p50),
    };
  });
  return fanOut(items);
}

/* Bets with the same odds and the same P50 sit on one point and would hide one another. Each keeps its whiskers on the true
   point (tx, ty) and its bubble moves onto a small ring around it, in source order from the top, so every one is seen. */
export function fanOut(items){
  const groups = new Map();
  for(const it of items){
    const key = r2(it.cx) + '|' + r2(it.cy);
    (groups.get(key) || groups.set(key, []).get(key)).push(it);
  }
  for(const it of items){ it.tx = it.cx; it.ty = it.cy; }
  for(const group of groups.values()){
    const k = group.length;
    if(k < 2) continue;
    const biggest = Math.max(...group.map(it => it.radius));
    const ring = Math.min(90, Math.max(10, (biggest + 5) / Math.sin(Math.PI / k)));   // far enough that no no-kill ring touches a neighbour's number
    group.forEach((it, i) => {
      const a = -Math.PI / 2 + 2 * Math.PI * i / k;
      it.cx += Math.cos(a) * ring; it.cy += Math.sin(a) * ring; it.fanned = true;
    });
  }
  return items;
}

/* An axis-aligned line cut where boxes lie across it, so the line runs up to a label or chip and resumes beyond it instead of
   running through the text. Returns [[x1, y1, x2, y2], …]. */
export function lineSegments(x1, y1, x2, y2, blockers, pad = 2){
  const horizontal = Math.abs(y1 - y2) < 0.01;
  let spans = [[horizontal ? Math.min(x1, x2) : Math.min(y1, y2), horizontal ? Math.max(x1, x2) : Math.max(y1, y2)]];
  const at = horizontal ? y1 : x1;
  for(const b of blockers){
    const [across0, across1] = horizontal ? [b.y - pad, b.y + b.h + pad] : [b.x - pad, b.x + b.w + pad];
    if(at < across0 || at > across1) continue;
    const [b0, b1] = horizontal ? [b.x - pad, b.x + b.w + pad] : [b.y - pad, b.y + b.h + pad];
    spans = spans.flatMap(([a, z]) => (b1 <= a || b0 >= z) ? [[a, z]]
      : [[a, Math.min(z, b0)], [Math.max(a, b1), z]].filter(([m, n]) => n - m > 6));   // a stub shorter than this is only noise
  }
  return spans.map(([a, z]) => horizontal ? [a, y1, z, y2] : [x1, a, x2, z]);
}

/* Which bets get a name beside their bubble and which get their number (B07). A label is placed only where it is clear of
   every bubble, every other label, the zone captions, the zero rule and every whisker; a bet with no clear place, a name too
   long for two lines, or any bet at all in a crowded plane (more than nine), prints its number in a chip on the bubble and is
   named in the key below the plot. Returns one entry per item, in order: {…item, nameLines, box, anchor, leader} or {…item, unplaced: true}. */
export function labelPlan(items, geo, measure, extraAvoid = []){
  const {nameSize, microSize} = geo;
  if(quadrantDensity(items.length) === 'keyed') return items.map(it => ({...it, unplaced: true}));
  const nameFont = '600 ' + nameSize + 'px ' + SANS;
  const lines = items.map(it => measuredLines(it.name, nameFont, 180, measure));
  const whiskers = [];
  for(const it of items){
    whiskers.push({x: it.hx0, y: it.ty - 1.5, w: Math.max(3, it.hx1 - it.hx0), h: 3});
    whiskers.push({x: it.tx - 1.5, y: it.vy1, w: 3, h: Math.max(3, it.vy0 - it.vy1)});
  }
  const bounds = {x0: Math.max(2, geo.plotX0 - (geo.padX || 0)), x1: geo.plotX1,
    y0: Math.max(2, geo.plotY0 - (geo.padTop || 0)), y1: geo.plotY1};
  /* The zero rule is the plane's hinge. A label may lead toward it, but the type itself never sits on it. */
  const zeroY = geo.zeroY;
  const avoid = [...captionBoxes(geo, measure), ...extraAvoid, ...whiskers];
  if(zeroY != null) avoid.push({x: bounds.x0, y: zeroY - 16, w: bounds.x1 - bounds.x0, h: 32});
  const candidates = items.map((it, i) => ({...it, nameLines: lines[i], i})).filter(it => it.nameLines.length <= 2);
  const placed = placeLabels(candidates, {bounds, measure, nameSize, microSize, gap: 6, avoid, strict: true});
  const byIndex = new Map(placed.map(p => [p.i, p]));
  return items.map((it, i) => byIndex.has(i) && !byIndex.get(i).unplaced ? byIndex.get(i) : {...it, unplaced: true});
}

/* the two zone captions at the top of the plot */
const CAP_HIGH = 'HIGH ODDS OF SUCCESS: 90% OR MORE';
const CAP_LOW = 'LOW ODDS OF SUCCESS: 10% OR LESS';
function captionBoxes(geo, measure){
  const font = '700 ' + geo.tickSize + 'px ' + SANS;
  const hw = measure(CAP_HIGH, font) + 8, lw = measure(CAP_LOW, font) + 8;
  return [{x: geo.plotX1 - 6 - hw, y: geo.plotY0 + 4, w: hw, h: geo.tickSize + 6},
    {x: geo.plotX0 + 2, y: geo.plotY0 + 4, w: lw, h: geo.tickSize + 6}];
}

const CHIP = {w: 28, h: 15};
const chipBox = it => ({x: (it.chipX ?? it.cx) - CHIP.w / 2, y: (it.chipY ?? it.cy) - CHIP.h / 2, w: CHIP.w, h: CHIP.h});

/* Number chips of bubbles that sit close together would print over one another. Each starts on its bubble and is pushed
   apart from any chip it overlaps, a little at a time, never further than `maxMove` from its own bubble and never out of the
   plot; a chip that moved is joined to its bubble by a short line. Deterministic: the same bets give the same places. */
export function spreadChips(chips, {bounds, w = CHIP.w, h = CHIP.h, gap = 2, maxMove = 90, rounds = 200} = {}){
  const spots = chips.map(c => ({x: c.cx, y: c.cy}));
  for(let round = 0; round < rounds; round++){
    let moved = false;
    for(let i = 0; i < spots.length; i++) for(let j = i + 1; j < spots.length; j++){
      const dx = spots[j].x - spots[i].x, dy = spots[j].y - spots[i].y;
      const ox = w + gap - Math.abs(dx), oy = h + gap - Math.abs(dy);
      if(ox <= 0 || oy <= 0) continue;
      moved = true;
      const horizontal = Math.abs(dx) / w >= Math.abs(dy) / h;   // along the axis the pair is already more separated on
      const sign = (horizontal ? dx : dy) !== 0 ? Math.sign(horizontal ? dx : dy) : ((i + j) % 2 ? 1 : -1);
      const push = (horizontal ? ox : oy) / 2 + 0.25;
      if(horizontal){ spots[i].x -= sign * push; spots[j].x += sign * push; }
      else { spots[i].y -= sign * push; spots[j].y += sign * push; }
    }
    chips.forEach((c, i) => {
      const s = spots[i], d = Math.hypot(s.x - c.cx, s.y - c.cy);
      if(d > maxMove){ s.x = c.cx + (s.x - c.cx) / d * maxMove; s.y = c.cy + (s.y - c.cy) / d * maxMove; }
      if(bounds){
        s.x = Math.min(bounds.x1 - w / 2, Math.max(bounds.x0 + w / 2, s.x));
        s.y = Math.min(bounds.y1 - h / 2, Math.max(bounds.y0 + h / 2, s.y));
      }
    });
    if(!moved) break;
  }
  chips.forEach((c, i) => { c.chipX = spots[i].x; c.chipY = spots[i].y; });
  return chips;
}
const line = (x1, y1, x2, y2, attrs) => '<line' + (attrs.first ? ' data-allocation-guide=""' : attrs.part ? ' data-allocation-guide-part=""' : '') + ' x1="' + r2(x1) + '" y1="' + r2(y1) + '" x2="' + r2(x2) + '" y2="' + r2(y2) + '"' + attrs.rest + '/>';
/* the segments of one line, as markup (the first piece of a guide carries the marker the tests and tools look for) */
function pieces(x1, y1, x2, y2, blockers, rest, marker){
  return lineSegments(x1, y1, x2, y2, blockers).map((seg, i) =>
    line(seg[0], seg[1], seg[2], seg[3], {rest, first: marker && i === 0, part: marker && i > 0})).join('');
}

/* the whole chart body — plot box, zones, gridlines, bubbles+whiskers, labels or numbers, legend, key — shared by wide and
   narrow (geo carries every sizing knob so the two callers differ only in numbers, not logic). Returns {parts, bottomY}. */
function plotAndLegend(model, sim, c, measure, P, geo){
  const {plotX0, plotY0, plotX1, plotY1, dark, rMax, nameSize, microSize, tickSize,
    axisTitleSize, legendSize, unit} = geo;
  const {elo, ehi} = P;
  const innerX0 = plotX0 + rMax + 5, innerX1 = plotX1 - rMax - 5;
  const innerY0 = plotY0 + rMax, innerY1 = plotY1 - rMax;
  const sx = v => innerX0 + v / 100 * (innerX1 - innerX0);
  const sy = v => innerY1 - (v - elo) / ((ehi - elo) || 1) * (innerY1 - innerY0);
  const parts = [];

  const items = layoutBubbles(P, sim, geo);
  const zeroY = sy(0);
  const plan = labelPlan(items, {...geo, zeroY}, measure);
  const keyed = plan.filter(p => p.unplaced);
  spreadChips(keyed, {bounds: {x0: plotX0, x1: plotX1, y0: plotY0, y1: plotY1}});
  /* A number is printed on the plot only where it sits clear of every other bubble and every other number. At this density
     (64 bets) the rest are left unnumbered on the plot, named in the key below, and the picture says how many. */
  const chips = [], square = it => ({x: it.cx - it.radius - 5, y: it.cy - it.radius - 5, w: (it.radius + 5) * 2, h: (it.radius + 5) * 2});
  for(const it of keyed.slice().sort((a, b) => (b.stake - a.stake) || (a.sourceOrder - b.sourceOrder))){
    const box = chipBox(it);
    const clear = !plan.some(o => o !== it && boxesOverlap(box, square(o))) && !chips.some(o => boxesOverlap(box, chipBox(o)));
    if(clear) chips.push(it);
  }
  chips.sort((a, b) => a.sourceOrder - b.sourceOrder);
  const keyOnly = keyed.filter(it => !chips.includes(it));
  const labelled = plan.filter(p => !p.unplaced);
  /* what a line must not run through: every label, both zone captions, every chip */
  const labelBoxes = labelled.map(p => ({x: p.box.x, y: p.box.y, w: p.box.w, h: p.box.h}));
  const blockers = [...labelBoxes, ...captionBoxes(geo, measure), ...chips.map(chipBox)];

  /* The plane stays as paper and rules. A shaded quadrant reads as a generic
     dashboard heatmap; here loss and certainty remain explicit facts at the
     zero rule and probability thresholds. */
  for(const v of [10, 25, 50, 75, 90])
    parts.push(pieces(sx(v), plotY0, sx(v), plotY1, blockers,
      ' stroke="' + c.border + '" stroke-width="1" stroke-dasharray="2 4" stroke-opacity="0.82"', true));
  /* the zone captions sit in the top margin of the plot box, clear of the bubble band */
  parts.push(txt(plotX1 - 6, plotY0 + tickSize + 6, CAP_HIGH, tickSize, c.muted,
    {weight: 700, anchor: 'end', tracking: '0.06em', halo: c.bg}));
  parts.push(txt(plotX0 + 6, plotY0 + tickSize + 6, CAP_LOW, tickSize, c.muted,
    {weight: 700, anchor: 'start', tracking: '0.06em', halo: c.bg}));

  // y ticks (0 is always in-domain by construction — drawn prominent)
  for(const t of niceTicks(elo, ehi)){
    const y = sy(t), zero = Math.abs(t) < 1e-9;
    if(zero) parts.push(lineSegments(plotX0, y, plotX1, y, blockers).map(seg =>
      '<line data-allocation-zero="" x1="' + r2(seg[0]) + '" y1="' + r2(seg[1]) + '" x2="' + r2(seg[2]) + '" y2="' + r2(seg[3]) +
      '" stroke="' + c.ink + '" stroke-width="1.5"/>').join(''));
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

  // per-bet marks (whiskers + bubble + no-kill ring); a whisker stops where a number chip sits on it
  const chipBoxes = chips.map(chipBox);
  const marks = [];
  for(const it of items){
    const mark = it.e.p50 < 0 ? c.err : it.hue;
    const stroke = ' stroke="' + mark + '" stroke-width="1.5" stroke-opacity="0.55"';
    marks.push('<g data-allocation-mark="" data-id="' + it.id + '">');
    marks.push(pieces(it.hx0, it.ty, it.hx1, it.ty, chipBoxes, stroke, false));
    marks.push(pieces(it.tx, it.vy0, it.tx, it.vy1, chipBoxes, stroke, false));
    marks.push('<circle data-key="' + it.id + '" cx="' + r2(it.cx) + '" cy="' + r2(it.cy) + '" r="' + r2(it.radius) + '" fill="' + mark +
      '" fill-opacity="0.22" stroke="' + mark + '" stroke-width="1.5"/>');
    if(!it.kill) marks.push('<circle cx="' + r2(it.cx) + '" cy="' + r2(it.cy) + '" r="' + r2(it.radius + 4) +
      '" fill="none" stroke="' + c.err + '" stroke-width="1.5" stroke-dasharray="3 3"/>');
    marks.push('</g>');
  }
  parts.push(...marks);

  // names beside their bubbles, with a leader where the label is not snug
  for(const p of labelled){
    const tx = p.anchor === 'start' ? p.box.x : p.anchor === 'end' ? p.box.x + p.box.w : p.box.x + p.box.w / 2;
    if(p.leader){
      const L = leaderFor(p.cx, p.cy, p.radius, p.box);
      parts.push('<line x1="' + r2(L.x1) + '" y1="' + r2(L.y1) + '" x2="' + r2(L.x2) + '" y2="' + r2(L.y2) +
        '" stroke="' + c.muted + '" stroke-width="1" stroke-opacity="0.6"/>');
    }
    p.nameLines.forEach((ln, i) => parts.push(txt(tx, p.box.y + nameSize + i * (nameSize + 3), ln,
      nameSize, c.ink, {weight: 600, anchor: p.anchor, halo: c.bg})));
    if(p.micro) parts.push(txt(tx, p.box.y + p.nameLines.length * (nameSize + 3) + microSize,
      p.micro, microSize, c.muted, {anchor: p.anchor, halo: c.bg}));
  }
  // numbers for the rest: every leader first, then every chip, so no line is ever drawn over a number
  for(const it of chips){
    const bx = it.chipX ?? it.cx, by = it.chipY ?? it.cy;
    if(Math.hypot(bx - it.cx, by - it.cy) > 3)   // a chip that moved off its bubble is joined to it
      parts.push('<line x1="' + r2(it.cx) + '" y1="' + r2(it.cy) + '" x2="' + r2(bx) + '" y2="' + r2(by) +
        '" stroke="' + it.hue + '" stroke-width="1" stroke-opacity="0.7"/>');
  }
  for(const it of chips){
    const bx = it.chipX ?? it.cx, by = it.chipY ?? it.cy;
    parts.push('<rect x="' + r2(bx - CHIP.w / 2) + '" y="' + r2(by - CHIP.h / 2) + '" width="' + CHIP.w + '" height="' + CHIP.h +
      '" fill="' + c.card + '" stroke="' + it.hue + '" stroke-width="1"/>');
    parts.push(txt(bx, by + 3, it.id, 7.5, c.ink, {weight: 700, mono: true, anchor: 'middle'}));
  }

  // legend: lane swatches + mark-language notes, flow-wrapped; each mark is drawn as the shape it names (a glyph would fall
  // outside the embedded face)
  const legendFont = '700 ' + legendSize + 'px ' + SANS;
  const legendItems = model.groups.map((g, gi) => ({text: g.name.toUpperCase(), color: laneHue(gi, dark), shape: 'dot'}));
  legendItems.push({text: 'dashed ring = no kill criterion', color: c.err, shape: 'dashed'});
  legendItems.push({text: 'bubble area grows with stake', color: c.muted, shape: 'ring'});
  if(items.some(it => it.fanned)) legendItems.push({text: 'identical figures fan out around their point', color: c.muted, shape: 'ring'});
  let lx = plotX0, ly = plotY1 + 4 + tickSize + 2 + axisTitleSize + 22;
  const rowH = legendSize + 8, SW = 14;
  for(const it of legendItems){
    const w = measure(it.text, legendFont) + SW + 20;
    if(lx + w - 20 > plotX1 && lx > plotX0){ lx = plotX0; ly += rowH; }
    const cy = ly - legendSize * 0.35, r = it.shape === 'dot' ? 3.5 : 4.5;
    parts.push('<circle data-legend="" cx="' + r2(lx + 5) + '" cy="' + r2(cy) + '" r="' + r + '" fill="' + (it.shape === 'dot' ? it.color : 'none') +
      '" stroke="' + it.color + '" stroke-width="1.25"' + (it.shape === 'dashed' ? ' stroke-dasharray="2 2"' : '') + '/>');
    parts.push(txt(lx + SW, ly, it.text, legendSize, it.color, {weight: 700, tracking: '0.02em'}));
    lx += w;
  }
  let bottomY = ly + 6;

  // the key below the plot names the bets that wear a number
  if(keyed.length){
    if(keyOnly.length){
      const ids = keyOnly.map(it => it.sourceOrder).sort((a, b) => a - b), spans = [];
      for(let i = 0; i < ids.length;){ let j = i; while(j + 1 < ids.length && ids[j + 1] === ids[j] + 1) j++; const id = n => 'B' + String(n).padStart(2, '0'); spans.push(i === j ? id(ids[i]) : id(ids[i]) + '–' + id(ids[j])); i = j + 1; }
      parts.push(txt(geo.keyX0, bottomY + 18, (keyed.length - keyOnly.length) + ' of ' + keyed.length + ' bets carry their number on the plot; ' + spans.join(', ') + ' (' + keyOnly.length + ') are in the key only.', legendSize, c.muted, {weight: 700}));
      bottomY += 20;
    }
    const key = makeKey(keyed, geo, measure, geo.keyX0, geo.keyX1, bottomY + 16);
    parts.push(...drawKey(key, c));
    bottomY = key.y0 + key.height;
  }
  return {parts, bottomY};
}

/* the key: one entry per numbered bet, in source order, in one column or two */
function makeKey(chips, geo, measure, x0, x1, y0){
  const cols = geo.keyCols || 1, colGap = 16, colW = (x1 - x0 - (cols - 1) * colGap) / cols;
  const nameWidth = colW - 72;
  const rows = chips.slice().sort((a, b) => a.sourceOrder - b.sourceOrder).map(it => {
    const lines = measuredLines(it.name, '600 11.5px ' + SANS, nameWidth, measure);
    return {id: it.id, hue: it.hue, nameLines: lines, micro: microFor(it.b), height: 26 + lines.length * 14};
  });
  const perCol = Math.ceil(rows.length / cols), cells = [];
  let tallest = 0;
  for(let c = 0; c < cols; c++){
    let y = 0;
    for(const row of rows.slice(c * perCol, (c + 1) * perCol)){ cells.push({row, col: c, y}); y += row.height; }
    tallest = Math.max(tallest, y);
  }
  return {x0, x1, y0, cols, colW, colGap, cells, height: 38 + tallest + 10};
}

function drawKey(K, c){
  const out = ['<rect data-quadrant-key="" x="' + r2(K.x0) + '" y="' + r2(K.y0) + '" width="' + r2(K.x1 - K.x0) + '" height="' + r2(K.height) +
    '" fill="' + c.card + '" stroke="' + c.border + '"/>'];
  out.push(txt(K.x0 + 14, K.y0 + 24, 'KEY · BETS WITH A NUMBER', 10, c.accentInk, {weight: 700, tracking: '0.09em'}));
  for(const {row, col, y} of K.cells){
    const cx0 = K.x0 + 12 + col * (K.colW + K.colGap), ky = K.y0 + 38 + y;
    out.push('<line x1="' + r2(cx0) + '" y1="' + r2(ky) + '" x2="' + r2(cx0 + K.colW - 12) + '" y2="' + r2(ky) + '" stroke="' + c.border + '"/>');
    out.push(txt(cx0 + 2, ky + 20, row.id, 9.5, row.hue, {weight: 700, mono: true}));
    row.nameLines.forEach((ln, i) => out.push(txt(cx0 + 46, ky + 19 + i * 14, ln, 11.5, c.ink, {weight: 600})));
    out.push(txt(cx0 + 46, ky + 21 + row.nameLines.length * 14, row.micro, 9.5, c.muted, {mono: true}));
  }
  return out;
}

/* ---------------- WIDE ---------------- */
function renderWide(model, sim, ctx){
  const c = ctx.colors, measure = ctx.measure || ((s) => String(s).length * 7);
  const dark = !!ctx.dark;
  const P = prep(model, sim);
  const nameOnly = P.flat.length > NAME_ONLY_THRESHOLD;
  const parts = [];
  const right = 930;

  const titleLines = measuredLines(model.title || 'Bets board', '600 24px ' + SANS, 400, measure);
  titleLines.forEach((line, i) => parts.push('<text data-bets-title-line="" x="30" y="' + (52 + i * 26) +
    '" font-family="' + SANS + '" font-size="24" font-weight="600" fill="' + c.ink + '">' +
    esc(line) + '</text>'));
  const strapY = Math.max(74, 52 + (titleLines.length - 1) * 26 + 22);
  parts.push(txt(30, strapY, 'TOTAL STAKE ' + amount(P.totalStake),
    10, c.muted, {mono: true, tracking: '0.05em'}));
  const receipt = conditionReceipt(P.conditions, 460, 16, right - 460, c, false, measure);
  parts.push(...receipt.parts);

  let panelTop = strapY + 28;
  if(P.unscored.length){
    const copy = 'NOT SCORED · ' + P.unscored.map(record => record.id + ' ' + record.b.name).join(', ');
    for(const line of measuredLines(copy, '700 9px ' + SANS, right - 60, measure)){
      parts.push(txt(30, panelTop + 12, line, 9, c.err, {weight: 700, tracking: '0.03em'}));
      panelTop += 13;
    }
    panelTop += 5;
  }
  let geo = {plotX0: 92, plotY0: panelTop + 22, plotX1: right, plotY1: panelTop + 22 + 400,
    dark, rMin: 10, rMax: 30, nameSize: 12.5, microSize: nameOnly ? null : 10, tickSize: 9.5, axisTitleSize: 10.5,
    legendSize: 9.5, unit: model.unit, padX: 16, padTop: 16};
  geo = {...geo, keyX0: 30, keyX1: right, keyCols: 2};
  const {parts: body, bottomY} = plotAndLegend(model, sim, c, measure, P, geo);

  const panelBot = bottomY + 14;
  parts.push(...body);
  parts.push(txt(30, panelBot + 22, 'PER-BET P50 EV · P10–P90 RANGES · ' + NSIM_TEXT + ' SIMULATIONS', 9, c.muted, {tracking: '0.04em'}));
  if(model.unit) parts.push(txt(right, panelBot + 22, 'ALL FIGURES ' + model.unit.toUpperCase(), 9, c.muted, {anchor: 'end', tracking: '0.05em'}));

  const H = panelBot + 40;
  const stress = P.conditions.stress.result;
  return svgShell(WIDE, H, c, parts.join(''), false,
    model.title || 'Bets quadrant',
    'Risk-return view. ' + P.conditions.baseline.label + ': ' + (P.pf ? lossAlt(P.pf) : 'not available') + '. ' +
      P.conditions.stress.label + ': ' + (stress ? lossAlt(stress) : 'not available') +
      '. The horizontal axis is odds of success; the vertical axis is per-bet P50 expected value. Probability threshold labels mark odds ranges at or below 10%, or at or above 90%.');
}

/* ---------------- NARROW: square-ish plot fit to the width ---------------- */
function renderNarrow(model, sim, ctx){
  const c = ctx.colors, measure = ctx.measure || ((s) => String(s).length * 7);
  const dark = !!ctx.dark;
  const W = Math.max(300, Math.round(ctx.width)), pad = 16;
  const P = prep(model, sim);
  const parts = [];
  let y = 30;
  const titleLines = measuredLines(model.title || 'Bets board', '600 21px ' + SANS, W - pad * 2, measure);
  titleLines.forEach((line, i) => parts.push('<text data-bets-title-line="" x="' + pad + '" y="' + (y + i * 24) +
    '" font-family="' + SANS + '" font-size="21" font-weight="600" fill="' + c.ink + '">' +
    esc(line) + '</text>'));
  y += titleLines.length * 24 - 2;
  parts.push(txt(pad, y, (P.flat.length + P.unscored.length) + ' bets · ' + model.groups.filter(g => g.bets.length).length + ' lanes · stake ' + amount(P.totalStake), 11, c.muted)); y += 12;
  const receipt = conditionReceipt(P.conditions, pad, y, W - pad * 2, c, true, measure);
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
  geo.keyX0 = pad; geo.keyX1 = W - pad; geo.keyCols = 1;
  const {parts: body, bottomY} = plotAndLegend(model, sim, c, measure, P, geo);
  parts.push(...body);
  parts.push('<rect data-narrow="" width="0" height="0" fill="none"/>');
  const stress = P.conditions.stress.result;
  return svgShell(W, bottomY + 20, c, parts.join(''), true,
    model.title || 'Bets quadrant',
    'Risk-return view. ' + P.conditions.baseline.label + ': ' + (P.pf ? lossAlt(P.pf) : 'not available') + '. ' +
      P.conditions.stress.label + ': ' + (stress ? lossAlt(stress) : 'not available') + '.');
}

function svgShell(W, H, c, inner, narrow, title = 'Bets quadrant', desc = 'A risk-return view of explicit portfolio bets.'){
  H = Math.ceil(H);
  return '<svg data-bets-surface="allocation-plane" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + W + ' ' + H + '" width="' + W + '" height="' + H +
    '" font-family="' + SANS + '" role="img" aria-labelledby="bets-quadrant-title bets-quadrant-desc"><title id="bets-quadrant-title">' +
    esc(title) + '</title><desc id="bets-quadrant-desc">' + esc(desc) + '</desc><rect width="' + W + '" height="' + H + '" fill="' + c.bg + '"/>' + inner + '</svg>';
}
