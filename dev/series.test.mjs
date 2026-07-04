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
