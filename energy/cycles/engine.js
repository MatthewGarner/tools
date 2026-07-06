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
    /* damped update (full first step, then average) — the τ_wear ↔ budget-path
       coupling oscillates undamped for some belief draws */
    if(it === 0) V = nextV;
    else for(let y = 0; y < H; y++) V[y] = (V[y] + nextV[y]) / 2;
    if(it === MAX_IT - 1) throw new Error('cycles engine: fixed point unconverged after ' + MAX_IT + ' iterations');
  }
  return out;
}

/* ---------- run-level: simulate() over N belief draws ---------- */

const q3 = sorted => ({p10: quantile(sorted, .1), p50: quantile(sorted, .5), p90: quantile(sorted, .9)});
const med = arr => quantile(Float64Array.from(arr).sort(), .5);
/* band-2 deltas are MEANS: means are additive, so the verdict's
   "earns X, costs Y — Z net" stays arithmetically coherent (medians aren't) */
const mean = arr => arr.reduce((a, x) => a + x, 0) / arr.length;

/* NPV of the remaining years when capacity is restored to nameplate at year ys.
   Forward-only re-run from the saved state, reusing the converged V (named
   approximation: the augmented policy prices capacity off the base run). */
function resim(model, b, base, useSecond, on, ys){
  const H = model.cycles.years, E0 = model.battery.mwh;
  const k = (1 / b.rte - 1) * b.charge;
  let soh = 1, budget = ys > 0 ? on.buds[ys - 1] : model.cycles.budget;
  const revs = [];
  for(let y = ys; y < H; y++){
    const scale = Math.pow(1 + b.drift, y);
    const Ey = E0 * Math.max(soh, SOH_FLOOR);
    const aY = Math.max(0, budget) / (H - y);
    const tau = Math.max(b.fade * E0 * on.V[y] / Ey, tauBudget(base, scale, k, aY, useSecond));
    const x = (tau + k) / scale;
    const a1 = above(base.S1, x);
    const a2 = (useSecond && base.S2) ? above(base.S2, x) : {count: 0, sum: 0};
    let c = DAYS * (a1.count + a2.count) / N_BASE;
    let netSum = ((a1.sum + a2.sum) * scale - (a1.count + a2.count) * k) * DAYS / N_BASE;
    const cap = Math.min(Math.max(0, budget), aY);
    if(c > cap && c > 0){ const ratio = cap / c; c *= ratio; netSum *= ratio; }
    revs.push(Ey * netSum);
    budget -= c;
    soh = Math.max(SOH_FLOOR, soh - b.fade * c - b.cal);
  }
  return npv(revs, b.disc);
}

function augStats(bestYear, forgone){
  const finite = bestYear.filter(y => y !== Infinity).sort((a, b) => a - b);
  const pNever = 1 - finite.length / bestYear.length;
  if(!finite.length) return {window: null, pNever: 1, forgoneP50: 0};
  return {window: [Math.round(quantile(finite, .25)), Math.round(quantile(finite, .75))],
    pNever, forgoneP50: forgone.length ? med(forgone) : 0};
}

export function simulate(model, {seed = 1, n = 10000} = {}){
  if(!model || !complete(model)) return null;
  const H = model.cycles.years, E0 = model.battery.mwh;
  const base = makeBase(model, seed ^ 0x9e3779b9);
  const rand = mulberry32(seed), gauss = gaussian(rand);
  const useSecond = !!model.second;

  const tau1 = [], bind1 = [], clear1 = [], dRev = [], dWear = [], dNet = [], dNpv = [], capped = [];
  const bestYear = [], forgone = [];
  const revM = Array.from({length: H}, () => new Float64Array(n));
  const sohM = Array.from({length: H}, () => new Float64Array(n));
  const budM = Array.from({length: H}, () => new Float64Array(n));

  for(let r = 0; r < n; r++){
    const b = drawBeliefs(model, rand, gauss);
    const on = simPolicy(model, b, base, useSecond);
    tau1.push(on.taus[0]); bind1.push(on.bind[0] ? 1 : 0);
    /* clearing days quoted by the verdict = FIRST-cycle days clearing the same
       τ the verdict quotes (the joint policy's) — never a different policy's */
    const kR = (1 / b.rte - 1) * b.charge;
    clear1.push(DAYS * above(base.S1, on.taus[0] + kR).count / N_BASE);
    for(let y = 0; y < H; y++){ revM[y][r] = on.revs[y]; sohM[y][r] = on.sohs[y]; budM[y][r] = on.buds[y]; }

    if(useSecond){
      const off = simPolicy(model, b, base, false);
      dRev.push(on.revs[0] - off.revs[0]);
      dWear.push(on.wearCost[0] - off.wearCost[0]);
      dNet.push((on.revs[0] - off.revs[0]) - (on.wearCost[0] - off.wearCost[0]));
      dNpv.push(npv(on.revs, b.disc) - npv(off.revs, b.disc));
      capped.push(on.cyc[0] >= model.cycles.budget / H - 1 ? 1 : 0);
    }

    if(model.augment){
      let best = 0, bestY = -1;
      for(let ys = 1; ys < H; ys++){
        const deltaE = E0 * (1 - on.sohs[ys - 1]);
        if(deltaE <= 1e-9) continue;
        const gainAtYs = resim(model, b, base, useSecond, on, ys) - npv(on.revs, b.disc, ys);
        const v = (gainAtYs - b.aug * deltaE) / Math.pow(1 + b.disc, ys);
        if(v > best){ best = v; bestY = ys; }
      }
      bestYear.push(bestY < 0 ? Infinity : bestY + 1);
      /* forgone collects ONLY augmenting runs — a median polluted by the
         never-runs' zeros says "later forgoes £0", which is nonsense */
      if(bestY >= 1 && bestY + 1 < H){
        const opt = resim(model, b, base, useSecond, on, bestY);
        const late = resim(model, b, base, useSecond, on, bestY + 1);
        forgone.push(Math.max(0, opt - late - on.revs[bestY] / (1 + b.disc)));
      }
    }
  }

  tau1.sort((a, b2) => a - b2); clear1.sort((a, b2) => a - b2);
  return {
    H,
    threshold: {...q3(tau1), bindingShare: bind1.reduce((a, x) => a + x, 0) / n,
      clearingDays: quantile(clear1, .5)},
    second: useSecond ? {
      dRev: mean(dRev), dWear: mean(dWear), dNet: mean(dNet),
      lifetimeNpvDelta: mean(dNpv), capped: capped.reduce((a, x) => a + x, 0) / n} : null,
    augment: model.augment ? augStats(bestYear, forgone) : null,
    fan: revM.map(col => q3(Float64Array.from(col).sort())),
    soh: sohM.map(col => q3(Float64Array.from(col).sort())),
    burndown: budM.map(col => quantile(Float64Array.from(col).sort(), .5)),
  };
}

/* ---------- verdicts: the only place these sentences exist ---------- */

export function fmtUnit(v, unit){
  const m = String(unit).match(/^([£$€])(.*)$/);
  const s = fmt(Math.abs(v) < 1e-9 ? 0 : v);
  return m ? m[1] + s + m[2] : s + ' ' + unit;
}
const inTen = p => { const t = Math.round(p * 10); return t + ' run' + (t === 1 ? '' : 's') + ' in 10'; };

export function verdict(band, out){
  if(band === 'threshold'){
    const t = out.threshold;
    const binder = t.bindingShare >= 0.5
      ? 'In ' + inTen(t.bindingShare) + ' it’s the warranty doing the rationing, not the wear.'
      : 'In ' + inTen(1 - t.bindingShare) + ' it’s the wear cost setting the bar, not the warranty.';
    return 'Cycles are worth ' + fmtUnit(t.p50, '£/MWh') + ' each (P10 ' + fmtUnit(t.p10, '£/MWh') +
      ' – P90 ' + fmtUnit(t.p90, '£/MWh') + ') — only dispatch above that; ' +
      Math.round(t.clearingDays) + ' days a year clear it. ' + binder;
  }
  if(band === 'second'){
    if(!out.second) return null;
    const s = out.second;
    const cappedBit = s.capped >= 0.3
      ? ' The warranty caps the pair in ' + inTen(s.capped) + ' — the second cycle spends budget the best single days want back.'
      : '';
    return 'The second cycle earns ' + fmtUnit(s.dRev, '£/yr') + ' and costs ' + fmtUnit(s.dWear, '£/yr') +
      ' of wear — ' + fmtUnit(s.dNet, '£/yr') + ' net' +
      (s.lifetimeNpvDelta > 0 ? ', and it pays over the life' : ', but over the life it destroys value') +
      ' (' + fmtUnit(s.lifetimeNpvDelta, '£') + ' NPV).' + cappedBit;
  }
  if(band === 'augment'){
    if(!out.augment) return null;
    const a = out.augment;
    if(a.pNever >= 0.6) return 'Augmentation never pays at these numbers in ' + inTen(a.pNever) + '.';
    if(a.pNever >= 0.35) return 'It’s a coin flip whether augmentation pays at all (never in ' + inTen(a.pNever) +
      ') — when it does, the window is years ' + a.window[0] + '–' + a.window[1] + ' (P25–P75).';
    return 'Augment in years ' + a.window[0] + '–' + a.window[1] + ' (P25–P75): earlier wastes warranty headroom, later forgoes ' +
      fmtUnit(a.forgoneP50, '£/yr') + ' P50.' + (a.pNever > 0.15 ? ' (Never pays at all in ' + inTen(a.pNever) + '.)' : '');
  }
  return null;
}
