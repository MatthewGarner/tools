import {test} from 'node:test';
import assert from 'node:assert/strict';
import {parse} from '../parse.js';
import {simulate, verdict, fmtUnit} from '../engine.js';

const FULL = `battery: 100MW / 200MWh
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

const N = {seed: 1, n: 1500};

test('simulate: null when incomplete; full shape when complete', () => {
  assert.equal(simulate(parse('spread: 35..85'), N), null);
  const o = simulate(parse(FULL), N);
  assert.ok(o.threshold.p10 < o.threshold.p50 && o.threshold.p50 < o.threshold.p90);
  assert.ok(o.threshold.bindingShare >= 0 && o.threshold.bindingShare <= 1);
  assert.ok(o.threshold.clearingDays > 0 && o.threshold.clearingDays <= 365);
  assert.equal(o.fan.length, 15);
  assert.ok(o.fan[0].p10 < o.fan[0].p90);
  assert.ok(o.soh[14].p50 < 1);
  assert.ok(o.burndown[0] > o.burndown[14] - 1e-9);
  assert.equal(o.H, 15);
});

test('second: dual-policy difference — second on beats off in revenue, costs wear', () => {
  const o = simulate(parse(FULL), N);
  assert.ok(o.second.dRev > 0, 'second cycle adds gross revenue');
  assert.ok(o.second.dWear > 0, 'and costs wear');
  assert.ok(Math.abs(o.second.dNet - (o.second.dRev - o.second.dWear)) < 1e-6);
  assert.ok(o.second.capped >= 0 && o.second.capped <= 1);
  assert.equal(simulate(parse(FULL.replace('second: 35..60%\n', '')), N).second, null);
});

test('augment: cheap augmentation pulls the window earlier; absurd cost → mostly never', () => {
  const cheap = simulate(parse(FULL.replace('augment: 120..180 £/kWh', 'augment: 20..30 £/kWh')), N);
  const dear = simulate(parse(FULL.replace('augment: 120..180 £/kWh', 'augment: 3000..4000 £/kWh')), N);
  assert.ok(cheap.augment.pNever < 0.5, 'cheap augmentation mostly pays');
  assert.ok(dear.augment.pNever > 0.8, 'absurd cost mostly never');
  assert.ok(cheap.augment.window[0] >= 1 && cheap.augment.window[1] <= 15);
  assert.equal(simulate(parse(FULL.replace('augment: 120..180 £/kWh\n', '')), N).augment, null);
});

test('deterministic under seed', () => {
  const a = simulate(parse(FULL), N), b = simulate(parse(FULL), N);
  assert.deepEqual(a.threshold, b.threshold);
  assert.deepEqual(a.second, b.second);
});

test('verdicts: templates carry the defined numbers', () => {
  const o = simulate(parse(FULL), N);
  const t = verdict('threshold', o);
  assert.match(t, /Cycles are worth £\d/);
  assert.match(t, /only dispatch above/);
  assert.match(t, /runs? (out of|in) 10/);
  const s = verdict('second', o);
  assert.match(s, /second cycle earns £/);
  assert.match(s, /£[\d.]+[kM]?\/yr net/);
  const a = verdict('augment', o);
  assert.match(a, /Augment in years \d+–\d+|Augmentation never pays|coin flip/);
  assert.equal(verdict('second', {...o, second: null}), null);
  assert.equal(fmtUnit(41.2, '£/MWh'), '£41.2/MWh');
});
