import {test} from 'node:test';
import assert from 'node:assert/strict';
import {phi, probit, derived, fromClaim, population, classify, inN, verdicts, SEED} from '../engine.js';
const close = (a, b, eps = 1e-4) => assert.ok(Math.abs(a - b) < eps, a + ' !~ ' + b);

test('phi against known values', () => {
  close(phi(0), 0.5); close(phi(1.6448536), 0.95); close(phi(-1.6448536), 0.05, 1e-4);
});
test('probit inverts phi', () => {
  for(const p of [0.05, 0.3, 0.5, 0.9, 0.99]) close(phi(probit(p)), p, 1e-5);
});
test('derived metrics', () => {
  const d = derived({baseRate: 0.1, dprime: 2, t: 1});
  close(d.sensitivity, phi(1)); close(d.fpr, phi(-1)); close(d.auc, phi(Math.SQRT2));
});
test('claim inversion round-trips', () => {
  const {dprime, t} = fromClaim(0.95, 0.95);
  const d = derived({baseRate: 0.1, dprime, t});
  close(d.sensitivity, 0.95, 1e-3); close(d.specificity, 0.95, 1e-3);
});
test('population deterministic; classify counts sum to n', () => {
  const pop = population();
  assert.deepEqual(pop[0], population()[0]);
  const {counts} = classify(pop, {baseRate: 0.05, dprime: 2, t: 1.5});
  assert.equal(counts.tp + counts.fp + counts.tn + counts.fn, 1000);
});
test('threshold drag flips alarms monotonically without resampling class', () => {
  const pop = population();
  const lo = classify(pop, {baseRate: 0.1, dprime: 2, t: 0.5});
  const hi = classify(pop, {baseRate: 0.1, dprime: 2, t: 2.0});
  assert.equal(lo.counts.tp + lo.counts.fn, hi.counts.tp + hi.counts.fn);  // real count unchanged
  assert.ok(hi.counts.tp + hi.counts.fp < lo.counts.tp + lo.counts.fp);    // fewer alarms
});
test('inN: honest small fractions', () => {
  assert.equal(inN(0.9).text, '9 in 10');
  assert.equal(inN(0.5).text, '1 in 2');
  assert.equal(inN(0.87).text, '7 in 8');
  assert.equal(inN(0).text, 'none');
  assert.equal(inN(1).text, 'every one');
});
test('verdict copy: normal and zero-alarm branches', () => {
  const params = {baseRate: 0.1, dprime: 2, t: 1};
  const v = verdicts({tp: 10, fp: 90, tn: 880, fn: 20}, params);
  assert.match(v.alarm, /9 in 10 alarms/);
  assert.match(v.miss, /in .* sails through|of .* real issues/);
  const z = verdicts({tp: 0, fp: 0, tn: 950, fn: 50}, params);
  assert.match(z.alarm, /No alarms/);
});

test('the "Expected:" fine line is analytic, not sample noise (Fable I3)', () => {
  const params = {baseRate: 0.001, dprime: 2, t: 1};
  const d = derived(params);
  const analyticSens = Math.round(d.sensitivity * 100);   // phi(1) ≈ 84%, base-rate-independent
  assert.ok(analyticSens > 50, 'detector sensitivity is substantial, not the sample-noise 0%');
  // a sample at the base-rate floor where the observed recall would be 0% (fn=1, tp=0)
  const noisy = verdicts({tp: 0, fp: 5, tn: 990, fn: 1}, params);
  assert.match(noisy.fine, new RegExp('sensitivity ' + analyticSens + '%'));
  assert.doesNotMatch(noisy.fine, /sensitivity 0%/);
  // sensitivity/specificity are detector properties → independent of base rate
  const other = verdicts({tp: 50, fp: 40, tn: 900, fn: 10}, {...params, baseRate: 0.2});
  const sens = f => f.match(/sensitivity (\d+)%/)[1], spec = f => f.match(/specificity (\d+)%/)[1];
  assert.equal(sens(noisy.fine), sens(other.fine), 'sensitivity independent of base rate');
  assert.equal(spec(noisy.fine), spec(other.fine), 'specificity independent of base rate');
});
