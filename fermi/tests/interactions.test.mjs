import test from 'node:test';
import assert from 'node:assert/strict';
import {effectiveHorizon, cashflowHashState, cashflowTailNote} from '../interactions.js';

test('cashflow horizon never claims fewer periods than the entered schedule uses', () => {
  assert.equal(effectiveHorizon(1, 4), 3);
  assert.equal(effectiveHorizon('12', 4), 12);
  assert.equal(effectiveHorizon('bad', 4), 3);
  assert.equal(effectiveHorizon(100, 4), 60);
});

test('cashflow URL state carries the threshold and the effective horizon', () => {
  const state = cashflowHashState({grain: 'year', horizon: 1, rlo: '8', rhi: '12',
    periods: [{lo: '-10', hi: '-8'}, {lo: '2', hi: '4'}, {lo: '3', hi: '5'}],
    debtOn: false}, '250');
  assert.equal(state.h, 2);
  assert.equal(state.ct, '250');
});

test('blank cashflow threshold stays out of compact URL state', () => {
  const state = cashflowHashState({grain: 'month', horizon: 4, rlo: '0', rhi: '0',
    periods: [{lo: '1', hi: '1'}, {lo: '2', hi: '2'}], debtOn: true,
    dscr: '1.3', rd: '6.5', sizingCase: 'central', tenor: '3'}, '');
  assert.equal('ct' in state, false);
  assert.equal(state.ten, '3');
});

test('cashflow tail copy never presents an inverted period range', () => {
  assert.equal(cashflowTailNote(3, 4), 'Entered periods cover the full horizon');
  assert.equal(cashflowTailNote(5, 4), 't4…t5 repeat the t3 range');
});
