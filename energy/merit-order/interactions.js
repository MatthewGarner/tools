/* Small DOM-independent interaction primitives: app.js supplies the actual
   pointer-capture methods and render callbacks; tests can prove every terminal
   event releases the drag exactly once. */
export function createPointerDrag({capture, release, onMove, onSettle}){
  let activePointerId = null;

  function end(pointerId, shouldRelease){
    if(pointerId !== activePointerId) return false;
    activePointerId = null;
    if(shouldRelease) release(pointerId);
    onSettle();
    return true;
  }

  return {
    get activePointerId(){ return activePointerId; },
    start(pointerId){
      if(activePointerId !== null) return false;
      activePointerId = pointerId;
      capture(pointerId);
      return true;
    },
    move(pointerId, clientX){
      if(pointerId !== activePointerId) return false;
      onMove(clientX, pointerId);
      return true;
    },
    finish(pointerId){ return end(pointerId, true); },
    cancel(pointerId){ return end(pointerId, true); },
    lost(pointerId){ return end(pointerId, false); },
  };
}

export function calloutPosition(anchor, pop, viewport, pad = 8, gap = 6){
  const maxLeft = Math.max(pad, viewport.width - pop.width - pad);
  const left = Math.round(Math.min(Math.max(pad, anchor.left), maxLeft));
  const below = anchor.bottom + gap;
  const top = below + pop.height <= viewport.height - pad
    ? below
    : Math.max(pad, anchor.top - pop.height - gap);
  return {left, top: Math.round(top)};
}
