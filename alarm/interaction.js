const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

/* Pure keyboard policy for the rendered threshold handle. Keeping it outside the
   DOM shell makes the handle and the native range share one bounded value model. */
export function adjustThreshold(value, key, coarse = false, {min = -3, max = 6} = {}){
  const direction = key === 'ArrowRight' || key === 'ArrowUp' ? 1
    : key === 'ArrowLeft' || key === 'ArrowDown' ? -1 : 0;
  if(!direction) return null;
  const step = coarse ? 0.25 : 0.05;
  return Math.round(clamp(value + direction * step, min, max) * 100) / 100;
}

export const dragEndsForPointer = (activePointerId, pointerId) =>
  activePointerId != null && activePointerId === pointerId;
