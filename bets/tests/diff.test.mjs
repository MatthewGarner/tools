import {test} from 'node:test';
import assert from 'node:assert/strict';
import {parse} from '../parse.js';
import {betsDiff, betsDiffView, betKey, comparisonSafety, duplicateVisibleNames} from '../diff.js';

test('duplicate visible names in one group retain occurrence-safe snapshot identity', () => {
  const oldModel = parse(`Growth
  Experiment: stake 10, odds 50%, payoff 30
  Experiment: stake 20, odds 50%, payoff 60`);
  const newModel = parse(`Growth
  Experiment: stake 10, odds 50%, payoff 30
  Experiment: stake 25, odds 50%, payoff 60`);
  const diff = betsDiff(oldModel, newModel);
  assert.equal(diff.added.length, 0);
  assert.equal(diff.dropped.length, 0);
  assert.equal(diff.moved.size, 1, 'only the second occurrence is revised');
  const second = newModel.groups[0].bets[1];
  assert.ok(diff.moved.has(betKey(second)));
  const view = betsDiffView(diff, 'then');
  assert.deepEqual(view.movedFields.get(betKey(second)).stake, [20, 20]);
});

test('same visible bet name in different groups cannot collapse', () => {
  const oldModel = parse(`Growth
  Experiment: stake 10, odds 50%, payoff 30
Platform
  Experiment: stake 20, odds 50%, payoff 60`);
  const newModel = parse(`Growth
  Experiment: stake 12, odds 50%, payoff 30
Platform
  Experiment: stake 25, odds 50%, payoff 60`);
  const diff = betsDiff(oldModel, newModel);
  assert.equal(diff.moved.size, 2);
  const [growth, platform] = newModel.groups.map(g => g.bets[0]);
  assert.notEqual(betKey(growth), betKey(platform));
  assert.ok(diff.moved.has(betKey(growth)));
  assert.ok(diff.moved.has(betKey(platform)));
});

test('unrelated insertion and source-line movement do not retag an existing occurrence', () => {
  const oldModel = parse(`Growth
  Experiment: stake 10, odds 50%, payoff 30
  Experiment: stake 20, odds 50%, payoff 60`);
  const newModel = parse(`// inserted line
Growth
  New idea: stake 5, odds 50%, payoff 15
  Experiment: stake 10, odds 50%, payoff 30
  Experiment: stake 20, odds 50%, payoff 60`);
  const diff = betsDiff(oldModel, newModel);
  assert.equal(diff.added.length, 1);
  assert.equal(diff.added[0].name, 'New idea');
  assert.equal(diff.dropped.length, 0);
  assert.equal(diff.moved.size, 0);
});

test('duplicate group names get independent group occurrence identities', () => {
  const oldModel = parse(`Growth
  Experiment: stake 10, odds 50%, payoff 30
Growth
  Experiment: stake 20, odds 50%, payoff 60`);
  const newModel = parse(`Growth
  Experiment: stake 10, odds 50%, payoff 30
Growth
  Experiment: stake 22, odds 50%, payoff 60`);
  const diff = betsDiff(oldModel, newModel);
  assert.equal(diff.moved.size, 1);
  assert.ok(diff.moved.has(betKey(newModel.groups[1].bets[0])));
});

test('snapshot comparison is blocked when either side has duplicate visible names', () => {
  const duplicate = parse(`Growth
  Experiment: stake 10, odds 50%, payoff 30
  Experiment: stake 20, odds 50%, payoff 60`);
  const unique = parse(`Growth
  Experiment: stake 10, odds 50%, payoff 30`);
  assert.equal(duplicateVisibleNames(duplicate).length, 1);
  for(const [before, after] of [[duplicate, unique], [unique, duplicate]]){
    const safety = comparisonSafety(before, after);
    assert.equal(safety.safe, false);
    assert.match(safety.warning, /comparison paused.*Rename duplicates/i);
  }
  assert.deepEqual(comparisonSafety(unique, unique), {safe: true, warning: '', line: null});
});

test('inserting an earlier same-named duplicate is refused rather than misreported as moves', () => {
  const before = parse(`Growth
  Experiment: stake 10, odds 50%, payoff 30
  Experiment: stake 20, odds 50%, payoff 60`);
  const after = parse(`Growth
  Experiment: stake 5, odds 50%, payoff 15
  Experiment: stake 10, odds 50%, payoff 30
  Experiment: stake 20, odds 50%, payoff 60`);
  assert.equal(comparisonSafety(before, after).safe, false);
});
