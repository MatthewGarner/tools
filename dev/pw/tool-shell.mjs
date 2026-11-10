/* The shared tool header (File menu, Share, Your work) on every stamped page.
   Real pointer, touch and keyboard input at phone and laptop size. Each check can
   fail: lists are compared whole against the manifest, never "contains", and every
   control is found by the name a person reads, so a missing or renamed item, an
   unwired action or a layout that shifts when the menu opens turns a line red. */
import {chromium} from 'playwright';
import {SHELL_MANIFEST, VIEWPORTS} from '../shell-manifest.mjs';
import {shellRegion} from '../sync-shell.mjs';
import {scopeFor} from './_scope.mjs';
import {until, trackErrors, openFileMenu, fileItem} from './_harness.mjs';
const scope = scopeFor('tool-shell.mjs');
const T = process.env.BASE || 'http://localhost:8087';

let pass = 0, fail = 0;
const ok = (c, m) => { scope.checked(); if(c){ pass++; console.log('PASS', m); } else { fail++; console.log('FAIL', m); } };
const SHELLS = Object.entries(SHELL_MANIFEST).filter(([, e]) => e.shell).map(([dir]) => dir);

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
    async edit(p, n){ await fileItem(p, 'Examples'); await p.getByRole('button', {name: n === 1 ? 'Quarterly view' : 'Simple (no lanes)', exact: true}).click(); },
    read: async p => { const t = await p.locator('.cm-content').textContent(); return t.includes('Platform Delivery Plan') ? 'one' : t.includes('Team roadmap') ? 'two' : 'other'; },
  },
  fermi: {
    async edit(p, n){
      const q = p.locator('#estimatequestion');
      if(!(await q.isVisible())) await p.getByRole('button', {name: 'Edit formula & ranges', exact: true}).click();
      await q.fill(n === 1 ? 'Estimate one' : 'Estimate two');
    },
    read: async p => { const v = await p.locator('#estimatequestion').inputValue(); return v === 'Estimate one' ? 'one' : v === 'Estimate two' ? 'two' : 'other'; },
  },
  alarm: {
    async edit(p, n){ await p.locator('#baseRate').fill(n === 1 ? '-1.2' : '-1.5'); },
    read: async p => { const v = await p.locator('#baseRate').inputValue(); return v === '-1.2' ? 'one' : v === '-1.5' ? 'two' : 'other'; },
  },
};
const ready = p => p.locator('[data-tool-header][data-shell-ready]').waitFor({state: 'attached', timeout: 15000});
const copies = p => p.evaluate(() => Object.keys(localStorage).filter(k => k.startsWith('mg:recent:v1:')).map(k => JSON.parse(localStorage.getItem(k))));
const templates = p => p.evaluate(() => Object.keys(localStorage).filter(k => k.startsWith('mg:template:v1:')).map(k => JSON.parse(localStorage.getItem(k))));
const status = p => p.locator('[data-tool-header] [role=status]');

const browser = await chromium.launch();
const phoneOpts = {viewport: VIEWPORTS.phone, hasTouch: true, isMobile: true, deviceScaleFactor: 1, reducedMotion: 'reduce', serviceWorkers: 'block'};
const laptopOpts = {viewport: VIEWPORTS.laptop, deviceScaleFactor: 1, reducedMotion: 'reduce', serviceWorkers: 'block'};
async function open(dir, opts, url = T + '/' + dir + '/'){
  const context = await browser.newContext(opts), page = await context.newPage(), errors = trackErrors(page);
  await context.grantPermissions(['clipboard-read', 'clipboard-write'], {origin: T}).catch(() => {});
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
  const entry = SHELL_MANIFEST[dir], names = menuNames(entry), model = MODEL[dir];
  ok(!!model, `${dir}: the suite knows how to edit and read this page's model`);

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
      ok(items.length >= 2 && items.every(([, h]) => h >= 44), `${where}: examples are ${items.length} targets of at least 44px (${items.map(i => i[0]).join(', ')})`);
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
    ok(await page.evaluate(() => document.activeElement.tagName === 'BUTTON' && !!document.activeElement.closest('.tool-menu')), `${dir}: End jumps to the last menu button`);
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
    const name = `${dir} saved copy`, state = await (async () => { await model.edit(page, 1); return model.read(page); })();
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
    await fileItem(page, 'Your work…');
    const panel = page.getByRole('dialog', {name: 'Your work in ' + entry.name});
    await panel.waitFor();
    ok(await panel.locator('h3').allTextContents().then(t => JSON.stringify(t) === JSON.stringify(['Saved copies'])), `${dir}: Your work shows a Saved copies section and omits the empty ones`);
    ok(await panel.getByRole('link', {name: new RegExp(name)}).count() === 1, `${dir}: the saved copy is listed in Your work`);
    ok((await panel.boundingBox()).width <= size.width, `${dir}: the panel fits the viewport`);
    ok(await panel.getByRole('link', {name: 'See all your work'}).getAttribute('href') === '/#recent-work', `${dir}: the panel links on to the catalogue's Your work`);
    await panel.getByRole('link', {name: new RegExp(name)}).click();
    await page.waitForLoadState('networkidle'); await ready(page);
    ok(await until(async () => await model.read(page) === 'one', {timeout: 8000}), `${dir}: opening the saved copy from Your work restores its model`);

    /* Empty Your work in a fresh browser */
    {
      const fresh = await open(dir, laptopOpts);
      await fileItem(fresh.page, 'Your work…');
      const text = await fresh.page.getByRole('dialog', {name: 'Your work in ' + entry.name}).locator('p.recent-note').allTextContents();
      ok(text.filter(t => t).length === 1 && text.join('') === `Nothing saved for ${entry.name} yet. Save a copy from the File menu to keep this model.`, `${dir}: an empty Your work says so in one sentence (${JSON.stringify(text.join(''))})`);
      await fresh.page.keyboard.press('Escape');
      ok(await fresh.page.evaluate(() => document.activeElement === document.querySelector('[data-shell-file] summary')), `${dir}: closing Your work returns focus to File`);
      await fresh.context.close();
    }

    /* Templates: Save as template…, then manage them in Your work */
    if(entry.templates){
      await fileItem(page, 'Save as template…');
      const tpl = page.locator('.mg-template-dialog');
      await tpl.getByLabel('Template name').fill('Weekly shape');
      await tpl.getByRole('button', {name: 'Save template', exact: true}).click();
      await tpl.getByRole('button', {name: 'Make default', exact: true}).waitFor();
      ok((await templates(page)).length === 1 && (await templates(page))[0].name === 'Weekly shape', `${dir}: Save as template… stores one template`);
      await tpl.getByRole('button', {name: 'Close', exact: true}).click();
      await fileItem(page, 'Your work…');
      const p2 = page.getByRole('dialog', {name: 'Your work in ' + entry.name});
      await p2.waitFor();
      ok(JSON.stringify(await p2.locator('h3').allTextContents()) === JSON.stringify(['Saved copies', 'Templates']), `${dir}: the template appears under Templates`);
      await p2.getByRole('button', {name: 'Make Weekly shape the default', exact: true}).click();
      ok(await p2.getByRole('button', {name: 'Default', exact: true}).isDisabled(), `${dir}: Make default marks it Default`);
      await p2.getByRole('button', {name: 'Rename Weekly shape', exact: true}).click();
      await p2.getByLabel('Template name').fill('Monday shape'); await p2.getByRole('button', {name: 'Save name', exact: true}).click();
      await p2.getByText('Monday shape', {exact: true}).waitFor();
      ok((await templates(page))[0].name === 'Monday shape', `${dir}: renaming a template in Your work writes through`);
      await p2.getByRole('button', {name: 'Delete Monday shape', exact: true}).click();
      await p2.getByRole('button', {name: 'Delete template', exact: true}).click();
      await until(async () => (await templates(page)).length === 0);
      ok((await templates(page)).length === 0, `${dir}: deleting a template in Your work removes it`);
      await page.keyboard.press('Escape');
    } else {
      ok(!(await page.locator('[data-act=template]').count()), `${dir}: no Save as template… where the manifest grants no templates`);
    }

    /* New / New from template */
    if(entry.new){
      await model.edit(page, 2);
      await fileItem(page, 'New');
      ok(await until(async () => await model.read(page) === 'other', {timeout: 6000}), `${dir}: New starts the page's own blank model`);
    } else if(entry.templates){
      await fileItem(page, 'New from template…');
      const manager = page.locator('.mg-template-dialog');
      await manager.waitFor();
      ok((await manager.textContent()).includes('Choose a template to start a new model.'), `${dir}: with no default template, New from template… opens the template list`);
      await manager.getByRole('button', {name: 'Close', exact: true}).click();
      /* with a default set, it starts that template and keeps the outgoing model as a saved copy */
      await model.edit(page, 1);
      await fileItem(page, 'Save as template…');
      const t2 = page.locator('.mg-template-dialog');
      await t2.getByLabel('Template name').fill('Starter'); await t2.getByRole('button', {name: 'Save template', exact: true}).click();
      await t2.getByRole('button', {name: 'Make default', exact: true}).click(); await t2.getByRole('button', {name: 'Close', exact: true}).click();
      await model.edit(page, 2);
      const had = (await copies(page)).length;
      await fileItem(page, 'New from template…');
      await page.waitForLoadState('networkidle'); await ready(page);
      ok(await until(async () => await model.read(page) === 'one', {timeout: 8000}), `${dir}: New from template… starts the default template`);
      ok((await copies(page)).length === had + 1, `${dir}: starting from a template keeps the outgoing model as a saved copy`);
    } else {
      ok(!(await page.locator('[data-act=new], [data-act=new-template]').count()), `${dir}: no New where the manifest grants neither a blank start nor templates`);
    }

    /* Examples: choosing one loads it and closes the menu */
    if(entry.examples){
      await fileItem(page, 'Examples');
      const names2 = await page.locator('[data-shell-examples-list] button').allTextContents();
      ok(names2.includes('Quarterly view') && names2.includes('Simple (no lanes)') && names2.includes('Reading app roadmap'), `${dir}: Examples lists the tool's examples (${names2.join(', ')})`);
      await page.getByRole('button', {name: 'Simple (no lanes)', exact: true}).click();
      ok(await until(async () => await model.read(page) === 'two', {timeout: 6000}), `${dir}: choosing an example loads it`);
      ok(!(await page.locator('[data-shell-file] .tool-menu').isVisible()), `${dir}: choosing an example closes the menu`);
    }
    ok(errors.length === 0, `${dir}: no console errors through the item flows (${errors.join(' | ').slice(0, 160)})`);
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
    ok(message.includes('Model link copied'), `${dir}: Share reports in the header status line (${JSON.stringify(message)})`);
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
    const dialog = page.getByRole('dialog', {name: 'Copy model link'});
    await dialog.waitFor();
    ok((await dialog.locator('textarea').inputValue()).startsWith(T + '/' + dir + '/#'), `${dir}: a denied clipboard shows the link to copy by hand`);
    await dialog.getByRole('button', {name: 'Done'}).click();
    ok(await until(() => page.evaluate(() => document.activeElement?.dataset.act === 'share')), `${dir}: closing the fallback returns focus to Share`);
    await context.close();
  }
}

/* ---- hand-off from the three mount functions, on a page that is not migrated ---- */
if(!scope.focused){
  scope.unscoped();
  {
    /* an unmigrated page still injects its own controls */
    const {context, page} = await (async () => { const context = await browser.newContext(laptopOpts), page = await context.newPage(); await page.goto(T + '/why/', {waitUntil: 'networkidle'}); return {context, page}; })();
    await page.locator('.recent-save').waitFor();
    ok(!(await page.locator('[data-shell-row]').count()) && await page.locator('[data-tool-header] .recent-save').count() === 1 && await page.locator('[data-tool-header] button.model-link').count() === 1,
      'unmigrated why: still injects Save a copy and Copy model link into its header');
    await context.close();
  }
  {
    /* a synthetic stamped page on the real modules: the three mount calls must hand over, not inject */
    const entry = {...SHELL_MANIFEST.why, shell: true};
    const html = `<!doctype html><html lang="en" data-mg-section="tools"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<script src="/assets/identity/theme-init.js"></script><link rel="stylesheet" href="/assets/identity/identity.css"><link rel="stylesheet" href="/assets/identity-tools.css">
<link rel="stylesheet" href="/assets/tool-shell.css"><script type="module" src="/assets/tool-shell.js"></script></head>
<body class="mg-site"><div class="wrap"><header data-tool-header data-shell><p class="kicker">Fixture</p>${shellRegion('why', entry)}</header>
<main id="main"><div id="chips" class="chips"><span class="lead">Try:</span><button class="chip start">Start your own</button><button class="chip" id="exa">Alpha example</button><button class="chip" id="exb">Beta example</button></div><p id="log"></p></main></div>
<script type="module">
import {mountDocumentStart} from '/assets/document-start.js';
import {mountModelLink} from '/assets/model-link.js';
const log = t => { document.getElementById('log').textContent += t + ';'; };
for(const [id, text] of [['exa', 'alpha'], ['exb', 'beta']]) document.getElementById(id).addEventListener('click', () => log(text));
document.querySelector('.start').addEventListener('click', () => log('start'));
window.returned = [mountDocumentStart(document.getElementById('chips')), mountModelLink(null, {getState: () => ({t: 'fixture'})})];
</script></body></html>`;
    const context = await browser.newContext(laptopOpts), page = await context.newPage(), errors = trackErrors(page);
    await context.route(T + '/why/', route => route.fulfill({contentType: 'text/html', body: html}));
    await page.goto(T + '/why/', {waitUntil: 'networkidle'});
    await ready(page);
    ok(await page.evaluate(() => window.returned.every(r => r === null)) && !(await page.locator('.instrument-actions, .document-actions, .recent-save, button.model-link').count()),
      'hand-off: mountDocumentStart and mountModelLink (with mountRecentSave) inject nothing into a stamped page');
    ok(!(await page.locator('#chips').isVisible()), 'hand-off: the page\'s own example row goes quiet');
    await fileItem(page, 'New');
    await openFileMenu(page);
    await page.locator('[data-act=examples]').click();
    ok(JSON.stringify(await page.locator('[data-shell-examples-list] button').allTextContents()) === JSON.stringify(['Alpha example', 'Beta example']), 'hand-off: File > Examples lists the page\'s own examples');
    await page.getByRole('button', {name: 'Beta example', exact: true}).click();
    ok(await page.locator('#log').textContent() === 'start;beta;', 'hand-off: New and an example run the page\'s own handlers (log ' + JSON.stringify(await page.locator('#log').textContent()) + ')');
    await page.locator('[data-act=share]').click();
    await until(async () => (await status(page).textContent()).includes('Model link copied') || (await page.getByRole('dialog', {name: 'Copy model link'}).count()) > 0);
    ok(await status(page).textContent().then(t => t.includes('Model link copied')) || await page.getByRole('dialog', {name: 'Copy model link'}).count() === 1, 'hand-off: Share works from the state mountModelLink was given');
    ok(errors.length === 0, 'hand-off: no console errors (' + errors.join(' | ').slice(0, 120) + ')');
    await context.close();
  }
}

await browser.close();
/* Floor: per page, 4 anatomy x 2 sizes + keyboard + flows + share; plus the hand-off block. */
scope.report('tool-shell', {pass, fail, min: SHELLS.length * 55});
