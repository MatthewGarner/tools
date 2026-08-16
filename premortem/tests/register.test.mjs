import {test} from 'node:test';
import assert from 'node:assert/strict';
import {newEntry, exposure, ranked, staleness, mergeEntries, promote, markdown,
        serialise, deserialise, exampleDoc, isRisk, isOpportunity, isScoreable, modeOf} from '../register.js';
import {canAdvance} from '../wizard.js';

const risk = (text, p, impact) => ({...newEntry(text), p, impact});

test('markdown exports risks only — a scoreable board item never leaks in', () => {
  const rs = [risk('real risk', [30, 50], [100, 200]),
    {...newEntry('lurking assumption'), kind: 'assumption', p: [40, 60], impact: [10, 20]}];  // scoreable but not a risk (only via import)
  const md = markdown({title: 'T', unit: '£k', entries: rs}, exposure(rs, {seed: 1}), new Date());
  assert.match(md, /real risk/);
  assert.ok(!md.includes('lurking assumption'), 'board items never appear in the markdown register');
});

test('exposure: hand-checkable medians and ordering', () => {
  const rs = [risk('big', [40, 60], [100, 200]), risk('small', [5, 15], [10, 30])];
  const exp = exposure(rs, {seed: 1, nsim: 4000});
  const big = exp.get(rs[0].id), small = exp.get(rs[1].id);
  assert.ok(big.p50 > 60 && big.p50 < 90);        // ~0.5 × ~150
  assert.ok(small.p50 < 5);
  assert.ok(big.p10 < big.p50 && big.p50 < big.p90);
  assert.ok(exp.portfolio.p50 > big.p50);          // sum beats any single risk
});
test('exposure is seeded-deterministic', () => {
  const rs = [risk('x', [10, 30], [50, 100])];
  assert.deepEqual(exposure(rs, {seed: 2}).get(rs[0].id), exposure(rs, {seed: 2}).get(rs[0].id));
});
test('ranked: scored first by median, unscored trail', () => {
  const rs = [newEntry('unscored'), risk('a', [40, 60], [100, 200]), risk('b', [5, 10], [10, 20])];
  const order = ranked(rs, exposure(rs, {seed: 1})).map(e => e.text);
  assert.deepEqual(order, ['a', 'b', 'unscored']);
});
test('scoreability rejects partial and non-finite ranges before Monte Carlo', () => {
  assert.equal(isScoreable({p: [10, 20], impact: [1, 2]}), true);
  assert.equal(isScoreable({p: [10, null], impact: [1, 2]}), false);
  assert.equal(isScoreable({p: [10, 20], impact: [1, Infinity]}), false);
  assert.equal(isScoreable({p: [20, 10], impact: [1, 2]}), false);
  const bad = {...newEntry('partial'), p: [10, null], impact: [1, 2]};
  const exp = exposure([bad], {seed: 1, nsim: 20});
  assert.equal(exp.has(bad.id), false);
  assert.deepEqual(exp.portfolio, {p50: 0, p10: 0, p90: 0});
});
test('staleness thresholds', () => {
  const now = new Date('2026-07-10');
  const at = d => ({...newEntry('x'), lastReviewed: d});
  assert.equal(staleness(at('2026-07-01'), now), 'fresh');
  assert.equal(staleness(at('2026-05-01'), now), 'ageing');
  assert.equal(staleness(at('2026-01-01'), now), 'stale');
  assert.equal(staleness({lastReviewed: null}, now), 'unknown');
});
test('merge absorbs actions and removes src', () => {
  const a = newEntry('a'), b = {...newEntry('b'), actions: [{text: 'act', owner: 'MG', done: false}]};
  const out = mergeEntries([a, b], b.id, a.id);
  assert.equal(out.length, 1);
  assert.equal(out[0].actions.length, 1);
});
test('promote sets kind and ranges', () => {
  const f = {...newEntry('assume'), kind: 'assumption'};
  const r = promote(f, [20, 40], [50, 100]);
  assert.equal(r.kind, 'risk');
  assert.deepEqual(r.p, [20, 40]);
});
test('serialise round-trips and versions', () => {
  const doc = {v: 1, id: 'r1', title: 'T', unit: '£k', question: 'Q', entries: [risk('a', [1,2], [3,4])], phase: 'REGISTER'};
  assert.deepEqual(deserialise(serialise(doc)), doc);
});
test('markdown carries the honest table', () => {
  const rs = [risk('Launch slips', [30, 50], [100, 300])];
  const md = markdown({title: 'Lantern launch', unit: '£k', entries: rs}, exposure(rs, {seed: 1}), new Date());
  assert.match(md, /Launch slips/);
  assert.match(md, /30–50%/);
  assert.match(md, /£k/);
});

test('pre-parade exports deliberate opportunities without risk arithmetic or a portfolio', () => {
  const opportunities = [
    {...newEntry('Keep the old onboarding available', {kind: 'opportunity', essential: true}), actions: [{text: 'Run an A/B cutover', owner: 'Alex', votes: 3}]},
    {...newEntry('Coach the first cohort', {kind: 'opportunity'}), actions: []},
    {...newEntry('board fact', {kind: 'fact'}), p: [90, 100], impact: [1, 2]},
  ];
  const md = markdown({mode: 'success', title: 'Lantern win', question: 'What did we do?', entries: opportunities}, exposure([], {seed: 1}), new Date());
  assert.match(md, /Success register/);
  assert.match(md, /Must make true/);
  assert.match(md, /Run an A\/B cutover/);
  assert.ok(!md.includes('Portfolio exposure'));
  assert.ok(!md.includes('Likelihood'));
  assert.ok(!md.includes('board fact'));
  assert.equal(isOpportunity(opportunities[0]), true);
  assert.equal(modeOf({}), 'risk', 'legacy documents remain premortems');
});

test('exampleDoc: a framed, fully-scored, rankable first-run register', () => {
  const d = exampleDoc();
  assert.ok(d.title.trim() && d.question.trim(), 'effort + question named');
  assert.equal(canAdvance({...d, phase: 'FRAME'}).ok, true, 'passes the FRAME gate (no nag)');
  assert.ok(d.entries.length >= 4, 'several risks');
  assert.ok(d.entries.every(isRisk), 'every entry is a risk');
  assert.ok(d.entries.every(e => Array.isArray(e.p) && Array.isArray(e.impact)), 'every risk is scored');
  const exp = exposure(d.entries, {seed: 1});
  assert.ok(exp.get(d.entries[0].id).p50 > 0, 'exposure computes a positive median');
  assert.equal(ranked(d.entries, exp).length, d.entries.length, 'all risks rank');
});
