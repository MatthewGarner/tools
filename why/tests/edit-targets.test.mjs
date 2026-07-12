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

/* ---- add/remove (S1 parity) ---- */
import {subtreeRange, childLineFor} from '../edit-targets.js';

const DOC = [
  'outcome: Improve retention',        // 0
  '  Users forget habits',             // 1
  '    Smart reminders [testing]',     // 2
  '      ? users tolerate pings',      // 3
  '',                                  // 4
  '    Streak freeze [delivering]',    // 5
  '  Habits feel like chores',         // 6
].join('\n');

test('subtreeRange: solution spans its assumptions, skipping inner blanks', () => {
  assert.deepEqual(subtreeRange(DOC, 2), {from: 2, to: 3});
  assert.deepEqual(subtreeRange(DOC, 1), {from: 1, to: 5});
  assert.deepEqual(subtreeRange(DOC, 0), {from: 0, to: 6});
});

test('subtreeRange: blank and comment lines are not removable', () => {
  assert.equal(subtreeRange(DOC, 4), null);
  assert.equal(subtreeRange('// x\noutcome: Y', 0), null);
});

test('childLineFor: outcome grows an opportunity', () => {
  const r = childLineFor(DOC, 0);
  assert.equal(r.newLine, '  New opportunity');
  assert.equal(r.afterLine, 6);
  assert.equal(r.select, 'New opportunity');
});

test('childLineFor: opportunity grows a candidate solution', () => {
  const r = childLineFor(DOC, 1);
  assert.equal(r.newLine, '    New solution [candidate]');
  assert.equal(r.afterLine, 5);
  assert.equal(r.select, 'New solution');
});

test('childLineFor: solution grows an assumption', () => {
  const r = childLineFor(DOC, 2);
  assert.equal(r.newLine, '      ? New assumption');
  assert.equal(r.afterLine, 3);
  assert.equal(r.select, 'New assumption');
});

test('childLineFor: unknown line returns null', () => {
  assert.equal(childLineFor(DOC, 4), null);
  assert.equal(childLineFor(DOC, 99), null);
});

test('status vocabularies are single-sourced from parse.js (no drift)', async () => {
  const p = await import('../parse.js');
  const et = await import('../edit-targets.js');
  assert.equal(et.ASSUMPTION_CYCLE, p.ASSUMPTION_STATUSES, 'ASSUMPTION_CYCLE re-exports parse.ASSUMPTION_STATUSES (same array)');
  assert.equal(et.SOLUTION_STATUSES, p.SOLUTION_STATUSES, 'SOLUTION_STATUSES single-sourced');
});
