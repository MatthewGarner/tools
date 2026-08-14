import {test} from 'node:test';
import assert from 'node:assert/strict';
import {
  BASES,
  MAX_FAILURE_THEORIES,
  MAX_FIELD_CHARS,
  MAX_SOURCE_CHARS,
  MODES,
  parse,
} from '../parse.js';

const COMPLETE = [
  'title: Group invitations',
  'date: 2026-08-13',
  'outcome: Groups retain after the first week',
  'proxy: Invitation rate',
  'action: Prompt every active member to invite friends',
  'mode: optimise',
  '',
  'intended-theory:',
  '  mechanism: Relevant friends join established groups',
  '',
  'protects:',
  '  - Qualified groups retained after seven days',
  '',
  'failure-theory low-intent:',
  '  mechanism: Prompts create low-intent invitations and noisier groups',
  '  harmed-outcome: Qualified groups retained after seven days',
  '  guardrail: Qualified group retention after seven days',
  '  basis: reasoned-mechanism',
  '  support: High-invite cohorts have lower return',
  '  weaken-with: Qualified retention remains comparable in matched cohorts',
  '',
  'reported-pattern:',
  '  proxy-reading: +18%',
  '  outcome-reading: -11%',
  '  outcome: Qualified groups retained after seven days',
  '  population: Invited teams',
  '  horizon: Prior 14 days',
  '  comparator: Previous 14 days',
  '  source: Author-entered product reading',
].join('\n');

test('parses the revised source model without collapsing measurement into a theory', () => {
  const model = parse(COMPLETE);
  assert.equal(model.title, 'Group invitations');
  assert.equal(model.date, '2026-08-13');
  assert.equal(model.outcome, 'Groups retain after the first week');
  assert.equal(model.proxy, 'Invitation rate');
  assert.equal(model.action, 'Prompt every active member to invite friends');
  assert.equal(model.mode, 'optimise');
  assert.deepEqual(MODES, ['optimise', 'monitor']);
  assert.deepEqual(BASES, ['reasoned-mechanism', 'speculative-concern']);
  assert.deepEqual(model.intendedTheory, {
    mechanism: 'Relevant friends join established groups',
    srcLine: 7,
    srcLines: {mechanism: 8},
  });
  assert.deepEqual(model.protectedOutcomes, [
    {name: 'Qualified groups retained after seven days', srcLine: 11},
  ]);
  assert.equal(model.failureTheories.length, 1);
  assert.deepEqual(model.failureTheories[0], {
    id: 'low-intent',
    mechanism: 'Prompts create low-intent invitations and noisier groups',
    harmedOutcome: 'Qualified groups retained after seven days',
    guardrail: 'Qualified group retention after seven days',
    basis: 'reasoned-mechanism',
    support: 'High-invite cohorts have lower return',
    weakenWith: 'Qualified retention remains comparable in matched cohorts',
    srcLine: 13,
    srcLines: {
      mechanism: 14,
      harmedOutcome: 15,
      guardrail: 16,
      basis: 17,
      support: 18,
      weakenWith: 19,
    },
    harmedOutcomeRef: {kind: 'protected', name: 'Qualified groups retained after seven days'},
  });
  assert.deepEqual(model.reportedPattern, {
    proxyReading: '+18%',
    outcomeReading: '-11%',
    outcome: 'Qualified groups retained after seven days',
    population: 'Invited teams',
    horizon: 'Prior 14 days',
    comparator: 'Previous 14 days',
    source: 'Author-entered product reading',
    srcLine: 21,
    srcLines: {
      proxyReading: 22,
      outcomeReading: 23,
      outcome: 24,
      population: 25,
      horizon: 26,
      comparator: 27,
      source: 28,
    },
    outcomeRef: {
      kind: 'protected',
      name: 'Qualified groups retained after seven days',
      explicit: true,
    },
  });
  assert.deepEqual(model.warnings, []);
  assert.ok(!('proxy' in model.intendedTheory));
  assert.ok(!('proxyReading' in model.failureTheories[0]));
});

test('desired outcome is also a valid harmed-outcome reference', () => {
  const model = parse([
    'outcome: Retention',
    'proxy: Invites',
    'action: Prompt people',
    'intended-theory:',
    '  mechanism: Friends join',
    'failure-theory noise:',
    '  mechanism: Noise drives people away',
    '  harmed-outcome: retention',
    '  guardrail: Retention',
    '  basis: speculative-concern',
    '  weaken-with: Retention is unchanged in an assigned comparison',
  ].join('\n'));
  assert.deepEqual(model.failureTheories[0].harmedOutcomeRef,
    {kind: 'desired', name: 'Retention'});
});

test('an undeclared harmed outcome is not accepted as a reference', () => {
  const model = parse(COMPLETE.replace(
    'harmed-outcome: Qualified groups retained after seven days',
    'harmed-outcome: Revenue'));
  assert.equal(model.failureTheories[0].harmedOutcomeRef, null);
  assert.ok(model.warnings.some(w => w.includes('Revenue') && w.includes('desired outcome or a declared protected outcome')));
});

test('partial reported patterns remain separate and warn for every missing context field', () => {
  const model = parse(COMPLETE.replace(
    /reported-pattern:[\s\S]*$/,
    'reported-pattern:\n  proxy-reading: +18%'));
  assert.deepEqual(model.reportedPattern, {
    proxyReading: '+18%',
    outcomeReading: '',
    outcome: '',
    population: '',
    horizon: '',
    comparator: '',
    source: '',
    srcLine: 21,
    srcLines: {proxyReading: 22},
    outcomeRef: null,
  });
  for(const field of ['outcome-reading', 'population', 'horizon', 'comparator', 'source'])
    assert.ok(model.warnings.some(w => w.includes(`reported-pattern is missing ${field}`)));
});

test('legacy protected-outcome-reading remains readable but warns toward canonical outcome-reading', () => {
  const model = parse(COMPLETE.replace('  outcome-reading: -11%',
    '  protected-outcome-reading: -11%'));
  assert.equal(model.reportedPattern.outcomeReading, '-11%');
  assert.equal(model.reportedPattern.srcLines.outcomeReading, 23);
  assert.ok(model.warnings.some(w =>
    w.includes('protected-outcome-reading is legacy syntax — use outcome-reading')));
});

test('comments and hostile text stay plain model text', () => {
  const hostile = '<script>alert("x")</script> & \"quoted\"';
  const model = parse(COMPLETE
    .replace('Group invitations', hostile)
    .replace('Relevant friends join established groups', `${hostile} // author comment`));
  assert.equal(model.title, hostile);
  assert.equal(model.intendedTheory.mechanism, hostile);
});

test('duplicate singleton fields and blocks keep the first declaration', () => {
  const model = parse([
    COMPLETE,
    'proxy: Clicks',
    'intended-theory:',
    '  mechanism: Replacement mechanism',
    'reported-pattern:',
    '  proxy-reading: +999%',
  ].join('\n'));
  assert.equal(model.proxy, 'Invitation rate');
  assert.equal(model.intendedTheory.mechanism, 'Relevant friends join established groups');
  assert.equal(model.reportedPattern.proxyReading, '+18%');
  assert.ok(model.warnings.some(w => w.includes('proxy is already declared')));
  assert.ok(model.warnings.some(w => w.includes('second intended-theory block ignored')));
  assert.ok(model.warnings.some(w => w.includes('second reported-pattern block ignored')));
});

test('duplicate theory ids and protected outcomes are rejected case-insensitively', () => {
  const model = parse([
    COMPLETE,
    'protects:',
    '  - qualified groups retained after seven days',
    'failure-theory LOW-INTENT:',
    '  mechanism: Duplicate',
  ].join('\n'));
  assert.equal(model.protectedOutcomes.length, 1);
  assert.equal(model.failureTheories.length, 1);
  assert.ok(model.warnings.some(w => w.includes('protected outcome is already declared')));
  assert.ok(model.warnings.some(w => w.includes('failure theory "LOW-INTENT" is already declared')));
});

test('at most three failure theories are retained', () => {
  const blocks = Array.from({length: MAX_FAILURE_THEORIES + 1}, (_, i) => [
    `failure-theory t${i + 1}:`,
    `  mechanism: mechanism ${i + 1}`,
    '  harmed-outcome: O',
    `  guardrail: guardrail ${i + 1}`,
    '  basis: reasoned-mechanism',
    `  weaken-with: check ${i + 1}`,
  ].join('\n'));
  const model = parse([
    'outcome: O', 'proxy: P', 'action: A',
    'intended-theory:', '  mechanism: M', ...blocks,
  ].join('\n'));
  assert.equal(model.failureTheories.length, MAX_FAILURE_THEORIES);
  assert.ok(model.warnings.some(w => w.includes('at most 3 failure theories')));
});

test('unknown mode, basis, keys, malformed indentation and empty theory ids reject safely', () => {
  const model = parse([
    'outcome: O',
    'proxy: P',
    'action: A',
    'mode: launch',
    'mystery: value',
    'intended-theory:',
    '   mechanism: wrong indent',
    'failure-theory:',
    '  mechanism: nameless',
    'failure-theory named:',
    '  basis: observed-proof',
    '  strange-field: value',
  ].join('\n'));
  assert.equal(model.mode, null);
  assert.equal(model.intendedTheory.mechanism, '');
  assert.equal(model.failureTheories.length, 1);
  assert.equal(model.failureTheories[0].basis, null);
  for(const fragment of ['unknown mode', 'unknown top-level key', 'expected exactly 2 spaces',
    'failure-theory needs an id', 'unknown basis', 'unknown failure-theory field'])
    assert.ok(model.warnings.some(w => w.includes(fragment)), fragment);
});

test('monitor mode and an authored trade-off parse without being inferred', () => {
  const model = parse([
    COMPLETE.replace('mode: optimise', 'mode: monitor'),
    'optimisation-pressure: Aggressive acquisition targets',
    'trade-off: Group creation versus qualified retention',
    'decision-rule: Never trade more than 2 points of retention for invite volume',
  ].join('\n'));
  assert.equal(model.mode, 'monitor');
  assert.equal(model.optimisationPressure, 'Aggressive acquisition targets');
  assert.equal(model.tradeOff, 'Group creation versus qualified retention');
  assert.equal(model.decisionRule, 'Never trade more than 2 points of retention for invite volume');
});

test('named palettes and custom accents use suite-standard validation', () => {
  const configured = parse(`${COMPLETE}\npalette: plum\naccent: #9D3E78`);
  assert.equal(configured.palette, 'plum');
  assert.equal(configured.accent, '#9D3E78');
  assert.deepEqual(configured.warnings, []);

  const invalid = parse(`${COMPLETE}\npalette: neon\naccent: red`);
  assert.equal(invalid.palette, 'ocean');
  assert.equal(invalid.accent, null);
  assert.ok(invalid.warnings.some(w => w.includes('unknown palette "neon"')));
  assert.ok(invalid.warnings.some(w => w.includes('accent wants a 6-digit hex')));
});

test('reported patterns must identify their desired or protected outcome when several are declared', () => {
  const twoOutcomes = COMPLETE
    .replace('  outcome: Qualified groups retained after seven days\n', '')
    .replace('  - Qualified groups retained after seven days', [
      '  - Qualified groups retained after seven days',
      '  - Member reports per active group',
    ].join('\n'));
  const ambiguous = parse(twoOutcomes);
  assert.equal(ambiguous.reportedPattern.outcomeRef, null);
  assert.ok(ambiguous.warnings.some(w =>
    w.includes('reported-pattern must name outcome when more than one desired/protected outcome is declared')));

  const explicit = parse(twoOutcomes.replace(
    '  outcome-reading: -11%',
    '  outcome-reading: -11%\n  outcome: Member reports per active group'));
  assert.deepEqual(explicit.reportedPattern.outcomeRef, {
    kind: 'protected',
    name: 'Member reports per active group',
    explicit: true,
  });

  const unknown = parse(twoOutcomes.replace(
    '  outcome-reading: -11%',
    '  outcome-reading: -11%\n  outcome: Revenue'));
  assert.equal(unknown.reportedPattern.outcomeRef, null);
  assert.ok(unknown.warnings.some(w =>
    w.includes('reported outcome "Revenue" must reference the desired outcome or a declared protected outcome')));
});

test('a reported pattern can explicitly target the desired outcome', () => {
  const model = parse(COMPLETE.replace(
    '  outcome: Qualified groups retained after seven days',
    '  outcome: Groups retain after the first week'));
  assert.deepEqual(model.reportedPattern.outcomeRef, {
    kind: 'desired',
    name: 'Groups retain after the first week',
    explicit: true,
  });
});

test('oversized fields and source are rejected rather than truncated into claims', () => {
  const oversized = 'x'.repeat(MAX_FIELD_CHARS + 1);
  const fieldModel = parse(`outcome: O\nproxy: ${oversized}\naction: A`);
  assert.equal(fieldModel.proxy, '');
  assert.ok(fieldModel.warnings.some(w => w.includes('proxy exceeds')));

  const sourceModel = parse('x'.repeat(MAX_SOURCE_CHARS + 1));
  assert.equal(sourceModel.rejected, true);
  assert.equal(sourceModel.outcome, '');
  assert.equal(sourceModel.failureTheories.length, 0);
  assert.ok(sourceModel.warnings[0].includes('source exceeds'));
});
