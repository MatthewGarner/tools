/* Focus trap + restore for a popover of buttons — shared by assets/edit-in-place.js
   and the energy tools' own (non-edit-in-place) callout popovers (merit-order,
   intraday). Split out of edit-in-place.js so pages with no DSL editor (intraday
   has no [data-edit] targets of its own) don't pull in that module's unrelated
   attachEditInPlace machinery just for this one helper — a real byte-budget hit
   on intraday's much smaller page (dev/weight.test.mjs). */

/* Focuses the first button on open; Escape and (for action menus) a wrapping
   Tab/Shift+Tab live on the popover itself. Informational callouts can opt out
   of the Tab trap: they are not dialogs and must not create a keyboard island.
   `onEscape` is the caller's real close() function. */
export function trapPopoverFocus(pop, onEscape, {trap = true} = {}){
  const buttons = () => [...pop.querySelectorAll('button')];
  pop.addEventListener('keydown', e => {
    if(e.key === 'Escape'){ e.preventDefault(); onEscape(); return; }
    if(e.key !== 'Tab' || !trap) return;
    const bs = buttons();
    if(!bs.length){ e.preventDefault(); return; }   // action popover with no button: retain a safe focus loop
    const first = bs[0], last = bs[bs.length - 1];
    if(e.shiftKey && document.activeElement === first){ e.preventDefault(); last.focus(); }
    else if(!e.shiftKey && document.activeElement === last){ e.preventDefault(); first.focus(); }
  });
  const first = pop.querySelector('button');
  if(first) first.focus();
  else { pop.tabIndex = -1; pop.focus(); }   // read-only popover (e.g. intraday's callout): focus the container itself
}
