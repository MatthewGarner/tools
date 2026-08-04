import test from 'node:test';
import assert from 'node:assert/strict';
import {createPreviewRevisionGuard} from '../interaction-state.js';

test('preview stays blocked until the current worker revision settles', () => {
  const states = [];
  let closes = 0;
  const guard = createPreviewRevisionGuard({
    onBlockedChange: (blocked, revision) => states.push([blocked, revision]),
    closeActive: () => { closes++; },
  });

  guard.begin(4);
  guard.begin(5);
  assert.equal(closes, 2);
  assert.equal(guard.settle(4), false, 'late worker response is rejected');
  assert.equal(guard.blocked, true, 'late response cannot reactivate stale artefact');
  assert.equal(guard.settle(5), true);
  assert.equal(guard.blocked, false);
  assert.deepEqual(states, [[true, 4], [true, 5], [false, 5]]);
});

test('target acceptance requires the rendered revision and a live entity', () => {
  const guard = createPreviewRevisionGuard({onBlockedChange() {}, closeActive() {}});
  guard.begin(8);
  assert.equal(guard.accepts(7, true), false);
  assert.equal(guard.accepts(8, true), false, 'pending revision is not editable');
  guard.settle(8);
  assert.equal(guard.accepts(8, true), true);
  assert.equal(guard.accepts(8, false), false, 'deleted/detached entity is rejected');
  assert.equal(guard.accepts(7, true), false, 'old rendered entity is rejected');
});

test('clearing a request safely returns an empty or memoized preview to interactive state', () => {
  const states = [];
  const guard = createPreviewRevisionGuard({onBlockedChange: (blocked, revision) => states.push([blocked, revision]), closeActive() {}});
  guard.begin(2);
  guard.clear(3);
  assert.equal(guard.blocked, false);
  assert.equal(guard.accepts(3, true), true);
  assert.deepEqual(states, [[true, 2], [false, 3]]);
});
