/* "What must be true" — the confession solver. Pure: given a wished-for threshold T, find the
   cheapest width-preserving STRETCH of a single input's range that makes P50 = T ("an even-odds
   shot at T"), ranked across inputs by normalized stretch. No SVG — not a render*.js file.

   Honesty: a stretch shifts the whole range preserving width (multiplicative for logn-effective
   vars, additive for norm/uni), so "moved belief, same admitted uncertainty". P50(s) is a
   DETERMINISTIC function of s (same seed every evaluation), so the bisection has no MC chatter.
   The effective dist is FROZEN at solve start and threaded through simulateModel (not re-derived
   from the shifted lo), so an 'auto' var whose lo crosses 0 can't flip shape mid-bisection. */

import {simulateModel, effDist} from './engine.js';
import {quantile} from '../assets/series.js';

const CAP = 3;   // normalized-stretch cap: ×e^(3·halfwidth) up, or ±3 half-widths for additive

/* One candidate: the cheapest signed normalized stretch s of `varName` that lands P50 on target. */
export function solveStretch(model, {seed, np = 8000, target, varName, cap = CAP}){
  const [lo, hi] = model.ranges[varName];
  if(lo === hi) return {kind: 'mult', varName, s: 0, dir: 1, hw: 0, factor: 1, delta: 0,
    range: [lo, hi], orig: [lo, hi], normCost: cap, achievedP50: NaN, valid: 0, feasible: false};   // point range excluded
  const d = effDist(model.dists[varName], lo);        // FROZEN effective dist
  const mult = d === 'logn';
  const hw = mult ? Math.log(hi / lo) / 2 : (hi - lo) / 2;
  const rangeAt = s => mult ? [lo * Math.exp(s * hw), hi * Math.exp(s * hw)] : [lo + s * hw, hi + s * hw];
  const p50At = s => {
    const ranges = {...model.ranges, [varName]: rangeAt(s)};
    const dists = {...model.dists, [varName]: d};      // C2: the freeze must reach the sampler
    const sim = simulateModel({ast: model.ast, varNames: model.varNames, ranges, dists}, {seed, n: np});
    return {p50: sim.sorted.length ? quantile(sim.sorted, .5) : NaN, valid: sim.sorted.length / np};
  };
  const near = v => Math.abs(v - target);
  // bisect s in [a,b] (p50 assumed monotone across the bracket) to p50 ≈ target
  const bisect = (a, b) => {
    let pa = p50At(a).p50;
    for(let i = 0; i < 16; i++){
      const m = (a + b) / 2, pm = p50At(m).p50;
      if(!isFinite(pm)){ b = m; continue; }
      if((pm - target) * (pa - target) <= 0) b = m; else { a = m; pa = pm; }
    }
    const s = (a + b) / 2, r = p50At(s);
    return {s, achievedP50: r.p50, valid: r.valid, feasible: true};
  };

  const base = p50At(0).p50;
  // two-sided direction probe (C1): a denominator var FALLS as its range rises, so the sign that
  // moves P50 toward target is not implied by target≷base. Pick whichever probe closes the gap.
  const dir = near(p50At(0.25).p50) <= near(p50At(-0.25).p50) ? 1 : -1;
  let res = null;
  const pEnd = p50At(dir * cap).p50;                  // does the monotone reach bracket target?
  if(isFinite(pEnd) && (target - base) * (target - pEnd) <= 0) res = bisect(0, dir * cap);

  if(!res){
    // I1: 9-point SIGNED grid before declaring infeasible — an interior-max model (a/b with b near 0)
    // is feasible at an interior s the endpoint check misses; else keep the best-progress point.
    const N = 9, pts = [];
    for(let i = 0; i < N; i++){ const s = -cap + 2 * cap * i / (N - 1); const r = p50At(s); pts.push({s, ...r}); }
    let bracket = null;
    for(let i = 1; i < N; i++){ const p = pts[i - 1], q = pts[i];
      if(isFinite(p.p50) && isFinite(q.p50) && (p.p50 - target) * (q.p50 - target) <= 0){ bracket = [p.s, q.s]; break; } }
    if(bracket) res = bisect(bracket[0], bracket[1]);
    else {
      const best = pts.filter(p => isFinite(p.p50)).sort((x, y) => near(x.p50) - near(y.p50))[0]
        || {s: dir * cap, p50: NaN, valid: 0};
      res = {s: best.s, achievedP50: best.p50, valid: best.valid, feasible: false};
    }
  }
  const s = res.s;
  return {kind: mult ? 'mult' : 'add', dist: d, varName, s, dir: Math.sign(s) || 1, hw,
    factor: mult ? Math.exp(s * hw) : 1, delta: mult ? 0 : s * hw, range: rangeAt(s), orig: [lo, hi],
    normCost: res.feasible ? Math.abs(s) : cap, achievedP50: res.achievedP50, valid: res.valid, feasible: res.feasible};
}

// re-stretch a candidate's ORIGINAL range by a signed normalized stretch `s`, in its own geometry
function mag(r, s){
  return r.kind === 'mult'
    ? [r.orig[0] * Math.exp(s * r.hw), r.orig[1] * Math.exp(s * r.hw)]
    : [r.orig[0] + s * r.hw, r.orig[1] + s * r.hw];
}

/* Across all non-point inputs: the cheapest single feasible stretch (+ alternates), or — when no
   single reaches T within the cap — the cheapest PAIR moved together, or the terminal "nothing
   plausible". Never more than a pair (YAGNI). */
export function confess(model, {seed, np = 8000, target, cap = CAP}){
  const base = quantile(simulateModel(model, {seed, n: np}).sorted, .5);
  const dir = Math.sign(target - base) || 1;
  const cands = model.varNames.filter(v => model.ranges[v][0] !== model.ranges[v][1]);
  const each = cands.map(v => solveStretch(model, {seed, np, target, varName: v, cap}))
    .filter(r => r.valid >= 0.5);                      // I6: drop candidates that degenerate the model
  if(!each.length) return {best: null, alternates: [], pair: null, feasible: false, dir};

  const feasibles = each.filter(r => r.feasible).sort((a, b) => a.normCost - b.normCost);
  if(feasibles.length) return {best: feasibles[0], alternates: feasibles.slice(1), pair: null, feasible: true, dir};
  if(each.length < 2) return {best: null, alternates: [], pair: null, feasible: false, dir};   // I2: no pair possible

  // infeasible singles: rank by achieved-P50 PROGRESS toward target (each achievedP50 is the grid's
  // best-progress point, I1 — real progress, not across-0 garbage), then bisect ONE shared magnitude.
  const ranked = each.slice().sort((a, b) => (dir * b.achievedP50) - (dir * a.achievedP50));
  const [a0, b0] = ranked;
  const p50Pair = s => {                              // I5: each member moves in ITS OWN direction
    const ranges = {...model.ranges,
      [a0.varName]: mag(a0, a0.dir * s), [b0.varName]: mag(b0, b0.dir * s)};
    const dists = {...model.dists,
      [a0.varName]: effDist(model.dists[a0.varName], model.ranges[a0.varName][0]),
      [b0.varName]: effDist(model.dists[b0.varName], model.ranges[b0.varName][0])};
    const sim = simulateModel({ast: model.ast, varNames: model.varNames, ranges, dists}, {seed, n: np});
    return sim.sorted.length ? quantile(sim.sorted, .5) : NaN;
  };
  let a = 0, b = cap, pa = p50Pair(0);
  for(let i = 0; i < 16; i++){ const m = (a + b) / 2, pm = p50Pair(m);
    if(!isFinite(pm)){ b = m; continue; }
    if((pm - target) * (pa - target) <= 0) b = m; else { a = m; pa = pm; } }
  const sPair = (a + b) / 2, pairP50 = p50Pair(sPair);
  const pairFeasible = (p50Pair(cap) - target) * (base - target) <= 0;   // does the pair reach T within cap?
  return {best: null, alternates: [], feasible: pairFeasible, dir,
    pair: {s: sPair, feasible: pairFeasible, achievedP50: pairP50,
      a: {...a0, range: mag(a0, a0.dir * sPair)}, b: {...b0, range: mag(b0, b0.dir * sPair)}}};
}
