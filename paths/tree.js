/* /paths Tree topology. Pure; consumes the shared project.js contract. */

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

function terminalFor(worlds){
  if(worlds?.refused){
    const openQuestionCount = Number(worlds.enumerableCount);
    const possibleCount = 2 ** openQuestionCount;
    return {
      kind:'limit',
      openQuestionCount:Number.isFinite(openQuestionCount) ? openQuestionCount : null,
      possibleCount:Number.isSafeInteger(possibleCount) ? possibleCount : null,
      reason:String(worlds.reason || ''),
    };
  }
  if(Number(worlds?.enumerableCount) === 0) return null;
  const possibleCount = Number(worlds?.possibleCount);
  return {kind:'count', possibleCount:Number.isFinite(possibleCount) ? possibleCount : 1};
}

export function treeProjection(projected){
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
    const rejected = stumpSide === 'yes' ? yes : stumpSide === 'no' ? no : [];
    const stumpItems = rejected.filter(item => item.itemState === 'not-needed');
    const continuation = chosen
      ? (chosen === 'yes' ? yes : no).filter(item => item.itemState !== 'not-needed') : [];
    const retainedRejected = chosen
      ? rejected.filter(item => item.itemState !== 'not-needed') : [];
    return {
      key:decision.key,
      decision,
      displayState:displayState(decision, projected.today),
      reach:decision.reach,
      chosenSide:chosen || null,
      /* Answered questions still keep completed work on the arm where it
         actually happened. Live work on the selected arm becomes a
         continuation even when another conjunct means it is waiting/limbo. */
      arms:chosen ? {
        yes:stumpSide === 'yes' ? retainedRejected : [],
        no:stumpSide === 'no' ? retainedRejected : [],
      } : {yes, no},
      continuation,
      stump:stumpItems.length ? {side:stumpSide, items:stumpItems, count:stumpItems.length} : null,
    };
  });

  const questionByKey = new Map(questions.map(question => [question.key, question]));
  const breadcrumbs = ordered.filter(({decision}) => decision.effectiveAnswer).map(({decision}) => {
    const question = questionByKey.get(decision.key);
    return {key:decision.key, decision, direction:decision.effectiveAnswer,
      chosenSide:question?.chosenSide || decision.effectiveAnswer,
      arms:question?.arms || {yes:[], no:[]},
      continuation:question?.continuation || [],
      stump:question?.stump || null};
  });

  return {today:projected.today, spine, questions, unplaced, breadcrumbs,
    terminal:terminalFor(projected.worlds),
    reachDenominator:projected.reachDenominator, warnings:projected.warnings};
}
