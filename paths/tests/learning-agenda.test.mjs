import assert from 'node:assert/strict';
import {test} from 'node:test';

import {learningAgendaNextAction, learningAgendaProjection} from '../learning-agenda.js';
import {parse} from '../parse.js';
import {project} from '../project.js';

const decision = (name, fields = '') => `decision ${name}:
  question: Should ${name} proceed?
  signal: ${name} threshold
  reading: ${name} reading
  owner: ${name} owner
  answer-by: ${/\n  answer-by:/.test(fields) ? fields.match(/\n  answer-by: ([^\n]+)/)[1] : '2026-08-20'}${fields.replace(/\n  answer-by: [^\n]+/, '')}
`;

const source = `title: Habitat learning agenda
verdict: Keep reversible work moving while the evidence arrives.
${decision('overdue', '\n  answer-by: 2026-08-01')}${decision('high-reach')}${decision('low-reach')}${decision('lonely')}${decision('gate')}${decision('host', '\n  answer: yes 2026-08-10')}${decision('blocked', '\n  when: gate and host')}decision held-broken:
  question: Is held evidence ready?
  owner: Alex
  answer-by: 2026-08-20
  when: gate
${decision('closed-host', '\n  answer: no 2026-08-10')}${decision('moot-child', '\n  when: closed-host')}decision moot-broken:
  question: Is moot evidence ready?
  owner: Alex
  answer-by: 2026-08-20
  when: closed-host
${decision('answered', '\n  answer: yes 2026-08-10')}${decision('assumed', '\n  answer-by: 2026-08-10\n  assume: no 2026-08-11')}decision broken:
  question: Is this complete?
  signal:
  owner: Alex
  answer-by: 2026-08-20
NOW
  Core: Overdue route [if overdue]
  Core: High yes [if high-reach]
  Core: High no [unless high-reach]
  Core: High joint [if high-reach and gate]
  Core: High either [if high-reach or low-reach]
  Core: High history [unless high-reach] [done]
  Core: Low route [unless low-reach]
  Core: Blocked route [if blocked]
  Core: Answered route [if answered]
`;

function fixture(){
  const model = parse(source);
  const projected = project(model, '2026-08-13');
  return learningAgendaProjection(model, projected);
}

test('Learning Agenda ranks only active unanswered questions by urgency, due date, reach and source order', () => {
  const agenda = fixture();
  assert.deepEqual(agenda.active.map(entry => entry.key),
    ['overdue', 'high-reach', 'low-reach', 'gate', 'lonely']);
  assert.ok(agenda.active.find(entry => entry.key === 'high-reach').reach >
    agenda.active.find(entry => entry.key === 'low-reach').reach);
  assert.equal(agenda.initialSelection.key, 'assumed',
    'an in-force assumption is the first attention band because it already steers work while unanswered');
  assert.ok(agenda.active.every(entry => !entry.effectiveAnswer && !entry.assumption &&
    entry.availability === 'active' && !entry.repairEvidence.length));
});

test('Learning Agenda preserves blocked, repair, answered, assumed and moot states without treating them as active work', () => {
  const agenda = fixture();
  assert.deepEqual(agenda.blocked.map(entry => entry.key), ['blocked', 'held-broken']);
  assert.equal(agenda.blocked[0].openingCondition, 'Opens when gate and host.');
  assert.match(agenda.blocked[0].currentState.sentence, /Not open yet.*gate and host/i);
  assert.equal(agenda.blocked[1].currentState.kind, 'dormant');
  assert.ok(agenda.blocked[1].hygiene.some(entry => /Missing signal/.test(entry.sentence)));
  assert.deepEqual(agenda.notReady.map(entry => entry.key), ['broken']);
  assert.ok(agenda.notReady[0].repairEvidence.some(entry => /Missing signal/.test(entry.sentence)));
  assert.deepEqual(agenda.settled.map(entry => entry.key),
    ['host', 'closed-host', 'moot-child', 'moot-broken', 'answered']);
  assert.deepEqual(agenda.assumptions.map(entry => entry.key), ['assumed']);
  assert.equal(agenda.settled.find(entry => entry.key === 'moot-child').currentState.kind, 'moot');
  assert.equal(agenda.settled.find(entry => entry.key === 'moot-broken').currentState.kind, 'moot');
  assert.ok(agenda.settled.find(entry => entry.key === 'moot-broken').hygiene.length);
  assert.match(agenda.assumptions[0].currentState.sentence, /Still unanswered/i);
});

test('Learning moves use only the authored evidence contract and never infer an experiment from roadmap work', () => {
  const agenda = fixture();
  const overdue = agenda.active.find(entry => entry.key === 'overdue');
  assert.equal(overdue.learningMove,
    'Get overdue threshold from overdue owner by 2026-08-01.');
  assert.doesNotMatch(agenda.active.map(entry => entry.learningMove).join(' '), /experiment|pilot|test|ship/i);
  const lonely = agenda.active.find(entry => entry.key === 'lonely');
  assert.equal(lonely.impact.summary,
    'No authored work or downstream decisions depend on this yet.');
});

test('Learning Agenda spells out direct, negated, AND, OR and downstream conditional effects from the overview evaluator', () => {
  const agenda = fixture();
  const high = agenda.active.find(entry => entry.key === 'high-reach');
  assert.equal(high.reach, 4, 'completed conditional history is excluded from yes / no reach');
  assert.ok(high.impact.direct.some(value => /High yes.*High-reach = yes/.test(value)));
  assert.ok(high.impact.direct.some(value => /High no.*High-reach = no/.test(value)));
  assert.ok(high.impact.shared.some(value => /High joint.*necessary, not sufficient.*Gate = yes/.test(value)));
  assert.ok(high.impact.shared.some(value => /High either.*either High-reach = yes or Low-reach = yes/.test(value)));
  const gate = agenda.active.find(entry => entry.key === 'gate');
  assert.ok(gate.impact.downstream.some(value => /may open Should blocked proceed\?/i.test(value)));
});

test('cyclic and unknown opening conditions are repair-first, never blocked waiting work', () => {
  const text = decision('cycle-a', '\n  when: cycle-b') + decision('cycle-b', '\n  when: cycle-a');
  const model = parse(text), agenda = learningAgendaProjection(model, project(model, '2026-08-13'));
  assert.deepEqual(agenda.notReady.map(entry => entry.key), ['cycle-a', 'cycle-b']);
  assert.deepEqual(agenda.blocked, []);
  assert.ok(agenda.notReady.every(entry => entry.currentState.kind === 'not-ready' &&
    entry.hygiene.some(reason => reason.kind === 'when-cycle')));

  const unknownText = decision('unknown-host', '\n  when: missing-decision');
  const unknownModel = parse(unknownText);
  const unknown = learningAgendaProjection(unknownModel, project(unknownModel, '2026-08-13'));
  assert.deepEqual(unknown.notReady.map(entry => entry.key), ['unknown-host']);
  assert.deepEqual(unknown.blocked, []);
  assert.equal(unknown.notReady[0].openingCondition, 'Opening condition needs repair.');
  assert.ok(unknown.notReady[0].openingRepair.length);
  assert.equal(learningAgendaNextAction(unknown.notReady[0]),
    'Repair the opening condition before planning any learning move.');
});
