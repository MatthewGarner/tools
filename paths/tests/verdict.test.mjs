import assert from 'node:assert/strict';
import test from 'node:test';

import {parse} from '../parse.js';
import {project} from '../project.js';
import {verdict} from '../verdict.js';

const forbidden = ['moot', 'dormant', 'world', 'limbo', 'provenance', 'enumerable',
  'in-plan', 'not-needed', 'waiting'];

function assertDisplay(result){
  assert.ok(result);
  assert.ok(result.line.includes(result.fig), `${JSON.stringify(result.fig)} is not in the line`);
  for(const identifier of forbidden){
    assert.equal(result.line.includes(identifier), false, `${identifier} leaked into line`);
    assert.equal(result.fig.includes(identifier), false, `${identifier} leaked into fig`);
  }
}

const decision = (name, fields = '', due = '2026-12-15') => `decision ${name}:\n  question: ${name}?\n  signal: signal\n  owner: owner\n  answer-by: ${due}${fields}`;
const verdictFor = (document, today = '2026-12-01') => verdict(project(parse(document), today));

test('overdue is first and describes only followers of its real assumption evidence', () => {
  const result = verdictFor(`${decision('g', '\n  assume: yes 2026-12-08', '2026-12-08')}\n${decision('h', '\n  assume: no 2026-12-10', '2026-12-10')}\nNOW\n  Core: First [if g]\n  Core: Second [if g]\n  Core: Third [if g]\n  Core: Other assumption [unless h]`, '2026-12-15');

  assert.deepEqual(result, {
    line:'The g answer is 7 days overdue; 3 items are following an assumed yes.',
    fig:'7 days overdue',
  });
  assertDisplay(result);
});

test('overdue drops the assumption clause when no item follows it', () => {
  const result = verdictFor(`${decision('g', '\n  assume: no 2026-12-08', '2026-12-08')}\nNOW\n  Core: Shared`, '2026-12-15');

  assert.deepEqual(result, {
    line:'The g answer is 7 days overdue.',
    fig:'7 days overdue',
  });
  assertDisplay(result);
});

for(const missing of ['signal', 'owner', 'signal and owner']) test(`untestable reports a question missing ${missing}`, () => {
  const fields = [
    'decision broken:',
    '  question: broken?',
    ...(missing.includes('signal') ? [] : ['  signal: signal']),
    ...(missing.includes('owner') ? [] : ['  owner: owner']),
    '  answer-by: 2026-12-15',
  ];
  const result = verdictFor(fields.join('\n'));

  assert.deepEqual(result, {
    line:'1 question has no signal or owner — it cannot be answered as written.',
    fig:'1 question',
  });
  assertDisplay(result);
});

test('reach is composed from a real document with five unconditional and three conditional items', () => {
  const result = verdictFor(`${decision('groups')}\nNOW\n  Core: Shared one\n  Core: Shared two\n  Core: Shared three\n  Core: Shared four\n  Core: Shared five\n  Core: Conditional one [if groups]\n  Core: Conditional two [if groups]\n  Core: Conditional three [if groups]`);

  assert.deepEqual(result, {
    line:'Three of eight items depend on the groups answer, due 15 December.',
    fig:'Three of eight',
  });
  assertDisplay(result);
});

test('empty reports that a real plan has no questions', () => {
  const result = verdictFor('NOW\n  Core: Only');

  assert.deepEqual(result, {
    line:'No questions yet — this is a plan, not a fork.',
    fig:'No questions yet',
  });
  assertDisplay(result);
});

test('settled reports that every item remains included', () => {
  const result = verdictFor(`${decision('settled')}\nNOW\n  Core: First\n  Core: Second`);

  assert.deepEqual(result, {
    line:'Every item is included in every remaining plan.',
    fig:'Every item',
  });
  assertDisplay(result);
});

test('document verdict overrides generated copy', () => {
  const result = verdictFor('verdict: Use the editorial conclusion: 42 items.\nNOW\n  Core: Only');

  assert.deepEqual(result, {
    line:'Use the editorial conclusion: 42 items.', fig:'42',
  });
  assertDisplay(result);
});

test('document verdict off suppresses generated copy', () => {
  assert.equal(verdictFor('verdict: off\nNOW\n  Core: Only'), null);
});

/* Found by driving real documents, not by the suite: an ANSWERED question was
   still ranked for reach, producing "One of one items depend on the g answer"
   for a plan settled weeks ago. Reach belongs to open questions only, and the
   verb agrees with the count while the noun agrees with the denominator. */
test('an answered question does not rank for reach; the settled line wins', () => {
  const doc = 'today: 2026-12-01\ndecision g:\n  question: q?\n  signal: s\n  owner: o\n' +
    '  answer-by: 2026-11-01\n  answer: yes 2026-11-01\nNOW\n  Core: A [if g]';
  const result = verdict(project(parse(doc), '2026-12-01'));
  assert.equal(result.line, 'Every item is included in every remaining plan.');
});

test('reach reads singular for one item and plural for several', () => {
  const head = 'today: 2026-12-01\ndecision groups:\n  question: q?\n  signal: s\n  owner: o\n  answer-by: 2026-12-15\n';
  const one = verdict(project(parse(head + 'NOW\n  Core: S1\n  Core: S2\nLATER\n  Core: A [if groups]'), '2026-12-01'));
  assert.equal(one.line, 'One of three items depends on the groups answer, due 15 December.');
  const many = verdict(project(parse(head + 'NOW\n  Core: S1\n  Core: S2\n  Core: S3\n  Core: S4\n  Core: S5\n' +
    'LATER\n  Core: A [if groups]\n  Core: B [if groups]\n  Core: C [if not groups]'), '2026-12-01'));
  assert.equal(many.line, 'Three of eight items depend on the groups answer, due 15 December.');
});

test('a ranked question without a due date never emits an empty due phrase', () => {
  const doc = 'decision groups:\n  question: q?\n  signal: s\n  owner: o\n' +
    'LATER\n  Core: A [if groups]';
  const result = verdict(project(parse(doc), '2026-12-01'));
  assert.equal(result.line, 'One of one items depends on the groups answer.');
  assert.doesNotMatch(result.line, /due\s*\./i);
});
