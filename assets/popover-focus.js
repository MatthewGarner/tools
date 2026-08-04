/* Focus trap + restore for a popover of buttons — shared by assets/edit-in-place.js
   and the energy tools' own (non-edit-in-place) callout popovers (merit-order,
   intraday). Split out of edit-in-place.js so pages with no DSL editor (intraday
   has no [data-edit] targets of its own) don't pull in that module's unrelated
   attachEditInPlace machinery just for this one helper — a real byte-budget hit
   on intraday's much smaller page (dev/weight.test.mjs). */

/* Focuses the first button on open; Escape and (for action menus) a wrapping
   Tab/Shift+Tab live on the popover itself, plus ArrowUp/ArrowDown roving focus
   (wrapping) and Home/End to the first/last row — standard menu keyboard
   semantics (ledger 34), on every popover of buttons (cycle/choice/action-menu
   alike — the roving-focus convention is generic; only the ARIA role is scoped
   to true action menus, applied by the caller that builds them). Informational
   callouts can opt out of the Tab trap: they are not dialogs and must not
   create a keyboard island. `onEscape` is the caller's real close() function. */
export function trapPopoverFocus(pop, onEscape, {trap = true} = {}){
  /* Two different element sets on purpose: `rovable` (buttons only) is what
     Arrow/Home/End step between — widening it to inputs would hijack a number
     input's native spinner arrows / a text input's Home-End cursor jump (the
     alarm claim dialog mixes both). `focusable` (buttons + enabled inputs) is
     the wider Tab-trap boundary — every real stop in the popover, so Tab still
     wraps correctly even when the first/last stop is an input, not a button. */
  const rovable = () => [...pop.querySelectorAll('button')];
  const focusable = () => [...pop.querySelectorAll('button, input:not([disabled])')];
  pop.addEventListener('keydown', e => {
    if(e.key === 'Escape'){ e.preventDefault(); onEscape(); return; }
    if(e.key === 'ArrowDown' || e.key === 'ArrowUp'){
      const rs = rovable(), i = rs.indexOf(document.activeElement);
      if(i < 0) return;   // focus is on something else in the popover (e.g. an input) — don't steal its own key handling
      e.preventDefault();
      const dir = e.key === 'ArrowDown' ? 1 : -1;
      rs[(i + dir + rs.length) % rs.length].focus();
      return;
    }
    if(e.key === 'Home' || e.key === 'End'){
      const rs = rovable(), i = rs.indexOf(document.activeElement);
      if(i < 0) return;
      e.preventDefault();
      (e.key === 'Home' ? rs[0] : rs[rs.length - 1]).focus();
      return;
    }
    if(e.key !== 'Tab' || !trap) return;
    const fs = focusable();
    if(!fs.length){ e.preventDefault(); return; }   // action popover with no stop at all: retain a safe focus loop
    const first = fs[0], last = fs[fs.length - 1];
    if(e.shiftKey && document.activeElement === first){ e.preventDefault(); last.focus(); }
    else if(!e.shiftKey && document.activeElement === last){ e.preventDefault(); first.focus(); }
  });
  const first = pop.querySelector('button');
  if(first) first.focus();
  else { pop.tabIndex = -1; pop.focus(); }   // read-only popover (e.g. intraday's callout): focus the container itself
}
