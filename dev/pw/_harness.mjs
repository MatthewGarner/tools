/* Shared Playwright-suite helpers. `trackErrors` is the important one: it
   watches BOTH uncaught exceptions (pageerror) AND console.error output and
   returns a growing array — the suites assert it stays empty. It exists
   because the per-suite `page.on('pageerror', …)` watcher was copy-pasted
   ~12 times and two suites (layout, check-eip) drifted to watching only
   pageerror, so a console.error during a workspace-zoom or edit-in-place flow
   passed silently there though the identical bug failed in smoke. One helper,
   one behaviour. */

/* Attach error listeners to a page; returns the array they push into.
   Format mirrors smoke.mjs's original: 'pageerror: …' / 'console: …'. */
export function trackErrors(page){
  const errors = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if(m.type() === 'error') errors.push('console: ' + m.text()); });
  return errors;
}
