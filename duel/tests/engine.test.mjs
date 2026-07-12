import {test} from 'node:test';
import assert from 'node:assert/strict';
import {copeland, impliedOrder, loops, settledness, verdictCopy} from '../engine.js';
const d = (a, b, w) => ({a, b, w});

test('copeland: wins minus losses', () => {
  // 0 beats 1 and 2; 1 beats 2 → scores [2, 0, -2]
  assert.deepEqual(copeland(3, [d(0,1,0), d(0,2,0), d(1,2,1)]), [2, 0, -2]);
});

test('superseded duels are excluded', () => {
  const ds = [{a:0,b:1,w:0,sup:true}, d(0,1,1)];
  assert.deepEqual(copeland(2, ds), [-1, 1]);
});

test('impliedOrder: competition ranking on ties', () => {
  // 0>1, 2>3 — two winners tied at 1, two losers tied at 3
  const o = impliedOrder(4, [d(0,1,0), d(2,3,2)]);
  assert.deepEqual(o.map(r => r.rank), [1, 1, 3, 3]);
});

test('loops: planted 3-cycle found with its triangle', () => {
  const l = loops(4, [d(0,1,0), d(1,2,1), d(2,0,2), d(0,3,0), d(1,3,1), d(2,3,2)]);
  assert.equal(l.length, 1);
  assert.deepEqual([...l[0].members].sort(), [0, 1, 2]);
  assert.deepEqual(l[0].triangles, [[0, 1, 2]]);
});

test('loops: 5-knot reported as one SCC with all its triangles', () => {
  // pentagon 0>1>2>3>4>0 plus chords 0>2, 1>3, 2>4 → one SCC of 5
  const ds = [d(0,1,0), d(1,2,1), d(2,3,2), d(3,4,3), d(4,0,4), d(0,2,0), d(1,3,1), d(2,4,2)];
  const l = loops(5, ds);
  assert.equal(l.length, 1);
  assert.equal(l[0].members.length, 5);
  assert.ok(l[0].triangles.length >= 1);        // e.g. 2>4>0>2 via 4>0, 0>2
});

test('no loop in a transitive tournament', () => {
  assert.equal(loops(3, [d(0,1,0), d(0,2,0), d(1,2,1)]).length, 0);
});

test('settledness: undueled adjacency is mushy (spec: settled iff neighbours directly duelled)', () => {
  // 0 beat both 1 and 2; 1 vs 2 never duelled → the 1–2 tie is mushy, but 0 is a
  // clear first (an end whose only neighbour it duelled) → settled. The plan's
  // draft asserted s[0] mushy; the spec sentence (line 53) wins, so 0 is settled.
  const s = settledness(3, [d(0,1,0), d(0,2,0)]);
  assert.equal(s[0], 'settled');
  assert.equal(s[1], 'mushy');
  assert.equal(s[2], 'mushy');
});

test('verdict copy names the loop', () => {
  const v = verdictCopy(
    impliedOrder(3, [d(0,1,0), d(1,2,1), d(2,0,2)]),
    null, loops(3, [d(0,1,0), d(1,2,1), d(2,0,2)]), 0);
  assert.match(v, /loop|criteria/i);
});
