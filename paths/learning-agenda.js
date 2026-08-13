/* Pure decision-led work queue for learning. A move and its evidence standard
   exist only when the decision explicitly authors `learn:` and `enough:`.
   Conditional consequences still come from the evaluator-backed overview
   impact used elsewhere; this module never invents experiments or plan arms. */

import {decisionCurrentState, decisionImpactProjection, overviewProjection} from './overview.js';

function rank(left, right){
  if(left.overdue !== right.overdue) return left.overdue ? -1 : 1;
  if(left.answerBy && right.answerBy && left.answerBy !== right.answerBy)
    return left.answerBy.localeCompare(right.answerBy);
  if(left.answerBy !== right.answerBy) return left.answerBy ? -1 : 1;
  if(left.reach !== right.reach) return right.reach - left.reach;
  return left.srcLine - right.srcLine;
}

function learningContract(decision){
  const learn = decision.learn || null;
  const enough = decision.enough || null;
  const missing = [];
  if(!learn) missing.push('learn');
  if(!enough) missing.push('enough');
  return {learn, enough, missing, complete:missing.length === 0,
    required:decision.availability === 'active' && !decision.effectiveAnswer};
}

function missingContractCopy(missing){
  if(missing.length === 2) return 'add both "learn:" and "enough:"';
  return `add "${missing[0]}:"`;
}

function hasOpeningRepair(decision){
  return !!(decision.openingRepair?.length || decision.cycle || decision.when && !decision.when.valid ||
    decision.repairEvidence?.some(reason => reason.kind === 'when-cycle' || reason.kind === 'invalid-when' ||
      reason.code === 'unknown-when-decision' || reason.code === 'when-cycle'));
}

export function learningAgendaNextAction(decision){
  if(hasOpeningRepair(decision))
    return 'Repair the opening condition before planning any learning move.';
  if(decision.availability === 'moot') return 'No learning move is due while this question no longer applies.';
  if(decision.availability === 'dormant') return 'Wait until this question opens.';
  if(decision.effectiveAnswer) return 'No learning move is due while this answer remains current.';
  if(decision.repairEvidence?.length)
    return 'Complete the missing or invalid decision fields before planning the evidence move.';
  const contract = decision.learningContract || learningContract(decision);
  if(!contract.complete)
    return `Author the learning contract: ${missingContractCopy(contract.missing)}.`;
  return contract.learn;
}

function unique(values){
  return [...new Set(values.filter(Boolean))];
}

function impactCopy(impact){
  const direct = unique(impact?.narrative?.direct?.map(entry => entry.sentence) || []);
  const shared = unique([
    ...(impact?.narrative?.alsoNeeds || []).map(entry => entry.sentence),
    ...(impact?.narrative?.eitherCanUnlock || []).map(entry => entry.sentence),
  ]);
  const downstream = unique([
    ...(impact?.narrative?.mayOpen || []).map(entry => entry.sentence),
    ...(impact?.narrative?.makesIrrelevant || []).map(entry => entry.sentence),
  ]);
  const empty = !direct.length && !shared.length && !downstream.length;
  return {direct, shared, downstream, empty,
    summary:empty ? 'No authored work or downstream decisions depend on this yet.'
      : [direct.length ? `${direct.length} direct` : '', shared.length ? `${shared.length} shared-condition` : '',
        downstream.length ? `${downstream.length} downstream` : ''].filter(Boolean).join(' · ')};
}

function outcomeCopy(impact){
  const arm = direction => {
    const branch = impact?.narrative?.branches?.[direction] || {};
    const work = (branch.work || []).map(entry => ({identity:entry.identity, title:entry.title,
      relation:entry.relation, requirement:entry.requirement, effect:entry.sentence}));
    const decisions = (branch.decisions || []).map(entry => ({key:entry.key, question:entry.question,
      relation:entry.relation, effect:entry.sentence}));
    const empty = !work.length && !decisions.length;
    const counts = [work.length ? `${work.length} plan ${work.length === 1 ? 'effect' : 'effects'}` : '',
      decisions.length ? `${decisions.length} downstream ${decisions.length === 1 ? 'effect' : 'effects'}` : '']
      .filter(Boolean);
    return {work, decisions, empty, summary:empty
      ? 'No modeled plan or downstream changes for this outcome.' : counts.join(' · ')};
  };
  return {yes:arm('yes'), no:arm('no')};
}

function openingCondition(decision){
  if(!decision.when) return null;
  if(!decision.when.valid || decision.cycle) return 'Opening condition needs repair.';
  return `Opens when ${decision.when.source}.`;
}

function openingRepairEvidence(decision){
  if(!decision.when) return [];
  return (decision.repairEvidence || []).filter(reason =>
    reason.kind === 'invalid-when' || reason.kind === 'when-cycle' ||
    reason.code === 'unknown-when-decision' || reason.code === 'when-cycle');
}

function agendaState(projected, decision, contract){
  if(openingRepairEvidence(decision).length) return {kind:'not-ready',
    sentence:'Opening condition needs repair — this question cannot be scheduled yet'};
  const lifecycle = decisionCurrentState(projected, decision, []);
  if(decision.availability === 'moot' || decision.availability === 'dormant') return lifecycle;
  if(decision.effectiveAnswer) return lifecycle;
  if(decision.repairEvidence.length) return {kind:'not-ready',
    sentence:'Unanswered — not ready; complete the evidence contract'};
  if(contract.required && !contract.complete){
    const prefix = decision.assumption?.inForce ? 'Still unanswered' : 'Unanswered';
    return {kind:'not-ready', sentence:`${prefix} — learning contract not ready; ${missingContractCopy(contract.missing)}`};
  }
  if(decision.assumption?.inForce) return {kind:'assumption',
    sentence:`Still unanswered — ${lifecycle.sentence.toLowerCase()}`};
  return lifecycle;
}

function agendaEntry(model, projected, decision){
  const impact = decisionImpactProjection(model, projected, decision.key);
  const impactView = impactCopy(impact);
  const outcomes = outcomeCopy(impact);
  const contract = learningContract(decision);
  const currentState = agendaState(projected, decision, contract);
  const openingRepair = openingRepairEvidence(decision);
  const reach = Math.max(0, Number(decision.reach) || 0);
  return {...decision, currentState, reach,
    reachSentence:reach
      ? `${reach} current work ${reach === 1 ? 'item changes' : 'items change'} between yes and no.`
      : 'No current authored work changes between yes and no. This does not mean the question is unimportant.',
    learningContract:contract,
    learningMove:decision.learn || null,
    evidenceStandard:decision.enough || null,
    nextAction:learningAgendaNextAction({...decision, learningContract:contract, openingRepair}),
    hygiene:decision.repairEvidence, openingRepair,
    openingCondition:openingCondition(decision), impact:impactView, outcomes};
}

export function learningAgendaProjection(model, projected){
  const overview = overviewProjection(projected);
  const entries = overview.decisions.map(decision => agendaEntry(model, projected, decision));
  const assumptions = entries.filter(decision => decision.availability === 'active' &&
    decision.currentState.kind === 'assumption').sort(rank);
  const active = entries.filter(decision => decision.availability === 'active' &&
    decision.currentState.kind !== 'assumption' && decision.currentState.kind !== 'not-ready' &&
    !decision.effectiveAnswer).sort(rank);
  const blocked = entries.filter(decision => decision.currentState.kind === 'dormant')
    .sort((a, b) => a.srcLine - b.srcLine);
  const notReady = entries.filter(decision => decision.currentState.kind === 'not-ready')
    .sort((a, b) => a.srcLine - b.srcLine);
  const settled = entries.filter(decision => decision.currentState.kind === 'answered' ||
    decision.currentState.kind === 'moot').sort((a, b) => a.srcLine - b.srcLine);
  const initialSelection = assumptions[0] || active[0] || notReady[0] || blocked[0] || settled[0] || null;
  return {...overview, today:projected.today, entries, assumptions, active, blocked, notReady, settled,
    initialSelection:initialSelection ? {key:initialSelection.key, srcLine:initialSelection.srcLine} : null};
}
