/* /paths Tree topology. Pure; display copy and geometry belong to later layers. */

import {enumeratePlans} from './plans.js';

function dueOrder(left, right){
  const leftDue = left.decision.answerBy;
  const rightDue = right.decision.answerBy;
  if(leftDue && rightDue && leftDue !== rightDue) return leftDue.localeCompare(rightDue);
  if(leftDue && !rightDue) return -1;
  if(!leftDue && rightDue) return 1;
  return left.decision.srcLine - right.decision.srcLine || left.sourceIndex - right.sourceIndex;
}

function civilDay(date){
  if(!/^\d{4}-\d{2}-\d{2}$/.test(date || '')) return null;
  let [year, month, day] = date.split('-').map(Number);
  year -= month <= 2 ? 1 : 0;
  const era = Math.floor(year / 400);
  const yearOfEra = year - era * 400;
  const shiftedMonth = month + (month > 2 ? -3 : 9);
  const dayOfYear = Math.floor((153 * shiftedMonth + 2) / 5) + day - 1;
  const dayOfEra = yearOfEra * 365 + Math.floor(yearOfEra / 4) - Math.floor(yearOfEra / 100) + dayOfYear;
  return era * 146097 + dayOfEra;
}

function displayState(decision, today){
  if(decision.availability === 'moot') return {kind:'not-applicable'};
  if(decision.availability === 'dormant') return {kind:'not-open'};
  if(decision.effectiveAnswer) return {kind:'answered', direction:decision.effectiveAnswer};
  if(decision.overdue){
    const dueDay = civilDay(decision.answerBy);
    const todayDay = civilDay(today);
    return {kind:'overdue', days:dueDay == null || todayDay == null ? null : todayDay - dueDay};
  }
  return {kind:'open'};
}

function armFor(item){
  const term = item.condition?.terms?.find(candidate => candidate.key === item.parentDecision);
  if(!term) return null;
  return term.negated ? 'no' : 'yes';
}

export function treeProjection(model, today){
  const projected = enumeratePlans(model, today);
  const spine = projected.items.filter(item => !item.condition);
  const unplaced = projected.items.filter(item => item.condition && !item.parentDecision);
  const sourceOrder = new Map(projected.decisions.map((decision, index) => [decision.key, index]));
  const ordered = projected.decisions.map(decision => ({decision,
    sourceIndex:sourceOrder.get(decision.key)})).sort(dueOrder);

  const questions = ordered.map(({decision}) => {
    const memberships = projected.items.filter(item => item.parentDecision === decision.key);
    const yes = memberships.filter(item => armFor(item) === 'yes');
    const no = memberships.filter(item => armFor(item) === 'no');
    const chosen = decision.effectiveAnswer;
    const stumpSide = chosen ? (chosen === 'yes' ? 'no' : 'yes') : null;
    const stumpItems = stumpSide === 'yes' ? yes : stumpSide === 'no' ? no : [];
    return {
      key:decision.key,
      decision,
      displayState:displayState(decision, projected.today),
      reach:decision.reach,
      arms:{
        yes:stumpSide === 'yes' ? [] : yes,
        no:stumpSide === 'no' ? [] : no,
      },
      stump:stumpSide ? {side:stumpSide, items:stumpItems, count:stumpItems.length} : null,
    };
  });

  const breadcrumbs = ordered.filter(({decision}) => decision.effectiveAnswer).map(({decision}) => ({
    key:decision.key,
    decision,
    direction:decision.effectiveAnswer,
  }));

  return {today:projected.today, spine, questions, unplaced, breadcrumbs,
    reachDenominator:projected.reachDenominator, warnings:projected.warnings};
}
