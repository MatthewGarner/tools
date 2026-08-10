import {test} from 'node:test';
import assert from 'node:assert/strict';
import {isValidDate, parse, parseCondition} from '../parse.js';

const complete = (name, extra = '') => `decision ${name}:\n  question: ${name}?\n  signal: signal\n  owner: owner\n  answer-by: 2026-12-15${extra}`;

test('state machine keeps decision blocks across blanks and switches cleanly into periods', () => {
  const model = parse(`title: Habitat\n\ndecision groups:\n  question: Groups?\n\n  signal: invites\n  owner: growth\n  answer-by: 2026-12-15\nNOW\n  Core: Streak repair [if groups]`);
  assert.equal(model.title, 'Habitat');
  assert.equal(model.decisions[0].signal, 'invites');
  assert.equal(model.periods[0].name, 'NOW');
  assert.equal(model.items[0].title, 'Streak repair');
  assert.deepEqual(model.warnings, []);
});

test('CRLF, tabs and malformed one/three-space indents recover to the two-space level', () => {
  const model = parse('NOW\r\n\tCore: A\r\n Core: B\r\n   Core: C');
  assert.deepEqual(model.items.map(item => item.title), ['A', 'B', 'C']);
  assert.deepEqual(model.warnings.map(w => w.code), ['tab-indent', 'odd-indent', 'odd-indent']);
});

test('item token stripping keeps note and later URL, statuses are last-wins, conditions first-wins', () => {
  const model = parse(`${complete('groups')}\n${complete('pricing')}\nNOW\n  Core: Coach x3 [doing] [blocked] [if groups] [if pricing] [planned] -- useful note -> https://example.test/x`);
  const item = model.items[0];
  assert.equal(item.title, 'Coach x3');
  assert.equal(item.status, 'blocked');
  assert.equal(item.condition.terms[0].key, 'groups');
  assert.equal(item.note, 'useful note');
  assert.equal(item.url, 'https://example.test/x');
  assert.deepEqual(model.warnings.map(w => w.code), ['duplicate-status', 'duplicate-condition', 'unknown-item-tag', 'unused-decision']);
});

test('an item before a period opens implicit Now and malformed lines are retained', () => {
  const model = parse('  Core: Early\n  Research follow-up');
  assert.equal(model.periods[0].name, 'Now');
  assert.deepEqual(model.items.map(item => item.title), ['Early', 'Research follow-up']);
  assert.deepEqual(model.warnings.map(w => w.code), ['item-before-period', 'unmatched-line']);
});

test('config in an item position remains config and a decision sub-key is not mistaken for config', () => {
  const model = parse(`decision x:\n  title: Not config\nNOW\n  title: Research`);
  assert.equal(model.title, 'Research');
  assert.ok(model.warnings.some(w => w.code === 'unknown-decision-field'));
  assert.ok(model.warnings.some(w => w.code === 'setting-in-item-position'));
});

test('answer receipt fields remain uninterpreted and conflicting answers leave no answer', () => {
  const model = parse(`${complete('groups')}\n  answer: yes 2026-12-16 target: 15% actual: 19% -- experiment 42\n  answer: no 2026-12-17`);
  assert.equal(model.decisions[0].answer, null);
  assert.deepEqual(model.decisions[0].answers[0], {
    direction:'yes', date:'2026-12-16', target:'15%', actual:'19%', receipt:'experiment 42',
    raw:'yes 2026-12-16 target: 15% actual: 19% -- experiment 42', srcLine:5, valid:true,
  });
});

test('calendar validation is lexical and rejects impossible dates including non-leap February', () => {
  for(const value of ['2024-02-29', '2000-02-29', '2026-08-10']) assert.equal(isValidDate(value), true, value);
  for(const value of ['2026-02-29', '1900-02-29', '2026-04-31', '2026-13-01', '10/08/2026']) assert.equal(isValidDate(value), false, value);
});

test('condition parser retains valid ASTs and invalid source without simplifying', () => {
  assert.deepEqual(parseCondition('groups and not pricing'), {
    type:'condition', operator:'and', terms:[
      {type:'term', name:'groups', key:'groups', negated:false},
      {type:'term', name:'pricing', key:'pricing', negated:true},
    ], source:'groups and not pricing', valid:true, error:null,
  });
  const mixed = parseCondition('groups and pricing or reminders');
  assert.equal(mixed.valid, false);
  assert.equal(mixed.error, 'mixed');
  assert.equal(mixed.source, 'groups and pricing or reminders');
});

test('duplicate declarations keep the first and later use is diagnosed without dropping the condition', () => {
  const model = parse(`NOW\n  Core: Work [if groups]\n${complete('groups')}\n${complete('groups')}`);
  assert.equal(model.decisions.length, 1);
  assert.equal(model.items[0].condition.valid, true);
  assert.ok(model.warnings.some(w => w.code === 'decision-after-use'));
  assert.ok(model.warnings.some(w => w.code === 'duplicate-decision'));
});
