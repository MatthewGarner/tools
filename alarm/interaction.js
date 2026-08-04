const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

/* Pure keyboard policy for the rendered threshold handle. Keeping it outside the
   DOM shell makes the handle and the native range share one bounded value model.
   `bigStep` is the Shift-modified fast-nudge flag — nothing to do with the
   repo's coarse-POINTER (touch) vocabulary, so it gets its own name here. */
export function adjustThreshold(value, key, bigStep = false, {min = -3, max = 6} = {}){
  const direction = key === 'ArrowRight' || key === 'ArrowUp' ? 1
    : key === 'ArrowLeft' || key === 'ArrowDown' ? -1 : 0;
  if(!direction) return null;
  const step = bigStep ? 0.25 : 0.05;
  return Math.round(clamp(value + direction * step, min, max) * 100) / 100;
}

export const dragEndsForPointer = (activePointerId, pointerId) =>
  activePointerId != null && activePointerId === pointerId;
