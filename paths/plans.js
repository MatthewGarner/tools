/* Possible-plan enumeration for /paths. Pure and memoised per parsed model. */

import {evaluate, projectItemStates, resolveDecisions} from './evaluate.js';

export const PLAN_CAP = 6;
const CACHE = new WeakMap();

function enumerableDecisions(model, today, current){
  const candidates = model.decisions.filter(decision => !decision.answer?.direction &&
    !decision.cycle && (!decision.when || decision.when.valid));
  const seed = candidates.filter(decision => {
    if(!decision.when) return true;
    const referencesUnanswered = decision.when.terms.some(term => {
      const dependency = model.decisionByName[term.key];
      return dependency && !dependency.answer?.direction && !dependency.cycle;
    });
    return !referencesUnanswered && current.decisionByName[decision.key]?.availability === 'active';
  });
  if(seed.length > PLAN_CAP) return {decisions:seed, refusedCount:seed.length};

  const enumerable = [...seed];
  const included = new Set(seed.map(decision => decision.key));
  while(true){
    const assignments = assignmentRows(enumerable, current);
    const reachable = candidates.filter(decision => !included.has(decision.key) && assignments.some(answers =>
      resolveDecisions(model, today, answers).decisionByName[decision.key]?.availability === 'active'));
    if(!reachable.length) break;
    if(enumerable.length + reachable.length > PLAN_CAP){
      return {decisions:enumerable, refusedCount:enumerable.length + reachable.length};
    }
    for(const decision of reachable){ enumerable.push(decision); included.add(decision.key); }
    enumerable.sort((a, b) => a.srcLine - b.srcLine);
  }
  return {decisions:enumerable, refusedCount:null};
}

function countWord(n){
  const words = ['Zero','One','Two','Three','Four','Five','Six','Seven','Eight','Nine','Ten','Eleven','Twelve'];
  return words[n] || String(n);
}

export function refusalReason(count){
  return `${countWord(count)} open questions would make ${2 ** count} possible plans. Answer one, or use the Tree view.`;
}

export function equivalenceSignature(items){
  return JSON.stringify(items.filter(item => !item.condition || item.condition.valid).map(item =>
    [item.identity, item.itemState, item.period, item.status]));
}

function assignmentRows(decisions, current, index = 0, assignment = {}, out = []){
  if(index === decisions.length){ out.push({...assignment}); return out; }
  const decision = decisions[index];
  const assumed = current.decisionByName[decision.key]?.assumption;
  const arms = assumed?.inForce ? [assumed.direction, assumed.direction === 'yes' ? 'no' : 'yes'] : ['yes', 'no'];
  for(const arm of arms){
    assignment[decision.key] = arm;
    assignmentRows(decisions, current, index + 1, assignment, out);
  }
  delete assignment[decision.key];
  return out;
}

function labelsFor(decisions, projected){
  return decisions.map(decision => {
    const state = projected.decisionByName[decision.key];
    return state.availability === 'active' && state.effectiveAnswer
      ? `${decision.name} — Answer: ${state.effectiveAnswer}`
      : `${decision.name} — Not open yet`;
  });
}

function sharesFor(current, worlds, stateByWorld){
  if(!worlds.length) return null;
  const eligible = current.items.filter(item => item.status !== 'done' &&
    stateByWorld.some(states => states.get(item.identity) === 'in-plan'));
  const denominator = eligible.length;
  if(!denominator) return null;
  let shared = 0, assumed = 0;
  for(const item of eligible){
    const inEvery = stateByWorld.every(states => states.get(item.identity) === 'in-plan');
    if(inEvery){ shared++; continue; }
    if([...item.conditionResult.provenance].some(member => member.startsWith('assumed-'))) assumed++;
  }
  const dependent = denominator - shared - assumed;
  const sharedShare = shared / denominator;
  const assumedShare = assumed / denominator;
  return {denominator, shared, assumed, dependent, sharedShare, assumedShare,
    dependentShare:1 - sharedShare - assumedShare};
}

function withoutAnswer(model, key){
  const source = model.decisionByName[key];
  if(!source?.answer?.direction) return model;
  const replacement = {...source, answer:null};
  return {...model,
    decisions:model.decisions.map(decision => decision.key === key ? replacement : decision),
    decisionByName:{...model.decisionByName, [key]:replacement}};
}

function withReach(model, today, current){
  const reaches = new Map();
  for(const decision of model.decisions){
    const comparisonModel = withoutAnswer(model, decision.key);
    const yes = projectItemStates(comparisonModel, today, {[decision.key]:'yes'});
    const no = projectItemStates(comparisonModel, today, {[decision.key]:'no'});
    let reach = 0;
    for(let index = 0; index < yes.length; index++){
      if(yes[index] !== no[index]) reach++;
    }
    reaches.set(decision.key, reach);
  }
  const decisions = current.decisions.map(decision => ({...decision, reach:reaches.get(decision.key) || 0}));
  const decisionByName = Object.fromEntries(decisions.map(decision => [decision.key, decision]));
  return {...current, decisions, decisionByName,
    reachDenominator:current.items.filter(item => item.status !== 'done').length};
}

function calculate(model, today){
  const current = withReach(model, today, evaluate(model, today));
  const reachability = enumerableDecisions(model, today, current);
  const enumerable = reachability.decisions;
  if(reachability.refusedCount){
    const enumerableCount = reachability.refusedCount;
    const reason = refusalReason(enumerableCount);
    const warning = {phase:'project', code:'possible-plan-refusal', line:null,
      subject:'worlds', message:reason};
    return {...current, warnings:[...current.warnings, warning], worlds:{refused:true, reason, enumerableCount},
      shares:null, matrix:[]};
  }
  const enumerableCount = enumerable.length;

  const assignments = assignmentRows(enumerable, current);
  const merged = new Map();
  for(const answers of assignments){
    const projected = evaluate(model, today, answers);
    const signature = equivalenceSignature(projected.items);
    const labels = labelsFor(enumerable, projected);
    if(merged.has(signature)){
      const entry = merged.get(signature);
      entry.covers++;
      entry.assignments.push({answers:{...answers}, labels});
    } else {
      merged.set(signature, {signature, covers:1, assignments:[{answers:{...answers}, labels}],
        labels, items:projected.items, decisions:projected.decisions});
    }
  }
  const plans = [...merged.values()];
  /* Matrix/share aggregation asks for the same item state many times. Index
     each merged plan once instead of repeatedly scanning all of its items. */
  const stateByPlan = plans.map(plan => new Map(plan.items.map(item => [item.identity, item.itemState])));
  const matrix = current.items.map(item => ({identity:item.identity, period:item.period, status:item.status,
    states:stateByPlan.map(states => states.get(item.identity))}));
  const shares = sharesFor(current, plans, stateByPlan);
  return {...current, worlds:{refused:false, enumerableCount, possibleCount:assignments.length, plans}, shares, matrix};
}

export function enumeratePlans(model, today){
  let byToday = CACHE.get(model);
  if(!byToday){ byToday = new Map(); CACHE.set(model, byToday); }
  const key = model.today || today || '';
  if(!byToday.has(key)) byToday.set(key, calculate(model, today));
  return byToday.get(key);
}

export const projectPlans = enumeratePlans;
export const plans = enumeratePlans;
