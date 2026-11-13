/* Actual calendar time, not effort, progress or a duration distribution.
   No clock is read here: the app passes the same effective UTC today as rendering. */
export function timingFacts(item, today){
  const started = Number.isInteger(item.started) ? item.started : null;
  const completed = item.status === 'done';
  let issue = null;
  if(started !== null){
    if(item.status === 'fixed') issue = 'A fixed event has no work start';
    else if(!Number.isInteger(today)) issue = 'Today is unavailable';
    else if(started > today) issue = 'Actual start is after today';
    else if(started > item.p50) issue = 'Actual start is after ' + (completed ? 'completion' : 'P50 finish');
    else if(completed && item.p50 > today) issue = 'Completion is after today';
  }
  const valid = started !== null && !issue;
  const end = valid ? completed ? item.p50 : today : null;
  return {started, valid, issue, completed, end,
    elapsedDays: valid ? end - started : null,
    p50DurationDays: valid ? item.p50 - started : null,
    p90DurationDays: valid ? item.p90 - started : null};
}
