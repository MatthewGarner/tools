/* Pure view data for the parallel roadmap and selected-decision receipt.
   Relationships come only from authored condition terms and the `when:` graph. */

import {evaluate} from './evaluate.js';
import {verdict} from './verdict.js';

const REPAIR_WARNING_CODES = new Set([
  'conflicting-answers', 'invalid-answer-value', 'invalid-answer-date',
  'invalid-assumption-date', 'invalid-due-date',
  'malformed-condition', 'mixed-condition', 'unknown-item-decision',
  'unknown-when-decision', 'when-cycle', 'missing-question', 'missing-signal',
  'missing-owner', 'missing-due-date',
]);

const sentenceName = value => {
  const text = String(value || '');
  return text ? text[0].toUpperCase() + text.slice(1) : text;
};

const lowerFirst = value => {
  const text = String(value || '');
  return text ? text[0].toLowerCase() + text.slice(1) : text;
};

function projectedDecisionMap(projected){
  return projected?.decisionByName || Object.fromEntries((projected?.decisions || [])
    .map(decision => [decision.key, decision]));
}

function directionFor(term){
  return term.negated ? 'no' : 'yes';
}

function termView(term, decisionByName){
  const decision = decisionByName[term.key];
  return {...term, key:term.key, name:decision?.name || term.name, negated:!!term.negated,
    direction:directionFor(term)};
}

export function conditionView(condition, decisionByName = {}){
  if(!condition) return null;
  return {...condition, source:condition.source, valid:!!condition.valid, error:condition.error || null,
    operator:condition.operator, terms:(condition.terms || []).map(term => termView(term, decisionByName))};
}

function joinTerms(terms, operator){
  const words = terms.map(term => `${sentenceName(term.name)} = ${term.direction}`);
  if(words.length < 2) return words[0] || 'its condition';
  return words.join(operator === 'or' ? ' or ' : ' and ');
}

function evidenceTerms(item, decisionByName){
  const out = [];
  const seen = new Set();
  for(const member of item.conditionResult?.evidence || []){
    const term = member.term;
    if(!term || seen.has(term.key)) continue;
    seen.add(term.key);
    const decision = decisionByName[term.key];
    const rawValue = member.rawValue ?? decision?.value;
    out.push({key:term.key, name:decision?.name || term.name, negated:!!term.negated,
      direction:rawValue === 'true' ? 'yes' : rawValue === 'false' ? 'no' : directionFor(term),
      reason:member.reason || null});
  }
  return out;
}

function assumptionTerms(item, decisionByName){
  return (item.condition?.terms || []).flatMap(term => {
    const decision = decisionByName[term.key];
    return decision?.assumption?.inForce
      ? [{key:term.key, name:decision.name, direction:decision.assumption.direction}] : [];
  });
}

export function itemDisplayState(item, projected){
  const decisionByName = projectedDecisionMap(projected);
  if(!item.condition) return item.status === 'done'
    ? {kind:'completed', sentence:'Completed'}
    : {kind:'independent', sentence:'Moves regardless'};
  const condition = conditionView(item.condition, decisionByName);
  if(!condition.valid || item.conditionResult?.value === 'invalid')
    return {kind:'repair', sentence:'Logic needs repair'};

  const requirement = joinTerms(condition.terms, condition.operator);
  if(item.status === 'done') return {kind:'completed',
    sentence:`Completed — conditional on ${requirement}`};
  if(item.itemState === 'limbo'){
    const assumptions = assumptionTerms(item, decisionByName);
    return {kind:'assumption', sentence:`Working to the assumption ${joinTerms(assumptions, 'and')}`};
  }
  if(item.conditionResult?.value === 'true'){
    const evidence = evidenceTerms(item, decisionByName);
    return {kind:'proceeding', sentence:`Proceeding after ${joinTerms(evidence.length ? evidence : condition.terms,
      condition.operator)}`};
  }
  if(item.conditionResult?.value === 'false'){
    const evidence = evidenceTerms(item, decisionByName);
    const exclusion = evidence.find(term => term.reason);
    if(exclusion?.reason){
      const host = exclusion.reason.host || exclusion.reason.hostKey || 'its host';
      return {kind:'not-pursuing', sentence:`Not pursuing — ${sentenceName(exclusion.name)} no longer applies after ${sentenceName(host)} = ${exclusion.reason.direction}`};
    }
    return {kind:'not-pursuing', sentence:`Not pursuing after ${joinTerms(evidence.length ? evidence : condition.terms,
      condition.operator)}`};
  }
  if(condition.operator === 'or') return {kind:'waiting',
    sentence:`Can proceed after either ${joinTerms(condition.terms, 'or')}`};
  return {kind:'waiting', sentence:`Waiting — ${joinTerms(condition.terms, condition.operator)}`};
}

function itemView(item, projected){
  return {identity:item.identity, lane:item.lane || 'Unassigned', title:item.title, note:item.note, url:item.url,
    status:item.status, period:item.period, periodIndex:item.periodIndex, srcLine:item.srcLine, raw:item.raw,
    conditionResult:item.conditionResult, itemState:item.itemState, state:item.state,
    condition:conditionView(item.condition, projectedDecisionMap(projected)),
    displayState:itemDisplayState(item, projected)};
}

function warningBelongsToDecision(warning, decision){
  if(!REPAIR_WARNING_CODES.has(warning.code)) return false;
  if(warning.subject === decision.key || String(warning.subject || '').split(':').includes(decision.key)) return true;
  const lines = new Set([decision.srcLine + 1, ...Object.values(decision.fieldLines || {})]);
  return lines.has(warning.line);
}

export function decisionRepairEvidence(projected, decision){
  const warnings = (projected.warnings || []).filter(warning => warningBelongsToDecision(warning, decision));
  const missing = [
    ['question', decision.question], ['signal', decision.signal], ['owner', decision.owner],
    ['answer-by', decision.answerBy],
  ].filter(([, value]) => !value).map(([field]) => field);
  const reasons = [];
  if(missing.length) reasons.push({kind:'missing-fields', fields:missing,
    sentence:`Missing ${missing.join(', ')}`});
  if(decision.cycle) reasons.push({kind:'when-cycle', sentence:'Opening conditions form a cycle'});
  if(decision.when && !decision.when.valid) reasons.push({kind:'invalid-when',
    sentence:'Opening condition needs repair'});
  const directions = new Set((decision.answers || []).filter(answer => answer.valid && answer.direction)
    .map(answer => answer.direction));
  if(directions.size > 1) reasons.push({kind:'conflicting-answers', sentence:'Conflicting answers need repair'});
  for(const warning of warnings){
    if(reasons.some(reason => reason.sentence === warning.message)) continue;
    reasons.push({kind:'warning', code:warning.code, sentence:warning.message, line:warning.line});
  }
  return reasons;
}

function mootReason(decision){
  const reason = decision.mootReason;
  return reason ? `${sentenceName(reason.host)} = ${reason.direction}` : decision.when?.source || 'its opening condition';
}

export function decisionCurrentState(projected, decision, repairs = decisionRepairEvidence(projected, decision)){
  if(repairs.length) return {kind:'repair', sentence:'Logic needs repair'};
  const held = !!(decision.answer || decision.assumption);
  if(decision.availability === 'moot') return {kind:'moot',
    sentence:`${held ? 'Stored, not active — ' : ''}No longer applies after ${mootReason(decision)}`};
  if(decision.availability === 'dormant') return {kind:'dormant',
    sentence:`${held ? 'Stored, not active — ' : ''}Not open yet${decision.when?.source ? ` — opens when ${decision.when.source}` : ''}`};
  if(decision.effectiveAnswer) return {kind:'answered',
    sentence:`Answered ${decision.effectiveAnswer}${decision.late ? ' — recorded late' : ''}`};
  if(decision.assumption?.inForce) return {kind:'assumption',
    sentence:`Working to the assumption ${sentenceName(decision.name)} = ${decision.assumption.direction}`};
  if(decision.overdue) return {kind:'overdue',
    sentence:`Unanswered — overdue since ${decision.answerBy}`};
  return {kind:'open', sentence:decision.answerBy
    ? `Unanswered — due ${decision.answerBy}` : 'Unanswered'};
}

function dependentItems(projected, key){
  return (projected.items || []).filter(item => item.condition?.terms?.some(term => term.key === key));
}

function downstreamDecisionKeys(projected, key){
  const found = new Set();
  const frontier = [key];
  while(frontier.length){
    const host = frontier.shift();
    for(const decision of projected.decisions || []){
      if(found.has(decision.key) || decision.key === key || !decision.when?.valid) continue;
      if(decision.when.terms.some(term => term.key === host)){
        found.add(decision.key);
        frontier.push(decision.key);
      }
    }
  }
  return found;
}

function impactCounts(projected, decision){
  const items = dependentItems(projected, decision.key).filter(item => item.condition?.valid);
  return {directItems:items.filter(item => item.condition.terms.length === 1).length,
    sharedConditionItems:items.filter(item => item.condition.terms.length > 1).length,
    conditionalDecisions:downstreamDecisionKeys(projected, decision.key).size};
}

function impactSummary(counts){
  if(!counts.directItems && !counts.sharedConditionItems)
    return 'No authored work depends on this yet';
  const parts = [];
  if(counts.directItems) parts.push(`${counts.directItems} direct ${counts.directItems === 1 ? 'item' : 'items'}`);
  if(counts.sharedConditionItems) parts.push(`${counts.sharedConditionItems} shared-condition ${counts.sharedConditionItems === 1 ? 'item' : 'items'}`);
  if(counts.conditionalDecisions) parts.push(`${counts.conditionalDecisions} conditional ${counts.conditionalDecisions === 1 ? 'decision' : 'decisions'}`);
  return parts.join(' · ');
}

function decisionView(projected, decision){
  const repairs = decisionRepairEvidence(projected, decision);
  const counts = impactCounts(projected, decision);
  return {...decision, currentState:decisionCurrentState(projected, decision, repairs),
    repairEvidence:repairs, impact:counts, impactSummary:impactSummary(counts)};
}

function attentionOrder(left, right){
  if(left.overdue !== right.overdue) return left.overdue ? -1 : 1;
  if(left.answerBy && right.answerBy && left.answerBy !== right.answerBy)
    return left.answerBy.localeCompare(right.answerBy);
  if(left.answerBy !== right.answerBy) return left.answerBy ? -1 : 1;
  if((left.reach || 0) !== (right.reach || 0)) return (right.reach || 0) - (left.reach || 0);
  return left.srcLine - right.srcLine;
}

function initialSelectionOrder(left, right){
  if(left.overdue !== right.overdue) return left.overdue ? -1 : 1;
  if(left.answerBy && right.answerBy && left.answerBy !== right.answerBy)
    return left.answerBy.localeCompare(right.answerBy);
  if(left.answerBy !== right.answerBy) return left.answerBy ? -1 : 1;
  return left.srcLine - right.srcLine;
}

export function overviewProjection(projected){
  const periods = (projected.periods || []).map(period => ({name:period.name, srcLine:period.srcLine,
    implicit:!!period.implicit}));
  const items = (projected.items || []).map(item => itemView(item, projected));
  const lanes = [];
  const seenLanes = new Set();
  for(const item of items) if(!seenLanes.has(item.lane)){
    seenLanes.add(item.lane);
    lanes.push(item.lane);
  }
  const itemsByCell = new Map();
  for(const item of items){
    const key = `${item.period}\0${item.lane}`;
    if(!itemsByCell.has(key)) itemsByCell.set(key, []);
    itemsByCell.get(key).push(item);
  }
  const cells = periods.flatMap(period => lanes.map(lane => ({period:period.name, lane,
    items:itemsByCell.get(`${period.name}\0${lane}`) || []})));

  const decisions = (projected.decisions || []).map(decision => decisionView(projected, decision));
  const attention = decisions.filter(decision => decision.availability === 'active' &&
    !decision.effectiveAnswer && decision.currentState.kind !== 'assumption' &&
    !decision.repairEvidence.length).sort(attentionOrder);
  const groups = {
    workingToAssumption:decisions.filter(decision => decision.currentState.kind === 'assumption'),
    answered:decisions.filter(decision => decision.currentState.kind === 'answered'),
    dormant:decisions.filter(decision => decision.currentState.kind === 'dormant'),
    moot:decisions.filter(decision => decision.currentState.kind === 'moot'),
    repair:decisions.filter(decision => decision.currentState.kind === 'repair'),
  };
  const selectionCandidates = decisions.filter(decision => decision.availability === 'active')
    .sort(initialSelectionOrder);
  return {title:projected.title, date:projected.dateStr && projected.dateStr !== 'off' ? projected.dateStr : null,
    today:projected.today, verdict:verdict(projected), periods, lanes, cells, items, decisions, attention, groups,
    selectionCandidates,
    modelHealth:[...(projected.warnings || [])],
    initialSelection:selectionCandidates[0]
      ? {key:selectionCandidates[0].key, srcLine:selectionCandidates[0].srcLine} : null};
}

function withoutSelectedAnswer(model, key){
  const source = model.decisionByName[key];
  if(!source) return model;
  const replacement = {...source, answer:null};
  return {...model, decisions:model.decisions.map(decision => decision.key === key ? replacement : decision),
    decisionByName:{...model.decisionByName, [key]:replacement}};
}

function branchItem(item, projection, itemByIdentity){
  const projected = itemByIdentity.get(item.identity);
  return {value:projected?.conditionResult?.value || 'invalid', itemState:projected?.itemState || 'waiting',
    displayState:projected ? itemDisplayState(projected, projection) : {kind:'repair', sentence:'Logic needs repair'}};
}

function impactItem(item, projected, yes, no, itemIndexes){
  const current = itemIndexes.current.get(item.identity) || item;
  return {item:itemView(current, projected), yes:branchItem(item, yes, itemIndexes.yes),
    no:branchItem(item, no, itemIndexes.no)};
}

function availabilityView(decision){
  return {availability:decision?.availability || 'dormant', value:decision?.value || 'unknown',
    effectiveAnswer:decision?.effectiveAnswer || null};
}

function whenEffects(model, projected, key, yes, no){
  const descendants = downstreamDecisionKeys(projected, key);
  const all = [];
  for(const source of model.decisions){
    if(source.key === key || !descendants.has(source.key)) continue;
    const yesDecision = yes.decisionByName[source.key];
    const noDecision = no.decisionByName[source.key];
    const yesState = availabilityView(yesDecision), noState = availabilityView(noDecision);
    if(JSON.stringify(yesState) === JSON.stringify(noState)) continue;
    const directTerm = source.when?.terms?.find(term => term.key === key) || null;
    all.push({key:source.key, name:source.name, question:source.question || '',
      relation:directTerm ? source.when.terms.length === 1 ? 'direct' : source.when.operator : 'downstream',
      selectedDirection:directTerm ? directionFor(directTerm) : null,
      condition:conditionView(source.when, projectedDecisionMap(projected)), yes:yesState, no:noState});
  }
  const mayOpen = [], makesIrrelevant = [], alsoNeeds = [], eitherCanUnlock = [];
  for(const entry of all){
    if(entry.yes.availability === 'active' && entry.no.availability !== 'active')
      mayOpen.push({direction:'yes', ...entry});
    if(entry.no.availability === 'active' && entry.yes.availability !== 'active')
      mayOpen.push({direction:'no', ...entry});
    if(entry.yes.availability === 'moot' && entry.no.availability !== 'moot')
      makesIrrelevant.push({direction:'yes', ...entry});
    if(entry.no.availability === 'moot' && entry.yes.availability !== 'moot')
      makesIrrelevant.push({direction:'no', ...entry});
    if(entry.relation === 'and') alsoNeeds.push(entry);
    if(entry.relation === 'or') eitherCanUnlock.push(entry);
  }
  return {all, mayOpen, makesIrrelevant, alsoNeeds, eitherCanUnlock};
}

function impactRepairEvidence(projected, decision, relatedItems){
  const entries = decisionRepairEvidence(projected, decision).map(evidence => ({scope:'decision', evidence}));
  for(const item of relatedItems.filter(candidate => !candidate.condition?.valid)) entries.push({scope:'item',
    item:{identity:item.identity, title:item.title, srcLine:item.srcLine},
    evidence:{kind:'invalid-condition', sentence:'Logic needs repair'}});
  const selectedLines = new Set([decision.srcLine + 1, ...Object.values(decision.fieldLines || {})]);
  for(const warning of projected.warnings || []){
    if(!REPAIR_WARNING_CODES.has(warning.code)) continue;
    if(selectedLines.has(warning.line) || String(warning.subject || '').split(':').includes(decision.key)){
      if(!entries.some(entry => entry.evidence.code === warning.code && entry.evidence.line === warning.line))
        entries.push({scope:'warning', evidence:{kind:'warning', code:warning.code,
          sentence:warning.message, line:warning.line}});
    }
  }
  return entries;
}

function termSentence(term){
  return `${sentenceName(term.name)} = ${term.direction}`;
}

function branchWorkSentence(outcome){
  if(outcome.itemState === 'in-plan') return 'Would be in the plan';
  if(outcome.itemState === 'not-needed') return 'Would not be pursued';
  if(outcome.itemState === 'limbo') return 'Would be working to an assumption';
  if(outcome.itemState === 'waiting') return 'Would still be waiting';
  return 'Logic would still need repair';
}

function branchDecisionSentence(state){
  if(state.availability === 'active') return state.effectiveAnswer
    ? `Would be open with a recorded ${state.effectiveAnswer} answer` : 'Would be open';
  if(state.availability === 'moot') return 'Would no longer apply';
  return 'Would not be open yet';
}

function impactNarrativeProjection(impact){
  const selected = impact.decision;
  const selectedName = sentenceName(selected.name || selected.key);
  const direct = ['yes', 'no'].flatMap(direction => impact.direct[direction].map(entry => ({
    identity:entry.item.identity, title:entry.item.title, direction,
    sentence:`${entry.item.title} — changes directly when ${selectedName} = ${direction}`,
  })));
  const alsoNeeds = impact.compound.and.map(entry => {
    const others = joinTerms(entry.otherTerms, 'and');
    return {identity:entry.item.identity, title:entry.item.title, direction:entry.selectedDirection,
      sentence:`${entry.item.title} — ${selectedName} = ${entry.selectedDirection} is necessary, not sufficient; also needs ${others}`};
  });
  const eitherCanUnlock = impact.compound.or.map(entry => ({
    identity:entry.item.identity, title:entry.item.title, direction:entry.selectedDirection,
    sentence:`${entry.item.title} — either ${joinTerms(entry.condition.terms, 'or')} can unlock this work`,
  }));
  const mayOpen = impact.whenEffects.mayOpen.map(entry => ({key:entry.key, direction:entry.direction,
    sentence:`If answered ${entry.direction}, may open ${entry.question || sentenceName(entry.name)}`}));
  const makesIrrelevant = impact.whenEffects.makesIrrelevant.map(entry => ({key:entry.key,
    direction:entry.direction,
    sentence:`If answered ${entry.direction}, makes ${entry.question || sentenceName(entry.name)} irrelevant`}));
  const completedHistory = impact.completedHistory.map(entry => ({identity:entry.item.identity,
    title:entry.item.title,
    sentence:`${entry.item.title} — completed history; ${lowerFirst(entry.item.displayState.sentence)}`}));
  const repairEvidence = impact.repairEvidence.map(entry => ({scope:entry.scope,
    title:entry.item?.title || null, sentence:entry.item
      ? `${entry.item.title} — ${entry.evidence.sentence}` : entry.evidence.sentence}));
  const entries = [...impact.direct.yes, ...impact.direct.no,
    ...impact.compound.and, ...impact.compound.or];
  const uniqueEntries = [...new Map(entries.map(entry => [entry.item.identity, entry])).values()];
  const branches = Object.fromEntries(['yes', 'no'].map(direction => [direction, {
    work:uniqueEntries.map(entry => ({identity:entry.item.identity, title:entry.item.title,
      relation:entry.condition.terms.length === 1 ? 'direct' : entry.condition.operator.toUpperCase(),
      requirement:joinTerms(entry.condition.terms, entry.condition.operator),
      sentence:branchWorkSentence(entry[direction])})),
    decisions:impact.whenEffects.all.map(entry => ({key:entry.key,
      question:entry.question || sentenceName(entry.name), relation:entry.relation,
      sentence:branchDecisionSentence(entry[direction])})),
  }]));
  return {
    continues:impact.continues.map(entry => ({identity:entry.item.identity, title:entry.item.title,
      sentence:`${entry.item.title} — ${entry.item.displayState.sentence}`})),
    direct, alsoNeeds, eitherCanUnlock, mayOpen, makesIrrelevant,
    completedHistory, repairEvidence, branches,
  };
}

export function decisionImpactProjection(model, projected, key){
  const selectedKey = String(key || '').toLowerCase();
  const decision = projectedDecisionMap(projected)[selectedKey];
  if(!decision || !model?.decisionByName?.[selectedKey]) return null;
  const comparisonModel = withoutSelectedAnswer(model, selectedKey);
  const yes = evaluate(comparisonModel, projected.today, {[selectedKey]:'yes'});
  const no = evaluate(comparisonModel, projected.today, {[selectedKey]:'no'});
  const itemIndexes = {
    current:new Map(projected.items.map(item => [item.identity, item])),
    yes:new Map(yes.items.map(item => [item.identity, item])),
    no:new Map(no.items.map(item => [item.identity, item])),
  };
  const relatedItems = (model.items || []).filter(item => item.condition?.terms?.some(term => term.key === selectedKey));
  const valid = relatedItems.filter(item => item.condition?.valid && item.status !== 'done');
  const direct = {yes:[], no:[]};
  const compound = {and:[], or:[]};
  for(const source of valid){
    const entry = impactItem(source, projected, yes, no, itemIndexes);
    const selectedTerm = source.condition.terms.find(term => term.key === selectedKey);
    const enriched = {...entry, selectedDirection:directionFor(selectedTerm),
      condition:conditionView(source.condition, projectedDecisionMap(projected)),
      otherTerms:source.condition.terms.filter(term => term.key !== selectedKey)
        .map(term => termView(term, projectedDecisionMap(projected)))};
    if(source.condition.terms.length === 1) direct[enriched.selectedDirection].push(enriched);
    else compound[source.condition.operator].push(enriched);
  }
  const completedHistory = relatedItems.filter(item => item.status === 'done' && item.condition?.valid)
    .map(item => impactItem(item, projected, yes, no, itemIndexes));
  const continues = (model.items || []).flatMap(source => {
    if(source.status === 'done' || !source.condition?.valid && source.condition) return [];
    const yesOutcome = branchItem(source, yes, itemIndexes.yes);
    const noOutcome = branchItem(source, no, itemIndexes.no);
    const current = itemIndexes.current.get(source.identity) || source;
    return yesOutcome.itemState === 'in-plan' && noOutcome.itemState === 'in-plan'
      ? [{item:itemView(current, projected), yes:yesOutcome, no:noOutcome}] : [];
  });
  const repairs = decisionRepairEvidence(projected, decision);
  const impact = {key:selectedKey, decision:decisionView(projected, decision),
    currentState:decisionCurrentState(projected, decision, repairs),
    continues, direct, compound, whenEffects:whenEffects(model, projected, selectedKey, yes, no),
    completedHistory, repairEvidence:impactRepairEvidence(projected, decision, relatedItems),
    counterfactuals:{yes:{decision:availabilityView(yes.decisionByName[selectedKey])},
      no:{decision:availabilityView(no.decisionByName[selectedKey])}}};
  impact.narrative = impactNarrativeProjection(impact);
  return impact;
}
