/* Monte Carlo rollback for decision trees. Pure — no DOM.
   Semantics (spec §2):
   - Ranges are 90% intervals (log-normal when lo>0, normal otherwise; probabilities
     clamped to [0,1] and sibling-normalised per simulation).
   - The per-node distribution is the distribution of EXPECTED value under parameter
     uncertainty (chance nodes weight children by sampled probabilities). Point-value
     trees are therefore exact.
   - Policy, not hindsight: each decision node picks the option with the highest mean
     EV once; the policy is frozen across simulations. */
import {mulberry32, gaussian, quantile} from '../assets/series.js';

const Z90 = 1.6448536;
/* coarse scan resolution for probability-flip search: the bisection that
   follows refines to the same threshold regardless of this value (verified
   identical to 4dp down to ~24 steps); 30 is a safe margin. */
const COARSE = 30;

export function evaluate(model, {sims = 10000, seed = 0x5EED} = {}){
  const warnings = [];
  const policy = new Map(), stats = new Map();
  if(!model.root) return {policy, stats, headToHead: [], flips: [], warnings};

  const rand = mulberry32(seed);
  const gauss = gaussian(rand);

  function sampleArr(range){
    const out = new Float64Array(sims);
    if(range.lo === range.hi){ out.fill(range.lo); return out; }
    if(range.lo > 0){
      const mu = (Math.log(range.lo) + Math.log(range.hi)) / 2;
      const sg = (Math.log(range.hi) - Math.log(range.lo)) / (2 * Z90);
      for(let s = 0; s < sims; s++) out[s] = Math.exp(mu + sg * gauss());
    } else {
      const mu = (range.lo + range.hi) / 2, sg = (range.hi - range.lo) / (2 * Z90);
      for(let s = 0; s < sims; s++) out[s] = mu + sg * gauss();
    }
    return out;
  }
  const mid = r => r === 'rest' ? null : (r.lo + r.hi) / 2;
  const statsOf = arr => {
    const sorted = Float64Array.from(arr).sort();
    let sum = 0;
    for(const v of arr) sum += v;
    return {mean: sum / arr.length,
      p10: quantile(sorted, .1), p50: quantile(sorted, .5), p90: quantile(sorted, .9)};
  };

  /* one-time probability sanity warning per chance node (midpoints) */
  (function warnSums(node){
    if(node.kind === 'chance'){
      const explicit = node.children.filter(c => c.p !== 'rest');
      const hasRest = node.children.some(c => c.p === 'rest');
      const s = explicit.reduce((a, c) => a + mid(c.p), 0);
      if(!hasRest && Math.abs(s - 1) > 0.02){
        warnings.push('"' + node.label + '": probabilities sum to ' + s.toFixed(2) + ' — normalised');
      } else if(hasRest && s > 1.001){
        warnings.push('"' + node.label + '": explicit probabilities sum to ' + s.toFixed(2) + ' before rest — normalised');
      }
    }
    node.children.forEach(warnSums);
  })(model.root);

  /* recursive rollback: returns the node's per-sim EV array under the frozen policy */
  function evalArr(node){
    const own = node.value ? sampleArr(node.value) : new Float64Array(sims);
    let arr;
    if(node.kind === 'leaf'){
      arr = own;
    } else if(node.kind === 'decision'){
      const childArrs = node.children.map(evalArr);
      let best = 0, bestMean = -Infinity;
      childArrs.forEach((a, i) => {
        const m = stats.get(node.children[i]).mean;
        if(m > bestMean){ bestMean = m; best = i; }
      });
      policy.set(node, node.children[best]);
      arr = own;
      const chosen = childArrs[best];
      for(let s = 0; s < sims; s++) arr[s] += chosen[s];
    } else {   // chance
      const childArrs = node.children.map(evalArr);
      const pArrs = node.children.map(c =>
        c.p === 'rest' ? null : sampleArr(c.p));
      arr = own;
      const restIdx = node.children.findIndex(c => c.p === 'rest');
      /* scratch buffer for the per-sim probability vector, hoisted out of the
         sims loop (same math, no per-sim array/closure allocation) */
      const nKids = node.children.length;
      const ps = new Float64Array(nKids);
      for(let s = 0; s < sims; s++){
        let sum = 0;
        for(let i = 0; i < nKids; i++){
          const a = pArrs[i];
          const v = a === null ? 0 : Math.min(1, Math.max(0, a[s]));
          ps[i] = v;
          sum += v;
        }
        if(restIdx >= 0){
          if(sum > 1){ for(let i = 0; i < nKids; i++) ps[i] /= sum; sum = 1; }
          ps[restIdx] = 1 - sum;
        } else if(sum > 0){
          for(let i = 0; i < nKids; i++) ps[i] /= sum;
        }
        let total = 0;
        for(let i = 0; i < nKids; i++) total += ps[i] * childArrs[i][s];
        arr[s] += total;
      }
    }
    stats.set(node, statsOf(arr));
    node._arr = arr;   // kept for head-to-head pairing at the root
    return arr;
  }
  evalArr(model.root);

  /* head-to-head: root decision options, paired parameter draws */
  const headToHead = [];
  if(model.root.kind === 'decision'){
    const kids = model.root.children;
    for(let i = 0; i < kids.length; i++){
      for(let j = i + 1; j < kids.length; j++){
        const A = kids[i]._arr, B = kids[j]._arr;
        let wins = 0;
        for(let s = 0; s < sims; s++) wins += A[s] > B[s] ? 1 : (A[s] === B[s] ? 0.5 : 0);
        headToHead.push({a: kids[i].label, b: kids[j].label, aShare: wins / sims});
      }
    }
  }

  /* drop the per-sim arrays now head-to-head has used them */
  (function scrub(node){ delete node._arr; node.children.forEach(scrub); })(model.root);

  /* deterministic midpoint rollback is now the pure export evalDet(model, ...) below (B0). */

  const flips = [];
  if(model.root.kind === 'decision' && model.root.children.length > 1){
    const baseRec = evalDet(model).rec;

    /* probability flips: bisect each explicit chance-child probability */
    const probNodes = [];
    (function collect(node){
      if(node.kind === 'chance'){
        for(const c of node.children) if(c.p !== 'rest') probNodes.push(c);
      }
      node.children.forEach(collect);
    })(model.root);
    for(const c of probNodes){
      const recAt = v => evalDet(model, new Map([[c, v]])).rec;
      /* coarse scan for a change, then bisect the boundary */
      let prev = recAt(0), changeLo = null, changeHi = null;
      for(let i = 1; i <= COARSE; i++){
        const v = i / COARSE;
        const rec = recAt(v);
        if(rec !== prev){ changeLo = (i - 1) / COARSE; changeHi = v; break; }
        prev = rec;
      }
      if(changeLo === null) continue;
      let lo = changeLo, hi = changeHi;
      for(let k = 0; k < 30; k++){
        const midV = (lo + hi) / 2;
        if(recAt(midV) === recAt(lo)) lo = midV; else hi = midV;
      }
      const threshold = (lo + hi) / 2;
      const baseMid = mid(c.p);
      /* direction: which side of the threshold abandons the base recommendation */
      const direction = (recAt(Math.max(0, threshold - 0.01)) === baseRec) ? '>' : '<';
      flips.push({kind: 'prob', label: c.label, threshold, direction, base: baseMid});
    }

    /* payoff flips: pin each ranged value at either end */
    (function collectV(node){
      if(node.value && node.value.lo !== node.value.hi){
        const at = v => evalDet(model, new Map(), new Map([[node, v]])).rec;
        if(at(node.value.lo) !== baseRec || at(node.value.hi) !== baseRec){
          flips.push({kind: 'payoff', label: node.label, lo: node.value.lo, hi: node.value.hi});
        }
      }
      node.children.forEach(collectV);
    })(model.root);
  }

  return {policy, stats, headToHead, flips, warnings};
}

/* Deterministic midpoint rollback with optional per-node parameter OVERRIDES — the pure primitive
   the flip search (above) uses, and the /tree priced-insistence walk (flipAlong/loadBearing) will.
   Returns {rec, values}: the recommended root option AND the per-root-option deterministic values
   (so callers have margins). evalDet only ever mids real ranges here (rest is filtered), so a plain
   midpoint suffices. Extracted from `evaluate` (B0) — behaviour-preserving: `flips` identical + goldens IDENTICAL. */
export function evalDet(model, pOver = new Map(), vOver = new Map()){
  const mid = r => (r.lo + r.hi) / 2;
  function walk(node){
    const own = vOver.has(node) ? vOver.get(node) : (node.value ? mid(node.value) : 0);
    if(node.kind === 'leaf') return own;
    if(node.kind === 'decision') return own + Math.max(...node.children.map(walk));
    const explicit = node.children.filter(c => c.p !== 'rest');
    const restChild = node.children.find(c => c.p === 'rest');
    const ps = new Map(explicit.map(c => [c, pOver.has(c) ? pOver.get(c) : mid(c.p)]));
    let sum = [...ps.values()].reduce((a, b) => a + b, 0);
    if(restChild){
      if(sum > 1){ for(const [k, v] of ps) ps.set(k, v / sum); sum = 1; }
      ps.set(restChild, 1 - sum);
    } else if(sum > 0){
      for(const [k, v] of ps) ps.set(k, v / sum);
    }
    let total = own;
    for(const c of node.children) total += (ps.get(c) || 0) * walk(c);
    return total;
  }
  if(model.root.kind !== 'decision') return {rec: null, values: []};
  const base = model.root.value ? mid(model.root.value) : 0;
  const values = model.root.children.map(c => base + walk(c));
  let best = null, bestV = -Infinity;
  model.root.children.forEach((c, i) => { if(values[i] > bestV){ bestV = values[i]; best = c; } });
  return {rec: best, values};
}

/* ---------- priced-insistence walk (B1): where the decision actually hinges ----------
   An inputRef names one number in the DSL by kind + source line:
     {kind:'prob'|'value', line}  — a chance-child probability, or a node's payoff.
   These ride evalDet's midpoint rollback with a single override, so they never invent
   RNG and never run the 10k-sim MC per frame — the live layer is the honest midpoint story. */

export function findByLine(model, line){
  let found = null;
  // The synthetic implicit root (parse.js) SHARES its srcLine with the first top-level option,
  // and preorder visits it first — so skip it, or refs to that line resolve to a value-less
  // wrapper (C-1: crashed sliderExtent, and silently dropped the first option from the marks).
  (function w(n){ if(!n || found) return; if(n.srcLine === line && !n.implicit) found = n; n.children.forEach(w); })(model.root);
  return found;
}

/* the ref's current midpoint (what evalDet uses by default) */
export function refMid(model, ref){
  const n = findByLine(model, ref.line);
  if(!n) return null;
  if(ref.kind === 'prob') return (n.p && n.p !== 'rest') ? (n.p.lo + n.p.hi) / 2 : null;
  return n.value ? (n.value.lo + n.value.hi) / 2 : null;
}

/* the recommended root option with the ref pinned to x (node identity is stable across calls) */
function recAt(model, node, ref, x){
  return ref.kind === 'prob'
    ? evalDet(model, new Map([[node, x]])).rec
    : evalDet(model, new Map(), new Map([[node, x]])).rec;
}

/* TWO-SIDED scan-then-bisect (I1): the affected option's value is piecewise-affine under a
   downstream inner max, so the base's holding region need not be one interval and a flip can
   hide from pure bisection. COARSE scan the extent, bisect each rec sign-change, report the
   nearest boundary below and above the current midpoint plus the extreme winners. */
export function flipAlong(model, ref, extent){
  const node = findByLine(model, ref.line);
  const cur = refMid(model, ref);
  const {lo, hi} = extent;
  if(!node || cur === null || !(hi > lo)) return {below: null, above: null, winnerAtLo: null, winnerAtHi: null, boundaries: []};
  const at = x => recAt(model, node, ref, x);
  const winnerAtLo = at(lo), winnerAtHi = at(hi);
  const boundaries = [];
  let prevX = lo, prevRec = winnerAtLo;
  for(let i = 1; i <= COARSE; i++){
    const x = lo + (hi - lo) * (i / COARSE);
    const rec = at(x);
    if(rec !== prevRec){
      let a = prevX, b = x;                       // bisect the sign-change [prevX, x]
      for(let k = 0; k < 40; k++){ const m = (a + b) / 2; if(at(m) === prevRec) a = m; else b = m; }
      boundaries.push((a + b) / 2);
    }
    prevX = x; prevRec = rec;
  }
  let below = null, above = null;
  for(const b of boundaries){
    if(b <= cur){ if(below === null || b > below) below = b; }
    else if(above === null || b < above) above = b;
  }
  return {below, above, winnerAtLo, winnerAtHi, boundaries};
}

const nearestBoundary = (fl, cur) => {
  const cands = [fl.below, fl.above].filter(b => b !== null);
  if(!cands.length) return null;
  return cands.reduce((best, b) => Math.abs(b - cur) < Math.abs(best - cur) ? b : best);
};

/* the slider's min/max for a ref (I3): a probability is [0,1]; a ranged value is its stated
   90% interval EXTENDED to reveal the flip, clamped to stated ± 2×span; a point value is a
   window around the flip (flip ± 25%·|flip−cur|), else ±50%·|value|. Always returns the flips
   found inside the final track, so the caller can notch them. */
const NO_EXTENT = {lo: 0, hi: 0, flips: {below: null, above: null, winnerAtLo: null, winnerAtHi: null, boundaries: []}};
/* the largest payoff magnitude in the tree — the scale for a point value sitting at ≈0,
   where an absolute reach would be blind (a £4 window on a £M tree; M-1) */
export function treeScale(model){
  let m = 0;
  (function w(n){ if(!n) return; if(n.value) m = Math.max(m, Math.abs(n.value.lo), Math.abs(n.value.hi)); n.children.forEach(w); })(model.root);
  return m;
}
export function sliderExtent(ref, model){
  const node = findByLine(model, ref.line);
  const cur = refMid(model, ref);
  if(node === null || cur === null) return {...NO_EXTENT};   // resolution failure must never throw (C-1)
  if(ref.kind === 'prob'){
    return {lo: 0, hi: 1, flips: flipAlong(model, ref, {lo: 0, hi: 1})};
  }
  const v = node.value;
  if(!v) return {...NO_EXTENT};
  if(v.lo !== v.hi){                                   // ranged value
    const span = v.hi - v.lo;
    const clampLo = v.lo - 2 * span, clampHi = v.hi + 2 * span;
    const near = nearestBoundary(flipAlong(model, ref, {lo: clampLo, hi: clampHi}), cur);
    let lo = v.lo, hi = v.hi;                          // start at the stated range, never shrink below it
    if(near !== null){ lo = Math.min(lo, near); hi = Math.max(hi, near); }
    lo = Math.max(lo, clampLo); hi = Math.min(hi, clampHi);
    return {lo, hi, flips: flipAlong(model, ref, {lo, hi})};
  }
  // point value: search a generous window for the flip, then tighten around it. When cur≈0 the
  // window must be sized by the TREE's scale, not an absolute unit (M-1: a "0" payoff still has a
  // flip somewhere in £M territory; a £4 reach or a ±£1 fallback would never see it).
  const scale = treeScale(model);
  const reach = 4 * Math.max(Math.abs(cur), scale * 0.25, 1);
  const near = nearestBoundary(flipAlong(model, ref, {lo: cur - reach, hi: cur + reach}), cur);
  let lo, hi;
  if(near !== null){
    const d = Math.abs(near - cur);
    lo = Math.min(cur, near) - 0.25 * d;
    hi = Math.max(cur, near) + 0.25 * d;
  } else {
    const pad = Math.abs(cur) * 0.5 || scale * 0.25 || 1;
    lo = cur - pad; hi = cur + pad;
  }
  return {lo, hi, flips: flipAlong(model, ref, {lo, hi})};
}

/* which numbers are load-bearing (I3): an input is marked iff a flip lies within its slider
   track, ranked by how near that flip sits to the current value. Degenerate (a runaway winner,
   nothing load-bearing) → the single widest-margin input via evalDet.values, never zero marks
   with no explanation. Returns [{ref, nearestFlip, distance, degenerate?}] . */
export function loadBearing(model){
  if(!model.root || model.root.kind !== 'decision' || model.root.children.length < 2) return [];
  const refs = [];
  (function w(n){
    if(!n) return;
    if(n.p && n.p !== 'rest') refs.push({kind: 'prob', line: n.srcLine});
    if(n.value) refs.push({kind: 'value', line: n.srcLine});
    n.children.forEach(w);
  })(model.root);

  const marked = [];
  for(const ref of refs){
    const ext = sliderExtent(ref, model);
    const cur = refMid(model, ref);
    const nf = nearestBoundary(ext.flips, cur);
    if(nf !== null){
      const width = ext.hi - ext.lo;
      // normalise distance by the track width so prob (0–1) and money (millions) rank comparably:
      // a flip right at your current belief ⇒ ~0 (most load-bearing), one at the track edge ⇒ ~0.5–1
      marked.push({ref, extent: {lo: ext.lo, hi: ext.hi}, nearestFlip: nf,
        distance: Math.abs(nf - cur), proximity: width > 0 ? Math.abs(nf - cur) / width : Infinity});
    }
  }
  if(marked.length){
    marked.sort((a, b) => a.proximity - b.proximity);
    return marked;
  }

  // degenerate: no input flips the call — surface the one that moves the winning margin most
  const marginOf = vs => { const s = [...vs].sort((a, b) => b - a); return s.length > 1 ? s[0] - s[1] : Infinity; };
  const baseMargin = marginOf(evalDet(model).values);
  let widest = null, widestSwing = -Infinity;
  for(const ref of refs){
    const ext = sliderExtent(ref, model);
    const node = findByLine(model, ref.line);
    let swing = 0;
    for(const x of [ext.lo, ext.hi]){
      const vs = ref.kind === 'prob'
        ? evalDet(model, new Map([[node, x]])).values
        : evalDet(model, new Map(), new Map([[node, x]])).values;
      swing = Math.max(swing, Math.abs(marginOf(vs) - baseMargin));
    }
    if(swing > widestSwing){ widestSwing = swing; widest = ref; }
  }
  return widest ? [{ref: widest, extent: sliderExtent(widest, model), nearestFlip: null, distance: Infinity, proximity: Infinity, degenerate: true}] : [];
}

/* B3 — the priced-insistence readout's two no-flip cases (I4). loadBearing already only marks
   inputs whose flip lies WITHIN their sliderExtent track, so this only matters for a number
   explored via the card-menu (I-3) that ISN'T load-bearing: sliderExtent's own track (`ext`,
   already computed by the caller) found no flip, but does one exist further out? For a
   probability the track already IS the whole domain ([0,1]), so it never hinges further out
   (returns null unconditionally). For a money value, probe a further ±10×track-span beyond the
   track — generous enough to separate "never hinges" from "hinges, but only past a plausible
   value", while staying close enough to the track's own scale that the COARSE scan can still
   resolve the crossing (a probe scaled to the whole tree, independent of the track, can outrun
   the scan's resolution and silently miss a boundary that's only modestly out of range). Beyond
   that reach, "never" and "only at an implausible extreme" are equally honest — this is a
   deliberately bounded, not exhaustive, search. Returns the nearest such far boundary, or null. */
export function hingesBeyondTrack(model, ref, ext){
  if(ref.kind === 'prob') return null;   // [0,1] IS the full domain already; sliderExtent covers it
  const node = findByLine(model, ref.line);
  const cur = refMid(model, ref);
  if(!node || !node.value || cur === null) return null;
  const span = Math.max(ext.hi - ext.lo, 1);
  const wide = flipAlong(model, ref, {lo: ext.lo - 10 * span, hi: ext.hi + 10 * span});
  return nearestBoundary(wide, cur);
}
