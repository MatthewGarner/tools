import {test} from 'node:test';
import assert from 'node:assert/strict';
import {applies, validators} from '../edit-targets.js';

test('status rewrite replaces the tag anywhere on the line', () => {
  assert.equal(applies.status('    Smart reminders [testing]', 'testing', 'delivering'),
               '    Smart reminders [delivering]');
});
test('status rewrite appends when untagged (default-untested assumptions)', () => {
  assert.equal(applies.status('      ? users will invite friends', 'untested', 'testing'),
               '      ? users will invite friends [testing]');
});
test('label rewrite preserves prefix glyphs and tags', () => {
  assert.equal(applies.label('      ? old belief [holds]', 'old belief', 'new belief'),
               '      ? new belief [holds]');
  assert.equal(applies.label('outcome: Improve retention', 'Improve retention', 'Grow retention'),
               'outcome: Grow retention');
});
test('label validator rejects structure-breaking input', () => {
  assert.ok(validators.label('Fine name'));
  assert.ok(!validators.label('[candidate]') && !validators.label('? doubt') && !validators.label('outcome: X'));
});
