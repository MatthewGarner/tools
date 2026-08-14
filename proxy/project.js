/* /proxy authored model → causal-guardrail projection. Pure; no DOM.
   Routes intentionally omit the proxy: it is a measurement, not a causal step. */

import {firstFigure} from '../assets/verdict.js';

const PATTERN_FIELDS = ['proxyReading', 'outcomeReading', 'population',
  'horizon', 'comparator', 'source'];
const CAUSAL_LIMIT = 'The mechanism is an authored hypothesis, not proof of causal effect.';

const nonAuthoritative = (line, limit = CAUSAL_LIMIT) => ({authoritative: false, line, limit});

/* An author-stated verdict is an annotation beside the computed review state,
   never its replacement. Blank/off deliberately suppress only this line. */
function authoredVerdict(raw){
  if(raw == null) return null;
  const line = String(raw).trim();
  if(!line || line.toLowerCase() === 'off') return null;
  return {line, fig:firstFigure(line)};
}

function patternProjection(pattern){
  if(!pattern) return null;
  return {
    proxyReading: pattern.proxyReading,
    outcomeReading: pattern.outcomeReading,
    outcome: pattern.outcomeRef?.name || pattern.outcome,
    outcomeKind: pattern.outcomeRef?.kind || null,
    outcomeExplicit: Boolean(pattern.outcomeRef?.explicit),
    population: pattern.population,
    horizon: pattern.horizon,
    comparator: pattern.comparator,
    source: pattern.source,
    complete: PATTERN_FIELDS.every(field => Boolean(pattern[field])) && Boolean(pattern.outcomeRef),
    caveat: 'Reported pattern does not establish causality.',
    mechanismStatement: 'Mechanism remains a hypothesis.',
  };
}

function theoryProjection(model, theory, pattern){
  const missing = [];
  if(!theory.mechanism) missing.push('mechanism');
  if(!theory.harmedOutcome || !theory.harmedOutcomeRef) missing.push('harmed outcome');
  if(!theory.guardrail) missing.push('guardrail');
  if(!theory.weakenWith) missing.push('weakening condition');
  if(!theory.basis) missing.push('basis');
  const status = missing.length ? 'needs completion' : 'ready';
  const reportedPatternApplies = Boolean(pattern?.complete && theory.harmedOutcomeRef &&
    pattern.outcomeKind === theory.harmedOutcomeRef.kind &&
    pattern.outcome.toLowerCase() === theory.harmedOutcomeRef.name.toLowerCase());
  let registerLabel = 'needs completion';
  if(!theory.mechanism) registerLabel = 'needs mechanism';
  else if(!theory.guardrail) registerLabel = 'missing guardrail';
  else if(status === 'ready' && theory.basis === 'speculative-concern') registerLabel = 'speculative';
  else if(status === 'ready' && reportedPatternApplies) registerLabel = 'reported pattern';
  else if(status === 'ready') registerLabel = 'reasoned';

  return {
    id: theory.id,
    status,
    registerLabel,
    basis: theory.basis,
    support: theory.support,
    guardrail: theory.guardrail,
    weakenWith: theory.weakenWith,
    reportedPatternApplies,
    missing,
    route: {
      action: model.action,
      mechanism: theory.mechanism,
      harmedOutcome: theory.harmedOutcomeRef?.name || theory.harmedOutcome,
      harmedOutcomeKind: theory.harmedOutcomeRef?.kind || null,
    },
  };
}

function selectedVerdict(model, selected, pattern, coreComplete, status){
  if(!coreComplete)
    return nonAuthoritative('Complete the target, action and intended theory before reviewing the proxy.');
  if(!model.failureTheories.length)
    return nonAuthoritative('Incomplete review — not endorsement.');
  if(model.mode === 'monitor' && !model.optimisationPressure)
    return nonAuthoritative('Name the optimisation pressure this guardrail constrains.');
  if(model.tradeOff && !model.decisionRule)
    return nonAuthoritative('Trade-off not yet decided — author a decision-rule before treating either protected outcome as the guardrail.');
  if(!selected || selected.status !== 'ready')
    return nonAuthoritative('Complete this failure theory before treating the review as a guardrail.');
  if(selected.basis === 'speculative-concern'){
    const limit = selected.reportedPatternApplies
      ? `${CAUSAL_LIMIT} A reported pattern can motivate investigation; it does not establish this mechanism or a causal effect.`
      : CAUSAL_LIMIT;
    return nonAuthoritative('Stress-test before making this a target.', limit);
  }
  if(status !== 'ready')
    return nonAuthoritative('Complete this hunt before treating the review as a guardrail.');

  const line = model.mode === 'monitor'
    ? `Monitor ${model.proxy} against ${model.optimisationPressure}: ${selected.route.mechanism}. Carry ${selected.guardrail} as the paired measure.`
    : `Do not optimise ${model.proxy} alone: ${selected.route.mechanism}. Carry ${selected.guardrail} as the paired measure.`;
  return {authoritative: true, line,
    limit: selected.reportedPatternApplies
      ? `${CAUSAL_LIMIT} Mechanism remains a hypothesis.`
      : CAUSAL_LIMIT};
}

export function project(model, selectedTheoryId = null){
  const pattern = patternProjection(model?.reportedPattern || null);
  const failureTheories = (model?.failureTheories || []).map(theory =>
    theoryProjection(model, theory, pattern));
  const selected = failureTheories.find(theory => theory.id === selectedTheoryId)
    || failureTheories[0] || null;
  const coreComplete = Boolean(model?.outcome && model?.proxy && model?.action &&
    model?.intendedTheory?.mechanism && model?.mode);

  let status;
  if(!coreComplete || model?.rejected) status = 'needs completion';
  else if(!failureTheories.length) status = 'challenge not yet articulated';
  else if(model.mode === 'monitor' && !model.optimisationPressure) status = 'needs completion';
  else if(model.tradeOff && !model.decisionRule) status = 'trade-off not yet decided';
  else if(failureTheories.every(theory => theory.status === 'ready')) status = 'ready';
  else status = 'needs completion';

  const projection = {
    title: model?.title || '',
    date: model?.date || '',
    palette: model?.palette || 'ocean',
    accent: model?.accent || null,
    status,
    selectedTheoryId: selected?.id || null,
    target: {
      outcome: model?.outcome || '',
      action: model?.action || '',
      mode: model?.mode || null,
      optimisationPressure: model?.optimisationPressure || '',
    },
    measurement: {proxy: model?.proxy || '', role: model?.mode === 'monitor' ? 'guardrail' : 'target'},
    intendedRoute: {
      action: model?.action || '',
      mechanism: model?.intendedTheory?.mechanism || '',
      outcome: model?.outcome || '',
    },
    protectedOutcomes: (model?.protectedOutcomes || []).map(item => item.name),
    failureTheories,
    reportedPattern: pattern,
    tradeOff: model?.tradeOff ? {description: model.tradeOff, decisionRule: model.decisionRule || ''} : null,
    selectedReceipt: selected ? {
      id: selected.id,
      basis: selected.basis,
      failureTheory: selected.route.mechanism,
      harmedOutcome: selected.route.harmedOutcome,
      guardrail: selected.guardrail,
      support: selected.support,
      weakenWith: selected.weakenWith,
      causalLimitation: CAUSAL_LIMIT,
      reportedPattern: selected.reportedPatternApplies ? pattern : null,
    } : null,
  };
  projection.verdict = selectedVerdict(model, selected, pattern, coreComplete, status);
  projection.authoredVerdict = authoredVerdict(model?.verdict);
  return projection;
}
