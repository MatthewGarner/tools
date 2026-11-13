import {test} from 'node:test';
import assert from 'node:assert/strict';
import {pourVerdict, rowKicks} from '../pour.js';

// the verdict is words.dominantDriver's rule on the driver shares (shares.test.mjs covers it against
// real models); here: the sentence each outcome prints
const sens = (...p) => p.map(([name, share]) => ({name, share, label: '×1.5'}));
const draws = [{y: 1, steps: [1, 2]}];

test('pourVerdict names the dominant input, over half the spread and not tied', () => {
  const v = pourVerdict({order: ['a', 'b'], draws}, null, {names: {a: 'alpha', b: 'beta'}, sens: sens(['b', .7], ['a', .3])});
  assert.equal(v.topName, 'b');
  assert.match(v.text, /^Most of the spread is born at beta/);
});

test('pourVerdict says no single input dominates when none is over half, or the top is tied', () => {
  for(const s of [sens(['a', .4], ['b', .3]), sens(['a', .6], ['b', .59])]){
    const v = pourVerdict({order: ['a', 'b'], draws}, null, {names: {}, sens: s});
    assert.equal(v.topName, null);
    assert.match(v.text, /^No single input dominates/);
  }
});

test('pourVerdict says a single driver owns ALL the spread (I1 — never "shared")', () => {
  const one = {order: ['a'], draws: Array.from({length: 50}, (_, i) => ({y: i, steps: [i]}))};
  const v = pourVerdict(one, null, {names: {a: 'alpha'}, sens: sens(['a', 1])});
  assert.equal(v.topName, 'a');
  assert.match(v.text, /all of the spread/i);
  assert.match(v.text, /alpha/);
});

test('pourVerdict is empty for an empty trace', () => {
  assert.equal(pourVerdict({order: ['a'], draws: []}, null, {names: {}, sens: sens(['a', 1])}).text, '');
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
