import {test} from 'node:test';
import assert from 'node:assert/strict';
import {applies, validators} from '../edit-targets.js';

test('title rewrite keeps lane, status, note, link', () => {
  assert.equal(applies.title('Core: Streak freeze [doing] -- top request -> https://x', 'Streak freeze', 'Streak shield'),
               'Core: Streak shield [doing] -- top request -> https://x');
});
test('note rewrite touches only the note', () => {
  assert.equal(applies.note('Core: Freeze [doing] -- top request', 'top request', 'most-wanted fix'),
               'Core: Freeze [doing] -- most-wanted fix');
});
test('status swap', () => {
  assert.equal(applies.status('Core: Freeze [doing]', 'doing', 'risk'), 'Core: Freeze [risk]');
});
test('validators reject structure-breakers', () => {
  assert.ok(validators.title('Nice title') && !validators.title('a -- b') && !validators.title('[x]'));
  assert.ok(validators.note('fine') && !validators.note('a -- b'));
});
