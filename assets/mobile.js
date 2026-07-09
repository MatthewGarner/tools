/* Shared first-run helper: hash-safe auto-load of a default example, so every tool
   greets you with something rendered instead of a blank stage — on desktop and phone.
   One tool per page → a module singleton is correct. See
   docs/superpowers/specs/2026-07-08-mobile-experience-design.md §hash-safety. */

let _suppress = false;
/* Tools guard their writeHashState + localStorage writes with this so an auto-loaded
   example never rewrites a blank URL or seeds storage. Writes are debounced ~400ms; a
   one-shot flag cleared on the first genuine interaction is race-free (the guarded
   write is skipped until then). */
export const shouldPersist = () => !_suppress;

/* Render a default example (via `load`) on first run WITHOUT persisting to the URL or
   localStorage. The first real pointer/key interaction re-enables persistence. Always
   returns true (the caller then skips its normal empty render). */
export function autoloadExample(load){
  _suppress = true;
  const clear = () => { _suppress = false; };
  addEventListener('pointerdown', clear, {once: true, capture: true});
  addEventListener('keydown', clear, {once: true, capture: true});
  load();
  return true;
}
