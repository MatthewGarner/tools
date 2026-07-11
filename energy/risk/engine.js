/* Pure engine: seeded merchant sampling (lognormal default + normal tail-check),
   payoff transforms per archetype, fee-clean trade decomposition, verdicts.
   Every number the UI quotes is defined here and only here.
   The lo..hi → sampler maths lives in assets/series.js (rangeSampler) since
   /cycles became its 4th consumer; fermi migrates when next touched. */
import {mulberry32, gaussian, quantile, fmt, rangeSampler, Z90} from '../../assets/series.js';
export {Z90};

export function draws(lo, hi, dist, seed, n){
  const rand = mulberry32(seed), gauss = gaussian(rand);
  const f = rangeSampler(lo, hi, dist, rand, gauss);
  return Array.from({length: n}, f);
}

/* pay = what you receive; pay0 = the fee-free transform (risk terms only);
   bindAt = the threshold whose P(m < bindAt) is the row's headline probability */
export function payoffs(kind, p){
  if(kind === 'merchant') return {pay: m => m, pay0: m => m, fee: 0, bindAt: null};
  if(kind === 'floor'){
    const {level: F, share, fee} = p;
    const pay0 = m => m <= F ? F : F + share * (m - F);
    return {pay: m => pay0(m) - fee, pay0, fee, bindAt: F};
  }
  if(kind === 'toll'){
    const {fixed: T, fee} = p;
    return {pay: () => T - fee, pay0: () => T, fee, bindAt: T};
  }
  const {premium, attach: A, limit: L} = p;
  const pay0 = m => m + Math.min(Math.max(0, A - m), L);
  return {pay: m => pay0(m) - premium, pay0, fee: premium, bindAt: A};
}

export function simulate(model, {seed = 1, n = 10000} = {}){
  if(!model || !model.merchant) return null;
  const {lo, hi} = model.merchant;
  const mA = draws(lo, hi, 'logn', seed, n);   // primary (lognormal when lo > 0)
  const mB = draws(lo, hi, 'norm', seed, n);   // tail-shape check
  const mSorted = Float64Array.from(mA).sort();
  const rows = [{kind: 'merchant', label: 'Merchant', srcLine: model.merchant.srcLine,
    params: {}, p10: quantile(mSorted, .1), p50: quantile(mSorted, .5), p90: quantile(mSorted, .9),
    sorted: mSorted, bind: null, trade: null}];

  for(const s of model.structures){
    const {pay, pay0, fee, bindAt} = payoffs(s.kind, s.params);
    const sorted = Float64Array.from(mA, pay).sort();
    let bind = null;
    if(bindAt !== null){
      const frac = arr => arr.reduce((c, m) => c + (m < bindAt ? 1 : 0), 0) / n;
      const pA = frac(mA), pB = frac(mB);
      bind = {p: pA, lo: Math.min(pA, pB), hi: Math.max(pA, pB),
        sensitive: Math.abs(pA - pB) > 0.05};
    }
    let up = 0, down = 0;
    let deltas = new Array(n);
    for(let i = 0; i < n; i++){
      const d0 = pay0(mA[i]) - mA[i];
      if(d0 < 0) up -= d0; else down += d0;
      deltas[i] = pay(mA[i]) - mA[i];
    }
    deltas = Float64Array.from(deltas).sort();
    rows.push({kind: s.kind, label: s.label, srcLine: s.srcLine, params: s.params,
      p10: quantile(sorted, .1), p50: quantile(sorted, .5), p90: quantile(sorted, .9),
      sorted, bind,
      trade: {upsideSold: up / n, downsideBought: down / n, fees: fee,
        typicalDelta: quantile(deltas, .5), worstDelta: quantile(sorted, .1) - rows[0].p10}});
  }

  /* shared axis: clamp to the P0.2–P99.8 band so a lognormal tail can't
     squeeze every row into the left half of the plot */
  const min = Math.min(...rows.map(r => quantile(r.sorted, .002)));
  const max = Math.max(...rows.map(r => quantile(r.sorted, .998)));
  const BINS = 64;
  for(const r of rows){
    const bins = new Array(BINS).fill(0);
    for(const v of r.sorted)
      bins[Math.max(0, Math.min(BINS - 1, Math.floor((v - min) / (max - min || 1) * BINS)))]++;
    const peak = Math.max(...bins) || 1;
    r.ribbon = bins.map(b => b / peak);
  }
  return {rows, min, max, n};
}

export function fmtUnit(v, unit){
  const m = String(unit).match(/^([£$€])(.*)$/);
  const s = fmt(Math.abs(v) < 1e-9 ? 0 : v);
  return m ? m[1] + s + m[2] : s + ' ' + unit;
}

const pct = p => Math.round(p * 100) + '%';
function bindClause(bind){
  if(bind.sensitive) return pct(bind.lo) + '–' + pct(bind.hi) + ' of years depending on tail shape';
  const t = Math.round(bind.p * 10);
  return t === 0 ? 'almost never' : t + ' year' + (t === 1 ? '' : 's') + ' in 10';
}

export function verdict(row, unit){
  if(!row.trade) return null;
  const u = v => fmtUnit(v, unit);
  const {upsideSold, downsideBought, fees, typicalDelta, worstDelta} = row.trade;
  const feeBit = fees > 0 ? ' and paid ' + u(fees) + ' in fees' : '';
  const tail = ' — worst-year ' + (worstDelta >= 0 ? 'improves ' : 'worsens ') + u(Math.abs(worstDelta)) +
    ', typical year ' + (typicalDelta >= 0 ? 'gains ' : 'costs ') + u(Math.abs(typicalDelta)) + '.';
  if(row.kind === 'floor')
    return 'The floor binds ' + bindClause(row.bind) + '. You sold ' + u(upsideSold) +
      ' of average upside' + feeBit + ' for ' + u(downsideBought) + ' of downside protection' + tail;
  if(row.kind === 'toll')
    return 'The toll beats merchant in ' + bindClause(row.bind) + '. You handed over ' + u(upsideSold) +
      ' of average upside for ' + u(downsideBought) + ' of bad-year cover' + tail;
  return 'Cover pays in ' + bindClause(row.bind) + '. The ' + u(fees) + ' premium buys ' +
    u(downsideBought) + ' of expected payout' + tail;
}
