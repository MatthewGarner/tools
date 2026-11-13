/* Exact answers for product-type formulas (audit FM-4, FM-20). A log-normal input has its typed
   range as its 90% interval, so a product, quotient or constant power of such inputs is itself
   log-normal, with percentiles known in closed form. */
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {tokenize, parse, collectVars, simulateModel, summariseEstimate, probAbove, probExceeds, exactLogNormal,
  normCdf, Z90} from '../engine.js';
import {estimateMethod, pctProb, probText, evenOdds} from '../words.js';
import {confess} from '../solve.js';
import {quantile} from '../../assets/series.js';

const Z80 = 1.2815515655446004;
function model(f, ranges, dists = {}){
  const ast = parse(tokenize(f));
  const varNames = collectVars(ast, []);
  const d = {};
  for(const n of varNames) d[n] = dists[n] || 'auto';
  return {ast, varNames, ranges, dists: d};
}
const sg = (lo, hi) => Math.log(hi / lo) / (2 * Z90);
const close = (a, b, tol = 1e-12) => assert.ok(Math.abs(a - b) <= tol * Math.max(1, Math.abs(a), Math.abs(b)), a + ' vs ' + b);

test('a*b, both 10..40: median 400, sigma sqrt2 x single', () => {
  const x = exactLogNormal(model('a*b', {a: [10, 40], b: [10, 40]}));
  assert.ok(x);
  close(x.mu, Math.log(400));
  close(x.sigma, Math.SQRT2 * sg(10, 40));
  assert.deepEqual(x.terms.map(t => [t.name, t.e]), [['a', 1], ['b', 1]]);
  const s = summariseEstimate(model('a*b', {a: [10, 40], b: [10, 40]}), {seed: 1, n: 2000});
  close(s.p50, 400);
  close(s.p90, Math.exp(Math.log(400) + Z80 * Math.SQRT2 * sg(10, 40)));
  close(s.p10, Math.exp(Math.log(400) - Z80 * Math.SQRT2 * sg(10, 40)));
  close(s.p90 / s.p10, Math.exp(2 * Z80 * Math.SQRT2 * sg(10, 40)));
});
test('a/b: median 1; a^2: exponent doubles; 2*a*a/b: exponents add', () => {
  const r = {a: [10, 40], b: [10, 40]};
  const q = exactLogNormal(model('a/b', r));
  close(q.mu, 0); close(q.sigma, Math.SQRT2 * sg(10, 40));
  const p = exactLogNormal(model('a^2', {a: [10, 40]}));
  close(p.mu, Math.log(400)); close(p.sigma, 2 * sg(10, 40));
  assert.equal(p.terms[0].e, 2);
  const m = exactLogNormal(model('2*a*a/b', r));
  close(m.mu, Math.log(2) + 2 * Math.log(20) - Math.log(20));
  close(m.sigma, Math.sqrt(5) * sg(10, 40));
  const z = exactLogNormal(model('a*b/a', r));              // a cancels: only b varies
  close(z.sigma, sg(10, 40));
  assert.equal(z.terms.find(t => t.name === 'a').e, 0);
});
test('high-to-low ranges, constants folded, constant exponents', () => {
  const x = exactLogNormal(model('a*(2+3)', {a: [40, 10]}));
  close(x.mu, Math.log(5 * 20)); close(x.sigma, sg(10, 40));
  const y = exactLogNormal(model('a^0.5*3', {a: [10, 40]}));
  close(y.mu, Math.log(3) + 0.5 * Math.log(20)); close(y.sigma, 0.5 * sg(10, 40));
  const z = exactLogNormal(model('a^(1/2)', {a: [10, 40]}));
  close(z.mu, 0.5 * Math.log(20));
});
test('a point range is a constant', () => {
  const x = exactLogNormal(model('a*b', {a: [10, 40], b: [5, 5]}));
  close(x.mu, Math.log(100)); close(x.sigma, sg(10, 40));
  assert.equal(x.terms.length, 1);
});
test('not exact: normal or uniform input, sums, exponent variable, bad constants, nothing varying', () => {
  assert.equal(exactLogNormal(model('a*b', {a: [10, 40], b: [-5, 15]})), null);          // auto → normal
  assert.equal(exactLogNormal(model('a*b', {a: [10, 40], b: [10, 40]}, {b: 'uni'})), null);
  assert.equal(exactLogNormal(model('a*b', {a: [10, 40], b: [10, 40]}, {b: 'norm'})), null);
  assert.equal(exactLogNormal(model('a+b', {a: [10, 40], b: [10, 40]})), null);
  assert.equal(exactLogNormal(model('a*b-1', {a: [10, 40], b: [10, 40]})), null);
  assert.equal(exactLogNormal(model('a-b', {a: [10, 40], b: [10, 40]})), null);
  assert.equal(exactLogNormal(model('2^a', {a: [10, 40]})), null);
  assert.equal(exactLogNormal(model('a^b', {a: [10, 40], b: [1, 2]})), null);
  assert.equal(exactLogNormal(model('-a', {a: [10, 40]})), null);
  assert.equal(exactLogNormal(model('a*0', {a: [10, 40]})), null);
  assert.equal(exactLogNormal(model('a/0', {a: [10, 40]})), null);
  assert.equal(exactLogNormal(model('a*(0-3)', {a: [10, 40]})), null);
  assert.equal(exactLogNormal(model('a*b', {a: [10, 40], b: [0, 0]})), null);
  assert.equal(exactLogNormal(model('a*b', {a: [7, 7], b: [5, 5]})), null);              // nothing varies
  assert.equal(exactLogNormal(model('a/a', {a: [10, 40]})), null);                        // sigma 0
  assert.equal(exactLogNormal(model('a*b', {a: [1e-200, 1e-190], b: [1e-200, 1e-190]})), null);   // median underflows
});
test('exact percentiles match the mean of 40 seeded simulations', () => {
  const m = model('a*b/c', {a: [10, 40], b: [2, 9], c: [100, 300]});
  const x = exactLogNormal(m);
  const acc = [0, 0, 0];
  for(let seed = 1; seed <= 40; seed++){
    const {sorted} = simulateModel(m, {seed, n: 20000});
    [.1, .5, .9].forEach((p, i) => { acc[i] += quantile(sorted, p) / 40; });
  }
  [-Z80, 0, Z80].forEach((z, i) => {
    const e = Math.exp(x.mu + z * x.sigma);
    assert.ok(Math.abs(acc[i] / e - 1) < 0.006, 'P' + (10 + 40 * i) + ' sampled mean ' + acc[i] + ' exact ' + e);
  });
});
test('the sample stream is untouched: histogram draws are the same with or without an exact answer', () => {
  const m = model('a*b', {a: [10, 40], b: [10, 40]});
  const a = simulateModel(m, {seed: 0x5EED, n: 50}).raw.slice(0, 3);
  const s = summariseEstimate(m, {seed: 0x5EED, n: 50});
  assert.deepEqual(s.raw.slice(0, 3), a);
});
test('normCdf is double precision', () => {
  close(normCdf(0), 0.5, 1e-15);
  close(normCdf(1.2815515655446004), 0.9, 1e-12);
  close(normCdf(-1.6448536269514722), 0.05, 1e-12);
  close(1 - normCdf(3), 0.0013498980316301035, 1e-10);
});
test('P(> T) is closed form when exact; T <= 0 is 1', () => {
  const m = model('a*b', {a: [10, 40], b: [10, 40]});
  const s = summariseEstimate(m, {seed: 7, n: 2000});
  close(probAbove(s, 400), 0.5, 1e-12);
  close(probAbove(s, s.p90), 0.1, 1e-9);
  close(probAbove(s, s.p10), 0.9, 1e-9);
  assert.equal(probAbove(s, 0), 1);
  assert.equal(probAbove(s, -5), 1);
  assert.equal(probText(s, 400), '50%');
  assert.equal(probText(s, 1e6), '<0.1%');
  assert.equal(probText(s, 0), '100%');          // certain: a positive answer is above any threshold of zero or less
  assert.equal(evenOdds(s, 400), true);
  assert.equal(evenOdds(s, 450), false);
});
test('sampled models count the runs, and print whole percent', () => {
  const m = model('a+b', {a: [10, 40], b: [10, 40]});
  const s = summariseEstimate(m, {seed: 7, n: 2000});
  assert.equal(s.exact, null);
  assert.equal(probAbove(s, s.sorted[1000]), (2000 - 1001) / 2000);
  assert.match(probText(s, s.p90), /^\d+%$/);
  assert.equal(probText(s, -1e9), '>99%');       // all 2000 runs above: still not "100%"
  assert.equal(pctProb(0.004, 'whole'), '<1%');
  assert.equal(pctProb(0.0099, 'whole'), '<1%');
  assert.equal(pctProb(0.012, 'whole'), '1%');
  assert.equal(pctProb(0.6449, 'whole'), '64%');
  assert.equal(pctProb(0.9899, 'whole'), '99%');
  assert.equal(pctProb(0.9951, 'whole'), '>99%');
  assert.equal(pctProb(0.012), '1.2%');                    // the default stays tenths
});
test('compare: P(B > A) is closed form when both variants are exact, counted otherwise', () => {
  const A = summariseEstimate(model('a*b', {a: [10, 40], b: [10, 40]}), {seed: 1, n: 4000});
  const B = summariseEstimate(model('a*b', {a: [10, 40], b: [10, 40]}), {seed: 2, n: 4000});
  close(probExceeds(B, A), 0.5, 1e-12);
  const C = summariseEstimate(model('a*b', {a: [20, 80], b: [10, 40]}), {seed: 2, n: 4000});
  const x = A.exact, y = C.exact;
  close(probExceeds(C, A), normCdf((y.mu - x.mu) / Math.sqrt(x.sigma ** 2 + y.sigma ** 2)), 1e-12);
  const D = summariseEstimate(model('a+b', {a: [10, 40], b: [10, 40]}), {seed: 2, n: 4000});
  const counted = probExceeds(D, A);
  assert.ok(counted > 0 && counted < 1);
});
test('the method line says exact or good to two figures', () => {
  const v = ['a', 'b'], r = {a: [10, 40], b: [10, 40]}, d = {a: 'auto', b: 'auto'};
  assert.equal(estimateMethod(v, r, d, 20000, true),
    'Log-normal fit to each 90% range · exact percentiles · histogram of 20,000 samples');
  assert.equal(estimateMethod(v, r, d, 20000, false),
    'Log-normal fit to each 90% range · 20,000 samples, good to two figures');
  assert.equal(estimateMethod(['a', 'b'], {a: [1, 2], b: [-1, 1]}, {a: 'auto', b: 'auto'}, 20000, false),
    'Fit to each range: 1 log-normal, 1 normal · 20,000 samples, good to two figures');
});
test('the solver lands P50 on target using the exact median (valid = 1)', () => {
  const m = model('a*b', {a: [10, 40], b: [10, 40]});
  const c = confess(m, {seed: 1, np: 100, target: 800});
  assert.ok(c.feasible && c.best);
  assert.equal(c.best.valid, 1);
  // exact: P50 = exp(mu); the achieved P50 must equal it to the bisection's resolution
  const ranges = {...m.ranges, [c.best.varName]: c.best.range};
  const x = exactLogNormal({...m, ranges});
  close(c.best.achievedP50, Math.exp(x.mu), 1e-9);
  assert.ok(Math.abs(c.best.achievedP50 / 800 - 1) < 1e-4);
});
