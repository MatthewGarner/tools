import test from 'node:test';
import assert from 'node:assert/strict';
import {simulate, verdictCopy} from '../engine.js';

const state = {
  criteria: [{name: 'Value', w: 3}, {name: 'Time', w: 2}, {name: 'Risk', w: 1}],
  effort: {name: 'Effort', w: 1},
  items: [
    {name: 'A', s: [8, 7, 6], e: 6},
    {name: 'B', s: [7, 5, 5], e: 5},
    {name: 'C', s: [6, 4, 8], e: 8},
    {name: 'D', s: [4, 6, 3], e: 3},
  ],
  k: 2, ww: 50, sw: 1,
};

test('simulate is deterministic for a fixed seed', () => {
  const a = simulate(state);
  const b = simulate(state);
  assert.deepEqual(a, b);
});

test('every ready item appears with ptop in [0,1] and a coherent rank envelope', () => {
  const r = simulate(state);
  assert.equal(r.n, 4);
  assert.equal(r.stats.length, 4);
  for(const s of r.stats){
    assert.ok(s.ptop >= 0 && s.ptop <= 1);
    assert.ok(s.p10 <= s.med && s.med <= s.p90);
  }
});

test('fewer than two ready items yields null', () => {
  assert.equal(simulate({...state, items: [state.items[0]]}), null);
  assert.equal(simulate({...state, items: [{name: 'x', s: [NaN, 1, 1], e: 1}, state.items[0]]}), null);
});

test('base order ranks the unperturbed WSJF scores', () => {
  const {baseOrder, baseScore} = simulate(state);
  for(let i = 1; i < baseOrder.length; i++){
    assert.ok(baseScore[baseOrder[i - 1]] >= baseScore[baseOrder[i]]);
  }
});

test('verdict grammar: one settled item "makes" the cut', () => {
  const {headline, body} = verdictCopy([
    {name: 'A', ptop: 0.97}, {name: 'B', ptop: 0.5}, {name: 'C', ptop: 0.4},
  ], 2);
  assert.match(headline, /1 of the top 2 is settled/);
  assert.match(body, /A makes the cut/);
});

test('verdict grammar: several settled items "make" the cut', () => {
  const {body} = verdictCopy([
    {name: 'A', ptop: 0.97}, {name: 'B', ptop: 0.96},
    {name: 'C', ptop: 0.5}, {name: 'D', ptop: 0.4},
  ], 3);
  assert.match(body, /A, B make the cut/);
});

test('verdict: fully settled and fully noisy endpoints', () => {
  const settled = verdictCopy([{name: 'A', ptop: 0.99}, {name: 'B', ptop: 0.05}], 1);
  assert.match(settled.headline, /The top 1 is settled/);
  const noise = verdictCopy([{name: 'A', ptop: 0.5}, {name: 'B', ptop: 0.5}], 1);
  assert.match(noise.headline, /Nothing is settled/);
});

test('verdict: secure places with an empty contested band never emit a dangling tie list', () => {
  const stats = [
    {name: 'A', ptop: 0.95}, {name: 'B', ptop: 0.9},
    {name: 'C', ptop: 0.15}, {name: 'D', ptop: 0.15}, {name: 'E', ptop: 0.15},
    {name: 'F', ptop: 0.15}, {name: 'G', ptop: 0.15},
  ];
  const {headline, body} = verdictCopy(stats, 3);
  assert.match(headline, /2 of the top 3 are settled/);
  assert.doesNotMatch(body, /tie between\s+—/);
  assert.match(body, /up for grabs/);
});

test('verdict: all k slots secure counts as settled even with a flickering challenger', () => {
  const {headline, body} = verdictCopy([
    {name: 'A', ptop: 0.9}, {name: 'B', ptop: 0.9}, {name: 'C', ptop: 0.9},
    {name: 'D', ptop: 0.3},
  ], 3);
  assert.match(headline, /The top 3 is settled/);
  assert.doesNotMatch(body, /remaining 0/);
});
