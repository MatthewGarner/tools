/* Shared mobile helpers: viewport gate + hash-safe first-run auto-load.
   One tool per page → a module singleton is correct. See
   docs/superpowers/specs/2026-07-08-mobile-experience-design.md §hash-safety. */
export const isMobile = () =>
  matchMedia('(max-width: 900px) and (pointer: coarse)').matches;

let _suppress = false;
/* Tools guard their writeHashState call with this so an auto-loaded example never
   rewrites a blank URL. Writes are debounced ~400ms; a one-shot flag cleared on the
   first genuine interaction is race-free (the guarded write is skipped until then). */
export const shouldPersist = () => !_suppress;

/* On a phone, render a default example (via `load`) WITHOUT persisting to the URL.
   The first real pointer/key interaction re-enables persistence. Returns true if it
   auto-loaded (caller then skips its normal empty render). */
export function mobileAutoload(load){
  if(!isMobile()) return false;
  _suppress = true;
  const clear = () => { _suppress = false; };
  addEventListener('pointerdown', clear, {once: true, capture: true});
  addEventListener('keydown', clear, {once: true, capture: true});
  load();
  return true;
}
