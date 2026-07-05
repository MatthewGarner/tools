import {test} from 'node:test';
import assert from 'node:assert/strict';
import {validators, applies} from '../edit-targets.js';

test('prob rewrite preserves everything else on the line', () => {
  assert.equal(applies.prob('      Win (p=0.3-0.45): 2M to 5M', '0.3-0.45', '0.5'),
               '      Win (p=0.5): 2M to 5M');
  assert.equal(applies.prob('  X (p=rest): 0', 'rest', '0.2 to 0.4'),
               '  X (p=0.2 to 0.4): 0');
});

test('value rewrite replaces the tail component only', () => {
  assert.equal(applies.value('  Submit bid: -150k', '-150k', '-200k'),
               '  Submit bid: -200k');
  assert.equal(applies.value('      Win (p=0.6): 2M to 5M', '2M to 5M', '1M'),
               '      Win (p=0.6): 1M');
  // label containing the same text as the value
  assert.equal(applies.value('  5k run: 5k', '5k', '8k'), '  5k run: 8k');
});

test('label rewrite keeps indent, p and value', () => {
  assert.equal(applies.label('      Win (p=0.6): 2M', 'Win', 'Major win'),
               '      Major win (p=0.6): 2M');
  assert.equal(applies.label('  Plan B: the sequel', 'Plan B: the sequel', 'Plan C'),
               '  Plan C');
});

test('validators: prob bounds, value parses, label sanity', () => {
  assert.ok(validators.prob('0.5') && validators.prob('0.3-0.45') && validators.prob('rest'));
  assert.ok(!validators.prob('1.5') && !validators.prob('abc'));
  assert.ok(validators.value('-1M to -0.5M') && !validators.value('lots'));
  assert.ok(validators.label('New name') && !validators.label('[tag]') && !validators.label('? doubt'));
});

/* ---- add/remove (S1 parity) ---- */
import {subtreeRange, childLineFor} from '../edit-targets.js';

const DOC = [
  'title: Test',            // 0
  '',                       // 1
  'Bid decision',           // 2
  '  Submit bid: -150k',    // 3
  '    Outcome',            // 4
  '      Win (p=0.4): 2M',  // 5
  '',                       // 6
  '      Lose (p=rest): 0', // 7
  '  No bid: 0',            // 8
].join('\n');

test('subtreeRange: leaf is a single line', () => {
  assert.deepEqual(subtreeRange(DOC, 5), {from: 5, to: 5});
  assert.deepEqual(subtreeRange(DOC, 8), {from: 8, to: 8});
});

test('subtreeRange: internal node spans its descendants, skipping inner blanks', () => {
  assert.deepEqual(subtreeRange(DOC, 4), {from: 4, to: 7});
  assert.deepEqual(subtreeRange(DOC, 3), {from: 3, to: 7});
  assert.deepEqual(subtreeRange(DOC, 2), {from: 2, to: 8});
});

test('subtreeRange: trailing blanks are not swallowed', () => {
  const doc = 'Root\n  Kid: 1\n\n\nSibling tree';
  assert.deepEqual(subtreeRange(doc, 0), {from: 0, to: 1});
});

test('subtreeRange: blank or comment lines are not removable', () => {
  assert.equal(subtreeRange(DOC, 1), null);
  assert.equal(subtreeRange('// note\nA: 1', 0), null);
  assert.equal(subtreeRange(DOC, 99), null);
});

test('childLineFor: decision node gets an option at child indent, after the subtree', () => {
  const r = childLineFor(DOC, 2);
  assert.equal(r.newLine, '  New option: 0');
  assert.equal(r.afterLine, 8);
  assert.equal(r.select, 'New option');
});

test('childLineFor: chance node with a rest child gets a fixed p', () => {
  const r = childLineFor(DOC, 4);
  assert.equal(r.newLine, '      New outcome (p=0.1): 0');
  assert.equal(r.afterLine, 7);
});

test('childLineFor: chance node without rest gets p=rest', () => {
  const doc = 'Decide\n  A: 1\n    Win (p=0.5): 10\n    Lose (p=0.5): 0';
  const r = childLineFor(doc, 1);
  // "A" is internal via children with p → chance
  assert.equal(r.newLine, '    New outcome (p=rest): 0');
  assert.equal(r.afterLine, 3);
});

test('childLineFor: a leaf grows its first outcome (leaf → chance)', () => {
  const r = childLineFor(DOC, 8);
  assert.equal(r.newLine, '    New outcome (p=rest): 0');
  assert.equal(r.afterLine, 8);
});

test('childLineFor: implicit root (-1) appends a top-level option', () => {
  const doc = 'Top A: 1\nTop B: 2\n';
  const r = childLineFor(doc, -1);
  assert.equal(r.newLine, 'New option: 0');
  assert.equal(r.afterLine, 1);
});
