import {test} from 'node:test';
import assert from 'node:assert/strict';
import {parse as gparse} from '../parse.js';
import {sessionStats, delphiStats} from '../engine.js';
import {fermiHandoff, fermiHandoffIssue, portableFermiNumber, slugVar} from '../handoff.js';
import {GAUGE_HANDOFF_TEXT_POLICY, gaugeHandoff, gaugeHandoffIssue} from '../../map/handoff.js';
import {parse as mparse} from '../../map/parse.js';
import {resolve} from '../../map/zones.js';
import {readout} from '../../map/readout.js';
import {unpackScen} from '../../fermi/state.js';
import {tokenize, parse as fparse, collectVars} from '../../fermi/engine.js';
import {gaugeImport} from '../import-state.js';
import {handoffHref, handoffMeta, validHandoffMeta, withoutHandoffMeta, targetHashState} from '../../assets/handoff.js';
import {readFileSync} from 'node:fs';
import {GAUGE_FERMI_PROVENANCE_STRESS} from '../../dev/semantic-stress.mjs';

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

test('fermiHandoff: nothing or private n=1 ranges refuse; exact portable decimals round-trip', () => {
  const probOnly = gparse('Ship it :: prob');
  assert.equal(fermiHandoff(probOnly, sessionStats(probOnly, [{values: [50]}])), null);
  const big = gparse('Daily actives :: range users');
  assert.equal(fermiHandoff(big, sessionStats(big, [{values: [[80000, 2000000]]}])), null);
  assert.match(fermiHandoffIssue(big, sessionStats(big, [{values: [[80000, 2000000]]}])), /at least 2/);
  const h = fermiHandoff(big, sessionStats(big, [
    {values:[[80000.125, 2000000.75]]}, {values:[[80000.125, 2000000.75]]},
  ]));
  assert.deepEqual(h.v.daily_actives, ['80000.125', '2000000.75', 'auto']);
  const unpacked = unpackScen(h).vars.get('daily_actives');
  assert.equal(Number(unpacked.lo), 80000.125);
  assert.equal(Number(unpacked.hi), 2000000.75);
});

test('fermiHandoff: an unanswered range is named as unanswered, not as a privacy redaction', () => {
  /* The shipped "Q3 commitment review" shape: two range questions, and a room
     that answered only the first. n=0 carries no privacy exposure — there is
     nothing to expose — so the refusal must not blame aggregate privacy. */
  const model = gparse(`Ship the referral loop :: prob
Weeks to migrate billing :: range weeks
Active teams at end of quarter :: range teams`);
  const stats = sessionStats(model, [
    {values: [80, [4, 8], null]},
    {values: [20, [30, 50], null]},
  ]);
  const issue = fermiHandoffIssue(model, stats);
  assert.match(issue, /unanswered/, 'an unanswered range must say so');
  assert.doesNotMatch(issue, /privacy/, 'nothing was disclosed, so privacy cannot be the reason');
  assert.doesNotMatch(issue, /no aggregate/, 'the answered range DOES have an aggregate; all-or-nothing is what blocks it');
  assert.equal(fermiHandoff(model, stats), null, 'D1: the refusal itself stays all-or-nothing');

  /* A count that cannot be read is not an unanswered question either. Defensive
     today — sessionStats clamps n — but the whole point of this branching is
     that each refusal states something true. */
  for(const unreadable of [NaN, -1, 2.5, undefined, '3', Infinity]){
    const reason = fermiHandoffIssue(model, [{n: 2, pooled: {lo: 4, hi: 8}}, {n: unreadable}, {n: unreadable}]);
    assert.match(reason, /unreadable response count/, `n=${String(unreadable)} must not claim to be unanswered`);
  }
});

test('portable Fermi bounds never round, suffix, exponentiate, or serialize non-finite values', () => {
  for(const value of [0, -0.000000000001, 0.1, -42.125, 999999999999999]){
    const text = portableFermiNumber(value);
    assert.equal(Number(text), value);
    assert.doesNotMatch(text, /[eEkKmMbBtT]/);
  }
  for(const value of [Infinity, -Infinity, NaN, 1e100]) assert.equal(portableFermiNumber(value), null);
});

test('fermiHandoff: refuses rather than silently losing a non-normalizable source receipt', () => {
  for(const scenario of GAUGE_FERMI_PROVENANCE_STRESS){
    const model = gparse(scenario.source);
    const stats = sessionStats(model, [{values:[[4, 8]]}, {values:[[5, 9]]}]);
    assert.equal(fermiHandoff(model, stats), null, scenario.id);
    assert.match(fermiHandoffIssue(model, stats), scenario.issue, scenario.id);
  }
});

test('gaugeHandoff: flagged items become prob questions that gauge itself parses', () => {
  const m = mparse('preset: assumptions\ntitle: Lantern — launch assumptions\nUsers will log daily @ 20,80\nSafe thing @ 80,20\nRisky pay claim @ 30,90');
  const r = resolve(m);
  const doc = gaugeHandoff(m, readout(m, r));
  assert.ok(doc.includes('title: Lantern — launch assumptions — room prior'));
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

test('gaugeHandoff: refusal reasons are explicit and oversized drafts never truncate in Gauge', () => {
  const risk = mparse('preset: risk\nSevere unowned @ 90,90');
  assert.match(gaugeHandoffIssue(risk, readout(risk, resolve(risk))), /Only an assumption Map/);
  const overflow = mparse('preset: assumptions\n' +
    Array.from({length:21}, (_, index) => `Flag ${index + 1} @ 20,80`).join('\n'));
  const report = readout(overflow, resolve(overflow));
  assert.match(gaugeHandoffIssue(overflow, report), /at most 20 questions/);
  assert.equal(gaugeHandoff(overflow, report), null);
});

test('gaugeHandoff: C0, C1, and Unicode format controls are stripped under bounded text policy', () => {
  const title = 'Control\u0000 C1\u0085 bidi\u202e title ' + 'T'.repeat(180);
  const label = 'Question\u0007 C1\u009f join\u200d mark ' + 'Q'.repeat(300);
  const doc = gaugeHandoff({preset:'assumptions', title}, {flagged:[{item:{label}}]});
  assert.doesNotMatch(doc, /[\u0000-\u0009\u000b-\u001f\u007f-\u009f\p{Cf}]/u);
  const parsed = gparse(doc);
  assert.equal(Array.from(parsed.title.replace(/ — room prior$/, '')).length,
    GAUGE_HANDOFF_TEXT_POLICY.titleCodePoints);
  assert.equal(Array.from(parsed.questions[0].text).length,
    GAUGE_HANDOFF_TEXT_POLICY.questionCodePoints);
  assert.match(parsed.questions[0].text, /^Question C1 join mark/);
});

test('gaugeHandoff: a control-only flagged label is refused instead of opening an invalid draft', () => {
  const model = {preset:'assumptions', title:'Controls'};
  const report = {flagged:[{item:{label:'\u0000\u0085\u202e'}}]};
  assert.match(gaugeHandoffIssue(model, report), /no portable question text/);
  assert.equal(gaugeHandoff(model, report), null);
});

test('handoff metadata is bounded, validated and size-capped', async () => {
  const meta = handoffMeta('map', 'question-set', 'Lantern\n\u0000assumptions');
  assert.deepEqual(meta, {v:1, mode:'draft', from:'map', kind:'question-set', label:'Lantern  assumptions'});
  assert.equal(validHandoffMeta({...meta, from:'evil'}, {from:'map'}), null);
  assert.equal(await handoffHref('/gauge/', {t:'A :: prob'}, meta, 5), null);
  assert.match(await handoffHref('/gauge/', {t:'A :: prob'}, meta), /^\/gauge\/#z:/);
  assert.equal(await handoffHref('https://example.test/', {t:'A'}, meta), null);
  assert.equal(validHandoffMeta({...meta, v:2}), null);
  assert.equal(validHandoffMeta({...meta, mode:'sync'}), null);
  assert.deepEqual(withoutHandoffMeta({t:'edited', x:meta, e:0}), {t:'edited', e:0},
    'normal target URL writes cannot retain import provenance');
  assert.deepEqual(targetHashState({t:'edited', x:{bad:true}}, meta), {t:'edited', x:meta},
    'transient edits keep validated provenance in their reloadable URL');
});

test('Map → Gauge import requires provenance and target-parseable questions', () => {
  const x = handoffMeta('map', 'question-set', 'Map title');
  assert.equal(gaugeImport({t:'title: empty', x}), null);
  assert.equal(gaugeImport({t:'A :: prob'}), null);
  assert.equal(gaugeImport({t:'A :: prob', x:{...x, from:'gauge'}}), null);
  const inbound = gaugeImport({t:'A :: prob', x});
  assert.equal(inbound.meta.label, 'Map title');
  assert.equal(gparse(inbound.text).questions[0].text, 'A');
});

test('Map labels cannot inject Gauge DSL delimiters or lines', () => {
  const doc = gaugeHandoff({preset:'assumptions', title:'Lantern\nnames: on'},
    {flagged:[{item:{label:'Bad :: range weeks\nInjected :: chips A | B'}}]});
  const back = gparse(doc);
  assert.equal(back.questions.length, 1);
  assert.equal(back.questions[0].type, 'prob');
  assert.equal(back.names, false);
});

test('Map labels leading with every Gauge config key remain readable probability questions', () => {
  const labels = [
    'title: launch decision',
    'Names : off',
    'PALETTE: ember',
    'accent : #123456',
    'verdict: off',
  ];
  const doc = gaugeHandoff({preset:'assumptions', title:'Reserved forms'}, {
    flagged: labels.map(label => ({item:{label}})),
  });
  const parsed = gparse(doc);
  assert.deepEqual(parsed.questions.map(question => question.text),
    labels.map(label => 'Assumption — ' + label));
  assert.equal(parsed.questions.length, labels.length);
  assert.ok(parsed.questions.every(question => question.type === 'prob'));
  assert.deepEqual(parsed.warnings, []);
});

test('Map comment-looking labels and title text survive the Gauge round trip', () => {
  const labels = ['   // verify retention', '\u202e   // challenge pricing'];
  const doc = gaugeHandoff({preset:'assumptions', title:'Launch // dissent // room'}, {
    flagged: labels.map(label => ({item:{label}})),
  });
  const parsed = gparse(doc);
  assert.equal(parsed.title, 'Launch ∕∕ dissent ∕∕ room — room prior');
  assert.deepEqual(parsed.questions.map(question => [question.text, question.type]), [
    ['Assumption — // verify retention', 'prob'],
    ['Assumption — // challenge pricing', 'prob'],
  ]);
  assert.equal(parsed.questions.length, labels.length);
  assert.deepEqual(parsed.warnings, []);
});

test('Map handoff overflow status is visible, not screen-reader-only', () => {
  const html = readFileSync(new URL('../../map/index.html', import.meta.url), 'utf8');
  assert.match(html, /id="handoffstatus"[^>]*role="status"/);
  assert.doesNotMatch(html.match(/<span[^>]*id="handoffstatus"[^>]*>/)[0], /sr-only/);
});
