/* Shared narrow-bucket plumbing for the energy shells (extracted 2026-07-11,
   5th-consumer rule): the NARROW=520 + ResizeObserver bucket-flip pattern
   cycles/risk/merit-order/intraday each carried — a width read against a
   threshold, and a resize watcher that only fires when the narrow/wide
   bucket actually flips (not on every resize tick). Each shell keeps its own
   fallback (cycles/risk/merit-order want `undefined` so the renderer falls
   back to its own constant; intraday wants a concrete `900`) and its own
   threshold if it ever needs one — both default to the 520px the whole
   suite has settled on. */

export function narrowWidth(el, {threshold = 520, fallback} = {}){
  const w = el.clientWidth;
  return (w && w < threshold) ? w : fallback;
}

/* Observes `el`; calls onFlip() only when the narrow/wide bucket changes
   (first observation always fires, since lastBucket starts null). Returns
   the ResizeObserver in case a caller ever needs to disconnect it. */
export function watchNarrowBucket(el, onFlip, {threshold = 520} = {}){
  let lastBucket = null;
  const ro = new ResizeObserver(() => {
    const w = el.clientWidth;
    const bucket = (w && w < threshold) ? 'narrow' : 'wide';
    if(bucket === lastBucket) return;
    lastBucket = bucket;
    onFlip(bucket);
  });
  ro.observe(el, {box: 'content-box'});
  return ro;
}
