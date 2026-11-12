/* Pure engine: deterministic quantile-grid merchant (lognormal default + normal tail-check),
   payoff transforms per archetype, fee-clean trade decomposition, verdicts.
   Every number the UI quotes is defined here and only here.
   The lo..hi → sampler maths lives in assets/series.js (rangeSampler) since
   /cycles became its 4th consumer; fermi migrates when next touched. */
import {quantile, fmt, Z90} from '../../assets/series.js';
export {Z90};

/* Inverse normal CDF (Wichura AS241, ~1e-16). Merchant is ONE distribution with a
   closed-form inverse CDF and every structure's pay is a non-decreasing function of
   m, so Risk draws a deterministic stratified grid m_i = Q((i + ½)/n) instead of random
   samples: quantiles and expectations carry no sampling error (audit RISK-3). */
export function normInv(p){
  const q = p - 0.5;
  if(Math.abs(q) <= 0.425){
    const r = 0.180625 - q * q;
    return q * (((((((2509.0809287301226727 * r + 33430.575583588128105) * r + 67265.770927008700853) * r + 45921.953931549871457) * r + 13731.693765509461125) * r + 1971.5909503065514427) * r + 133.14166789178437745) * r + 3.387132872796366608) /
      (((((((5226.495278852545925 * r + 28729.085735721942674) * r + 39307.89580009271061) * r + 21213.794301586595867) * r + 5394.1960214247511077) * r + 687.1870074920579083) * r + 42.313330701600911252) * r + 1);
  }
  let r = q < 0 ? p : 1 - p;
  r = Math.sqrt(-Math.log(r));
  let v;
  if(r <= 5){
    r -= 1.6;
    v = (((((((7.7454501427834140764e-4 * r + 0.0227238449892691845833) * r + 0.24178072517745061177) * r + 1.27045825245236838258) * r + 3.64784832476320460504) * r + 5.7694972214606914055) * r + 4.6303378461565452959) * r + 1.42343711074968357734) /
      (((((((1.05075007164441684324e-9 * r + 5.475938084995344946e-4) * r + 0.0151986665636164571966) * r + 0.14810397642748007459) * r + 0.68976733498510000455) * r + 1.6763848301838038494) * r + 2.05319162663775882187) * r + 1);
  } else {
    r -= 5;
    v = (((((((2.01033439929228813265e-7 * r + 2.71155556874348757815e-5) * r + 0.0012426609473880784386) * r + 0.026532189526576123093) * r + 0.29656057182850489123) * r + 1.7848265399172913358) * r + 5.4637849111641143699) * r + 6.6579046435011037772) /
      (((((((2.04426310338993978564e-15 * r + 1.4215117583164458887e-7) * r + 1.8463183175100546818e-5) * r + 7.868691311456132591e-4) * r + 0.0148753612908506148525) * r + 0.13692988092273580531) * r + 0.59983220655588793769) * r + 1);
  }
  return q < 0 ? -v : v;
}

/* the n grid points, ascending. seed is accepted and ignored (no randomness remains). */
export function draws(lo, hi, dist, seed, n){
  if(lo > hi){ const t = lo; lo = hi; hi = t; }
  if(lo === hi) return Array.from({length: n}, () => lo);
  const d = (dist === 'logn' && lo <= 0) ? 'norm' : dist;
  const mu = d === 'logn' ? (Math.log(lo) + Math.log(hi)) / 2 : (lo + hi) / 2;
  const sg = d === 'logn' ? (Math.log(hi) - Math.log(lo)) / (2 * Z90) : (hi - lo) / (2 * Z90);
  return Array.from({length: n}, (_, i) => { const z = mu + sg * normInv((i + 0.5) / n); return d === 'logn' ? Math.exp(z) : z; });
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
    /* the toll beats merchant when T - fee > m; markers drawn at the toll level stay at T */
    return {pay: () => T - fee, pay0: () => T, fee, bindAt: T - fee};
  }
  const {premium, attach: A, limit: L} = p;
  const pay0 = m => m + Math.min(Math.max(0, A - m), L);
  return {pay: m => pay0(m) - premium, pay0, fee: premium, bindAt: A};
}

export function simulate(model, {seed = 1, n = 10000} = {}){
  if(!model || !model.merchant) return null;
  const {lo, hi} = model.merchant;
  const mA = draws(lo, hi, 'logn', seed, n);   // primary: lognormal quantile grid (normal when lo <= 0)
  const mB = draws(lo, hi, 'norm', seed, n);   // tail-shape check: normal quantile grid
  const tailCheck = lo > 0;                    // at lo <= 0 the lognormal is impossible: mA IS the normal
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
      bind = tailCheck
        ? {p: pA, lo: Math.min(pA, pB), hi: Math.max(pA, pB), sensitive: Math.abs(pA - pB) > 0.05, tailCheck}
        : {p: pA, lo: pA, hi: pA, sensitive: null, tailCheck};
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
  let m = String(unit).match(/^([£$€])(.*)$/);
  /* a "£k/…" unit already says thousands: from 1000 up, step to millions rather than print "kk" */
  if(m && /^k/.test(m[2]) && Math.abs(v) >= 1000){
    m = [m[0], m[1], 'm' + m[2].slice(1)];
    return m[1] + fmt(v / 1000) + m[2];
  }
  const s = fmt(Math.abs(v) < 1e-9 ? 0 : v);
  return m ? m[1] + s + m[2] : s + ' ' + unit;
}

const pct = p => Math.round(p * 100) + '%';
function bindClause(bind){
  if(bind.sensitive === null) return bindWords(bind) + ' (tail-shape check unavailable: the range reaches zero)';
  return bindWords(bind);
}
function bindWords(bind){
  if(bind.sensitive) return pct(bind.lo) + '–' + pct(bind.hi) + ' of years depending on tail shape';
  const t = Math.round(bind.p * 10);
  return t === 0 ? 'almost never' : t + ' year' + (t === 1 ? '' : 's') + ' in 10';
}

/* The trade sentence's ONE key figure (Swiss 6c): the FIRST money figure it
   quotes — the average upside you sold (floor/toll) or the premium you paid
   (insure). First by construction, so assets/verdict.js's first-occurrence
   split can never land on a later figure that happens to format the same. */
export function tradeFigure(row, unit){
  if(!row || !row.trade) return '';
  const {upsideSold, fees} = row.trade;
  return fmtUnit(row.kind === 'floor' || row.kind === 'toll' ? upsideSold : fees, unit);
}

export function verdict(row, unit){
  if(!row.trade) return null;
  const u = v => fmtUnit(v, unit);
  const {upsideSold, downsideBought, fees, typicalDelta, worstDelta} = row.trade;
  const feeBit = fees > 0 ? ' and paid ' + u(fees) + ' in fees' : '';
  const tail = ' — bad year (P10) ' + (worstDelta >= 0 ? 'improves ' : 'worsens ') + u(Math.abs(worstDelta)) +
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
