import {test} from 'node:test';
import assert from 'node:assert/strict';
import {pourVerdict} from '../pour.js';

// row a barely moves grains, row b spreads them a lot → verdict names row b
const dominant = {order: ['a', 'b'], draws: Array.from({length: 200}, (_, i) => {
  const s1 = 100 + (i % 5) - 2;                 // tight after row a
  const s2 = 100 + (i - 100) * 3;               // wide after row b
  return {y: s2, steps: [s1, s2]};
})};

test('pourVerdict names the row with the largest IQR widening', () => {
  const v = pourVerdict(dominant, {names: {a: 'alpha', b: 'beta'}});
  assert.equal(v.topName, 'b');
  assert.match(v.text, /beta/);
});

test('pourVerdict degrades to "no single row dominates" when per-row widenings are near-equal', () => {
  // each grain moves LINEARLY toward its final y across k rows → IQR(step_i)=IQR(y)·(i+1)/k,
  // so every row's widening is exactly totalIqr/k (equal). t1.w - t2.w = 0 → flat.
  const eq = {order: ['a', 'b', 'c', 'd'], draws: Array.from({length: 400}, (_, i) => {
    const y = i - 200;
    return {y, steps: [y * .25, y * .5, y * .75, y]};
  })};
  const v = pourVerdict(eq, {names: {}});
  assert.equal(v.topName, null);
  assert.match(v.text, /no single|shared/i);
});

test('pourVerdict is empty for an empty trace', () => {
  assert.equal(pourVerdict({order: ['a'], draws: []}, {names: {}}).text, '');
});
