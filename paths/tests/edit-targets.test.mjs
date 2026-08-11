import {test} from 'node:test';
import assert from 'node:assert/strict';
import {parse} from '../parse.js';
import {
  clearAnswer, clearAnswerBy, clearAssumption, clearOwner, clearQuestion,
  clearReading, clearSignal, clearWhen, kinds, setAnswer, setAnswerBy,
  setAnswerRaw, setAssumption, setAssumptionRaw, setOwner, setQuestion,
  setReading, setSignal, setWhen,
  validators,
} from '../edit-targets.js';

const DOC = `title: Habitat paths
decision groups:
  question: Will groups retain?   // primary question
  signal: week-four retention
  reading: 18%
  owner: Growth
  answer-by: 2026-09-10
  assume: yes 2026-08-20
  answer: yes 2026-08-18 target: 20% actual: 22% -- cohort report

decision pricing:
  question: Will people pay?
  signal: paid conversions
  owner: Commercial
  answer-by: 2026-09-15
  when: groups

NOW
  Core: Group prompts [if groups]
  Revenue: Checkout [if pricing]`;

function apply(text, ops){
  if(ops === null) return text;
  const lines = text.split(/\r?\n/);
  for(const op of [...ops].sort((a, b) => b.line - a.line)){
    if(op.text === null) lines.splice(op.line, 1);
    else lines.splice(op.line, 1, ...op.text.split('\n'));
  }
  return lines.join('\n');
}

const decision = (text, line = 1) => parse(text).decisions.find(item => item.srcLine === line);

test('text setters rewrite only their parsed decision and preserve indentation and inline comment', () => {
  const out = apply(DOC, setQuestion(DOC, 1, 'Do groups create durable value?'));
  assert.match(out.split('\n')[2], /^  question: Do groups create durable value\?   \/\/ primary question$/);
  assert.equal(decision(out).question, 'Do groups create durable value?');
  assert.equal(parse(out).decisions[1].question, 'Will people pay?');

  const setters = [
    [setSignal, 'new signal', 'signal'],
    [setReading, '21% and rising', 'reading'],
    [setOwner, 'Research', 'owner'],
  ];
  for(const [set, value, property] of setters){
    const changed = apply(DOC, set(DOC, 1, value));
    assert.equal(decision(changed)[property], value, property);
    assert.equal(parse(changed).decisions[1].owner, 'Commercial', property + ' leaves sibling intact');
  }
});

test('missing fields insert in canonical order and remain one undoable line op', () => {
  const doc = `decision groups:
  signal: retention
  owner: Growth
NOW
  Core: Work [if groups]`;
  const questionOps = setQuestion(doc, 0, 'Will groups retain?');
  assert.equal(questionOps.length, 1);
  assert.match(questionOps[0].text, /^  question: Will groups retain\?\n  signal:/);
  const withQuestion = apply(doc, questionOps);
  const readingOps = setReading(withQuestion, 0, '18%');
  assert.equal(readingOps.length, 1);
  const out = apply(withQuestion, readingOps);
  assert.deepEqual(out.split('\n').slice(1, 5), [
    '  question: Will groups retain?',
    '  signal: retention',
    '  reading: 18%',
    '  owner: Growth',
  ]);
  assert.equal(decision(out, 0).reading, '18%');
});

test('a field-less decision gains its first field directly after its heading without losing comments', () => {
  const doc = `decision groups:
  // evidence still being designed

NOW
  Core: Work [if groups]`;
  const out = apply(doc, setOwner(doc, 0, 'Growth'));
  assert.deepEqual(out.split('\n').slice(0, 4), [
    'decision groups:',
    '  owner: Growth',
    '  // evidence still being designed',
    '',
  ]);
  assert.equal(decision(out, 0).owner, 'Growth');
});

test('setting a duplicated field rewrites the effective first occurrence and removes every shadow duplicate', () => {
  const doc = `decision groups:
  question: First
  signal: retention
  question: Shadow   // remove with duplicate
  owner: Growth
  answer-by: 2026-09-10
NOW
  Core: Work [if groups]`;
  const ops = setQuestion(doc, 0, 'Canonical?');
  assert.deepEqual(ops, [
    {line:1, text:'  question: Canonical?'},
    {line:3, text:null},
  ]);
  const out = apply(doc, ops);
  assert.equal((out.match(/question:/g) || []).length, 1);
  assert.equal(decision(out, 0).question, 'Canonical?');
  assert.ok(!parse(out).warnings.some(warning => warning.code === 'duplicate-decision-field'));
});

test('clear operations delete every duplicate so an older value cannot spring back', () => {
  const doc = `decision groups:
  question: First
  question: Shadow
  signal: retention
  reading: 18%
  owner: Growth
  owner: Shadow owner
  answer-by: 2026-09-10
NOW
  Core: Work [if groups]`;
  const clears = [
    [clearQuestion, 'question'],
    [clearSignal, 'signal'],
    [clearReading, 'reading'],
    [clearOwner, 'owner'],
  ];
  for(const [clear, property] of clears){
    const ops = clear(doc, 0);
    const out = apply(doc, ops);
    assert.equal(decision(out, 0)[property], null, property);
    assert.equal((out.match(new RegExp('^  ' + property + ':', 'gm')) || []).length, 0, property);
  }
  assert.deepEqual(clearReading(`decision x:\n  question: q`, 0), []);
});

test('only a real retained parsed decision heading can be targeted', () => {
  assert.equal(setQuestion(DOC, 2, 'stale'), null, 'field line is not a heading');
  assert.equal(setQuestion(DOC, 999, 'stale'), null, 'out-of-range line');
  assert.equal(setQuestion(DOC, -1, 'stale'), null, 'negative line');
  const duplicate = `decision groups:
  question: First
decision groups:
  question: Ignored`;
  assert.equal(setQuestion(duplicate, 2, 'Must not target ignored duplicate'), null);
  assert.equal(parse(duplicate).decisions[0].srcLine, 0);
});

test('single-value edits reject multiline and comment-forging input while allowing URL text', () => {
  for(const bad of ['safe\n  owner: attacker', 'safe\r\n  owner: attacker', 'safe // hidden']){
    assert.equal(setQuestion(DOC, 1, bad), null, JSON.stringify(bad));
    assert.equal(setSignal(DOC, 1, bad), null, JSON.stringify(bad));
  }
  const out = apply(DOC, setReading(DOC, 1, 'report https://example.test/groups'));
  assert.equal(decision(out).reading, 'report https://example.test/groups');
});

test('answer-by sets, inserts, clears duplicates, and rejects impossible dates', () => {
  const changed = apply(DOC, setAnswerBy(DOC, 1, '2026-09-30'));
  assert.equal(decision(changed).answerBy, '2026-09-30');
  assert.equal(setAnswerBy(DOC, 1, '2026-09-31'), null);
  assert.equal(setAnswerBy(DOC, 1, '30/09/2026'), null);

  const duplicate = DOC.replace('  answer-by: 2026-09-10',
    '  answer-by: 2026-09-10\n  answer-by: 2026-10-10');
  const cleared = apply(duplicate, clearAnswerBy(duplicate, 1));
  assert.equal(decision(cleared).answerBy, null);
  assert.equal((cleared.match(/^  answer-by:/gm) || []).length, 1,
    'the sibling pricing decision keeps its own date');
});

test('assumption set and clear round-trip through the real parser', () => {
  const changed = apply(DOC, setAssumption(DOC, 1, 'NO', '2026-09-01'));
  assert.deepEqual(decision(changed).assumption,
    {direction:'no', date:'2026-09-01', srcLine:7, raw:'no 2026-09-01'});
  assert.equal(setAssumption(DOC, 1, 'maybe', '2026-09-01'), null);
  assert.equal(setAssumption(DOC, 1, 'yes', '2026-02-29'), null);
  const cleared = apply(changed, clearAssumption(changed, 1));
  assert.equal(decision(cleared).assumption, null);
  assert.ok(!cleared.includes('  assume:'));
});

test('raw assumption commit is the EIP path and empty input clears', () => {
  const changed = apply(DOC, setAssumptionRaw(DOC, 1, 'no 2026-09-02'));
  assert.equal(decision(changed).assumption.direction, 'no');
  assert.equal(decision(changed).assumption.date, '2026-09-02');
  assert.equal(setAssumptionRaw(DOC, 1, 'perhaps tomorrow'), null);
  assert.equal(decision(apply(changed, setAssumptionRaw(changed, 1, ''))).assumption, null);
});

test('when accepts one valid condition AST, inserts canonically, and clears all duplicates', () => {
  const withWhen = apply(DOC, setWhen(DOC, 1, 'pricing and not groups'));
  assert.equal(decision(withWhen).when.source, 'pricing and not groups');
  assert.equal(setWhen(DOC, 1, 'pricing and groups or other'), null);
  assert.equal(setWhen(DOC, 1, 'groups\n  answer: no'), null);

  const duplicate = withWhen.replace('  when: groups', '  when: groups\n  when: not groups');
  const pricingLine = parse(duplicate).decisions[1].srcLine;
  const cleared = apply(duplicate, clearWhen(duplicate, pricingLine));
  assert.equal(parse(cleared).decisions[1].when, null);
  assert.equal((cleared.match(/^  when:/gm) || []).length, 1,
    'the newly-added first decision condition remains');
});

test('answer choice preserves safe receipt metadata when options are omitted', () => {
  const ops = setAnswer(DOC, 1, 'no');
  const out = apply(DOC, ops);
  const answer = decision(out).answer;
  assert.deepEqual({
    direction:answer.direction, date:answer.date, target:answer.target,
    actual:answer.actual, receipt:answer.receipt,
  }, {
    direction:'no', date:'2026-08-18', target:'20%', actual:'22%', receipt:'cohort report',
  });
  assert.match(out, /^  answer: no 2026-08-18 target: 20% actual: 22% -- cohort report$/m);
});

test('answer options can replace or explicitly clear date, target, actual, and receipt', () => {
  const replaced = apply(DOC, setAnswer(DOC, 1, 'yes', {
    date:'2026-08-21', target:'25%', actual:'24%', receipt:'experiment 43',
  }));
  assert.match(replaced, /^  answer: yes 2026-08-21 target: 25% actual: 24% -- experiment 43$/m);
  const cleared = apply(replaced, setAnswer(replaced, 1, 'no', {
    date:null, target:null, actual:null, receipt:null,
  }));
  assert.match(cleared, /^  answer: no$/m);
  assert.deepEqual(decision(cleared).answer, {
    direction:'no', date:null, target:null, actual:null, receipt:'', raw:'no', srcLine:8, valid:true,
  });
});

test('raw answer commit accepts only the canonical auditable shape and empty input clears', () => {
  const raw = 'no 2026-08-22 target: 25% actual: 21% -- pricing memo 7';
  const changed = apply(DOC, setAnswerRaw(DOC, 1, raw));
  assert.equal(decision(changed).answer.raw, raw);
  assert.equal(setAnswerRaw(DOC, 1, 'yes 2026-02-29 -- impossible'), null);
  assert.equal(setAnswerRaw(DOC, 1, 'yes sometime soon'), null);
  assert.equal(setAnswerRaw(DOC, 1, 'yes target: twenty percent'), null);
  const cleared = apply(changed, setAnswerRaw(changed, 1, ''));
  assert.equal(decision(cleared).answer, null);
  assert.deepEqual(decision(cleared).answers, []);
});

test('answer normalization replaces conflicts with one auditable answer and clear removes all answers', () => {
  const conflicted = DOC.replace(
    '  answer: yes 2026-08-18 target: 20% actual: 22% -- cohort report',
    '  answer: yes 2026-08-18 -- first receipt\n  answer: no 2026-08-19 -- conflicting receipt');
  assert.equal(decision(conflicted).answer, null);
  const fixed = apply(conflicted, setAnswer(conflicted, 1, 'no', {
    date:'2026-08-20', receipt:'decision log', target:null, actual:null,
  }));
  assert.equal((fixed.match(/^  answer:/gm) || []).length, 1);
  assert.equal(decision(fixed).answer.direction, 'no');
  assert.equal(decision(fixed).answer.receipt, 'decision log');
  assert.ok(!parse(fixed).warnings.some(warning =>
    warning.code === 'conflicting-answers' || warning.code === 'repeated-answer'));

  const cleared = apply(conflicted, clearAnswer(conflicted, 1));
  assert.equal(decision(cleared).answer, null);
  assert.deepEqual(decision(cleared).answers, []);
  assert.ok(!/^  answer:/m.test(cleared));
});

test('answer refuses invalid directions, dates, multiline receipts, and multi-token metric values', () => {
  assert.equal(setAnswer(DOC, 1, 'maybe'), null);
  assert.equal(setAnswer(DOC, 1, 'yes', {date:'2026-02-29'}), null);
  assert.equal(setAnswer(DOC, 1, 'yes', {receipt:'ok\n  owner: attacker'}), null);
  assert.equal(setAnswer(DOC, 1, 'yes', {target:'twenty percent'}), null);
  assert.equal(setAnswer(DOC, 1, 'yes', {actual:'22% // hidden'}), null);
});

test('a zero-indent config line inside the parser-retained decision block does not confuse targeting', () => {
  const doc = `decision groups:
  question: Groups?
palette: ocean
  signal: retention
  owner: Growth
  answer-by: 2026-09-10
NOW
  Core: Work [if groups]`;
  const out = apply(doc, setSignal(doc, 0, 'week-four retention'));
  assert.equal(decision(out, 0).signal, 'week-four retention');
  assert.equal(parse(out).palette, 'ocean');
});

test('validators and kinds accept safe clears and reject values the setters cannot represent', () => {
  for(const name of ['question', 'signal', 'reading', 'owner']){
    assert.equal(validators[name](''), true, name + ' clears');
    assert.equal(validators[name]('one line'), true, name);
    assert.equal(validators[name]('one\n  owner: forged'), false, name);
    assert.equal(kinds[name].validate, validators[name]);
  }
  assert.equal(validators['answer-by'](''), true);
  assert.equal(validators['answer-by']('2026-12-31'), true);
  assert.equal(validators['answer-by']('2026-12-32'), false);
  assert.equal(validators.when('groups and not pricing'), true);
  assert.equal(validators.when('groups and pricing or other'), false);
  assert.equal(validators.assume('yes 2026-12-31'), true);
  assert.equal(validators.assume('perhaps 2026-12-31'), false);
  assert.equal(validators.answer('no 2026-12-31 -- decision log'), true);
  assert.equal(validators.answer('yes 2026-02-29 -- impossible'), false);
  assert.equal(validators.answer('yes sometime soon'), false);
  assert.equal(validators.answer('perhaps'), false);
  assert.equal(validators.answer(''), true);
  for(const name of ['answer-by', 'when', 'assume', 'answer'])
    assert.equal(kinds[name].validate, validators[name]);
});
