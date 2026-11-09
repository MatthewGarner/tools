/* First-screen gate (artefact-first shell spec, section 6). For every page in
   dev/shell-manifest.mjs, at phone and laptop size, it measures where <main> and
   the working surface (the manifest anchor) start, and holds them to the budgets.
   Run from dev/pw with both servers up, or set BASE / EBASE like the sibling
   suites. The measured table prints on every run.

   Red before green. Phase 0 lands this gate while every page is over its header
   budget, so every page is listed in EXPECTED_HEADER_FAILURES below. An expected
   failure that fails is a pass; one that PASSES the budget fails the suite, so
   the list cannot go stale. Each later phase deletes the entries it fixes.

   Checks per page and viewport:
     header       <main> top is within HEADER_BUDGET, or the page is a listed
                  expected failure
     anchor real  the anchor selector matches a visible element of at least
                  100x40 px (a wrong selector fails instead of passing vacuously)
     anchor       anchor top is within ANCHOR_BUDGET   (only when anchorBudget)
     stamped      exactly the manifest's controls are visible in the header, and
                  none were added after DOMContentLoaded                 (shell)
     no shift     header bottom at DOMContentLoaded equals header bottom once the
                  page has settled (at least network idle + 900ms), within 1px (shell)
   The last two apply only to entries with shell:true, which no real page has
   yet, so they are exercised here only by the synthetic fixtures at the end of
   this file. */
import {chromium} from 'playwright';
import {TOOL_DIRS, ENERGY_TOOL_DIRS} from '../tool-dirs.mjs';
import {SHELL_MANIFEST, HEADER_BUDGET, ANCHOR_BUDGET, HEADER_CONTROLS_MAX, ANCHOR_MIN_SIZE, VIEWPORTS} from '../shell-manifest.mjs';
import {scopeFor} from './_scope.mjs';
import {until} from './_harness.mjs';
const scope = scopeFor('first-screen.mjs');

const T = process.env.BASE || 'http://localhost:8087';
const E = process.env.EBASE || 'http://localhost:8089';

/* Every page is over its header budget on 2026-11-09 (phone main 346-699,
   laptop 201-448 against 215 / 180). Delete a page's entry in the phase that
   brings it under budget; the gate then holds it there. */
const BOTH = ['phone', 'laptop'];
const EXPECTED_HEADER_FAILURES = {
  fermi: BOTH, rank: BOTH, roadmap: BOTH, why: BOTH, tree: BOTH, map: BOTH, gauge: BOTH,
  flow: BOTH, timeline: BOTH, wardley: BOTH, alarm: BOTH, duel: BOTH, premortem: BOTH,
  bets: BOTH, 'signal-vs-noise': BOTH, case: BOTH, paths: BOTH, proxy: BOTH,
  cycles: BOTH, risk: BOTH, frequency: BOTH, 'merit-order': BOTH, intraday: BOTH,
};

/* Cycles takes ~5s unloaded to finish its first run; the gate runs beside other suites. */
const SETTLE_MS = 25000;
const ANCHOR_GRACE_MS = 5000;

const PAGES = [
  ...TOOL_DIRS.map(dir => [dir, T + '/' + dir + '/']),
  ...ENERGY_TOOL_DIRS.map(dir => [dir, E + '/' + dir + '/']),
];

let pass = 0, fail = 0;
const ok = (c, m) => { scope.checked(); if(c){ pass++; console.log('PASS', m); } else { fail++; console.log('FAIL', m); } };

/* Runs inside the page. Installed before any page script so DOMContentLoaded can
   be sampled, and reused for every later sample so all of them measure alike. */
function installProbe(){
  const visible = el => {
    const r = el.getBoundingClientRect(), s = getComputedStyle(el);
    return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none';
  };
  const label = el => (el.getAttribute('aria-label') || el.textContent || '').replace(/[▾▸▼▶+]/g, '').replace(/\s+/g, ' ').trim();
  window.__shellProbe = (anchor) => {
    const top = el => Math.round(el.getBoundingClientRect().top + scrollY);
    const header = document.querySelector('[data-tool-header]');
    let main = document.querySelector('main'), mainIsFallback = false;
    /* signal-vs-noise has no <main> today: use the first element after the header,
       which is where <main> would start, and say so in the table */
    if(!main && header){ main = header.nextElementSibling; mainIsFallback = true; }
    const target = anchor ? document.querySelector(anchor) : null;
    const box = target ? target.getBoundingClientRect() : null;
    const controls = header
      ? [...header.querySelectorAll('button, summary, a[href], input, select, textarea, [role="button"]')]
          .filter(visible).map(label).sort()
      : [];
    return {
      mainTop: main ? top(main) : null, mainIsFallback,
      headerBottom: header ? Math.round((header.getBoundingClientRect().bottom + scrollY) * 10) / 10 : null,
      anchorFound: !!target, anchorVisible: !!target && visible(target),
      anchorTop: target ? top(target) : null, anchorW: box ? Math.round(box.width) : 0, anchorH: box ? Math.round(box.height) : 0,
      controls,
      /* a worker or async render still owns the layout: Cycles marks its stage
         aria-busy / .recomputing for ~5s and its anchor then moves 90px, so a
         page that merely stopped moving for half a second is not yet settled */
      busy: !!document.querySelector('[aria-busy="true"], .recomputing, .reading-pending'),
    };
  };
  document.addEventListener('DOMContentLoaded', () => { window.__shellAtDcl = window.__shellProbe(null); });
}

const realAnchor = m => m.anchorVisible && m.anchorW >= ANCHOR_MIN_SIZE.width && m.anchorH >= ANCHOR_MIN_SIZE.height;
const sameLayout = (a, b) => a.mainTop === b.mainTop && a.anchorTop === b.anchorTop && a.anchorW === b.anchorW && a.anchorH === b.anchorH;

/* Load, then wait for the state the assertions need: nothing is still computing
   and the page has stopped moving, with the anchor given time to become real. The
   poll is bounded; a page that never gets there is measured as it stands and
   fails its own "settled" check. */
async function measure(context, url, anchor, {idleWait = 0} = {}){
  const page = await context.newPage();
  await page.addInitScript(installProbe);
  await page.goto(url, {waitUntil: 'networkidle'});
  await page.evaluate(() => document.fonts.ready);
  /* spec 6.4 compares header bottom at network idle + 900ms. Only stamped pages are
     held to it; every other page is measured as soon as it is settled. */
  if(idleWait) await page.waitForTimeout(idleWait);
  const read = () => page.evaluate(a => window.__shellProbe(a), anchor);
  let previous = null, steady = 0;
  const began = Date.now();
  /* "Stable and idle" is the settle condition. The anchor gets a bounded grace to
     become real on top of it (a preview fills asynchronously); past the grace a
     missing or hidden anchor is measured as it is, so a wrong selector fails in
     seconds, with its own message, instead of waiting out the whole poll. */
  const settled = await until(async () => {
    const now = await read();
    steady = previous && sameLayout(previous, now) ? steady + 1 : 0;
    previous = now;
    const idle = steady >= 4 && !now.busy;   // 4 equal reads, 100ms apart
    return idle && (realAnchor(now) || Date.now() - began > ANCHOR_GRACE_MS) ? now : null;
  }, {timeout: SETTLE_MS, step: 100});
  const final = settled || await read();
  const atDcl = await page.evaluate(() => window.__shellAtDcl);
  await page.close();
  return {...final, atDcl, settled: !!settled};
}

/* The header-side expectations the manifest implies (spec section 3): File when
   the page grants any of New / Examples / Templates, Share when it grants Share. */
const expectedControls = entry => [
  ...(entry.new || entry.examples || entry.templates ? ['File'] : []),
  ...(entry.share ? ['Share'] : []),
].sort();

/* Checks 6.3 and 6.4, as pure functions of two samples so the fixtures can prove
   them. Return a list of problems; empty means pass. */
function stampedProblems(entry, atDcl, settled){
  const want = expectedControls(entry), problems = [];
  if(settled.controls.length > HEADER_CONTROLS_MAX) problems.push(`${settled.controls.length} controls visible, budget ${HEADER_CONTROLS_MAX}`);
  if(JSON.stringify(settled.controls) !== JSON.stringify(want)) problems.push(`visible [${settled.controls}] but the manifest stamps [${want}]`);
  if(!atDcl || JSON.stringify(atDcl.controls) !== JSON.stringify(settled.controls))
    problems.push(`controls at DOMContentLoaded [${atDcl?.controls}] differ from settled [${settled.controls}]: added after load`);
  return problems;
}
function shiftProblems(atDcl, settled){
  if(!atDcl || atDcl.headerBottom === null || settled.headerBottom === null) return ['no header to measure'];
  const moved = Math.abs(settled.headerBottom - atDcl.headerBottom);
  return moved > 1 ? [`header bottom moved ${moved}px after DOMContentLoaded (${atDcl.headerBottom} -> ${settled.headerBottom})`] : [];
}

const browser = await chromium.launch();
const contexts = {};
for(const [name, size] of Object.entries(VIEWPORTS))
  contexts[name] = await browser.newContext({viewport: size, deviceScaleFactor: 1, reducedMotion: 'reduce', colorScheme: 'dark', serviceWorkers: 'block'});

/* ---- the real pages ---- */
const table = [];
/* Two pages at a time (four browser pages): enough to halve the wall clock
   without adding the memory pressure that makes --jobs 4 unsafe on this machine. */
const CONCURRENCY = 2;
const measured = new Map();
const wanted = PAGES.filter(([dir]) => scope.wants(dir));
for(let i = 0; i < wanted.length; i += CONCURRENCY)
  await Promise.all(wanted.slice(i, i + CONCURRENCY).map(async ([dir, url]) => {
    const entry = SHELL_MANIFEST[dir];
    if(!entry) return;
    measured.set(dir, await Promise.all(Object.keys(VIEWPORTS).map(v => measure(contexts[v], url, entry.anchor, {idleWait: entry.shell ? 900 : 0}))));
  }));
for(const [dir] of PAGES){
  if(!scope.wants(dir)) continue;
  const entry = SHELL_MANIFEST[dir];
  if(!entry){ ok(false, `${dir}: has no entry in dev/shell-manifest.mjs`); continue; }
  const [phone, laptop] = measured.get(dir);
  const row = {dir, phone, laptop};
  table.push(row);
  for(const [vp, m] of [['phone', phone], ['laptop', laptop]]){
    const where = `${dir} @${vp}`;
    const expectedFail = (EXPECTED_HEADER_FAILURES[dir] || []).includes(vp);
    const over = m.mainTop === null || m.mainTop > HEADER_BUDGET[vp];
    const value = m.mainTop === null ? 'no <main>' : m.mainTop + 'px';
    if(expectedFail)
      ok(over, over ? `${where}: header budget — expected failure, <main> top ${value} > ${HEADER_BUDGET[vp]}`
                    : `${where}: header budget — UNEXPECTED PASS, <main> top ${value} <= ${HEADER_BUDGET[vp]} but the page is still listed in EXPECTED_HEADER_FAILURES; delete its entry`);
    else
      ok(!over, `${where}: header budget — <main> top ${value}${over ? ' > ' + HEADER_BUDGET[vp] : ' <= ' + HEADER_BUDGET[vp]}`);

    ok(m.settled, `${where}: settled — layout stable and nothing still computing`);
    ok(realAnchor(m), m.anchorFound
      ? `${where}: anchor ${entry.anchor} is a real surface — ${m.anchorVisible ? 'visible' : 'HIDDEN'}, ${m.anchorW}x${m.anchorH}px (needs ${ANCHOR_MIN_SIZE.width}x${ANCHOR_MIN_SIZE.height})`
      : `${where}: anchor ${entry.anchor} matches nothing`);

    if(entry.anchorBudget)
      ok(m.anchorTop !== null && m.anchorTop <= ANCHOR_BUDGET[vp], `${where}: anchor budget — ${entry.anchor} top ${m.anchorTop}px vs ${ANCHOR_BUDGET[vp]}`);
    if(entry.shell){
      const stamped = stampedProblems(entry, m.atDcl, m);
      ok(!stamped.length, `${where}: stamped controls${stamped.length ? ' — ' + stamped.join('; ') : ''}`);
      const shift = shiftProblems(m.atDcl, m);
      ok(!shift.length, `${where}: no header shift${shift.length ? ' — ' + shift.join('; ') : ''}`);
    }
  }
}

/* ---- the measured table, every run ---- */
const cell = (m, key) => m[key] === null ? '-' : String(Math.round(m[key]));
const pad = (s, n) => String(s).padEnd(n);
if(table.length){
  console.log('\nFirst screen (CSS px from the top of the document; main budget phone ' + HEADER_BUDGET.phone + ' / laptop ' + HEADER_BUDGET.laptop + ')');
  console.log(pad('page', 17) + pad('phone main', 12) + pad('anchor', 8) + pad('size', 10) + pad('| laptop main', 14) + pad('anchor', 8) + pad('size', 10) + 'anchor selector');
  for(const {dir, phone, laptop} of table){
    const size = m => m.anchorW + 'x' + m.anchorH;
    console.log(pad(dir, 17) + pad(cell(phone, 'mainTop') + (phone.mainIsFallback ? '*' : ''), 12) + pad(cell(phone, 'anchorTop'), 8) + pad(size(phone), 10) +
      pad('| ' + cell(laptop, 'mainTop') + (laptop.mainIsFallback ? '*' : ''), 14) + pad(cell(laptop, 'anchorTop'), 8) + pad(size(laptop), 10) + SHELL_MANIFEST[dir].anchor);
  }
  if(table.some(r => r.phone.mainIsFallback || r.laptop.mainIsFallback)) console.log('* no <main> on this page; measured the element after the header, where <main> would start');
  console.log('');
}

/* ---- fixtures: prove the shell-only checks, which no real page can yet ----
   The fixtures stand in for a stamped page. Served through route interception so
   no file is added to any deployed folder. The two failing fixtures must each
   trip exactly the check they were built to trip, and the good one must trip none. */
if(!scope.focused){
  scope.unscoped();
  const GOOD = '<!doctype html><meta charset=utf-8><body style="margin:0"><header data-tool-header style="height:96px"><button>File</button><button>Share</button></header><main style="display:block;height:300px">m</main>';
  const FIXTURES = {
    good: GOOD,
    lateButton: GOOD + '<script>setTimeout(()=>{const b=document.createElement("button");b.textContent="Save a copy";document.querySelector("header").append(b)},400)</script>',
    shifting: GOOD + '<script>setTimeout(()=>{document.querySelector("header").style.height="170px"},400)</script>',
  };
  const entry = {new: true, examples: true, templates: false, share: true};
  const results = {};
  for(const [name, html] of Object.entries(FIXTURES)){
    const context = await browser.newContext({viewport: VIEWPORTS.phone, serviceWorkers: 'block'});
    await context.route('http://fixture.test/**', route => route.fulfill({contentType: 'text/html', body: html}));
    const m = await measure(context, 'http://fixture.test/' + name, 'main', {idleWait: 900});
    results[name] = {stamped: stampedProblems(entry, m.atDcl, m), shift: shiftProblems(m.atDcl, m)};
    await context.close();
  }
  ok(!results.good.stamped.length && !results.good.shift.length, 'fixture: a static stamped header passes both shell checks');
  ok(results.lateButton.stamped.some(p => /added after load/.test(p)), 'fixture: a control injected after load fails the stamped-controls check');
  ok(results.shifting.shift.length === 1, 'fixture: a header that grows after DOMContentLoaded fails the no-shift check');
  ok(!results.lateButton.shift.length && !results.shifting.stamped.length, 'fixture: each bad fixture trips only its own check');
}

await browser.close();
/* Floor: settled, header and anchor-real, at two sizes, per page; plus the fixtures. */
scope.report('first-screen', {pass, fail, min: PAGES.length * 6 + 4});
