import {test} from 'node:test';
import assert from 'node:assert/strict';
import {adjustThreshold, dragEndsForPointer} from '../interaction.js';

test('threshold keyboard policy supports repeated arrows, shift steps, and bounds', () => {
  let value = 1.2;
  for(let i = 0; i < 10; i++) value = adjustThreshold(value, 'ArrowRight', false);
  assert.equal(value, 1.7);
  assert.equal(adjustThreshold(value, 'ArrowDown', true), 1.45);
  assert.equal(adjustThreshold(6, 'ArrowRight', false), 6);
  assert.equal(adjustThreshold(-3, 'ArrowLeft', false), -3);
  assert.equal(adjustThreshold(value, 'Enter', false), null);
});

test('a drag only ends for the active pointer', () => {
  assert.equal(dragEndsForPointer(7, 7), true);
  assert.equal(dragEndsForPointer(7, 8), false);
  assert.equal(dragEndsForPointer(null, 7), false);
});
