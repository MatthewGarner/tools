/* Pure hybrid-MC engine. Beliefs are drawn per run; day-to-day spread variation
   lives in two pre-sorted base samples so each year is O(log n).
   Every number the UI quotes is defined in this file and only here.
   Spec: docs/superpowers/specs/2026-07-06-cycle-budget-design.md §2. */
import {mulberry32, gaussian, quantile, fmt, rangeSampler} from '../../assets/series.js';
import {complete} from './parse.js';

export const N_BASE = 1000, DAYS = 365, SOH_FLOOR = 0.10, MAX_IT = 8, TOL = 1e-3;

const clamp01 = x => Math.max(0, Math.min(1, x));

function sortedSuffix(arr){
  const v = Float64Array.from(arr).sort();
  const suf = new Float64Array(v.length + 1);
  for(let i = v.length - 1; i >= 0; i--) suf[i] = suf[i + 1] + v[i];
  return {v, suf, n: v.length};
}

/* count and sum of base values strictly greater than x */
export function above(S, x){
  let lo = 0, hi = S.n;
  while(lo < hi){ const mid = (lo + hi) >> 1; S.v[mid] <= x ? lo = mid + 1 : hi = mid; }
  return {count: S.n - lo, sum: S.suf[lo]};
}

/* two sorted day samples: S1 = best spread, S2 = pairwise f×spread (null without second:) */
export function makeBase(model, seed){
  const rand = mulberry32(seed), gauss = gaussian(rand);
  const s = rangeSampler(model.spread.lo, model.spread.hi, 'logn', rand, gauss);
  const days = Array.from({length: N_BASE}, s);
  let S2 = null;
  if(model.second){
    const f = rangeSampler(model.second.lo, model.second.hi, 'norm', rand, gauss);
    S2 = sortedSuffix(days.map(d => d * clamp01(f())));
  }
  return {S1: sortedSuffix(days), S2};
}

export function drawBeliefs(model, rand, gauss){
  const d = (r, dist = 'logn') => r ? rangeSampler(r.lo, r.hi, dist, rand, gauss)() : 0;
  return {
    fade: Math.max(0, d(model.fade)),
    cal: Math.max(0, d(model.calendar)),
    rte: Math.min(0.999, Math.max(0.5, d(model.rte))),
    charge: Math.max(0, d(model.charge)),
    drift: model.drift ? rangeSampler(model.drift.lo, model.drift.hi, 'norm', rand, gauss)() : 0,
    aug: model.augment ? Math.max(0, d(model.augment)) : null,
    disc: Math.max(0.001, d(model.discount)),
  };
}

export function npv(revs, disc, from = 0){
  let v = 0;
  for(let k = from; k < revs.length; k++) v += revs[k] / Math.pow(1 + disc, k - from + 1);
  return v;
}

/* τ_budget: smallest τ with expected cycles ≤ allowance — bisection over net-£/MWh */
export function tauBudget(base, scale, k, allowance, useSecond){
  const cycles = tau => {
    const x = (tau + k) / scale;
    let c = above(base.S1, x).count;
    if(useSecond && base.S2) c += above(base.S2, x).count;
    return DAYS * c / N_BASE;
  };
  if(cycles(0) <= allowance) return 0;
  let lo = 0, hi = scale * base.S1.v[base.S1.n - 1];
  for(let i = 0; i < 40; i++){
    const mid = (lo + hi) / 2;
    cycles(mid) > allowance ? lo = mid : hi = mid;
  }
  /* return the over-subscribed side: on a step (identical days) the upper side
     is empty; the hard budget cap in simPolicy trims the ε overshoot — which is
     also the economically right rationing when the days are indistinguishable */
  return lo;
}

/* one policy simulation for one belief set: fixed point of τ ↔ V.
   revs are gross £; wearCost is the £ of capacity value destroyed per year
   (for the first-order test); perMwh (cleared net £/MWh-yr) feeds V. */
export function simPolicy(model, b, base, useSecond, tauScale = 1){
  const H = model.cycles.years, E0 = model.battery.mwh;
  const k = (1 / b.rte - 1) * b.charge;
  let V = new Float64Array(H);
  let out = null, prevTau0 = Infinity;

  for(let it = 0; it < MAX_IT; it++){
    let soh = 1, budget = model.cycles.budget;
    const taus = [], bind = [], revs = [], sohs = [], buds = [], perMwh = [], cyc = [], wearCost = [];
    for(let y = 0; y < H; y++){
      const scale = Math.pow(1 + b.drift, y);
      const Ey = E0 * Math.max(soh, SOH_FLOOR);
      const wear = b.fade * E0 * V[y];                 // £ per cycle
      const tWear = wear / Ey;
      const aY = Math.max(0, budget) / (H - y);
      const tBud = tauBudget(base, scale, k, aY, useSecond);
      const tau = Math.max(tWear, tBud) * tauScale;
      const x = (tau + k) / scale;
      const a1 = above(base.S1, x);
      const a2 = (useSecond && base.S2) ? above(base.S2, x) : {count: 0, sum: 0};
      let c = DAYS * (a1.count + a2.count) / N_BASE;
      let netSum = ((a1.sum + a2.sum) * scale - (a1.count + a2.count) * k) * DAYS / N_BASE;
      /* trim to the annual allowance (τ can't ration indistinguishable days —
         the ε overshoot from tauBudget's lo-side return lands here too) */
      const cap = Math.min(Math.max(0, budget), aY);
      if(c > cap && c > 0){ const ratio = cap / c; c *= ratio; netSum *= ratio; }
      taus.push(tau); bind.push(tBud > tWear); cyc.push(c);
      perMwh.push(netSum);                             // £/MWh-yr, cleared net spreads
      revs.push(Ey * netSum);
      wearCost.push(c * wear);
      budget -= c;
      buds.push(Math.max(0, budget));
      soh = Math.max(SOH_FLOOR, soh - b.fade * c - b.cal);
      sohs.push(soh);
    }
    /* backward value pass: V[y] = Σ_{j≥y} perMwh[j] / (1+disc)^(j−y+1) */
    const nextV = new Float64Array(H);
    let acc = 0;
    for(let y = H - 1; y >= 0; y--){ acc = (perMwh[y] + acc) / (1 + b.disc); nextV[y] = acc; }
    out = {taus, bind, revs, sohs, buds, perMwh, cyc, wearCost, V: nextV};
    if(Math.abs(taus[0] - prevTau0) <= TOL * Math.max(1, taus[0])){ V = nextV; break; }
    prevTau0 = taus[0];
    V = nextV;
    if(it === MAX_IT - 1) throw new Error('cycles engine: fixed point unconverged after ' + MAX_IT + ' iterations');
  }
  return out;
}
