/* Possible-plan enumeration for /paths. Pure and memoised per parsed model. */

import {evaluateOperation, project} from './evaluate.js';

export const PLAN_CAP = 6;
const CACHE = new WeakMap();

function possibleCondition(condition, possibleOf){
  if(!condition?.valid) return new Set(['invalid']);
  const operands = condition.terms.map(term => {
    const values = [...possibleOf(term.key)].map(value => {
      const operand = {value, provenance:new Set(), evidence:[]};
      return term.negated ? evaluateOperation('not', [operand]).value : value;
    });
    return [...new Set(values)];
  });
  let results = [{value:null}];
  for(const values of operands){
    const next = [];
    for(const prefix of results) for(const value of values){
      const list = prefix.operands ? [...prefix.operands, {value, provenance:new Set(), evidence:[]}]
        : [{value, provenance:new Set(), evidence:[]}];
      next.push({operands:list});
    }
    results = next;
  }
  const out = new Set();
  for(const row of results) out.add(evaluateOperation(condition.operator, row.operands || []).value);
  return out;
}

function enumerableDecisions(model){
  const memo = new Map(), visiting = new Set();
  function possibleOf(key){
    if(memo.has(key)) return memo.get(key);
    const decision = model.decisionByName[key];
    if(!decision || decision.cycle || visiting.has(key)) return new Set(['unknown']);
    visiting.add(key);
    let canOpen = true, canMoot = false;
    if(decision.when){
      if(!decision.when.valid) canOpen = false;
      else {
        const values = possibleCondition(decision.when, possibleOf);
        canOpen = values.has('true'); canMoot = values.has('false');
      }
    }
    const out = new Set();
    if(canOpen){
      if(decision.answer?.direction) out.add(decision.answer.direction === 'yes' ? 'true' : 'false');
      else { out.add('true'); out.add('false'); }
    }
    if(canMoot) out.add('false');
    if(!out.size) out.add('unknown');
    visiting.delete(key); memo.set(key, out);
    return out;
  }
  for(const decision of model.decisions) possibleOf(decision.key);
  return model.decisions.filter(decision => !decision.answer?.direction && !decision.cycle &&
    (!decision.when || decision.when.valid) && (() => {
      if(!decision.when) return true;
      return possibleCondition(decision.when, possibleOf).has('true');
    })());
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

function sharesFor(current, worlds){
  if(!worlds.length) return null;
  const eligible = current.items.filter(item => item.status !== 'done' && worlds.some(world => {
    const projected = world.items.find(candidate => candidate.identity === item.identity);
    return projected?.itemState === 'in-plan';
  }));
  const denominator = eligible.length;
  if(!denominator) return null;
  let shared = 0, assumed = 0;
  for(const item of eligible){
    const inEvery = worlds.every(world => world.items.find(candidate => candidate.identity === item.identity)?.itemState === 'in-plan');
    if(inEvery){ shared++; continue; }
    if([...item.conditionResult.provenance].some(member => member.startsWith('assumed-'))) assumed++;
  }
  const dependent = denominator - shared - assumed;
  const sharedShare = shared / denominator;
  const assumedShare = assumed / denominator;
  return {denominator, shared, assumed, dependent, sharedShare, assumedShare,
    dependentShare:1 - sharedShare - assumedShare};
}

function calculate(model, today){
  const current = project(model, today);
  const enumerable = enumerableDecisions(model);
  const enumerableCount = enumerable.length;
  if(enumerableCount > PLAN_CAP){
    const reason = refusalReason(enumerableCount);
    const warning = {phase:'project', code:'possible-plan-refusal', line:null,
      subject:'worlds', message:reason};
    return {...current, warnings:[...current.warnings, warning], worlds:{refused:true, reason, enumerableCount},
      shares:null, matrix:[]};
  }

  const assignments = assignmentRows(enumerable, current);
  const merged = new Map();
  for(const answers of assignments){
    const projected = project(model, today, answers);
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
  const matrix = current.items.map(item => ({identity:item.identity, period:item.period, status:item.status,
    states:plans.map(plan => plan.items.find(candidate => candidate.identity === item.identity)?.itemState)}));
  const shares = sharesFor(current, plans);
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

