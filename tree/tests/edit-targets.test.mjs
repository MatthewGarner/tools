import {test} from 'node:test';
import assert from 'node:assert/strict';
import {validators, applies, applyExplore} from '../edit-targets.js';
import {parse} from '../parse.js';

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

/* ---- applyExplore (B3, C2): the priced-insistence slider's release-commit ---- */

test('applyExplore: ranged value — commits a width-preserving shift that re-parses to the intended interval', () => {
  const doc = '      Win (p=0.3-0.45): 2M to 5M';
  const m = parse('Root\n  Bid: -150k\n    Outcome\n' + doc + '\n      Lose (p=rest): 0\n  No bid: 0');
  const win = m.root.children[0].children[0].children[0];   // Win
  const newLine = applyExplore(doc, win, 4000000, false);   // mid 2M..5M (width 3M) → new mid 4M
  const reparsed = parse('Root\n  Bid: -150k\n    Outcome\n' + newLine + '\n      Lose (p=rest): 0\n  No bid: 0');
  const win2 = reparsed.root.children[0].children[0].children[0];
  assert.ok(Math.abs(win2.value.hi - win2.value.lo - 3000000) < 1, 'width preserved');
  assert.ok(Math.abs((win2.value.lo + win2.value.hi) / 2 - 4000000) < 1, 'new midpoint lands at 4M');
  assert.equal(win2.pRaw, '0.3-0.45', 'the probability component is untouched');
});

test('applyExplore: probability — width-preserving shift, clamped into [0,1]', () => {
  const doc = '      Win (p=0.3-0.45): 2M to 5M';
  const m = parse('Root\n  Bid: -150k\n    Outcome\n' + doc + '\n      Lose (p=rest): 0\n  No bid: 0');
  const win = m.root.children[0].children[0].children[0];
  const newLine = applyExplore(doc, win, 0.95, true);   // width 0.15 around 0.95 would breach 1
  const reparsed = parse('Root\n  Bid: -150k\n    Outcome\n' + newLine + '\n      Lose (p=rest): 0\n  No bid: 0');
  const win2 = reparsed.root.children[0].children[0].children[0];
  assert.ok(win2.p.hi <= 1 && win2.p.lo >= 0, 'clamped into [0,1]');
  assert.ok(Math.abs(win2.p.hi - 1) < 1e-6, 'held against the upper bound rather than exceeding it');
  assert.equal(win2.valueRaw, '2M to 5M', 'the value component is untouched');
});

test('applyExplore: a point value stays a point after the shift', () => {
  const doc = '  Submit bid: -150k';
  const m = parse('Root\n' + doc + '\n    Outcome\n      Win (p=0.5): 10\n      Lose (p=rest): 0\n  No bid: 0');
  const bid = m.root.children[0];
  const newLine = applyExplore(doc, bid, -200000, false);
  assert.equal(newLine, '  Submit bid: -200k');
});

test('applyExplore: a no-op for a field the node does not carry ("rest" probability, or no value at all)', () => {
  const doc = '      Lose (p=rest): 0';
  const m = parse('Root\n  Bid: -150k\n    Outcome\n      Win (p=0.5): 10\n' + doc + '\n  No bid: 0');
  const lose = m.root.children[0].children[0].children[1];
  assert.equal(applyExplore(doc, lose, 0.2, true), doc, 'rest is never a real range — no-op, never a throw');
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
