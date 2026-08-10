/* /paths verdict selection. Pure; presentation consumes the returned copy. */

const NUMBER_WORDS = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine'];

function proseNumber(value, capital = false){
  const word = NUMBER_WORDS[value] || String(value);
  return capital ? word[0].toUpperCase() + word.slice(1) : word;
}

function civilDay(date){
  if(!/^\d{4}-\d{2}-\d{2}$/.test(date || '')) return null;
  let [year, month, day] = date.split('-').map(Number);
  year -= month <= 2 ? 1 : 0;
  const era = Math.floor(year / 400);
  const yearOfEra = year - era * 400;
  const shiftedMonth = month + (month > 2 ? -3 : 9);
  const dayOfYear = Math.floor((153 * shiftedMonth + 2) / 5) + day - 1;
  const dayOfEra = yearOfEra * 365 + Math.floor(yearOfEra / 4) -
    Math.floor(yearOfEra / 100) + dayOfYear;
  return era * 146097 + dayOfEra;
}

function dueLabel(date){
  if(!/^\d{4}-\d{2}-\d{2}$/.test(date || '')) return date || '';
  const [, month, day] = date.split('-').map(Number);
  const months = ['January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'];
  return `${day} ${months[month - 1]}`;
}

function decisionName(decision){
  return decision.name || decision.question || decision.key || 'question';
}

function dueOrder(left, right){
  if(left.answerBy && right.answerBy && left.answerBy !== right.answerBy){
    return left.answerBy.localeCompare(right.answerBy);
  }
  if(left.answerBy && !right.answerBy) return -1;
  if(!left.answerBy && right.answerBy) return 1;
  return (left.srcLine ?? Infinity) - (right.srcLine ?? Infinity);
}

function provenanceOf(item){
  return item?.conditionResult?.provenance || item?.provenance || [];
}

function followsAssumption(item, decision){
  if(item.itemState && item.itemState !== 'in-plan') return false;
  const markers = [...provenanceOf(item)].filter(marker => String(marker).startsWith('assumed-'));
  if(!markers.length) return false;
  if(!decision?.key) return true;
  return markers.some(marker => String(marker).includes(decision.key)) || item.parentDecision === decision.key;
}

function assumedDirection(decision){
  return decision.assumption?.direction ||
    (!decision.answer?.direction ? decision.effectiveAnswer : null);
}

function configuredVerdict(projection){
  const direct = projection?.verdict?.line ?? projection?.verdict;
  const value = direct ?? projection?.config?.verdict;
  return typeof value === 'string' ? {line:value.trim()} : null;
}

function firstFigure(line){
  return line.match(/(^|[^\p{L}\p{N}_])([+-]?(?:\d[\d,.]*)(?:%|×|x)?)(?=$|[^\p{L}\p{N}_])/u)?.[2] || '';
}

export function verdict(projection){
  const configured = configuredVerdict(projection);
  if(configured && (!configured.line || configured.line.toLowerCase() === 'off')) return null;
  if(configured) return {line:configured.line, fig:firstFigure(configured.line)};

  const decisions = projection?.decisions || [];
  const items = projection?.items || [];
  const overdue = decisions.filter(decision => decision.overdue).sort(dueOrder)[0];
  if(overdue){
    const due = civilDay(overdue.answerBy);
    const today = civilDay(projection?.today);
    const days = overdue.daysOverdue ?? (due == null || today == null ? 0 : today - due);
    const fig = `${days} ${days === 1 ? 'day' : 'days'} overdue`;
    const direction = assumedDirection(overdue);
    const following = direction ? items.filter(item => followsAssumption(item, overdue)).length : 0;
    const clause = following
      ? `; ${following} ${following === 1 ? 'item is' : 'items are'} following an assumed ${direction}`
      : '';
    return {line:`The ${decisionName(overdue)} answer is ${fig}${clause}.`, fig};
  }

  const untestable = decisions.filter(decision => !decision.signal || !decision.owner);
  if(untestable.length){
    const fig = `${untestable.length} ${untestable.length === 1 ? 'question' : 'questions'}`;
    const has = untestable.length === 1 ? 'has' : 'have';
    const verb = untestable.length === 1 ? 'it cannot' : 'they cannot';
    return {line:`${fig} ${has} no signal or owner — ${verb} be answered as written.`, fig};
  }

  const ranked = decisions.filter(decision => Number(decision.reach) > 0).sort((left, right) =>
    right.reach - left.reach || dueOrder(left, right));
  if(ranked.length){
    const decision = ranked[0];
    const fig = `${proseNumber(decision.reach, true)} of ${proseNumber(projection.reachDenominator)}`;
    return {line:`${fig} items depend on the ${decisionName(decision)} answer, due ${dueLabel(decision.answerBy)}.`, fig};
  }

  if(!decisions.length){
    const fig = 'No questions yet';
    return {line:`${fig} — this is a plan, not a fork.`, fig};
  }

  const fig = 'Every item';
  return {line:`${fig} is included in every remaining plan.`, fig};
}

export default verdict;
