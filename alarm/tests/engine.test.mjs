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
  const v = verdicts({tp: 10, fp: 90, tn: 880, fn: 20});
  assert.match(v.alarm, /9 in 10 alarms/);
  assert.match(v.miss, /in .* sails through|of .* real issues/);
  const z = verdicts({tp: 0, fp: 0, tn: 950, fn: 50});
  assert.match(z.alarm, /No alarms/);
});
