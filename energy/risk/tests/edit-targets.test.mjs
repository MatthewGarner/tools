import {test} from 'node:test';
import assert from 'node:assert/strict';
import {parse} from '../parse.js';
import {validators, editField} from '../edit-targets.js';

test('validators.num accepts decimals, rejects junk', () => {
  for(const ok of ['70', '70.5', '0']) assert.ok(validators.num(ok), ok);
  for(const bad of ['', 'abc', '7..0', '-']) assert.ok(!validators.num(bad), bad);
});

test('every field rewrites its own number and nothing else', () => {
  assert.equal(editField('floor: 70 share 60% fee 5', 'level', '85'), 'floor: 85 share 60% fee 5');
  assert.equal(editField('floor: 70 share 60% fee 5', 'share', '75'), 'floor: 70 share 75% fee 5');
  assert.equal(editField('floor: 70 share 60% fee 5', 'fee', '8'), 'floor: 70 share 60% fee 8');
  assert.equal(editField('toll: 95', 'fixed', '100'), 'toll: 100');
  assert.equal(editField('insure: premium 6 attach 65 limit 30', 'attach', '60'),
    'insure: premium 6 attach 60 limit 30');
  assert.equal(editField('merchant: 60..180', 'merchantLo', '55'), 'merchant: 55..180');
  assert.equal(editField('merchant: 60..180', 'merchantHi', '200'), 'merchant: 60..200');
});

test('rewrites round-trip through the parser', () => {
  const line = editField('floor: 70 share 60% fee 5 "Optimiser"', 'share', '75');
  const m = parse('merchant: 60..180\n' + line);
  assert.equal(m.structures[0].params.share, 0.75);
  assert.equal(m.structures[0].label, 'Optimiser');   // label untouched
});

test('unknown field or unmatched line returns the line unchanged', () => {
  assert.equal(editField('toll: 95', 'share', '75'), 'toll: 95');
  assert.equal(editField('floor: 70', 'nope', '1'), 'floor: 70');
});
