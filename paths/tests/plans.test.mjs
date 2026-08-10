import {test} from 'node:test';
import assert from 'node:assert/strict';
import {parse} from '../parse.js';
import {enumeratePlans, equivalenceSignature} from '../plans.js';

const decision = (name, fields = '') => `decision ${name}:\n  question: ${name}?\n  signal: signal\n  owner: owner\n  answer-by: 2026-01-01${fields}`;

test('worlds enumerate both assumption arms, assumed arm first, with mechanical labels', () => {
  const model = parse(`${decision('groups', '\n  assume: no 2026-02-01')}\nNOW\n  Core: Group work [if groups]`);
  const result = enumeratePlans(model, '2026-02-02');
  assert.equal(result.worlds.enumerableCount, 1);
  assert.equal(result.worlds.possibleCount, 2);
  assert.equal(result.worlds.plans[0].assignments[0].answers.groups, 'no');
  assert.equal(result.worlds.plans[0].labels[0], 'groups — Answer: no');
  assert.equal(result.worlds.plans[1].labels[0], 'groups — Answer: yes');
});

test('dormant decisions are recursively counted and non-open assignment labels say Not open yet', () => {
  const model = parse(`${decision('groups')}\n${decision('pricing', '\n  when: groups')}\nNOW\n  Core: Market [if pricing]`);
  const result = enumeratePlans(model, '2026-02-02');
  assert.equal(result.worlds.enumerableCount, 2);
  assert.equal(result.worlds.possibleCount, 4);
  assert.ok(result.worlds.plans.some(plan => plan.assignments.some(a => a.labels.includes('pricing — Not open yet'))));
});

test('equivalent worlds merge by ordered identity/state/period/status signature and retain coverage', () => {
  const model = parse(`${decision('x')}\n${decision('y')}\nNOW\n  Core: Either [if x or y]`);
  const result = enumeratePlans(model, '2026-02-02');
  assert.equal(result.worlds.possibleCount, 4);
  assert.equal(result.worlds.plans.length, 2);
  assert.deepEqual(result.worlds.plans.map(plan => plan.covers).sort(), [1, 3]);
  assert.equal(equivalenceSignature(result.worlds.plans[0].items), result.worlds.plans[0].signature);
});

test('global preflight counts recursive decisions before enumeration and explicitly refuses above six', () => {
  const blocks = [];
  for(let i = 0; i < 7; i++) blocks.push(decision(`q${i}`, i ? `\n  when: q${i - 1}` : ''));
  const result = enumeratePlans(parse(`${blocks.join('\n')}\nNOW\n  Core: End [if q6]`), '2026-02-02');
  assert.deepEqual(result.worlds, {
    refused:true,
    reason:'Seven open questions would make 128 possible plans. Answer one, or use the Tree view.',
    enumerableCount:7,
  });
  assert.equal(result.warnings.filter(w => w.code === 'possible-plan-refusal').length, 1);
});

test('invalid when decisions and cycles are excluded from enumeration', () => {
  const model = parse(`${decision('host')}\n${decision('bad', '\n  when: host not')}\n${decision('a', '\n  when: b')}\n${decision('b', '\n  when: a')}\nNOW\n  Core: Host [if host]`);
  const result = enumeratePlans(model, '2026-02-02');
  assert.equal(result.worlds.enumerableCount, 1);
});

test('three shares exhaust eligible non-done items and separate shared, assumed and dependent', () => {
  const model = parse(`${decision('assumed', '\n  assume: yes 2026-02-01')}\n${decision('open')}\nNOW\n  Core: Shared\n  Core: Assumed [if assumed]\n  Core: Dependent [if open]\n  Core: Finished [done]`);
  const result = enumeratePlans(model, '2026-02-02');
  assert.deepEqual({denominator:result.shares.denominator, shared:result.shares.shared,
    assumed:result.shares.assumed, dependent:result.shares.dependent},
  {denominator:3, shared:1, assumed:1, dependent:1});
  assert.equal(result.shares.sharedShare + result.shares.assumedShare + result.shares.dependentShare, 1);
});

test('zero denominator yields no figure and repeated calls memoise per model and today', () => {
  const model = parse('NOW\n  Core: Finished [done]');
  const first = enumeratePlans(model, '2026-02-02');
  const second = enumeratePlans(model, '2026-02-02');
  assert.equal(first.shares, null);
  assert.equal(first, second);
  assert.notEqual(first, enumeratePlans(model, '2026-02-03'));
});

