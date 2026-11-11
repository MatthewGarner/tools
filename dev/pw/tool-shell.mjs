/* The shared tool header (File menu, Share, Your work) on every stamped page.
   Real pointer, touch and keyboard input at phone and laptop size. Each check can
   fail: lists are compared whole against the manifest, never "contains", and every
   control is found by the name a person reads, so a missing or renamed item, an
   unwired action or a layout that shifts when the menu opens turns a line red. */
import {chromium} from 'playwright';
import {SHELL_MANIFEST, VIEWPORTS, isEnergy} from '../shell-manifest.mjs';
import {shellRegion} from '../sync-shell.mjs';
import {SOURCE_TOOLS} from '../../assets/saved-work-keys.js';
import {scopeFor} from './_scope.mjs';
import {until, trackErrors, openFileMenu, fileItem} from './_harness.mjs';
/* Two kinds of run, split so they shard: "core" drives the three pilot pages through every shared
   behaviour (dialog, focus, storage trouble, stalled state, offline, templates, popovers) once;
   "pages-N" runs the short per-page table on its group (tool-shell-pages-N.mjs sets SHELL_SUITE). */
const MODE = process.env.SHELL_SUITE || 'core';
const PILOT = ['fermi', 'roadmap', 'alarm'];
const GROUPS = {
  'pages-1': ['why', 'tree', 'map', 'wardley', 'bets'],
  'pages-2': ['paths', 'proxy', 'rank', 'duel', 'flow'],
  'pages-3': ['timeline', 'case', 'premortem', 'gauge', 'signal-vs-noise'],
  'pages-4': ['cycles', 'risk', 'frequency', 'merit-order', 'intraday'],
};
const scope = scopeFor(MODE === 'core' ? 'tool-shell.mjs' : `tool-shell-${MODE}.mjs`);
const T = process.env.BASE || 'http://localhost:8087';
const E = process.env.EBASE || 'http://localhost:8089';
/* Energy pages live on their own origin, with their own storage scope and service worker */
const originOf = dir => isEnergy(dir) ? E : T;

let pass = 0, fail = 0;
const ok = (c, m) => { scope.checked(); if(c){ pass++; console.log('PASS', m); } else { fail++; console.log('FAIL', m); } };
/* SHELL_FIXTURES_ONLY=1 (a local shortcut, never set by the runner) skips the per-page runs and drives only the synthetic-page fixtures */
const SHELLS = process.env.SHELL_FIXTURES_ONLY === '1' ? [] : (MODE === 'core' ? PILOT : GROUPS[MODE]).filter(dir => SHELL_MANIFEST[dir]?.shell);

/* What File must offer, from the manifest alone. */
const menuNames = e => [
  ...(e.new ? ['New'] : e.templates ? ['New from template…'] : []),
  ...(e.examples ? ['Examples'] : []),
  'Your work…', 'Save a copy…',
  ...(e.templates ? ['Save as template…'] : []),
  ...e.items.map(item => item.label),
  'Backup & restore',
];

/* Per page: make the model distinctly "one" or "two", and read which it is. */
const MODEL = {
  roadmap: {
    exampleFor: {1: 'Quarterly view', 2: 'Simple (no lanes)', 3: 'Reading app roadmap'},
    isBlank: async p => (await p.locator('.cm-content').textContent()).includes('title: Your roadmap'),
    async edit(p, n){ await fileItem(p, 'Examples'); await p.getByRole('button', {name: n === 1 ? 'Quarterly view' : n === 2 ? 'Simple (no lanes)' : 'Reading app roadmap', exact: true}).click(); },
    read: async p => { const t = await p.locator('.cm-content').textContent(); return t.includes('Platform Delivery Plan') ? 'one' : t.includes('Team roadmap') ? 'two' : t.includes('Lantern / Product roadmap') ? 'three' : /title: (legacy-\w+)/.exec(t)?.[1] ?? 'other'; },
  },
  fermi: {
    async edit(p, n){
      const q = p.locator('#estimatequestion');
      if(!(await q.isVisible())){
        await p.getByRole('button', {name: 'Edit formula & ranges', exact: true}).click();
        /* the page moves focus to the formula one frame after Edit; filling before that lands the text in the wrong field */
        await p.waitForFunction(() => document.activeElement?.id === 'formula');
      }
      await q.fill(n === 1 ? 'Estimate one' : n === 2 ? 'Estimate two' : 'Estimate three');
    },
    read: async p => { const v = await p.locator('#estimatequestion').inputValue(); return v === 'Estimate one' ? 'one' : v === 'Estimate two' ? 'two' : 'other'; },
  },
  alarm: {
    async edit(p, n){ await p.locator('#baseRate').fill(n === 1 ? '-1.2' : n === 2 ? '-1.5' : '-1.8'); },
    read: async p => { const v = await p.locator('#baseRate').inputValue(); return v === '-1.2' ? 'one' : v === '-1.5' ? 'two' : 'other'; },
  },
};

/* The ten Phase 2 batch 1 pages. DSL pages are driven through the editor's document (the
   CodeMirror view hangs off .cm-content), so the model is the title line: shell-one, shell-two,
   shell-three, or a seeded legacy-… copy; anything else (a starter, an example) reads "other". */
const docOf = p => p.evaluate(() => document.querySelector('.cm-content').cmTile.view.state.doc.toString());
const titleLabel = text => { const m = /^title:\s*(.*)$/m.exec(text)?.[1] ?? ''; return /^shell-/.test(m) ? m.slice(6) : /^legacy-/.test(m) ? m : 'other'; };
const dsl = {
  async edit(p, n){
    await p.evaluate(label => {
      const view = document.querySelector('.cm-content').cmTile.view, now = view.state.doc.toString();
      const next = /^title:/m.test(now) ? now.replace(/^title:.*$/m, 'title: ' + label) : 'title: ' + label + '\n' + now;
      view.dispatch({changes: {from: 0, to: now.length, insert: next}});
    }, ['', 'shell-one', 'shell-two', 'shell-three'][n]);
  },
  read: async p => titleLabel(await docOf(p)),
  isBlank: async p => /^title:\s*Your /m.test(await docOf(p)),   // every starter is titled "Your …"
};
const LABELS = {one: 1, two: 2, three: 3};
const inputModel = (selector, values) => ({
  async edit(p, n){ await p.locator(selector).first().fill(values[n]); },
  read: async p => { const v = await p.locator(selector).first().inputValue(); const i = values.indexOf(v); return i > 0 ? ['', 'one', 'two', 'three'][i] : 'other'; },
  isBlank: async p => (await p.locator(selector).first().inputValue()).startsWith('Your '),
});
/* names the File > Examples list must offer, from each page's own example data */
const EXAMPLE_NAMES = {
  why: ['Reading retention', 'Two outcomes'], tree: ['Bid or no bid', 'Build vs buy'],
  map: ['Assumption map', 'Futures matrix', 'RAG honesty', 'Risk grid', 'Skills coverage', 'Stakeholder grid'],
  wardley: ['Lantern platform', 'Online tea shop'], bets: ['Lantern portfolio', 'Quick gut check'], paths: ['Lantern'],
  proxy: ['Monitor a measure', 'Trade-off pending', 'Two theories'], rank: ['Classic product backlog', 'Lantern feature backlog', 'Ops & infra backlog'],
  roadmap: ['Reading app roadmap', 'Quarterly view', 'Simple (no lanes)'],
  timeline: ['App launch programme', 'Six-quarter programme', 'Office move'],
  cycles: ['Wexcombe base case', 'Tight warranty', 'Optimistic OEM'], risk: ['Route to market', 'Optimiser fees', 'Wind PPA floor'],
  case: ['Morrow · paid tier', 'Lantern · invitations', 'Fieldnote · search', 'Morrow · decision review'],
  gauge: ['Q3 commitment review', 'App launch readiness', 'Confidence auction', 'What does “likely” mean?'],
};
/* old stores: <tool>-saved copies and <tool>-snaps baselines are read by readNativeWork */
const legacyDsl = (key, baseline) => ({key, baseline, names: ['Legacy plan one', 'Legacy plan two'],
  items: [{name: 'Legacy plan one', src: 'title: legacy-one\n'}, {name: 'Legacy plan two', src: 'title: legacy-two\n'}]});
const LEGACY = {
  roadmap: legacyDsl('roadmap-saved', 'roadmap-snaps'), why: legacyDsl('why-saved', 'why-snaps'), tree: legacyDsl('tree-saved'),
  map: legacyDsl('map-saved', 'map-snaps'), bets: legacyDsl('bets-saved', 'bets-snaps'), paths: legacyDsl('paths-saved'), proxy: legacyDsl('proxy-saved'),
};
/* Premortem: the Frame step's first field is the effort's name; Signal vs noise: the noise slider (2, 4, 6) */
const framed = '#phasepanel input';
const noiseLevels = ['', '2', '4', '6'];
/* Energy: cycles and risk are DSL documents; the other three are driven by one range input each */
const rangeModel = (selector, values) => ({
  async edit(p, n){ await p.locator(selector).evaluate((el, v) => { el.value = v; el.dispatchEvent(new Event('input', {bubbles: true})); el.dispatchEvent(new Event('change', {bubbles: true})); }, values[n]); },
  read: async p => { const v = await p.locator(selector).inputValue(); const i = values.indexOf(v); return i > 0 ? ['', 'one', 'two', 'three'][i] : 'other'; },
});
Object.assign(MODEL, {
  cycles: dsl, risk: dsl, frequency: rangeModel('#inertia', ['', '100', '150', '200']),
  'merit-order': rangeModel('#demand', ['', '20', '30', '50']), intraday: rangeModel('#trough', ['', '20', '25', '30']),
  timeline: dsl, case: dsl, gauge: dsl,
  premortem: {
    async edit(p, n){ await p.locator(framed).first().fill(['', 'shell-one', 'shell-two', 'shell-three'][n]); },
    read: async p => { const v = await p.locator(framed).first().inputValue(); return v === 'shell-one' ? 'one' : v === 'shell-two' ? 'two' : /^legacy-/.test(v) ? v : 'other'; },
    isBlank: async p => (await p.locator(framed).first().inputValue()) === '',
  },
  'signal-vs-noise': {
    async edit(p, n){ await p.locator('#noise').evaluate((el, v) => { el.value = v; el.dispatchEvent(new Event('input', {bubbles: true})); el.dispatchEvent(new Event('change', {bubbles: true})); }, noiseLevels[n]); },
    read: async p => { const v = await p.locator('#noise').inputValue(); return v === '2' ? 'one' : v === '4' ? 'two' : 'other'; },
  },
});
Object.assign(MODEL, {why: dsl, tree: dsl, map: dsl, wardley: dsl, bets: dsl, paths: dsl, proxy: dsl,
  rank: inputModel('#rows input.iname', ['', 'shell-one', 'shell-two', 'shell-three']),
  duel: inputModel('#question', ['', 'shell-one', 'shell-two', 'shell-three']),
  flow: inputModel('#demand', ['', '3.5', '6', '8']),
});

const ready = p => p.locator('[data-tool-header][data-shell-ready]').waitFor({state: 'attached', timeout: 15000});
const copies = p => p.evaluate(() => Object.keys(localStorage).filter(k => k.startsWith('mg:recent:v1:')).map(k => JSON.parse(localStorage.getItem(k))));
const templates = p => p.evaluate(() => Object.keys(localStorage).filter(k => k.startsWith('mg:template:v1:')).map(k => JSON.parse(localStorage.getItem(k))));
const status = p => p.locator('[data-tool-header] [role=status]');
const sectionTitles = d => d.locator('h3').allTextContents();
/* focus is inside the open Your work dialog (never on <body>) now and still a moment later */
const focusHeld = async p => {
  const inside = () => p.evaluate(() => { const d = document.querySelector('dialog.tool-work'); return !!d?.open && d.contains(document.activeElement) && document.activeElement !== document.body; });
  if(!await until(inside, {timeout: 2000})) return false;
  for(let i = 0; i < 3; i++){ await p.waitForTimeout(80); if(!await inside()) return false; }
  return true;
};

const browser = await chromium.launch();
/* Every wait is bounded and every close is bounded, so a failing state reports a FAIL line in seconds instead of
   leaving the runner to kill the suite at its 600s timeout. A context's default timeout is 10s (navigation 20s);
   closing races a 10s timer and prints a NOTE (not a FAIL) if the timer wins. */
const liveContexts = new Set();
const newContext = browser.newContext.bind(browser);
browser.newContext = async (...args) => {
  const context = await newContext(...args), rawClose = context.close.bind(context);
  context.setDefaultTimeout(10000); context.setDefaultNavigationTimeout(20000);
  liveContexts.add(context);
  context.close = async () => {
    liveContexts.delete(context);
    let timer;
    const timedOut = await Promise.race([rawClose().then(() => false, () => false), new Promise(resolve => { timer = setTimeout(() => resolve(true), 10000); })]);
    clearTimeout(timer);
    if(timedOut) console.log('NOTE a browser context did not close within 10s; moving on');
  };
  return context;
};
const closeLeftovers = () => Promise.all([...liveContexts].map(context => context.close()));
/* a service worker that never installs (a stale integrity hash after an edit under assets/: run npm run sync) would hang
   navigator.serviceWorker.ready forever */
const swInstalled = page => page.evaluate(() => Promise.race([navigator.serviceWorker.ready.then(() => true), new Promise(resolve => setTimeout(() => resolve(false), 15000))]));
/* choosing New (or New from template…), Your work… or Save a copy… closes the File menu, with its action started */
async function checkFileCloses(page, dir, entry){
  for(const name of [entry.new ? 'New' : entry.templates ? 'New from template…' : null, 'Your work…', 'Save a copy…'].filter(Boolean)){
    await fileItem(page, name);
    await page.waitForTimeout(200);
    ok(await page.evaluate(() => !document.querySelector('[data-shell-file]').open), `${dir}: File closes after choosing "${name}"`);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(150);
  }
}
const phoneOpts = {viewport: VIEWPORTS.phone, hasTouch: true, isMobile: true, deviceScaleFactor: 1, reducedMotion: 'reduce', serviceWorkers: 'block'};
const laptopOpts = {viewport: VIEWPORTS.laptop, deviceScaleFactor: 1, reducedMotion: 'reduce', serviceWorkers: 'block'};
async function open(dir, opts, url = originOf(dir) + '/' + dir + '/'){
  const context = await browser.newContext(opts), page = await context.newPage(), errors = trackErrors(page);
  await context.grantPermissions(['clipboard-read', 'clipboard-write'], {origin: new URL(url).origin}).catch(() => {});
  await page.goto(url, {waitUntil: 'networkidle'});
  await ready(page);
  return {context, page, errors};
}
/* wait until the page has stopped moving, so a before/after comparison measures the menu and not a late render */
const stable = async p => { let last = '', same = 0; await until(async () => { const now = JSON.stringify(await geometry(p)); same = now === last ? same + 1 : 0; last = now; return same >= 5; }, {timeout: 15000, step: 100}); };
const box = (p, sel) => p.locator(sel).first().boundingBox();
const geometry = p => p.evaluate(() => ({
  main: Math.round(document.querySelector('main').getBoundingClientRect().top + scrollY),
  header: Math.round(document.querySelector('[data-tool-header]').getBoundingClientRect().bottom + scrollY),
  h1: JSON.stringify(document.querySelector('h1').getBoundingClientRect()),
  height: document.documentElement.scrollHeight, width: document.documentElement.scrollWidth,
}));

for(const dir of SHELLS){
  if(!scope.wants(dir)) continue;
  try{
  const entry = SHELL_MANIFEST[dir], names = menuNames(entry), model = MODEL[dir];
  ok(!!model, `${dir}: the suite knows how to edit and read this page's model`);

  if(MODE !== 'core'){
    /* ---- the per-page table: only what differs from page to page ---- */
    const {context, page, errors} = await open(dir, laptopOpts);
    const reload = async () => { await page.waitForLoadState('networkidle'); await ready(page); };
    const panelName = 'Your work in ' + entry.name, panel = () => page.getByRole('dialog', {name: panelName});
    const off = await page.evaluate(() => [...document.querySelectorAll('[data-shell-row] button[data-act]')].filter(b => b.disabled).map(b => b.dataset.act));
    ok(off.length === 0, `${dir}: every stamped control is enabled once the header is ready (disabled: [${off}])`);
    await page.locator('[data-shell-file] summary').click();
    const shown = await page.locator('[data-shell-file] .tool-menu').locator('button, a').evaluateAll(els => els.filter(el => el.checkVisibility()).map(el => el.textContent.trim()));
    ok(JSON.stringify(shown) === JSON.stringify(names), `${dir}: File lists exactly [${names.join(' | ')}] (got [${shown.join(' | ')}])`);
    await page.keyboard.press('Escape');
    await checkFileCloses(page, dir, entry);

    /* Save a copy, then Your work lists it and opens it */
    await model.edit(page, 1);
    ok(await model.read(page) === 'one', `${dir}: the page can be put in a known state`);
    await fileItem(page, 'Save a copy…');
    const save = page.locator('.recent-dialog');
    await save.waitFor();
    await save.getByLabel('Copy name').fill(`${dir} saved copy`);
    await save.getByRole('button', {name: 'Save copy', exact: true}).click();
    await save.waitFor({state: 'detached'});
    ok((await copies(page)).length === 1 && (await copies(page))[0].tool === dir, `${dir}: Save a copy writes one record for ${dir}`);
    await model.edit(page, 2);
    await fileItem(page, 'Your work…');
    const d = panel(); await d.waitFor();
    ok(await d.getByRole('link', {name: new RegExp(`${dir} saved copy`)}).count() === 1, `${dir}: Your work lists the saved copy`);
    await d.getByRole('link', {name: new RegExp(`${dir} saved copy`)}).click();
    await reload();
    ok(await until(async () => await model.read(page) === 'one', {timeout: 8000}), `${dir}: opening the saved copy restores its model`);

    /* New, or New from template… where the page has no blank start */
    if(entry.new){
      await model.edit(page, 2);
      await fileItem(page, 'New');
      ok(await until(async () => model.isBlank ? await model.isBlank(page) : await model.read(page) === 'other', {timeout: 6000}), `${dir}: New starts the page's own blank model`);
    } else if(entry.templates){
      await fileItem(page, 'New from template…');
      const w = panel(); await w.waitFor();
      ok(JSON.stringify(await w.locator('h3').allTextContents()).includes('Templates') && (await w.textContent()).includes('No templates yet. Choose Save as template… in the File menu') && !(await page.locator('.mg-template-dialog').count()), `${dir}: with no template, New from template… opens Your work at Templates`);
      await page.keyboard.press('Escape');
    } else ok(!(await page.locator('[data-act=new], [data-act=new-template]').count()), `${dir}: no New where the manifest grants no blank start and no templates`);

    /* Examples */
    if(entry.examples){
      const wanted = EXAMPLE_NAMES[dir], label = n => ['', 'one', 'two', 'three'][n];
      await fileItem(page, 'Examples');
      const names2 = await page.locator('[data-shell-examples-list] button').allTextContents();
      ok(JSON.stringify([...names2].sort()) === JSON.stringify([...wanted].sort()), `${dir}: Examples lists exactly [${wanted.join(' | ')}] (got [${names2.join(' | ')}])`);
      await page.keyboard.press('Escape');
      for(const example of wanted){
        await model.edit(page, 1);
        await fileItem(page, 'Examples');
        await page.getByRole('button', {name: example, exact: true}).click();
        ok(await until(async () => await model.read(page) !== label(1), {timeout: 6000}) && !(await page.locator('[data-shell-file] .tool-menu').isVisible()), `${dir}: choosing "${example}" replaces the model and closes File`);
      }
    }
    if(!entry.share) ok(!(await page.locator('[data-act=share]').count()), `${dir}: no Share where the manifest grants none`);
    ok(errors.length === 0, `${dir}: no console errors (${errors.join(' | ').slice(0, 120)})`);
    await context.close();

    /* Share: the link reopens the exact current model in a fresh page (Gauge offers none: a live room is not a model link) */
    if(entry.share){
      const s2 = await open(dir, laptopOpts);
      await s2.page.evaluate(() => history.replaceState(null, '', '#stale-garbage'));
      await model.edit(s2.page, 1);
      await s2.page.locator('[data-act=share]').click();
      await until(async () => (await status(s2.page).textContent()).length > 0);
      const link = await s2.page.evaluate(() => navigator.clipboard.readText());
      ok(link.startsWith(originOf(dir) + '/' + dir + '/#') && !link.includes('stale-garbage'), `${dir}: Share copies a link built from the model, not location.hash`);
      const fresh = await open(dir, laptopOpts, link);
      ok(await until(async () => await model.read(fresh.page) === 'one', {timeout: 8000}), `${dir}: the shared link reopens the same model in a fresh browser`);
      await fresh.context.close(); await s2.context.close();
    }

    /* a seeded legacy store lists, opens and removes */
    if(LEGACY[dir]){
      const legacy = LEGACY[dir];
      const lc = await browser.newContext(laptopOpts), lp = await lc.newPage();
      await lc.addInitScript(({items, key}) => { if(!localStorage.getItem('__seeded')){ localStorage.setItem('__seeded', '1'); localStorage.setItem(key, JSON.stringify(items)); } }, {items: legacy.items, key: legacy.key});
      await lp.goto(originOf(dir) + '/' + dir + '/', {waitUntil: 'networkidle'}); await ready(lp);
      await fileItem(lp, 'Your work…');
      const ld = lp.getByRole('dialog', {name: panelName}); await ld.waitFor();
      ok(JSON.stringify(await ld.locator('section[data-sec=copies] .recent-name').allTextContents()) === JSON.stringify(legacy.names), `${dir}: legacy ${legacy.key} copies are listed (${legacy.names.join(', ')})`);
      await ld.getByLabel('Manage ' + legacy.names[0], {exact: true}).click();
      await ld.getByRole('button', {name: 'Remove ' + legacy.names[0], exact: true}).click();
      await lp.locator('.recent-dialog:not(.tool-work)').getByRole('button', {name: 'Remove copy', exact: true}).click();
      await lp.locator('.recent-dialog:not(.tool-work)').waitFor({state: 'detached'});
      const left = await lp.evaluate(k => JSON.parse(localStorage.getItem(k)), legacy.key);
      ok(left.length === 1 && left[0].name === legacy.names[1], `${dir}: removing a legacy ${legacy.key} copy rewrites the store (left: ${left.map(l => l.name)})`);
      await ld.getByRole('link', {name: new RegExp(legacy.names[1])}).click();
      await lp.waitForLoadState('networkidle'); await ready(lp);
      ok(await until(async () => await model.read(lp) === 'legacy-two', {timeout: 8000}), `${dir}: a legacy ${legacy.key} copy opens from Your work with its source`);
      await lc.close();
    }

    /* Case files carry long reference URLs: Share keeps the page's own 24000-character link limit, not the 6000 default */
    if(dir === 'case'){
      const long = await open(dir, laptopOpts);
      await long.page.evaluate(() => {   // a document whose link is well past 6000 characters and well inside 24000
        const view = document.querySelector('.cm-content').cmTile.view, noise = Array.from(crypto.getRandomValues(new Uint8Array(9000)), b => String.fromCharCode(33 + b % 90)).join('');
        view.dispatch({changes: {from: 0, insert: '// ' + noise + '\n'}});
      });
      await long.page.waitForTimeout(500);
      await long.page.locator('[data-act=share]').click();
      await until(async () => (await status(long.page).textContent()).length > 0);
      const said = await status(long.page).textContent(), link = await long.page.evaluate(() => navigator.clipboard.readText());
      ok(/link copied/i.test(said) && link.length > 6000, `${dir}: Share copies a link longer than the 6000 default, up to the page's own 24000 limit (${link.length} chars; said ${JSON.stringify(said)})`);
      await long.context.close();
    }

    /* On a short viewport the open File menu (Examples expanded) fits the screen: it scrolls inside itself and its last item is reachable */
    if(dir === 'rank'){
      const short = await browser.newContext({viewport: {width: 320, height: 568}, hasTouch: true, isMobile: true, reducedMotion: 'reduce', serviceWorkers: 'block'}), sp = await short.newPage();
      await sp.goto(T + '/rank/', {waitUntil: 'networkidle'}); await ready(sp);
      await openFileMenu(sp);
      await sp.locator('[data-shell-file] [data-act=examples]').click();
      await sp.waitForTimeout(250);
      const geo = await sp.evaluate(() => { const m = document.querySelector('[data-shell-file] .tool-menu').getBoundingClientRect(); return {bottom: Math.round(m.bottom), top: Math.round(m.top)}; });
      ok(geo.bottom <= 568, `${dir}: at 320x568 the open File menu with Examples expanded ends inside the viewport (bottom ${geo.bottom}px)`);
      const last = sp.locator('[data-shell-file] .tool-menu').getByRole('link', {name: 'Backup & restore'});
      await last.scrollIntoViewIfNeeded();
      const reach = await sp.evaluate(() => { const m = document.querySelector('[data-shell-file] .tool-menu').getBoundingClientRect(), l = document.querySelector('[data-shell-file] [data-act=backup]').getBoundingClientRect(); return l.bottom <= m.bottom + 1 && l.top >= m.top - 1 && l.bottom <= innerHeight; });
      ok(reach, `${dir}: the last File item can be scrolled into view inside the menu at 320x568`);
      await short.close();
    }

    /* Case's Appearance menu is a popover too: one popover open at a time, Escape closes it and returns focus */
    if(dir === 'case'){
      const pop = await open(dir, laptopOpts), pp = pop.page, openCount = () => pp.evaluate(() => document.querySelectorAll('[data-shell-file][open], #appearance[open]').length);
      /* toggle events arrive a task later: wait for the count to settle */
      const settledCount = async () => { await pp.waitForTimeout(150); return openCount(); };
      await pp.locator('#appearance summary').click();
      await pp.locator('[data-shell-file] summary').click();
      const afterFile = await settledCount();
      ok(afterFile === 1 && await pp.evaluate(() => document.querySelector('[data-shell-file]').open), `${dir}: opening File closes Appearance (open popovers: ${afterFile})`);
      await pp.keyboard.press('Escape');
      ok(await openCount() === 0 && await pp.evaluate(() => document.activeElement === document.querySelector('[data-shell-file] summary')), `${dir}: Escape closes File and returns focus to it`);
      await pp.locator('#appearance summary').click();
      await pp.locator('#appearance select').first().focus();
      await pp.keyboard.press('Escape');
      ok(await openCount() === 0 && await pp.evaluate(() => document.activeElement === document.querySelector('#appearance summary')), `${dir}: Escape closes Appearance and returns focus to it`);
      await pp.locator('[data-shell-file] summary').click();
      await pp.locator('#appearance summary').focus();
      await pp.keyboard.press('Enter');
      const afterApp = await settledCount();
      ok(afterApp === 1 && await pp.evaluate(() => document.querySelector('#appearance').open), `${dir}: opening Appearance closes File (open popovers: ${afterApp})`);
      await pop.context.close();
    }

    /* a saved template shows under Templates in Your work, after Saved copies (and a page with no templates has none) */
    {
      const tc = await open(dir, laptopOpts), tp = tc.page;
      if(entry.templates){
        await fileItem(tp, 'Save as template…');
        const tdlg = tp.locator('.mg-template-dialog'); await tdlg.waitFor();
        await tdlg.getByLabel('Template name').fill('Section check'); await tdlg.getByRole('button', {name: 'Save template', exact: true}).click(); await tdlg.waitFor({state: 'detached'});
      }
      await fileItem(tp, 'Your work…');
      const td = tp.getByRole('dialog', {name: 'Your work in ' + entry.name}); await td.waitFor();
      const titlesT = await sectionTitles(td);
      ok(entry.templates ? titlesT.includes('Templates') : !titlesT.includes('Templates'), `${dir}: Your work ${entry.templates ? 'shows the Templates section once a template is saved' : 'has no Templates section'} (sections: [${titlesT}])`);
      await tc.context.close();
    }

    /* what a page pins or selects travels in its Share link: set a non-default value, share, reopen in a fresh context */
    const PINS = {
      proxy: {
        label: "Proxy's selected theory",
        async set(p){ const ids = await p.evaluate(() => [...document.querySelectorAll('#preview [data-kind="failure-theory"]')].map(g => g.dataset.theoryId)); const cur = await this.read(p); const pick = ids.find(id => id !== cur) ?? ids[0]; await p.locator(`#preview [data-kind="failure-theory"][data-theory-id="${pick}"]`).first().click(); await p.waitForTimeout(500); return this.read(p); },
        read: p => p.evaluate(() => document.querySelector('#preview [data-kind="selected-theory-receipt"]')?.dataset.theoryId ?? ''),
      },
      tree: {
        label: "Tree's collapsed-source flag",
        async set(p){ const was = await this.read(p); await p.locator('#railtab').click(); await p.waitForTimeout(500); const now = await this.read(p); return now !== was ? now : null; },
        read: p => p.evaluate(() => String(document.querySelector('#workspace').classList.contains('collapsed'))),
      },
      risk: {
        label: "Risk's focused route",
        async set(p){ const was = await this.read(p); for(const i of [0, 1, 2, 3]){ await p.locator(`#preview [data-focus="${i}"]`).first().dispatchEvent('click'); await p.waitForTimeout(700); const now = await this.read(p); if(now && now !== was) return now; } return null; },
        read: p => p.evaluate(() => document.querySelector('#verdict')?.textContent.trim() ?? ''),
      },
    }[dir];
    if(PINS){
      const pin = await open(dir, laptopOpts), pinned = await PINS.set(pin.page);
      ok(!!pinned, `${dir}: the page can be put in a non-default ${PINS.label} state`);
      if(pinned){
        await pin.page.locator('[data-act=share]').click();
        await until(async () => (await status(pin.page).textContent()).length > 0);
        const link = await pin.page.evaluate(() => navigator.clipboard.readText());
        const fresh = await open(dir, laptopOpts, link);
        ok(await until(async () => await PINS.read(fresh.page) === pinned, {timeout: 8000}), `${dir}: the shared link carries ${PINS.label} (${JSON.stringify(String(pinned).slice(0, 40))})`);
        await fresh.context.close();
      }
      await pin.context.close();
    }

    /* a document far past every page's limit is refused with "too large" and nothing is copied (all editor pages) */
    if(model === dsl && entry.share){
      const huge = await open(dir, laptopOpts), hp = huge.page;
      await hp.evaluate(() => navigator.clipboard.writeText('sentinel'));
      await hp.evaluate(() => {
        const view = document.querySelector('.cm-content').cmTile.view, noise = Array.from(crypto.getRandomValues(new Uint8Array(60000)), b => String.fromCharCode(33 + b % 90)).join('');
        view.dispatch({changes: {from: 0, insert: '// ' + noise + '\n'}});
      });
      await hp.waitForTimeout(600);
      await hp.locator('[data-act=share]').click();
      await until(async () => (await status(hp).textContent()).length > 0);
      ok((await status(hp).textContent()) === 'This model is too large for a link. Export the source instead.' && await hp.evaluate(() => navigator.clipboard.readText()) === 'sentinel', `${dir}: a model far past the link limit is refused with "too large" and nothing is copied`);
      await huge.context.close();
    }

    /* Premortem's register has no Copy link of its own: Share is the one way to a link, and its refusal says why */
    if(dir === 'premortem'){
      const reg = await open(dir, laptopOpts), rp = reg.page;
      await rp.locator('#viewtoggle [data-view=register]').click();
      await rp.locator('#phasepanel [data-act=copydoc], #registerpanel [data-act=copydoc], [data-act=copydoc]').first().waitFor();
      ok(await rp.locator('[data-act=copylink]').count() === 0 && await rp.locator('[data-act=copydoc]').count() >= 1, `${dir}: the register view offers Copy as markdown and no second Copy link`);
      await reg.context.close();
    }

    /* Premortem supplies its own link builder, which throws on an oversize register: Share must keep that guard */
    if(dir === 'premortem'){
      const big = await open(dir, laptopOpts);
      await big.page.evaluate(() => navigator.clipboard.writeText('sentinel'));
      await big.page.evaluate(() => {
        const field = document.querySelector('#phasepanel input'), noise = Array.from(crypto.getRandomValues(new Uint8Array(40000)), b => String.fromCharCode(33 + b % 90)).join('');
        field.removeAttribute('maxlength'); field.value = noise; field.dispatchEvent(new Event('input', {bubbles: true}));
      });
      await big.page.locator('[data-act=share]').click();
      await until(async () => (await status(big.page).textContent()).length > 0);
      const said = await status(big.page).textContent(), clip = await big.page.evaluate(() => navigator.clipboard.readText());
      ok(said === 'This register is too large for a link. Copy it as Markdown instead.' && clip === 'sentinel', `${dir}: an oversize register is refused by Premortem's own link builder, says why in its own words, and nothing is copied (said ${JSON.stringify(said)})`);
      await big.context.close();
    }

    /* the page's own live records (Gauge question sets, Premortem registers) lead Your work, under the manifest's word for them */
    if(entry.workspaces){
      const wc = await browser.newContext(laptopOpts), wp = await wc.newPage();
      if(dir === 'gauge') await wc.addInitScript(() => { if(!localStorage.getItem('__seeded')){ localStorage.setItem('__seeded', '1'); localStorage.setItem('gauge-saved', JSON.stringify([{name: 'Weekly question set', src: 'title: Weekly questions\nWill requests arrive on time? :: prob'}])); } });
      await wp.goto(originOf(dir) + '/' + dir + '/', {waitUntil: 'networkidle'}); await ready(wp);
      await fileItem(wp, 'Your work…');
      const wd = wp.getByRole('dialog', {name: panelName}); await wd.waitFor();
      const titles = await sectionTitles(wd), row = wd.locator('section[data-sec=workspaces] li').first();
      ok(titles[0] === entry.workspaces, `${dir}: Your work opens with a "${entry.workspaces}" section, titled from the manifest (sections: [${titles}])`);
      const wname = (await row.locator('.recent-name').textContent()).trim(), href = await row.locator('a.recent-open').getAttribute('href');
      ok(/[?&]work=/.test(href), `${dir}: the ${JSON.stringify(wname)} row opens through the record's own href (${href.slice(0, 40)})`);
      await row.getByLabel('Manage ' + wname, {exact: true}).click();
      const acts = await row.locator('.recent-row-actions button').allTextContents();
      ok(JSON.stringify(acts) === JSON.stringify(['Pin', 'Rename', 'Archive']), `${dir}: a workspace row offers only the actions that work without touching its store (got [${acts}])`);
      await row.getByRole('button', {name: 'Archive ' + wname, exact: true}).click();
      const after = await sectionTitles(wd);
      ok(!after.includes(entry.workspaces) && after.at(-1) === 'Archived', `${dir}: archiving a ${entry.workspaces.toLowerCase()} record moves it to Archived (sections: [${after}])`);
      await wd.locator('section[data-sec=archived] li').first().getByLabel('Manage ' + wname, {exact: true}).click();
      await wd.getByRole('button', {name: 'Restore ' + wname, exact: true}).click();
      ok((await sectionTitles(wd))[0] === entry.workspaces, `${dir}: restoring it returns it to the head of the dialog`);
      await wd.locator('section[data-sec=workspaces] a.recent-open').first().click();
      await wp.waitForLoadState('networkidle'); await ready(wp);
      const opened = dir === 'gauge' ? (await docOf(wp)).includes('Weekly questions') : (await wp.locator(framed).first().inputValue()) === 'Lantern 2.0 launch';
      ok(opened, `${dir}: opening a ${entry.workspaces.toLowerCase()} record from Your work loads that record`);
      await wc.close();
    }

    /* Energy: its own origin, its own storage scope, its own catalogue, and its own service worker */
    if(isEnergy(dir)){
      const ec = await open(dir, laptopOpts), ep = ec.page;
      await model.edit(ep, 1);
      await fileItem(ep, 'Save a copy…');
      const dlg = ep.locator('.recent-dialog'); await dlg.waitFor();
      await dlg.getByLabel('Copy name').fill(`${dir} energy copy`); await dlg.getByRole('button', {name: 'Save copy', exact: true}).click(); await dlg.waitFor({state: 'detached'});
      const keys = await ep.evaluate(() => Object.keys(localStorage).filter(k => k.startsWith('mg:recent:v1:')));
      ok(keys.length === 1 && keys[0].startsWith('mg:recent:v1:energy:'), `${dir}: the saved copy lives in the Energy storage scope (${keys})`);
      if(entry.templates){
        await fileItem(ep, 'Save as template…');
        const tp = ep.locator('.mg-template-dialog'); await tp.waitFor();
        await tp.getByLabel('Template name').fill('Energy shape'); await tp.getByRole('button', {name: 'Save template', exact: true}).click(); await tp.waitFor({state: 'detached'});
        const tkeys = await ep.evaluate(() => Object.keys(localStorage).filter(k => k.startsWith('mg:template:v1:')));
        ok(tkeys.length === 1 && tkeys[0].includes(':energy:'), `${dir}: the template lives in the Energy storage scope (${tkeys})`);
      }
      await fileItem(ep, 'Your work…');
      const ed = ep.getByRole('dialog', {name: panelName}); await ed.waitFor();
      const all = new URL(await ed.locator('a.tool-work-all').evaluate(a => a.href));
      ok(all.origin === E && all.hash === '#recent-work', `${dir}: "See all your work" goes to the Energy catalogue (${all.origin}${all.pathname}${all.hash})`);
      await ep.keyboard.press('Escape');
      await ep.goto(E + '/', {waitUntil: 'networkidle'});
      ok(await ep.locator('.recent-open').filter({hasText: `${dir} energy copy`}).count() === 1, `${dir}: the Energy catalogue lists the copy`);
      await ec.context.close();
    }
    /* Energy keeps the 24000-character link limit its old Copy link had: a ~6.3k-character source must share and reopen */
    if(dir === 'cycles' || dir === 'risk'){
      const big = await open(dir, laptopOpts);
      const marker = 'bigmodel-' + dir;
      await big.page.evaluate(m => {
        const view = document.querySelector('.cm-content').cmTile.view, noise = Array.from(crypto.getRandomValues(new Uint8Array(6500)), b => String.fromCharCode(33 + b % 90)).join('');
        view.dispatch({changes: {from: 0, insert: '// ' + m + ' ' + noise + '\n'}});
      }, marker);
      await big.page.waitForTimeout(600);
      await big.page.locator('[data-act=share]').click();
      await until(async () => (await status(big.page).textContent()).length > 0);
      const link = await big.page.evaluate(() => navigator.clipboard.readText()), said = await status(big.page).textContent();
      ok(link.length > 6000 && /Link copied/.test(said), `${dir}: Share copies a model whose link is past 6000 characters (${link.length} chars; said ${JSON.stringify(said)})`);
      if(link.length > 6000){
        const fresh = await open(dir, laptopOpts, link);
        ok(await until(async () => (await docOf(fresh.page)).includes(marker), {timeout: 8000}), `${dir}: that link reopens the same model in a fresh context`);
        await fresh.context.close();
      }
      await big.context.close();
    }
    /* a reader who has scrolled the E1-E5 strip by hand is not re-centred by a resize */
    if(dir === 'intraday'){
      const sc = await browser.newContext({viewport: {width: 375, height: 812}, reducedMotion: 'reduce', serviceWorkers: 'block'}), sp = await sc.newPage();
      await sp.goto(E + '/intraday/', {waitUntil: 'networkidle'}); await ready(sp);
      const left = () => sp.evaluate(() => document.querySelector('[data-tool-header] .series').scrollLeft);
      const centred = await left();
      await sp.locator('[data-tool-header] .series').hover();
      await sp.mouse.wheel(-600, 0);
      await sp.waitForTimeout(400);
      const scrolled = await left();
      await sp.setViewportSize({width: 380, height: 812});
      await sp.waitForTimeout(400);
      const after = await left();
      ok(centred > 0 && scrolled < centred && Math.abs(after - scrolled) <= 2, `${dir}: after the reader scrolls the strip by hand a resize does not re-centre it (centred ${centred}, scrolled to ${scrolled}, after resize ${after})`);
      await sc.close();
    }
    /* the Your work module must open offline from energy/sw.js's own precache (once: every Energy page shares the worker) */
    if(dir === 'frequency'){
      const context = await browser.newContext({...laptopOpts, serviceWorkers: 'allow'}), page = await context.newPage();
      await page.goto(E + '/frequency/', {waitUntil: 'networkidle'}); await ready(page);
      const installed = await swInstalled(page);
      ok(installed, `${dir}: the Energy service worker installs (if not: an integrity hash is stale, run npm run sync)`);
      if(installed){
        await page.reload({waitUntil: 'networkidle'});
        ok(await until(() => page.evaluate(() => !!navigator.serviceWorker.controller), {timeout: 15000}), `${dir}: the Energy service worker controls the reloaded page before going offline`);
        await context.setOffline(true);
        await page.reload({waitUntil: 'domcontentloaded'}); await ready(page);
        await fileItem(page, 'Your work…');
        const panel = page.getByRole('dialog', {name: 'Your work in ' + entry.name});
        await panel.waitFor({timeout: 8000});
        ok(await until(async () => (await panel.textContent()).includes('Nothing saved'), {timeout: 6000}), `${dir}: Your work opens offline from the Energy service worker's precache`);
      }
      await context.close();
    }
    continue;
  }

  /* ---- anatomy and the File menu, by touch on a phone and by mouse on a laptop ---- */
  for(const [vp, opts] of [['phone', phoneOpts], ['laptop', laptopOpts]]){
    const {context, page, errors} = await open(dir, opts), size = VIEWPORTS[vp], tap = loc => vp === 'phone' ? loc.tap() : loc.click();
    const where = `${dir} @${vp}`;
    const anatomy = await page.evaluate(() => {
      const header = document.querySelector('[data-tool-header]'), r = el => el.getBoundingClientRect();
      const kicker = header.querySelector('.kicker'), h1 = header.querySelector('h1'), row = header.querySelector('.tool-titlerow');
      return {header: r(header).height, kicker: r(kicker).height, row: r(row).height, h1: getComputedStyle(h1).fontSize, h1Text: h1.textContent,
        kickerText: kicker.textContent.trim(), crumb: !!header.querySelector('.crumb'), tagline: !!header.querySelector('.tagline')};
    });
    ok(anatomy.header === 96 && anatomy.row === 48 && anatomy.kicker === 20, `${where}: header 96px = kicker 20 + title row 48 + 16 above + 12 below (got ${anatomy.header}/${anatomy.kicker}/${anatomy.row})`);
    ok(anatomy.h1 === (vp === 'phone' ? '28px' : '32px'), `${where}: h1 is ${vp === 'phone' ? 28 : 32}px (got ${anatomy.h1})`);
    ok(anatomy.h1Text === entry.name, `${where}: h1 reads the manifest name ${JSON.stringify(entry.name)} (got ${JSON.stringify(anatomy.h1Text)})`);
    ok(anatomy.kickerText.length > 0 && !anatomy.crumb && !anatomy.tagline, `${where}: header holds the kicker and title row only (kicker ${JSON.stringify(anatomy.kickerText.slice(0, 24))}…)`);
    const summary = page.locator('[data-shell-file] summary'), share = page.locator('[data-act=share]');
    const sBox = await summary.boundingBox(), shBox = await share.boundingBox();
    ok(sBox.height >= 44 && shBox.height >= 44, `${where}: File and Share are at least 44px tall (${Math.round(sBox.height)}/${Math.round(shBox.height)})`);
    ok(sBox.x + sBox.width <= size.width - 8 && shBox.x + shBox.width <= size.width - 8 && sBox.x >= 0, `${where}: the controls sit inside the viewport`);
    ok(!(await page.locator('[data-shell-file] .tool-menu').isVisible()), `${where}: File is closed at load`);
    if(vp === 'laptop') await checkFileCloses(page, dir, entry);

    await stable(page);
    const before = await geometry(page);
    await tap(summary);
    const menu = page.locator('[data-shell-file] .tool-menu');
    await menu.waitFor({state: 'visible'});
    const shown = await menu.locator('button, a').evaluateAll(els => els.filter(el => el.checkVisibility()).map(el => ({name: el.textContent.trim(), h: el.getBoundingClientRect().height})));
    ok(JSON.stringify(shown.map(i => i.name)) === JSON.stringify(names), `${where}: File lists exactly [${names.join(' | ')}] (got [${shown.map(i => i.name).join(' | ')}])`);
    ok(shown.every(i => i.h >= 44), `${where}: every File item is at least 44px tall (min ${Math.min(...shown.map(i => Math.round(i.h)))})`);
    const mBox = await menu.boundingBox();
    ok(mBox.x >= 0 && mBox.x + mBox.width <= size.width && mBox.y + mBox.height <= size.height, `${where}: the open menu fits the viewport (${Math.round(mBox.x)}..${Math.round(mBox.x + mBox.width)} of ${size.width}, bottom ${Math.round(mBox.y + mBox.height)} of ${size.height})`);
    const opened = await geometry(page);
    ok(JSON.stringify(opened) === JSON.stringify(before), `${where}: opening File moves nothing on the page (main ${before.main}->${opened.main}, page ${before.height}->${opened.height})`);
    ok(opened.width <= size.width, `${where}: no horizontal overflow with the menu open (${opened.width} <= ${size.width})`);
    ok(await page.evaluate(() => document.querySelector('[data-shell-file]').contains(document.activeElement)), `${where}: focus moves into the open menu`);

    /* Escape closes and hands focus back to the summary */
    await page.keyboard.press('Escape');
    ok(!(await menu.isVisible()) && await summary.evaluate(el => document.activeElement === el), `${where}: Escape closes File and returns focus to its summary`);

    /* an outside tap closes it: the kicker is above the menu and does nothing */
    await tap(summary); await menu.waitFor({state: 'visible'});
    const k = await box(page, '[data-tool-header] .kicker');
    if(vp === 'phone') await page.touchscreen.tap(k.x + 20, k.y + k.height / 2); else await page.mouse.click(k.x + 20, k.y + k.height / 2);
    ok(!(await menu.isVisible()), `${where}: tapping outside closes File`);
    const closed = await geometry(page);
    ok(JSON.stringify(closed) === JSON.stringify(before), `${where}: closing File moves nothing either`);

    /* Examples is an inline disclosure inside the menu, not a flyout */
    if(entry.examples){
      await tap(summary); await menu.waitFor({state: 'visible'});
      await tap(page.locator('[data-act=examples]'));
      const list = page.locator('[data-shell-examples-list]');
      await list.waitFor({state: 'visible'});
      const lb = await list.boundingBox(), mb2 = await menu.boundingBox();
      ok(lb.x >= mb2.x && lb.x + lb.width <= mb2.x + mb2.width + 1 && lb.y >= mb2.y && lb.y + lb.height <= mb2.y + mb2.height + 1,
        `${where}: the example list opens inside the menu`);
      const items = await list.locator('button').evaluateAll(els => els.map(el => [el.textContent.trim(), el.getBoundingClientRect().height]));
      ok(items.length === (EXAMPLE_NAMES[dir]?.length ?? items.length) && items.length >= 1 && items.every(([, h]) => h >= 44), `${where}: examples are ${items.length} targets of at least 44px (${items.map(i => i[0]).join(', ')})`);
      ok((await geometry(page)).width <= size.width, `${where}: no horizontal overflow with Examples expanded`);
      await page.keyboard.press('Escape');
    }
    ok(errors.length === 0, `${where}: no console errors (${errors.join(' | ').slice(0, 120)})`);
    await context.close();
  }

  /* ---- keyboard and scroll (laptop) ---- */
  {
    const {context, page} = await open(dir, laptopOpts), summary = page.locator('[data-shell-file] summary'), menu = page.locator('[data-shell-file] .tool-menu');
    await summary.focus(); await page.keyboard.press('Enter');
    await menu.waitFor({state: 'visible'});
    /* the toggle event hands focus to the first item a moment after the menu shows */
    await page.waitForFunction(() => document.querySelector('[data-shell-file] .tool-menu').contains(document.activeElement));
    const first = await page.evaluate(() => document.activeElement.textContent.trim());
    await page.keyboard.press('ArrowDown');
    const second = await page.evaluate(() => document.activeElement.textContent.trim());
    ok(first === names[0] && second === names[1], `${dir}: Enter opens File on its first item and ArrowDown moves to the next (${first} -> ${second}, want ${names[0]} -> ${names[1]})`);
    await page.keyboard.press('End');
    ok(await page.evaluate(() => document.activeElement.textContent.trim() === 'Backup & restore' && document.activeElement.tagName === 'A'), `${dir}: End lands on Backup & restore`);
    const at = () => page.evaluate(() => document.activeElement.textContent.trim());
    await page.keyboard.press('ArrowDown');
    const wrapped = await at();
    await page.keyboard.press('ArrowUp');
    const back = await at();
    await page.keyboard.press('Home');
    const home = await at();
    ok(wrapped === names[0] && back === 'Backup & restore' && home === names[0], `${dir}: ArrowDown wraps to ${names[0]}, ArrowUp reaches Backup & restore, Home returns to ${names[0]} (got ${wrapped} / ${back} / ${home})`);
    await page.keyboard.press('End');
    /* Tab is not a trap: it walks on to the link, then out to Share, closing the menu */
    for(let i = 0; i < 4 && await menu.isVisible(); i++) await page.keyboard.press('Tab');
    ok(!(await menu.isVisible()) && await page.evaluate(() => document.activeElement.dataset.act === 'share'), `${dir}: Tab leaves the menu for Share and closes it`);
    /* an open menu does not trap the page's scroll */
    await summary.click(); await menu.waitFor({state: 'visible'});
    await page.mouse.move(8, 600); await page.mouse.wheel(0, 400);
    const scrolled = await until(() => page.evaluate(() => scrollY > 100), {timeout: 3000});
    ok(!!scrolled, `${dir}: wheel scrolling still moves the page while File is open`);
    await context.close();
  }

  /* ---- each item does its job (laptop) ---- */
  {
    const {context, page, errors} = await open(dir, laptopOpts), size = VIEWPORTS.laptop;
    const name = `${dir} saved copy`, panelName = 'Your work in ' + entry.name;
    const panel = () => page.getByRole('dialog', {name: panelName});
    const openPanel = async () => { await fileItem(page, 'Your work…'); const d = panel(); await d.waitFor(); return d; };
    const sections = d => d.locator('h3').allTextContents();
    const reload = async () => { await page.waitForLoadState('networkidle'); await ready(page); };
    const state = await (async () => { await model.edit(page, 1); return model.read(page); })();
    ok(state === 'one', `${dir}: the page can be put in a known state (read ${state})`);
    ok(!(await copies(page)).length, `${dir}: editing and opening examples never saves a copy`);

    /* Save a copy, then find it in Your work */
    await fileItem(page, 'Save a copy…');
    const save = page.locator('.recent-dialog');
    await save.waitFor();
    await save.getByLabel('Copy name').fill(name);
    await save.getByRole('button', {name: 'Save copy', exact: true}).click();
    await save.waitFor({state: 'detached'});
    ok((await copies(page)).length === 1 && (await copies(page))[0].tool === dir && (await copies(page))[0].name === name, `${dir}: Save a copy writes one mg:recent:v1 record for ${dir}`);
    ok((await status(page).textContent()).includes('Copy saved in Your work.'), `${dir}: the status line reports the save`);
    ok(await page.evaluate(() => document.activeElement === document.querySelector('[data-shell-file] summary')), `${dir}: focus returns to File after the save dialog closes`);
    await model.edit(page, 2);
    ok(await model.read(page) === 'two', `${dir}: the model moved on after saving`);
    {
      await stable(page);   // the edit above can still be settling (Flow's readouts); only the panel may move anything from here
      const t0 = Date.now(), before = await geometry(page);
      const d = await openPanel();
      ok(JSON.stringify(await sections(d)) === JSON.stringify(['Saved copies']), `${dir}: Your work shows a Saved copies section and omits the empty ones`);
      ok(await d.getByRole('link', {name: new RegExp(name)}).count() === 1, `${dir}: the saved copy is listed in Your work (panel opened in ${Date.now() - t0}ms including its first load)`);
      { const after = await geometry(page); ok(JSON.stringify(after) === JSON.stringify(before), `${dir}: opening Your work for the first time shifts nothing on the page (${JSON.stringify(before)} -> ${JSON.stringify(after)})`); }
      ok((await d.boundingBox()).width <= size.width, `${dir}: the panel fits the viewport`);
      ok(await d.getByRole('link', {name: 'See all your work'}).getAttribute('href') === '/#recent-work', `${dir}: the panel links on to the catalogue's Your work`);
      await d.getByRole('link', {name: new RegExp(name)}).click();
      await reload();
      ok(await until(async () => await model.read(page) === 'one', {timeout: 8000}), `${dir}: opening the saved copy from Your work restores its model`);
    }

    /* Empty Your work in a fresh browser */
    {
      const fresh = await open(dir, laptopOpts);
      await fileItem(fresh.page, 'Your work…');
      await fresh.page.getByRole('dialog', {name: panelName}).waitFor();
      const text = await fresh.page.getByRole('dialog', {name: panelName}).locator('p.recent-note').allTextContents();
      const want = `Nothing saved for ${entry.name} yet. Save a copy from the File menu to keep this model.`;
      ok(text.filter(t => t).length === 1 && text.join('') === want, `${dir}: an empty Your work says so in one sentence (${JSON.stringify(text.join(''))})`);
      await fresh.page.keyboard.press('Escape');
      ok(await fresh.page.evaluate(() => document.activeElement === document.querySelector('[data-shell-file] summary')), `${dir}: closing Your work returns focus to File`);
      await fresh.context.close();
    }

    /* Templates live in Your work only */
    if(entry.templates){
      if(!entry.new){
        /* no template and no blank start: New from template… opens Your work at Templates and says what to do */
        await fileItem(page, 'New from template…');
        const d = await panel().waitFor().then(() => panel());
        ok(!(await page.locator('.mg-template-dialog').count()), `${dir}: New from template… never opens the legacy templates manager`);
        ok(JSON.stringify(await sections(d)) === JSON.stringify(['Saved copies', 'Templates']) && (await d.textContent()).includes('No templates yet. Choose Save as template… in the File menu'), `${dir}: with no templates, New from template… opens Your work at Templates and names Save as template…`);
        const inView = await d.locator('h3', {hasText: 'Templates'}).evaluate(h => { const r = h.getBoundingClientRect(), b = h.closest('.tool-work-body').getBoundingClientRect(); return r.top >= b.top && r.bottom <= b.bottom; });
        ok(inView, `${dir}: the Templates section is in view`);
        await page.keyboard.press('Escape');
      }
      await model.edit(page, 2);
      await fileItem(page, 'Save as template…');
      const tpl = page.locator('.mg-template-dialog');
      await tpl.waitFor();
      ok(await tpl.getByRole('heading', {name: 'Save as template'}).count() === 1 && await tpl.getByRole('textbox').count() === 1 && !(await tpl.getByRole('button', {name: 'Make default'}).count()), `${dir}: Save as template… asks for a name and nothing else`);
      await tpl.getByLabel('Template name').fill('Weekly shape');
      await tpl.getByRole('button', {name: 'Save template', exact: true}).click();
      await tpl.waitFor({state: 'detached'});
      ok((await templates(page)).length === 1 && (await templates(page))[0].name === 'Weekly shape', `${dir}: Save as template… stores one template`);
      ok((await status(page).textContent()).includes('Template saved in Your work.') && !(await page.locator('.mg-template-dialog').count()), `${dir}: saving reports "Template saved in Your work." and opens no legacy manager`);
      await model.edit(page, 1);
      const d = await openPanel();
      ok(JSON.stringify(await sections(d)) === JSON.stringify(['Saved copies', 'Templates']), `${dir}: the template appears under Templates, after Saved copies`);
      /* Start from the panel */
      await d.getByRole('button', {name: 'Start from Weekly shape', exact: true}).click();
      await reload();
      ok(await until(async () => await model.read(page) === 'two', {timeout: 8000}), `${dir}: Start in Your work starts the template`);
      const d2 = await openPanel();
      const clearName = entry.new ? 'Use blank as default' : 'Clear default';
      ok(!(await d2.getByRole('button', {name: clearName}).count()), `${dir}: no ${clearName} while no default is set`);
      await d2.getByRole('button', {name: 'Make Weekly shape the default', exact: true}).click();
      ok(await d2.getByRole('button', {name: 'Default', exact: true}).isDisabled() && await d2.getByRole('button', {name: clearName, exact: true}).count() === 1, `${dir}: Make default marks it Default and offers ${clearName}`);
      ok(await focusHeld(page), `${dir}: focus stays in Your work after Make default`);
      await d2.getByRole('button', {name: 'Rename Weekly shape', exact: true}).click();
      await d2.getByLabel('Template name').fill('Monday shape'); await d2.getByRole('button', {name: 'Save name', exact: true}).click();
      await d2.getByText('Monday shape', {exact: true}).waitFor();
      ok((await templates(page))[0].name === 'Monday shape' && await focusHeld(page), `${dir}: renaming a template writes through and keeps focus in the dialog`);
      await page.keyboard.press('Escape');
      /* a default is honoured by New / New from template… and keeps the outgoing model */
      await model.edit(page, 3);   // a third state, so the outgoing model is not a copy that already exists
      const had = (await copies(page)).length;
      if(entry.new) await fileItem(page, 'New'); else await fileItem(page, 'New from template…');
      await reload();
      ok(await until(async () => await model.read(page) === 'two', {timeout: 8000}), `${dir}: ${entry.new ? 'New' : 'New from template…'} starts the default template`);
      ok((await copies(page)).length === had + 1, `${dir}: starting from the default keeps the outgoing model as a saved copy`);
      /* clearing the default, then deleting */
      const d3 = await openPanel();
      await d3.getByRole('button', {name: clearName, exact: true}).click();
      ok(await until(() => page.evaluate(() => localStorage.getItem('mg:template-default:v1:tools:' + location.pathname.split('/')[1]) === null)) && await focusHeld(page), `${dir}: ${clearName} removes the default and focus stays in the dialog`);
      await d3.getByRole('button', {name: 'Delete Monday shape', exact: true}).click();
      await d3.getByRole('button', {name: 'Delete template', exact: true}).click();
      await until(async () => (await templates(page)).length === 0);
      ok((await templates(page)).length === 0 && await focusHeld(page), `${dir}: deleting a template in Your work removes it and keeps focus in the dialog`);
      await page.keyboard.press('Escape');
      if(entry.new){
        await model.edit(page, 2);
        await fileItem(page, 'New');
        ok(await until(async () => model.isBlank ? await model.isBlank(page) : await model.read(page) === 'other', {timeout: 6000}), `${dir}: with no default, New starts the page's own blank model`);
      }
    } else {
      ok(!(await page.locator('[data-act=template]').count()), `${dir}: no Save as template… where the manifest grants no templates`);
      ok(!(await page.locator('[data-act=new-template]').count()), `${dir}: no New from template… where the manifest grants no templates`);
      if(entry.new){
        await model.edit(page, 2);
        await fileItem(page, 'New');
        ok(await until(async () => model.isBlank ? await model.isBlank(page) : await model.read(page) === 'other', {timeout: 6000}), `${dir}: New starts the page's own blank model`);
      } else ok(!(await page.locator('[data-act=new]').count()), `${dir}: no New where the manifest grants no blank start`);
    }

    /* Examples: each one loads as it did from the old chip, and choosing it closes the menu */
    if(entry.examples){
      const wanted = EXAMPLE_NAMES[dir];
      await model.edit(page, 1);
      await fileItem(page, 'Examples');
      const names2 = await page.locator('[data-shell-examples-list] button').allTextContents();
      ok(JSON.stringify([...names2].sort()) === JSON.stringify([...wanted].sort()), `${dir}: Examples lists exactly the tool's examples [${wanted.join(' | ')}] (got [${names2.join(' | ')}])`);
      await page.keyboard.press('Escape');
      const label = n => ['', 'one', 'two', 'three'][n];
      for(const example of wanted){
        /* start from a model that is not this example (Roadmap's edit() is itself an example) */
        const from = [1, 2, 3].find(n => model.exampleFor?.[n] !== example) ?? 1;
        await model.edit(page, from);
        ok(await model.read(page) === label(from), `${dir}: before "${example}" the model is the one we set (${label(from)})`);
        await fileItem(page, 'Examples');
        await page.getByRole('button', {name: example, exact: true}).click();
        /* where an example is also an edit() state, its label is known; elsewhere it must at least replace the model */
        const known = model.exampleFor ? label(Object.keys(model.exampleFor).find(n => model.exampleFor[n] === example)) : null;
        const loaded = await until(async () => known ? await model.read(page) === known : await model.read(page) !== label(from), {timeout: 6000});
        ok(loaded && !(await page.locator('[data-shell-file] .tool-menu').isVisible()), `${dir}: choosing "${example}" replaces the model${known ? ' with ' + known : ''} and closes File`);
      }
    }
    ok(errors.length === 0, `${dir}: no console errors through the item flows (${errors.join(' | ').slice(0, 160)})`);
    await context.close();
  }

  /* ---- Your work: rows, focus, order, legacy stores (laptop, seeded) ---- */
  {
    const context = await browser.newContext(laptopOpts), page = await context.newPage(), errors = trackErrors(page);
    await context.addInitScript(({dir, legacy, withTemplate, seed}) => {
      if(localStorage.getItem('__seeded')) return;
      localStorage.setItem('__seeded', '1');
      const rec = (id, name, ago) => localStorage.setItem('mg:recent:v1:tools:' + id, JSON.stringify({v: 1, scope: 'tools', id, tool: dir, name, hash: 'e30', savedAt: Date.now() - ago}));
      rec('alpha', 'Alpha copy', 3000); rec('beta', 'Beta copy', 2000); rec('gamma', 'Gamma copy', 1000);
      if(withTemplate) localStorage.setItem('mg:template:v1:tools:' + dir + ':t1', JSON.stringify({v: 1, scope: 'tools', tool: dir, id: 't1', name: 'Seeded shape', format: 'model-link', content: 'e30', savedAt: Date.now()}));
      for(const [key, value] of seed) localStorage.setItem(key, value);
      if(legacy === 'fermi') localStorage.setItem('fermi-models', JSON.stringify([
        {name: 'Legacy piano', f: 'a * b', v: {a: ['10', '20', 'auto'], b: ['3', '5', 'auto']}, q: 'Legacy question one'},
        {name: 'Legacy lamps', f: 'a * b', v: {a: ['5', '9', 'auto'], b: ['2', '4', 'auto']}, q: 'Legacy question two'}]));
    }, {dir, legacy: dir === 'fermi' ? dir : '', withTemplate: entry.templates, seed: LEGACY[dir] ? [[LEGACY[dir].key, JSON.stringify(LEGACY[dir].items)], ...(LEGACY[dir].baseline ? [[LEGACY[dir].baseline, JSON.stringify([{label: '2026-09-01 — baseline', src: 'title: baseline-one\n'}])]] : [])] : []});
    await page.goto(T + '/' + dir + '/', {waitUntil: 'networkidle'}); await ready(page);
    const panelName = 'Your work in ' + entry.name, panel = () => page.getByRole('dialog', {name: panelName});
    const openPanel = async () => { await fileItem(page, 'Your work…'); const d = panel(); await d.waitFor(); return d; };
    const manage = async (d, who, action) => { await d.getByLabel('Manage ' + who, {exact: true}).click(); await d.getByRole('button', {name: action + ' ' + who, exact: true}).click(); };
    const stored = () => copies(page);
    let d = await openPanel();
    const rowNames = () => d.locator('section[data-sec=copies] .recent-name').allTextContents();
    const seededOrder = ['Gamma copy', 'Beta copy', 'Alpha copy', ...(LEGACY[dir]?.names ?? []), ...(dir === 'fermi' ? ['Legacy lamps', 'Legacy piano'] : [])];
    ok(JSON.stringify(await rowNames()) === JSON.stringify(seededOrder), `${dir}: Your work lists the seeded and legacy copies, newest first, legacy after (${(await rowNames()).join(', ')})`);

    /* Pin keeps focus on the row's control */
    await manage(d, 'Beta copy', 'Pin');
    ok(await focusHeld(page) && (await rowNames())[0] === '★ Beta copy', `${dir}: Pin floats the row to the top and focus stays in the dialog`);
    /* Archive creates an Archived section */
    await manage(d, 'Alpha copy', 'Archive');
    ok((await sectionTitles(d)).includes('Archived') && await focusHeld(page), `${dir}: Archive moves a copy under Archived and focus stays in the dialog`);
    await manage(d, 'Alpha copy', 'Restore');
    ok(!(await sectionTitles(d)).includes('Archived') && await focusHeld(page), `${dir}: Restore brings it back`);
    await manage(d, 'Alpha copy', 'Archive');
    const order = await sectionTitles(d);
    const wantOrder = ['Saved copies', ...(entry.templates ? ['Templates'] : []), ...(LEGACY[dir]?.baseline ? ['Comparison baselines'] : []), 'Archived'];
    ok(JSON.stringify(order) === JSON.stringify(wantOrder), `${dir}: sections read ${wantOrder.join(' > ')} (got ${order.join(' > ')})`);
    /* Rename: a nested dialog opens and closes; focus must come back inside */
    await d.getByLabel('Manage Gamma copy', {exact: true}).click();
    await d.getByRole('button', {name: 'Rename Gamma copy', exact: true}).click();
    await page.locator('.recent-dialog:not(.tool-work)').getByLabel('Copy name').fill('Gamma renamed');
    await page.locator('.recent-dialog:not(.tool-work)').getByRole('button', {name: 'Save name', exact: true}).click();
    await page.locator('.recent-dialog:not(.tool-work)').waitFor({state: 'detached'});
    ok((await stored()).some(r => r.name === 'Gamma renamed') && await focusHeld(page), `${dir}: Rename writes through and focus returns into Your work after the nested dialog closes`);
    /* Remove: the row goes, focus moves to the next row */
    await d.getByLabel('Manage Gamma renamed', {exact: true}).click();
    await d.getByRole('button', {name: 'Remove Gamma renamed', exact: true}).click();
    await page.locator('.recent-dialog:not(.tool-work)').getByRole('button', {name: 'Remove copy', exact: true}).click();
    await page.locator('.recent-dialog:not(.tool-work)').waitFor({state: 'detached'});
    ok(!(await stored()).some(r => r.name === 'Gamma renamed') && await focusHeld(page), `${dir}: Remove deletes the copy and focus stays in the dialog (${await page.evaluate(() => document.activeElement.getAttribute('aria-label') || document.activeElement.textContent.slice(0, 20))})`);

    if(LEGACY[dir]){
      const legacy = LEGACY[dir];
      if(legacy.baseline) ok(await d.locator('section[data-sec=baselines] a').getAttribute('href').then(h => /\?baseline=/.test(h)), `${dir}: a comparison baseline opens in History by link`);
      await d.getByLabel('Manage ' + legacy.names[0], {exact: true}).click();
      await d.getByRole('button', {name: 'Remove ' + legacy.names[0], exact: true}).click();
      await page.locator('.recent-dialog:not(.tool-work)').getByRole('button', {name: 'Remove copy', exact: true}).click();
      await page.locator('.recent-dialog:not(.tool-work)').waitFor({state: 'detached'});
      const left = await page.evaluate(key => JSON.parse(localStorage.getItem(key)), legacy.key);
      ok(left.length === 1 && left[0].name === legacy.names[1] && await focusHeld(page), `${dir}: removing a legacy ${legacy.key} copy rewrites the store (left: ${left.map(l => l.name)})`);
      /* the survivor opens: this page reloads on it */
      await d.getByRole('link', {name: new RegExp(legacy.names[1])}).click();
      await page.waitForLoadState('networkidle'); await ready(page);
      ok(await until(async () => await model.read(page) === 'legacy-two', {timeout: 8000}), `${dir}: a legacy ${legacy.key} copy opens from Your work with its source (read ${await model.read(page)})`);
    }
    if(dir === 'fermi'){
      /* open a legacy estimate while the page is in cashflow mode: it reloads into the estimate */
      await page.keyboard.press('Escape');
      await page.locator('#modecf').click();
      ok(await page.locator('#modecf').getAttribute('aria-selected') === 'true', `${dir}: the page is in cashflow mode before opening a legacy estimate`);
      d = await openPanel();
      await d.getByRole('link', {name: /Legacy piano/}).click();
      await page.waitForLoadState('networkidle'); await ready(page);
      ok(await until(async () => await page.locator('#estimatequestion').inputValue() === 'Legacy question one' && await page.locator('#modeest').getAttribute('aria-selected') === 'true', {timeout: 8000}), `${dir}: a legacy fermi-models item opens in estimate mode with its question`);
      d = await openPanel();
      await d.getByLabel('Manage Legacy lamps', {exact: true}).click();
      await d.getByRole('button', {name: 'Remove Legacy lamps', exact: true}).click();
      await page.locator('.recent-dialog:not(.tool-work)').getByRole('button', {name: 'Remove copy', exact: true}).click();
      await page.locator('.recent-dialog:not(.tool-work)').waitFor({state: 'detached'});
      const left = await page.evaluate(() => JSON.parse(localStorage.getItem('fermi-models')));
      ok(left.length === 1 && left[0].name === 'Legacy piano', `${dir}: removing a legacy fermi-models item rewrites the store (left: ${left.map(l => l.name)})`);
    }
    ok(errors.length === 0, `${dir}: no console errors in Your work (${errors.join(' | ').slice(0, 120)})`);
    await context.close();
  }

  /* ---- Your work with 30 copies and 20 templates, on small phones ---- */
  for(const width of [375, 320]){
    const context = await browser.newContext({viewport: {width, height: 568}, hasTouch: true, isMobile: true, deviceScaleFactor: 1, reducedMotion: 'reduce', serviceWorkers: 'block'}), page = await context.newPage();
    await context.addInitScript(({dir, withTemplate}) => {
      if(localStorage.getItem('__seeded')) return;
      localStorage.setItem('__seeded', '1');
      for(let i = 0; i < 30; i++) localStorage.setItem('mg:recent:v1:tools:c' + i, JSON.stringify({v: 1, scope: 'tools', id: 'c' + i, tool: dir, name: 'Copy number ' + i, hash: 'e30', savedAt: Date.now() - i * 1000}));
      if(withTemplate) for(let i = 0; i < 20; i++) localStorage.setItem('mg:template:v1:tools:' + dir + ':t' + i, JSON.stringify({v: 1, scope: 'tools', tool: dir, id: 't' + i, name: 'Template ' + i, format: 'model-link', content: 'e30', savedAt: Date.now() - i * 1000}));
    }, {dir, withTemplate: entry.templates});
    await page.goto(T + '/' + dir + '/', {waitUntil: 'networkidle'}); await ready(page);
    await page.locator('[data-shell-file] summary').tap();
    await page.locator('[data-act=work]').tap();
    const d = page.getByRole('dialog', {name: 'Your work in ' + entry.name}); await d.waitFor();
    const m = await page.evaluate(() => {
      const dlg = document.querySelector('dialog.tool-work'), body = dlg.querySelector('.tool-work-body'), close = [...dlg.querySelectorAll('button')].find(b => b.textContent === 'Close').getBoundingClientRect();
      /* the body, not the page or the dialog, is what scrolls: it takes a scroll offset and Close does not move */
      const before = close.top; body.scrollTop = 400;
      const after = [...dlg.querySelectorAll('button')].find(b => b.textContent === 'Close').getBoundingClientRect().top;
      return {top: close.top, bottom: close.bottom, vh: innerHeight, scrolls: body.scrollTop > 0 && getComputedStyle(body).overflowY === 'auto', pinned: before === after, pageScroll: scrollY, dh: dlg.getBoundingClientRect().height};
    });
    ok(m.top >= 0 && m.bottom <= m.vh && m.scrolls && m.pinned, `${dir} @${width}x568: Close is on screen without scrolling (${Math.round(m.top)}-${Math.round(m.bottom)} of ${m.vh}), stays put while the body scrolls`);
    await page.touchscreen.tap(3, 3);
    ok(await d.count() === 0, `${dir} @${width}x568: tapping the backdrop closes Your work`);
    await page.locator('[data-shell-file] summary').tap(); await page.locator('[data-act=work]').tap(); await d.waitFor();
    await page.keyboard.press('Escape');
    ok(await d.count() === 0, `${dir} @${width}x568: Escape still closes it`);
    await context.close();
  }

  /* ---- templates: a default pointing nowhere, and unreadable templates ---- */
  if(entry.templates){
    const {context, page} = await open(dir, laptopOpts);
    await page.evaluate(({dir}) => { localStorage.setItem('mg:template-default:v1:tools:' + dir, 'ghost'); localStorage.setItem('mg:template:v1:tools:' + dir + ':bad', '{broken'); }, {dir});
    await fileItem(page, 'Your work…');
    const d = page.getByRole('dialog', {name: 'Your work in ' + entry.name}); await d.waitFor();
    const text = await d.textContent(), clear = entry.new ? 'Use blank as default' : 'Clear default';
    ok(text.includes('The default template is unavailable. Choose another default in Your work, or start blank.') && !text.includes('in Templates'), `${dir}: a default that points at a missing template says so, in Your work's words`);
    ok(text.includes('1 unreadable template kept for recovery. Export a browser backup before replacing any data.'), `${dir}: Your work reports unreadable templates`);
    await d.getByRole('button', {name: clear, exact: true}).click();
    ok(await until(() => page.evaluate(({dir}) => localStorage.getItem('mg:template-default:v1:tools:' + dir) === null, {dir})) && !(await d.textContent()).includes('unavailable'), `${dir}: ${clear} clears a default that points nowhere, with no templates listed`);
    await context.close();
  }

  /* ---- storage trouble, drafts and the copy limit ---- */
  {
    const {context, page} = await open(dir, laptopOpts);
    await page.evaluate(() => { Storage.prototype.getItem = () => { throw new DOMException('blocked', 'SecurityError'); }; });
    await fileItem(page, 'Your work…');
    const d = page.getByRole('dialog', {name: 'Your work in ' + entry.name}); await d.waitFor();
    const text = await d.textContent();
    ok(text.split('Browser storage is unavailable').length - 1 === 1, `${dir}: with storage unavailable the message appears once (${text.split('Browser storage is unavailable').length - 1} times)`);
    await context.close();
  }
  if(SOURCE_TOOLS.includes(dir)){
    const context = await browser.newContext(laptopOpts), page = await context.newPage();
    await context.addInitScript(({dir}) => { if(!localStorage.getItem(dir + '-src') && !localStorage.getItem('__seeded')){ localStorage.setItem('__seeded', '1'); localStorage.setItem(dir + '-src', 'title: Mine\n'); } }, {dir});
    await page.goto(T + '/' + dir + '/', {waitUntil: 'networkidle'}); await ready(page);
    await fileItem(page, 'Your work…');
    const d = page.getByRole('dialog', {name: 'Your work in ' + entry.name}); await d.waitFor();
    ok((await d.textContent()).includes(`No saved copies of ${entry.name} yet. Your draft is kept in this browser as you work.`), `${dir}: with a draft but no copies, Your work says the draft is kept`);
    await context.close();
  }
  {
    const context = await browser.newContext(laptopOpts), page = await context.newPage();
    await context.addInitScript(({dir}) => { if(localStorage.getItem('__seeded')) return; localStorage.setItem('__seeded', '1'); for(let i = 0; i < 20; i++) localStorage.setItem('mg:recent:v1:tools:full' + i, JSON.stringify({v: 1, scope: 'tools', id: 'full' + i, tool: dir, name: 'Full ' + i, hash: 'e30', savedAt: Date.now() - i})); }, {dir});
    await page.goto(T + '/' + dir + '/', {waitUntil: 'networkidle'}); await ready(page);
    await fileItem(page, 'Save a copy…');
    const dlg = page.locator('.recent-dialog'); await dlg.waitFor();
    await dlg.getByRole('button', {name: 'Save copy', exact: true}).click();
    ok((await dlg.getByRole('alert').textContent()).includes('Remove one in Your work before saving another.'), `${dir}: the 20-copy limit tells you to remove one in Your work`);
    await context.close();
  }

  /* ---- a control that cannot work says so: shell script or page script never arrives ---- */
  for(const [label, pattern] of [['the shell module is blocked', '**/assets/tool-shell.js'], ['the page script is blocked', `**/${dir}/app.js`]]){
    const context = await browser.newContext(phoneOpts), page = await context.newPage();
    await page.route(pattern, route => route.abort());
    await page.goto(T + '/' + dir + '/', {waitUntil: 'domcontentloaded'});
    await page.locator('[data-shell-row]').waitFor();
    await page.waitForTimeout(1200);
    const early = await page.evaluate(() => ({ready: document.querySelector('[data-tool-header]').hasAttribute('data-shell-ready'),
      enabled: [...document.querySelectorAll('[data-shell-row] button[data-act]')].filter(b => !b.disabled).map(b => b.dataset.act),
      shareOpacity: getComputedStyle(document.querySelector('.tool-share')).opacity}));
    const wantEnabled = pattern.includes('tool-shell') ? [] : ['work'];
    ok(!early.ready && JSON.stringify(early.enabled) === JSON.stringify(wantEnabled), `${dir} (${label}): never ready; enabled controls [${early.enabled}] want [${wantEnabled}]`);
    ok(early.shareOpacity === '1', `${dir} (${label}): inside the first four seconds a disabled Share is not dimmed (opacity ${early.shareOpacity})`);
    /* the four-second contract is the CSS delay itself, so wait it out */
    await page.waitForTimeout(3600);
    await page.locator('[data-shell-file] summary').tap();
    const late = await page.evaluate(() => ({share: getComputedStyle(document.querySelector('.tool-share')).opacity, stalled: document.querySelector('.tool-stalled').getBoundingClientRect().height > 0, text: document.querySelector('.tool-stalled').textContent,
      item: getComputedStyle(document.querySelector('[data-act=save]')).opacity}));
    ok(late.share === '0.5' && late.item === '0.5', `${dir} (${label}): after four seconds disabled controls dim (Share ${late.share}, Save ${late.item})`);
    ok(late.stalled && late.text === 'This page did not finish loading. Reload to save or share.', `${dir} (${label}): the menu says the page did not finish loading`);
    if(wantEnabled.length){
      await page.waitForFunction(() => document.querySelector('[data-shell-file] .tool-menu').contains(document.activeElement));
      const first = await page.evaluate(() => document.activeElement.textContent.trim());
      await page.keyboard.press('ArrowDown');
      const next = await page.evaluate(() => document.activeElement.textContent.trim());
      ok(first === 'Your work…' && next === 'Backup & restore', `${dir} (${label}): arrow keys skip disabled items (${first} -> ${next})`);
    }
    await context.close();
  }
  {
    const {context, page} = await open(dir, phoneOpts);
    await page.waitForTimeout(4600);
    await page.locator('[data-shell-file] summary').tap();
    const calm = await page.evaluate(() => ({stalled: document.querySelector('.tool-stalled').getBoundingClientRect().height > 0, disabled: [...document.querySelectorAll('[data-shell-row] button[data-act]')].filter(b => b.disabled).length, shareOpacity: getComputedStyle(document.querySelector('.tool-share')).opacity}));
    ok(!calm.stalled && calm.disabled === 0 && calm.shareOpacity === '1', `${dir}: a page that became ready never shows the stalled line or dims (disabled ${calm.disabled}, stalled ${calm.stalled})`);
    await context.close();
  }

  /* ---- provide(): undefined never overwrites, an empty example list never counts ---- */
  {
    const {context, page} = await open(dir, laptopOpts);
    await page.evaluate(() => { const r = document.querySelector('[data-shell-row]'); (r.shellOffers ??= []).push({save: undefined, getState: undefined, getHash: undefined, templates: undefined, blank: undefined, examples: []}); r.dispatchEvent(new Event('shell-offer')); });
    const after = await page.evaluate(() => ({ready: document.querySelector('[data-tool-header]').hasAttribute('data-shell-ready'), off: [...document.querySelectorAll('[data-shell-row] button[data-act]')].filter(b => b.disabled).map(b => b.dataset.act)}));
    ok(after.ready && after.off.length === 0, `${dir}: an undefined or empty offer leaves every capability in place (disabled: [${after.off}])`);
    await context.close();
  }

  /* ---- opening File closes other popovers, and the reverse (Roadmap's Appearance) ---- */
  if(dir === 'roadmap'){
    const {context, page} = await open(dir, laptopOpts);
    const appearance = page.locator('#appearance'), file = page.locator('[data-shell-file]');
    await appearance.locator('summary').click();
    ok(await appearance.evaluate(el => el.open), `${dir}: Appearance opens`);
    await file.locator('summary').click();
    ok(await until(async () => await file.evaluate(el => el.open) && !(await appearance.evaluate(el => el.open))), `${dir}: opening File closes Appearance`);
    /* the toggle itself (not a click or focus move) must close File: open Appearance in code while File is open */
    await appearance.evaluate(el => { el.open = true; });
    ok(await until(async () => !(await file.evaluate(el => el.open)) && await appearance.evaluate(el => el.open)), `${dir}: opening Appearance closes File`);
    await context.close();
  }

  /* ---- Share refuses a model that cannot travel in a link ---- */
  if(dir === 'roadmap'){
    const context = await browser.newContext(laptopOpts), page = await context.newPage();
    await context.grantPermissions(['clipboard-read', 'clipboard-write'], {origin: T}).catch(() => {});
    await context.addInitScript(() => { if(localStorage.getItem('__seeded')) return; localStorage.setItem('__seeded', '1');
      let text = 'title: Huge\nNOW\n'; for(let i = 0; i < 700; i++) text += 'Lane' + (i % 5) + ': ' + Array.from({length: 36}, () => Math.random().toString(36)[2]).join('') + '\n';
      localStorage.setItem('roadmap-src', text); });
    await page.goto(T + '/roadmap/', {waitUntil: 'networkidle'}); await ready(page);
    await page.evaluate(() => navigator.clipboard.writeText('sentinel'));
    await page.locator('[data-act=share]').click();
    await until(async () => (await status(page).textContent()).length > 0);
    ok((await status(page).textContent()) === 'This model is too large for a link. Export the source instead.' && await page.evaluate(() => navigator.clipboard.readText()) === 'sentinel', `${dir}: a model too long for a link is refused and nothing is copied`);
    await context.close();
  }

  /* ---- Share: the link carries the whole model and ignores location.hash ---- */
  {
    const {context, page} = await open(dir, laptopOpts);
    await model.edit(page, 1);
    /* a stale hash must not be what Share copies */
    await page.evaluate(() => history.replaceState(null, '', '#stale-garbage'));
    await page.locator('[data-act=share]').click();
    await until(async () => (await status(page).textContent()).length > 0);
    const message = await status(page).textContent();
    ok(message === 'Link copied. It opens as a separate copy.', `${dir}: Share reports in the header status line (${JSON.stringify(message)})`);
    const link = await page.evaluate(() => navigator.clipboard.readText());
    ok(link.startsWith(T + '/' + dir + '/#') && !link.includes('stale-garbage'), `${dir}: the copied link is built from the model, not location.hash (${link.slice(0, 60)}…)`);
    const fresh = await open(dir, laptopOpts, link);
    ok(await until(async () => await model.read(fresh.page) === 'one', {timeout: 8000}), `${dir}: the copied link reopens the same model in a fresh browser`);
    await fresh.context.close();
    /* the edit just made is in the link even though the URL has not caught up */
    await model.edit(page, 2);
    await page.locator('[data-act=share]').click();
    await until(async () => (await page.evaluate(() => navigator.clipboard.readText())) !== link);
    const link2 = await page.evaluate(() => navigator.clipboard.readText());
    const fresh2 = await open(dir, laptopOpts, link2);
    ok(await until(async () => await model.read(fresh2.page) === 'two', {timeout: 8000}), `${dir}: Share snapshots the model at click time`);
    await fresh2.context.close();
    /* a denied clipboard falls back to a dialog, and focus returns to Share */
    await page.evaluate(() => { navigator.clipboard.writeText = async () => { throw Error('Denied'); }; });
    await page.locator('[data-act=share]').click();
    const dialog = page.getByRole('dialog', {name: 'Share link'});
    await dialog.waitFor();
    ok(await dialog.getByRole('heading', {name: 'Share link'}).count() === 1 && (await dialog.locator('textarea').inputValue()).startsWith(T + '/' + dir + '/#'), `${dir}: a denied clipboard shows the link under a "Share link" heading`);
    await dialog.getByRole('button', {name: 'Done'}).click();
    ok(await until(() => page.evaluate(() => document.activeElement?.dataset.act === 'share')), `${dir}: closing the fallback returns focus to Share`);
    await context.close();
  }

  /* ---- offline: the Your work panel is fetched lazily, so it must be in the precache ---- */
  {
    const context = await browser.newContext({...laptopOpts, serviceWorkers: 'allow'}), page = await context.newPage();
    await page.goto(T + '/' + dir + '/', {waitUntil: 'networkidle'});
    await ready(page);
    const installed = await swInstalled(page);
    ok(installed, `${dir}: the service worker installs (if not: an integrity hash is stale, run npm run sync)`);
    if(!installed){ await context.close(); continue; }
    await page.reload({waitUntil: 'networkidle'});
    ok(await until(() => page.evaluate(() => !!navigator.serviceWorker.controller), {timeout: 15000}), `${dir}: the service worker controls the reloaded page before going offline`);
    ok(!(await page.evaluate(() => performance.getEntriesByType('resource').some(r => r.name.endsWith('/assets/tool-work.js')))), `${dir}: the Your work module is not fetched at page load`);
    await context.setOffline(true);
    await page.reload({waitUntil: 'domcontentloaded'});
    await ready(page);
    await fileItem(page, 'Your work…');
    const offlinePanel = page.getByRole('dialog', {name: 'Your work in ' + entry.name});
    await offlinePanel.waitFor({timeout: 8000});
    ok(await until(async () => (await offlinePanel.textContent()).includes('Nothing saved'), {timeout: 6000}), `${dir}: Your work opens offline from the precache`);
    await page.keyboard.press('Escape');
    if(entry.templates){
      await fileItem(page, 'Save as template…');
      await page.locator('.mg-template-dialog').waitFor({timeout: 8000});
      ok(await page.locator('.mg-template-dialog').getByLabel('Template name').isVisible(), `${dir}: Save as template… opens offline`);
    }
    await context.close();
  }

  /* ---- Share carries the whole model: Fermi's cashflow and Alarm's pinned claim ---- */
  if(dir === 'fermi'){
    const {context, page} = await open(dir, laptopOpts);
    await page.locator('#modecf').click();
    await page.getByRole('button', {name: 'Edit cashflows & assumptions', exact: true}).click();
    await page.waitForFunction(() => document.querySelector('#cfrows input') && document.activeElement?.closest('#cfrows'));
    await page.locator('#cfhorizon').fill('7');
    await page.locator('[data-act=share]').click();
    await until(async () => (await status(page).textContent()).length > 0);
    const link = await page.evaluate(() => navigator.clipboard.readText());
    const fresh = await open(dir, laptopOpts, link);
    ok(await until(async () => await fresh.page.locator('#modecf').getAttribute('aria-selected') === 'true' && await fresh.page.locator('#cfhorizon').inputValue() === '7', {timeout: 8000}), `${dir}: Share in cashflow mode reopens cashflow with its horizon`);
    await fresh.context.close(); await context.close();
  }
  if(dir === 'alarm'){
    const {context, page} = await open(dir, laptopOpts);
    await page.locator('#claimBtn').click();
    await page.locator('#claimSens').fill('95'); await page.locator('#claimSpec').fill('90');
    await page.locator('#claimApply').click();
    await page.locator('#claimChip').waitFor({state: 'visible'});
    const chip = await page.locator('#claimChip').textContent();
    await page.locator('[data-act=share]').click();
    await until(async () => (await status(page).textContent()).length > 0);
    const link = await page.evaluate(() => navigator.clipboard.readText());
    const fresh = await open(dir, laptopOpts, link);
    ok(await until(async () => await fresh.page.locator('#claimChip').isVisible() && await fresh.page.locator('#claimChip').textContent() === chip, {timeout: 8000}), `${dir}: Share with a pinned claim reopens with the claim (${chip.trim()})`);
    await fresh.context.close(); await context.close();
  }
  }catch(error){
    ok(false, `${dir}: stopped — ${String(error).split('\n')[0]}`);
    await closeLeftovers();
  }
}

/* ---- hand-off from provide() and the two mount functions, on a synthetic stamped page ---- */
if(!scope.focused && MODE === 'core'){
  scope.unscoped();
  const entry = {...SHELL_MANIFEST.why, shell: true};
  const fixture = script => `<!doctype html><html lang="en" data-mg-section="tools"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<script src="/assets/identity/theme-init.js"></script><link rel="stylesheet" href="/assets/identity/identity.css"><link rel="stylesheet" href="/assets/identity-tools.css">
<link rel="stylesheet" href="/assets/tool-shell.css"><script type="module" src="/assets/tool-shell.js"></script></head>
<body class="mg-site"><div class="wrap"><header data-tool-header data-shell><p class="kicker">Fixture</p>${shellRegion('why', entry)}</header>
<main id="main"><p id="log"></p>
<script type="module">
import {offer as provide} from '/assets/recent-ui.js';
import {mountModelLink} from '/assets/model-link.js';
const log = t => { document.getElementById('log').textContent += t + ';'; };
${script}
</script></main></div></body></html>`;
  {
  try{
    const html = fixture(`provide({blank: () => log('start'), examples: [{name: 'Alpha example', pick: () => log('alpha')}, {name: 'Beta example', pick: () => log('beta')}]});
mountModelLink({getState: () => ({t: 'fixture'})});`);
    const context = await browser.newContext(laptopOpts), page = await context.newPage(), errors = trackErrors(page);
    await context.route(T + '/why/', route => route.fulfill({contentType: 'text/html', body: html}));
    await page.goto(T + '/why/', {waitUntil: 'networkidle'});
    await ready(page);
    ok(!(await page.locator('.instrument-actions, .document-actions, .recent-save, button.model-link').count()), 'hand-off: provide() and mountModelLink put nothing into the page, only into File and Share');
    await fileItem(page, 'New');
    await openFileMenu(page);
    await page.locator('[data-act=examples]').click();
    ok(JSON.stringify(await page.locator('[data-shell-examples-list] button').allTextContents()) === JSON.stringify(['Alpha example', 'Beta example']), 'hand-off: File > Examples lists the page\'s own examples');
    await page.getByRole('button', {name: 'Beta example', exact: true}).click();
    ok(await page.locator('#log').textContent() === 'start;beta;', 'hand-off: New and an example run the page\'s own handlers (log ' + JSON.stringify(await page.locator('#log').textContent()) + ')');
    await page.locator('[data-act=share]').click();
    await until(async () => (await status(page).textContent()).includes('Link copied') || (await page.getByRole('dialog', {name: 'Share link'}).count()) > 0);
    ok(await status(page).textContent().then(t => t === 'Link copied. It opens as a separate copy.') || await page.getByRole('dialog', {name: 'Share link'}).count() === 1, 'hand-off: Share works from the state mountModelLink handed over');
    ok(errors.length === 0, 'hand-off: no console errors (' + errors.join(' | ').slice(0, 120) + ')');
    await context.close();
    }catch(error){ ok(false, `hand-off fixture: stopped — ${String(error).split('\n')[0]}`); await closeLeftovers(); }
  }
  /* the Your work panel is lazy: failing to load it and the panel itself throwing are different messages */
  for(const [label, mode, want] of [
    ['the module cannot be fetched', 'abort', 'Could not load that. Reload and try again.'],
    ['the panel throws while opening', 'throw', 'Something went wrong opening that.'],
  ]){
    try{
      const html = fixture(`provide({blank: () => log('start'), save: () => {}}); mountModelLink({getState: () => ({t: 'x'})});`);
      const context = await browser.newContext(laptopOpts), page = await context.newPage(), errors = trackErrors(page);
      await context.route(T + '/why/', route => route.fulfill({contentType: 'text/html', body: html}));
      await context.route('**/assets/tool-work.js', route => mode === 'abort' ? route.abort() : route.fulfill({contentType: 'text/javascript', body: 'export function openWork(){ throw new Error("boom"); } export function saveTemplate(){}'}));
      await page.goto(T + '/why/', {waitUntil: 'networkidle'});
      await page.waitForFunction(() => !document.querySelector('[data-act=work]').disabled);
      await fileItem(page, 'Your work…');
      await until(async () => (await status(page).textContent()).length > 0);
      const said = await status(page).textContent();
      ok(said === want, `lazy panel: when ${label}, the status says ${JSON.stringify(want)} (said ${JSON.stringify(said)})`);
      if(mode === 'throw') ok(errors.some(e => /boom/.test(e)), 'lazy panel: an error thrown by the panel reaches the console, not just the status line');
      await context.close();
    }catch(error){ ok(false, `lazy panel: ${label}: stopped — ${String(error).split('\n')[0]}`); await closeLeftovers(); }
  }
  for(const [label, script, want] of [
    ['a page whose link builder returns nothing', `provide({getHash: async () => ''}); mountModelLink({getState: () => ({t: 'x'})});`, 'This model is too large for a link. Export the source instead.'],
    ['a page whose link builder refuses with a reason', `provide({getHash: async () => { throw new Error('This thing is special. Copy it another way.'); }}); mountModelLink({getState: () => ({t: 'x'})});`, 'This thing is special. Copy it another way.'],
  ]){
    try{
    /* Share shows the page's own refusal, and treats a missing hash as too large rather than crashing */
    const context = await browser.newContext(laptopOpts), page = await context.newPage();
    await context.route(T + '/why/', route => route.fulfill({contentType: 'text/html', body: fixture(script)}));
    await page.goto(T + '/why/', {waitUntil: 'networkidle'});
    await page.waitForFunction(() => !document.querySelector('[data-act=share]').disabled);
    await page.locator('[data-act=share]').click();
    await until(async () => (await status(page).textContent()).length > 0);
    const said = await status(page).textContent();
    ok(said === want, `hand-off: Share with ${label} says ${JSON.stringify(want)} (said ${JSON.stringify(said)})`);
    await context.close();
    }catch(error){ ok(false, `hand-off: Share with ${label}: stopped — ${String(error).split('\n')[0]}`); await closeLeftovers(); }
  }
  {
  try{
    /* Energy hides its kicker on purpose (the E-series strip stands in); the shell must not un-hide it */
    const context = await browser.newContext(laptopOpts), page = await context.newPage();
    await page.goto(E + '/frequency/', {waitUntil: 'networkidle'});
    const kicker = await page.evaluate(() => ({display: getComputedStyle(document.querySelector('[data-tool-header] > .kicker')).display, shell: document.querySelector('[data-tool-header]').hasAttribute('data-shell'),
      css: [...document.styleSheets].some(sheet => (sheet.href || '').endsWith('/assets/tool-shell.css'))}));
    ok(kicker.shell && kicker.css && kicker.display === 'none', `energy origin: a stamped header keeps the kicker hidden (display ${kicker.display}, shell css loaded ${kicker.css})`);
    await context.close();
    }catch(error){ ok(false, `hand-off fixture: stopped — ${String(error).split('\n')[0]}`); await closeLeftovers(); }
  }
  {
  try{
    /* a page that offers no examples must not get an Examples capability from an empty list */
    const html = fixture(`provide({blank: () => log('start'), examples: []});
mountModelLink({getState: () => ({t: 'fixture'})});`);
    const context = await browser.newContext(laptopOpts), page = await context.newPage();
    await context.route(T + '/why/', route => route.fulfill({contentType: 'text/html', body: html}));
    await page.goto(T + '/why/', {waitUntil: 'networkidle'});
    await page.waitForFunction(() => document.querySelector('[data-act=save]') && !document.querySelector('[data-act=save]').disabled);
    ok(await page.locator('[data-act=examples]').isDisabled() && !(await page.locator('[data-tool-header][data-shell-ready]').count()), 'hand-off: an empty example list leaves Examples disabled and the header not ready');
    await context.close();
    }catch(error){ ok(false, `hand-off fixture: stopped — ${String(error).split('\n')[0]}`); await closeLeftovers(); }
  }
}

await browser.close();
/* Floor: per page, 4 anatomy x 2 sizes + keyboard + flows + share; plus the hand-off block. */
scope.report('tool-shell' + (MODE === 'core' ? '' : '-' + MODE), {pass, fail, min: SHELLS.length * (MODE === 'core' ? 55 : 10)});
