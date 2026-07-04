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
