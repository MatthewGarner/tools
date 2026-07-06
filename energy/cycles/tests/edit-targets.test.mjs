import {test} from 'node:test';
import assert from 'node:assert/strict';
import {parse} from '../parse.js';
import {validators, editField} from '../edit-targets.js';

test('field rewrites hit their own number only', () => {
  assert.equal(editField('battery: 100MW / 200MWh', 'mw', '50'), 'battery: 50MW / 200MWh');
  assert.equal(editField('battery: 100MW / 200MWh', 'mwh', '400'), 'battery: 100MW / 400MWh');
  assert.equal(editField('spread: 35..85', 'spreadLo', '30'), 'spread: 30..85');
  assert.equal(editField('spread: 35..85', 'spreadHi', '90'), 'spread: 35..90');
  assert.equal(editField('fade: 0.006..0.012 %/cycle', 'fadeHi', '0.02'), 'fade: 0.006..0.02 %/cycle');
  assert.equal(editField('cycles: 6000 over 15yr', 'budget', '4000'), 'cycles: 4000 over 15yr');
  assert.equal(editField('cycles: 6000 over 15yr', 'years', '20'), 'cycles: 6000 over 20yr');
  assert.equal(editField('drift: -4..0 %/yr', 'driftLo', '-6'), 'drift: -6..0 %/yr');
  assert.equal(editField('second: 35..60%', 'secondHi', '70'), 'second: 35..70%');
  assert.equal(editField('augment: 120..180 £/kWh', 'augLo', '100'), 'augment: 100..180 £/kWh');
});

test('single-value lines: the lo field edits the lone number', () => {
  assert.equal(editField('rte: 88%', 'rteLo', '86'), 'rte: 86%');
  assert.equal(editField('charge: 20', 'chargeLo', '25'), 'charge: 25');
});

test('round-trips through the parser; unknown field is a no-op', () => {
  const m = parse('battery: 100MW / 200MWh\n' + editField('spread: 35..85', 'spreadHi', '95'));
  assert.equal(m.spread.hi, 95);
  assert.equal(editField('spread: 35..85', 'nope', '1'), 'spread: 35..85');
});

test('validators.num', () => {
  for(const ok of ['70', '-4', '0.006']) assert.ok(validators.num(ok));
  for(const bad of ['', 'x', '1..2']) assert.ok(!validators.num(bad));
});
