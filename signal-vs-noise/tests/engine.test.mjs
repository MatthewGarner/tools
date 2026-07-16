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

/* ---------- Task 2: scoring (grade the decision, not the outcome) ---------- */
import {scoreCalls, verdict, evidenceRun} from '../engine.js';

const firstExcursionCalls = s => {   // act on each person's FIRST out-of-band point (single-point evidence)
  const c = [];
  for(let p = 0; p < s.people; p++) for(let q = 0; q < s.quarters; q++)
    if(s.shown[p][q] < s.band.lo || s.shown[p][q] > s.band.hi){ c.push({person: p, quarter: q}); break; }
  return c;
};

test('NOT resulting: acting on single-point spikes does not earn a clean scorecard even when it bags the signal (C1)', () => {
  const s = makeScenario(42);
  const sc = scoreCalls(s, firstExcursionCalls(s));
  assert.ok(sc.falseAlarms >= 1, 'the noise spikes (Dot 23, Fin 9) are false alarms');
  assert.ok(sc.caught, 'the single-point Ben grab is recorded as a catch…');            // M-a
  assert.equal(sc.caught.tag, 'lucky', '…but tagged LUCKY, not clean — a coin flip that happened to be right');
  assert.ok(sc.coinFlip >= sc.defensible, 'single-point acts are coin-flips');
});

test('hold everything → miss + zero false alarms', () => {
  const sc = scoreCalls(makeScenario(42), []);
  assert.equal(sc.falseAlarms, 0); assert.equal(sc.caught, null);
});

test('perfect play (act on the 2nd consecutive decline excursion) → clean catch, no false alarms', () => {
  const s = makeScenario(42);
  const sc = scoreCalls(s, [{person: s.signalPerson, quarter: s.firstCatchable}]);
  assert.equal(sc.falseAlarms, 0); assert.equal(sc.caught.tag, 'clean');
});

test('C-B: an in-band act during the decline is NOT clean (zero evidence ≠ a good call)', () => {
  // synthetic: person 0 declines from q3, but q3 luckily bounces INTO the band
  const band = {lo: 10, hi: 22};
  const s = {people: 2, quarters: 6, names: ['A', 'B'], signalPerson: 0, signalQuarter: 3, firstCatchable: 4,
    band, shown: [[16, 15, 17, 12, 5, 4], [16, 15, 17, 15, 16, 15]]};   // A: q3=12 in-band, q4/q5 below
  const sc = scoreCalls(s, [{person: 0, quarter: 3}]);
  assert.equal(sc.caught.tag, 'lucky', 'an in-band gut call is a coin flip, not a clean catch');
  assert.equal(sc.perCall[0].quality, 'coin-flip');
});

test('C-C symmetry: equal evidence → equal quality, opposite outcome by truth', () => {
  const s = makeScenario(28);   // Eve has a noise 2-run (q1-2 below band); Cy is the signal, catchable
  const eve = s.names.indexOf('Eve');
  assert.equal(evidenceRun(s, eve, 2), 2, 'Eve q2 is a genuine 2-run');
  const noiseCall = scoreCalls(s, [{person: eve, quarter: 2}]).perCall[0];
  const sigCall = scoreCalls(s, [{person: s.signalPerson, quarter: s.firstCatchable}]).perCall[0];
  assert.equal(noiseCall.quality, 'defensible');            // a 2-run act is a good decision…
  assert.equal(sigCall.quality, 'defensible');              // …the same, whoever it's on
  assert.equal(noiseCall.outcome, 'falseAlarm');            // but the truth differs
  assert.equal(sigCall.outcome, 'caught');
});

test('I6 detectability-aware: undetectable seed + no calls says nobody could know; detectable + no calls says missed', () => {
  const hard = makeScenario(11);                             // firstCatchable === null
  assert.equal(hard.firstCatchable, null);
  assert.match(verdict(hard, []).line, /nobody could know|unspottable|couldn.t/i);
  assert.match(verdict(makeScenario(42), []).line, /missed/i);
});

test('I5 verdict leads with ACTS, never the 48-cell denominator', () => {
  const v = verdict(makeScenario(42), [{person: 3, quarter: 3}, {person: 5, quarter: 4}]);
  assert.match(v.line, /conversation/i);
  assert.doesNotMatch(v.line, /correct|of 48|%/);
});

/* ---------- Task 3: reveal + funnel ---------- */
import {revealFor, funnelRatio} from '../engine.js';

test('reveal fires for BOTH branches, direction per kind, never contradicts the draws (C2)', () => {
  const seen = new Set();
  for(let seed = 1; seed <= 40; seed++){ const s = makeScenario(seed); const mid = (s.band.lo + s.band.hi) / 2;
    for(let p = 0; p < s.people; p++) for(let q = 0; q < s.quarters - 1; q++){
      const r = revealFor(s, p, q); if(r.next === null) continue;
      const cur = s.shown[p][q], kind = cur >= mid ? 'praise' : 'warn';
      assert.equal(r.kind, kind);
      if(r.next === cur) assert.equal(r.regressed, 'held');
      else if(kind === 'praise') assert.equal(r.regressed, r.next < cur);
      else assert.equal(r.regressed, r.next > cur);
      seen.add(kind + ':' + r.regressed);
    }}
  for(const c of ['praise:true', 'praise:false', 'warn:true', 'warn:false']) assert.ok(seen.has(c), 'missing branch ' + c);
  assert.ok([...seen].some(x => x.endsWith(':held')), 'a flat/held case must occur');
});

test('reveal leaks no ground truth (illusion copy only — I1)', () => {
  for(let seed = 1; seed <= 20; seed++){ const s = makeScenario(seed);
    for(let p = 0; p < s.people; p++) for(let q = 0; q < s.quarters - 1; q++){
      const r = revealFor(s, p, q);
      if(r.illusion) assert.doesNotMatch(r.illusion, /true mean|really|actually|signal|declin/i);
    }}
});

test('funnel: reviewed-gap variance ~doubles across seeds; degenerate → analytic phrase (I4)', () => {
  let ok = 0;
  for(let seed = 1; seed <= 300; seed++){ const f = funnelRatio(makeScenario(seed));
    if(f.ratio === null) assert.match(f.phrase, /2×|rule 2/i);
    else { assert.ok(f.ratio > 1); ok++; } }
  assert.ok(ok > 250, 'the doubling shows on the vast majority of seeds, got ' + ok);
});

test('scoreCalls + funnel read only shown+band (invariant to garbage outputs — I4)', () => {
  const s = makeScenario(42), g = {...s, outputs: s.outputs.map(r => r.map(() => 999))};
  const calls = [{person: s.signalPerson, quarter: s.firstCatchable}, {person: 3, quarter: 3}];
  assert.deepEqual(scoreCalls(g, calls), scoreCalls(s, calls));
  assert.deepEqual(funnelRatio(g), funnelRatio(s));
});

/* ---------- Task 4: authored scenario + edges ---------- */
import {AUTHORED_SEED} from '../engine.js';

test('authored scenario forces BOTH illusions + a catchable real decline (M6)', () => {
  const s = makeScenario(AUTHORED_SEED);
  assert.equal(s.names[s.signalPerson], 'Ben');
  assert.ok(s.firstCatchable !== null, 'the real decline is catchable');
  let praiseTrap = false, warnTrap = false;
  for(let p = 0; p < s.people; p++){ if(p === s.signalPerson) continue;
    for(let q = 0; q < s.quarters - 1; q++){
      const r = revealFor(s, p, q);
      if(s.shown[p][q] > s.band.hi && r.regressed === true && r.kind === 'praise') praiseTrap = true;
      if(s.shown[p][q] < s.band.lo && r.regressed === true && r.kind === 'warn') warnTrap = true;
    }}
  assert.ok(praiseTrap, 'a tempting high spike that regresses → praise-backfires illusion');
  assert.ok(warnTrap, 'a tempting low spike that bounces → tough-love-works illusion');
});

test('edges: all-acts, and scoring on an undetectable scenario', () => {
  const s = makeScenario(42);
  const all = []; for(let p = 0; p < s.people; p++) for(let q = 0; q < s.quarters; q++) all.push({person: p, quarter: q});
  const sc = scoreCalls(s, all);
  assert.ok(sc.falseAlarms > 30 && sc.caught, 'all-acts flags every noise cell + the signal');
  const hard = makeScenario(11);
  assert.equal(scoreCalls(hard, []).caught, null);
  assert.match(verdict(hard, []).line, /nobody could know/i);
});
