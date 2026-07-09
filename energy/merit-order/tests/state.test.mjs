import {test} from 'node:test';
import assert from 'node:assert/strict';
import {encodeStateV2, decodeStateV2} from '../state.js';
import {DEFAULT_PARAMS} from '../scenarios.js';

test('v2 round-trips condition + params + adv', () => {
  const s = {condition: 'gasSpike', params: {...DEFAULT_PARAMS, gas: 250}, adv: {'BESS': [10, 20]}};
  const back = decodeStateV2(encodeStateV2(s));
  assert.equal(back.condition, 'gasSpike');
  assert.equal(back.params.gas, 250);
  assert.deepEqual(back.adv['BESS'], [10, 20]);
});

test('v2 with no hand-edits omits adv and decodes to empty', () => {
  const enc = encodeStateV2({condition: null, params: DEFAULT_PARAMS, adv: {}});
  assert.equal(enc.adv, undefined);
  const back = decodeStateV2(enc);
  assert.deepEqual(back.adv, {});
});

test('a v1 hash decodes to null (caller falls back to the v2 default) — no crash', () => {
  const v1 = {v: 1, p: {Renewables: [15, 0, 0], CCGT: [25, 60, 0]}, d: 40};
  assert.equal(decodeStateV2(v1), null);
});

test('malformed / wrong version → null', () => {
  assert.equal(decodeStateV2(null), null);
  assert.equal(decodeStateV2({v: 99}), null);
  assert.equal(decodeStateV2({v: 2}), null);   // missing params
});
