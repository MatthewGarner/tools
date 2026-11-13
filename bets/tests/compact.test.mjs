import {test} from 'node:test';
import assert from 'node:assert/strict';
import {num, sgn, atStep, amount, stakeOf, payoffOf, oddsOf, compactText} from '../format.js';
import {parse} from '../parse.js';

/* XB-6: a figure of a million or more prints in the suite's compact form wherever a Bets surface prints a number. */
test('sampled figures: compact from a million up, unchanged below', () => {
  assert.equal(atStep(1e12, 1e10), '+1T');
  assert.equal(atStep(-1e12, 1e10), '−1T');
  assert.equal(atStep(2340000, 1e4), '+2.34M');
  assert.equal(atStep(999999, 1000), '+1M');
  assert.equal(atStep(-380, 10), '−380');
  assert.equal(sgn(1.5e9), '+1.5B');
  assert.equal(num(-3e6), '−3M');
  assert.equal(amount(1e12), '1T');
  assert.equal(amount(1234), '1234');
});

test('authored amounts: each number of a million or more is compacted, the rest is as written', () => {
  assert.equal(compactText('1000000000000'), '1T');
  assert.equal(compactText('1,000,000-2,500,000'), '1M-2.5M');
  assert.equal(compactText('80'), '80');
  assert.equal(compactText('999999999999999'), '1000T');
  assert.equal(compactText('0.2–0.3'), '0.2–0.3');
  const m = parse('G\n  A: stake 1000000000000, odds 1%, payoff 999999999999999');
  const b = m.groups[0].bets[0];
  assert.equal(stakeOf(b), '1T');
  assert.equal(payoffOf(b), '1000T');
  assert.equal(oddsOf(b), '1%');
});
