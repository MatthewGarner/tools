import test from 'node:test';
import assert from 'node:assert/strict';
import {createPostDragClickGuard, moveCommit} from '../interactions.js';

function harness(){
  let pending = null;
  const guard = createPostDragClickGuard(fn => { pending = fn; return 1; }, () => { pending = null; });
  return {guard, expire(){ const fn = pending; pending = null; if(fn) fn(); }};
}

test('post-drag click guard consumes only the immediate expected click', () => {
  const h = harness();
  h.guard.arm(true);
  assert.equal(h.guard.consume(), true);
  assert.equal(h.guard.consume(), false);
});

test('outside release, cancellation and expiry cannot swallow a later valid click', () => {
  const h = harness();
  h.guard.arm(false);                         // pointerup outside the preview
  assert.equal(h.guard.consume(), false);
  h.guard.arm(true); h.guard.clear();          // pointercancel / lost capture
  assert.equal(h.guard.consume(), false);
  h.guard.arm(true); h.expire();               // browser emitted no click this task
  assert.equal(h.guard.consume(), false);
});

test('menu move requests the same FLIP only for a real text change', () => {
  assert.deepEqual(moveCommit('NOW\nA', 'NOW\nNEXT\nA'), {text: 'NOW\nNEXT\nA', flip: true});
  assert.equal(moveCommit('NOW\nA', 'NOW\nA'), null);
  assert.equal(moveCommit('NOW\nA', null), null);
});
