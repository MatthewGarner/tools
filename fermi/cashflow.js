/* Pure cashflow engine (#13): period ranges → NPV / IRR / payback-or-cash-out /
   cumulative-band distributions. Sampling semantics match the estimator
   (log-normal per 90% range unless it crosses zero); seeded and deterministic.
   The cumulative band and payback/cash-out are UNDISCOUNTED — only NPV and IRR
   touch the discount rate. */
import {quantile} from '../assets/series.js';
import {effDist, Z90, irrOf, selectTrio} from './engine.js';
import {sizeDebt, leverTrials} from './debt.js';
import {CF_SEED, CF_N, CF_BAND_N} from './seeds.js';

const mid = p => (p.lo + p.hi) / 2;

export function simulateCashflow({periods, horizon, grain = 'year', rate, debt}, {seed = CF_SEED, n = CF_N} = {}){
  horizon = Math.min(60, Math.max(horizon || periods.length - 1, periods.length - 1));
  /* The stream is mulberry32(seed) feeding a Marsaglia polar gaussian, exactly assets/series.js's
     gaussian(mulberry32(seed)), written out as ONE closure: this loop makes ~2.5 million draws at a
     60-period horizon and the two nested closures were a quarter of its time. cashflow.test.mjs
     holds this to the library stream, draw for draw. */
  let st = seed | 0, spare = 0, haveSpare = false;
  const gauss = () => {
    if(haveSpare){ haveSpare = false; return spare; }
    let u, v, s2;
    do {
      st = st + 0x6D2B79F5 | 0;
      let t = Math.imul(st ^ st >>> 15, 1 | st);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      u = ((t ^ t >>> 14) >>> 0) / 4294967296 * 2 - 1;
      st = st + 0x6D2B79F5 | 0;
      t = Math.imul(st ^ st >>> 15, 1 | st);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      v = ((t ^ t >>> 14) >>> 0) / 4294967296 * 2 - 1;
      s2 = u * u + v * v;
    } while(s2 >= 1 || s2 === 0);
    const f = Math.sqrt(-2 * Math.log(s2) / s2);
    spare = v * f; haveSpare = true;
    return u * f;
  };

  /* The draw order is unconditional: per trial one gaussian for the rate, then one per period,
     whether or not that range has any width (a point range draws and discards). So a hairline
     change to a point range cannot shift every later draw. Each period's value is the same
     formula samplerFor uses (a log-normal above zero, else normal; the range its 90% interval),
     held as plain arrays so the hot loop is one monomorphic call and no closure per period. */
  const W = horizon + 1;
  const isLog = new Uint8Array(W), pMu = new Float64Array(W), pSg = new Float64Array(W);
  for(let t = 0; t <= horizon; t++){
    const p = periods[Math.min(t, periods.length - 1)];
    const lo = Math.min(p.lo, p.hi), hi = Math.max(p.lo, p.hi);
    if(lo === hi){ pMu[t] = lo; pSg[t] = 0; continue; }                    // a point: draws and discards
    if(effDist('auto', lo) === 'logn'){
      isLog[t] = 1; pMu[t] = (Math.log(lo) + Math.log(hi)) / 2; pSg[t] = (Math.log(hi) - Math.log(lo)) / (2 * Z90);
    } else { pMu[t] = (lo + hi) / 2; pSg[t] = (hi - lo) / (2 * Z90); }
  }
  const rateMid = mid(rate) / 100, rateSg = (rate.hi - rate.lo) / 100 / (2 * Z90);
  const sampleRate = () => Math.max(-0.99, rateMid + rateSg * gauss());

  /* framing from the midpoints: money out then in = investment; money in hand
     bleeding away = runway. The verdict language hangs off this. */
  let laterSum = 0;
  for(let t = 1; t <= horizon; t++) laterSum += mid(periods[Math.min(t, periods.length - 1)]);
  const framing = mid(periods[0]) > 0 && laterSum < 0 ? 'runway' : 'invest';
  const kind = framing === 'runway' ? 'cashout' : 'payback';

  /* debt sizing (levered returns) reuses these draws — no new rand() calls.
     Retain the per-trial flow path and rate ONLY when wanted, and always by COPY (flows is
     reused each trial). */
  const wantDebt = debt && framing === 'invest';
  const flowPaths = wantDebt ? new Float64Array(n * W) : null;
  const rateStore = wantDebt ? new Float64Array(n) : null;

  /* Cost: the chart is a picture, so its cumulative columns come from the first CF_BAND_N runs only;
     payback / cash-out times are small integers, so they are counted, not sorted; the discount
     factor runs along the periods instead of a Math.pow each. */
  const bandN = Math.min(n, CF_BAND_N);
  const npvs = new Float64Array(n);
  const irrs = new Float64Array(n);
  let irrCount = 0, eventTotal = 0;
  const eventCount = new Int32Array(W);
  const cumByT = Array.from({length: W}, () => new Float64Array(bandN));
  const flows = new Float64Array(W);
  let posCount = 0, irrUndefined = 0, never = 0, irrHint = NaN;
  const monthly = grain === 'month';

  for(let i = 0; i < n; i++){
    const r = sampleRate();
    const dd = 1 / (monthly ? Math.pow(1 + r, 1 / 12) : 1 + r);     // one period of discounting
    let npv = 0, cum = 0, event = -1, df = 1;
    for(let t = 0; t <= horizon; t++){
      const z = gauss();
      const cf = isLog[t] ? Math.exp(pMu[t] + pSg[t] * z) : pMu[t] + pSg[t] * z;   // a point has sigma 0: its draw is discarded
      flows[t] = cf;
      npv += cf * df;
      df *= dd;
      cum += cf;
      if(i < bandN) cumByT[t][i] = cum;
      if(event < 0){
        if(kind === 'payback' && t > 0 && cum >= 0) event = t;
        if(kind === 'cashout' && cum < 0) event = t;
      }
    }
    if(wantDebt){ const base = i * W; for(let t = 0; t < W; t++) flowPaths[base + t] = flows[t]; rateStore[i] = r; }
    npvs[i] = npv;
    if(npv > 0) posCount++;
    if(event >= 0){ eventCount[event]++; eventTotal++; } else never++;
    const irr = irrOf(flows, horizon, irrHint);                     // the last root is where the next one starts
    if(irr === null) irrUndefined++;
    else { irrHint = irr; irrs[irrCount++] = monthly ? Math.pow(1 + irr, 12) - 1 : irr; }
  }

  npvs.sort();
  const [i10, i50, i90] = selectTrio(irrs.subarray(0, irrCount));
  const q = (s, p) => s.length ? quantile(s, p) : null;
  const irr = {p10: i10, p50: i50, p90: i90, undefinedShare: irrUndefined / n};
  /* Cash-out and payback times are quantiles over ALL runs, a run that never gets there
     counted beyond the horizon. A quantile that lands among those runs is null ("not within
     the horizon"). With no never-runs this is the plain quantile, bit for bit. The k-th smallest
     event time is read off the counts. */
  const kth = k => { let t = 0, seen = eventCount[0]; while(seen <= k && t < W - 1) seen += eventCount[++t]; return t; };
  const qEvent = p => {
    const idx = p * (n - 1), lo = Math.floor(idx), hi = Math.ceil(idx);
    if(hi >= eventTotal) return null;
    const a = kth(lo);
    return a + (kth(hi) - a) * (idx - lo);
  };
  /* an outlay is a period that can be negative; without one there is nothing to pay back */
  let outlay = false;
  for(let t = 0; t <= horizon; t++) if(periods[Math.min(t, periods.length - 1)].lo < 0) outlay = true;

  /* debt block: null (runway / not requested), {ok:false, reason} (no build to
     fund), or the financing readout. Typed arrays (drawByT/dsByT) are stripped
     so nothing that can't serialise leaks into the URL/JSON. */
  let debtOut = null;
  if(debt && wantDebt){
    const sized = sizeDebt({periods, horizon, grain, dscr: debt.dscr, costOfDebt: debt.costOfDebt,
      tenor: debt.tenor, sizingCase: debt.sizingCase});
    if(!sized.ok) debtOut = sized;
    else {
      const lev = leverTrials(sized, {flowPaths, rates: rateStore, n, horizon, grain});
      const {drawByT, dsByT, ...scalars} = sized;
      debtOut = {...scalars, ...lev, unlevIrr: irr};
    }
  }

  return {
    n, bandN, horizon, grain, framing, outlay, npvSorted: npvs,
    npv: {p10: q(npvs, .1), p50: q(npvs, .5), p90: q(npvs, .9), pPos: posCount / n},
    irr,
    period: {kind, p10: qEvent(.1), p50: qEvent(.5), p90: qEvent(.9), neverShare: never / n},
    band: cumByT.map(col => { const [p10, p50, p90] = selectTrio(col); return {p10, p50, p90}; }),
    debt: debtOut,
  };
}

