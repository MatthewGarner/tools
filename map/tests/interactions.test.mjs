import test from 'node:test';
import assert from 'node:assert/strict';
import {cardMenuRows, createPostDragClickGuard} from '../interactions.js';

function labels(rows){ return rows.map(r => r.label); }
function harness(){
  let pending = null;
  const guard = createPostDragClickGuard(fn => { pending = fn; return 1; }, () => { pending = null; });
  return {guard, expire(){ const fn = pending; pending = null; if(fn) fn(); }};
}

test('fieldless item menu contains only actions with rendered targets', () => {
  assert.deepEqual(labels(cardMenuRows({x: null, fields: []}, false)), ['Rename…', 'Place on map…', 'Remove']);
  assert.deepEqual(labels(cardMenuRows({x: 20, fields: []}, false)), ['Rename…', 'Move…', 'Remove']);
});

test('field menu appears when the renderer has a field target', () => {
  assert.deepEqual(labels(cardMenuRows({x: 20, fields: [{key: 'owner', val: 'Jo'}]}, true)),
    ['Rename…', 'Edit field…', 'Move…', 'Remove']);
});

test('menu omits Edit field when a crowded readout did not render that target', () => {
  assert.deepEqual(labels(cardMenuRows({x: 20, fields: [{key: 'owner', val: 'Jo'}]}, false)),
    ['Rename…', 'Move…', 'Remove']);
  assert.deepEqual(cardMenuRows(null, false), []);
});

test('post-drag guard is one-shot and never survives outside/cancelled/lost gestures', () => {
  const h = harness();
  h.guard.arm(true);
  assert.equal(h.guard.consume(), true);
  assert.equal(h.guard.consume(), false);
  h.guard.arm(false);
  assert.equal(h.guard.consume(), false);
  h.guard.arm(true); h.guard.clear();
  assert.equal(h.guard.consume(), false);
  h.guard.arm(true); h.expire();
  assert.equal(h.guard.consume(), false);
});
