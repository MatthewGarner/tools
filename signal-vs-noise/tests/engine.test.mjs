import {test} from 'node:test';
import assert from 'node:assert/strict';
import {makeScenario} from '../engine.js';

const varOf = a => { const m = a.reduce((x, y) => x + y, 0) / a.length; return a.reduce((x, y) => x + (y - m) ** 2, 0) / a.length; };
const betweenShare = s => {
  const bv = varOf(s.trueMean);
  const within = s.shown.map((r, i) => i === s.signalPerson ? null : varOf(r)).filter(Boolean);
  const wv = within.reduce((x, y) => x + y, 0) / within.length;
  return bv / (bv + wv);
};

/* ---------- Task 1: makeScenario ---------- */

test('deterministic: same seed → identical scenario', () => {
  assert.deepEqual(makeScenario(42), makeScenario(42));
});

test('band is the ORACLE: symmetric around baseMean to 1e-6 (a data-computed band never would be)', () => {
  const s = makeScenario(42);
  assert.ok(Math.abs((s.band.lo + s.band.hi) / 2 - s.params.baseMean) < 1e-6);
  assert.ok(s.band.hi - s.band.lo > 8 && s.band.hi - s.band.lo < 16);   // ~2·2σ_marginal
});

test('noise dominates but not clones: 0.02 < between-share < 0.15 at seed 42, mean < 0.12 over seeds 1–100 (I2/I3)', () => {
  const s42 = betweenShare(makeScenario(42));
  assert.ok(s42 > 0.02 && s42 < 0.15, 'seed42 share ' + s42);
  let sum = 0; for(let seed = 1; seed <= 100; seed++) sum += betweenShare(makeScenario(seed));
  assert.ok(sum / 100 < 0.12, 'mean share ' + sum / 100);
});

test('exactly one sustained signal, and it is REAL IN THE DATA (M-b): post-drop row mean sits ≈ signalDrop below pre-drop', () => {
  const s = makeScenario(42), sp = s.signalPerson, sq = s.signalQuarter;
  const pre = s.outputs[sp].slice(0, sq), post = s.outputs[sp].slice(sq);
  const mean = a => a.reduce((x, y) => x + y, 0) / a.length;
  assert.ok(Math.abs((mean(pre) - mean(post)) - s.signalDrop) < 2.2, 'the decline is really in the data');
  assert.ok(sq >= 3 && sq <= 4, 'biased to ≥4 decline quarters');
});

test('firstCatchable is the first 2-consecutive below-band run in the decline (seed 42 IS catchable — no if-guard)', () => {
  const s = makeScenario(42);
  assert.equal(s.firstCatchable !== null, true, 'seed 42 is a catchable teaching scenario');
  const below = q => s.shown[s.signalPerson][q] < s.band.lo;
  assert.ok(below(s.firstCatchable) && below(s.firstCatchable - 1), 'a real 2-run');
  assert.ok(s.firstCatchable >= s.signalQuarter, 'inside the decline');
});

test('signalDrop is ABSOLUTE, not noise-scaled: cranking noise makes the decline genuinely undetectable (C-A)', () => {
  // same seed, huge noise, same absolute drop ⇒ the drop drowns and firstCatchable goes null on most seeds
  let nulls = 0; for(let seed = 1; seed <= 60; seed++) if(makeScenario(seed, {noiseSd: 9}).firstCatchable === null) nulls++;
  assert.ok(nulls > 40, 'cranked noise should make most scenarios undetectable, got ' + nulls + '/60');
});

test('shown is clamped ≥ 0 (no negative features)', () => {
  for(let seed = 1; seed <= 200; seed++)
    for(const row of makeScenario(seed).shown) for(const v of row) assert.ok(v >= 0);
});
