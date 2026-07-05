import {test} from 'node:test';
import assert from 'node:assert/strict';
import {rangeStats, probStats, RATIO_DIVERGENT, SPLIT_GAP, AGREE_SPREAD} from '../engine.js';

/* ---- range fixtures ---- */
const R_AGREE = [{low: 4, high: 8}, {low: 5, high: 9}, {low: 3, high: 7}];        // common zone 5–7
const R_OUTLIER = [{low: 4, high: 6}, {low: 5, high: 7}, {low: 30, high: 50}];    // no overlap, pooled >> widths
const R_EDGES = [{low: 4, high: 6}, {low: 6.5, high: 8}];                         // near miss, ratio < 3

test('range agreement: overlap zone found, kind agreement', () => {
  const s = rangeStats(R_AGREE);
  assert.equal(s.kind, 'agreement');
  assert.deepEqual(s.overlap, {lo: 5, hi: 7});
  assert.deepEqual(s.pooled, {lo: 3, hi: 9});
  assert.equal(s.discuss, false);
  assert.ok(s.headline.toLowerCase().includes('agreement'));
});

test('range rows sorted by midpoint', () => {
  const s = rangeStats(R_AGREE);
  assert.deepEqual(s.rows.map(r => r.mid), [5, 6, 7]);
});

test('range one-outlier: divergent, ratio over threshold', () => {
  const s = rangeStats(R_OUTLIER);
  assert.equal(s.kind, 'divergent');
  assert.equal(s.overlap, null);
  assert.ok(s.ratio >= RATIO_DIVERGENT);
  assert.equal(s.discuss, true);
  assert.ok(s.headline.includes('wider than any individual'));
});

test('range near-miss: moderate, still discuss', () => {
  const s = rangeStats(R_EDGES);
  assert.equal(s.kind, 'moderate');
  assert.equal(s.overlap, null);
  assert.ok(s.ratio < RATIO_DIVERGENT);
  assert.equal(s.discuss, true);
});

test('range tiny-n', () => {
  assert.equal(rangeStats([]).kind, 'empty');
  const one = rangeStats([{low: 1, high: 2}]);
  assert.equal(one.kind, 'single');
  assert.equal(one.discuss, false);
  assert.equal(one.rows.length, 1);
});

test('range zero-width intervals do not divide by zero', () => {
  const s = rangeStats([{low: 5, high: 5}, {low: 9, high: 9}]);
  assert.equal(s.overlap, null);
  assert.equal(s.kind, 'divergent');   // ratio Infinity
});

/* ---- prob fixtures ---- */
const P_AGREE = [{value: 60}, {value: 65}, {value: 70}, {value: 62}];
const P_CAMPS = [{value: 25}, {value: 30}, {value: 80}, {value: 88}];
const P_SPREAD = [{value: 10}, {value: 40}, {value: 55}, {value: 75}, {value: 90}];

test('prob agreement inside AGREE_SPREAD', () => {
  const s = probStats(P_AGREE);
  assert.equal(s.kind, 'agreement');
  assert.ok(s.spread <= AGREE_SPREAD);
  assert.equal(s.discuss, false);
  assert.equal(s.median, 63.5);
});

test('prob two camps: gap over SPLIT_GAP and half the spread', () => {
  const s = probStats(P_CAMPS);
  assert.equal(s.kind, 'split');
  assert.ok(s.gap >= SPLIT_GAP);
  assert.equal(s.camps.lo.n, 2);
  assert.equal(s.camps.hi.n, 2);
  assert.equal(Math.round(s.camps.lo.center), 28);
  assert.equal(Math.round(s.camps.hi.center), 84);
  assert.match(s.headline, /^Split room: half near 28%, half near 84%\.$/);
});

test('prob uneven camps word the shares', () => {
  const s = probStats([{value: 20}, {value: 25}, {value: 30}, {value: 85}]);
  assert.equal(s.kind, 'split');
  assert.match(s.headline, /most near 25%, a few near 85%/);
});

test('prob wide spread without a clean gap', () => {
  const s = probStats(P_SPREAD);
  assert.equal(s.kind, 'spread');
  assert.equal(s.discuss, true);
  assert.match(s.headline, /10%.*90%.*55%/);
});

test('prob split needs n >= 4', () => {
  assert.notEqual(probStats([{value: 10}, {value: 90}]).kind, 'split');
});

test('prob tiny-n', () => {
  assert.equal(probStats([]).kind, 'empty');
  assert.equal(probStats([{value: 50}]).kind, 'single');
});
