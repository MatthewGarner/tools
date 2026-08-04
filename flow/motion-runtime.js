/* Pure policy for the queue strip's long-running animation loop. */

export function queueMotionAllowed({reduced = false, hidden = false, visible = false, hasEvents = false} = {}){
  return Boolean(hasEvents && visible && !hidden && !reduced);
}

export function queueTime(now, start, {t0, t1}, duration = 12000){
  const span = Math.max(0, t1 - t0);
  if(!span || duration <= 0) return t0;
  const elapsed = Math.max(0, now - start);
  return t0 + ((elapsed / duration) % 1) * span;
}

export function flowHashState(p, controls){
  return {d: p.demandPerWeek, s: p.itemDays, t: p.team,
    w: Number(controls.wip), v: p.cov, tc: Number(controls.transactionCost),
    hc: Number(controls.holdCost), b: Number(controls.batch), q: Number(controls.backlog)};
}
