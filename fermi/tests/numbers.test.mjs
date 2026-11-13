/* Number reading and printing (engine-correctness rulings FM-1, 11, 14, 15, 16, 21, 22, 29).
   Pure: no DOM, no random stream. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {parseNum, tokenize, parse, evalNode, fmt, sig, ratioStr, readNumber} from '../engine.js';
import {pctProb, pctOne, shapeLabel, stretchLabel} from '../words.js';
import {parseCashflowScalar, parseCashflowTenor} from '../interactions.js';

const val = src => evalNode(parse(tokenize(src)), {});

test('FM-14: a malformed number in a formula is a syntax error', () => {
  assert.throws(() => tokenize('1.2.3 * x'), e => /number/.test(e.msg));
  assert.throws(() => tokenize('1,5 * x'), e => /number/.test(e.msg));
  assert.throws(() => tokenize('12,34 * x'));
  assert.throws(() => tokenize('1,0000 * x'));
  assert.throws(() => tokenize('1__0 * x'));
  assert.equal(val('1,500 + 1'), 1501);
  assert.equal(val('1,500,000'), 1.5e6);
  assert.equal(val('1_000'), 1000);
  assert.equal(val('5.'), 5);
  assert.equal(val('.5'), 0.5);
  assert.equal(val('3m'), 3e6);
  assert.equal(val('1,000.5'), 1000.5);
});

test('FM-14/15: parseNum reads what the page prints and refuses the rest', () => {
  assert.equal(parseNum('3M'), 3e6);
  assert.equal(parseNum('1,500'), 1500);
  assert.equal(parseNum('-5k'), -5000);
  assert.equal(parseNum('−5'), -5);               // the page's own minus sign
  assert.equal(parseNum('1e+6'), 1e6);
  assert.equal(parseNum('1e6'), 1e6);
  assert.equal(parseNum('1e-3'), 0.001);
  assert.equal(parseNum('5.'), 5);
  assert.equal(parseNum('1_000'), 1000);
  assert.equal(parseNum('.5'), 0.5);
  for(const bad of ['1,5', '1.2.3', '12abc', '5%', '£5', '5bn', '', '  ', '1 000', '1,0000', '--5', '1e', 'e5'])
    assert.ok(Number.isNaN(parseNum(bad)), JSON.stringify(bad));
  assert.deepEqual(readNumber('3m'), {value: 3e6, suffix: 'm'});
  assert.deepEqual(readNumber('3'), {value: 3, suffix: ''});
  assert.equal(readNumber('x'), null);
});

test('FM-16: round first, then pick the unit', () => {
  assert.equal(fmt(4523), '4.52k');
  assert.equal(fmt(1234567), '1.23M');
  assert.equal(fmt(999600), '1M');
  assert.equal(fmt(999.6e6), '1B');
  assert.equal(fmt(999.6), '1k');
  assert.equal(fmt(999.4), '999');
  assert.equal(fmt(999.6e9), '1T');
  assert.equal(fmt(0.0009996), '0.001');
  assert.equal(fmt(0.0004), '4.0e-4');
  assert.equal(fmt(-999600), '−1M');
  for(const v of [1e15, 1e18, 1.23e21, 9.99e24, 1e300]){
    const t = fmt(v);
    assert.ok(!/e\+|\d{4,}T|e\d/.test(t), t);        // no exponent, no "1000000T"
  }
  assert.equal(fmt(1e18), '1,000,000T');
  assert.ok(!/e/.test(sig(1.23e21, 2)), sig(1.23e21, 2));
  assert.equal(sig(1.23e21, 2), '1200000000000000000000');
  assert.equal(sig(1.5, 3), '1.5');
  assert.equal(sig(1234, 2), '1200');
});

test('FM-1: one spread formatter; below x2 it prints the excess over 1 to two figures', () => {
  assert.equal(ratioStr(1.0499), '1.05');
  assert.equal(ratioStr(1.029), '1.029');
  assert.equal(ratioStr(1.5), '1.5');
  assert.equal(ratioStr(1.87), '1.87');
  assert.equal(ratioStr(1.0001), '1.0001');
  assert.equal(ratioStr(1), '1');
  assert.equal(ratioStr(2), '2');
  assert.equal(ratioStr(3.6), '3.6');
  assert.equal(ratioStr(1234), '1200');
  assert.equal(ratioStr(1.23e21), '1200000000000000000000');
});

test('FM-11: stretch labels keep two figures and call a factor below 1 a shrink', () => {
  const fm = {kind: 'mult', factor: 1.04};
  assert.equal(stretchLabel(fm), '×1.04 stretch');
  assert.equal(stretchLabel({kind: 'mult', factor: 0.04}), '×0.04 shrink');
  assert.equal(stretchLabel({kind: 'mult', factor: 0.82}), '×0.82 shrink');
  assert.equal(stretchLabel({kind: 'mult', factor: 8.25}), '×8.3 stretch');
  assert.equal(stretchLabel({kind: 'mult', factor: 2}), '×2 stretch');
  assert.equal(stretchLabel({kind: 'add', delta: 1500}), 'shifted +1.5k');
  assert.equal(stretchLabel({kind: 'add', delta: -3}), 'shifted −3');
});


test('FM-22: IRR prints to one decimal place', () => {
  assert.equal(pctOne(0.1327), '13.3%');
  assert.equal(pctOne(-0.05), '−5.0%');
  assert.equal(pctOne(null), '—');
});

test('FM-29: a uniform input is named in full', () => {
  assert.equal(shapeLabel('uni', 10), 'uniform (full range)');
  assert.equal(shapeLabel('logn', 10), 'log-normal');
  assert.equal(shapeLabel('norm', 10), 'normal');
  assert.equal(shapeLabel('auto', 10), 'log-normal');
  assert.equal(shapeLabel('auto', -10), 'normal');
  assert.equal(shapeLabel('logn', 0), 'normal (log-normal needs a range above zero)');
});

test('FM-28: cash-flow scalar fields use the range reader', () => {
  assert.equal(parseCashflowScalar('8k'), 8000);
  assert.equal(parseCashflowScalar(' 6.5 '), 6.5);
  for(const bad of ['12abc', '1.3x', '6.5 to 8', '', '1,5'])
    assert.ok(Number.isNaN(parseCashflowScalar(bad)), bad);
  assert.equal(parseCashflowTenor('9').value, 9);
  assert.equal(parseCashflowTenor('1e1').valid, false);
  assert.equal(parseCashflowTenor('9.5').valid, false);
  assert.equal(parseCashflowTenor('').valid, true);
});

test('FM-21: one probability printer for every surface: tenths in both tails, never 0% or 100% for a value that is neither', () => {
  assert.equal(pctProb(0.9962), '99.6%');   // the old threshold printer said "100%" here
  assert.equal(pctProb(0.9996), '>99.9%');
  assert.equal(pctProb(0.0004), '<0.1%');
  assert.equal(pctProb(0.012), '1.2%');
  assert.equal(pctProb(0.0949), '9.5%');
  assert.equal(pctProb(0.64), '64%');
  assert.equal(pctProb(0.5), '50%');
  assert.equal(pctProb(0.9051), '90.5%');
  assert.equal(pctProb(0), '<0.1%');
  assert.equal(pctProb(1), '>99.9%');
});
