/* One compatibility click follows a completed pointer drag.  Keep suppression
   scoped to that exact pointer + rendered component, and only for the current
   event turn: a cancelled/outside gesture must never eat a later click. */
export function makeDragClickGuard(defer = fn => setTimeout(fn, 0)){
  let pending = null;
  let generation = 0;

  function clear(pointerId = null){
    if(!pending) return;
    if(pointerId !== null && pending.pointerId !== pointerId) return;
    pending = null;
  }

  function arm(pointerId, componentKey){
    const token = ++generation;
    pending = {token, pointerId, componentKey};
    defer(() => {
      if(pending && pending.token === token) pending = null;
    });
  }

  function consume(pointerId, componentKey){
    if(!pending) return false;
    const candidate = pending;
    pending = null; // every click is one-shot, including a non-match
    /* Safari versions that still expose compatibility click as MouseEvent do
       not carry pointerId.  The exact component + same-turn expiry still make
       that legacy click safe to consume. */
    const samePointer = pointerId === null || candidate.pointerId === pointerId;
    return samePointer && candidate.componentKey === componentKey;
  }

  return {arm, clear, consume};
}
