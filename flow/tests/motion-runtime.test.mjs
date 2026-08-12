import test from 'node:test';
import assert from 'node:assert/strict';
import {queueMotionAllowed, queueTime, flowHashState} from '../motion-runtime.js';

test('queue motion runs only while visible, foregrounded, and permitted', () => {
  const base = {hasEvents: true, visible: true};
  assert.equal(queueMotionAllowed(base), true);
  assert.equal(queueMotionAllowed({...base, visible: false}), false);
  assert.equal(queueMotionAllowed({...base, hidden: true}), false);
  assert.equal(queueMotionAllowed({...base, reduced: true}), false);
  assert.equal(queueMotionAllowed({...base, hasEvents: false}), false);
});

test('flow link state is built from the same live controls as the export', () => {
  assert.deepEqual(flowHashState({demandPerWeek: 7, itemDays: 3, team: 4, cov: 'low'},
    {wip: '9', transactionCost: '1200', holdCost: '80', batch: '6', backlog: '11', expedite: '1.5', diceDays: '25', diceSeed: 42}),
  {d: 7, s: 3, t: 4, w: 9, v: 'low', tc: 1200, hc: 80, b: 6, q: 11, e: 1.5, dd: 25, ds: 42});
});

test('a restarted loop begins at the start of its window instead of catching up hidden time', () => {
  const window = {t0: 20, t1: 80};
  assert.equal(queueTime(5000, 5000, window), 20);
  assert.equal(queueTime(8000, 5000, window), 35);
  assert.equal(queueTime(17000, 5000, window), 20);
});
