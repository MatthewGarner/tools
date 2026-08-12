import {test} from 'node:test';
import assert from 'node:assert/strict';
import {parse as gparse} from '../parse.js';
import {sessionStats, delphiStats} from '../engine.js';
import {fermiHandoff, fermiHandoffIssue, slugVar} from '../handoff.js';
import {gaugeHandoff} from '../../map/handoff.js';
import {parse as mparse} from '../../map/parse.js';
import {resolve} from '../../map/zones.js';
import {readout} from '../../map/readout.js';
import {unpackScen} from '../../fermi/state.js';

test('slugVar: case, symbols, digit-first, length cap, dedupe', () => {
  const taken = new Set();
  assert.equal(slugVar('Weeks to migrate billing?', taken), 'weeks_to_migrate_billing');
  assert.equal(slugVar('Weeks to migrate billing!', taken), 'weeks_to_migrate_billing_2');
  assert.equal(slugVar('90-day retention', taken), 'q_90_day_retention');
  assert.equal(slugVar('!!!', taken), 'x');
});

test('fermiHandoff: range questions become a review-needed Fermi draft; prob questions are skipped', () => {
  const model = gparse('Ship it :: prob\nWeeks to migrate :: range weeks\nActive teams :: range teams');
  const responses = [
    {values: [70, [4, 8], [3, 6]]},
    {values: [40, [6, 12], [2, 9]]},
  ];
  const h = fermiHandoff(model, sessionStats(model, responses));
  assert.deepEqual(Object.keys(h.v), ['weeks_to_migrate', 'active_teams']);
  assert.deepEqual(h.v.weeks_to_migrate, ['4', '12', 'auto']);   // pooled envelope
  assert.equal(h.f, '');                              // never invent a causal formula
  assert.deepEqual(h.p.weeks_to_migrate, {
    kind: 'gauge', label: 'Weeks to migrate', question: 'Weeks to migrate', unit: 'weeks',
    round: 1, responses: 2, pooling: 'envelope', status: 'needs-restatement',
  });
  /* round-trips through Fermi's own target-state contract */
  const state = unpackScen(h);
  assert.equal(state.vars.get('weeks_to_migrate').base.status, 'needs-restatement');
});

test('fermiHandoff: Delphi pooled range wins when a second round ran', () => {
  const model = gparse('Weeks to migrate :: range weeks');
  const r1 = [{who: 'a1', values: [[4, 8]]}, {who: 'b2', values: [[10, 20]]}];
  const r2 = [{who: 'a1', values: [[6, 9]]}, {who: 'b2', values: [[8, 12]]}];
  const h = fermiHandoff(model, sessionStats(model, r1), delphiStats(model, r1, r2));
  assert.deepEqual(h.v.weeks_to_migrate, ['7', '10.5', 'auto']);   // medians of finals
  assert.deepEqual(h.p.weeks_to_migrate, {
    kind: 'gauge', label: 'Weeks to migrate', question: 'Weeks to migrate', unit: 'weeks',
    round: 2, responses: 2, pooling: 'median-endpoints', status: 'needs-restatement',
  });
});

test('fermiHandoff: nothing to send → null; large values get suffixes', () => {
  const probOnly = gparse('Ship it :: prob');
  assert.equal(fermiHandoff(probOnly, sessionStats(probOnly, [{values: [50]}])), null);
  const big = gparse('Daily actives :: range users');
  const h = fermiHandoff(big, sessionStats(big, [{values: [[80000, 2000000]]}]));
  assert.deepEqual(h.v.daily_actives, ['80k', '2M', 'auto']);
});

test('fermiHandoff: refuses rather than silently losing an oversized source receipt', () => {
  const tooLong = 'Q'.repeat(181);
  const model = gparse(tooLong + ' :: range weeks');
  assert.equal(fermiHandoff(model, sessionStats(model, [{values: [[4, 8]]}])), null);
  assert.match(fermiHandoffIssue(model), /too long/);
});

test('gaugeHandoff: flagged items become prob questions that gauge itself parses', () => {
  const m = mparse('preset: assumptions\ntitle: Habitat — launch assumptions\nUsers will log daily @ 20,80\nSafe thing @ 80,20\nRisky pay claim @ 30,90');
  const r = resolve(m);
  const doc = gaugeHandoff(m, readout(m, r));
  assert.ok(doc.includes('title: Habitat — launch assumptions — room prior'));
  assert.ok(doc.includes('does not replace a test'));
  const back = gparse(doc);
  assert.equal(back.questions.length, 2);              // the two test-first flags
  assert.ok(back.questions.every(q => q.type === 'prob'));
  assert.ok(back.questions.some(q => q.text === 'Users will log daily'));
});

test('gaugeHandoff: flags from other map methods never become invented probability questions', () => {
  for(const src of [
    'preset: risk\nUnowned severe @ 80,90',
    'preset: stakeholders\nUnread executive @ 20,85',
    'preset: skills\nOne-brain critical skill @ 20,90',
    'preset: rag\nGreen claim on weak evidence @ 20,20 :: reported: green',
  ]){
    const m = mparse(src);
    const r = resolve(m);
    assert.ok(readout(m, r).flagged.length, src);
    assert.equal(gaugeHandoff(m, readout(m, r)), null, src);
  }
});

test('gaugeHandoff: nothing flagged → null', () => {
  const m = mparse('preset: assumptions\nWell tested @ 80,20');
  const r = resolve(m);
  assert.equal(gaugeHandoff(m, readout(m, r)), null);
});
