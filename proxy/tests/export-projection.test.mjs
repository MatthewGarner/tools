import {test} from 'node:test';
import assert from 'node:assert/strict';
import {parse} from '../parse.js';
import {fullHuntProjection} from '../export-projection.js';
import {INVITATION_HUNT, MONITOR_HUNT, TRADE_OFF_HUNT} from '../example.js';

test('multi-theory full hunt is aggregate and carries no selected receipt', () => {
  const full = fullHuntProjection(parse(INVITATION_HUNT.replace(
    'basis: speculative-concern', 'basis: reasoned-mechanism')));
  assert.equal(full.failureTheories.length, 2);
  assert.equal(full.selectedTheoryId, null);
  assert.equal(full.selectedReceipt, null);
  assert.equal(full.verdict.authoritative, false);
  assert.equal(full.status, 'aggregate review');
  assert.match(full.verdict.line, /2 failure theories are fully stated/);
  assert.match(full.verdict.line, /0 are incomplete/);
  assert.match(full.verdict.line, /No scoped receipt is selected in this full-hunt view/);
  assert.match(full.verdict.limit, /authored hypothesis, not proof/i);
});

test('a ready single-theory full hunt stays aggregate and non-authoritative', () => {
  const full = fullHuntProjection(parse(MONITOR_HUNT));
  assert.equal(full.failureTheories.length, 1);
  assert.equal(full.selectedTheoryId, null);
  assert.equal(full.selectedReceipt, null);
  assert.equal(full.status, 'aggregate review');
  assert.equal(full.verdict.authoritative, false);
  assert.match(full.verdict.line, /1 failure theory is fully stated/);
  assert.match(full.verdict.line, /0 are incomplete/);
  assert.match(full.verdict.line, /No scoped receipt is selected in this full-hunt view/);
  assert.match(full.verdict.limit, /authored hypothesis, not proof/i);
});

test('an incomplete theory keeps a multi-theory full hunt from reading as endorsement', () => {
  const source = `${INVITATION_HUNT}\n\nfailure-theory third:\n  mechanism: An incomplete concern`;
  const full = fullHuntProjection(parse(source));
  assert.equal(full.failureTheories.length, 3);
  assert.equal(full.status, 'aggregate · needs completion');
  assert.equal(full.verdict.authoritative, false);
  assert.match(full.verdict.line, /2 of 3 failure theories are fully stated/);
  assert.match(full.verdict.line, /1 is incomplete/);
  assert.match(full.verdict.line, /Incomplete review is not endorsement/);
});

test('full hunt preserves a missing monitor pressure as its decisive global gate', () => {
  const full = fullHuntProjection(parse(MONITOR_HUNT.replace(
    'optimisation-pressure: Quarterly activation target\n', '')));
  assert.equal(full.status, 'aggregate · needs completion');
  assert.equal(full.verdict.authoritative, false);
  assert.match(full.verdict.line, /Name the optimisation pressure this guardrail constrains/);
  assert.match(full.verdict.line, /No scoped receipt is selected/);
});

test('full hunt preserves speculative review as non-authoritative regardless of selection scope', () => {
  const full = fullHuntProjection(parse(INVITATION_HUNT));
  assert.equal(full.status, 'aggregate · non-authoritative');
  assert.equal(full.verdict.authoritative, false);
  assert.match(full.verdict.line, /At least one failure theory is speculative/);
  assert.match(full.verdict.line, /Stress-test it before making this a target/);
  assert.equal(full.selectedReceipt, null);
});

test('full hunt preserves an undecided trade-off instead of flattening it to aggregate-complete', () => {
  const full = fullHuntProjection(parse(TRADE_OFF_HUNT));
  assert.equal(full.status, 'aggregate · trade-off not yet decided');
  assert.equal(full.verdict.authoritative, false);
  assert.match(full.verdict.line, /Trade-off not yet decided/);
  assert.match(full.verdict.line, /author a decision-rule/);
  assert.equal(full.selectedReceipt, null);
});

test('full hunt preserves missing core context before aggregate counts', () => {
  const full = fullHuntProjection(parse(MONITOR_HUNT.replace(
    'action: Shorten guided setup and defer advanced choices\n', '')));
  assert.equal(full.status, 'aggregate · needs completion');
  assert.equal(full.verdict.authoritative, false);
  assert.match(full.verdict.line, /Complete the target, action and intended theory/);
  assert.match(full.verdict.line, /1 failure theory is fully stated/);
  assert.equal(full.selectedReceipt, null);
});
