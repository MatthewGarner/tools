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

  /* deterministic midpoint rollback with optional overrides, for flip analysis */
  function evalDet(pOver = new Map(), vOver = new Map()){
    function walk(node){
      const own = vOver.has(node) ? vOver.get(node) : (node.value ? mid(node.value) : 0);
      if(node.kind === 'leaf') return own;
      if(node.kind === 'decision'){
        return own + Math.max(...node.children.map(walk));
      }
      const explicit = node.children.filter(c => c.p !== 'rest');
      const restChild = node.children.find(c => c.p === 'rest');
      let ps = new Map(explicit.map(c => [c, pOver.has(c) ? pOver.get(c) : mid(c.p)]));
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
    if(model.root.kind !== 'decision') return {rec: null};
    let best = null, bestV = -Infinity;
    for(const c of model.root.children){
      const v = (model.root.value ? mid(model.root.value) : 0) + walk(c);
      if(v > bestV){ bestV = v; best = c; }
    }
    return {rec: best};
  }

  const flips = [];
  if(model.root.kind === 'decision' && model.root.children.length > 1){
    const baseRec = evalDet().rec;

    /* probability flips: bisect each explicit chance-child probability */
    const probNodes = [];
    (function collect(node){
      if(node.kind === 'chance'){
        for(const c of node.children) if(c.p !== 'rest') probNodes.push(c);
      }
      node.children.forEach(collect);
    })(model.root);
    for(const c of probNodes){
      const recAt = v => evalDet(new Map([[c, v]])).rec;
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
        const at = v => evalDet(new Map(), new Map([[node, v]])).rec;
        if(at(node.value.lo) !== baseRec || at(node.value.hi) !== baseRec){
          flips.push({kind: 'payoff', label: node.label, lo: node.value.lo, hi: node.value.hi});
        }
      }
      node.children.forEach(collectV);
    })(model.root);
  }

  return {policy, stats, headToHead, flips, warnings};
}
