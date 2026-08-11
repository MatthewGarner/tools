import assert from 'node:assert/strict';
import {test} from 'node:test';

import {parse} from '../parse.js';
import {project} from '../project.js';
import {decisionImpactProjection, overviewProjection} from '../overview.js';

const decision = (name, fields = '') => `decision ${name}:\n  question: ${name}?\n  signal: signal\n  owner: owner${
  /\n  answer-by:/.test(fields) ? '' : '\n  answer-by: 2026-08-10'}${fields}`;

test('overview keeps independent decisions parallel and places every item once by authored period and lane', () => {
  const model = parse(`title: Parallel Habitat
date: 2026-08-09
verdict: Hold both routes open
${decision('pricing', '\n  answer-by: 2026-08-01')}
${decision('groups', '\n  answer-by: 2026-08-05')}
NOW
  Core: Shared
  Growth: Pricing yes [if pricing]
  Growth: Pricing no [unless pricing]
LATER
  Core: Joint [if pricing and groups]
  Growth: Either [if pricing or groups]`);
  const overview = overviewProjection(project(model, '2026-08-11'));

  assert.equal(overview.title, 'Parallel Habitat');
  assert.equal(overview.date, '2026-08-09');
  assert.deepEqual(overview.verdict, {line:'Hold both routes open', fig:''});
  assert.deepEqual(overview.periods.map(period => period.name), ['NOW', 'LATER']);
  assert.deepEqual(overview.lanes, ['Core', 'Growth']);
  assert.deepEqual(overview.cells.flatMap(cell => cell.items).map(item => item.identity).sort((a, b) => a - b),
    overview.items.map(item => item.identity).sort((a, b) => a - b));
  assert.equal(new Set(overview.cells.flatMap(cell => cell.items).map(item => item.identity)).size, 5);
  assert.deepEqual(overview.attention.map(entry => entry.key), ['pricing', 'groups']);
  assert.deepEqual(overview.initialSelection, {key:'pricing', srcLine:3});
  assert.deepEqual(overview.decisions.find(entry => entry.key === 'pricing').impact,
    {directItems:2, sharedConditionItems:2, conditionalDecisions:0});

  const byTitle = Object.fromEntries(overview.items.map(item => [item.title, item]));
  assert.deepEqual(byTitle.Joint.condition.terms.map(term => ({key:term.key, direction:term.direction})),
    [{key:'pricing', direction:'yes'}, {key:'groups', direction:'yes'}]);
  assert.equal(Object.hasOwn(byTitle.Joint, 'parentDecision'), false);
  assert.equal(Object.hasOwn(byTitle.Joint, 'displayEvidence'), false);
  assert.equal(byTitle.Shared.displayState.sentence, 'Moves regardless');
  assert.equal(byTitle['Pricing yes'].displayState.sentence, 'Waiting — Pricing = yes');
  assert.equal(byTitle['Pricing no'].displayState.sentence, 'Waiting — Pricing = no');
  assert.equal(byTitle.Joint.displayState.sentence, 'Waiting — Pricing = yes and Groups = yes');
  assert.equal(byTitle.Either.displayState.sentence,
    'Can proceed after either Pricing = yes or Groups = yes');
});

test('overview states distinguish assumptions, late answers, rejected work and completed history', () => {
  const model = parse(`${decision('pricing', '\n  assume: no 2026-08-02')}
${decision('groups', '\n  answer: yes 2026-08-11')}
NOW
  Core: Assumed route [unless pricing]
  Core: Continued [if groups]
  Core: Rejected [unless groups]
  Core: Historical [unless groups] [done]`);
  const overview = overviewProjection(project(model, '2026-08-11'));
  const byTitle = Object.fromEntries(overview.items.map(item => [item.title, item.displayState]));

  assert.equal(byTitle['Assumed route'].sentence, 'Working to the assumption Pricing = no');
  assert.equal(byTitle.Continued.sentence, 'Proceeding after Groups = yes');
  assert.equal(byTitle.Rejected.sentence, 'Not pursuing after Groups = yes');
  assert.equal(byTitle.Historical.kind, 'completed');
  assert.equal(byTitle.Historical.sentence, 'Completed — conditional on Groups = no');
  assert.doesNotMatch(byTitle.Historical.sentence, /before|after/);
  assert.deepEqual(overview.groups.workingToAssumption.map(entry => entry.key), ['pricing']);
  assert.deepEqual(overview.groups.answered.map(entry => entry.key), ['groups']);
  assert.equal(overview.groups.answered[0].currentState.sentence, 'Answered yes — recorded late');
  assert.deepEqual(overview.attention.map(entry => entry.key), []);
});

test('dormant and moot held values stay stored while invalid and conflicting logic moves to repair', () => {
  const source = `${decision('open')}
${decision('held', '\n  when: open\n  answer: yes 2026-08-01')}
${decision('closed', '\n  answer: no 2026-08-01')}
${decision('moot-child', '\n  when: closed\n  assume: yes 2026-08-01')}
decision conflict:
  question: conflict?
  signal: signal
  owner: owner
  answer-by: 2026-08-10
  answer: yes
  answer: no
decision cycle-a:
  question: a?
  signal: signal
  owner: owner
  answer-by: 2026-08-10
  when: cycle-b
decision cycle-b:
  question: b?
  signal: signal
  owner: owner
  answer-by: 2026-08-10
  when: cycle-a
decision incomplete:
  question: incomplete?
NOW
  Core: Held [if held]
  Core: Moot [if moot-child]
  Core: Broken mixed [if open and closed or conflict]
  Core: Broken unknown [if open and missing]`;
  const overview = overviewProjection(project(parse(source), '2026-08-11'));

  assert.match(overview.groups.dormant.find(entry => entry.key === 'held').currentState.sentence,
    /^Stored, not active — Not open yet/);
  assert.match(overview.groups.moot.find(entry => entry.key === 'moot-child').currentState.sentence,
    /^Stored, not active — No longer applies/);
  assert.deepEqual(new Set(overview.groups.repair.map(entry => entry.key)),
    new Set(['conflict', 'cycle-a', 'cycle-b', 'incomplete']));
  assert.ok(overview.modelHealth.some(warning => warning.code === 'mixed-condition'));
  assert.ok(overview.modelHealth.some(warning => warning.code === 'unknown-item-decision'));
  assert.equal(overview.items.find(item => item.title === 'Broken mixed').displayState.sentence,
    'Logic needs repair');
  assert.ok(overview.attention.every(entry => entry.currentState.kind === 'overdue' || entry.currentState.kind === 'open' ||
    entry.currentState.kind === 'assumption'));
  assert.ok(!overview.attention.some(entry => ['held', 'moot-child', 'closed', 'conflict'].includes(entry.key)));
});

test('selected impact groups direct, AND, OR, negated, completed and repair evidence from every AST term', () => {
  const source = `${decision('a')}
${decision('gate')}
NOW
  Core: Shared
  Core: Direct yes [if a]
  Core: Direct no [unless a]
  Core: Joint yes [if a and gate]
  Core: Joint no [if not a and gate]
  Core: Either [if a or gate]
  Core: Historical [unless a] [done]
  Core: Broken [if a and missing]`;
  const model = parse(source);
  const impact = decisionImpactProjection(model, project(model, '2026-08-01'), 'a');

  assert.deepEqual(impact.direct.yes.map(entry => entry.item.title), ['Direct yes']);
  assert.deepEqual(impact.direct.no.map(entry => entry.item.title), ['Direct no']);
  assert.deepEqual(impact.compound.and.map(entry => [entry.item.title, entry.selectedDirection]),
    [['Joint yes', 'yes'], ['Joint no', 'no']]);
  assert.deepEqual(impact.compound.or.map(entry => entry.item.title), ['Either']);
  assert.deepEqual(impact.compound.or[0].condition.terms.map(term => term.key), ['a', 'gate']);
  assert.deepEqual(impact.completedHistory.map(entry => entry.item.title), ['Historical']);
  assert.deepEqual(impact.repairEvidence.filter(entry => entry.scope === 'item').map(entry => entry.item.title),
    ['Broken']);
  assert.ok(impact.continues.some(entry => entry.item.title === 'Shared'));
  assert.equal(impact.direct.yes[0].yes.itemState, 'in-plan');
  assert.equal(impact.direct.yes[0].no.itemState, 'not-needed');
  assert.deepEqual(impact.narrative.direct.map(entry => [entry.title, entry.direction]),
    [['Direct yes', 'yes'], ['Direct no', 'no']]);
  assert.match(impact.narrative.alsoNeeds.find(entry => entry.title === 'Joint yes').sentence,
    /A = yes is necessary, not sufficient; also needs Gate = yes/);
  assert.match(impact.narrative.eitherCanUnlock[0].sentence,
    /either A = yes or Gate = yes can unlock this work/);
  assert.match(impact.narrative.completedHistory[0].sentence,
    /Historical — completed history; completed — conditional on A = no/);
  assert.deepEqual(impact.narrative.repairEvidence.map(entry => entry.title).filter(Boolean), ['Broken']);
  const yesWorld = Object.fromEntries(impact.narrative.branches.yes.work.map(entry => [entry.title, entry]));
  const noWorld = Object.fromEntries(impact.narrative.branches.no.work.map(entry => [entry.title, entry]));
  assert.equal(yesWorld['Direct yes'].sentence, 'Would be in the plan');
  assert.equal(noWorld['Direct yes'].sentence, 'Would not be pursued');
  assert.equal(yesWorld['Joint yes'].relation, 'AND');
  assert.equal(yesWorld.Either.relation, 'OR');
});

test('OR work appears in both decision receipts and counterfactuals clear an authored answer without mutation', () => {
  const source = `${decision('a', '\n  answer: yes 2026-08-01')}
${decision('b')}
NOW
  Core: Either [if a or b]`;
  const model = parse(source);
  const projected = project(model, '2026-08-02');
  const originalAnswer = model.decisionByName.a.answer;
  const a = decisionImpactProjection(model, projected, 'a');
  const b = decisionImpactProjection(model, projected, 'b');

  assert.deepEqual(a.compound.or.map(entry => entry.item.title), ['Either']);
  assert.deepEqual(b.compound.or.map(entry => entry.item.title), ['Either']);
  assert.equal(a.compound.or[0].yes.itemState, 'in-plan');
  assert.equal(a.compound.or[0].no.itemState, 'waiting');
  assert.strictEqual(model.decisionByName.a.answer, originalAnswer);
  assert.equal(model.decisionByName.a.answer.direction, 'yes');
});

test('when effects use real nested and compound availability in both answer worlds', () => {
  const source = `${decision('a')}
${decision('gate')}
${decision('child', '\n  when: a\n  answer: yes 2026-08-01')}
${decision('grandchild', '\n  when: child')}
${decision('inverse', '\n  when: not a')}
${decision('compound', '\n  when: a and gate')}
${decision('alternative', '\n  when: a or gate')}
NOW
  Core: A work [if a]
  Core: Child work [if child]`;
  const model = parse(source);
  const projected = project(model, '2026-08-01');
  const overview = overviewProjection(projected);
  const impact = decisionImpactProjection(model, projected, 'a');
  const byKey = Object.fromEntries(impact.whenEffects.all.map(entry => [entry.key, entry]));

  assert.equal(byKey.child.yes.availability, 'active');
  assert.equal(byKey.child.no.availability, 'moot');
  assert.equal(byKey.grandchild.yes.availability, 'active');
  assert.equal(byKey.grandchild.no.availability, 'moot');
  assert.equal(byKey.inverse.yes.availability, 'moot');
  assert.equal(byKey.inverse.no.availability, 'active');
  assert.equal(byKey.compound.yes.availability, 'dormant');
  assert.equal(byKey.compound.no.availability, 'moot');
  assert.equal(byKey.alternative.yes.availability, 'active');
  assert.equal(byKey.alternative.no.availability, 'dormant');
  assert.ok(impact.whenEffects.mayOpen.some(entry => entry.key === 'grandchild' && entry.direction === 'yes'));
  assert.ok(impact.whenEffects.makesIrrelevant.some(entry => entry.key === 'inverse' && entry.direction === 'yes'));
  assert.deepEqual(impact.whenEffects.alsoNeeds.map(entry => entry.key), ['compound']);
  assert.deepEqual(impact.whenEffects.eitherCanUnlock.map(entry => entry.key), ['alternative']);
  assert.ok(impact.narrative.mayOpen.some(entry => entry.key === 'grandchild' &&
    entry.sentence === 'If answered yes, may open grandchild?'));
  assert.ok(impact.narrative.makesIrrelevant.some(entry => entry.key === 'inverse' &&
    entry.sentence === 'If answered yes, makes inverse? irrelevant'));
  const yesDecision = impact.narrative.branches.yes.decisions.find(entry => entry.key === 'child');
  const noDecision = impact.narrative.branches.no.decisions.find(entry => entry.key === 'child');
  assert.equal(yesDecision.sentence, 'Would be open with a recorded yes answer');
  assert.equal(noDecision.sentence, 'Would no longer apply');
  assert.match(overview.decisions.find(entry => entry.key === 'a').impactSummary,
    /5 conditional decisions/);
  assert.doesNotMatch(overview.decisions.find(entry => entry.key === 'a').impactSummary, /may open/);
});

test('initial selection is independent from attention reach order and considers every active decision', () => {
  const model = parse(`${decision('first')}
${decision('higher-reach')}
NOW
  Core: First [if first]
  Core: Higher one [if higher-reach]
  Core: Higher two [unless higher-reach]`);
  const overview = overviewProjection(project(model, '2026-08-01'));

  assert.deepEqual(overview.attention.map(entry => entry.key), ['higher-reach', 'first']);
  assert.deepEqual(overview.selectionCandidates.map(entry => entry.key), ['first', 'higher-reach']);
  assert.deepEqual(overview.initialSelection, {key:'first', srcLine:0});

  const answered = parse(`${decision('settled', '\n  answer: yes 2026-08-01')}
${decision('host')}
${decision('dormant', '\n  when: host')}`);
  const answeredOverview = overviewProjection(project(answered, '2026-08-01'));
  assert.deepEqual(answeredOverview.attention.map(entry => entry.key), ['host']);
  assert.deepEqual(answeredOverview.selectionCandidates.map(entry => entry.key), ['settled', 'host']);
  assert.deepEqual(answeredOverview.initialSelection, {key:'settled', srcLine:0});
});

test('empty overview is total and an unused decision explains its zero impact', () => {
  const empty = overviewProjection(project(parse('title: Empty'), '2026-08-11'));
  assert.deepEqual(empty.periods, []);
  assert.deepEqual(empty.items, []);
  assert.equal(empty.initialSelection, null);

  const model = parse(decision('unused'));
  const overview = overviewProjection(project(model, '2026-08-01'));
  assert.equal(overview.decisions[0].impactSummary, 'No authored work depends on this yet');
  assert.equal(decisionImpactProjection(model, project(model, '2026-08-01'), 'missing'), null);

  const unassigned = overviewProjection(project(parse('NOW\n  Work without a lane'), '2026-08-01'));
  assert.deepEqual(unassigned.lanes, ['Unassigned']);
  assert.equal(unassigned.cells[0].items[0].lane, 'Unassigned');

  const whenOnly = parse(`${decision('host-only')}
${decision('conditional', '\n  when: host-only')}`);
  const whenOverview = overviewProjection(project(whenOnly, '2026-08-01'));
  const host = whenOverview.decisions.find(entry => entry.key === 'host-only');
  assert.equal(host.impact.conditionalDecisions, 1);
  assert.equal(host.impactSummary, 'No authored work depends on this yet');
});

test('invalid answer and assumption dates put their decisions in repair with actionable evidence', () => {
  const model = parse(`${decision('bad-answer', '\n  answer: yes 11-08-2026')}
${decision('bad-assumption', '\n  assume: no 11-08-2026')}`);
  const overview = overviewProjection(project(model, '2026-08-11'));
  assert.deepEqual(overview.groups.repair.map(entry => entry.key), ['bad-answer', 'bad-assumption']);
  for(const entry of overview.groups.repair){
    assert.equal(entry.currentState.kind, 'repair');
    assert.match(entry.repairEvidence[0].sentence, /date .* is not valid/);
  }
});
