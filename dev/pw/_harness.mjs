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

/* Look an example up by name rather than by array index. An index (EXAMPLES[1])
   silently rebinds to the wrong example the moment the source list is reordered —
   the exact staleness class this exists to close off (2026-08-15: a stale example
   name/content literal in a suite failed as a mystery Playwright timeout, which
   reads like flake, not a rename). Throws loud and immediately, naming what was
   asked for and what's actually on offer, so a suite fails at lookup time with a
   clear message instead of timing out waiting for a button that no longer exists. */
export function pickExample(list, name){
  const found = list.find(e => e.name === name);
  if(!found) throw new Error(`pickExample: no example named '${name}' — available: ${list.map(e => e.name).join(', ')}`);
  return found;
}

/* Poll `fn` until it returns truthy. Returns the last value — NEVER throws on
   timeout — so a stuck condition reports as the caller's own clean FAIL instead of
   crashing the suite. (Learned the hard way: boundingBox() on a locator matching
   nothing rejects after the full timeout and takes the whole suite with it.) A
   mid-poll rejection from `fn` itself (the exact boundingBox case) is swallowed
   the same way a falsy value is — just keep polling — so a target that doesn't
   exist YET behaves the same as a target that returns null. */
export async function until(fn, {timeout = 4000, step = 25} = {}) {
  const deadline = Date.now() + timeout;
  let last;
  for (;;) {
    try {
      last = await fn();
      if (last) return last;
    } catch { /* not ready yet — keep polling, same as a falsy value */ }
    if (Date.now() >= deadline) return last;
    await new Promise(r => setTimeout(r, step));
  }
}

/* Poll `read()` until `ok(value)` or timeout; return the LAST value read either
   way, so the caller's existing check(...) line stays byte-identical — a
   conversion changes only the WAIT, never the assertion. Same never-throws
   contract as `until`. */
export async function untilValue(read, ok, {timeout = 4000, step = 25} = {}) {
  const deadline = Date.now() + timeout;
  let last;
  for (;;) {
    try {
      last = await read();
      if (await ok(last)) return last;
    } catch { /* not ready yet — keep polling */ }
    if (Date.now() >= deadline) return last;
    await new Promise(r => setTimeout(r, step));
  }
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
   suite ends with this so the exit convention lives in one place.

   Also the ONE place every suite ends (2026-08-17), so it's the one place that
   can measure the suite's own wall-clock time without every suite file having to
   do it — `process.uptime()` is the age of THIS node process, and each suite runs
   as its own `node suite.mjs` child (see run.mjs / CI), so it's the suite's real
   elapsed time, not a shared clock. The timing is APPENDED to the existing PASS/FAIL
   prefix, never inserted before or into it — checked nothing parses that text (only
   exit codes are read downstream: run.mjs reads `code` from spawn, CI does
   `node "$s" || exit 1`), but keeping the prefix byte-identical costs nothing and
   protects any future parser too. */
export function report(name, {pass, fail, min}){
  const elapsed = Math.round(process.uptime());
  console.log(`\n${name}: ${pass} PASS, ${fail} FAIL (floor ${min}) in ${elapsed}s`);
  if(pass + fail < min){
    console.log(`FAIL ${name}: only ${pass + fail} checks ran (floor ${min}) — suite likely crashed or a driving list was empty`);
    process.exit(1);
  }
  process.exit(fail ? 1 : 0);
}
