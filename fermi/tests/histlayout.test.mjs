import {test} from 'node:test';
import assert from 'node:assert/strict';
import {histLayout} from '../histlayout.js';

const sortedOf = arr => Float64Array.from(arr).sort();

test('histLayout: linear axis, 44 bins spanning q.003..q.997, px maps ends to [0,width]', () => {
  const s = sortedOf(Array.from({length: 1000}, (_, i) => i + 100));  // 100..1099, hi/lo≈10.6 → linear
  const L = histLayout(s, {width: 440, threshold: null});
  assert.equal(L.ok, true);
  assert.equal(L.useLog, false);
  assert.equal(L.NB, 44);
  assert.equal(L.bins.length, 44);
  assert.ok(Math.abs(L.px(L.lo) - 0) < 0.5 && Math.abs(L.px(L.hi) - 440) < 0.5);
  const shareSum = L.bins.reduce((a, b) => a + b.share, 0);
  assert.ok(Math.abs(shareSum - 1) < 1e-9, 'bin shares sum to 1');
});

test('histLayout: log axis kicks in when hi/lo > 30 and lo > 0', () => {
  const s = sortedOf(Array.from({length: 2000}, (_, i) => Math.exp(i / 200)));  // wide, positive
  const L = histLayout(s, {width: 400, threshold: null});
  assert.equal(L.useLog, true);
  assert.ok(L.px(L.hi) > L.px(L.lo));
});

test('histLayout: forceLinear overrides the log axis (the pour uses this)', () => {
  const s = sortedOf(Array.from({length: 2000}, (_, i) => Math.exp(i / 200)));
  assert.equal(histLayout(s, {width: 400, forceLinear: true}).useLog, false);
});

test('histLayout: degenerate (all equal) returns ok:false', () => {
  assert.equal(histLayout(sortedOf([5, 5, 5, 5]), {width: 400, threshold: null}).ok, false);
});
