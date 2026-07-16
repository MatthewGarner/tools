import {test} from 'node:test';
import assert from 'node:assert/strict';
import {pourVerdict, rowKicks} from '../pour.js';

// null layout ⇒ identity transform, no off-axis filter (keeps all draws) — tests the metric directly.

// row a barely moves grains, row b spreads them a lot → the pile gains its variance at row b
const dominant = {order: ['a', 'b'], draws: Array.from({length: 200}, (_, i) => {
  const s1 = 100 + (i % 5) - 2;                 // tight after row a (variance 2)
  const s2 = 100 + (i - 100) * 3;               // wide after row b
  return {y: s2, steps: [s1, s2]};
})};

test('pourVerdict names the row where the pile gains the most variance', () => {
  const v = pourVerdict(dominant, null, {names: {a: 'alpha', b: 'beta'}});
  assert.equal(v.topName, 'b');
  assert.match(v.text, /beta/);
});

test('pourVerdict degrades to "no single input dominates" when the rows add equal variance', () => {
  // Base-3 digits of i are independent, uniform on {-1,0,1} — each row adds an uncorrelated
  // increment of equal variance (2/3), so var(cum_i) = (i+1)·2/3 and every widening is 2/3.
  // (The OLD IQR test used steps linear-in-y, which the variance metric correctly reads as an
  //  INCREASING contribution — Fable's C1: real MC never produces linear-in-y cumulative steps.)
  const eq = {order: ['a', 'b', 'c', 'd'], draws: Array.from({length: 81}, (_, i) => {
    const e = [i % 3 - 1, Math.floor(i / 3) % 3 - 1, Math.floor(i / 9) % 3 - 1, Math.floor(i / 27) % 3 - 1];
    return {y: e[0] + e[1] + e[2] + e[3],
      steps: [e[0], e[0] + e[1], e[0] + e[1] + e[2], e[0] + e[1] + e[2] + e[3]]};
  })};
  const v = pourVerdict(eq, null, {names: {}});
  assert.equal(v.topName, null);
  assert.match(v.text, /no single|shared/i);
});

test('pourVerdict says a single driver owns ALL the spread (I1 — never "shared")', () => {
  const one = {order: ['a'], draws: Array.from({length: 50}, (_, i) => ({y: i, steps: [i]}))};
  const v = pourVerdict(one, null, {names: {a: 'alpha'}});
  assert.equal(v.topName, 'a');
  assert.match(v.text, /all of the spread/i);
  assert.match(v.text, /alpha/);
});

test('pourVerdict counts only the grains the pour draws (off-axis dropped) — honesty', () => {
  // b widens on-axis; two off-axis outliers with a huge row-a swing would FALSELY credit row a
  // if counted. The layout's lo/hi clips them (as mountPour does), so row a stays quiet → b.
  const draws = Array.from({length: 100}, (_, i) => ({y: 100 + i, steps: [100, 100 + i]}));
  draws.push({y: 1e6, steps: [-5e5, 1e6]}, {y: 1e6, steps: [5e5, 1e6]});
  const layout = {tx: x => x, lo: 90, hi: 210, useLog: false};
  const v = pourVerdict({order: ['a', 'b'], draws}, layout, {names: {}});
  assert.equal(v.topName, 'b');
});

test('pourVerdict is empty for an empty trace', () => {
  assert.equal(pourVerdict({order: ['a'], draws: []}, null, {names: {}}).text, '');
});

test('rowKicks: per-row incremental kick, telescoping to the final landing offset (residue strip core)', () => {
  // 2 rows: grain A kicks +10 then +5; grain B kicks +20 then -3. xs = [spout, spout+k0, spout+k0+k1]
  const spout = 100;
  const xsList = [
    [spout, spout + 10, spout + 10 + 5],
    [spout, spout + 20, spout + 20 - 3],
  ];
  const k = rowKicks(xsList, 2);
  assert.deepEqual(k[0], [10, 20]);          // row 0 kicks, per grain
  assert.deepEqual(k[1], [5, -3]);           // row 1 kicks, per grain
  // telescoping: a grain's kicks sum to its final x minus the spout
  for(let j = 0; j < xsList.length; j++)
    assert.equal(k[0][j] + k[1][j], xsList[j][2] - xsList[j][0]);
});
