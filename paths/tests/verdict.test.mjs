import assert from 'node:assert/strict';
import test from 'node:test';

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

const decision = (name, extra = {}) => ({
  key:name.toLowerCase().replaceAll(' ', '-'), name, signal:'A measurable signal', owner:'Alex',
  srcLine:1, reach:0, ...extra,
});

test('overdue is first and describes assumed followers when present', () => {
  const overdue = decision('Launch decision', {
    overdue:true, answerBy:'2026-12-08', effectiveAnswer:'yes', assumption:{direction:'yes'}, reach:8,
  });
  const result = verdict({today:'2026-12-15', decisions:[overdue], reachDenominator:8, items:[
    {itemState:'in-plan', parentDecision:overdue.key, conditionResult:{provenance:new Set(['assumed-launch-decision'])}},
    {itemState:'in-plan', parentDecision:overdue.key, conditionResult:{provenance:new Set(['assumed-launch-decision'])}},
    {itemState:'in-plan', parentDecision:overdue.key, conditionResult:{provenance:new Set(['assumed-launch-decision'])}},
  ]});

  assert.deepEqual(result, {
    line:'The Launch decision answer is 7 days overdue; 3 items are following an assumed yes.',
    fig:'7 days overdue',
  });
  assertDisplay(result);
});

test('overdue drops the assumption clause when nothing follows it', () => {
  const result = verdict({today:'2026-12-15', decisions:[decision('Launch decision', {
    overdue:true, answerBy:'2026-12-08', effectiveAnswer:'no', assumption:{direction:'no'},
  })], items:[]});

  assert.deepEqual(result, {
    line:'The Launch decision answer is 7 days overdue.',
    fig:'7 days overdue',
  });
  assertDisplay(result);
});

test('untestable counts questions missing either a signal or an owner', () => {
  const result = verdict({decisions:[
    decision('First', {signal:''}),
    decision('Second', {owner:null}),
    decision('Sound'),
  ], items:[], reachDenominator:0});

  assert.deepEqual(result, {
    line:'2 questions have no signal or owner — they cannot be answered as written.',
    fig:'2 questions',
  });
  assertDisplay(result);
});

test('a single untestable question uses singular grammar', () => {
  const result = verdict({decisions:[decision('Only', {owner:''})], items:[]});

  assert.deepEqual(result, {
    line:'1 question has no signal or owner — it cannot be answered as written.',
    fig:'1 question',
  });
  assertDisplay(result);
});

test('reach uses the largest reach, then earlier due date, then source line', () => {
  const result = verdict({decisions:[
    decision('Later', {reach:3, answerBy:'2026-12-20', srcLine:2}),
    decision('Chosen', {reach:3, answerBy:'2026-12-15', srcLine:8}),
    decision('Same date later line', {reach:3, answerBy:'2026-12-15', srcLine:9}),
    decision('Smaller', {reach:2, answerBy:'2026-11-01', srcLine:1}),
  ], items:[], reachDenominator:8});

  assert.deepEqual(result, {
    line:'Three of eight items depend on the Chosen answer, due 15 December.',
    fig:'Three of eight',
  });
  assertDisplay(result);
});

test('empty reports that a plan has no questions', () => {
  const result = verdict({decisions:[], items:[], reachDenominator:4});

  assert.deepEqual(result, {
    line:'No questions yet — this is a plan, not a fork.',
    fig:'No questions yet',
  });
  assertDisplay(result);
});

test('settled reports that every item remains included', () => {
  const result = verdict({decisions:[decision('Settled')], items:[], reachDenominator:4});

  assert.deepEqual(result, {
    line:'Every item is included in every remaining plan.',
    fig:'Every item',
  });
  assertDisplay(result);
});

test('document verdict overrides generated copy and off suppresses it', () => {
  const input = {decisions:[decision('Broken', {signal:''})], items:[]};
  const overridden = verdict({...input, verdict:'Use the editorial conclusion: 42 items.'});

  assert.deepEqual(overridden, {
    line:'Use the editorial conclusion: 42 items.', fig:'42',
  });
  assert.ok(overridden.line.includes(overridden.fig));
  assert.equal(verdict({...input, verdict:'off'}), null);
  assert.equal(verdict({...input, verdict:''}), null);
});
