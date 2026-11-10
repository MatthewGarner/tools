/* The shared tool header (File menu, Share, Your work) on every stamped page.
   Real pointer, touch and keyboard input at phone and laptop size. Each check can
   fail: lists are compared whole against the manifest, never "contains", and every
   control is found by the name a person reads, so a missing or renamed item, an
   unwired action or a layout that shifts when the menu opens turns a line red. */
import {chromium} from 'playwright';
import {SHELL_MANIFEST, VIEWPORTS} from '../shell-manifest.mjs';
import {shellRegion, headBlock} from '../sync-shell.mjs';
import {checkInjectedModelLink} from './model-link-check.mjs';
import {scopeFor} from './_scope.mjs';
import {until, trackErrors, openFileMenu, fileItem} from './_harness.mjs';
const scope = scopeFor('tool-shell.mjs');
const T = process.env.BASE || 'http://localhost:8087';
const E = process.env.EBASE || 'http://localhost:8089';

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
    async edit(p, n){ await fileItem(p, 'Examples'); await p.getByRole('button', {name: n === 1 ? 'Quarterly view' : n === 2 ? 'Simple (no lanes)' : 'Reading app roadmap', exact: true}).click(); },
    read: async p => { const t = await p.locator('.cm-content').textContent(); return t.includes('Platform Delivery Plan') ? 'one' : t.includes('Team roadmap') ? 'two' : 'other'; },
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
      const t0 = Date.now(), before = await geometry(page);
      const d = await openPanel();
      ok(JSON.stringify(await sections(d)) === JSON.stringify(['Saved copies']), `${dir}: Your work shows a Saved copies section and omits the empty ones`);
      ok(await d.getByRole('link', {name: new RegExp(name)}).count() === 1, `${dir}: the saved copy is listed in Your work (panel opened in ${Date.now() - t0}ms including its first load)`);
      ok(JSON.stringify(await geometry(page)) === JSON.stringify(before), `${dir}: opening Your work for the first time shifts nothing on the page`);
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
        ok(await until(async () => await model.read(page) === 'other', {timeout: 6000}), `${dir}: with no default, New starts the page's own blank model`);
      }
    } else {
      ok(!(await page.locator('[data-act=template]').count()), `${dir}: no Save as template… where the manifest grants no templates`);
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

  /* ---- Your work: rows, focus, order, legacy stores (laptop, seeded) ---- */
  {
    const context = await browser.newContext(laptopOpts), page = await context.newPage(), errors = trackErrors(page);
    await context.addInitScript(({dir, legacy, withTemplate}) => {
      if(localStorage.getItem('__seeded')) return;
      localStorage.setItem('__seeded', '1');
      const rec = (id, name, ago) => localStorage.setItem('mg:recent:v1:tools:' + id, JSON.stringify({v: 1, scope: 'tools', id, tool: dir, name, hash: 'e30', savedAt: Date.now() - ago}));
      rec('alpha', 'Alpha copy', 3000); rec('beta', 'Beta copy', 2000); rec('gamma', 'Gamma copy', 1000);
      if(withTemplate) localStorage.setItem('mg:template:v1:tools:' + dir + ':t1', JSON.stringify({v: 1, scope: 'tools', tool: dir, id: 't1', name: 'Seeded shape', format: 'model-link', content: 'e30', savedAt: Date.now()}));
      if(legacy === 'roadmap'){
        localStorage.setItem('roadmap-saved', JSON.stringify([{name: 'Legacy plan one', src: 'title: One\nNOW\nA'}, {name: 'Legacy plan two', src: 'title: Two\nNOW\nB'}]));
        localStorage.setItem('roadmap-snaps', JSON.stringify([{label: '2026-09-01 — Q3 baseline', src: 'title: Q3\nNOW\nA'}]));
      }
      if(legacy === 'fermi') localStorage.setItem('fermi-models', JSON.stringify([
        {name: 'Legacy piano', f: 'a * b', v: {a: ['10', '20', 'auto'], b: ['3', '5', 'auto']}, q: 'Legacy question one'},
        {name: 'Legacy lamps', f: 'a * b', v: {a: ['5', '9', 'auto'], b: ['2', '4', 'auto']}, q: 'Legacy question two'}]));
    }, {dir, legacy: dir === 'roadmap' || dir === 'fermi' ? dir : '', withTemplate: entry.templates});
    await page.goto(T + '/' + dir + '/', {waitUntil: 'networkidle'}); await ready(page);
    const panelName = 'Your work in ' + entry.name, panel = () => page.getByRole('dialog', {name: panelName});
    const openPanel = async () => { await fileItem(page, 'Your work…'); const d = panel(); await d.waitFor(); return d; };
    const manage = async (d, who, action) => { await d.getByLabel('Manage ' + who, {exact: true}).click(); await d.getByRole('button', {name: action + ' ' + who, exact: true}).click(); };
    const stored = () => copies(page);
    let d = await openPanel();
    const rowNames = () => d.locator('section[data-sec=copies] .recent-name').allTextContents();
    const seededOrder = ['Gamma copy', 'Beta copy', 'Alpha copy', ...(dir === 'roadmap' ? ['Legacy plan one', 'Legacy plan two'] : []), ...(dir === 'fermi' ? ['Legacy lamps', 'Legacy piano'] : [])];
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
    const wantOrder = ['Saved copies', ...(entry.templates ? ['Templates'] : []), ...(dir === 'roadmap' ? ['Comparison baselines'] : []), 'Archived'];
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

    if(dir === 'roadmap'){
      ok(await d.locator('section[data-sec=baselines] a').getAttribute('href').then(h => /\?baseline=/.test(h)), `${dir}: a comparison baseline opens in History by link`);
      await d.getByLabel('Manage Legacy plan one', {exact: true}).click();
      await d.getByRole('button', {name: 'Remove Legacy plan one', exact: true}).click();
      await page.locator('.recent-dialog:not(.tool-work)').getByRole('button', {name: 'Remove copy', exact: true}).click();
      await page.locator('.recent-dialog:not(.tool-work)').waitFor({state: 'detached'});
      const left = await page.evaluate(() => JSON.parse(localStorage.getItem('roadmap-saved')));
      ok(left.length === 1 && left[0].name === 'Legacy plan two' && await focusHeld(page), `${dir}: removing a legacy roadmap-saved copy rewrites the store (left: ${left.map(l => l.name)})`);
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
  if(dir === 'roadmap'){
    const context = await browser.newContext(laptopOpts), page = await context.newPage();
    await context.addInitScript(() => { if(!localStorage.getItem('roadmap-src') && !localStorage.getItem('__seeded')){ localStorage.setItem('__seeded', '1'); localStorage.setItem('roadmap-src', 'title: Mine\nNOW\nA: thing'); } });
    await page.goto(T + '/roadmap/', {waitUntil: 'networkidle'}); await ready(page);
    await fileItem(page, 'Your work…');
    const d = page.getByRole('dialog', {name: 'Your work in Roadmap'}); await d.waitFor();
    ok((await d.textContent()).includes('No saved copies of Roadmap yet. Your draft is kept in this browser as you work.'), `${dir}: with a draft but no copies, Your work says the draft is kept`);
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
    await page.evaluate(() => navigator.serviceWorker.ready);
    await page.reload({waitUntil: 'networkidle'});
    await until(() => page.evaluate(() => !!navigator.serviceWorker.controller), {timeout: 15000});
    ok(!(await page.evaluate(() => performance.getEntriesByType('resource').some(r => r.name.endsWith('/assets/tool-work.js')))), `${dir}: the Your work module is not fetched at page load`);
    await context.setOffline(true);
    await page.reload({waitUntil: 'domcontentloaded'});
    await ready(page);
    await fileItem(page, 'Your work…');
    const offlinePanel = page.getByRole('dialog', {name: 'Your work in ' + entry.name});
    await offlinePanel.waitFor({timeout: 8000});
    ok(await offlinePanel.isVisible() && (await offlinePanel.textContent()).includes('Nothing saved'), `${dir}: Your work opens offline from the precache`);
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
    await until(async () => (await status(page).textContent()).includes('Link copied') || (await page.getByRole('dialog', {name: 'Share link'}).count()) > 0);
    ok(await status(page).textContent().then(t => t === 'Link copied. It opens as a separate copy.') || await page.getByRole('dialog', {name: 'Share link'}).count() === 1, 'hand-off: Share works from the state mountModelLink was given');
    ok(errors.length === 0, 'hand-off: no console errors (' + errors.join(' | ').slice(0, 120) + ')');
    await context.close();
  }

  {
    /* the injected "Copy model link" button, on a page that is not migrated */
    const context = await browser.newContext(laptopOpts), page = await context.newPage();
    await page.goto(T + '/why/', {waitUntil: 'networkidle'});
    await page.locator('.recent-save').waitFor();
    let problem = '';
    try{ await checkInjectedModelLink(page); }catch(error){ problem = error.message.split('\n')[0]; }
    ok(!problem, 'unmigrated why: mountModelLink still injects a working Copy model link button' + (problem ? ' — ' + problem : ''));
    await context.close();
  }
  {
    /* Energy hides its kicker on purpose (the E-series strip stands in); the shell must not un-hide it */
    const context = await browser.newContext(laptopOpts), page = await context.newPage();
    await context.route(E + '/frequency/', async route => {
      const response = await route.fetch();
      const body = (await response.text()).replace('<header data-tool-header', '<header data-tool-header data-shell').replace('</head>', headBlock + '\n</head>');
      await route.fulfill({response, body});
    });
    await page.goto(E + '/frequency/', {waitUntil: 'networkidle'});
    const kicker = await page.evaluate(() => ({display: getComputedStyle(document.querySelector('[data-tool-header] > .kicker')).display, shell: document.querySelector('[data-tool-header]').hasAttribute('data-shell'),
      css: [...document.styleSheets].some(sheet => (sheet.href || '').endsWith('/assets/tool-shell.css'))}));
    ok(kicker.shell && kicker.css && kicker.display === 'none', `energy origin: a stamped header keeps the kicker hidden (display ${kicker.display}, shell css loaded ${kicker.css})`);
    await context.close();
  }
  {
    /* a page that offers no examples must not get an Examples capability from an empty list */
    const entry = {...SHELL_MANIFEST.why, shell: true};
    const html = `<!doctype html><html lang="en" data-mg-section="tools"><head><meta charset="utf-8"><link rel="stylesheet" href="/assets/identity/identity.css"><link rel="stylesheet" href="/assets/tool-shell.css"><script type="module" src="/assets/tool-shell.js"></script></head>
<body class="mg-site"><div class="wrap"><header data-tool-header data-shell><p class="kicker">Fixture</p>${shellRegion('why', entry)}</header><main id="main"><div id="chips"><button class="chip start">Start</button></div></main></div>
<script type="module">import {mountDocumentStart} from '/assets/document-start.js'; import {mountModelLink} from '/assets/model-link.js'; mountDocumentStart(document.getElementById('chips')); mountModelLink(null, {getState: () => ({t: 'x'})});</script></body></html>`;
    const context = await browser.newContext(laptopOpts), page = await context.newPage();
    await context.route(T + '/why/', route => route.fulfill({contentType: 'text/html', body: html}));
    await page.goto(T + '/why/', {waitUntil: 'networkidle'});
    await page.waitForFunction(() => document.querySelector('[data-act=save]') && !document.querySelector('[data-act=save]').disabled);
    ok(await page.locator('[data-act=examples]').isDisabled() && !(await page.locator('[data-tool-header][data-shell-ready]').count()), 'hand-off: an empty example list leaves Examples disabled and the header not ready');
    await context.close();
  }

}

await browser.close();
/* Floor: per page, 4 anatomy x 2 sizes + keyboard + flows + share; plus the hand-off block. */
scope.report('tool-shell', {pass, fail, min: SHELLS.length * 55});
