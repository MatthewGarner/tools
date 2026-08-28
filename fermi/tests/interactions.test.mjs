import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {effectiveHorizon, cashflowHashState, cashflowTailNote, parseCashflowInputs} from '../interactions.js';

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

test('cashflow source grammar keeps amount suffixes out of percentage and debt scalars', () => {
  const parsed = parseCashflowInputs({
    periods: [{lo: '-80k', hi: '-120k'}, {lo: '90k', hi: '40k'}],
    horizon: 4, grain: 'year', rateLower: '12', rateUpper: '8k',
    debtEnabled: true, dscr: '1.4k', costOfDebt: '6.5k', tenor: '3', sizingCase: 'central',
  });

  assert.deepEqual(parsed.errors, []);
  assert.deepEqual(parsed.rate, {lo: 8, hi: 12});
  assert.deepEqual(parsed.periods, [{lo: -120_000, hi: -80_000}, {lo: 40_000, hi: 90_000}]);
  assert.equal(parsed.debt.dscr, 1.4);
  assert.equal(parsed.debt.costOfDebt, 0.065);
});

test('cashflow source grammar refuses a fractional or out-of-range tenor', () => {
  for (const tenor of ['2.5', '61']) {
    const parsed = parseCashflowInputs({
      periods: [{lo: '-10', hi: '-8'}, {lo: '2', hi: '4'}],
      horizon: 2, grain: 'year', rateLower: '8', rateUpper: '12',
      debtEnabled: true, dscr: '1.3', costOfDebt: '6.5', tenor, sizingCase: 'central',
    });
    assert.equal(parsed.spec, null);
    assert.match(parsed.errors.join(' '), /Tenor/);
  }
});

test('the web cashflow form delegates its scalar boundary to the shared source parser', () => {
  const shell = readFileSync(new URL('../app.js', import.meta.url), 'utf8');
  assert.match(shell, /parseCashflowInputs/);
  assert.ok(shell.includes('function cfParse(){\n  return parseCashflowInputs('));
});
