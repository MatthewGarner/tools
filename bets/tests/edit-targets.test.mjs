import {test} from 'node:test';
import assert from 'node:assert/strict';
import {parse} from '../parse.js';
import {kinds, rewriteStake, rewriteOdds, rewritePayoff, rewriteKill} from '../edit-targets.js';

/* same fixture as parse.test.mjs — srcLines are 1-based (bets/parse.js) */
const FULL = `title: Q3 product portfolio
unit: £k
palette: ocean

Growth
  Search revamp: stake 120, odds 30-50%, payoff 400-900
    kill: CTR flat after 2 sprints by 2026-09-01
  Referral loop: stake 45, odds 15-35%, payoff 200-600
    kill: <5% invite rate by March

Platform
  Billing rewrite: stake 200, odds 85-95%, payoff 250-350`;

/* mirrors wardley/tests' local apply helper: edits use 0-based `line`
   (matching applyLineOps/lineOpsChanges), text:null deletes the line */
const apply = (text, edits) => {
  const lines = text.split('\n');
  for(const e of edits) lines[e.line] = e.text;
  return lines.filter(l => l !== null).join('\n');
};

test('kinds: stake/odds/payoff/kill are all plain input kinds (no cycle/menu/options)', () => {
  for(const k of ['stake', 'odds', 'payoff', 'kill']){
    assert.ok(kinds[k], k + ' kind present');
    assert.equal(typeof kinds[k].validate, 'function', k + ' has validate');
    assert.ok(!kinds[k].cycle && !kinds[k].menu && !kinds[k].options && !kinds[k].actions, k + ' is input-kind only');
  }
});

test('odds rewrite: 30-50% -> 20-60% leaves stake/payoff byte-identical, updates odds', () => {
  const edits = rewriteOdds(FULL, 6, '30-50%', '20-60');
  assert.equal(edits.length, 1);
  assert.equal(edits[0].line, 5);                      // 0-based: srcLine 6 - 1
  assert.equal(edits[0].text, '  Search revamp: stake 120, odds 20-60%, payoff 400-900');
  const out = apply(FULL, edits);
  const b = parse(out).groups[0].bets[0];
  assert.deepEqual(b.odds, [20, 60]);
  assert.deepEqual(b.stake, [120, 120]);
  assert.deepEqual(b.payoff, [400, 900]);
});

test('point stake 120 -> 150 stays a point', () => {
  const edits = rewriteStake(FULL, 6, '120', '150');
  assert.match(edits[0].text, /stake 150,/);
  const b = parse(apply(FULL, edits)).groups[0].bets[0];
  assert.deepEqual(b.stake, [150, 150]);
});

test('range stake stays a range after rewrite', () => {
  const edits = rewriteStake(FULL, 6, '120', '100-200');
  assert.match(edits[0].text, /stake 100-200,/);
  const b = parse(apply(FULL, edits)).groups[0].bets[0];
  assert.deepEqual(b.stake, [100, 200]);
});

test('payoff rewrite leaves stake and odds untouched', () => {
  const edits = rewritePayoff(FULL, 6, '400-900', '500-1000');
  const out = apply(FULL, edits);
  const b = parse(out).groups[0].bets[0];
  assert.deepEqual(b.payoff, [500, 1000]);
  assert.deepEqual(b.stake, [120, 120]);
  assert.deepEqual(b.odds, [30, 50]);
});

test('kill rewrite preserves the existing by-date when the new text omits one', () => {
  const edits = rewriteKill(FULL, 7, 'CTR flat after 2 sprints by 2026-09-01', 'CTR flat after 3 sprints');
  assert.equal(edits.length, 1);
  assert.equal(edits[0].line, 6);                      // 0-based: srcLine 7 - 1
  const k = parse(apply(FULL, edits)).groups[0].bets[0].kill;
  assert.equal(k.text, 'CTR flat after 3 sprints');
  assert.equal(k.by, '2026-09-01');
});

test('kill rewrite replaces the by-date when the new text carries its own', () => {
  const edits = rewriteKill(FULL, 7, 'CTR flat after 2 sprints by 2026-09-01', 'Pivot signal by 2026-11-01');
  const k = parse(apply(FULL, edits)).groups[0].bets[0].kill;
  assert.equal(k.text, 'Pivot signal');
  assert.equal(k.by, '2026-11-01');
});

test('empty kill value deletes the child kill line', () => {
  const edits = rewriteKill(FULL, 7, 'CTR flat after 2 sprints by 2026-09-01', '');
  assert.deepEqual(edits, [{line: 6, text: null}]);
  const b = parse(apply(FULL, edits)).groups[0].bets[0];
  assert.equal(b.kill, null);
});

test('whitespace-only kill value also deletes the child kill line', () => {
  const edits = rewriteKill(FULL, 7, 'CTR flat after 2 sprints by 2026-09-01', '   ');
  assert.deepEqual(edits, [{line: 6, text: null}]);
});

test('a trailing // comment on a bet line survives an odds rewrite', () => {
  const doc = 'G\n  B: stake 10, odds 20-40%, payoff 5-9   // hot lead';
  const edits = rewriteOdds(doc, 2, '20-40%', '25-45');
  const out = apply(doc, edits);
  assert.match(out, /\/\/ hot lead$/);
  const b = parse(out).groups[0].bets[0];
  assert.deepEqual(b.odds, [25, 45]);
});

test('odds validate accepts an out-of-range value; rewrite clamps 20-150% to 20-100%', () => {
  assert.equal(kinds.odds.validate('20-150'), true);
  const edits = rewriteOdds(FULL, 6, '30-50%', '20-150');
  assert.match(edits[0].text, /odds 20-100%/);
  const b = parse(apply(FULL, edits)).groups[0].bets[0];
  assert.deepEqual(b.odds, [20, 100]);
});

test('invalid input returns null (no edit) and fails validate', () => {
  assert.equal(rewriteStake(FULL, 6, '120', 'abc'), null);
  assert.equal(rewriteOdds(FULL, 6, '30-50%', 'abc'), null);
  assert.equal(rewritePayoff(FULL, 6, '400-900', 'abc'), null);
  assert.equal(kinds.stake.validate('abc'), false);
  assert.equal(kinds.odds.validate('abc'), false);
  assert.equal(kinds.payoff.validate('abc'), false);
});

test('a stake/odds/payoff rewrite never touches other bets\' srcLines', () => {
  const edits = rewriteOdds(FULL, 6, '30-50%', '20-60');
  assert.equal(edits.length, 1);                       // only the target line changes
  const m = parse(apply(FULL, edits));
  assert.equal(m.groups[0].bets[1].srcLine, 8);
  assert.equal(m.groups[0].bets[1].kill.srcLine, 9);
  assert.equal(m.groups[1].srcLine, 11);
  assert.equal(m.groups[1].bets[0].srcLine, 12);
});

test('kill deletion shifts only subsequent srcLines by one line, nothing else changes shape', () => {
  const edits = rewriteKill(FULL, 7, 'CTR flat after 2 sprints by 2026-09-01', '');
  const m = parse(apply(FULL, edits));
  assert.equal(m.groups[0].bets[0].kill, null);
  assert.equal(m.groups[0].bets[1].srcLine, 7);        // was 8, shifted -1
  assert.equal(m.groups[0].bets[1].kill.srcLine, 8);   // was 9
  assert.equal(m.groups[1].srcLine, 10);               // was 11
  assert.equal(m.groups[1].bets[0].srcLine, 11);       // was 12
});
