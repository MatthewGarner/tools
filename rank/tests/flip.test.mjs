import {test} from 'node:test';
import assert from 'node:assert/strict';
import {flipAnalysis, flipCopy, simulate} from '../engine.js';

/* Hand-computable rig: two items, two criteria, equal effort.
   A = [10, 1], B = [1, 10], weights [1.2, 1] → A 13, B 11.2.
   Raise w2 by 0.2 (+20%) or cut w1 by 0.2 (−16.7%) and they tie. */
const rig = {
  criteria: [{name: 'Value', w: 1.2}, {name: 'Urgency', w: 1}],
  effort: {name: 'Effort', w: 1},
  items: [
    {name: 'Alpha', s: [10, 1], e: 1},
    {name: 'Beta', s: [1, 10], e: 1},
  ],
  k: 1, ww: 50, sw: 1,
};

test('finds both single-weight flips with exact deltas', () => {
  const f = flipAnalysis(rig);
  assert.equal(f.top.name, 'Alpha');
  const byCrit = Object.fromEntries(f.flips.map(x => [x.criterion, x]));
  assert.ok(Math.abs(byCrit['Urgency'].delta - 0.2) < 1e-9);
  assert.ok(Math.abs(byCrit['Value'].delta + 0.2) < 1e-9);
  assert.ok(Math.abs(byCrit['Urgency'].pct - 20) < 1e-6);
  assert.ok(Math.abs(byCrit['Value'].pct + 100 / 6) < 1e-6);
  for(const x of f.flips) assert.equal(x.rivalName, 'Beta');
});

test('easiest flip is the smallest relative change', () => {
  const f = flipAnalysis(rig);
  assert.equal(f.easiest.criterion, 'Value');       // 16.7% < 20%
  assert.ok(f.easiest.newWeight > 0);
});

test('applying the easiest flip (plus epsilon) actually dethrones the leader', () => {
  const f = flipAnalysis(rig);
  const w = rig.criteria.map(c => c.w);
  w[f.easiest.ci] += f.easiest.delta * 1.001;
  const score = it => it.s.reduce((a, s, i) => a + w[i] * s, 0) / it.e;
  assert.ok(score(rig.items[1]) > score(rig.items[0]));
});

test('a single-criterion scheme can never flip by reweighting', () => {
  const f = flipAnalysis({...rig,
    criteria: [{name: 'Value', w: 2}],
    items: [{name: 'A', s: [8], e: 2}, {name: 'B', s: [3], e: 1}]});
  assert.equal(f.flips.length, 0);
  assert.equal(f.easiest, null);
});

test('fewer than two valid items → null', () => {
  assert.equal(flipAnalysis({...rig, items: [rig.items[0]]}), null);
  assert.equal(flipAnalysis({...rig, items: [rig.items[0], {name: 'x', s: [NaN, 1], e: 1}]}), null);
});

test('zero-weight criteria are skipped (no relative change exists)', () => {
  const f = flipAnalysis({...rig, criteria: [{name: 'Value', w: 1.2}, {name: 'Urgency', w: 0}]});
  assert.ok(f.flips.every(x => x.criterion !== 'Urgency'));
});

test('flips agree with the simulation on a real example', () => {
  const state = {
    criteria: [{name: 'Value', w: 3}, {name: 'Time criticality', w: 2}, {name: 'Risk reduction', w: 1}],
    effort: {name: 'Effort', w: 1}, k: 3, ww: 50, sw: 1,
    items: [
      {name: 'Incident response automation', s: [8, 7, 6], e: 6},
      {name: 'Observability dashboard overhaul', s: [7, 5, 5], e: 5},
      {name: 'Legacy job scheduler migration', s: [6, 4, 8], e: 8},
      {name: 'Cloud cost reporting', s: [4, 6, 3], e: 3},
      {name: 'Access control audit', s: [6, 8, 6], e: 4},
    ],
  };
  const f = flipAnalysis(state);
  const R = simulate(state);
  assert.equal(f.top.i, R.baseOrder[0], 'flip top matches simulate base top');
  for(const x of f.flips){
    const w = state.criteria.map(c => c.w);
    w[x.ci] += x.delta * 1.001;
    const score = it => it.s.reduce((a, s, i) => a + w[i] * s, 0) / it.e;
    const rival = state.items[x.rival], top = state.items[f.top.i];
    assert.ok(score(rival) > score(top), x.criterion + ' flip dethrones via ' + x.rivalName);
  }
});

test('flipCopy: fragile inside the wobble, robust outside, immovable when none', () => {
  const f = flipAnalysis(rig);
  const fragile = flipCopy(f, 50);
  assert.match(fragile.text, /Fragile/i);
  assert.match(fragile.text, /Value/);
  assert.match(fragile.text, /Beta/);
  assert.equal(fragile.tone, 'fragile');
  const robust = flipCopy(f, 10);
  assert.match(robust.text, /holds|robust/i);
  assert.equal(robust.tone, 'robust');
  const none = flipCopy(flipAnalysis({...rig,
    criteria: [{name: 'Value', w: 2}],
    items: [{name: 'A', s: [8], e: 2}, {name: 'B', s: [3], e: 1}]}), 50);
  assert.match(none.text, /No single weight/i);
  assert.equal(none.tone, 'immovable');
});
