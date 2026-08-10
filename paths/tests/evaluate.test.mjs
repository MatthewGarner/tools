import {test} from 'node:test';
import assert from 'node:assert/strict';
import {parse, parseCondition} from '../parse.js';
import {evaluateCondition, evaluateOperation, project} from '../evaluate.js';

const provenanceSets = [];
const provenanceWords = ['answered', 'never-arose', 'unknown', 'assumed-yes', 'assumed-no'];
for(let mask = 0; mask < 32; mask++) provenanceSets.push(new Set(provenanceWords.filter((_, i) => mask & (1 << i))));
const values = ['true', 'false', 'unknown', 'invalid'];
const union = sets => new Set(sets.flatMap(set => [...set]));
const sameSet = (actual, expected, label) => assert.deepEqual([...actual].sort(), [...expected].sort(), label);

function expected(op, left, right){
  if(left === 'invalid' || right === 'invalid') return {value:'invalid', which:[0, 1]};
  if(op === 'and'){
    if(left === 'false' || right === 'false') return {value:'false', which:[left, right].flatMap((v, i) => v === 'false' ? [i] : [])};
    if(left === 'unknown' || right === 'unknown') return {value:'unknown', which:[left, right].flatMap((v, i) => v === 'unknown' ? [i] : [])};
    return {value:'true', which:[0, 1]};
  }
  if(left === 'true' || right === 'true') return {value:'true', which:[left, right].flatMap((v, i) => v === 'true' ? [i] : [])};
  if(left === 'unknown' || right === 'unknown') return {value:'unknown', which:[left, right].flatMap((v, i) => v === 'unknown' ? [i] : [])};
  return {value:'false', which:[0, 1]};
}

for(const op of ['and', 'or']) test(`${op} exhausts all four values and every provenance-set combination`, () => {
  for(const left of values) for(const right of values){
    for(const lp of provenanceSets) for(const rp of provenanceSets){
      const result = evaluateOperation(op, [
        {value:left, provenance:lp, evidence:[]}, {value:right, provenance:rp, evidence:[]},
      ]);
      const want = expected(op, left, right);
      assert.equal(result.value, want.value, `${op} ${left} ${right}`);
      sameSet(result.provenance, union(want.which.map(i => i ? rp : lp)), `${op} provenance ${left} ${right}`);
    }
  }
});

test('not exhausts all four values and every provenance-set combination', () => {
  const expectedValue = {true:'false', false:'true', unknown:'unknown', invalid:'invalid'};
  for(const value of values) for(const provenance of provenanceSets){
    const result = evaluateOperation('not', [{value, provenance, evidence:[]}]);
    assert.equal(result.value, expectedValue[value]);
    sameSet(result.provenance, provenance, `not provenance ${value}`);
  }
});

test('the four provenance examples reduce exactly according to determining clauses', () => {
  const evaluate = (source, clauses) => evaluateCondition(parseCondition(source), clauses);
  let result = evaluate('not pricing', {pricing:{value:'false', provenance:new Set(['never-arose'])}});
  assert.equal(result.value, 'true'); sameSet(result.provenance, new Set(['never-arose']));
  result = evaluate('groups and pricing', {
    groups:{value:'unknown', provenance:new Set(['assumed-yes'])},
    pricing:{value:'unknown', provenance:new Set(['unknown'])},
  });
  assert.equal(result.value, 'unknown'); sameSet(result.provenance, new Set(['assumed-yes', 'unknown']));
  result = evaluate('not groups or pricing', {
    groups:{value:'false', provenance:new Set(['never-arose'])},
    pricing:{value:'unknown', provenance:new Set(['assumed-yes'])},
  });
  assert.equal(result.value, 'true'); sameSet(result.provenance, new Set(['never-arose']));
  result = evaluate('groups and pricing', {
    groups:{value:'false', provenance:new Set(['never-arose'])},
    pricing:{value:'unknown', provenance:new Set(['assumed-yes'])},
  });
  assert.equal(result.value, 'false'); sameSet(result.provenance, new Set(['never-arose']));
});

const decision = (name, fields = '') => `decision ${name}:\n  question: ${name}?\n  signal: signal\n  owner: owner\n  answer-by: 2026-12-15${fields}`;

test('resolution ladder is moot, dormant, written answer, assumption, then unknown', () => {
  const moot = project(parse(`${decision('groups', '\n  answer: no 2026-12-10')}\n${decision('pricing', '\n  when: groups\n  answer: yes 2026-12-10')}\nNOW\n  Core: Market [if pricing]`), '2026-12-22');
  assert.equal(moot.decisionByName.pricing.availability, 'moot');
  assert.equal(moot.decisionByName.pricing.value, 'false');
  sameSet(moot.decisionByName.pricing.provenance, new Set(['never-arose']));
  assert.equal(moot.items[0].itemState, 'not-needed');

  const dormant = project(parse(`${decision('groups')}\n${decision('pricing', '\n  when: groups\n  answer: yes 2026-12-10')}\nNOW\n  Core: Market [if pricing]`), '2026-12-22');
  assert.equal(dormant.decisionByName.pricing.availability, 'dormant');
  assert.equal(dormant.decisionByName.pricing.value, 'unknown');

  const answered = project(parse(`${decision('groups', '\n  answer: yes 2026-12-16')}\nNOW\n  Core: Groups [if groups]`), '2026-12-22');
  assert.equal(answered.decisionByName.groups.effectiveAnswer, 'yes');
  assert.equal(answered.decisionByName.groups.late, true);

  const assumed = project(parse(`${decision('groups', '\n  assume: yes 2026-12-22')}\nNOW\n  Core: Groups [if groups]`), '2026-12-22');
  assert.equal(assumed.decisionByName.groups.value, 'unknown');
  sameSet(assumed.decisionByName.groups.provenance, new Set(['assumed-yes']));
  assert.equal(assumed.items[0].itemState, 'limbo');
  assert.equal(assumed.decisionByName.groups.overdue, true);

  const unknown = project(parse(`${decision('groups')}\nNOW\n  Core: Groups [if groups]`), '2026-12-10');
  assert.equal(unknown.decisionByName.groups.value, 'unknown');
  assert.equal(unknown.decisionByName.groups.overdue, false);
});

test('pinned today overrides injection and date equality is not overdue or in-force', () => {
  const model = parse(`today: 2026-12-15\n${decision('groups', '\n  assume: yes 2026-12-14')}\nNOW\n  Core: Groups [if groups]`);
  const projected = project(model, '2099-01-01');
  assert.equal(projected.today, '2026-12-15');
  assert.equal(projected.decisionByName.groups.overdue, false);
  assert.equal(projected.decisionByName.groups.assumption.inForce, false);
});

test('when cycles stay dormant and invalid conditions remain waiting with their AST', () => {
  const cycle = project(parse(`${decision('a', '\n  when: b')}\n${decision('b', '\n  when: a')}\nNOW\n  Core: A [if a]`), '2026-12-22');
  assert.equal(cycle.decisionByName.a.availability, 'dormant');
  assert.equal(cycle.decisionByName.b.availability, 'dormant');
  const invalid = project(parse(`${decision('a')}\n${decision('b')}\nNOW\n  Core: Broken [if a and b or c] [done]`), '2026-12-22');
  assert.equal(invalid.items[0].condition.valid, false);
  assert.equal(invalid.items[0].condition.source, 'a and b or c');
  assert.equal(invalid.items[0].itemState, 'waiting');
});

test('done outranks every valid condition and warns only for false', () => {
  const model = project(parse(`${decision('x', '\n  answer: no')}\nNOW\n  Core: Finished [if x] [done]`), '2026-12-22');
  assert.equal(model.items[0].itemState, 'in-plan');
  assert.equal(model.warnings.filter(w => w.code === 'done-false-condition').length, 1);
});

test('deterministic placement covers and/or, killers, date ties, missing dates and dormant exclusion', () => {
  const model = project(parse(`${decision('a')}\n${decision('b')}\n${decision('c', '\n  when: a')}\nNOW\n  Core: Latest [if a and b]\n  Core: Earliest [if a or b]\n  Core: No dormant [if b and c]`), '2026-12-10', {a:'no', b:'yes'});
  assert.equal(model.items[0].parentDecision, 'a', 'equal dates choose earlier source line');
  assert.equal(model.items[1].parentDecision, 'b', 'or chooses the earliest gate that can still satisfy it');
  assert.equal(model.items[2].parentDecision, 'c', 'an impossible item draws under the gate that killed it');
  assert.deepEqual(model.items[0].secondaryDependencies, ['b']);
  const dormant = project(parse(`${decision('a')}\n${decision('b')}\n${decision('c', '\n  when: a')}\nNOW\n  Core: No dormant [if b and c]`), '2026-12-10', {b:'yes'});
  assert.equal(dormant.items[0].parentDecision, 'b', 'a dormant c cannot parent');
});
