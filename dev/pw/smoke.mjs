/* Smoke checks for every tool + the landing page. The quality bar: each tool
   loads, its primary flow produces output, and the console stays clean.
   (The roadmap tool has its own deeper suite in check.mjs.) */
import {chromium} from 'playwright';
import {readFileSync} from 'node:fs';
import {TOOL_DIRS, ENERGY_TOOL_DIRS, BINDERS} from '../tool-dirs.mjs';
import {trackErrors, report, tally, emptyPaint, pickExample} from './_harness.mjs';
import {EXAMPLES as RANK_EXAMPLES} from '../../rank/examples.js';

const OPS_INFRA_BACKLOG = pickExample(RANK_EXAMPLES, 'Ops & infra backlog');

const BASE = process.env.BASE || 'http://localhost:8087';
const browser = await chromium.launch();
const results = [];
const check = (name, ok) => results.push((ok ? 'PASS ' : 'FAIL ') + name);

async function freshPage(path, theme = 'light'){
  const page = await browser.newPage({colorScheme: theme, reducedMotion: 'reduce'});
  const errors = trackErrors(page);
  await page.goto(BASE + path, {waitUntil: 'networkidle'});
  return {page, errors};
}

async function showSourceIfReading(page){
  const source = page.getByRole('button', {name: 'Show source editor'});
  // The guarded reader state resolves after the first real artefact, not page
  // navigation. Wait for that transition instead of racing a chip that is
  // about to move behind the source rail.
  await source.waitFor({state: 'visible', timeout: 3000}).catch(() => {});
  if(await source.isVisible()) await source.click();
}

/* The PNG-export path decodes the SVG string as an <img>; invalid XML (e.g. a
   double quote inside an attribute) renders fine inline but kills exports —
   the 2026-07-06 gauge/fermi bug. Decode-check the rendered SVG per tool. */
async function svgDecodes(page, selector){
  return page.evaluate(async sel => {
    const el = document.querySelector(sel);
    if(!el) return false;
    const svg = el.outerHTML;
    return new Promise(res => {
      const img = new Image();
      img.onload = () => res(true);
      img.onerror = () => res(false);
      setTimeout(() => res(false), 3000);
      img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
    });
  }, selector);
}

/* Copy PNG runs the full production path, and since 2026-07-31 it is the action
   that carries the deck-shaped render (the separate slide/poster downloads are
   gone): getCopy() renders, svgToCanvas decodes it as an <img> and toBlob
   rasterizes it, then clipboard.write takes the blob. The "Copied" flash only
   fires once that promise resolves, so the label IS the proof — a decode failure
   lands on 'Copy blocked' instead. This is the decode gap that silently killed
   exports twice, now watched on the button that inherited it. */
/* Selector-free decode, for the both-themes sweep (review, 2026-08-18). Moving the
   deep flows to one theme took 26 dark `SVG decodes as XML` / `Copy PNG` assertions
   across 15 tools with them, and nothing else in the repo could see that class:
   svgDecodes/copyPngWorks live only in this file, dev/golden.js renders with
   invented colours so svg-wellformed cannot reach a real dark palette, and
   webkit.mjs's both-theme sweep asserts overflow and fonts, not decode. Renderers
   branch on ctx.dark only to choose colour VALUES — which is why the other 167
   removals really were duplicates, and why these were not: an XML-invalid value
   emitted only by the dark palette renders fine inline and kills the export.

   Picks the largest SVG by rendered area rather than a per-tool selector, so the
   sweep stays self-extending (the deep flows carry the selectors; this must not).
   Decoding EVERY svg would be wrong: page-chrome icons are written inline in HTML
   and often omit xmlns, which a data: URI requires — they would fail for a reason
   that is not a defect. An artefact comes from a renderer and always carries it.

   WHAT THIS DOES NOT CATCH, measured rather than assumed: a bare boolean attribute.
   The svg reached the DOM through innerHTML, so the HTML parser has already
   normalised `data-mc` to `data-mc=""` before outerHTML re-serialises it — probed
   both ways, a bare attribute still decodes true. That class belongs to
   svg-wellformed.test.mjs's golden scan, which is why a render path with NO golden
   (every narrow/phone branch today) has no well-formedness witness at all. The
   class this DOES catch is the one that shipped twice: a double-quoted font name
   inside a double-quoted attribute, which survives HTML parsing as a mangled
   attribute NAME and is invalid XML (probed: real artefact true, mutant false). */
async function artefactDecodes(page){
  return page.evaluate(async () => {
    let best = null, bestArea = 0;
    for(const el of document.querySelectorAll('svg')){
      const r = el.getBoundingClientRect(), area = r.width * r.height;
      if(area > bestArea){ bestArea = area; best = el; }
    }
    if(!best) return true;                      // nothing painted is the sibling check's business, not this one
    const svg = best.outerHTML;
    return new Promise(res => {
      const img = new Image();
      img.onload = () => res(true);
      img.onerror = () => res(false);
      setTimeout(() => res(false), 3000);
      img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
    });
  });
}

async function copyPngWorks(page){
  try{
    await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
    // blank the label first, so a leftover "Copied" from an earlier call in the
    // same page (roadmap checks every deck style) can't pass this vacuously
    await page.evaluate(() => { document.getElementById('copypng').textContent = ''; });
    await page.locator('#copypng').click();
    await page.waitForFunction(
      () => (document.getElementById('copypng').textContent || '').startsWith('Copied'),
      null, {timeout: 6000});
    return true;
  }catch(e){ return false; }
}

/* A dense Timeline must never turn a single-slide request into an attractive
   but partial PNG. This follows the real button path, rather than inspecting a
   renderer string, so the author receives the same safe outcome we assert. */
async function copyPngRefuses(page){
  try{
    await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
    await page.locator('#copypng').click();
    await page.waitForFunction(
      () => (document.getElementById('copypng').textContent || '').startsWith('Copy PNG unavailable'),
      null, {timeout: 3000});
    return true;
  }catch(e){ return false; }
}

/* Deep behavioural flows run under ONE theme (2026-08-18).

   193 of this suite's 279 check sites used to run twice, under light and dark, and
   the suite owned no assertion that could tell the two apart: its only two colour
   checks accept either theme's hex by regex ((#D62015|#FF4B3E)), and its only
   getComputedStyle calls read grid-columns and display. So the second pass re-ran
   whole multi-step flows to prove "no console error under the other palette" — and
   nothing else. ~80-90s of a 993s chain.

   The dark axis is NOT deleted. It moves to the per-tool sweep further down, which
   now loads every tool on BOTH origins in BOTH themes and asserts, per tool and per
   theme: the page boots clean, no mark carries an empty fill/stroke, and — the
   assertion this suite genuinely lacked — an artefact that renders in light still
   renders in dark. That is a theme-DISCRIMINATING check, which none of the 193
   duplicated sites were.

   What is no longer witnessed: a console error that appears only under dark AND
   only part-way through a multi-step interaction. Boot-time console cleanliness per
   tool per theme is covered here and again, in a different engine, by webkit.mjs,
   which sweeps every tool on both origins in both themes for page errors and CSP
   violations.

   One name, so restoring both themes is a one-word edit rather than 22. */
const FLOW_THEMES = ['light'];

/* ---- landing ---- */
{
  const {page, errors} = await freshPage('/');
  const instruments = TOOL_DIRS.filter(d => !BINDERS.includes(d));
  check('landing: one card per instrument', await page.locator('a.tool').count() === instruments.length);
  check('landing: every card carries its instrument sketch', await page.locator('a.tool svg.thumb').count() === instruments.length);
  check('landing: one binder band per binder', await page.locator('a.binder').count() === BINDERS.length);
  const hrefs = await page.locator('a.tool, a.binder').evaluateAll(as => as.map(a => a.getAttribute('href')));
  for(const href of hrefs){
    const resp = await page.request.get(BASE + href);
    check('landing: ' + href + ' resolves', resp.status() === 200);
  }
  check('landing: no console errors', errors.length === 0);
  await page.close();
}

/* ---- energy landing + risk ---- */
{
  const {page, errors} = await freshPage('/energy/');
  check('energy landing: five tool cards', await page.locator('a.tool').count() === ENERGY_TOOL_DIRS.length);
  for(const d of ENERGY_TOOL_DIRS)
    check('energy landing: ' + d + ' card resolves', (await page.request.get(BASE + '/energy/' + d + '/')).status() === 200);
  check('energy landing: no console errors', errors.length === 0);
  await page.close();
}
for(const theme of FLOW_THEMES){
  const {page, errors} = await freshPage('/energy/risk/', theme);
  await showSourceIfReading(page);
  await page.getByRole('button', {name: 'Route to market'}).click();
  await page.waitForTimeout(600);
  check('risk(' + theme + '): diagram renders', await page.locator('#preview svg').count() === 1);
  check('risk(' + theme + '): verdict present', (await page.locator('#preview svg').innerHTML()).includes('THE TRADE'));
  check('risk(' + theme + '): SVG decodes as XML', await svgDecodes(page, '#preview svg'));
  check('risk(' + theme + '): Copy PNG copies a PNG', await copyPngWorks(page));
  check('risk(' + theme + '): crumb points at energy landing',
    await page.locator('a.crumb').getAttribute('href') === '../');
  check('risk(' + theme + '): no console errors', errors.length === 0);
  await page.close();
}

/* Copy PNG admits one complete 16:9 Field or clearly declines it. The native
   SVG remains the exhaustive path; this is deliberately not a selection test. */
{
  const dense = 'title: Dense Field\n' + Array.from({length:40}, (_, i) =>
    `Lane ${i % 4}: A deliberately descriptive forecast ${i} 202${6 + Math.floor(i / 12)}-0${i % 8 + 1} .. 202${6 + Math.floor(i / 12)}-1${i % 2 + 1} // a note that must remain present in export`).join('\n');
  const {page, errors} = await freshPage('/timeline/');
  await showSourceIfReading(page);
  const editor = page.locator('.cm-content');
  await editor.click();
  await page.keyboard.press('ControlOrMeta+A');
  await page.keyboard.press('Backspace');
  await page.keyboard.type(dense);
  await page.waitForFunction(() => document.querySelectorAll('#preview [data-field-item]').length === 40, null, {timeout:3000});
  await page.getByText('Export', {exact:true}).click();
  check('timeline: dense Copy PNG refuses rather than copying a partial field', await copyPngRefuses(page));
  check('timeline: dense export refusal has no console error', errors.length === 0);
  await page.close();
}

/* ---- proxy hunt: selected theory and full/scoped export scopes ---- */
for(const theme of FLOW_THEMES){
  const {page, errors} = await freshPage('/proxy/', theme);
  await page.waitForTimeout(700);
  const theory = page.locator('[data-select-theory][data-theory-id]').first();
  await theory.focus();
  await theory.press('Enter');
  await page.waitForTimeout(180);
  check('proxy(' + theme + '): full hunt renders intended and failure theories separately',
    await page.locator('#preview [data-kind="intended-route"]').count() === 1 &&
    await page.locator('#preview [data-kind="failure-theory"]').count() >= 1);
  check('proxy(' + theme + '): keyboard selection has visible state and causal limitation',
    await page.locator('[data-select-theory][data-selected="true"]').count() === 1 &&
    /SELECTED/.test(await page.locator('#preview').innerText()) &&
    /Causal limit/i.test(await page.locator('.causal-note').innerText()));
  check('proxy(' + theme + '): selection moves focus to its reachable scoped receipt',
    await page.evaluate(() => document.activeElement?.dataset?.kind) === 'selected-theory-receipt' &&
    await page.locator('#viewreceipt').isEnabled());
  check('proxy(' + theme + '): scoped receipt carries applicable reported context separately',
    await page.locator('[data-kind="selected-theory-receipt"] [data-kind="receipt-reported-pattern"]').count() === 1 &&
    /NON-CAUSAL CONTEXT/.test(await page.locator('[data-kind="receipt-reported-pattern"]').textContent() || ''));
  check('proxy(' + theme + '): scoped receipt export becomes available',
    await page.locator('#receiptsvg').isEnabled() && await page.locator('#receiptpng').isEnabled());
  const derivedBeforeAuthorEdit = await page.locator('#verdict').innerText();
  await page.locator('#authorverdict').click();
  await page.locator('.eip-pop button', {hasText: 'Edit the line…'}).click();
  await page.locator('.eip-input').fill('Author says: keep this hunt paired with its guardrail.');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(350);
  check('proxy(' + theme + '): author-stated verdict menu edits URL-local source without replacing review state',
    (await page.evaluate(() => localStorage.getItem('proxy-src') || '')).includes('verdict: Author says: keep this hunt paired with its guardrail.') &&
    /AUTHOR-STATED VERDICT[\s\S]*Author says: keep this hunt paired with its guardrail/i.test(await page.locator('#authorverdict').innerText()) &&
    (await page.locator('#verdict').innerText()) === derivedBeforeAuthorEdit);
  check('proxy(' + theme + '): SVG decodes as XML', await svgDecodes(page, '#preview svg'));
  check('proxy(' + theme + '): no console errors', errors.length === 0);
  await page.close();
}

for(const theme of FLOW_THEMES){
  const {page, errors} = await freshPage('/energy/cycles/', theme);
  await showSourceIfReading(page);
  await page.getByRole('button', {name: 'Wexcombe base case'}).click();
  await page.waitForTimeout(1000);
  check('cycles(' + theme + '): three bands render', (await page.locator('#preview svg').innerHTML()).includes('THE ASSET LIFE'));
  check('cycles(' + theme + '): verdict present', (await page.locator('#preview svg').innerHTML()).includes('Cycles are worth'));
  check('cycles(' + theme + '): SVG decodes as XML', await svgDecodes(page, '#preview svg'));
  check('cycles(' + theme + '): Copy PNG copies a PNG', await copyPngWorks(page));
  check('cycles(' + theme + '): no console errors', errors.length === 0);
  await page.close();
}

/* cycles: sim memoisation (perf fix Task 1 — theme/rotation/no-op edits
   must NOT re-run the ~472ms Monte Carlo; only a sim-input edit should). */
{
  const {page, errors} = await freshPage('/energy/cycles/', 'light');
  await showSourceIfReading(page);
  await page.getByRole('button', {name: 'Wexcombe base case'}).click();
  await page.waitForTimeout(1200);
  const simCount = () => page.evaluate(() => window.__cyclesSimCount);

  check('cycles memo: fresh boot settles to exactly 1 sim (double-trigger memoises)', await simCount() === 1);

  const svgBefore = await page.locator('#preview svg').innerHTML();
  await page.emulateMedia({colorScheme: 'dark'});
  await page.waitForTimeout(600);
  const svgAfterTheme = await page.locator('#preview svg').innerHTML();
  check('cycles memo: theme toggle re-renders (colours flip)', svgAfterTheme !== svgBefore);
  check('cycles memo: theme toggle does not re-simulate', await simCount() === 1);

  await page.setViewportSize({width: 460, height: 900});
  await page.waitForTimeout(700);
  check('cycles memo: narrow-bucket resize does not re-simulate', await simCount() === 1);

  await page.setViewportSize({width: 1400, height: 950});
  await page.waitForTimeout(700);

  await page.locator('.cm-content').click();
  await page.keyboard.press('Meta+ArrowDown');
  await page.keyboard.press('Enter');
  await page.keyboard.type('spread: 40..95');
  await page.waitForTimeout(600);
  check('cycles memo: sim-input edit re-simulates (+1)', await simCount() === 2);

  await page.keyboard.press('Enter');
  await page.keyboard.type('// a note, not a sim input');
  await page.waitForTimeout(600);
  check('cycles memo: comment-only edit does not re-simulate', await simCount() === 2);

  check('cycles memo: no console errors', errors.length === 0);
  await page.close();
}

/* cycles: rev-3 async state machine (perf fix Task 2 — the Monte Carlo now
   runs in a module Worker; a real sim takes ~450-500ms for the heaviest
   example (dual policy + augment resim), which is the window these tests
   race against). */
{
  const {page, errors} = await freshPage('/energy/cycles/', 'light');
  await showSourceIfReading(page);
  const simCount = () => page.evaluate(() => window.__cyclesSimCount);

  await page.getByRole('button', {name: 'Wexcombe base case'}).click();
  await page.waitForTimeout(1200);
  check('cycles worker: boot settles to exactly 1 dispatch', await simCount() === 1);
  check('cycles worker: actions enabled once settled', await page.locator('#dlsvg').isEnabled());

  /* exports gated: a fresh dispatch (different example → different simKey)
     must disable actions while it's pending, and re-enable on commit. */
  await page.getByRole('button', {name: 'Tight warranty'}).click();
  await page.waitForTimeout(300);   // dispatch has fired (debounce 120ms + rAF); the sim is still in flight
  check('cycles worker: actions disabled while a fresh sim is pending', await page.locator('#dlsvg').isDisabled());
  await page.waitForTimeout(1200);  // well past the ~500ms sim time
  check('cycles worker: actions enabled again after commit', await page.locator('#dlsvg').isEnabled());
  check('cycles worker: dispatch counted (+1)', await simCount() === 2);
  check('cycles worker: no console errors', errors.length === 0);

  await page.close();
}

/* revert-during-in-flight — the rev-3 Critical: reverting to a completed
   model while a different edit's sim is still in flight must NOT let the
   abandoned sim's late response clobber the reverted diagram, corrupt the
   committed key, or leave actions stuck disabled. abandonInFlight() (bump
   seq + terminate/respawn the worker) on the revert path is what makes this
   structurally impossible — this test is where that's proven. */
{
  const {page, errors} = await freshPage('/energy/cycles/', 'light');
  await showSourceIfReading(page);
  const simCount = () => page.evaluate(() => window.__cyclesSimCount);

  await page.getByRole('button', {name: 'Wexcombe base case'}).click();
  await page.waitForTimeout(1200);
  check('cycles revert: boot settles to 1 dispatch', await simCount() === 1);
  const baselineSvg = await page.locator('#preview svg').innerHTML();
  const baselineVerdict = (await page.locator('#verdict').innerText()).trim();

  await page.getByRole('button', {name: 'Tight warranty'}).click();
  await page.waitForTimeout(300);    // a different-key dispatch is now in flight (~500ms to resolve)
  await page.getByRole('button', {name: 'Wexcombe base case'}).click();   // revert to the completed model BEFORE the in-flight sim resolves
  await page.waitForTimeout(1500);   // well past the abandoned sim's real-world time — a late response would have arrived by now if not truly killed

  const finalSvg = await page.locator('#preview svg').innerHTML();
  const finalVerdict = (await page.locator('#verdict').innerText()).trim();
  check('cycles revert: settled diagram matches the reverted model exactly (no stale-response clobber)', finalSvg === baselineSvg);
  check('cycles revert: verdict matches the reverted model exactly', finalVerdict === baselineVerdict);
  check('cycles revert: actions enabled after settling (not stuck disabled)', await page.locator('#dlsvg').isEnabled());
  check('cycles revert: sim count sane (boot + abandoned edit, no phantom extra)', await simCount() === 2);
  check('cycles revert: no console errors', errors.length === 0);
  await page.close();
}

/* leaked-failsafe-timer guard — the review Critical: abandonInFlight() must
   cancel the abandoned dispatch's 5s failsafe timer. If it doesn't, that timer
   later markWorkerDead()s whatever worker is CURRENT (a healthy one serving a
   later edit), nulls it with no respawn, and forces every subsequent edit onto
   the main-thread runSync path for the session. We shrink SIM_TIMEOUT_MS to
   500ms (globalThis.__cyclesSimTimeoutMs), fire an edit→revert abandon, then
   wait PAST the shrunk window with no activity: with the leak the timer fires
   and kills the (healthy, respawned) worker; with the fix nothing fires. */
{
  const {page, errors} = await freshPage('/energy/cycles/', 'light');
  await showSourceIfReading(page);
  const simCount = () => page.evaluate(() => window.__cyclesSimCount);
  const workerAlive = () => page.evaluate(() => window.__cyclesWorkerAlive && window.__cyclesWorkerAlive());

  await page.getByRole('button', {name: 'Wexcombe base case'}).click();
  await page.waitForTimeout(1200);
  check('cycles leak: boot settles, worker alive', await simCount() === 1 && await workerAlive() === true);

  await page.evaluate(() => { window.__cyclesSimTimeoutMs = 500; });   // shrink the failsafe window
  await page.getByRole('button', {name: 'Tight warranty'}).click();   // dispatch K1 → arms a 500ms failsafe timer
  await page.waitForTimeout(200);                                     // K1 still in flight (real sim ~500ms)
  await page.getByRole('button', {name: 'Wexcombe base case'}).click();  // revert (=== lastKey) → abandonInFlight must CANCEL K1's timer
  await page.waitForTimeout(1400);   // > the abandoned timer's would-be fire time (dispatch+500ms) + margin, no activity

  check('cycles leak: worker still alive after the abandoned failsafe window (timer was cancelled, not leaked)', await workerAlive() === true);

  await page.evaluate(() => { window.__cyclesSimTimeoutMs = 5000; });  // restore before the next edit so its own timer can't race the real sim
  const countBefore = await simCount();
  await page.locator('.cm-content').click();
  await page.keyboard.press('Meta+ArrowDown');
  await page.keyboard.press('Enter');
  await page.keyboard.type('spread: 42..97');
  await page.waitForTimeout(1400);
  check('cycles leak: a later sim-input edit still ran (count +1)', await simCount() === countBefore + 1);
  check('cycles leak: a later edit still took the WORKER path (not the self-killed sync fallback)', await workerAlive() === true);
  check('cycles leak: no console errors', errors.length === 0);
  await page.close();
}

/* failsafe-timeout fallback path — a worker that never answers must fall back
   to a synchronous inline sim (renders, actions on) and mark the worker dead
   for the session, WITHOUT corrupting the memo. We force it by shrinking the
   window to 10ms so it always fires before the ~500ms real response; the
   fallback routes through dispatch (bumps seq) so a post-terminate late message
   can't commit lastKey=null. */
{
  const {page, errors} = await freshPage('/energy/cycles/', 'light');
  await showSourceIfReading(page);
  const simCount = () => page.evaluate(() => window.__cyclesSimCount);
  const workerAlive = () => page.evaluate(() => window.__cyclesWorkerAlive && window.__cyclesWorkerAlive());

  await page.getByRole('button', {name: 'Wexcombe base case'}).click();
  await page.waitForTimeout(1200);
  check('cycles timeout: boot settles, worker alive', await simCount() === 1 && await workerAlive() === true);

  await page.evaluate(() => { window.__cyclesSimTimeoutMs = 10; });    // failsafe fires almost immediately, before any worker response
  const countBefore = await simCount();
  await page.getByRole('button', {name: 'Tight warranty'}).click();    // dispatch K1 → 10ms timer wins the race → sync fallback
  await page.waitForTimeout(900);

  check('cycles timeout: fallback rendered a diagram', (await page.locator('#preview svg').innerHTML()).includes('THE ASSET LIFE'));
  check('cycles timeout: fallback verdict present', (await page.locator('#verdict').innerText()).trim().length > 20);
  check('cycles timeout: actions enabled after the fallback commit', await page.locator('#dlsvg').isEnabled());
  /* +2: the worker dispatch counts one real simulate (the abandoned off-thread
     run), then the failsafe fallback routes through dispatch→runSync for a
     second — both are genuine simulate() invocations. */
  check('cycles timeout: worker dispatch + fallback both counted (+2)', await simCount() === countBefore + 2);
  check('cycles timeout: worker marked dead for the session', await workerAlive() === false);
  /* memo intact: a theme toggle forces a doRefresh on the same model; it must
     hit the memoised key===lastKey path and NOT re-sim. If a post-terminate
     late message had corrupted lastKey to null, key(non-null)!==lastKey(null)
     would re-dispatch → count++. Count unchanged ⇒ lastKey was set correctly. */
  await page.evaluate(() => { window.__cyclesSimTimeoutMs = 5000; });
  const countAfterFallback = await simCount();
  await page.emulateMedia({colorScheme: 'dark'});
  await page.waitForTimeout(700);
  check('cycles timeout: theme toggle is memoised (lastKey uncorrupted, no re-sim)', await simCount() === countAfterFallback);
  check('cycles timeout: no console errors', errors.length === 0);
  await page.close();
}

for(const theme of FLOW_THEMES){
  const {page, errors} = await freshPage('/energy/frequency/', theme);
  await page.getByRole('button', {name: 'Battery stack'}).click();
  await page.waitForTimeout(2500);
  check('frequency(' + theme + '): trace canvas exists', await page.locator('#trace').count() === 1);
  const verdict = (await page.locator('#verdict').innerText()).trim();
  check('frequency(' + theme + '): verdict non-empty', verdict.length > 20);
  check('frequency(' + theme + '): crumb points at energy landing',
    await page.locator('a.crumb').getAttribute('href') === '../');
  check('frequency(' + theme + '): no console errors', errors.length === 0);
  await page.close();
}

for(const theme of FLOW_THEMES){
  const {page, errors} = await freshPage('/energy/merit-order/', theme);
  await page.getByRole('button', {name: 'Gas spike'}).click();
  await page.waitForTimeout(1200);
  check('merit-order(' + theme + '): diagram renders', await page.locator('#chartwrap svg').count() === 1);
  const verdict = (await page.locator('#verdict').innerText()).trim();
  check('merit-order(' + theme + '): verdict non-empty', verdict.length > 20);
  check('merit-order(' + theme + '): gas-spike condition prices high (3-digit £)', /£[12]\d\d/.test(verdict));
  check('merit-order(' + theme + '): storage rendered below gas (data-storage marker)',
    await page.locator('svg g[data-storage]').count() >= 1);
  check('merit-order(' + theme + '): SVG decodes as XML', await svgDecodes(page, '#chartwrap svg'));
  check('merit-order(' + theme + '): Copy PNG copies a PNG', await copyPngWorks(page));
  // slider drag: nudge carbon; the SVG must re-render without error
  await page.locator('#carbon').evaluate(el => {
    el.value = '90'; el.dispatchEvent(new Event('input', {bubbles: true})); el.dispatchEvent(new Event('change', {bubbles: true}));
  });
  await page.waitForTimeout(300);
  check('merit-order(' + theme + '): carbon slider re-renders', await page.locator('#chartwrap svg').count() === 1);
  // tap the BESS block → callout reframes its bid as charging/opportunity cost
  await page.locator('svg g[data-plant="BESS"]').click();
  await page.waitForTimeout(150);
  const calloutTxt = await page.locator('.mo-callout').count() ? await page.locator('.mo-callout').innerText() : '';
  check('merit-order(' + theme + '): BESS callout reframes charging cost', /charging cost/i.test(calloutTxt));
  await page.locator('#demand').evaluate(el => {
    el.value = String(+el.value + 1); el.dispatchEvent(new Event('input', {bubbles: true}));
  });
  await page.waitForTimeout(150);
  check('merit-order(' + theme + '): callout stays attached through a chart repaint',
    await page.locator('.mo-callout').count() === 1);
  await page.keyboard.press('Escape'); await page.waitForTimeout(50);
  check('merit-order(' + theme + '): closing a repainted callout returns focus to its fresh plant',
    await page.evaluate(() => document.activeElement?.dataset?.plant === 'BESS'));
  // Phase 2: an FES world + cold peak → hydrogen (not cheap gas) sets the price
  await page.getByRole('button', {name: 'Hydrogen Evolution'}).click();
  await page.getByRole('button', {name: 'Still cold peak'}).click();
  await page.waitForTimeout(400);
  const feVerdict = (await page.locator('#verdict').innerText()).trim();
  check('merit-order(' + theme + '): FES cold peak priced by hydrogen (£200)', /£200/.test(feVerdict) && /hydrogen/i.test(feVerdict));
  check('merit-order(' + theme + '): CCS + hydrogen blocks with textures',
    await page.locator("svg g[data-plant='Hydrogen']").count() === 1 && await page.locator('svg g[data-tex]').count() >= 2);
  check('merit-order(' + theme + '): world demand max grows (>64)',
    Number(await page.locator('#demand').getAttribute('max')) > 64);
  check('merit-order(' + theme + '): crumb points at energy landing',
    await page.locator('a.crumb').getAttribute('href') === '../');
  check('merit-order(' + theme + '): no console errors', errors.length === 0);
  await page.close();
}

for(const theme of FLOW_THEMES){
  const {page, errors} = await freshPage('/energy/intraday/', theme);
  check('intraday(' + theme + '): stack renders', await page.locator('#stackwrap svg').count() === 1);
  check('intraday(' + theme + '): price shape renders', await page.locator('#pricewrap svg').count() === 1);
  const v0 = await page.locator('#verdict').innerText();
  check('intraday(' + theme + '): verdict quotes the spread', /spread/i.test(v0) && /£\d+/.test(v0));
  await page.locator('#fleetGW').fill('6');
  await page.locator('#fleetGW').dispatchEvent('input');
  await page.waitForTimeout(150);
  const v6 = await page.locator('#verdict').innerText();
  // the verdict may append " — the day it made only paid for N% of the tank" after
  // the flattened figure; the raw→flat pair always appears before that clause, so
  // the substring match tolerates it without anchoring the end of the string.
  check('intraday(' + theme + '): fleet flattens (raw → flat quoted)', /£\d+ → £\d+/.test(v6));
  check('intraday(' + theme + '): verdict names the cannibalised tank', /% of the tank/.test(v6));
  check('intraday(' + theme + '): ghost raw shape appears', await page.locator('[data-raw-shape]').count() === 1);
  await page.locator('#scrub').fill('3');
  await page.locator('#scrub').dispatchEvent('input');
  check('intraday(' + theme + '): scrub moves the cursor', await page.locator("[data-cursor='3']").count() === 1);
  check('intraday(' + theme + '): SVG decodes as XML', await svgDecodes(page, '#pricewrap svg'));
  check('intraday(' + theme + '): no console errors', errors.length === 0);
  await page.close();
}

/* ---- every tool links home, and paints every mark ----
   Was one boolean over the whole list with a `break`, labelled "all thirteen tools"
   while iterating TOOL_DIRS (18) — so eighteen tools shared a single check and a
   single failure message that named none of them. Now one check per tool, so a
   failure names which one.

   The same sweep is where the empty-paint backstop rides: these pages are already
   being loaded, so asserting no mark carries fill=""/stroke="" costs a settle and an
   evaluate rather than a second pass over every tool. See emptyPaint() for why a
   node-side token check cannot be the only guard. */
{
  /* Every tool, both themes (2026-08-18) — this sweep is where the dark axis lives
     now that the deep flows run once. Energy pages climb to '../' rather than
     rooting at '/', so the expected crumb travels with the path.

     NB these are energy PATHS served through the tools origin's fallback rewrites,
     not the energy ORIGIN: this file never reads EBASE/EPORT (checked). pwa.mjs and
     mobile.mjs are what exercise the real second origin. */
  const PAGES = [...TOOL_DIRS.map(d => ['/' + d + '/', '/']),
                 ...ENERGY_TOOL_DIRS.map(d => ['/energy/' + d + '/', '../'])];
  const paintedInLight = new Map();
  for(const theme of ['light', 'dark']){
    const {page, errors} = await freshPage(PAGES[0][0], theme);
    for(const [path, home] of PAGES){
      const errorsBefore = errors.length;
      await page.goto(BASE + path, {waitUntil: 'domcontentloaded'});
      if(theme === 'light'){        // the crumb is markup, and markup does not have a theme
        const crumb = page.locator('a.crumb');
        check(path + ': carries the home crumb',
          await crumb.count() === 1 && await crumb.getAttribute('href') === home);
      }
      await page.waitForTimeout(450);          // autoload renders through debounce + rAF
      const svgs = await page.locator('svg').count();
      if(theme === 'light') paintedInLight.set(path, svgs);
      /* THE theme-discriminating assertion this suite never had: a dropped or
         renamed DARK token blanks every mark in production, and until now every
         check that could have seen it either ran in light only (emptyPaint) or
         accepted both palettes' hexes by regex. A tool that paints an artefact in
         one theme must paint one in the other — asserted only where light proved
         there is an artefact to lose, so canvas-output tools are not accused. */
      else if(paintedInLight.get(path) > 0)
        check(path + '(dark): still renders its artefact under the other palette (' + svgs + ' svg)', svgs > 0);
      if(svgs){
        const blank = await emptyPaint(page);
        check(path + '(' + theme + '): no blank fill/stroke in the live SVG' +
          (blank.length ? ' — ' + blank.slice(0, 4).join(' ') : ''), blank.length === 0);
        /* Both themes: light gives the tools whose deep flow never decoded their
           artefact a first witness, dark restores the 26 this reduction dropped. */
        check(path + '(' + theme + '): its artefact decodes as XML', await artefactDecodes(page));
      }
      check(path + '(' + theme + '): boots with a clean console', errors.length === errorsBefore);
    }
    await page.close();
  }
}

/* ---- premortem (fresh context each time — localStorage-backed, no cross-run state) ---- */
for(const theme of FLOW_THEMES){
  const {page, errors} = await freshPage('/premortem/', theme);
  await page.waitForTimeout(400);
  check('premortem(' + theme + '): first-run seeds the framed example (no premature nag)',
    (await page.inputValue('[data-field="title"]')).trim().length > 0
    && (await page.locator('#gatewhy').innerText()).trim() === ''
    && !(await page.locator('#next').isDisabled()));
  // first-run seeds + saves the example, so a reload lands on the home list; start
  // a clean premortem for the wizard-flow counts (exercises the real "new" path)
  await page.reload(); await page.waitForTimeout(300);
  await page.click('#newbtn'); await page.waitForTimeout(200);
  // FRAME → fill → next
  await page.fill('[data-field="title"]', 'Lantern launch');
  await page.fill('[data-field="question"]', 'We failed. Why?');
  await page.click('#next'); await page.waitForTimeout(150);
  await page.click('[data-act="skiptimer"]'); await page.waitForTimeout(150);   // WRITE → COLLECT
  for(const t of ['Onboarding too slow', 'Costs blow up', 'Key hire quits']){
    await page.fill('[data-add="entry"]', t); await page.press('[data-add="entry"]', 'Enter'); await page.waitForTimeout(100);
  }
  check('premortem(' + theme + '): collected 3 risks', await page.locator('.centry').count() === 3);
  await page.click('#next'); await page.waitForTimeout(120);   // CLUSTER
  await page.click('#next'); await page.waitForTimeout(120);   // SCORE
  await page.locator('.scrow').first().locator('[data-p="lo"]').fill('30');
  check('premortem(' + theme + '): a partial uncertainty range cannot advance the workshop',
    await page.locator('#next').isDisabled());
  await page.locator('.scrow').first().locator('[data-p="hi"]').fill('55');
  await page.locator('.scrow').first().locator('[data-impact="lo"]').fill('100');
  await page.locator('.scrow').first().locator('[data-impact="hi"]').fill('300');
  await page.waitForTimeout(150);
  // advance the remaining ungated phases to the register: SCORE→ACTIONS→VOTE→REGISTER
  await page.click('#next'); await page.waitForTimeout(100);   // ACTIONS
  check('premortem(' + theme + '): phase navigation moves focus to the new phase heading',
    await page.evaluate(() => document.activeElement === document.querySelector('#phasepanel h2')));
  await page.click('#next'); await page.waitForTimeout(100);   // VOTE
  await page.click('#next'); await page.waitForTimeout(200);   // REGISTER
  check('premortem(' + theme + '): register renders ranked rows', await page.locator('.register .rrow').count() === 3);
  check('premortem(' + theme + '): exposure MC + portfolio line', (await page.locator('.portfolio').innerText()).includes('Portfolio'));
  check('premortem(' + theme + '): no console errors', errors.length === 0);
  await page.close();
}
/* ---- pre-parade: inverse planning without invented success arithmetic ---- */
for(const theme of FLOW_THEMES){
  const {page, errors} = await freshPage('/premortem/', theme);
  await page.waitForTimeout(350);
  await page.reload(); await page.waitForTimeout(250);
  await page.click('#newparade'); await page.waitForTimeout(120);
  await page.fill('[data-field="title"]', 'Lantern breakthrough');
  await page.fill('[data-field="question"]', 'It is a runaway success. What did we do?');
  await page.click('#next'); await page.waitForTimeout(100);
  await page.click('[data-act="skiptimer"]'); await page.waitForTimeout(100);
  await page.fill('[data-add="entry"]', 'Keep the old onboarding reversible');
  await page.press('[data-add="entry"]', 'Enter'); await page.waitForTimeout(100);
  await page.click('#next'); await page.waitForTimeout(80); // cluster
  await page.click('#next'); await page.waitForTimeout(80); // commit
  check('pre-parade(' + theme + '): commits conditions rather than scoring likelihood or impact',
    await page.locator('[data-essential]').count() === 1 && await page.locator('[data-p]').count() === 0 && await page.locator('[data-impact]').count() === 0);
  check('pre-parade(' + theme + '): cannot advance without an explicit must-make-true condition', await page.locator('#next').isDisabled());
  await page.check('[data-essential]'); await page.waitForTimeout(80);
  await page.click('#next'); await page.waitForTimeout(80); // actions
  await page.click('[data-actadd]'); await page.waitForTimeout(80);
  await page.fill('[data-action="text"]', 'Run an A/B cutover');
  await page.fill('[data-action="owner"]', 'Alex');
  await page.click('#next'); await page.waitForTimeout(80); // vote
  await page.click('#next'); await page.waitForTimeout(160); // register
  const text = await page.locator('#phasepanel').innerText();
  check('pre-parade(' + theme + '): success register names deliberate commitments, not a portfolio forecast',
    text.toLowerCase().includes('success register') && text.toLowerCase().includes('must make true') && !text.includes('Portfolio exposure'));
  check('pre-parade(' + theme + '): no console errors', errors.length === 0);
  await page.close();
}
/* ---- premortem FAB board (Stage 2): three columns, promote → register ---- */
for(const theme of FLOW_THEMES){
  const {page, errors} = await freshPage('/premortem/', theme);
  await page.waitForTimeout(400);
  await page.click('[data-view="board"]'); await page.waitForTimeout(150);
  check('premortem board(' + theme + '): three FAB columns', await page.locator('.bcol').count() === 3);
  check('premortem board(' + theme + '): its views explain workshop, working board, and kept register',
    /run workshop/i.test(await page.locator('#viewtoggle [data-view="wizard"]').innerText()) &&
    /working board/i.test(await page.locator('#viewtoggle [data-view="board"]').innerText()) &&
    /risk register/i.test(await page.locator('#viewtoggle [data-view="register"]').innerText()));
  await page.fill('[data-add-kind="assumption"]', 'Onboarding completes on 3G');
  await page.press('[data-add-kind="assumption"]', 'Enter'); await page.waitForTimeout(150);
  await page.locator('.bcard').filter({hasText: 'Onboarding'}).locator('[data-promote]').click(); await page.waitForTimeout(150);
  await page.keyboard.press('Escape'); await page.waitForTimeout(100);
  check('premortem board(' + theme + '): Escape cancels promotion and restores the originating action',
    await page.locator('.bcard.promoting').count() === 0 &&
    await page.locator('.bcard').filter({hasText: 'Onboarding'}).locator('[data-promote]').evaluate(el => document.activeElement === el));
  await page.locator('.bcard').filter({hasText: 'Onboarding'}).locator('[data-promote]').click(); await page.waitForTimeout(100);
  const card = page.locator('.bcard.promoting');
  await card.locator('[data-promotep="lo"]').fill('30');
  await card.locator('[data-promotep="hi"]').fill('60');
  await card.locator('[data-promoteimpact="lo"]').fill('100');
  await card.locator('[data-promoteimpact="hi"]').fill('300');
  await card.locator('[data-promoteok]').click(); await page.waitForTimeout(250);
  check('premortem board(' + theme + '): promote lands on the register', /* innerText is the RENDERED text, and the shared .segmented control
       uppercases its labels (Swiss 6c) — compare case-insensitively so a
       future casing decision is a design change, not a suite break. */
    (await page.locator('.vtseg.on').innerText()).trim().toLowerCase() === 'risk register');
  check('premortem board(' + theme + '): promoted risk is a register row', (await page.locator('.register').innerText()).includes('Onboarding completes on 3G'));
  check('premortem board(' + theme + '): no console errors', errors.length === 0);
  await page.close();
}

/* ---- duel (pairwise showdown) ---- */
for(const theme of FLOW_THEMES){
  const {page, errors} = await freshPage('/duel/', theme);
  await page.waitForTimeout(400);
  await page.locator('#start').click();          // starts on the prefilled example
  await page.waitForTimeout(300);
  check('duel(' + theme + '): duel cards appear after start', await page.locator('#duelwrap [data-pick]').count() === 2);
  const pairBeforeInputArrow = await page.locator('#duelwrap').innerText();
  await page.locator('#question').evaluate(el => el.dispatchEvent(new KeyboardEvent('keydown', {
    key: 'ArrowLeft', bubbles: true,
  }))); await page.waitForTimeout(80);
  check('duel(' + theme + '): arrows typed in an input never choose a duel',
    pairBeforeInputArrow === await page.locator('#duelwrap').innerText());
  await page.locator('#undo').focus();
  const pairBeforeUtilityArrow = await page.locator('#duelwrap').innerText();
  await page.keyboard.press('ArrowRight'); await page.waitForTimeout(80);
  check('duel(' + theme + '): arrows on utilities never cast an accidental vote',
    pairBeforeUtilityArrow === await page.locator('#duelwrap').innerText());
  await page.locator('#duelwrap [data-pick]').first().focus();
  await page.keyboard.press('ArrowLeft'); await page.waitForTimeout(80);
  check('duel(' + theme + '): arrows only choose from a focused contender and restore focus to the next contender',
    await page.locator('#duelwrap [data-pick]').count() === 2 &&
    await page.locator('#duelwrap [data-pick]').first().evaluate(el => document.activeElement === el));
  check('duel(' + theme + '): the recorded choice is announced without adding an activity feed',
    /chosen over .*Next comparison ready/.test(await page.locator('#duelstatus').innerText()));
  check('duel(' + theme + '): unlooped order occupies the complete review sheet',
    await page.locator('.readcols').evaluate(el => getComputedStyle(el).gridTemplateColumns.split(' ').length === 1));
  for(let i = 0; i < 4; i++){
    if(await page.locator('#duelwrap [data-pick]').count() < 2) break;
    await page.locator('#duelwrap [data-pick]').first().click();
    await page.waitForTimeout(120);
  }
  check('duel(' + theme + '): implied-order list renders', await page.locator('#orderwrap .orow').count() >= 3);
  check('duel(' + theme + '): verdict non-empty', (await page.locator('#verdict').innerText()).trim().length > 10);
  check('duel(' + theme + '): no console errors', errors.length === 0);
  await page.close();
}

/* ---- duel: copy-link race regression (the un-awaited writeHashState bug) ----
   #copylink is clicked with NO settle wait right after a pick, to stress the
   exact race an un-awaited writeHashState would lose: navigator.clipboard.write
   Text is stubbed to capture the argument directly (deterministic — no real
   clipboard permission dance needed), then a second page loads that captured
   URL and its own duel count must reflect the pick just made, not the state
   from before it. */
{
  const {page, errors} = await freshPage('/duel/', 'light');
  await page.waitForTimeout(400);
  await page.locator('#start').click();
  await page.waitForTimeout(300);
  await page.evaluate(() => {
    window.__copied = null;
    navigator.clipboard.writeText = t => { window.__copied = t; return Promise.resolve(); };
  });
  // the duel count lives in #metrics .counts ("N duels · ...") — .progress
  // only exists once EVERY pair has been duelled, which isn't true yet here
  const readDuelCount = async pg => {
    const text = await pg.locator('#metrics .counts').innerText();
    const m = /(\d+)\s+duels?\b/i.exec(text);   // .innerText() reflects the CSS text-transform: uppercase
    return m ? parseInt(m[1], 10) : NaN;
  };
  const beforeN = await readDuelCount(page);
  await page.locator('#duelwrap [data-pick]').first().click();   // the just-made pick
  await page.locator('#copylink').click();                       // no settle wait — this is the race
  await page.waitForTimeout(150);
  const copied = await page.evaluate(() => window.__copied);
  check('duel: copylink captures a real URL with a hash', typeof copied === 'string' && copied.includes('#'));
  const page2 = await browser.newPage();
  await page2.goto(copied);
  await page2.waitForTimeout(400);
  const afterN = await readDuelCount(page2);
  check('duel: copied link decodes the just-made pick (count +1), not the stale pre-pick state',
    afterN === beforeN + 1);
  await page2.close();
  check('duel: no console errors', errors.length === 0);
  await page.close();
}

/* ---- alarm (base-rate playground) ---- */
for(const theme of FLOW_THEMES){
  const {page, errors} = await freshPage('/alarm/', theme);
  await page.waitForTimeout(500);
  check('alarm(' + theme + '): distribution renders', await page.locator('#distwrap svg').count() === 1);
  check('alarm(' + theme + '): distribution SVG decodes as XML', await svgDecodes(page, '#distwrap svg'));
  check('alarm(' + theme + '): gate canvas painted', await page.locator('#gate').evaluate(c => c.width > 100));
  const before = (await page.locator('#verdictAlarm').innerText()).trim();
  check('alarm(' + theme + '): verdict quotes an alarm fraction',
    /in \d+ alarms|No alarms|Every alarm/.test(before));
  check('alarm(' + theme + '): labels model expectation separately from the seeded observation',
    /Model expectation/i.test(await page.locator('#verdictFine').innerText()) &&
    /This seeded 1,000-case draw/i.test(await page.locator('#boxwrap').innerText()));
  await page.locator('#threshold').evaluate(e => { e.value = '0.2'; e.dispatchEvent(new Event('input', {bubbles: true})); });
  await page.waitForTimeout(300);
  const after = (await page.locator('#verdictAlarm').innerText()).trim();
  check('alarm(' + theme + '): moving the threshold changes the verdict', before !== after);
  await page.locator('#distwrap [data-drag="threshold"]').focus();
  const thresholdBeforeKeys = Number(await page.locator('#threshold').inputValue());
  await page.keyboard.press('ArrowRight'); await page.keyboard.press('ArrowRight');
  check('alarm(' + theme + '): repeated handle keys retain focus and change the threshold',
    await page.evaluate(() => document.activeElement?.dataset?.drag === 'threshold') &&
    Number(await page.locator('#threshold').inputValue()) > thresholdBeforeKeys);
  /* ledger 15's literal criterion: ten presses, not two — one semantic slider
     must retain focus throughout (not drift to a different handle/element),
     and the value + URL must stay coherent the whole way, not just after a
     couple of taps. */
  for(let i = 0; i < 8; i++) await page.keyboard.press('ArrowRight');   // 2 already pressed above = 10 total
  check('alarm(' + theme + '): ten ArrowRight presses retain focus on the ONE semantic threshold slider',
    await page.evaluate(() => document.activeElement?.dataset?.drag === 'threshold'));
  const thresholdAfterTen = Number(await page.locator('#threshold').inputValue());
  check('alarm(' + theme + '): ten ArrowRight presses monotonically raise the threshold',
    thresholdAfterTen > thresholdBeforeKeys);
  await page.waitForTimeout(500);   // let the 400ms hash-write debounce settle
  const hrefAfterTen = await page.evaluate(() => location.href);
  const tenPage = await browser.newPage();
  await tenPage.goto(hrefAfterTen);
  await tenPage.waitForTimeout(400);
  const reloadedThreshold = Number(await tenPage.locator('#threshold').inputValue());
  check('alarm(' + theme + '): URL after ten presses round-trips the exact threshold value',
    Math.abs(reloadedThreshold - thresholdAfterTen) < 1e-6);
  await tenPage.close();
  await page.getByRole('button', {name: 'Vendor claim'}).click();
  await page.locator('#threshold').evaluate(e => { e.value = '0.3'; e.dispatchEvent(new Event('input', {bubbles: true})); });
  check('alarm(' + theme + '): manual input clears the stale preset state',
    await page.locator('[data-preset="vendor-claim"]').getAttribute('aria-pressed') === 'false');
  await page.locator('#claimBtn').click();
  await page.keyboard.press('Escape');
  check('alarm(' + theme + '): claim dialog Escape restores its trigger focus',
    await page.evaluate(() => document.activeElement?.id === 'claimBtn'));
  check('alarm(' + theme + '): no console errors', errors.length === 0);
  await page.close();
}

/* ---- signal vs noise: state changes must tell users where they landed ---- */
for(const theme of FLOW_THEMES){
  const {page, errors} = await freshPage('/signal-vs-noise/', theme);
  await page.waitForTimeout(250);
  await page.locator('#next').click();
  await page.waitForTimeout(80);
  check('signal-vs-noise(' + theme + '): reveal transition moves focus to its new heading',
    await page.evaluate(() => document.activeElement === document.querySelector('#reveal h3')));
  check('signal-vs-noise(' + theme + '): reveal transition announces the state change',
    /results are ready/i.test(await page.locator('#phaseStatus').innerText()));
  await page.locator('#next').click();
  await page.waitForTimeout(80);
  check('signal-vs-noise(' + theme + '): next quarter moves focus to the playable stage',
    await page.evaluate(() => document.activeElement?.id === 'stage'));
  check('signal-vs-noise(' + theme + '): no console errors', errors.length === 0);
  await page.close();
}

/* ---- fermi ---- */
for(const theme of FLOW_THEMES){
  const {page, errors} = await freshPage('/fermi/', theme);
  await page.waitForTimeout(500);
  // opens alive on the first example, hash-safe (autoload; no URL write until interaction)
  check('fermi(' + theme + '): opens alive (autoload, hash clean)',
    (await page.locator('#p50').innerText()).trim() !== '—' && (await page.evaluate(() => location.hash)) === '');
  check('fermi(' + theme + '): review makes the formula route explicit',
    !(await page.locator('#modelsource').isVisible()) && await page.getByRole('button', {name:'Edit formula & ranges'}).isVisible());
  check('fermi(' + theme + '): result review selects P50 and Escape restores its selector without a URL write', await (async () => {
    const before = await page.evaluate(() => location.hash);
    await page.locator('#reviewp50').click();
    const selected = await page.locator('#reviewp50').getAttribute('aria-pressed') === 'true' &&
      await page.evaluate(() => document.activeElement?.id === 'resultreviewtitle');
    await page.locator('#resultreviewtitle').press('Escape');
    return selected && await page.locator('#reviewp50').getAttribute('aria-pressed') === 'false' &&
      await page.evaluate(hash => document.activeElement?.id === 'reviewp50' && location.hash === hash, before);
  })());
  await page.locator('#reviewp50').click();
  await page.getByRole('button', {name:'Edit formula & ranges'}).click();
  await page.locator('#formula').waitFor({state:'visible'});
  await page.waitForFunction(() => document.activeElement?.id === 'formula');
  check('fermi(' + theme + '): Edit formula & ranges clears selection and focuses the real authoring input',
    await page.evaluate(() => document.activeElement?.id === 'formula' && document.querySelector('#reviewp50')?.getAttribute('aria-pressed') === 'false'));
  await page.getByRole('button', {name: 'Weekly meeting, annual cost'}).click();
  await page.waitForTimeout(600);
  const p50 = (await page.locator('#p50').innerText()).trim();
  check('fermi(' + theme + '): example produces a P50 (' + p50 + ')', p50.length > 0 && p50 !== '—');
  // a malformed formula must ghost the prior result (not leave it reading as a current answer)
  check('fermi(' + theme + '): malformed formula ghosts the stale result', await (async () => {
    await page.locator('#formula').fill('a * * b');
    await page.waitForTimeout(400);
    const staleShown = await page.locator('#results.is-stale').count() === 1
      && await page.locator('#err').evaluate(e => getComputedStyle(e).display !== 'none');
    await page.getByRole('button', {name: 'Weekly meeting, annual cost'}).click(); // restore
    await page.waitForTimeout(400);
    const cleared = await page.locator('#results.is-stale').count() === 0;
    return staleShown && cleared;
  })());
  check('fermi(' + theme + '): histogram canvas painted', await page.locator('#hist').evaluate(c => c.width > 100));
  check('fermi(' + theme + '): sensitivity section shows', await page.locator('#sens .srow').count() > 1);
  check('fermi(' + theme + '): driver tree renders on toggle', await (async () => {
    await page.locator('#viewtree').click();
    await page.waitForTimeout(200);
    const svg = await page.locator('#driverwrap svg').count() === 1
      ? await page.locator('#driverwrap svg').innerHTML() : '';
    return /data-node="var"/.test(svg) && /data-node="out"/.test(svg) && !/NaN|undefined/.test(svg);
  })());
  check('fermi(' + theme + '): distribution view restores', await (async () => {
    await page.locator('#viewdist').click();
    await page.waitForTimeout(120);
    return await page.locator('.histwrap').isVisible() && !(await page.locator('#driverwrap').isVisible());
  })());
  check('fermi(' + theme + '): driver svg decodes as an image', await svgDecodes(page, '#driverwrap svg'));
  check('fermi(' + theme + '): input provenance survives hash reload and reaches the driver tree', await (async () => {
    await page.locator('#modeest').click();
    await page.getByRole('button', {name: 'Weekly meeting, annual cost'}).click();
    await page.waitForTimeout(450);
    const sources = page.locator('.vsource');
    await sources.nth(0).selectOption('snapshot');
    await sources.nth(1).selectOption('person');
    await page.waitForTimeout(550);
    const hash = await page.evaluate(() => location.hash);
    await page.goto(BASE + '/fermi/?smoke=provenance' + hash, {waitUntil: 'networkidle'});
    await page.waitForTimeout(500);
    await page.locator('#viewtree').click();
    const text = await page.locator('#driverwrap svg').textContent() || '';
    return /Data snapshot/.test(text) && /One person's estimate/.test(text);
  })());
  check('fermi(' + theme + '): a Gauge input marked not used cannot later enter the formula without review', await (async () => {
    const state = {
      f: 'a * b', v: {a: ['1', '2', 'auto'], b: ['2', '3', 'auto']}, p: {
        a: {kind: 'gauge', label: 'A', round: 1, responses: 2, pooling: 'envelope', status: 'adopted'},
        b: {kind: 'gauge', label: 'B', round: 1, responses: 2, pooling: 'envelope', status: 'not-used'},
      },
    };
    const packed = await page.evaluate(async state => {
      const data = new TextEncoder().encode(JSON.stringify(state));
      const cs = new CompressionStream('deflate-raw');
      const writer = cs.writable.getWriter(); writer.write(data); writer.close();
      const bytes = new Uint8Array(await new Response(cs.readable).arrayBuffer());
      return '#z:' + btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    }, state);
    await page.goto(BASE + '/fermi/?smoke=gauge-review' + packed, {waitUntil: 'networkidle'});
    await page.waitForTimeout(500);
    await page.getByRole('button', {name:'Edit formula & ranges'}).click();
    return !(await page.locator('#results').isVisible()) && /Review needed/.test(await page.locator('#ph').innerText()) &&
      await page.getByRole('button', {name: 'Adopt b as my 90% range'}).isVisible();
  })());
  check('fermi(' + theme + '): cashflow mode renders NPV verdict', await (async () => {
    await page.locator('#modecf').click();
    await page.waitForTimeout(600);
    const svg = await page.locator('#cfwrap svg').count() === 1
      ? await page.locator('#cfwrap svg').innerHTML() : '';
    return /NPV P50/.test(svg) && /payback/i.test(svg) && !/NaN|undefined/.test(svg);
  })());
  check('fermi(' + theme + '): runway example flips the framing', await (async () => {
    await page.getByRole('button', {name: 'Runway'}).click();
    await page.waitForTimeout(600);
    const svg = await page.locator('#cfwrap svg').innerHTML();
    return /RUNWAY/.test(svg) && /month \d+/.test(svg);
  })());
  check('fermi(' + theme + '): geared example renders the financing card', await (async () => {
    await page.getByRole('button', {name: 'Geared build (levered IRR)'}).click();
    await page.waitForTimeout(600);
    const svg = await page.locator('#cfwrap svg').innerHTML();
    return /FINANCING VERDICT/.test(svg) && /LEVERED/.test(svg) && /equity IRR/i.test(svg) && !/NaN|undefined/.test(svg);
  })());
  check('fermi(' + theme + '): cashflow svg decodes as an image', await svgDecodes(page, '#cfwrap svg'));
  check('fermi(' + theme + '): estimate mode restores untouched', await (async () => {
    await page.locator('#modeest').click();
    await page.waitForTimeout(400);
    return await page.locator('#formula').isVisible() && !(await page.locator('#cfwrap').isVisible());
  })());
  check('fermi(' + theme + '): no console errors', errors.length === 0);
  await page.close();
}

/* ---- rank ---- */
for(const theme of FLOW_THEMES){
  const {page, errors} = await freshPage('/rank/', theme);
  await page.getByRole('button', {name: OPS_INFRA_BACKLOG.name}).click();
  await page.waitForTimeout(600);
  const rows = await page.locator('#rows tr').count();
  check('rank(' + theme + '): table renders rows (' + rows + ')',
    rows === OPS_INFRA_BACKLOG.items.length);   // the bug that shipped
  const verdict = (await page.locator('#verdict').innerText()).trim();
  check('rank(' + theme + '): verdict present', verdict.length > 20);
  check('rank(' + theme + '): rank bars render',
    await page.locator('.rankbar').count() === OPS_INFRA_BACKLOG.items.length);
  const flip = (await page.locator('#flipline').innerText()).trim();
  check('rank(' + theme + '): flip verdict present', /weight|flips first place/i.test(flip));
  check('rank(' + theme + '): order diff names the movers', await (async () => {
    await page.locator('#oda').fill('Alpha\nBeta\nGamma\nDelta');
    await page.locator('#odb').fill('Delta\nBeta\nGamma\nAlpha');
    await page.waitForTimeout(400);
    const v = await page.locator('#odverdict').innerText();
    return /Kendall/.test(v) && await page.locator('.odrow').count() >= 2;
  })());
  await page.locator('th .cname').first().fill('Value renamed');
  await page.waitForTimeout(80);
  check('rank(' + theme + '): score labels follow renamed criteria',
    (await page.locator('#rows .score').nth(0).getAttribute('aria-label')).includes('Value renamed'));
  const firstScore = page.locator('#rows .score').nth(0);
  await firstScore.fill('100'); await firstScore.blur();
  check('rank(' + theme + '): typed scores normalise to the supported range on commit',
    await firstScore.inputValue() === '10');
  check('rank(' + theme + '): no console errors', errors.length === 0);
  await page.close();
}

/* ---- tree ---- */
for(const theme of FLOW_THEMES){
  const {page, errors} = await freshPage('/tree/', theme);
  await page.getByRole('button', {name: 'Bid or no bid'}).click();
  await page.waitForTimeout(600);
  check('tree(' + theme + '): example renders SVG', await page.locator('#preview svg').count() === 1);
  const svg = await page.locator('#preview svg').innerHTML();
  check('tree(' + theme + '): verdict present (6b anatomy: kicker + one brand key figure)',
    svg.includes('VERDICT') && /Choose /.test(svg) && /<tspan class="vfig" fill=['"](#D62015|#FF4B3E)['"]>/.test(svg));
  check('tree(' + theme + '): flip analysis present', svg.includes('WHAT WOULD FLIP THIS') || svg.includes('flips if'));
  check('tree(' + theme + '): svg decodes as an image', await svgDecodes(page, '#preview svg'));
  check('tree(' + theme + '): Copy PNG copies a PNG', await copyPngWorks(page));
  check('tree(' + theme + '): Tab indents, Shift-Tab restores', await (async () => {
    const before = await page.evaluate(() => localStorage.getItem('tree-src'));
    await page.locator('.cm-content').click();
    await page.keyboard.press('Tab');
    await page.waitForTimeout(300);
    const mid = await page.evaluate(() => localStorage.getItem('tree-src'));
    await page.keyboard.press('Shift+Tab');
    await page.waitForTimeout(300);
    const after = await page.evaluate(() => localStorage.getItem('tree-src'));
    return mid !== before && mid.length === before.length + 2 && after === before;
  })());
  check('tree(' + theme + '): no console errors', errors.length === 0);
  await page.close();
}

/* ---- why ---- */
for(const theme of FLOW_THEMES){
  const {page, errors} = await freshPage('/why/', theme);
  await page.getByRole('button', {name: 'Edit tree source'}).click();
  await page.getByRole('button', {name: 'Reading retention'}).click();
  await page.waitForTimeout(600);
  check('why(' + theme + '): Causal Tree renders', await page.locator('#preview svg[data-causal-field="why"]').count() === 1);
  const field = await page.locator('#preview svg').innerHTML();
  check('why(' + theme + '): Causal Tree retains the rooted source topology and explicit assumption claims',
    ['outcome', 'opportunity', 'solution', 'assumption'].every(stage => field.includes('data-causal-stage="' + stage + '"')) &&
    field.includes('data-causal-assumption-band') && field.includes('ASSUMPTION CLAIMS'));
  await page.locator('#viewmap').click();
  await page.waitForTimeout(500);
  /* The Lens identity is a root-SVG contract; innerHTML cannot observe root
     attributes and would turn this into a permanent false negative. */
  const lens = await page.locator('#preview svg').evaluate(el => el.outerHTML);
  check('why(' + theme + '): Delivery Lens derives factual readiness without claiming an operating roadmap',
    lens.includes('data-readiness-ledger="why"') && lens.includes('DELIVERING') && lens.includes('TESTING') && lens.includes('UNADDRESSED') &&
    !/\bNOW\b|\bNEXT\b|\bLATER\b/.test(lens) && lens.includes('Resume where you left off') &&
    (await page.locator('#viewnote').textContent()).includes('not delivery capacity or a decision plan'));
  check('why(' + theme + '): Delivery Lens preserves the causal path for unaddressed discovery',
    lens.includes('Improve 90-day retention → Progress feels invisible'));
  check('why(' + theme + '): svg decodes as an image', await svgDecodes(page, '#preview svg'));
  check('why(' + theme + '): snapshot compare renders the narrative + NEW badge', await (async () => {
    await page.locator('#viewost').click();
    await page.getByText('History', {exact: true}).click();
    await page.locator('#snap').click();
    await page.locator('.cm-content').click();
    await page.keyboard.press('Meta+ArrowDown');
    await page.keyboard.press('Enter');
    await page.keyboard.type('outcome: Snap ' + theme);
    await page.waitForTimeout(500);
    const n = await page.locator('#snapsel option').count();
    await page.locator('#snapsel').selectOption({index: n - 1});
    await page.waitForTimeout(500);
    const svg = await page.locator('#preview svg').innerHTML();
    return /Since /.test(svg) && /data-causal-narrative-line/.test(svg) && />NEW<\/text>/.test(svg);
  })());
  check('why(' + theme + '): no console errors', errors.length === 0);
  await page.close();
}

/* ---- map ---- */
for(const theme of FLOW_THEMES){
  const {page, errors} = await freshPage('/map/', theme);
  await page.getByRole('button', {name: 'Edit map source'}).click();
  await page.getByRole('button', {name: 'Assumption map'}).click();
  await page.waitForTimeout(600);
  check('map(' + theme + '): renders SVG', await page.locator('#preview svg').count() === 1);
  const svg = await page.locator('#preview svg').innerHTML();
  check('map(' + theme + '): zones labelled', svg.includes('TEST FIRST'));
  check('map(' + theme + '): verdict present (6b anatomy: kicker + one brand key figure)',
    svg.includes('VERDICT') && /<tspan class="vfig" fill=['"](#D62015|#FF4B3E)['"]>/.test(svg));
  check('map(' + theme + '): unplaced tray', svg.includes('UNPLACED') && svg.includes('Legal sign-off'));
  check('map(' + theme + '): no-test flag', svg.includes('no test designed'));
  await page.getByRole('button', {name: 'Risk grid'}).click();
  await page.waitForTimeout(500);
  const risk = await page.locator('#preview svg').innerHTML();
  check('map(' + theme + '): risk preset severity bands', risk.includes('SEVERE') && risk.includes('MODERATE'));
  check('map(' + theme + '): skills preset flags the bus factor (#69)', await (async () => {
    await page.getByRole('button', {name: 'Skills coverage'}).click();
    await page.waitForTimeout(500);
    const svg = await page.locator('#preview svg').innerHTML();
    return svg.includes('BUS FACTOR') && /no backup named/.test(svg);
  })());
  check('map(' + theme + '): rag preset calls the watermelon (#70)', await (async () => {
    await page.getByRole('button', {name: 'RAG honesty'}).click();
    await page.waitForTimeout(500);
    const svg = await page.locator('#preview svg').innerHTML();
    return svg.includes('WATERMELON WATCH') && /reported green/.test(svg);
  })());
  check('map(' + theme + '): svg decodes as an image', await svgDecodes(page, '#preview svg'));
  check('map(' + theme + '): Copy PNG copies a PNG', await copyPngWorks(page));
  check('map(' + theme + '): untested assumptions hand off to a clearly labelled Gauge-prior session (#93)', await (async () => {
    await page.getByRole('button', {name: 'Assumption map'}).click();
    await page.waitForTimeout(500);
    if(await page.locator('#togauge').isHidden()) return false;
    await page.locator('#togauge').click();
    await page.waitForTimeout(800);
    if(!page.url().includes('/gauge/')) return false;
    await page.locator('#railtab').click();
    await page.locator('#viewform').click(); // gauge opens on the reveal now; the form carries the handed-off questions
    await page.waitForTimeout(300);
    const qs = await page.locator('#preview .gform .q').count();
    const title = await page.locator('.cm-content').innerText();
    await page.goBack();
    await page.waitForTimeout(500);
    return qs === 2 && title.includes('room prior');
  })());
  check('map(' + theme + '): non-assumption flags do not invent a Gauge probability handoff', await (async () => {
    await page.getByRole('button', {name: 'Risk grid'}).click();
    await page.waitForTimeout(500);
    return await page.locator('#togauge').isHidden();
  })());
  check('map(' + theme + '): snapshot compare shows drift', await (async () => {
    await page.getByRole('button', {name: 'Assumption map'}).click();
    await page.waitForTimeout(400);
    await page.getByText('History', {exact: true}).click();
    await page.locator('#snap').click();
    await page.locator('.cm-content').click();
    await page.keyboard.press('Meta+ArrowDown');
    await page.keyboard.press('Enter');
    await page.keyboard.type('Drift ' + theme + ' @ 90,10');
    await page.waitForTimeout(500);
    const n = await page.locator('#snapsel option').count();
    await page.locator('#snapsel').selectOption({index: n - 1});
    await page.waitForTimeout(500);
    const svg = await page.locator('#preview svg').innerHTML();
    return /Since /.test(svg) && />NEW<\/text>/.test(svg);
  })());
  check('map(' + theme + '): no console errors', errors.length === 0);
  await page.close();
}

/* ---- gauge (solo mode; the relay flow lives in gauge.mjs) ---- */
for(const theme of FLOW_THEMES){
  const {page, errors} = await freshPage('/gauge/', theme);
  await page.waitForTimeout(600);
  // New default: opens alive on the sample reveal of the first example (hash-safe autoload).
  check('gauge(' + theme + '): opens alive on the sample reveal', await page.locator('#viewreveal.on').count() === 1 && await page.locator('#preview svg').count() === 1);
  await page.locator('#railtab').click();
  await page.getByRole('button', {name: 'Q3 commitment review'}).click();
  await page.locator('#viewform').click();
  await page.waitForTimeout(600);
  check('gauge(' + theme + '): form preview renders 3 questions', await page.locator('#preview .gform .q').count() === 3);
  check('gauge(' + theme + '): ＋ Add question opens a type picker that writes through the editor', await (async () => {
    // scroll ＋ Add to viewport centre THEN open via raw coords: a later scroll-into-view
    // would trip edit-in-place's scroll-closes-the-popover guard before the row click lands
    // (the same reason check-eip's gauge block scrolls-to-centre first).
    const pt = await page.evaluate(() => { const g = document.querySelector('.addq');
      g.scrollIntoView({block: 'center'}); const r = g.getBoundingClientRect();
      return {x: r.left + r.width / 2, y: r.top + r.height / 2}; });
    await page.waitForTimeout(150);
    await page.mouse.click(pt.x, pt.y);                                            // opens the type picker
    await page.waitForTimeout(200);
    const rows = (await page.locator('.eip-pop button').allInnerTexts()).join('|');
    await page.locator('.eip-pop button', {hasText: 'Probability'}).click();       // pick a type → inserts
    await page.waitForTimeout(400);
    return rows === 'Probability|Range|Chips' && await page.locator('#preview .gform .q').count() === 4;
  })());
  await page.locator('#viewreveal').click();
  await page.waitForTimeout(500);
  check('gauge(' + theme + '): sample reveal renders SVG', await page.locator('#preview svg').count() === 1);
  check('gauge(' + theme + '): overlay svg decodes as an image', await svgDecodes(page, '#preview svg'));
  const svg = await page.locator('#preview svg').innerHTML();
  check('gauge(' + theme + '): sample reveal keeps a compact textual reading receipt',
    await page.locator('#preview [data-result-receipt]').count() === 1 &&
    await page.locator('#preview .receipt-disclosure summary').count() === 1);
  check('gauge(' + theme + '): privacy line present', (await page.locator('footer').innerText()).includes('only numbers'));
  check('gauge(' + theme + '): no console errors', errors.length === 0);
  await page.close();
}

/* ---- flow ---- */
for(const theme of FLOW_THEMES){
  const {page, errors} = await freshPage('/flow/', theme);
  await page.getByRole('button', {name: 'Overloaded team'}).click();
  await page.waitForTimeout(700);
  check('flow(' + theme + '): readout SVG renders', await page.locator('#verdictwrap svg').count() === 1);
  const svg = await page.locator('#verdictwrap svg').innerHTML();
  check('flow(' + theme + '): verdict present', /average item takes/i.test(svg));
  check('flow(' + theme + '): overload honesty line', /demand exceeds capacity/i.test(svg));
  check('flow(' + theme + '): histogram bars', (svg.match(/<rect/g) || []).length > 5);
  check('flow(' + theme + '): batch U-curve renders', await page.locator('#batchwrap svg').count() === 1);
  const batchSvg = await page.locator('#batchwrap svg').innerHTML();
  check('flow(' + theme + '): batch verdict names the economic batch', /Economic batch/.test(batchSvg));
  /* the optional lessons are one-at-a-time tabpanels, so a control only exists
     to the user once its lens is chosen — drive the tab, then the control */
  const lens = async name => { await page.locator('#lens-' + name).click(); await page.waitForTimeout(120); };
  check('flow(' + theme + '): triage renders with a pile', await (async () => {
    await lens('triage');
    await page.locator('#backlog').fill('20');
    await page.waitForTimeout(500);
    const t = await page.locator('#triagewrap svg').innerHTML();
    return /QUEUE TRIAGE/.test(t) && (t.match(/data-bar/g) || []).length === 4;
  })());
  check('flow(' + theme + '): triage drain framing on an overloaded pile',
    /pile|clears|never/i.test(await page.locator('#triagewrap svg').innerHTML()));
  check('flow(' + theme + '): expedite card names the waiting trade', await (async () => {
    await lens('expedite');
    await page.locator('#expedite').fill('1');
    await page.waitForTimeout(500);
    const e = await page.locator('#expeditewrap svg').innerHTML();
    return /EXPEDITE LANE/.test(e) && /same people and WIP/i.test(e) && /STANDARD/.test(e);
  })());
  check('flow(' + theme + '): dependent dice keeps local capacity distinct from flow', await (async () => {
    const d = await page.locator('#dicewrap svg').innerHTML();
    return /LOCAL CAPACITY IS NOT FLOW/.test(d) && /STEP 1/.test(d) && /WORK WAITING/.test(d);
  })());
  check('flow(' + theme + '): dependent dice can be re-rolled without losing its artifact', await (async () => {
    const before = await page.locator('#dicewrap svg').innerHTML();
    await lens('dice');
    await page.getByRole('button', {name: 'Roll again'}).click();
    await page.waitForTimeout(250);
    const after = await page.locator('#dicewrap svg').innerHTML();
    return after !== before && /DEPENDENT DICE/.test(after);
  })());
  check('flow(' + theme + '): readout svg decodes as an image', await svgDecodes(page, '#verdictwrap svg'));
  check('flow(' + theme + '): no undefined/NaN leaks into any svg', await (async () => {
    for(const sel of ['#verdictwrap svg', '#batchwrap svg', '#triagewrap svg', '#expeditewrap svg', '#dicewrap svg']){
      const s = await page.locator(sel).innerHTML();
      if(/undefined|NaN/.test(s)) return false;
    }
    return true;
  })());
  check('flow(' + theme + '): no console errors', errors.length === 0);
  await page.close();
}

/* ---- wardley ---- */
for(const theme of FLOW_THEMES){
  const {page, errors} = await freshPage('/wardley/', theme);
  await page.waitForTimeout(500);
  check('wardley(' + theme + '): opens alive (hash-safe autoload)', await page.locator('#preview svg').count() === 1);
  await page.getByRole('button', {name: 'Edit landscape source'}).click();
  await page.getByRole('button', {name: 'Lantern platform'}).click();
  await page.waitForTimeout(600);
  const svg = await page.locator('#preview svg').innerHTML();
  check('wardley(' + theme + '): anchors + stage columns render', svg.includes('Reading') && svg.includes('commodity'));
  check('wardley(' + theme + '): ghost renders dashed', /Analytics pipeline/.test(svg) && /stroke-dasharray/.test(svg));
  check('wardley(' + theme + '): Copy PNG copies a PNG', await copyPngWorks(page));
  check('wardley(' + theme + '): svg decodes as an image', await svgDecodes(page, '#preview svg'));
  check('wardley(' + theme + '): no console errors', errors.length === 0);
  await page.close();
}

/* ---- bets ---- */
for(const theme of FLOW_THEMES){
  const {page, errors} = await freshPage('/bets/', theme);
  await page.waitForTimeout(500);
  check('bets(' + theme + '): opens alive (hash-safe autoload)', await page.locator('#preview svg').count() === 1);
  await page.getByRole('button', {name: 'Lantern portfolio'}).click();
  await page.waitForTimeout(600);
  const svg = await page.locator('#preview svg').innerHTML();
  check('bets(' + theme + '): board renders the ledger', svg.includes('Referral flow v2') && svg.includes('PORTFOLIO'));
  check('bets(' + theme + '): audits stamp the flagged bet', /NO KILL CRITERION/.test(svg) && /ODDS IMPLY CERTAINTY/.test(svg));
  check('bets(' + theme + '): svg decodes as an image', await svgDecodes(page, '#preview svg'));
  // view toggle: Board <-> Quadrant (view 2, read-only risk-return scatter)
  await page.getByRole('button', {name: 'Quadrant'}).click();
  await page.waitForTimeout(300);
  const qsvg = await page.locator('#preview svg').innerHTML();
  check('bets(' + theme + '): quadrant view renders a bubble', qsvg.includes('<circle'));
  check('bets(' + theme + '): quadrant axis title present', qsvg.includes('ODDS OF SUCCESS'));
  check('bets(' + theme + '): quadrant toggle marks aria-pressed',
    await page.getByRole('button', {name: 'Quadrant'}).getAttribute('aria-pressed') === 'true' &&
    await page.getByRole('button', {name: 'Board'}).getAttribute('aria-pressed') === 'false');
  check('bets(' + theme + '): quadrant svg decodes as an image', await svgDecodes(page, '#preview svg'));
  await page.getByRole('button', {name: 'Board'}).click();
  await page.waitForTimeout(300);
  const backSvg = await page.locator('#preview svg').innerHTML();
  check('bets(' + theme + '): toggling back to Board restores the ledger',
    backSvg.includes('Referral flow v2') && backSvg.includes('PORTFOLIO'));
  check('bets(' + theme + '): Copy PNG copies a PNG', await copyPngWorks(page));
  check('bets(' + theme + '): no console errors', errors.length === 0);
  await page.close();
}

/* ---- timeline ---- */
for(const theme of FLOW_THEMES){
  const {page, errors} = await freshPage('/timeline/', theme);
  await showSourceIfReading(page);
  await page.waitForTimeout(500);
  check('timeline(' + theme + '): opens alive (hash-safe autoload)', await page.locator('#preview svg').count() === 1);
  await page.getByRole('button', {name: 'App launch programme'}).click();
  await page.waitForTimeout(600);
  check('timeline(' + theme + '): renders SVG', await page.locator('#preview svg').count() === 1);
  const svg = await page.locator('#preview svg').innerHTML();
  check('timeline(' + theme + '): whiskers + today line', /data-ms="whisker"/.test(svg) && /data-today/.test(svg));
  check('timeline(' + theme + '): readout names the widest whisker', /Widest whisker/.test(svg));
  check('timeline(' + theme + '): svg decodes as an image', await svgDecodes(page, '#preview svg'));
  check('timeline(' + theme + '): Copy PNG copies a PNG', await copyPngWorks(page));
  const fieldCardContract = await (async () => {
    const card = page.locator('#preview [data-edit="cardmenu"]').first();
    await card.focus();
    await card.press('Enter');
    const menu = page.locator('.eip-pop');
    await menu.waitFor({state:'visible'});
    const bounds = await menu.evaluate(el => { const r = el.getBoundingClientRect(); return {left:r.left, top:r.top, right:r.right, bottom:r.bottom, width:innerWidth, height:innerHeight}; });
    const inBounds = bounds.left >= 8 && bounds.top >= 8 && bounds.right <= bounds.width - 8 && bounds.bottom <= bounds.height - 8;
    await menu.getByRole('menuitem', {name:'Rename…'}).click();
    const input = page.locator('.eip-input');
    await input.fill('Bad 2026-10');
    await input.press('Enter');
    const invalid = await input.evaluate(el => el.classList.contains('invalid'));
    await input.press('Escape');
    /* Escape commits only after the input teardown restores its named Field
       target. Wait for that observable state rather than sampling the
       post-key handler's animation frame. */
    const restored = await page.waitForFunction(() =>
      !document.querySelector('.eip-input') && document.activeElement?.dataset?.edit === 'label',
    null, {timeout:1000}).then(() => true).catch(() => false);
    return {inBounds, invalid, closed: await input.count() === 0, restored,
      returnedTo: await page.evaluate(() => document.activeElement?.dataset?.edit || 'none')};
  })();
  check('timeline(' + theme + '): Field card menu stays inside the viewport', fieldCardContract.inBounds);
  check('timeline(' + theme + '): Field card rejects invalid rename input', fieldCardContract.invalid);
  check('timeline(' + theme + '): Field card Escape closes the input and restores its label target (returned ' + fieldCardContract.returnedTo + ')',
    fieldCardContract.closed && fieldCardContract.restored);
  const fieldCompareContract = await (async () => {
    await page.getByText('History', {exact: true}).click();
    await page.locator('#snap').click();
    await page.locator('.cm-content').click();
    await page.keyboard.press('Meta+ArrowDown');
    await page.keyboard.press('Enter');
    await page.keyboard.type('Ops: Snap ' + theme + ' 2027-03 .. 2027-05');
    await page.waitForTimeout(500);
    const n = await page.locator('#snapsel option').count();
    await page.locator('#snapsel').selectOption({index: n - 1});
    await page.waitForTimeout(500);
    const d = await page.locator('#preview svg').innerHTML();
    return {since:/SINCE /.test(d), fresh:/>NEW</.test(d)};
  })();
  check('timeline(' + theme + '): snapshot compare names its baseline', fieldCompareContract.since);
  check('timeline(' + theme + '): snapshot compare renders a NEW timing fact', fieldCompareContract.fresh);
  check('timeline(' + theme + '): no console errors', errors.length === 0);
  await page.close();
}

/* An empty Timeline is still a real Field: it can be exported and its quiet
   keyboard add route starts the first milestone. This uses the app, rather than
   a pure renderer, because a placeholder would otherwise bypass both paths. */
{
  const {page, errors} = await freshPage('/timeline/');
  await showSourceIfReading(page);
  await page.locator('.cm-content').click();
  await page.keyboard.press('ControlOrMeta+A');
  await page.keyboard.press('Backspace');
  await page.waitForFunction(() => document.querySelector('#preview svg[data-field="timeline"]'));
  const add = page.locator('#preview [data-edit="additem"][data-lane=""]');
  await add.focus();
  await add.press('Enter');
  check('timeline: empty Field keeps a keyboard add route', await page.locator('.eip-input').count() === 1);
  await page.keyboard.press('Escape');
  check('timeline: empty Field Copy PNG exports the factual empty state', await copyPngWorks(page));
  check('timeline: empty Field has no console error', errors.length === 0);
  await page.close();
}

/* ---- roadmap (smoke only; deep suite is check.mjs) ---- */
{
  const {page, errors} = await freshPage('/roadmap/');
  const openRoadmapSource = async () => {
    if(await page.locator('#workspace').evaluate(el => el.classList.contains('collapsed'))){
      await page.locator('#railtab').click();
    }
  };
  await page.getByRole('button', {name: 'Reading app roadmap'}).click();
  await page.waitForTimeout(500);
  check('roadmap: preview renders', await page.locator('#preview svg').count() === 1);
  check('roadmap: svg decodes as an image', await svgDecodes(page, '#preview svg'));
  /* A plain now/next/later document is explicitly represented as Grid in the
     composition bar and in exports. The Grid carries data-cell drag cells and
     never data-hdrop (Board/Register are explicit source choices). */
  check('roadmap: a plain doc (no style:) renders Grid by default, not board-live',
    (await page.locator('#preview svg [data-cell]').count()) >= 1 &&
    (await page.locator('#preview svg [data-hdrop]').count()) === 0);
  check('roadmap: the Grid chip lights on a plain doc (same live and export choice)',
    await page.locator('#stylepicker [data-style="grid"]').evaluate(el => el.classList.contains('on')));
  // Choosing Board writes style:board and switches the preview to the live board.
  await page.locator('#stylepicker [data-style="board"]').click();
  await page.waitForTimeout(400);
  check('roadmap: clicking Board on a plain doc switches the preview to the live board',
    (await page.locator('#preview svg [data-hdrop]').count()) >= 1 &&
    (await page.locator('#preview svg [data-cell]').count()) === 0);

  await page.locator('#stylepicker [data-style="register"]').click();
  await page.waitForTimeout(400);
  check('roadmap: Register view renders the live editable table (rows carry data-line)',
    (await page.locator('#preview svg [data-edit="cardmenu"]').count()) >= 1);
  check('roadmap: Register rows expose editable cells',
    (await page.locator('#preview svg [data-edit="title"]').count()) >= 1);
  // WYSIWYG export: Download SVG from Register view yields the register table, not the chart
  await page.getByText('Export', {exact: true}).click();
  const [reg] = await Promise.all([
    page.waitForEvent('download', {timeout: 8000}),
    page.locator('#dlsvg').click(),
  ]);
  const regSvg = readFileSync(await reg.path(), 'utf8');
  check('roadmap: Download SVG in Register view exports the register table (has the ITEM/HORIZON header)',
    /ITEM/.test(regSvg) && /HORIZON/.test(regSvg) && !/data-cell/.test(regSvg));
  await page.locator('#stylepicker [data-style="board"]').click();
  await page.waitForTimeout(400);
  // Board view (Task 4): the live editable board, not the chart — the chart carries
  // data-cell and never data-hdrop; the live board carries data-hdrop drop bands and
  // data-edit="cardmenu" groups. Cards resolved BY TITLE, never data-line (the suite
  // convention — a line number is a property of the example doc, not a stable identity).
  check('roadmap: Board view renders the live editable board (drop bands + card menus present)',
    (await page.locator('#preview svg [data-hdrop]').count()) >= 1 &&
    (await page.locator('#preview svg [data-edit="cardmenu"]').count()) >= 1);
  check('roadmap: Board card resolved by title carries data-edit=cardmenu',
    (await page.locator('#preview svg [data-edit="cardmenu"]').filter({hasText: 'Resume where you left off'}).count()) >= 1);
  // WYSIWYG export: Download SVG from Board view yields the live board artefact, not the chart
  const [brd] = await Promise.all([
    page.waitForEvent('download', {timeout: 8000}),
    page.locator('#dlsvg').click(),
  ]);
  const brdSvg = readFileSync(await brd.path(), 'utf8');
  check('roadmap: Download SVG in Board view exports the live board (card + column content, no chart data-cell, no edit markup)',
    /Resume where you left off/.test(brdSvg) && /NOW/.test(brdSvg) &&
    !/data-cell/.test(brdSvg) && !/data-hdrop/.test(brdSvg) && !/data-edit=/.test(brdSvg));
  await page.waitForTimeout(300);

  /* Focus view (Task 5): the live hero+rail lens, the lens click, WYSIWYG export.
     A fresh doc (explicit style: focus — focus is never a default, so a plain doc
     stays the chart per the Board lesson). Items resolved BY TITLE throughout, the
     suite convention — a line number is a property of the example doc, not a
     stable identity. */
  await openRoadmapSource();
  await page.locator('.cm-content').click();
  await page.keyboard.press('ControlOrMeta+a');
  await page.keyboard.insertText(
    'title: Focus Test\nstyle: focus\nNOW\nCore: Alpha task\nNEXT\nCore: Beta task\nLATER\nCore: Gamma task');
  await page.waitForTimeout(600);
  check('roadmap: Focus view renders live (a drop band + a hero card menu + a rail lens)',
    (await page.locator('#preview svg [data-hdrop]').count()) >= 1 &&
    (await page.locator('#preview svg [data-edit="cardmenu"]').filter({hasText: 'Alpha task'}).count()) >= 1 &&
    (await page.locator('#preview svg [data-lens="Later"]').count()) >= 1);

  // the lens: clicking a rail header commits focus:<horizon> into the doc AND
  // switches the hero — the LATER item (Gamma task) now paints as a hero card.
  await page.locator('#preview svg [data-lens="Later"]').click();
  await page.waitForTimeout(600);
  const focusSrc = await page.evaluate(() => localStorage.getItem('roadmap-src'));
  check('roadmap: clicking a rail lens commits focus: <horizon> into the doc text',
    /^focus:\s*Later\s*$/mi.test(focusSrc || ''));
  check('roadmap: the lens click switches the hero (Gamma task is now a hero card)',
    (await page.locator('#preview svg [data-edit="cardmenu"]').filter({hasText: 'Gamma task'}).count()) >= 1);

  // WYSIWYG export: Download SVG from Focus view yields the live focus artefact, not the chart
  const [foc] = await Promise.all([
    page.waitForEvent('download', {timeout: 8000}),
    page.locator('#dlsvg').click(),
  ]);
  const focSvg = readFileSync(await foc.path(), 'utf8');
  check('roadmap: Download SVG in Focus view exports the live focus artefact (hero + rail content, no chart data-cell, no edit markup)',
    /Gamma task/.test(focSvg) && /LATER/.test(focSvg) &&
    !/data-cell/.test(focSvg) && !/data-hdrop/.test(focSvg) && !/data-edit=/.test(focSvg));

  // back to Grid (the state the composition loop below expects as its starting chip)
  await page.locator('#stylepicker [data-style="grid"]').click();
  await page.waitForTimeout(400);

  /* composition bar: 4 chips, enabled once there's a preview, Grid active on
     a plain document (no split live/export state). */
  check('roadmap: style picker has 4 chips', await page.locator('#stylepicker [data-style]').count() === 4);
  check('roadmap: style picker enabled once there is something to export',
    await page.locator('#stylepicker [data-style="board"]').isEnabled());
  check('roadmap: Grid is the default active chip',
    await page.locator('#stylepicker [data-style="grid"]').evaluate(el => el.classList.contains('on')));

  for(const style of ['focus', 'register', 'grid', 'board']){
    await page.locator('#stylepicker [data-style="' + style + '"]').click();
    await page.waitForTimeout(400);
    const src = await page.evaluate(() => localStorage.getItem('roadmap-src'));
    check('roadmap: clicking ' + style + ' commits style: ' + style + ' into the doc text',
      new RegExp('style:\\s*' + style, 'i').test(src || ''));
    const activeStyles = await page.locator('#stylepicker [data-style].on')
      .evaluateAll(els => els.map(el => el.dataset.style));
    check('roadmap: ' + style + ' chip is the only one marked active',
      activeStyles.length === 1 && activeStyles[0] === style);
    /* the class is for the eye; aria-pressed is the state a SR user hears —
       the house toggle groups (bets, merit-order, premortem, zoom) set both */
    const pressed = await page.locator('#stylepicker [data-style][aria-pressed="true"]')
      .evaluateAll(els => els.map(el => el.dataset.style));
    check('roadmap: ' + style + ' chip is the only one with aria-pressed=true',
      pressed.length === 1 && pressed[0] === style);

    /* the deck is no longer its own download button (2026-07-31) — Copy PNG is
       the action that hands it over, so that's where each style's deck render
       has to survive the decode-and-rasterize round trip */
    check('roadmap: ' + style + ' deck copies as a real PNG', await copyPngWorks(page));
  }

  /* the deck HEADLINE: authored, never generated. The field and the DSL key are
     one act, in BOTH directions — the field commits a `headline:` line, and a
     `headline:` line typed in the editor shows up in the field. */
  const srcOf = () => page.evaluate(() => localStorage.getItem('roadmap-src') || '');
  const settle = () => page.waitForTimeout(900);   // 400ms field debounce + 120ms editor debounce + rAF
  await page.locator('#headline').fill('');
  await page.locator('#headline').blur();
  await settle();
  check('roadmap: clearing the headline field removes the headline: line entirely',
    !/^headline:/m.test(await srcOf()));

  await page.locator('#headline').fill('We are betting on retention');
  await page.locator('#headline').blur();
  await settle();
  check('roadmap: the headline field commits a headline: line into the doc text',
    /^headline: We are betting on retention$/m.test(await srcOf()));

  /* the OTHER direction: edit the doc, the field follows (it is unfocused, so
     syncHeadline actually runs — filling the field and reading it straight back
     would assert nothing) */
  await openRoadmapSource();
  await page.locator('.cm-content').click();
  await page.keyboard.press('ControlOrMeta+a');
  await page.keyboard.insertText('title: T\nheadline: Written in the editor\nNOW\nCore: A');
  await settle();
  check('roadmap: a headline: line typed in the editor shows up in the field',
    await page.locator('#headline').inputValue() === 'Written in the editor');

  const deckSvg = await page.evaluate(async () => {
    const {parse} = await import('/roadmap/parse.js');
    const {renderDeck} = await import('/roadmap/render-deck.js');
    const {measure, themeColors} = await import('/assets/app-common.js');
    const ctx = {colors: themeColors(), measure, today: '2026-07-14'};
    /* the exact state the old auto-verdict fired on: over-WIP AND flagged */
    const loaded = 'wip: 2\nNOW\nCore: Alpha [risk]\nCore: Beta\nCore: Gamma';
    return {
      withHeadline: renderDeck(parse('headline: We are betting on retention\n' + loaded), ctx),
      without: renderDeck(parse(loaded), ctx),
    };
  });
  check('roadmap: the deck prints the authored headline',
    deckSvg.withHeadline.includes('We are betting on retention'));
  check('roadmap: with no headline the deck synthesises NOTHING in its place',
    !/carries|list, not a strategy|Nothing on the board/.test(deckSvg.without));

  // Clearing the doc disables exports but leaves the above-artifact composition
  // choice available for the roadmap the person is about to start.
  await openRoadmapSource();
  await page.locator('.cm-content').click();
  await page.keyboard.press('ControlOrMeta+a');
  await page.keyboard.press('Backspace');
  await page.waitForTimeout(400);
  check('roadmap: exports disable but the composition bar stays available on an empty doc',
    await page.locator('#dlsvg').isDisabled() && await page.locator('#stylepicker [data-style="board"]').isEnabled());

  check('roadmap: no console errors', errors.length === 0);
  await page.close();
}

/* ---------- compressed-hash formats in a real browser (2026-08-02) ----------
   Both wire formats restore state end-to-end: a legacy plain-btoa link (every
   URL shared before the z: format) and a freshly-encoded z: link. */
{
  const legacy = Buffer.from(JSON.stringify({d: 9, s: 5, t: 6, w: 4})).toString('base64');
  const {page, errors} = await freshPage('/flow/#' + legacy);
  check('flow: a LEGACY plain-base64 link still restores its state',
    await page.locator('#demand').inputValue() === '9');
  const zUrl = await page.evaluate(async () => {
    const {encodeHash} = await import('/assets/series.js');
    return '/flow/#' + await encodeHash({d: 7, s: 5, t: 6, w: 4});
  });
  check('flow: encodeHash emits the z: format', zUrl.startsWith('/flow/#z:'));
  check('flow: no console errors on the legacy boot', errors.length === 0);
  await page.close();
  const {page: page2, errors: errors2} = await freshPage(zUrl);
  check('flow: a compressed z: link restores its state',
    await page2.locator('#demand').inputValue() === '7');
  check('flow: no console errors on the z: boot', errors2.length === 0);
  await page2.close();
}

/* ---- "Start your own": every DSL tool's on-ramp chip ----
   Each tool autoloads an example, so the starter is the only way to reach a frame
   that is yours. Clicking it must replace the example, render, and warn about
   nothing — dev/starter.test.mjs proves the text parses clean, this proves the
   chip is actually wired and reaches the screen. */
for(const [tool, marker] of [['/roadmap/', 'Your roadmap'], ['/timeline/', 'Your programme'],
    ['/wardley/', 'Your landscape'], ['/map/', 'Your assumptions'], ['/why/', 'Your outcome'],
    ['/tree/', 'Your decision'], ['/bets/', 'Your bets'], ['/paths/', 'Your plan'],
    ['/proxy/', 'Your hunt'], ['/gauge/', 'Your session'], ['/case/', 'Your case'],
    ['/energy/cycles/', 'Your cycle budget'], ['/energy/risk/', 'Your route to market']]){
  const {page, errors} = await freshPage(tool);
  await page.waitForTimeout(500);
  /* half these tools open with the source rail collapsed (the chips live in it) */
  if(!await page.locator('#chips').isVisible()) await page.locator('#railtab').click();
  await page.waitForTimeout(300);
  const chip = page.getByRole('button', {name: 'Start your own'});
  check(tool + ' start: the chip is present and opens the row', await chip.count() === 1);
  await chip.click();
  /* energy's engines settle off-thread — poll rather than guess a sleep */
  await page.waitForFunction(m => (document.querySelector('#preview svg')?.textContent || '').includes(m),
    marker, {timeout: 12000}).catch(() => {});
  const svg = await page.locator('#preview svg').innerHTML().catch(() => '');
  check(tool + ' start: the starter renders', svg.includes(marker));
  check(tool + ' start: the starter raises no warnings',
    (await page.locator('#warns li').count()) === 0);
  check(tool + ' start: no console errors', errors.length === 0);
  await page.close();
}

/* rank's grid is a table, not an SVG, and its chip row is hand-rolled — same
   on-ramp, checked in its own shape. */
{
  const {page, errors} = await freshPage('/rank/');
  await page.waitForTimeout(500);
  const chip = page.getByRole('button', {name: 'Start your own'});
  check('/rank/ start: the chip is present and opens the row', await chip.count() === 1);
  await chip.click();
  await page.waitForTimeout(600);
  const rows = await page.locator('#rows').innerHTML();
  check('/rank/ start: the starter grid replaces the example',
    rows.includes('Your first initiative') && !rows.includes('Resume position'));
  check('/rank/ start: no console errors', errors.length === 0);
  await page.close();
}

console.log(results.join('\n'));
await browser.close();
report('smoke', {...tally(results), min: 461});   // ~90% of 512 measured 2026-08-18 (478 after the Batch C trim; +34 when the review restored the artefact-decode probe to both themes)
