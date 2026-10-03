/* Paths Learning Close-out projection. Pure; the caller supplies today's date.
   This module classifies author-owned text. It does not assess evidence, causal
   truth, research quality, or change the decision/work projection. */

export const BASIS_KINDS = Object.freeze([
  'observation', 'experiment', 'judgement', 'calculation', 'synthesis',
]);

export const CARRY_FORWARD_KINDS = Object.freeze([
  'operating-claim', 'scoped-finding', 'no-carry-forward',
]);
export const REVIEW_RELATIONS = Object.freeze(['inside-scope', 'outside-scope']);

export const CLOSE_OUT_FIELDS = Object.freeze([
  'basis-kind', 'carry-forward', 'decision-use', 'claim', 'scope', 'review-by',
  'reconsider-if', 'next-check',
]);

export const CLOSE_OUT_FIELD_PROPERTIES = Object.freeze({
  'basis-kind':'basisKind',
  'carry-forward':'carryForward',
  'decision-use':'decisionUse',
  claim:'claim',
  scope:'scope',
  'review-by':'reviewBy',
  'reconsider-if':'reconsiderIf',
  'next-check':'nextCheck',
});

export const REVIEW_FIELDS = Object.freeze([
  'prior-claim', 'prior-scope', 'new-observation', 'new-scope', 'relation', 'reviewed-on',
]);
export const REVIEW_FIELD_PROPERTIES = Object.freeze({
  'prior-claim':'priorClaim', 'prior-scope':'priorScope', 'new-observation':'newObservation',
  'new-scope':'newScope', relation:'relation', 'reviewed-on':'reviewedOn',
});
export const RETIREMENT_FIELDS = Object.freeze(['reason', 'retired-on']);
export const RETIREMENT_FIELD_PROPERTIES = Object.freeze({reason:'reason', 'retired-on':'retiredOn'});

const OPERATING_CLAIM_BASIS_BLOCK = new Set(['judgement', 'calculation']);
const COMMON_REQUIRED = ['basisKind', 'carryForward', 'decisionUse', 'claim'];
const CARRIED_REQUIRED = [...COMMON_REQUIRED, 'scope', 'reviewBy', 'reconsiderIf', 'nextCheck'];
/* A review only becomes a dated historical event when its effective date is
   authored. Without it the event is retained but cannot revise currency. */
const REVIEW_REQUIRED = ['priorClaim', 'priorScope', 'newObservation', 'relation', 'reviewedOn'];
const RETIREMENT_REQUIRED = ['reason', 'retiredOn'];

function warning(code, decision, message, source = decision.closeOut){
  const line = source?.srcLine == null ? null : source.srcLine + 1;
  return {phase:'project', code, line, subject:decision.key || decision.name || 'decision', message};
}

const hasText = value => typeof value === 'string' && value.trim().length > 0;

function hasCurrentTruth(decision){
  return !!decision.answer?.direction || hasText(decision.reading);
}

function accessFor(decision, ready){
  if(!ready) return 'not-ready';
  if(decision.availability && decision.availability !== 'active') return 'held';
  return 'available';
}

function requiredReceiptProperties(source){
  return source.carryForward === 'operating-claim' || source.carryForward === 'scoped-finding'
    ? CARRIED_REQUIRED : COMMON_REQUIRED;
}

function reviewProjection(source, review, decision, evaluationDate, warnings){
  const missing = REVIEW_REQUIRED.filter(property => !hasText(review[property]));
  const targetsPrior = !missing.includes('priorClaim') && !missing.includes('priorScope') &&
    review.priorClaim === source.claim && review.priorScope === source.scope;
  let effect = 'incomplete';
  if(missing.length){
    warnings.push(warning('incomplete-close-out-review', decision,
      `A review for ${JSON.stringify(decision.name)} is incomplete — prior claim, prior scope, new observation, relation and reviewed-on date are required; review kept without changing currency.`, review));
  } else if(!targetsPrior){
    effect = 'does-not-target-prior';
    warnings.push(warning('close-out-review-target-mismatch', decision,
      `A review for ${JSON.stringify(decision.name)} does not exactly name this receipt's prior claim and scope — review kept without changing currency.`, review));
  } else if(evaluationDate && review.reviewedOn > evaluationDate){
    effect = 'pending';
  } else if(review.relation === 'inside-scope') effect = 'challenges-prior';
  else if(review.relation === 'outside-scope' && hasText(review.newScope)) effect = 'new-scoped-finding';
  else if(review.relation === 'outside-scope'){
    effect = 'outside-scope-unscoped';
    warnings.push(warning('outside-scope-review-missing-new-scope', decision,
      `An outside-scope review for ${JSON.stringify(decision.name)} needs "new-scope:" before it can become a scoped finding; it does not challenge the prior receipt.`, review));
  }
  return {...review, missing, targetsPrior, effect};
}

function retirementProjection(retirement, decision, evaluationDate, warnings){
  const missing = RETIREMENT_REQUIRED.filter(property => !hasText(retirement[property]));
  if(missing.length){
    warnings.push(warning('incomplete-close-out-retirement', decision,
      `A retirement for ${JSON.stringify(decision.name)} is incomplete — reason and retired-on date are required; event kept without changing currency.`, retirement));
  }
  const effective = !missing.length && (!evaluationDate || retirement.retiredOn <= evaluationDate);
  return {...retirement, missing, effective,
    effect:missing.length ? 'incomplete' : effective ? 'retires-prior' : 'pending'};
}

/**
 * Project the three independent Close-out facts for one parsed or evaluated
 * decision. `null` means no receipt was authored. Hyphenated identifiers are
 * stable model values; renderers own their human-readable labels.
 */
export function projectLearningCloseOut(decision, injectedToday = null){
  if(!decision?.closeOut) return null;
  const source = decision.closeOut;
  const evaluationDate = injectedToday || null;
  const ready = hasCurrentTruth(decision);
  const warnings = [];
  const missing = requiredReceiptProperties(source).filter(property => !hasText(source[property]));
  const blockedOperatingClaim = source.carryForward === 'operating-claim' &&
    OPERATING_CLAIM_BASIS_BLOCK.has(source.basisKind);

  if(!ready){
    warnings.push(warning('close-out-before-current-truth', decision,
      `Decision ${JSON.stringify(decision.name)} has a close-out but no answer or reading — receipt kept as incomplete; add current truth before citing it.`));
  }
  if(missing.length){
    warnings.push(warning('incomplete-close-out', decision,
      `Decision ${JSON.stringify(decision.name)} has an incomplete close-out — complete the authored receipt before citing it.`));
  }
  if(blockedOperatingClaim){
    warnings.push(warning('operating-claim-basis-not-supported', decision,
      `Decision ${JSON.stringify(decision.name)} declares an operating claim from ${source.basisKind} — judgement and calculation may be recorded but cannot render as an operating claim; choose a scoped finding or change the stated basis.`));
  }

  const reviews = source.reviews.map(review =>
    reviewProjection(source, review, decision, evaluationDate, warnings));
  const retirements = source.retirements.map(retirement =>
    retirementProjection(retirement, decision, evaluationDate, warnings));
  const events = [
    ...reviews.map(review => ({kind:'review', ...review})),
    ...retirements.map(retirement => ({kind:'retirement', ...retirement})),
  ].sort((left, right) => left.srcLine - right.srcLine);

  let carryForward = 'no-stated-carry-forward';
  if(source.carryForward === 'scoped-finding') carryForward = 'scoped-finding';
  else if(source.carryForward === 'operating-claim' && !blockedOperatingClaim)
    carryForward = 'author-declared-operating-claim';

  let currency = source.reviewBy && evaluationDate && evaluationDate >= source.reviewBy
    ? 'review-due' : 'current';
  if(reviews.some(review => review.effect === 'challenges-prior')) currency = 'challenged';
  if(retirements.some(retirement => retirement.effective)) currency = 'retired';
  /* Record describes documentation completeness only. An incompatible
     carry-forward declaration is a separate fact and must not erase a fully
     documented receipt. */
  const record = ready && !missing.length ? 'documented' : 'incomplete';

  return {
    decision:decision.key || String(decision.name || '').toLowerCase(),
    record,
    carryForward,
    currency,
    access:accessFor(decision, ready),
    basisKind:source.basisKind,
    declaredCarryForward:source.carryForward,
    decisionUse:source.decisionUse,
    claim:source.claim,
    scope:source.scope,
    reviewBy:source.reviewBy,
    reconsiderIf:source.reconsiderIf,
    nextCheck:source.nextCheck,
    reviews,
    retirements,
    events,
    evaluationDate,
    qualifier:'Author-stated contents; not evidence, causal, or research-quality certification.',
    warnings,
  };
}
