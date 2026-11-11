/* First-screen gate (artefact-first shell spec, section 6). For every page in
   dev/shell-manifest.mjs, at phone and laptop size, it measures where <main> and
   the working surface (the manifest anchor) start, and holds them to the budgets.
   Run from dev/pw with both servers up, or set BASE / EBASE like the sibling
   suites. The measured table prints on every run.

   Every page is stamped now, so every page is held to its budget with no exceptions:
   Product pages 215 / 180, Energy pages 259 / 224 (the Product budget plus the 44px E1-E5 row).

   Checks per page and viewport:
     header       <main> top is within the page's budget (Product or Energy)
     anchor real  the anchor selector matches a visible element of at least
                  100x40 px (a wrong selector fails instead of passing vacuously)
     anchor       anchor top is within ANCHOR_BUDGET   (only when anchorBudget)
     stamped      exactly the manifest's controls are visible in the header, all of
                  them inside the stamped shell region, and the header holds
                  exactly the controls its served HTML stamped: nothing added
                  or removed by script, before or after load           (shell)
     title        the h1 text equals the manifest name                  (shell)
     ready        the shell wired itself: data-shell-ready is set       (shell)
     no shift     header bottom at DOMContentLoaded equals header bottom once the
                  page has settled (at least network idle + 900ms), within 1px (shell)
     one verb     no .model-link, .recent-save, #copylink or "Save on this device"
                  control anywhere on the page: Share and Save a copy live in File
                  (shell)
     no cut-off   the h1 is not truncated at 375px                      (shell)
     layout       at 320x568, 390x844, 1280x900, 1440x900 and 1920x1080, light and
                  dark: the header is exactly 96px (Energy: 120px) and <main> starts
                  at its bottom edge (shell). The budgets stay measured at the two
                  reference sizes: the pinned masthead grows with viewport height.
     strip        Energy only: the E1-E5 strip is the header's first row, 44px, one
                  line, five 44px links, one aria-current naming this page and on
                  screen at 375 and 320, no page overflow or scroll, an edge fade when
                  it scrolls, visible keyboard focus, and the kicker stays hidden
   The last seven apply only to entries with shell:true; the synthetic fixtures at
   the end of this file prove each of them can fail. */
import {chromium} from 'playwright';
import {TOOL_DIRS, ENERGY_TOOL_DIRS, BINDERS as BINDER_DIRS} from '../tool-dirs.mjs';
import {SHELL_MANIFEST, HEADER_BUDGET, HEADER_BUDGET_ENERGY, STRIP_HEIGHT, headerBudget, headerHeight, isEnergy, ANCHOR_BUDGET, HEADER_CONTROLS_MAX, ANCHOR_MIN_SIZE, VIEWPORTS} from '../shell-manifest.mjs';
import {scopeFor} from './_scope.mjs';
import {until} from './_harness.mjs';
const scope = scopeFor('first-screen.mjs');

const T = process.env.BASE || 'http://localhost:8087';
const E = process.env.EBASE || 'http://localhost:8089';

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
    /* checkVisibility sees through a closed <details>: its content has layout boxes but is skipped */
    return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none' && (!el.checkVisibility || el.checkVisibility({visibilityProperty: true}));
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
    /* Header controls are buttons, summaries and inputs; navigation links (the
       kicker, Energy's E1-E5 strip) are not. Those visible at rest are what the
       gate counts; every one must sit inside the stamped region. */
    const kids = header ? [...header.childNodes] : [];
    const at = text => kids.findIndex(n => n.nodeType === 8 && n.data.trim() === text);
    const [from, to] = [at('shell:start'), at('shell:end')];
    const regionFound = from >= 0 && to > from;
    const inRegion = el => regionFound && kids.slice(from + 1, to).some(n => n.contains(el));
    const all = header ? [...header.querySelectorAll('button, summary, input, select, textarea, [role="button"]')] : [];
    const shown = all.filter(visible);
    const controls = shown.map(label).sort();
    return {
      mainTop: main ? top(main) : null, mainIsFallback,
      headerBottom: header ? Math.round((header.getBoundingClientRect().bottom + scrollY) * 10) / 10 : null,
      anchorFound: !!target, anchorVisible: !!target && visible(target),
      anchorTop: target ? top(target) : null, anchorW: box ? Math.round(box.width) : 0, anchorH: box ? Math.round(box.height) : 0,
      controls, regionFound, controlTags: all.length,
      strays: shown.filter(el => !inRegion(el)).map(label).sort(),
      title: header?.querySelector('h1')?.textContent.trim() ?? null,
      kickerOver: (() => { const k = header?.querySelector('.kicker'); return k ? k.scrollWidth - k.clientWidth : 0; })(),
      kickerText: header?.querySelector('.kicker')?.textContent ?? null,
      h1Over: (() => { const h = header?.querySelector('h1'); return h ? h.scrollWidth - h.clientWidth : 0; })(),
      ownLinks: document.querySelectorAll('#copylink').length,
      strayActions: [...document.querySelectorAll('.model-link, .recent-save, #copylink, button')].filter(el => el.matches('.model-link, .recent-save, #copylink') || /save on this device/i.test(el.textContent)).length,
      shellReady: !!header && header.hasAttribute('data-shell-ready'),
      /* a worker or async render still owns the layout: Cycles marks its stage
         aria-busy / .recomputing for ~5s and its anchor then moves 90px, so a
         page that merely stopped moving for half a second is not yet settled */
      busy: !!document.querySelector('[aria-busy="true"], .recomputing, .reading-pending'),
    };
  };
  document.addEventListener('DOMContentLoaded', () => { window.__shellAtDcl = window.__shellProbe(null); });
}

/* Energy's E1-E5 strip, measured in the page and judged as a pure function so fixtures can prove it fails. */
const probeStrip = () => {
  const header = document.querySelector('[data-tool-header]'), strip = header?.querySelector(':scope > .series');
  if(!strip) return null;
  const r = e => e.getBoundingClientRect(), s = r(strip), k = header.querySelector('.kicker');
  return {
    first: header.firstElementChild === strip, stripH: Math.round(s.height), stripLeft: Math.round(s.left), stripRight: Math.round(s.right),
    links: [...strip.querySelectorAll('a')].map(a => ({href: a.getAttribute('href'), label: a.getAttribute('aria-label') || '', top: Math.round(r(a).top), h: Math.round(r(a).height), left: Math.round(r(a).left), right: Math.round(r(a).right), current: a.getAttribute('aria-current') === 'page'})),
    overflow: strip.scrollWidth > strip.clientWidth + 1, fade: strip.dataset.fade || '', vw: document.documentElement.clientWidth,
    pageW: document.documentElement.scrollWidth, scrollY: window.scrollY, kickerDisplay: k ? getComputedStyle(k).display : 'none',
  };
};
function stripProblems(dir, m){
  if(!m) return ['the header has no E1-E5 strip'];
  const problems = [], current = m.links.filter(l => l.current);
  if(!m.first) problems.push('the strip is not the header\'s first row');
  if(m.stripH !== STRIP_HEIGHT) problems.push(`the strip is ${m.stripH}px tall, not ${STRIP_HEIGHT}`);
  if(m.links.length !== 6) problems.push(`${m.links.length} links, not 6 (All energy tools, then E1-E5)`);
  else if(m.links[0].href !== '../' || m.links[0].label !== 'All energy tools') problems.push('the first strip item is not the All energy tools link');
  if(new Set(m.links.map(l => l.top)).size > 1) problems.push('the strip wraps onto more than one line');
  const short = m.links.filter(l => l.h < 44);
  if(short.length) problems.push(`${short.length} link(s) shorter than 44px`);
  if(current.length !== 1) problems.push(`${current.length} items marked aria-current, not 1`);
  else{
    const c = current[0];
    if(dir && !c.href.includes('/' + dir + '/')) problems.push(`aria-current marks ${c.href}, not ${dir}`);
    if(c.left < Math.max(0, m.stripLeft) - 1 || c.right > Math.min(m.vw, m.stripRight) + 1) problems.push(`the current item is off screen (${c.left}-${c.right}px of ${m.stripLeft}-${Math.min(m.vw, m.stripRight)})`);
  }
  if(m.pageW > m.vw) problems.push(`the page overflows sideways (${m.pageW}px in ${m.vw}px)`);
  if(m.scrollY !== 0) problems.push(`the page scrolled to ${m.scrollY}px`);
  if(m.overflow && !m.fade) problems.push('the strip scrolls but shows no edge fade');
  if(m.kickerDisplay !== 'none') problems.push('the kicker is shown on an Energy page');
  if(m.focus === undefined) problems.push('no keyboard focus reached the strip');
  else if(m.focus && !(m.focus.style !== 'none' && m.focus.width >= 2 && m.focus.offset <= 0)) problems.push('keyboard focus on a strip link is not visibly outlined inside the strip');
  return problems;
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
  const response = await page.goto(url, {waitUntil: 'networkidle'});
  /* what the server stamped: every control element in the served header */
  const served = (await response.text()).match(/<header data-tool-header[\s\S]*?<\/header>/)?.[0] ?? '';
  const servedControls = (served.match(/<(?:button|summary|input|select|textarea)\b/g) || []).length;
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
  const strip = await page.evaluate(probeStrip);
  if(strip){
    /* keyboard focus: Tab from the top until a strip link has it, then read its outline */
    strip.focus = undefined;
    for(let i = 0; i < 20 && strip.focus === undefined; i++){
      await page.keyboard.press('Tab');
      const f = await page.evaluate(() => { const a = document.activeElement; if(!a?.closest('.series')) return undefined; const c = getComputedStyle(a); return {style: c.outlineStyle, width: parseFloat(c.outlineWidth), offset: parseFloat(c.outlineOffset)}; });
      if(f) strip.focus = f;
    }
  }
  await page.close();
  return {...final, atDcl, servedControls, settled: !!settled, strip};
}

/* The header-side expectations the manifest implies: every page gets File (it
   always holds Your work and Save a copy), and Share when the manifest grants it. */
const expectedControls = entry => ['File', ...(entry.share ? ['Share'] : [])].sort();

/* Checks 6.3 and 6.4, as pure functions of two samples so the fixtures can prove
   them. Return a list of problems; empty means pass. */
function stampedProblems(entry, atDcl, settled){
  const want = expectedControls(entry), problems = [];
  if(settled.controls.length > HEADER_CONTROLS_MAX) problems.push(`${settled.controls.length} controls visible, budget ${HEADER_CONTROLS_MAX}`);
  if(JSON.stringify(settled.controls) !== JSON.stringify(want)) problems.push(`visible [${settled.controls}] but the manifest stamps [${want}]`);
  if(!atDcl || JSON.stringify(atDcl.controls) !== JSON.stringify(settled.controls))
    problems.push(`controls at DOMContentLoaded [${atDcl?.controls}] differ from settled [${settled.controls}]: added after load`);
  if(!settled.regionFound) problems.push('the header has no shell:start / shell:end markers');
  if(settled.strays.length) problems.push(`visible controls outside the stamped region: [${settled.strays}]`);
  if(settled.controlTags !== settled.servedControls)
    problems.push(`the header holds ${settled.controlTags} control elements but its served HTML stamped ${settled.servedControls}: script added or removed header controls`);
  return problems;
}
const titleProblems = (entry, m) => m.title === entry.name ? [] : [`h1 reads ${JSON.stringify(m.title)} but the manifest name is ${JSON.stringify(entry.name)}`];
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
    const budget = headerBudget(dir)[vp];
    const over = m.mainTop === null || m.mainTop > budget;
    const value = m.mainTop === null ? 'no <main>' : m.mainTop + 'px';
    ok(!over, `${where}: header budget — <main> top ${value}${over ? ' > ' + budget : ' <= ' + budget}`);

    ok(m.settled, `${where}: settled — layout stable and nothing still computing`);
    ok(realAnchor(m), m.anchorFound
      ? `${where}: anchor ${entry.anchor} is a real surface — ${m.anchorVisible ? 'visible' : 'HIDDEN'}, ${m.anchorW}x${m.anchorH}px (needs ${ANCHOR_MIN_SIZE.width}x${ANCHOR_MIN_SIZE.height})`
      : `${where}: anchor ${entry.anchor} matches nothing`);

    if(entry.anchorBudget)
      ok(m.anchorTop !== null && m.anchorTop <= ANCHOR_BUDGET[vp], `${where}: anchor budget — ${entry.anchor} top ${m.anchorTop}px vs ${ANCHOR_BUDGET[vp]}`);
    if(entry.shell){
      const stamped = stampedProblems(entry, m.atDcl, m);
      ok(!stamped.length, `${where}: stamped controls${stamped.length ? ' — ' + stamped.join('; ') : ''}`);
      const stray = m.strayActions - (entry.ownLink ? m.ownLinks : 0);
      ok(stray === 0, `${where}: one verb each — ${stray ? stray + ' stray model-link, recent-save, #copylink or "Save on this device" control(s) on the page' : 'no stray share or save controls outside File and Share'}`);
      if(vp === 'phone') ok(m.kickerOver <= 0, `${where}: the whole kicker fits on one line${m.kickerOver > 0 ? ' — ' + m.kickerOver + 'px wider than its box (' + m.kickerText + ')' : ''}`);
      if(vp === 'phone') ok((BINDER_DIRS.includes(dir) ? /^Binder — \S/ : isEnergy(dir) ? /^Instrument E\d — \S/ : /^Instrument \d\d — \S/).test(m.kickerText ?? ''), `${where}: the kicker still reads "${BINDER_DIRS.includes(dir) ? 'Binder' : isEnergy(dir) ? 'Instrument EN' : 'Instrument NN'} — …" to assistive tech (${JSON.stringify((m.kickerText ?? '').slice(0, 28))})`);
      if(vp === 'phone') ok(m.h1Over <= 0, `${where}: the h1 is not cut off${m.h1Over > 0 ? ' — ' + m.h1Over + 'px wider than its box' : ''}`);
      const title = titleProblems(entry, m);
      ok(!title.length, `${where}: title${title.length ? ' — ' + title.join('; ') : ' — h1 is ' + JSON.stringify(entry.name)}`);
      ok(m.shellReady, `${where}: shell ready — ${m.shellReady ? 'data-shell-ready is set' : 'data-shell-ready is missing: some stamped control was never wired'}`);
      const shift = shiftProblems(m.atDcl, m);
      ok(!shift.length, `${where}: no header shift${shift.length ? ' — ' + shift.join('; ') : ''}`);
      if(isEnergy(dir)){
        const strip = stripProblems(dir, m.strip);
        ok(!strip.length, `${where}: E1-E5 strip${strip.length ? ' — ' + strip.join('; ') : ' — one 44px row, current item on screen'}`);
      }
    }
  }
}


/* ---- the header is exactly 96px and <main> starts at its bottom edge, at five sizes in both schemes ---- */
const LAYOUT_SIZES = [[320, 568], [390, 844], [1280, 900], [1440, 900], [1920, 1080]];
const probeLayout = () => {
  const header = document.querySelector('[data-tool-header]'), main = document.querySelector('main');
  if(!header || !main) return {header: header ? Math.round(header.getBoundingClientRect().height * 10) / 10 : null, gap: null, missing: !header ? 'header' : '<main>'};
  const h = header.getBoundingClientRect(), m = main.getBoundingClientRect();
  return {header: Math.round(h.height * 10) / 10, gap: Math.round((m.top - h.bottom) * 10) / 10};
};
const layoutProblems = (m, height = 96) => m.missing ? [`the page has no ${m.missing}`] : [
  ...(m.header === height ? [] : [`header is ${m.header}px tall, not ${height}`]),
  ...(m.gap === 0 ? [] : [`<main> starts ${m.gap}px from the header's bottom edge, not 0`]),
];
for(const [dir, url] of PAGES){
  const entry = SHELL_MANIFEST[dir];
  if(!entry?.shell || !scope.wants(dir)) continue;
  for(const scheme of ['light', 'dark']) for(const [width, height] of LAYOUT_SIZES){
    const context = await browser.newContext({viewport: {width, height}, deviceScaleFactor: 1, reducedMotion: 'reduce', colorScheme: scheme, serviceWorkers: 'block'});
    const page = await context.newPage();
    await page.goto(url, {waitUntil: 'networkidle'});
    await page.evaluate(() => document.fonts.ready);
    const problems = layoutProblems(await page.evaluate(probeLayout), headerHeight(dir));
    if(isEnergy(dir) && width === 320 && scheme === 'light'){
      await page.waitForTimeout(400);
      const narrow = stripProblems(dir, await page.evaluate(probeStrip)).filter(p => !/keyboard focus/.test(p));
      ok(!narrow.length, `${dir} @320x568: E1-E5 strip${narrow.length ? ' — ' + narrow.join('; ') : ' — one row, current item on screen, no page overflow'}`);
    }
    ok(!problems.length, `${dir} @${width}x${height} ${scheme}: header ${headerHeight(dir)}px, <main> flush below it${problems.length ? ' — ' + problems.join('; ') : ''}`);
    await context.close();
  }
}

/* ---- the measured table, every run ---- */
const cell = (m, key) => m[key] === null ? '-' : String(Math.round(m[key]));
const pad = (s, n) => String(s).padEnd(n);
if(table.length){
  console.log('\nFirst screen (CSS px from the top of the document; main budget phone ' + HEADER_BUDGET.phone + ' / laptop ' + HEADER_BUDGET.laptop + ', Energy ' + HEADER_BUDGET_ENERGY.phone + ' / ' + HEADER_BUDGET_ENERGY.laptop + ')');
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
  const GOOD = '<!doctype html><meta charset=utf-8><body style="margin:0"><header data-tool-header data-shell style="height:96px"><!-- shell:start --><h1>Fixture</h1><button>File</button><button>Share</button><!-- shell:end --></header><main style="display:block;height:300px">m</main>';
  const FIXTURES = {
    good: GOOD,
    lateButton: GOOD + '<script>setTimeout(()=>{const b=document.createElement("button");b.textContent="Save a copy";document.querySelector("header").append(b)},400)</script>',
    /* injected while the page loads, so it is already there at DOMContentLoaded */
    earlyButton: GOOD + '<script>{const b=document.createElement("button");b.textContent="Save a copy";document.querySelector("header").append(b)}</script>',
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
  ok(results.earlyButton.stamped.some(p => /outside the stamped region/.test(p)) && results.earlyButton.stamped.some(p => /script added or removed/.test(p)),
    'fixture: a control injected during load, which DOMContentLoaded cannot see, still fails against the stamped region');
  ok(results.shifting.shift.length === 1, 'fixture: a header that grows after DOMContentLoaded fails the no-shift check');
  ok(!results.lateButton.shift.length && !results.shifting.stamped.length, 'fixture: each bad fixture trips only its own check');
  /* the layout, no-cut-off and one-verb checks, each against a page built to break it */
  const LAYOUT = {
    good: '<!doctype html><meta charset=utf-8><body style="margin:0"><header data-tool-header style="height:96px"><h1 style="margin:0;font:28px/48px sans-serif">Fixture</h1></header><main style="display:block;height:300px">m</main>',
    tall: '<!doctype html><meta charset=utf-8><body style="margin:0"><header data-tool-header style="height:100px"><h1>Fixture</h1></header><main style="display:block;height:300px">m</main>',
    gap: '<!doctype html><meta charset=utf-8><body style="margin:0"><header data-tool-header style="height:96px"><h1>Fixture</h1></header><main style="display:block;height:300px;margin-top:10px">m</main>',
  };
  const layout = {};
  for(const [name, html] of Object.entries(LAYOUT)){
    const context = await browser.newContext({viewport: VIEWPORTS.phone, serviceWorkers: 'block'});
    await context.route('http://fixture.test/**', route => route.fulfill({contentType: 'text/html', body: html}));
    const page = await context.newPage();
    await page.goto('http://fixture.test/' + name);
    layout[name] = layoutProblems(await page.evaluate(probeLayout));
    await context.close();
  }
  ok(!layout.good.length, 'fixture: a 96px header with <main> flush below passes the layout check');
  ok(layout.tall.length === 1 && /100px tall/.test(layout.tall[0]), 'fixture: a header that is 100px tall fails the layout check');
  ok(layout.gap.length === 1 && /10px from/.test(layout.gap[0]), 'fixture: <main> 10px below the header fails the layout check');
  const probe = {};
  for(const [name, html] of Object.entries({
    cut: '<!doctype html><meta charset=utf-8><body style="margin:0"><header data-tool-header><h1 style="width:80px;overflow:hidden;white-space:nowrap;text-overflow:ellipsis">A very long title indeed</h1></header><main>m</main>',
    stray: '<!doctype html><meta charset=utf-8><body style="margin:0"><header data-tool-header><h1>Fixture</h1></header><main><button class="recent-save">Save a copy</button><button>＋ Save on this device</button><button id="copylink">Copy link</button></main>',
    clean: '<!doctype html><meta charset=utf-8><body style="margin:0"><header data-tool-header><h1>Fixture</h1></header><main>m</main>',
    kickerCut: '<!doctype html><meta charset=utf-8><body style="margin:0"><header data-tool-header><p class="kicker" style="width:80px;overflow:hidden;white-space:nowrap;text-overflow:ellipsis">07 — A long epithet that cannot fit</p><h1>Fixture</h1></header><main>m</main>',
  })){
    const context = await browser.newContext({viewport: VIEWPORTS.phone, serviceWorkers: 'block'});
    await context.route('http://fixture.test/**', route => route.fulfill({contentType: 'text/html', body: html}));
    const page = await context.newPage();
    await page.addInitScript(installProbe);
    await page.goto('http://fixture.test/' + name);
    probe[name] = await page.evaluate(() => window.__shellProbe(null));
    await context.close();
  }
  ok(probe.cut.h1Over > 0 && probe.clean.h1Over <= 0, 'fixture: a truncated h1 is measured as wider than its box; an untruncated one is not');
  ok(probe.kickerCut.kickerOver > 0 && probe.clean.kickerOver <= 0, 'fixture: a truncated kicker is measured as wider than its box; a missing one is not');
  /* the strip: a wrapped one and one whose current item is off screen must fail, and a good one must pass */
  const link = (n, current) => `<a href="/x/${n}/" style="flex:none;display:block;box-sizing:border-box;width:100px;height:44px"${current ? ' aria-current="page"' : ''}>E${n}</a>`;
  const stripPage = (css, current) => `<!doctype html><meta charset=utf-8><body style="margin:0"><header data-tool-header><nav class="series" style="display:flex;box-sizing:border-box;width:343px;margin:0 16px;${css}"><a href="../" aria-label="All energy tools" style="flex:none;display:block;box-sizing:border-box;width:60px;height:44px">All</a>${[1, 2, 3, 4, 5].map(n => link(n, n === current)).join('')}</nav><p class="kicker" style="display:none"></p></header><main>m</main>`;
  const strips = {};
  for(const [name, html] of Object.entries({
    good: stripPage('flex-wrap:nowrap;overflow-x:auto;height:44px', 1),
    wrapped: stripPage('flex-wrap:wrap;height:auto', 1),
    offscreen: stripPage('flex-wrap:nowrap;overflow-x:auto;height:44px', 5),
  })){
    const context = await browser.newContext({viewport: VIEWPORTS.phone, serviceWorkers: 'block'});
    await context.route('http://fixture.test/**', route => route.fulfill({contentType: 'text/html', body: html}));
    const page = await context.newPage();
    await page.goto('http://fixture.test/' + name);
    const m = await page.evaluate(probeStrip);
    m.focus = {style: 'solid', width: 2, offset: -4};
    m.fade = 'end';
    strips[name] = stripProblems(null, m);
    await context.close();
  }
  ok(!strips.good.length, 'fixture: a one-row 44px strip with its current item on screen passes the strip check (' + strips.good.join('; ') + ')');
  ok(strips.wrapped.some(p => /wraps onto more than one line/.test(p)), 'fixture: a strip that wraps fails the strip check');
  ok(strips.offscreen.some(p => /current item is off screen/.test(p)), 'fixture: a strip whose current item is off screen fails the strip check');
  ok(probe.stray.strayActions === 3 && probe.clean.strayActions === 0, 'fixture: .recent-save, "Save on this device" and #copylink are each counted as stray controls');
}

await browser.close();
/* Floor: settled, header and anchor-real, at two sizes, per page; plus the fixtures. */
scope.report('first-screen', {pass, fail, min: PAGES.length * 6 + 5 + 30});
