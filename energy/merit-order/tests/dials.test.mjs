import {test} from 'node:test';
import assert from 'node:assert/strict';
import {generatorsFromDials, generatorsFromPreset, PRESETS} from '../state.js';

test('generatorsFromDials reproduces generatorsFromPreset for the typical preset\'s dial values', () => {
  const gens = generatorsFromDials({renew: 15, gas: 60, mustrun: false, depth: 30});
  assert.deepEqual(gens, generatorsFromPreset(PRESETS.typical));
});

test('generatorsFromDials reproduces the negative preset (must-run on, bidding below zero)', () => {
  const gens = generatorsFromDials({renew: 25, gas: 60, mustrun: true, depth: 30});
  assert.deepEqual(gens, generatorsFromPreset(PRESETS.negative));
});
