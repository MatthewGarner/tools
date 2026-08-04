import test from 'node:test';
import assert from 'node:assert/strict';
import {makeDragClickGuard} from '../drag-click-guard.js';

test('completed drag consumes only its own compatibility click', () => {
  const deferred = [];
  const guard = makeDragClickGuard(fn => deferred.push(fn));
  guard.arm(7, '3\0Habit builder');
  assert.equal(guard.consume(7, '3\0Habit builder'), true);
  assert.equal(guard.consume(7, '3\0Habit builder'), false);
});

test('an unrelated click is never swallowed and also exhausts the guard', () => {
  const guard = makeDragClickGuard(() => {});
  guard.arm(7, '3\0Habit builder');
  assert.equal(guard.consume(8, '3\0Habit builder'), false);
  assert.equal(guard.consume(7, '3\0Habit builder'), false);
});

test('legacy compatibility click without pointerId still matches exact component', () => {
  const guard = makeDragClickGuard(() => {});
  guard.arm(7, '3\0Habit builder');
  assert.equal(guard.consume(null, '3\0Habit builder'), true);
});

test('cancel, lost capture, or outside release can clear by pointer ownership', () => {
  const guard = makeDragClickGuard(() => {});
  guard.arm(7, '3\0Habit builder');
  guard.clear(8);
  assert.equal(guard.consume(7, '3\0Habit builder'), true, 'another pointer cannot clear it');

  guard.arm(7, '3\0Habit builder');
  guard.clear(7);
  assert.equal(guard.consume(7, '3\0Habit builder'), false);
});

test('guard expires after the compatibility-click event turn', () => {
  const deferred = [];
  const guard = makeDragClickGuard(fn => deferred.push(fn));
  guard.arm(7, '3\0Habit builder');
  deferred.shift()();
  assert.equal(guard.consume(7, '3\0Habit builder'), false);
});

test('an older expiry cannot clear a newer gesture', () => {
  const deferred = [];
  const guard = makeDragClickGuard(fn => deferred.push(fn));
  guard.arm(7, '3\0Habit builder');
  guard.arm(9, '5\0User DB');
  deferred.shift()();
  assert.equal(guard.consume(9, '5\0User DB'), true);
});
