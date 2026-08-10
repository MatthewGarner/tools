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

test('fixpoint reachability preserves assignment correlation for impossible conditions', () => {
  const children = Array.from({length:6}, (_, i) => decision(`impossible${i}`, '\n  when: a and not a'));
  const model = parse(`${decision('a')}\n${children.join('\n')}\nNOW\n  Core: Only real branch [if a]`);
  const result = enumeratePlans(model, '2026-02-02');
  assert.equal(result.worlds.refused, false);
  assert.equal(result.worlds.enumerableCount, 1);
  assert.equal(result.worlds.possibleCount, 2);
  assert.equal(result.worlds.plans.reduce((sum, plan) => sum + plan.covers, 0), 2);
});

test('fixpoint reachability expands through a genuinely reachable host chain', () => {
  const model = parse(`${decision('host')}\n${decision('child', '\n  when: host')}\n${decision('grandchild', '\n  when: child')}\nNOW\n  Core: End [if grandchild]`);
  const result = enumeratePlans(model, '2026-02-02');
  assert.equal(result.worlds.enumerableCount, 3);
  assert.equal(result.worlds.possibleCount, 8);
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

test('share partition table exhausts the denominator across interesting combinations', () => {
  const rows = [
    {name:'shared only', doc:'NOW\n  Core: Shared', counts:[1, 1, 0, 0]},
    {name:'dependent only', doc:`${decision('open')}\nNOW\n  Core: Dependent [if open]`, counts:[1, 0, 0, 1]},
    {name:'assumed only', doc:`${decision('assumed', '\n  assume: yes 2026-02-01')}\nNOW\n  Core: Assumed [if assumed]`, counts:[1, 0, 1, 0]},
    {name:'mixed with done excluded', doc:`${decision('assumed', '\n  assume: yes 2026-02-01')}\n${decision('open')}\nNOW\n  Core: Shared\n  Core: Assumed [if assumed]\n  Core: Dependent [if open]\n  Core: Finished [done]`, counts:[3, 1, 1, 1]},
    {name:'never included excluded', doc:`${decision('a')}\nNOW\n  Core: Impossible [if a and not a]`, counts:null},
    {name:'done-only zero denominator', doc:'NOW\n  Core: Finished [done]', counts:null},
  ];
  for(const row of rows){
    const shares = enumeratePlans(parse(row.doc), '2026-02-02').shares;
    if(!row.counts){ assert.equal(shares, null, row.name); continue; }
    const [denominator, shared, assumed, dependent] = row.counts;
    assert.deepEqual({denominator:shares.denominator, shared:shares.shared,
      assumed:shares.assumed, dependent:shares.dependent},
    {denominator, shared, assumed, dependent}, row.name);
    assert.equal(shared + assumed + dependent, denominator, `${row.name}: counts partition denominator`);
    assert.equal(shares.sharedShare + shares.assumedShare + shares.dependentShare, 1,
      `${row.name}: shares partition denominator`);
  }
});

test('zero denominator yields no figure and repeated calls memoise per model and today', () => {
  const model = parse('NOW\n  Core: Finished [done]');
  const first = enumeratePlans(model, '2026-02-02');
  const second = enumeratePlans(model, '2026-02-02');
  assert.equal(first.shares, null);
  assert.equal(first, second);
  assert.notEqual(first, enumeratePlans(model, '2026-02-03'));
});
