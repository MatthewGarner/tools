import {test} from 'node:test';
import assert from 'node:assert/strict';
import {defaultGenerators, setRenewShare, setGasPrice, setMustRun,
  generatorsFromPreset, PRESETS} from '../state.js';

/* app.js never composes a dial vector through one function — it wires each
   dial straight to its setter (setRenewShare/setGasPrice/setMustRun), applied
   incrementally to state.generators, so per-plant advanced edits on the
   non-dialed plants survive a dial move. These tests exercise that REAL
   path — not a parallel composition helper — by applying the same three
   setters app.js calls, in the same order, to a fresh defaultGenerators(). */

test('the dial-setter path reproduces the typical preset\'s generators', () => {
  const gens = defaultGenerators();
  setRenewShare(gens, 15);
  setGasPrice(gens, 60);
  setMustRun(gens, false, 30);
  assert.deepEqual(gens, generatorsFromPreset(PRESETS.typical));
});

test('the dial-setter path reproduces the negative preset (must-run on, bidding below zero)', () => {
  const gens = defaultGenerators();
  setRenewShare(gens, 25);
  setGasPrice(gens, 60);
  setMustRun(gens, true, 30);
  assert.deepEqual(gens, generatorsFromPreset(PRESETS.negative));
});
