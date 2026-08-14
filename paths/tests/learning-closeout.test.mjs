import {test} from 'node:test';
import assert from 'node:assert/strict';
import {parse} from '../parse.js';
import {evaluate} from '../evaluate.js';
import {roadmapProjectionWorlds} from '../handoff-roadmap.js';
import {project} from '../project.js';
import {
  BASIS_KINDS,
  CARRY_FORWARD_KINDS,
  projectLearningCloseOut,
} from '../learning-closeout.js';

const closeOut = ({basis = 'observation', carry = 'scoped-finding', review = '2026-10-31',
  extras = ''} = {}) => `
  close-out:
    basis-kind: ${basis}
    carry-forward: ${carry}
    decision-use: informs later — keep the pilot narrow
    claim: Setup completers returned more often
    scope: New solo users, first session, pilot cohort
    review-by: ${review}
    reconsider-if: A matched reading no longer shows the pattern
    next-check: Compare an assigned variant${extras}`;

const reviewEvent = ({claim = 'Setup completers returned more often',
  scope = 'New solo users, first session, pilot cohort', observation = 'The matched pattern reversed',
  newScope = null, relation = 'inside-scope',
  reviewedOn = '2026-11-02'} = {}) => `
    review:
      prior-claim: ${claim}
      prior-scope: ${scope}
      new-observation: ${observation}${newScope === null ? '' : `\n      new-scope: ${newScope}`}
      relation: ${relation}
      reviewed-on: ${reviewedOn}`;

const retirementEvent = ({reason = 'The pilot population no longer exists', retiredOn = '2026-12-01'} = {}) => `
    retirement:
      reason: ${reason}
      retired-on: ${retiredOn}`;

const decision = (name = 'setup', fields = '', receipt = closeOut()) => `decision ${name}:
  question: Does setup help?
  signal: A matched return reading
  learn: Compare setup completers and non-completers
  enough: One stable matched reading
  owner: Product
  answer-by: 2026-08-13${fields}${receipt}`;

test('the optional nested grammar preserves authored source and field lines', () => {
  const model = parse(`${decision('setup', '\n  answer: yes 2026-08-13 -- observed in the pilot')}\nNOW\n  Core: Continue [if setup]`);
  const receipt = model.decisionByName.setup.closeOut;
  assert.deepEqual(receipt, {
    srcLine:8,
    basisKind:'observation',
    carryForward:'scoped-finding',
    decisionUse:'informs later — keep the pilot narrow',
    claim:'Setup completers returned more often',
    scope:'New solo users, first session, pilot cohort',
    reviewBy:'2026-10-31',
    reconsiderIf:'A matched reading no longer shows the pattern',
    nextCheck:'Compare an assigned variant',
    fieldLines:{
      'basis-kind':10, 'carry-forward':11, 'decision-use':12, claim:13,
      scope:14, 'review-by':15, 'reconsider-if':16, 'next-check':17,
    },
    reviews:[],
    retirements:[],
  });
  assert.deepEqual(model.warnings, []);
});

test('a decision without close-out remains unchanged and projects no receipt', () => {
  const model = parse(`${decision('setup', '\n  answer: yes', '')}\nNOW\n  Core: Continue [if setup]`);
  assert.equal(model.decisionByName.setup.closeOut, null);
  assert.equal(projectLearningCloseOut(model.decisionByName.setup, '2026-08-14'), null);
});

test('all basis and carry-forward source values are explicit closed vocabularies', () => {
  assert.deepEqual(BASIS_KINDS, ['observation', 'experiment', 'judgement', 'calculation', 'synthesis']);
  assert.deepEqual(CARRY_FORWARD_KINDS, ['operating-claim', 'scoped-finding', 'no-carry-forward']);
  for(const basis of BASIS_KINDS){
    const model = parse(`${decision('setup', '\n  reading: A result', closeOut({basis}))}\nNOW\n  Core: Continue [if setup]`);
    assert.equal(model.decisionByName.setup.closeOut.basisKind, basis);
  }
  for(const carry of CARRY_FORWARD_KINDS){
    const model = parse(`${decision('setup', '\n  reading: A result', closeOut({carry}))}\nNOW\n  Core: Continue [if setup]`);
    assert.equal(model.decisionByName.setup.closeOut.carryForward, carry);
  }
});

test('malformed kinds and dates warn, stay non-fatal and cannot masquerade as valid fields', () => {
  const model = parse(`${decision('setup', '\n  reading: A result', closeOut({
    basis:'causal-proof', carry:'certified', review:'31/10/2026',
  }))}\nNOW\n  Core: Continue [if setup]`);
  const receipt = model.decisionByName.setup.closeOut;
  assert.equal(receipt.basisKind, null);
  assert.equal(receipt.carryForward, null);
  assert.equal(receipt.reviewBy, null);
  assert.deepEqual(model.warnings.map(warning => warning.code), [
    'invalid-close-out-basis-kind', 'invalid-close-out-carry-forward', 'invalid-close-out-review-date',
  ]);
  const projected = projectLearningCloseOut(model.decisionByName.setup, '2026-11-01');
  assert.equal(projected.record, 'incomplete');
  assert.equal(projected.carryForward, 'no-stated-carry-forward');
  assert.equal(projected.currency, 'current');
});

test('duplicate and unknown close-out fields warn while the first valid value remains canonical', () => {
  const source = `${decision('setup', '\n  reading: A result', closeOut({extras:`
    claim: A later replacement
    certainty: proven`}))}\nNOW\n  Core: Continue [if setup]`;
  const model = parse(source);
  assert.equal(model.decisionByName.setup.closeOut.claim, 'Setup completers returned more often');
  assert.deepEqual(model.warnings.map(warning => warning.code), [
    'duplicate-close-out-field', 'unknown-close-out-field',
  ]);
});

test('close-out source syntax recovers a valued heading and one under-indented nested field', () => {
  const source = `${decision('setup', '\n  reading: A result', `
  close-out: certified
  basis-kind: observation
    carry-forward: scoped-finding`)}\nNOW\n  Core: Continue [if setup]`;
  const model = parse(source);
  assert.equal(model.decisionByName.setup.closeOut.basisKind, 'observation');
  assert.equal(model.decisionByName.setup.closeOut.carryForward, 'scoped-finding');
  assert.deepEqual(model.warnings.map(warning => warning.code), [
    'invalid-close-out-heading', 'close-out-field-indent',
  ]);
});

test('authored hostile text stays inert source text and receives no evidence certification', () => {
  const hostile = '<script data-x="&">claim</script>';
  const model = parse(`${decision('setup', '\n  reading: A result', closeOut()).replace(
    'claim: Setup completers returned more often', `claim: ${hostile}`)}\nNOW\n  Core: Continue [if setup]`);
  const projected = projectLearningCloseOut(model.decisionByName.setup, '2026-08-14');
  assert.equal(projected.claim, hostile);
  assert.match(projected.qualifier, /Author-stated/);
  assert.match(projected.qualifier, /not evidence, causal, or research-quality certification/);
});

test('all currency states are derived from dated and append-only source events, never a direct label', () => {
  for(const currency of ['challenged', 'retired']){
    const model = parse(`${decision('setup', '\n  reading: A result', closeOut({extras:`\n    currency: ${currency}`}))}\nNOW\n  Core: Continue [if setup]`);
    assert.equal(model.warnings.filter(w => w.code === 'unsupported-close-out-currency').length, 1);
    const projected = projectLearningCloseOut(model.decisionByName.setup, '2026-08-14');
    assert.equal(projected.currency, 'current');
    assert.equal(Object.hasOwn(projected, 'authoredCurrency'), false);
  }
});

test('record, carry-forward and currency project independently', () => {
  const complete = evaluate(parse(`${decision('setup', '\n  answer: yes')}\nNOW\n  Core: Continue [if setup]`), '2026-10-31');
  const current = projectLearningCloseOut(complete.decisionByName.setup, complete.today);
  assert.equal(current.record, 'documented');
  assert.equal(current.carryForward, 'scoped-finding');
  assert.equal(current.currency, 'review-due', 'the review date itself is due');

  const due = projectLearningCloseOut(complete.decisionByName.setup, '2026-11-01');
  assert.equal(due.record, 'documented');
  assert.equal(due.carryForward, 'scoped-finding');
  assert.equal(due.currency, 'review-due');
  assert.equal(due.false, undefined, 'review due is not a truth judgement');

  const partial = parse(`${decision('setup', '\n  reading: A result', `
  close-out:
    basis-kind: observation
    carry-forward: no-carry-forward`)}\nNOW\n  Core: Continue [if setup]`);
  const none = projectLearningCloseOut(partial.decisionByName.setup, '2026-08-14');
  assert.equal(none.record, 'incomplete');
  assert.equal(none.carryForward, 'no-stated-carry-forward');
  assert.equal(none.currency, 'current');
});

test('record completeness follows the authored carry-forward choice', () => {
  const noCarry = parse(`${decision('setup', '\n  reading: A result', `
  close-out:
    basis-kind: observation
    carry-forward: no-carry-forward
    decision-use: no learning outcome cited
    claim: The pilot ended without a stable reading`)}\nNOW\n  Core: Continue [if setup]`);
  const none = projectLearningCloseOut(noCarry.decisionByName.setup, '2026-08-14');
  assert.equal(none.record, 'documented');
  assert.equal(none.carryForward, 'no-stated-carry-forward');

  const scopedMissingReview = parse(`${decision('setup', '\n  reading: A result', `
  close-out:
    basis-kind: observation
    carry-forward: scoped-finding
    decision-use: informs later
    claim: A local pattern
    scope: Pilot users`)}\nNOW\n  Core: Continue [if setup]`);
  assert.equal(projectLearningCloseOut(scopedMissingReview.decisionByName.setup, '2026-08-14').record,
    'incomplete');
});

test('an exact inside-scope review challenges without overwriting the prior receipt', () => {
  const model = parse(`${decision('setup', '\n  answer: yes', closeOut({extras:reviewEvent()}))}\nNOW\n  Core: Continue [if setup]`);
  const source = model.decisionByName.setup.closeOut;
  const projected = projectLearningCloseOut(model.decisionByName.setup, '2026-11-02');
  assert.equal(source.claim, 'Setup completers returned more often');
  assert.equal(source.scope, 'New solo users, first session, pilot cohort');
  assert.equal(source.reviews.length, 1);
  assert.equal(projected.currency, 'challenged');
  assert.equal(projected.reviews[0].effect, 'challenges-prior');
  assert.equal(projected.claim, source.claim, 'challenge preserves the prior claim');
});

test('inside-scope challenge requires dated complete facts and exact prior claim and scope', () => {
  const incomplete = parse(`${decision('setup', '\n  answer: yes', closeOut({extras:`
    review:
      prior-claim: Setup completers returned more often
      prior-scope: New solo users, first session, pilot cohort
      relation: inside-scope`}))}\nNOW\n  Core: Continue [if setup]`);
  const incompleteProjected = projectLearningCloseOut(incomplete.decisionByName.setup, '2026-11-02');
  assert.equal(incompleteProjected.currency, 'review-due');
  assert.equal(incompleteProjected.reviews[0].effect, 'incomplete');
  assert.equal(incompleteProjected.warnings.some(w => w.code === 'incomplete-close-out-review'), true);

  const undated = parse(`${decision('setup', '\n  answer: yes', closeOut({extras:`
    review:
      prior-claim: Setup completers returned more often
      prior-scope: New solo users, first session, pilot cohort
      new-observation: The pattern reversed
      relation: inside-scope`}))}\nNOW\n  Core: Continue [if setup]`);
  const undatedProjected = projectLearningCloseOut(undated.decisionByName.setup, '2026-11-02');
  assert.equal(undatedProjected.currency, 'review-due');
  assert.equal(undatedProjected.reviews[0].effect, 'incomplete');
  assert.deepEqual(undatedProjected.reviews[0].missing, ['reviewedOn']);

  const mismatch = parse(`${decision('setup', '\n  answer: yes', closeOut({extras:reviewEvent({
    claim:'A different claim',
  })}))}\nNOW\n  Core: Continue [if setup]`);
  const mismatchProjected = projectLearningCloseOut(mismatch.decisionByName.setup, '2026-11-02');
  assert.equal(mismatchProjected.currency, 'review-due');
  assert.equal(mismatchProjected.reviews[0].effect, 'does-not-target-prior');
  assert.equal(mismatchProjected.warnings.some(w => w.code === 'close-out-review-target-mismatch'), true);
});

test('outside-scope review becomes a new scoped finding and cannot challenge the prior claim', () => {
  const model = parse(`${decision('setup', '\n  answer: yes', closeOut({extras:reviewEvent({
    relation:'outside-scope', observation:'Team accounts moved differently',
    newScope:'Team accounts, first session, pilot cohort',
  })}))}\nNOW\n  Core: Continue [if setup]`);
  const projected = projectLearningCloseOut(model.decisionByName.setup, '2026-11-02');
  assert.equal(projected.currency, 'review-due');
  assert.equal(projected.reviews[0].effect, 'new-scoped-finding');
  assert.equal(projected.claim, 'Setup completers returned more often');

  const unscoped = parse(`${decision('setup', '\n  answer: yes', closeOut({extras:reviewEvent({
    relation:'outside-scope', newScope:'',
  })}))}\nNOW\n  Core: Continue [if setup]`);
  const unscopedProjected = projectLearningCloseOut(unscoped.decisionByName.setup, '2026-11-02');
  assert.equal(unscopedProjected.currency, 'review-due');
  assert.equal(unscopedProjected.reviews[0].effect, 'outside-scope-unscoped');
  assert.equal(unscopedProjected.warnings.some(w => w.code === 'outside-scope-review-missing-new-scope'), true);
});

test('a future-dated review remains append-only pending until its date', () => {
  const model = parse(`${decision('setup', '\n  answer: yes', closeOut({extras:reviewEvent({
    reviewedOn:'2026-12-10',
  })}))}\nNOW\n  Core: Continue [if setup]`);
  const pending = projectLearningCloseOut(model.decisionByName.setup, '2026-12-09');
  assert.equal(pending.currency, 'review-due');
  assert.equal(pending.reviews[0].effect, 'pending');
  const challenged = projectLearningCloseOut(model.decisionByName.setup, '2026-12-10');
  assert.equal(challenged.currency, 'challenged');
});

test('review and retirement history is append-only with retired precedence at its date', () => {
  const history = reviewEvent({relation:'outside-scope', newScope:'Team accounts, later cohort'}) +
    reviewEvent() + retirementEvent();
  const model = parse(`${decision('setup', '\n  answer: yes', closeOut({extras:history}))}\nNOW\n  Core: Continue [if setup]`);
  const source = model.decisionByName.setup.closeOut;
  assert.equal(source.reviews.length, 2);
  assert.equal(source.retirements.length, 1);

  const beforeRetirement = projectLearningCloseOut(model.decisionByName.setup, '2026-11-30');
  assert.equal(beforeRetirement.currency, 'challenged');
  assert.equal(beforeRetirement.retirements[0].effect, 'pending');
  const retired = projectLearningCloseOut(model.decisionByName.setup, '2026-12-01');
  assert.equal(retired.currency, 'retired');
  assert.deepEqual(retired.reviews.map(review => review.effect),
    ['new-scoped-finding', 'challenges-prior']);
  assert.equal(retired.retirements[0].reason, 'The pilot population no longer exists');
});

test('projected close-out events retain source order across review and retirement kinds', () => {
  const source = retirementEvent({retiredOn:'2026-12-01'}) + reviewEvent({reviewedOn:'2026-11-02'});
  const model = parse(`${decision('setup', '\n  answer: yes', closeOut({extras:source}))}\nNOW\n  Core: Continue [if setup]`);
  const projected = projectLearningCloseOut(model.decisionByName.setup, '2026-12-02');
  assert.deepEqual(projected.events.map(event => event.kind), ['retirement', 'review']);
  assert.ok(projected.events[0].srcLine < projected.events[1].srcLine);
  assert.equal(projected.events[1].priorClaim, 'Setup completers returned more often');
  assert.equal(projected.events[1].priorScope, 'New solo users, first session, pilot cohort');
});

test('incomplete retirement and malformed event kinds/dates warn without changing currency', () => {
  const model = parse(`${decision('setup', '\n  answer: yes', closeOut({extras:`
    review:
      prior-claim: Setup completers returned more often
      prior-scope: New solo users, first session, pilot cohort
      new-observation: Pattern reversed
      relation: overlaps
      reviewed-on: 02/11/2026
    retirement:
      reason: Superseded
      retired-on: tomorrow`}))}\nNOW\n  Core: Continue [if setup]`);
  assert.deepEqual(model.warnings.map(warning => warning.code), [
    'invalid-close-out-review-relation', 'invalid-close-out-review-date',
    'invalid-close-out-retirement-date',
  ]);
  const projected = projectLearningCloseOut(model.decisionByName.setup, '2026-11-02');
  assert.equal(projected.currency, 'review-due');
  assert.equal(projected.warnings.some(w => w.code === 'incomplete-close-out-review'), true);
  assert.equal(projected.warnings.some(w => w.code === 'incomplete-close-out-retirement'), true);
});

test('judgement and calculation are recordable but never project as operating claims', () => {
  for(const basis of ['judgement', 'calculation']){
    const model = parse(`${decision('setup', '\n  answer: yes', closeOut({basis, carry:'operating-claim'}))}\nNOW\n  Core: Continue [if setup]`);
    const projected = projectLearningCloseOut(model.decisionByName.setup, '2026-08-14');
    assert.equal(projected.basisKind, basis);
    assert.equal(projected.declaredCarryForward, 'operating-claim');
    assert.equal(projected.carryForward, 'no-stated-carry-forward');
    assert.equal(projected.record, 'documented');
    assert.equal(projected.warnings.some(w => w.code === 'operating-claim-basis-not-supported'), true);
  }

  const experiment = parse(`${decision('setup', '\n  answer: yes', closeOut({basis:'experiment', carry:'operating-claim'}))}\nNOW\n  Core: Continue [if setup]`);
  assert.equal(projectLearningCloseOut(experiment.decisionByName.setup, '2026-08-14').carryForward,
    'author-declared-operating-claim');
});

test('answer or reading makes a receipt available; an assumption alone does not', () => {
  const assumed = evaluate(parse(`${decision('setup', '\n  assume: yes 2026-08-13')}\nNOW\n  Core: Continue [if setup]`), '2026-08-14');
  const assumedReceipt = projectLearningCloseOut(assumed.decisionByName.setup, assumed.today);
  assert.equal(assumedReceipt.access, 'not-ready');
  assert.equal(assumedReceipt.record, 'incomplete');

  const reading = evaluate(parse(`${decision('setup', '\n  reading: A directional result')}\nNOW\n  Core: Continue [if setup]`), '2026-08-14');
  assert.equal(projectLearningCloseOut(reading.decisionByName.setup, reading.today).access, 'available');

  const answered = evaluate(parse(`${decision('setup', '\n  answer: no')}\nNOW\n  Core: Continue [if setup]`), '2026-08-14');
  assert.equal(projectLearningCloseOut(answered.decisionByName.setup, answered.today).access, 'available');
});

test('moot and dormant decisions hold their receipts without rewriting their independent facts', () => {
  const host = decision('host', '\n  answer: no', '');
  const child = decision('child', '\n  when: host\n  answer: yes');
  const model = evaluate(parse(`${host}\n${child}\nNOW\n  Core: Child work [if child]`), '2026-08-14');
  const receipt = projectLearningCloseOut(model.decisionByName.child, model.today);
  assert.equal(model.decisionByName.child.availability, 'moot');
  assert.equal(receipt.access, 'held');
  assert.equal(receipt.record, 'documented');
  assert.equal(receipt.carryForward, 'scoped-finding');
  assert.equal(receipt.currency, 'current');

  const dormant = evaluate(parse(`${decision('host', '', '')}\n${decision('child', '\n  when: host\n  reading: A held reading')}\nNOW\n  Core: Child work [if child]`), '2026-08-14');
  const dormantReceipt = projectLearningCloseOut(dormant.decisionByName.child, dormant.today);
  assert.equal(dormant.decisionByName.child.availability, 'dormant');
  assert.equal(dormantReceipt.access, 'held');
  assert.equal(dormantReceipt.record, 'documented');
});

test('adding close-out source cannot alter answers, work projection or Roadmap-facing plan worlds', () => {
  const base = `${decision('setup', '\n  answer: yes 2026-08-13', '')}\nNOW\n  Core: Continue [if setup]`;
  const withReceipt = `${decision('setup', '\n  answer: yes 2026-08-13')}\nNOW\n  Core: Continue [if setup]`;
  const before = evaluate(parse(base), '2026-08-14');
  const after = evaluate(parse(withReceipt), '2026-08-14');
  assert.equal(after.decisionByName.setup.effectiveAnswer, before.decisionByName.setup.effectiveAnswer);
  assert.equal(after.decisionByName.setup.value, before.decisionByName.setup.value);
  assert.deepEqual(after.items.map(({title, itemState, parentDecision}) => ({title, itemState, parentDecision})),
    before.items.map(({title, itemState, parentDecision}) => ({title, itemState, parentDecision})));

  const planFacts = text => {
    const projected = project(parse(text), '2026-08-14');
    return {
      possibleCount:projected.worlds.possibleCount,
      shares:projected.shares,
      plans:projected.worlds.plans.map(plan => ({
        labels:plan.labels,
        items:plan.items.map(item => ({title:item.title, state:item.itemState, period:item.period})),
      })),
    };
  };
  assert.deepEqual(planFacts(withReceipt), planFacts(base));

  const deliveryFacts = text => roadmapProjectionWorlds(parse(text), '2026-08-14').assignments;
  assert.deepEqual(deliveryFacts(withReceipt), deliveryFacts(base));
});
