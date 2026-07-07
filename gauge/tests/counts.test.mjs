import {test} from 'node:test';
import assert from 'node:assert/strict';
import {countLabel} from '../engine.js';

/* Round-1 counter copy */
test('round 1: waiting, singular, plural', () => {
  assert.equal(countLabel(1, {count: 0}), 'Waiting for responses…');
  assert.equal(countLabel(1, {count: 1}), '1 person has responded');
  assert.equal(countLabel(1, {count: 3}), '3 people have responded');
});

/* Round-2 counter copy — denominator is the whole final room, never round-1 count */
test('round 2: waiting when nobody has revised', () => {
  assert.equal(countLabel(2, {count: 4, count2: 0, finalCount: 4}),
    'Round 2 open — waiting for revised estimates…');
});

test('round 2: some revised, rest carry round 1 forward', () => {
  assert.equal(countLabel(2, {count: 3, count2: 1, finalCount: 3}),
    '1 of 3 revised so far — the other 2 carry round 1 forward');
  assert.equal(countLabel(2, {count: 2, count2: 1, finalCount: 2}),
    '1 of 2 revised so far — the other 1 carries round 1 forward');   // singular "carries"
});

test('round 2: everyone revised — no carry-forward tail', () => {
  assert.equal(countLabel(2, {count: 3, count2: 3, finalCount: 3}),
    '3 of 3 revised so far — everyone has revised');
});

/* The Bug-2 regression: a round-2 responder who skipped round 1 must never
   push the numerator above the denominator ("2 of 1"). */
test('round 2: newcomer never produces "N of fewer"', () => {
  // r1={A}, r2={A,C}: 2 people submitted round 2, both are in the final room.
  assert.equal(countLabel(2, {count: 1, count2: 2, finalCount: 2}),
    '2 of 2 revised so far — everyone has revised');
  // r1={A}, r2={C} only (A stands pat): final room is 2, one revised, one carries forward.
  assert.equal(countLabel(2, {count: 1, count2: 1, finalCount: 2}),
    '1 of 2 revised so far — the other 1 carries round 1 forward');
});

/* Defensive: if finalCount is absent (older relay), fall back to a denominator
   that still can't be smaller than the numerator. */
test('round 2: missing finalCount falls back to max(count, count2)', () => {
  assert.equal(countLabel(2, {count: 1, count2: 2}),
    '2 of 2 revised so far — everyone has revised');
  assert.equal(countLabel(2, {count: 4, count2: 1}),
    '1 of 4 revised so far — the other 3 carry round 1 forward');
});
