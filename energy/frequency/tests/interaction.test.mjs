import test from 'node:test';
import assert from 'node:assert/strict';
import {traceMotionMode} from '../interaction.js';

test('frequency trace animates only for an explicit visible non-reduced trip', () => {
  assert.equal(traceMotionMode({animate: true}), 'animate');
  assert.equal(traceMotionMode({animate: false}), 'still');
  assert.equal(traceMotionMode({animate: true, reduced: true}), 'still');
  assert.equal(traceMotionMode({animate: true, hidden: true}), 'still');
});
