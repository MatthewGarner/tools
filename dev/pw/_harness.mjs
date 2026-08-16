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

/* Empty paint attributes in the LIVE DOM — `fill=""` / `stroke=""`.

   getComputedStyle().getPropertyValue() returns '' for a token that doesn't exist,
   with no throw and no warning, and themeColors() feeds those values straight into
   ctx.colors for every renderer. So a renamed or dropped design token blanks the
   paint on every mark, in the browser only: dev/golden.mjs renders with invented
   colours rather than tokens, so the goldens stay byte-identical, and the node-side
   dev/tokens.test.mjs can only catch the shapes its regexes recognise — a review
   demonstrated it can be made blind by one extra level of indirection.

   This is the backstop that does not care HOW the token went missing. Returns the
   offending elements so a failure names them. */
export async function emptyPaint(page){
  return page.evaluate(() => {
    const out = [];
    for(const el of document.querySelectorAll('svg [fill], svg [stroke], svg[fill], svg[stroke]'))
      for(const attr of ['fill', 'stroke']){
        const v = el.getAttribute(attr);
        if(v !== null && v.trim() === '') out.push(el.tagName + '[' + attr + ']');
      }
    return out;
  });
}

/* PASS/FAIL counts from a results array (raw error lines that are neither are
   ignored). */
export function tally(results){
  return {
    pass: results.filter(r => r.startsWith('PASS')).length,
    fail: results.filter(r => r.startsWith('FAIL')).length,
  };
}

/* Print the summary line and exit. `min` is a FLOOR on real checks run: a suite
   that ran far fewer than usual almost certainly crashed or drew an empty
   driving list (the 'PASS=0 FAIL=0 looks green' trap that CLAUDE.md warns about
   but nothing enforced) — fail loud instead of a silent exit 0. Every verify
   suite ends with this so the exit convention lives in one place. */
export function report(name, {pass, fail, min}){
  console.log(`\n${name}: ${pass} PASS, ${fail} FAIL (floor ${min})`);
  if(pass + fail < min){
    console.log(`FAIL ${name}: only ${pass + fail} checks ran (floor ${min}) — suite likely crashed or a driving list was empty`);
    process.exit(1);
  }
  process.exit(fail ? 1 : 0);
}
