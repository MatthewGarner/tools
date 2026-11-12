// Audit harness: energy/risk. Run: node dev/engine-audit/risk/run.mjs   (about 10-20 s)
import {readFileSync} from 'node:fs';
import {check, done, rng} from './lib.mjs';
import {parse} from '../../../energy/risk/parse.js';
import {simulate, payoffs, verdict, fmtUnit, draws} from '../../../energy/risk/engine.js';

// ---- reference maths (independent of the engine) -------------------------------------------
const erfc = x => { const z = Math.abs(x), t = 1 / (1 + 0.5 * z);       // Numerical Recipes erfcc, |err| < 1.2e-7
  const r = t * Math.exp(-z * z - 1.26551223 + t * (1.00002368 + t * (0.37409196 + t * (0.09678418 + t * (-0.18628806 + t * (0.27886807 + t * (-1.13520398 + t * (1.48851587 + t * (-0.82215223 + t * 0.17087277)))))))));
  return x >= 0 ? r : 2 - r; };
const Phi = x => 0.5 * erfc(-x / Math.SQRT2);
const Z95 = 1.6448536269514722, Z90q = 1.2815515655446004;
const LN = (lo, hi) => ({mu: (Math.log(lo) + Math.log(hi)) / 2, s: (Math.log(hi) - Math.log(lo)) / (2 * Z95)});
// E[(m-K)+] and E[(K-m)+] for lognormal m
const call = (mu, s, K) => { const d2 = (mu - Math.log(K)) / s, d1 = d2 + s; return Math.exp(mu + s * s / 2) * Phi(d1) - K * Phi(d2); };
const put = (mu, s, K) => call(mu, s, K) - (Math.exp(mu + s * s / 2) - K);
const rel = (a, b) => Math.abs(a - b) / Math.max(1e-9, Math.abs(b));
const M = t => parse(t);
const sim = (t, o = {}) => simulate(M(t), o);
const mean = a => { let s = 0; for(const v of a) s += v; return s / a.length; };

const T0 = 'merchant: 60..180\n';
// ---------- R1. merchant row vs closed-form lognormal -----------------------------------------
{
  const {mu, s} = LN(60, 180), N = 400000;
  const o = sim(T0, {seed: 11, n: N}), r = o.rows[0];
  const want = {p10: Math.exp(mu - Z90q * s), p50: Math.exp(mu), p90: Math.exp(mu + Z90q * s)};
  console.log(`   info: hand merchant P10/P50/P90 = ${want.p10.toFixed(3)} / ${want.p50.toFixed(3)} / ${want.p90.toFixed(3)}  engine = ${r.p10.toFixed(3)} / ${r.p50.toFixed(3)} / ${r.p90.toFixed(3)}`);
  check('R1a merchant P10/P50/P90 match the lognormal closed form (n=400k, 0.5 %)', rel(r.p10, want.p10) < .005 && rel(r.p50, want.p50) < .005 && rel(r.p90, want.p90) < .005);
  const sorted = r.sorted, q = p => sorted[Math.floor(p * (N - 1))];
  check('R1b the stated range is a 90 % interval: sample P5 ~ 60 and P95 ~ 180', rel(q(.05), 60) < .01 && rel(q(.95), 180) < .01, `P5 ${q(.05).toFixed(2)} P95 ${q(.95).toFixed(2)}`);
  check('R1c sample mean matches exp(mu+s^2/2)', rel(mean(sorted), Math.exp(mu + s * s / 2)) < .005, `${mean(sorted).toFixed(2)} vs ${Math.exp(mu + s * s / 2).toFixed(2)}`);
}
// ---------- R2. payoff tables by hand -----------------------------------------------------------
{
  const f = payoffs('floor', {level: 70, share: .6, fee: 5}), t = payoffs('toll', {fixed: 95, fee: 0}), i = payoffs('insure', {premium: 6, attach: 65, limit: 30});
  // floor 70 share 60% fee 5: m=50 -> 70-5=65 ; m=100 -> 70+0.6*30-5=83
  check('R2a floor pays (hand: 65 @m=50, 83 @m=100)', f.pay(50) === 65 && Math.abs(f.pay(100) - 83) < 1e-12);
  check('R2b toll pays fixed', t.pay(10) === 95 && t.pay(500) === 95);
  // insure premium 6 attach 65 limit 30: m=50 -> 50+15-6=59 ; m=20 -> 20+30-6=44 ; m=100 -> 94
  check('R2c insure pays (hand: 59, 44, 94)', i.pay(50) === 59 && i.pay(20) === 44 && i.pay(100) === 94);
}
// ---------- R3. trade decomposition vs closed form (upside sold, protection bought) -------------
{
  const {mu, s} = LN(60, 180), N = 400000;
  const o = sim(T0 + 'floor: 70 share 60% fee 5\ntoll: 95\ninsure: premium 6 attach 65 limit 30', {seed: 5, n: N});
  const [, fl, tl, ins] = o.rows;
  const hand = {
    floorUp: 0.4 * call(mu, s, 70), floorDown: put(mu, s, 70),
    tollUp: call(mu, s, 95), tollDown: put(mu, s, 95),
    insDown: put(mu, s, 65) - put(mu, s, 35),
  };
  const e = [['floor upside sold', fl.trade.upsideSold, hand.floorUp], ['floor protection', fl.trade.downsideBought, hand.floorDown],
    ['toll upside sold', tl.trade.upsideSold, hand.tollUp], ['toll protection', tl.trade.downsideBought, hand.tollDown], ['insure expected payout', ins.trade.downsideBought, hand.insDown]];
  for(const [n, a, b] of e) check(`R3 ${n} vs Black-Scholes-style closed form`, rel(a, b) < .01, `engine ${a.toFixed(3)} hand ${b.toFixed(3)} (${(100 * rel(a, b)).toFixed(2)} %)`);
  // exact algebraic identity per sample set: mean(pay) = mean(m) - up + down - fee
  let worst = 0;
  for(const r of [fl, tl, ins]) worst = Math.max(worst, Math.abs(mean(r.sorted) - (mean(o.rows[0].sorted) - r.trade.upsideSold + r.trade.downsideBought - r.trade.fees)));
  check('R3b identity: E[pay] = E[m] - upside sold + protection - fees (every structure)', worst < 1e-6, `max abs gap ${worst.toExponential(1)}`);
  check('R3c insure never "sells upside"', ins.trade.upsideSold === 0);
}
// ---------- R4. binding probabilities ------------------------------------------------------------
{
  const {mu, s} = LN(60, 180), N = 400000;
  const o = sim(T0 + 'floor: 70 share 60% fee 5\ntoll: 95 fee 10\ninsure: premium 6 attach 65 limit 30', {seed: 5, n: N});
  const [, fl, tl, ins] = o.rows;
  const pF = Phi((Math.log(70) - mu) / s), pI = Phi((Math.log(65) - mu) / s);
  check('R4a floor "binds" = P(m < 70)', Math.abs(fl.bind.p - pF) < .005, `engine ${fl.bind.p.toFixed(4)} hand ${pF.toFixed(4)}`);
  check('R4b insure "pays" = P(m < 65)', Math.abs(ins.bind.p - pI) < .005, `engine ${ins.bind.p.toFixed(4)} hand ${pI.toFixed(4)}`);
  // toll with a 10 fee pays 85: it beats merchant only when m < 85, but the engine counts m < 95
  const pT = Phi((Math.log(95 - 10) - mu) / s), pTwrong = Phi((Math.log(95) - mu) / s);
  const emp = (() => { let c = 0; for(const m of o.rows[0].sorted) if(m < 85) c++; return c / N; })();
  check('R4c toll "beats merchant" = P(m < T - fee) when the toll carries a fee', Math.abs(tl.bind.p - pT) < .005,
    `toll 95 fee 10 pays 85. P(m<85) = ${pT.toFixed(4)} (sample ${emp.toFixed(4)}); engine reports P(m<95) = ${tl.bind.p.toFixed(4)} (hand ${pTwrong.toFixed(4)}). Verdict prints: ${verdict(tl, '£k/MW/yr').slice(0, 60)}`, {known: true});
  // tail sensitivity flag: lognormal-vs-normal disagreement
  const ts = sim('merchant: 60..180\nfloor: 62', {seed: 1, n: 20000}).rows[1].bind;
  console.log(`   info: floor 62 (deep tail): lognormal ${ts.p.toFixed(3)} range ${ts.lo.toFixed(3)}-${ts.hi.toFixed(3)} sensitive=${ts.sensitive}; verdict: ${verdict(sim('merchant: 60..180\nfloor: 62', {seed: 1, n: 20000}).rows[1], '£k').slice(0, 90)}`);
}
// ---------- R5. invariants on a seeded random sweep ---------------------------------------------
{
  const R = rng(99); let bad = [];
  const u = (a, b) => a + R() * (b - a);
  for(let i = 0; i < 200; i++){
    const lo = u(10, 100), hi = lo * u(1.2, 4);
    let txt = `merchant: ${lo.toFixed(1)}..${hi.toFixed(1)}\n`;
    const k = Math.round(u(1, 4));
    for(let j = 0; j < k; j++){ const c = R(), L = u(lo * .7, hi * 1.1).toFixed(1);
      txt += c < .4 ? `floor: ${L} share ${Math.round(u(0, 100))}% fee ${u(0, 8).toFixed(1)}\n` : c < .7 ? `toll: ${L} fee ${u(0, 5).toFixed(1)}\n` : `insure: premium ${u(0, 10).toFixed(1)} attach ${L} limit ${u(5, 60).toFixed(1)}\n`; }
    const m = M(txt), o = simulate(m, {seed: i + 1, n: 3000});
    const tag = s => bad.push(s + ' :: ' + txt.replace(/\n/g, ' | '));
    for(const r of o.rows){
      if(!(r.p10 <= r.p50 && r.p50 <= r.p90)) tag('quantiles unordered ' + r.label);
      if(r.bind && !(r.bind.p >= 0 && r.bind.p <= 1 && r.bind.lo <= r.bind.p + 1e-12 && r.bind.p <= r.bind.hi + 1e-12)) tag('bind range ' + r.label);
      if(r.ribbon.length !== 64 || Math.max(...r.ribbon) !== 1 || r.ribbon.some(v => v < 0 || v > 1)) tag('ribbon ' + r.label);
      if(r.trade && (r.trade.upsideSold < 0 || r.trade.downsideBought < 0)) tag('negative decomposition ' + r.label);
      if(r.kind === 'floor' && r.sorted[0] < r.params.level - r.params.fee - 1e-9) tag('floor payoff below level - fee');
      if(r.kind === 'insure' && r.sorted[0] < Math.min(...[r.params.attach - r.params.premium]) - 1e-9 && r.sorted[0] < o.rows[0].sorted[0] - r.params.premium - 1e-9) tag('insure payoff below merchant - premium');
      if(r.kind === 'toll' && !(r.p10 === r.p50 && r.p50 === r.p90)) tag('toll not a point mass');
    }
    // order independence
    const lines = txt.trim().split('\n'), head = lines[0], rest = lines.slice(1).reverse();
    const o2 = simulate(M([head, ...rest].join('\n')), {seed: i + 1, n: 3000});
    const key = r => `${r.label}|${r.p10}|${r.p50}|${r.p90}|${r.trade ? r.trade.upsideSold + '|' + r.trade.downsideBought : ''}`;
    const A = new Set(o.rows.map(key)), B = new Set(o2.rows.map(key));
    if(A.size !== B.size || [...A].some(x => !B.has(x))) tag('result depends on structure order');
  }
  check('R5a invariants (quantile order, ribbons, bind ranges, payoff floors, decomposition >= 0, order independence) over 200 random models', bad.length === 0, `${bad.length} violations; first ${bad[0]}`);
  // widening the merchant range never narrows the output
  let w = 0;
  for(let i = 0; i < 50; i++){ const lo = u(20, 80), hi = lo * u(1.3, 2.5), a = simulate(M(`merchant: ${lo}..${hi}`), {seed: 3, n: 3000}).rows[0], b = simulate(M(`merchant: ${lo / 1.2}..${hi * 1.2}`), {seed: 3, n: 3000}).rows[0];
    if(b.p90 - b.p10 < a.p90 - a.p10) w++; }
  check('R5b wider merchant range never narrows P10-P90', w === 0, `${w}/50`);
  // more share kept -> more upside kept
  const s1 = sim(T0 + 'floor: 70 share 40%', {seed: 2, n: 5000}).rows[1], s2 = sim(T0 + 'floor: 70 share 80%', {seed: 2, n: 5000}).rows[1];
  check('R5c higher floor share sells less upside and raises P90', s2.trade.upsideSold < s1.trade.upsideSold && s2.p90 > s1.p90);
  check('R5d seeded: same seed, same output; different seed, different output', JSON.stringify(sim(T0 + 'toll: 95', {seed: 4, n: 500}).rows.map(r => r.p50)) === JSON.stringify(sim(T0 + 'toll: 95', {seed: 4, n: 500}).rows.map(r => r.p50)) && sim(T0, {seed: 4, n: 500}).rows[0].p50 !== sim(T0, {seed: 5, n: 500}).rows[0].p50);
}
// ---------- R6. printed rounding / units ---------------------------------------------------------
{
  const cases = [[2500, '£k/MW/yr'], [1500000, '£/MW/yr'], [0.0004, '£/MWh'], [95, 'GBP/MWh'], [-0.0000000001, '£k']];
  console.log('   info: fmtUnit samples: ' + cases.map(([v, u]) => JSON.stringify(fmtUnit(v, u))).join(' '));
  check('R6a a value >= 1000 in a "£k/..." unit prints one k suffix, not two ("£2.5kk")', !/kk/.test(fmtUnit(2500, '£k/MW/yr')), fmtUnit(2500, '£k/MW/yr'), {known: true});
  check('R6b tiny negative noise prints as 0 not "-0"', fmtUnit(-1e-10, '£k') === '£0k');
}
// ---------- R7. edges the text format can produce -----------------------------------------------
{
  const warnOf = t => M(t).warnings;
  const p = M('merchant: 60..180\nfloor: 70 share 0.6\ntoll: 95 coffee 5\nfloor: 70 fee 5%\ninsure: 5 premium 6 attach 65');
  console.log('   info: "share 0.6" ->', p.structures[0].params.share, '| "toll: 95 coffee 5" ->', JSON.stringify(p.structures[1].params), '| "fee 5%" ->', p.structures[2].params.fee, '| insure with a stray leading number ->', JSON.stringify(p.structures[3].params));
  check('R7a "share 0.6" (a fraction) is not read as 0.6 %', p.structures[0].params.share >= 0.5 || warnOf('merchant: 60..180\nfloor: 70 share 0.6').length > 0, `share=${p.structures[0].params.share}, warnings: ${JSON.stringify(warnOf('merchant: 60..180\nfloor: 70 share 0.6'))}`, {known: true});
  check('R7b a word merely ending in "fee" ("coffee 5") is not parsed as a fee', p.structures[1].params.fee === 0, `fee=${p.structures[1].params.fee}`, {known: true});
  const neg = M('merchant: 60..180\ntoll: 95 fee -5\ninsure: premium -6 attach 65');
  console.log('   info: negative fee -> toll fee', neg.structures[0].params.fee, '(clamped silently); negative premium ->', neg.structures[1].params.premium, '(kept) warnings', JSON.stringify(neg.warnings));
  const z = (t) => { try{ const o = sim(t, {n: 2000}); return o.rows.every(r => Number.isFinite(r.p50) && r.ribbon.every(Number.isFinite)); }catch(e){ return 'threw ' + e.message; } };
  check('R7c zero-width merchant range stays finite', z('merchant: 100..100\nfloor: 90\ntoll: 95') === true);
  check('R7d merchant range touching/below zero (normal fallback) stays finite', z('merchant: -20..100\nfloor: 10\ninsure: premium 2 attach 5') === true && z('merchant: 0..100\ntoll: 50') === true);
  check('R7e huge values stay finite (merchant: 100000000..200000000)', z('merchant: 100000000..200000000\nfloor: 120000000\ntoll: 150000000') === true);
  check('R7f no structures: only the merchant row', sim(T0).rows.length === 1);
  check('R7g empty / no merchant -> null (no crash)', simulate(M(''), {}) === null && simulate(M('toll: 95'), {}) === null);
  check('R7h share clamped to 0..100 with a warning', M('merchant: 60..180\nfloor: 70 share 150%').structures[0].params.share === 1 && M('merchant: 60..180\nfloor: 70 share 150%').warnings.some(w => /clamp/.test(w)));
  const lim = sim('merchant: 60..180\ninsure: premium 6 attach 65 limit 0', {n: 2000}).rows[1];
  check('R7i insure with limit 0 pays nothing (protection 0)', lim.trade.downsideBought === 0);
}
// ---------- R8. what the verdict says vs the draws ------------------------------------------------
{
  const o = sim(T0 + 'floor: 70 share 60% fee 5\ntoll: 95\ninsure: premium 6 attach 65 limit 30', {seed: 1, n: 10000});
  const m = o.rows[0].sorted;
  for(const r of o.rows.slice(1)){
    const pay = payoffs(r.kind, r.params).pay;
    const arr = Float64Array.from(m, pay).sort();
    const worstWant = arr[Math.floor(.1 * (arr.length - 1))] - m[Math.floor(.1 * (m.length - 1))];
    console.log(`   info: R8 ${r.label}: printed "worst-year ${r.trade.worstDelta >= 0 ? 'improves' : 'worsens'} ${Math.abs(r.trade.worstDelta).toFixed(2)}" = P10(structure) - P10(merchant); the actual worst draw differs: min(pay)-min(m) = ${(arr[0] - m[0]).toFixed(2)}`);   // presentation note, not a pass/fail check
  }
  // 'typical year' = median of per-draw delta; check by re-computation from the same seeded draws
  const mA = draws(60, 180, 'logn', 1, 10000), f = payoffs('floor', {level: 70, share: .6, fee: 5}).pay;
  const dl = Float64Array.from(mA, x => f(x) - x).sort();
  check('R8b typicalDelta = median(pay - m)', Math.abs(dl[Math.floor(.5 * 9999)] / 1 - o.rows[1].trade.typicalDelta) < 0.01 * 1 + 1e-3, `${o.rows[1].trade.typicalDelta.toFixed(3)} vs ~${((dl[4999] + dl[5000]) / 2).toFixed(3)}`);
}
// ---------- R9. built-in examples: do the headlines hold? -----------------------------------------
{
  const src = readFileSync(new URL('../../../energy/risk/app.js', import.meta.url), 'utf8');
  const EX = [...src.matchAll(/\{name: '([^']+)', src:\s*\n`([^`]*)`\}/g)].map(x => ({name: x[1], src: x[2]}));
  console.log(`   info: ${EX.length} examples`);
  for(const ex of EX){
    const m = M(ex.src), o = simulate(m);
    console.log(`   info: [${ex.name}] warnings=${JSON.stringify(m.warnings)}`);
    for(const r of o.rows.slice(1)) console.log(`   info:    ${r.label}: P10/P50/P90 ${r.p10.toFixed(1)}/${r.p50.toFixed(1)}/${r.p90.toFixed(1)} E[pay] ${mean(r.sorted).toFixed(2)} | ${verdict(r, m.unit)}`);
    console.log(`   info:    merchant: P10/P50/P90 ${o.rows[0].p10.toFixed(1)}/${o.rows[0].p50.toFixed(1)}/${o.rows[0].p90.toFixed(1)} E[m] ${mean(o.rows[0].sorted).toFixed(2)}`);
  }
  const fees = EX.find(e => e.name === 'Optimiser fees');
  if(fees){ const o = simulate(M(fees.src)); const e = o.rows.slice(1).map(r => mean(r.sorted));
    console.log(`   info: QUESTION R9a "Optimiser fees" is titled "same maths, different labels" and the toll is labelled "Fixed-fee equivalent", but E[pay] = ${e.map(x => x.toFixed(2)).join(' / ')} (spread ${(Math.max(...e) - Math.min(...e)).toFixed(2)}, ${(100 * (Math.max(...e) - Math.min(...e)) / e[0]).toFixed(1)} % of the mean): equivalent in what sense?`); }
}
// ---------- R10. sampling error of printed figures at the page's run size (n=10000) ---------------
{
  const txt = T0 + 'floor: 70 share 60% fee 5\ntoll: 95\ninsure: premium 6 attach 65 limit 30';
  const S = {};
  for(let seed = 1; seed <= 30; seed++){
    const o = simulate(M(txt), {seed, n: 10000});
    o.rows.forEach((r, i) => { const put = (k, v) => (S[`${r.label} ${k}`] = S[`${r.label} ${k}`] || []).push(v);
      put('P10', r.p10); put('P50', r.p50); put('P90', r.p90);
      if(r.trade){ put('upside sold', r.trade.upsideSold); put('protection', r.trade.downsideBought); put('typical', r.trade.typicalDelta); put('worst', r.trade.worstDelta); }
      if(r.bind) put('bind p', r.bind.p); });
  }
  const sd = a => { const mu = mean(a); return {mu, sd: Math.sqrt(a.reduce((x, y) => x + (y - mu) ** 2, 0) / (a.length - 1))}; };
  const lines = []; let unsupported = [];
  for(const [k, a] of Object.entries(S)){ const {mu, sd: s} = sd(a); if(s < 1e-9) continue;
    lines.push(`${k}: ${mu.toFixed(2)} +-${s.toFixed(2)}`);
    const step = Math.abs(mu) < 1 ? 0.01 : 10 ** (Math.floor(Math.log10(Math.abs(mu))) - 2);   // fmt() = 3 significant figures
    if(k.includes('bind p')) { if(s * 10 > 0.5) unsupported.push(k); } else if(s > step) unsupported.push(`${k} (sd ${s.toFixed(2)} vs printed step ${step})`); }
  console.log('   info: 30 seeds, n=10000, mean +- seed-to-seed sd: ' + lines.join('; '));
  check('R10 printed 3-significant-figure values are supported by the sampling error (30 seeds, n=10000)', unsupported.length === 0, `${unsupported.length} of ${lines.length} figures: ${unsupported.join('; ')}`, {known: unsupported.length > 0});
}
done();
