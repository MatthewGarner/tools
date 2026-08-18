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

/* Condition polling for the browser suites, replacing fixed waitForTimeout padding.

   `until(fn)` polls until fn() is truthy; `untilValue(read, ok)` polls read() until
   ok(value) holds and returns the LAST value read either way, so a conversion changes
   only the WAIT and leaves the caller's check(...) byte-identical.

   Three properties, each of which cost something to learn (2026-08-17):

   1. TIMEOUT RETURNS, it does not throw — a stuck condition becomes the caller's own
      clean FAIL rather than an anonymous crash. EXCEPT when no call ever completed:
      then the last error is rethrown, because returning undefined there just moves the
      crash to the caller's next property access and throws away the only diagnostic.
      A predicate referencing a `const` declared below it threw TDZ on every iteration,
      was swallowed, and read as a silent 4-second sleep that never tested anything.
   2. A THROW IS TREATED AS "not ready yet" — a target that does not exist YET behaves
      like one that returns null. That is deliberate and must stay: reads such as
      (await getItem()).includes(...) throw a real TypeError before the first write and
      resolve moments later, so erroring on the first throw would break working sites.
      Rule 1 is what stops that leniency hiding a permanent fault.
   3. THE DEADLINE IS RACED, not merely checked between calls. Playwright's own action
      timeout is 30s and many locator reads (inputValue, innerText, boundingBox…) block
      that long on a zero match, so a deadline tested only after `await fn()` is a floor,
      not a ceiling: one such call turns a 4s budget into 30s. That shipped once already. */
const POLL_TIMED_OUT = Symbol('poll-timed-out');

async function raceDeadline(promise, ms){
  let timer;
  const guard = new Promise(resolve => { timer = setTimeout(() => resolve(POLL_TIMED_OUT), ms); });
  try { return await Promise.race([promise, guard]); }
  finally { clearTimeout(timer); }
}

async function poll(step, deadline, attempt){
  let last, lastError, everCompleted = false;
  for(;;){
    const left = deadline - Date.now();
    if(left <= 0) break;
    /* the racer may abandon this call; keep a catch on it so a late rejection
       cannot surface as an unhandled rejection and kill the process */
    const call = Promise.resolve().then(attempt);
    call.catch(() => {});
    try {
      const outcome = await raceDeadline(call, left);
      if(outcome === POLL_TIMED_OUT) break;          // the budget went inside one call
      everCompleted = true;
      last = outcome.value;
      if(outcome.done) return last;
    } catch(err){ lastError = err; }                 // not ready yet — see property 2
    await new Promise(r => setTimeout(r, Math.min(step, Math.max(0, deadline - Date.now()))));
  }
  if(!everCompleted && lastError) throw lastError;   // see property 1
  return last;
}

export function until(fn, {timeout = 4000, step = 25} = {}){
  return poll(step, Date.now() + timeout, async () => {
    const value = await fn();
    return {value, done: !!value};
  });
}

export function untilValue(read, ok, {timeout = 4000, step = 25} = {}){
  return poll(step, Date.now() + timeout, async () => {
    const value = await read();
    return {value, done: !!(await ok(value))};
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
