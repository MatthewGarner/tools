import {test} from 'node:test';
import assert from 'node:assert/strict';
import {parse, complete} from '../parse.js';

const FULL = `title: T
battery: 100MW / 200MWh
spread: 35..85
charge: 15..45
second: 35..60%
drift: -4..0 %/yr
rte: 86..90%
fade: 0.006..0.012 %/cycle
calendar: 1.0..1.8 %/yr
cycles: 6000 over 15yr
augment: 120..180 £/kWh
discount: 7..10%`;

test('full model parses with normalised units', () => {
  const m = parse(FULL);
  assert.deepEqual(m.battery, {mw: 100, mwh: 200});
  assert.deepEqual(m.spread, {lo: 35, hi: 85});
  assert.deepEqual(m.second, {lo: 0.35, hi: 0.60});
  assert.deepEqual(m.drift, {lo: -0.04, hi: 0});
  assert.deepEqual(m.rte, {lo: 0.86, hi: 0.90});
  assert.ok(Math.abs(m.fade.lo - 6e-5) < 1e-12 && Math.abs(m.fade.hi - 1.2e-4) < 1e-12);
  assert.ok(Math.abs(m.calendar.lo - 0.010) < 1e-12 && Math.abs(m.calendar.hi - 0.018) < 1e-12);
  assert.deepEqual(m.cycles, {budget: 6000, years: 15});
  assert.deepEqual(m.augment, {lo: 120000, hi: 180000});
  assert.deepEqual(m.discount, {lo: 0.07, hi: 0.10});
  assert.equal(m.chargeDefaulted, false);
  assert.ok(complete(m));
  assert.deepEqual(m.warnings, []);
  assert.equal(m.srcLines.spread, 2);
});

test('required lines missing → listed, no hard error', () => {
  const m = parse('spread: 35..85');
  assert.ok(!complete(m));
  assert.deepEqual(m.missing.sort(), ['battery', 'calendar', 'cycles', 'fade', 'rte']);
});

test('charge defaults to 45% of spread P50 with a warning; drift omission warns', () => {
  const m = parse('battery: 100MW / 200MWh\nspread: 35..85\nrte: 88%\nfade: 0.01 %/cycle\ncalendar: 1.5 %/yr\ncycles: 6000 over 15yr');
  const p50 = Math.sqrt(35 * 85);
  assert.ok(Math.abs(m.charge.lo - 0.45 * p50) < 1e-9 && m.charge.lo === m.charge.hi);
  assert.ok(m.chargeDefaulted);
  assert.ok(m.warnings.some(w => w.includes('charge')));
  assert.ok(m.warnings.some(w => w.includes('flatter')));
  assert.deepEqual(m.rte, {lo: 0.88, hi: 0.88});
});

test('optional bands: second/augment absent → null, no warning about them', () => {
  const m = parse('battery: 1MW / 2MWh\nspread: 35..85\ncharge: 20\ndrift: 0\nrte: 88%\nfade: 0.01 %/cycle\ncalendar: 1.5 %/yr\ncycles: 6000 over 15yr');
  assert.equal(m.second, null);
  assert.equal(m.augment, null);
  assert.ok(!m.warnings.some(w => w.includes('second') || w.includes('augment')));
});

test('soft warnings: inverted range, fade 0, efficiency penalty > spread, unknown key, horizon > 30', () => {
  // genuinely underwater: k = (1/0.88−1)·90 ≈ £12.3 exceeds the ~£9.8 spread
  const m = parse(['battery: 100MW / 200MWh', 'spread: 12..8', 'charge: 90', 'drift: 0',
    'rte: 88%', 'fade: 0 %/cycle', 'calendar: 1.5 %/yr', 'cycles: 6000 over 40yr',
    'nonsense: 12'].join('\n'));
  assert.deepEqual(m.spread, {lo: 8, hi: 12});
  for(const frag of ['inverted', 'free cycling', 'efficiency penalty', 'don’t know', '30'])
    assert.ok(m.warnings.some(w => w.includes(frag)), 'want: ' + frag + ' got ' + JSON.stringify(m.warnings));
});

test('no FALSE underwater warning on a profitable model (Fable I1: compare k, not charge, to spread)', () => {
  // charge £90 » spread ~£54.5, but k = (1/0.88−1)·90 ≈ £12.3 « £54.5 → profitable
  const m = parse(['battery: 100MW / 200MWh', 'spread: 35..85', 'charge: 90',
    'rte: 88%', 'fade: 0.01 %/cycle', 'calendar: 1.5 %/yr', 'cycles: 6000 over 20yr'].join('\n'));
  assert.ok(!m.warnings.some(w => w.includes('efficiency penalty') || w.includes('charging costs')),
    'a profitable model must not warn: ' + JSON.stringify(m.warnings));
});
