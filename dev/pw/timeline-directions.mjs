/* Renderer-grounded Timeline direction review.
   It loads the real app with an authored stress document (including overlap,
   fixed event, decision lead and comparison-ready density), then captures its
   live desktop and phone forms. The 16:9 frame imports the same parser and
   review renderer in-browser, so it exercises production browser SVG rather
   than a design-tool approximation.

   Usage: BASE=http://localhost:8097 node dev/pw/timeline-directions.mjs
*/
import {chromium, devices} from 'playwright';
import {mkdirSync, writeFileSync} from 'node:fs';

const BASE = process.env.BASE || 'http://localhost:8097';
const OUT = new URL('../../.bar/timeline-directions/', import.meta.url).pathname;
const DOC = `title: Lattice release programme
today: 2026-08-20
Platform: Sync engine rewrite 2026-08-28 .. 2026-10-18 [risk] // late tail remains material
Platform: Offline cache 2026-09-12 .. 2026-10-04
Platform: Index migration 2026-10-02 .. 2026-11-16
Experience: Reading controls 2026-09-06 .. 2026-09-28
Experience: Collection redesign 2026-09-23 .. 2026-11-03
Experience: Search refinement 2026-10-25 .. 2026-12-08
Launch: Partner review 2026-10-01 .. 2026-11-22 [risk]
Launch: Store submission 2026-11-14 .. 2026-12-05
Launch: Release candidate 2026-12-02 .. 2027-01-10
Compliance: Privacy sign-off 2026-12-18 [fixed] [lead: 42d]
Public launch 2027-01-22 [fixed]`;
const OLD_DOC = `title: Lattice release programme
today: 2026-08-20
Platform: Sync engine rewrite 2026-08 .. 2026-09 [risk]
Platform: Offline cache 2026-09-12 .. 2026-10-04
Platform: Index migration 2026-10-02 .. 2026-11-16
Experience: Reading controls 2026-09-06 .. 2026-09-28
Experience: Collection redesign 2026-09-23 .. 2026-11-03
Launch: Partner review 2026-10-01 .. 2026-11-22 [risk]
Launch: Store submission 2026-11-14 .. 2026-12-05
Launch: Release candidate 2026-12-02 .. 2027-01-10
Launch: Partner discovery 2026-09 .. 2026-10
Compliance: Privacy sign-off 2026-12-18 [fixed] [lead: 42d]
Public launch 2027-01-22 [fixed]`;
const OVERDUE_DOC = DOC.replace('Compliance: Privacy sign-off 2026-12-18 [fixed] [lead: 42d]',
  'Compliance: Privacy sign-off 2026-08-05 [fixed]');

mkdirSync(OUT, {recursive: true});
const browser = await chromium.launch();

async function pageFor(direction, phone = false, theme = 'light', compare = false, source = DOC){
  const context = phone
    ? await browser.newContext({...devices['iPhone 13'], colorScheme: theme, reducedMotion: 'reduce'})
    : await browser.newContext({viewport: {width: 1600, height: 1000}, colorScheme: theme, reducedMotion: 'reduce'});
  await context.addInitScript(({src, old}) => {
    localStorage.setItem('timeline-src', src);
    localStorage.setItem('timeline-snaps', JSON.stringify([{label: 'June pack', src: old}]));
  }, {src: source, old: OLD_DOC});
  const page = await context.newPage();
  await page.goto(BASE + '/timeline/?direction=' + direction, {waitUntil: 'networkidle'});
  if(compare) await page.evaluate(() => {
    const sel = document.querySelector('#snapsel');
    if(!sel || ![...sel.options].some(option => option.value === '0')) throw new Error('comparison snapshot unavailable');
    sel.value = '0';
    sel.dispatchEvent(new Event('change', {bubbles:true}));
  });
  await page.waitForTimeout(450);
  return {context, page};
}

for(const direction of ['field', 'ledger', 'clock']) for(const theme of ['light', 'dark']){
  {
    const {context, page} = await pageFor(direction, false, theme);
    const svg = page.locator('#preview svg');
    if(await svg.count() !== 1) throw new Error(direction + ': desktop did not render');
    const editable = await svg.locator('[data-edit="label"]').count();
    if(!editable) throw new Error(direction + ': no live label edit route');
    writeFileSync(OUT + direction + '-' + theme + '-desktop.png', await svg.screenshot());
    await svg.locator('[data-edit="label"]').first().click();
    if(await page.locator('.eip-input').count() !== 1) throw new Error(direction + ': label did not open the real edit input');
    await page.keyboard.press('Escape');
    await context.close();
  }
  {
    const {context, page} = await pageFor(direction, true, theme);
    const svg = page.locator('#preview svg');
    if(!(await svg.evaluate(el => el.hasAttribute('data-narrow')))){
      const detail = await page.evaluate(() => ({innerWidth, previewWidth: document.querySelector('#preview')?.clientWidth,
        intent: document.querySelector('#preview svg')?.getAttribute('data-intent')}));
      throw new Error(direction + ': phone was not a narrow live form ' + JSON.stringify(detail));
    }
    if(direction === 'field'){
      const clipped = await svg.evaluate(root => {
        const width = root.viewBox.baseVal.width;
        return [...root.querySelectorAll('text')].map(el => ({text:el.textContent, box:el.getBBox()}))
          .filter(({box}) => box.x < -.5 || box.x + box.width > width + .5);
      });
      if(clipped.length) throw new Error('field phone text clips: ' + JSON.stringify(clipped));
    }
    writeFileSync(OUT + direction + '-' + theme + '-phone.png', await page.screenshot({fullPage: true}));
    if(direction === 'field'){
      const card = svg.locator('[data-edit="cardmenu"]').first();
      await card.click({position:{x:330,y:74}});
      const menuText = (await page.locator('.eip-pop').innerText()).replace(/\s+/g,' ');
      if(!/Rename… .*Dates… .*Status… .*Lane… .*Remove milestone/.test(menuText))
        throw new Error('field phone card menu lacks an edit route: ' + menuText);
      await page.locator('.eip-pop button', {hasText:'Status…'}).click();
      const statuses = (await page.locator('.eip-pop').innerText()).replace(/\s+/g,'|');
      if(statuses !== 'none|done|risk|fixed') throw new Error('field phone status route lacks the marked picker: ' + statuses);
      await page.keyboard.press('Escape');
      await svg.locator('[data-add-control]').first().click();
      if(await page.locator('.eip-input').count() !== 1) throw new Error('field phone lane header did not open add input');
      await page.keyboard.press('Escape');
    }
    await context.close();
  }
  {
    const {context, page} = await pageFor(direction, false, theme);
    const svg = await page.evaluate(async ({doc, direction}) => {
      const [{parse}, {renderDirection}, {themeColors, measure, isDark}] = await Promise.all([
        import('/timeline/parse.js'), import('/timeline/direction-prototypes.js'), import('/assets/app-common.js'),
      ]);
      const model = parse(doc);
      return renderDirection(model, {colors: themeColors(), measure, dark: isDark(), today: model.today, intent: 'presentation'}, direction, {intent: 'presentation'});
    }, {doc: DOC, direction});
    await page.setViewportSize({width: 1920, height: 1080});
    await page.setContent('<body style="margin:0">' + svg + '</body>');
    writeFileSync(OUT + direction + '-' + theme + '-export.png', await page.screenshot());
    await context.close();
  }
}

/* Comparison is a first-class Timeline state, so Field must prove the same
   ghost/slip/new/dropped semantics on live desktop, phone, and 16:9 export. */
for(const theme of ['light', 'dark']){
  {
    const {context, page} = await pageFor('field', false, theme, true);
    const svg = page.locator('#preview svg');
    for(const marker of ['[data-ms="ghost"]', '[data-lrm]']) if(await svg.locator(marker).count() < 1)
      throw new Error('field compare desktop missing ' + marker);
    writeFileSync(OUT + 'field-' + theme + '-compare-desktop.png', await svg.screenshot());
    await context.close();
  }
  {
    const {context, page} = await pageFor('field', true, theme, true);
    const svg = page.locator('#preview svg');
    for(const marker of ['[data-ms="ghost"]', '[data-edit="cardmenu"]']) if(await svg.locator(marker).count() < 1)
      throw new Error('field compare phone missing ' + marker);
    const clipped = await svg.evaluate(root => {
      const width = root.viewBox.baseVal.width;
      return [...root.querySelectorAll('text')].map(el => ({text:el.textContent, box:el.getBBox()}))
        .filter(({box}) => box.x < -.5 || box.x + box.width > width + .5);
    });
    if(clipped.length) throw new Error('field compare phone text clips: ' + JSON.stringify(clipped));
    writeFileSync(OUT + 'field-' + theme + '-compare-phone.png', await page.screenshot({fullPage: true}));
    await context.close();
  }
  {
    const {context, page} = await pageFor('field', false, theme, true);
    const svg = await page.evaluate(async ({doc, old}) => {
      const [{parse}, {timelineDiff, timelineDiffView}, {renderDirection}, {themeColors, measure, isDark}] = await Promise.all([
        import('/timeline/parse.js'), import('/timeline/diff.js'), import('/timeline/direction-prototypes.js'), import('/assets/app-common.js'),
      ]);
      const model = parse(doc), diff = timelineDiffView(timelineDiff(parse(old), model), 'June pack');
      return renderDirection(model, {colors: themeColors(), measure, dark: isDark(), today: model.today, intent: 'presentation'}, 'field', {intent: 'presentation', diff});
    }, {doc: DOC, old: OLD_DOC});
    await page.setViewportSize({width: 1920, height: 1080});
    await page.setContent('<body style="margin:0">' + svg + '</body>');
    writeFileSync(OUT + 'field-' + theme + '-compare-export.png', await page.screenshot());
    await context.close();
  }
}

/* A red range must mean only a fixed event already past today. Capture that
   exception as a separate factual state rather than implying it with [risk]. */
for(const theme of ['light', 'dark']){
  {
    const {context, page} = await pageFor('field', false, theme, false, OVERDUE_DOC);
    const svg = page.locator('#preview svg');
    if(await svg.getByText('OVERDUE').count() !== 1) throw new Error('overdue desktop label missing');
    writeFileSync(OUT + 'field-' + theme + '-overdue-desktop.png', await svg.screenshot());
    await context.close();
  }
  {
    const {context, page} = await pageFor('field', true, theme, false, OVERDUE_DOC);
    const svg = page.locator('#preview svg');
    if(await svg.getByText('OVERDUE').count() !== 1) throw new Error('overdue phone label missing');
    writeFileSync(OUT + 'field-' + theme + '-overdue-phone.png', await page.screenshot({fullPage:true}));
    await context.close();
  }
  {
    const {context, page} = await pageFor('field', false, theme, false, OVERDUE_DOC);
    const svg = await page.evaluate(async doc => {
      const [{parse}, {renderDirection}, {themeColors, measure, isDark}] = await Promise.all([
        import('/timeline/parse.js'), import('/timeline/direction-prototypes.js'), import('/assets/app-common.js'),
      ]);
      const model = parse(doc);
      return renderDirection(model, {colors:themeColors(),measure,dark:isDark(),today:model.today,intent:'presentation'}, 'field', {intent:'presentation'});
    }, OVERDUE_DOC);
    if(!svg.includes('OVERDUE')) throw new Error('overdue export label missing');
    await page.setViewportSize({width:1920,height:1080});
    await page.setContent('<body style="margin:0">' + svg + '</body>');
    writeFileSync(OUT + 'field-' + theme + '-overdue-export.png', await page.screenshot());
    await context.close();
  }
}
await browser.close();
console.log('wrote', OUT);
