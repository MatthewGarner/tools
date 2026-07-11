/* Pure cashflow engine (#13): period ranges → NPV / IRR / payback-or-cash-out /
   cumulative-band distributions. Sampling semantics match the estimator
   (log-normal per 90% range unless it crosses zero); seeded and deterministic.
   The cumulative band and payback/cash-out are UNDISCOUNTED — only NPV and IRR
   touch the discount rate. */
import {mulberry32, gaussian, quantile} from '../assets/series.js';
import {samplerFor, Z90} from './engine.js';

const mid = p => (p.lo + p.hi) / 2;

export function simulateCashflow({periods, horizon, grain = 'year', rate}, {seed = 0xCA5F, n = 10000} = {}){
  horizon = Math.min(60, Math.max(horizon || periods.length - 1, periods.length - 1));
  const rand = mulberry32(seed), gauss = gaussian(rand);

  const samplers = [];
  for(let t = 0; t <= horizon; t++){
    const p = periods[Math.min(t, periods.length - 1)];
    samplers.push(samplerFor(p.lo, p.hi, 'auto', rand, gauss));
  }
  const rateMid = mid(rate) / 100, rateSg = (rate.hi - rate.lo) / 100 / (2 * Z90);
  const sampleRate = () => Math.max(-0.99, rateMid + (rateSg ? rateSg * gauss() : 0));

  /* framing from the midpoints: money out then in = investment; money in hand
     bleeding away = runway. The verdict language hangs off this. */
  let laterSum = 0;
  for(let t = 1; t <= horizon; t++) laterSum += mid(periods[Math.min(t, periods.length - 1)]);
  const framing = mid(periods[0]) > 0 && laterSum < 0 ? 'runway' : 'invest';
  const kind = framing === 'runway' ? 'cashout' : 'payback';

  let npvs = new Array(n), irrs = [], events = [];
  const cumByT = Array.from({length: horizon + 1}, () => new Array(n));
  const flows = new Array(horizon + 1);
  let posCount = 0, irrUndefined = 0, never = 0;

  for(let i = 0; i < n; i++){
    const r = sampleRate();
    const perR = grain === 'month' ? Math.pow(1 + r, 1 / 12) - 1 : r;
    let npv = 0, cum = 0, event = -1;
    for(let t = 0; t <= horizon; t++){
      const cf = samplers[t]();
      flows[t] = cf;
      npv += cf / Math.pow(1 + perR, t);
      cum += cf;
      cumByT[t][i] = cum;
      if(event < 0){
        if(kind === 'payback' && t > 0 && cum >= 0) event = t;
        if(kind === 'cashout' && cum < 0) event = t;
      }
    }
    npvs[i] = npv;
    if(npv > 0) posCount++;
    if(event >= 0) events.push(event); else never++;
    const irr = irrOf(flows, horizon);
    if(irr === null) irrUndefined++;
    else irrs.push(grain === 'month' ? Math.pow(1 + irr, 12) - 1 : irr);
  }

  npvs = Float64Array.from(npvs).sort();
  irrs = Float64Array.from(irrs).sort();
  events = Float64Array.from(events).sort();
  const q = (s, p) => s.length ? quantile(s, p) : null;
  return {
    n, horizon, grain, framing, npvSorted: npvs,
    npv: {p10: q(npvs, .1), p50: q(npvs, .5), p90: q(npvs, .9), pPos: posCount / n},
    irr: {p10: q(irrs, .1), p50: q(irrs, .5), p90: q(irrs, .9), undefinedShare: irrUndefined / n},
    period: {kind, p10: q(events, .1), p50: q(events, .5), p90: q(events, .9), neverShare: never / n},
    band: cumByT.map(col => {
      const s = Float64Array.from(col).sort();
      return {p10: quantile(s, .1), p50: quantile(s, .5), p90: quantile(s, .9)};
    }),
  };
}

/* IRR of one sampled flow vector: bisection on NPV(r) over (−0.99, 10];
   null when the endpoints don't bracket a root (e.g. flows never change sign). */
function irrOf(flows, horizon){
  const f = r => {
    const d = 1 / (1 + r);
    let acc = 0;
    for(let t = horizon; t >= 0; t--) acc = acc * d + flows[t];
    return acc;
  };
  let lo = -0.9899, hi = 10;
  let flo = f(lo), fhi = f(hi);
  if(!(isFinite(flo) && isFinite(fhi)) || flo * fhi > 0) return null;
  for(let i = 0; i < 60; i++){
    const m = (lo + hi) / 2, fm = f(m);
    if(fm === 0) return m;
    if(flo * fm < 0){ hi = m; fhi = fm; } else { lo = m; flo = fm; }
  }
  return (lo + hi) / 2;
}
