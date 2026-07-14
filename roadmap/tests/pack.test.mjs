/* Source-order first-fit. Chosen over longest-first / beams-to-top on rendered
   evidence: it never leaves a hole, it is author-controllable (line order IS
   stack order — write the long bar first and it sits on top), and above all it
   is STABLE UNDER EDIT: re-packing touches only items whose intervals overlap
   the one that moved. A sort by length would re-order siblings mid-drag. */
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {packLane} from '../pack.js';

const P = (...pairs) => packLane(pairs.map(([h0, h1]) => ({h0, h1})));

test('an empty lane packs to nothing', () => {
  assert.deepEqual(packLane([]), {at: [], nTracks: 0});
});

test('DEGENERATE CASE: width-1 items in one column stack in source order', () => {
  /* this IS today's per-cell stack, and it is why existing goldens cannot move */
  assert.deepEqual(P([0, 0], [0, 0], [0, 0]), {at: [0, 1, 2], nTracks: 3});
});

test('DEGENERATE CASE: width-1 items in different columns all share track 0', () => {
  /* today every cell stacks from the lane top, so column-2's card is at the top too */
  assert.deepEqual(P([0, 0], [1, 1], [2, 2]), {at: [0, 0, 0], nTracks: 1});
});

test('overlapping intervals take separate tracks; disjoint ones reuse track 0', () => {
  assert.deepEqual(P([0, 2], [1, 3], [3, 4]).at, [0, 1, 0],
    'the third starts after the first ends, so it fits back on track 0');
});

test('first fit, not next fit: an item drops into the LOWEST free track', () => {
  assert.deepEqual(P([0, 3], [0, 0], [1, 1], [2, 5]).at, [0, 1, 1, 1],
    '[1,1] fits after [0,0] on track 1; [2,5] then also fits on track 1');
});

test('touching intervals collide (an item occupies its end column)', () => {
  assert.deepEqual(P([0, 1], [1, 2]).at, [0, 1], 'both cover column 1');
});

test('a single item covering the whole board is one track', () => {
  assert.deepEqual(P([0, 11]), {at: [0], nTracks: 1});
});

test('the torture lane packs into three tracks with no hole', () => {
  /* lengths 6,1,1,2,3,1 from the design review. These numbers were VERIFIED by
     running the packer — do not "fix" the implementation to match a guess. */
  const r = P([0, 5], [0, 0], [1, 2], [0, 1], [2, 4], [3, 3]);
  assert.deepEqual(r.at, [0, 1, 1, 2, 2, 1]);
  assert.equal(r.nTracks, 3, 'first-fit slots [1,2] beside [0,0] on track 1 — that is the point');
});

test('packing is a pure function of the interval list (same in, same out)', () => {
  const a = P([0, 2], [1, 3], [3, 4]);
  const b = P([0, 2], [1, 3], [3, 4]);
  assert.deepEqual(a, b);
});
