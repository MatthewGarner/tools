import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mulberry32, gaussian, quantile, fmt} from '../assets/series.js';

test('mulberry32 deterministic', () => {
  const a = mulberry32(42), b = mulberry32(42);
  const sa = Array.from({length: 5}, a), sb = Array.from({length: 5}, b);
  assert.deepEqual(sa, sb);
  assert.ok(sa.every(v => v >= 0 && v < 1));
});

test('gaussian roughly standard normal', () => {
  const g = gaussian(mulberry32(7));
  const xs = Array.from({length: 50000}, g);
  const mean = xs.reduce((a, b) => a + b, 0) / xs.length;
  const sd = Math.sqrt(xs.reduce((a, b) => a + b*b, 0) / xs.length - mean*mean);
  assert.ok(Math.abs(mean) < 0.02, 'mean ~0, got ' + mean);
  assert.ok(Math.abs(sd - 1) < 0.02, 'sd ~1, got ' + sd);
});

test('quantile interpolates', () => {
  assert.equal(quantile([0, 10], 0.5), 5);
  assert.equal(quantile([1, 2, 3, 4, 5], 0.25), 2);
  assert.ok(Number.isNaN(quantile([], 0.5)));
});

test('fmt', () => {
  assert.equal(fmt(0), '0');
  assert.equal(fmt(4523), '4.52k');
  assert.equal(fmt(1234567), '1.23M');
  assert.equal(fmt(-4523), '−4.52k');
  assert.equal(fmt(0.042), '0.042');
});

test('rangeSampler: lognormal 90% fit, deterministic, degenerate constant', async () => {
  const {mulberry32, gaussian, rangeSampler, quantile, Z90} = await import('../assets/series.js');
  const draw = (lo, hi, dist, seed, n = 20000) => {
    const rand = mulberry32(seed), gauss = gaussian(rand);
    const s = rangeSampler(lo, hi, dist, rand, gauss);
    return Array.from({length: n}, s).sort((a, b) => a - b);
  };
  const v = draw(60, 180, 'logn', 7);
  assert.ok(Math.abs(quantile(v, .05) - 60) < 4, 'P5 ≈ lo');
  assert.ok(Math.abs(quantile(v, .95) - 180) < 8, 'P95 ≈ hi');
  assert.ok(Math.abs(quantile(v, .5) - Math.sqrt(60 * 180)) < 5, 'median = geometric mean');
  assert.deepEqual(draw(60, 180, 'logn', 7, 100), draw(60, 180, 'logn', 7, 100), 'seeded');
  const c = draw(50, 50, 'logn', 1, 10);
  assert.ok(c.every(x => x === 50), 'zero-width → constant');
  const neg = draw(-10, 10, 'logn', 3);
  assert.ok(Math.abs(quantile(neg, .5)) < 1, 'normal fallback centred');
  assert.ok(Z90 > 1.64 && Z90 < 1.65);
});
