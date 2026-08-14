import {test} from 'node:test';
import assert from 'node:assert/strict';
import {parse} from '../parse.js';
import {project} from '../project.js';

const source = ({basis = 'reasoned-mechanism', reported = '', extra = ''} = {}) => [
  'title: Group invitations',
  'outcome: Groups retain after the first week',
  'proxy: Invitation rate',
  'action: Prompt every active member to invite friends',
  'mode: optimise',
  'intended-theory:',
  '  mechanism: Relevant friends join established groups',
  'protects:',
  '  - Qualified groups retained after seven days',
  'failure-theory low-intent:',
  '  mechanism: Prompts create low-intent invitations and noisier groups',
  '  harmed-outcome: Qualified groups retained after seven days',
  '  guardrail: Qualified group retention after seven days',
  `  basis: ${basis}`,
  '  support: High-invite cohorts have lower return',
  '  weaken-with: Qualified retention remains comparable in matched cohorts',
  reported,
  extra,
].filter(Boolean).join('\n');

const COMPLETE_PATTERN = [
  'reported-pattern:',
  '  proxy-reading: +18%',
  '  outcome-reading: -11%',
  '  outcome: Qualified groups retained after seven days',
  '  population: Invited teams',
  '  horizon: Prior 14 days',
  '  comparator: Previous 14 days',
  '  source: Author-entered product reading',
].join('\n');

test('projects causal routes without putting the proxy or readings on either route', () => {
  const p = project(parse(source()));
  assert.deepEqual(p.intendedRoute, {
    action: 'Prompt every active member to invite friends',
    mechanism: 'Relevant friends join established groups',
    outcome: 'Groups retain after the first week',
  });
  assert.deepEqual(p.measurement, {proxy: 'Invitation rate', role: 'target'});
  assert.deepEqual(p.failureTheories[0].route, {
    action: 'Prompt every active member to invite friends',
    mechanism: 'Prompts create low-intent invitations and noisier groups',
    harmedOutcome: 'Qualified groups retained after seven days',
    harmedOutcomeKind: 'protected',
  });
  for(const route of [p.intendedRoute, p.failureTheories[0].route]){
    assert.ok(!('proxy' in route));
    assert.ok(!('proxyReading' in route));
    assert.ok(!('outcomeReading' in route));
  }
  assert.equal(p.status, 'ready');
  assert.equal(p.failureTheories[0].registerLabel, 'reasoned');
  assert.equal(p.verdict.authoritative, true);
  assert.equal(p.verdict.line,
    'Do not optimise Invitation rate alone: Prompts create low-intent invitations and noisier groups. Carry Qualified group retention after seven days as the paired measure.');
});

test('projects authored palette and accent configuration for every renderer', () => {
  const p = project(parse(source({extra:'palette: plum\naccent: #9D3E78'})));
  assert.equal(p.palette, 'plum');
  assert.equal(p.accent, '#9D3E78');
});

test('a complete reported pattern stays in an evidence strip with both causal limits', () => {
  const p = project(parse(source({reported: COMPLETE_PATTERN})));
  assert.deepEqual(p.reportedPattern, {
    proxyReading: '+18%',
    outcomeReading: '-11%',
    outcome: 'Qualified groups retained after seven days',
    outcomeKind: 'protected',
    outcomeExplicit: true,
    population: 'Invited teams',
    horizon: 'Prior 14 days',
    comparator: 'Previous 14 days',
    source: 'Author-entered product reading',
    complete: true,
    caveat: 'Reported pattern does not establish causality.',
    mechanismStatement: 'Mechanism remains a hypothesis.',
  });
  assert.equal(p.failureTheories[0].registerLabel, 'reported pattern');
  assert.ok(!('reportedPattern' in p.failureTheories[0].route));
  assert.equal(p.verdict.authoritative, true);
  assert.match(p.verdict.limit, /authored hypothesis, not proof of causal effect/i);
  assert.match(p.verdict.limit, /Mechanism remains a hypothesis/i);
});

test('a partial reported pattern is labelled incomplete and does not upgrade a theory', () => {
  const p = project(parse(source({reported: 'reported-pattern:\n  proxy-reading: +18%'})));
  assert.equal(p.reportedPattern.complete, false);
  assert.equal(p.failureTheories[0].registerLabel, 'reasoned');
  assert.match(p.verdict.limit, /authored hypothesis, not proof of causal effect/i);
});

test('a reported pattern applies only to theories that harm its referenced protected outcome', () => {
  const second = [
    'protects:',
    '  - Member reports per active group',
    'failure-theory reports:',
    '  mechanism: Prompt volume produces more abusive invitations',
    '  harmed-outcome: Member reports per active group',
    '  guardrail: Member reports per active group',
    '  basis: reasoned-mechanism',
    '  weaken-with: Reports remain stable in a prompted comparison',
  ].join('\n');
  const pattern = COMPLETE_PATTERN.replace(
    '  outcome-reading: -11%',
    '  outcome-reading: -11%\n  outcome: Member reports per active group');
  const p = project(parse(source({reported: pattern, extra: second})));
  assert.equal(p.reportedPattern.complete, true);
  assert.equal(p.reportedPattern.outcome, 'Member reports per active group');
  assert.equal(p.failureTheories[0].registerLabel, 'reasoned');
  assert.equal(p.failureTheories[0].reportedPatternApplies, false);
  assert.equal(p.failureTheories[1].registerLabel, 'reported pattern');
  assert.equal(p.failureTheories[1].reportedPatternApplies, true);
  assert.equal(project(parse(source({reported: pattern, extra: second})), 'low-intent')
    .selectedReceipt.reportedPattern, null);
});

test('an ambiguous reported pattern is incomplete when several protected outcomes exist', () => {
  const model = parse(source({reported: COMPLETE_PATTERN.replace(
    '  outcome: Qualified groups retained after seven days\n', ''), extra:
    'protects:\n  - Member reports per active group'}));
  const p = project(model);
  assert.equal(p.reportedPattern.complete, false);
  assert.equal(p.failureTheories[0].registerLabel, 'reasoned');
});

test('a desired-outcome reading applies to a theory that harms the desired outcome and reaches its receipt', () => {
  const theory = [
    'failure-theory retention:',
    '  mechanism: Prompts make groups feel transactional',
    '  harmed-outcome: Groups retain after the first week',
    '  guardrail: First-week group retention',
    '  basis: reasoned-mechanism',
    '  weaken-with: Retention is stable in an assigned comparison',
  ].join('\n');
  const pattern = COMPLETE_PATTERN.replace(
    '  outcome: Qualified groups retained after seven days',
    '  outcome: Groups retain after the first week');
  const p = project(parse(source({reported: pattern, extra: theory})), 'retention');
  assert.equal(p.reportedPattern.outcomeKind, 'desired');
  assert.equal(p.failureTheories[1].reportedPatternApplies, true);
  assert.equal(p.failureTheories[1].registerLabel, 'reported pattern');
  assert.equal(p.selectedReceipt.reportedPattern.outcome, 'Groups retain after the first week');
  assert.match(p.selectedReceipt.causalLimitation, /authored hypothesis, not proof of causal effect/i);
});

test('reasoned selected receipts and verdicts retain a causal limitation without a valid reported pattern', () => {
  const p = project(parse(source({reported: ''})));
  assert.match(p.selectedReceipt.causalLimitation, /authored hypothesis, not proof of causal effect/i);
  assert.match(p.verdict.limit, /authored hypothesis, not proof of causal effect/i);
});

test('speculative concerns are complete but never authoritative', () => {
  const p = project(parse(source({basis: 'speculative-concern', reported: COMPLETE_PATTERN})));
  assert.equal(p.status, 'ready');
  assert.equal(p.failureTheories[0].status, 'ready');
  assert.equal(p.failureTheories[0].registerLabel, 'speculative');
  assert.deepEqual(p.verdict, {
    authoritative: false,
    line: 'Stress-test before making this a target.',
    limit: 'The mechanism is an authored hypothesis, not proof of causal effect. A reported pattern can motivate investigation; it does not establish this mechanism or a causal effect.',
  });
});

test('no failure theory is an incomplete challenge, never endorsement', () => {
  const p = project(parse([
    'outcome: Retention', 'proxy: Invites', 'action: Prompt people',
    'intended-theory:', '  mechanism: Friends join',
  ].join('\n')));
  assert.equal(p.status, 'challenge not yet articulated');
  assert.deepEqual(p.verdict, {
    authoritative: false,
    line: 'Incomplete review — not endorsement.',
    limit: 'The mechanism is an authored hypothesis, not proof of causal effect.',
  });
});

test('missing theory fields give selected-row completion labels and no authoritative verdict', () => {
  const base = source();
  const noMechanism = project(parse(base.replace(
    '  mechanism: Prompts create low-intent invitations and noisier groups\n', '')));
  assert.equal(noMechanism.failureTheories[0].registerLabel, 'needs mechanism');
  assert.equal(noMechanism.failureTheories[0].status, 'needs completion');
  assert.equal(noMechanism.status, 'needs completion');
  assert.equal(noMechanism.verdict.authoritative, false);

  const noGuardrail = project(parse(base.replace(
    '  guardrail: Qualified group retention after seven days\n', '')));
  assert.equal(noGuardrail.failureTheories[0].registerLabel, 'missing guardrail');
  assert.equal(noGuardrail.failureTheories[0].status, 'needs completion');
  assert.equal(noGuardrail.verdict.authoritative, false);
});

test('an inspectable ready receipt cannot make a hunt authoritative while a sibling is incomplete', () => {
  const second = [
    'failure-theory spam:',
    '  mechanism: Notifications crowd out useful messages',
    '  harmed-outcome: Groups retain after the first week',
    '  basis: reasoned-mechanism',
    '  weaken-with: Retention is unchanged after notification controls',
  ].join('\n');
  const model = parse(source({extra: second}));
  const first = project(model, 'low-intent');
  const incomplete = project(model, 'spam');
  assert.equal(first.status, 'needs completion');
  assert.equal(first.selectedTheoryId, 'low-intent');
  assert.equal(first.selectedReceipt.id, 'low-intent');
  assert.equal(first.failureTheories[0].status, 'ready');
  assert.equal(first.verdict.authoritative, false);
  assert.equal(first.verdict.line, 'Complete this hunt before treating the review as a guardrail.');
  assert.equal(incomplete.status, 'needs completion');
  assert.equal(incomplete.selectedTheoryId, 'spam');
  assert.equal(incomplete.selectedReceipt.id, 'spam');
  assert.equal(incomplete.failureTheories[1].registerLabel, 'missing guardrail');
  assert.equal(incomplete.verdict.authoritative, false);
});

test('monitor mode is incomplete without its authored optimisation pressure', () => {
  const missing = project(parse(source().replace('mode: optimise', 'mode: monitor')));
  assert.deepEqual(missing.measurement, {proxy: 'Invitation rate', role: 'guardrail'});
  assert.equal(missing.status, 'needs completion');
  assert.deepEqual(missing.verdict, {
    authoritative: false,
    line: 'Name the optimisation pressure this guardrail constrains.',
    limit: 'The mechanism is an authored hypothesis, not proof of causal effect.',
  });

  const complete = project(parse(source({extra:
    'optimisation-pressure: Aggressive acquisition targets'}).replace('mode: optimise', 'mode: monitor')));
  assert.equal(complete.status, 'ready');
  assert.equal(complete.verdict.authoritative, true);
  assert.equal(complete.verdict.line,
    'Monitor Invitation rate against Aggressive acquisition targets: Prompts create low-intent invitations and noisier groups. Carry Qualified group retention after seven days as the paired measure.');
});

test('an authored guardrail trade-off blocks a ready verdict until a decision rule exists', () => {
  const pending = project(parse(source({extra:
    'trade-off: Group creation versus qualified retention'})));
  assert.equal(pending.status, 'trade-off not yet decided');
  assert.deepEqual(pending.verdict, {
    authoritative: false,
    line: 'Trade-off not yet decided — author a decision-rule before treating either protected outcome as the guardrail.',
    limit: 'The mechanism is an authored hypothesis, not proof of causal effect.',
  });

  const decided = project(parse(source({extra: [
    'trade-off: Group creation versus qualified retention',
    'decision-rule: Never trade more than 2 points of retention for invite volume',
  ].join('\n')})));
  assert.equal(decided.status, 'ready');
  assert.equal(decided.tradeOff.decisionRule,
    'Never trade more than 2 points of retention for invite volume');
  assert.equal(decided.verdict.authoritative, true);
});

test('missing core fields take precedence over theory rhetoric', () => {
  const p = project(parse(source().replace('proxy: Invitation rate\n', '')));
  assert.equal(p.status, 'needs completion');
  assert.deepEqual(p.verdict, {
    authoritative: false,
    line: 'Complete the target, action and intended theory before reviewing the proxy.',
    limit: 'The mechanism is an authored hypothesis, not proof of causal effect.',
  });
});

test('an author-stated verdict remains separate from computed safety gates', () => {
  const claimed = 'Approved for rollout — keep monitoring 2 protected outcomes.';
  const cases = [
    source({basis: 'speculative-concern'}),
    source().replace('mode: optimise', 'mode: monitor'),
    source({extra: 'trade-off: Group creation versus qualified retention'}),
    source().replace('  guardrail: Qualified group retention after seven days\n', ''),
  ];
  for(const text of cases){
    const p = project(parse(`${text}\nverdict: ${claimed}`));
    assert.deepEqual(p.authoredVerdict, {line: claimed, fig: '2'});
    assert.equal(p.verdict.authoritative, false);
    assert.notEqual(p.verdict.line, claimed);
    assert.match(p.verdict.limit, /authored hypothesis, not proof of causal effect/i);
  }
});

test('blank or off suppresses only the author-stated verdict', () => {
  for(const value of ['', 'off', 'OFF']){
    const p = project(parse(`${source()}\nverdict: ${value}`));
    assert.equal(p.authoredVerdict, null);
    assert.equal(p.verdict.authoritative, true);
    assert.match(p.verdict.line, /Do not optimise Invitation rate alone/);
  }
});
