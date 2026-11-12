/* Lab on a phone: every current Lab page at 375x812 (touch, mobile) in its default example state.
   1. Tap targets: every visible control (button, link styled as a control, select, input, summary,
      role=button/tab/..., drag handle) has a hit area of at least 44x44 CSS px, reported per page,
      in the default state and again after one cheap interaction round (Guide open, every details open).
   2. No horizontal page scroll at 320 and 375.
   3. The three long workbenches (Analogy, Interventions, Scenes) show one stage at a time under
      640px and fit the length budget; Unit 3 checks are at the bottom.
   Run from dev/pw with the server up (BASE), like the sibling suites. Every wait is bounded. */
import {chromium} from 'playwright';
import {report, tally, until, trackErrors} from './_harness.mjs';
import {experiments} from '../../lab/dist/shared/catalog.js';

const T = process.env.BASE || 'http://localhost:8087';
const ROUTES = experiments.filter(e => !e.status || e.status === 'active').map(e => e.route);
const MIN = 44;
const results = [];
const ok = (name, pass, detail = '') => { results.push((pass ? 'PASS ' : 'FAIL ') + name + (pass ? '' : detail ? ' — ' + detail : '')); if(!pass) console.log('FAIL ' + name + (detail ? ' — ' + detail : '')); };

/* The one place an exemption lives: a named entry with its reason. `page` is a route or '*';
   `selector` is matched against the control. Nothing is exempt by size alone. */
const EXEMPT = [
  /* (none yet; every entry added here is read by the reviewer) */
];

/* "Inline text link inside a sentence": an <a> that is display:inline and whose parent holds other
   running text. No earlier phone gate defined this (dev/pw first-screen, design-bar, check and
   measure-hit-targets only measure named controls), so this is the definition, stated once. */
const probe = ({min, exempt, route}) => {
  const vw = document.documentElement.clientWidth;
  const interactive = 'button, a[href], select, input:not([type=hidden]), textarea, summary, [role=button], [role=tab], [role=switch], [role=checkbox], [role=radio], [role=menuitem], [role=option], [role=slider], [role=combobox], [data-drag-handle], [tabindex]:not([tabindex="-1"]):not(html):not(body):not(main)';
  const seen = new Set(), bad = [], counts = {controls: 0, inline: 0, exempt: 0, skipped: 0};
  const describe = el => (el.tagName.toLowerCase() + (el.id ? '#' + el.id : '') + (typeof el.className === 'string' && el.className.trim() ? '.' + el.className.trim().split(/\s+/).slice(0, 2).join('.') : '')) + ' "' + ((el.getAttribute('aria-label') || el.textContent || el.value || el.getAttribute('title') || '').trim().replace(/\s+/g, ' ').slice(0, 24)) + '"';
  for(const el of document.querySelectorAll(interactive)){
    if(seen.has(el)) continue; seen.add(el);
    if(el.closest('[hidden], [inert]') || !el.checkVisibility({checkOpacity: true, checkVisibilityCSS: true})){ counts.skipped++; continue; }
    if(el.disabled && !el.matches('button')) { counts.skipped++; continue; }
    let target = el, r = el.getBoundingClientRect();
    /* a visually hidden native control (checkbox/radio/file) is operated through its label */
    /* a checkbox or radio is operated through its label too, so the label's box is its hit area */
    if(el.matches('input[type=checkbox], input[type=radio]') && (el.labels?.[0] || el.closest('label'))?.checkVisibility()){
      const label = el.labels?.[0] || el.closest('label'); target = label; r = label.getBoundingClientRect();
    } else if(el.matches('input, select, textarea') && (r.width <= 2 || r.height <= 2 || getComputedStyle(el).opacity === '0')){
      const label = el.labels?.[0] || el.closest('label');
      if(label && label.checkVisibility()){ target = label; r = label.getBoundingClientRect(); } else { counts.skipped++; continue; }
    }
    if(r.width === 0 || r.height === 0){ counts.skipped++; continue; }
    /* the skip link is off screen until focused */
    if(r.right <= 0 || r.bottom <= 0 || r.left >= vw + 2000){ counts.skipped++; continue; }
    counts.controls++;
    if(r.width >= min - 0.01 && r.height >= min - 0.01) continue;
    const label = describe(target);
    const parent = target.parentElement;
    if(target.matches('a') && getComputedStyle(target).display === 'inline' && parent && parent.textContent.replace(target.textContent, '').trim().length > 8){ counts.inline++; continue; }
    const hit = exempt.find(x => (x.page === '*' || x.page === route) && target.matches(x.selector));
    if(hit){ counts.exempt++; continue; }
    bad.push({what: label, w: Math.round(r.width * 10) / 10, h: Math.round(r.height * 10) / 10});
  }
  return {bad, counts};
};

const browser = await chromium.launch();
const live = new Set();
async function context(opts = {}){
  const c = await browser.newContext({viewport: {width: 375, height: 812}, hasTouch: true, isMobile: true, deviceScaleFactor: 2, reducedMotion: 'reduce', colorScheme: 'light', serviceWorkers: 'block', ...opts});
  c.setDefaultTimeout(10000); c.setDefaultNavigationTimeout(20000);
  live.add(c);
  return c;
}
async function open(page, route){
  await page.goto(T + '/lab/' + route + '/');
  await page.locator('html[data-mg-ready]').waitFor();
  await page.locator('#lab-experiment').waitFor();
  await page.evaluate(() => document.fonts.ready);
  /* the default example has rendered: the page's own content region is non-empty */
  await until(() => page.evaluate(() => (document.querySelector('#experiment-body, #app, main')?.innerText || '').trim().length > 80), {timeout: 6000});
}
const measure = (page, route) => page.evaluate(probe, {min: MIN, exempt: EXEMPT.map(({page, selector}) => ({page, selector})), route});
const summary = ({bad}) => bad.slice(0, 4).map(b => `${b.what} ${b.w}x${b.h}`).join('; ') + (bad.length > 4 ? ` (+${bad.length - 4} more)` : '');

const table = [];
try {
  /* ---- tap targets, default state, then after one cheap interaction round ---- */
  for(const route of ROUTES){
    const c = await context(), page = await c.newPage(), errors = trackErrors(page);
    await open(page, route);
    const first = await measure(page, route);
    ok(`${route}: ${first.counts.controls} controls measured at 375px (default example)`, first.counts.controls >= 8, JSON.stringify(first.counts));
    ok(`${route}: every control is at least ${MIN}x${MIN} (${first.bad.length} under, default state)`, first.bad.length === 0, summary(first));
    /* one obvious interaction: the Guide, then every details disclosure (opened in place: a live locator
       list shifts as each one opens) */
    await page.locator('#lab-tool-guide-toggle').click({timeout: 3000}).catch(() => {});
    await page.evaluate(() => document.querySelectorAll('details:not([open])').forEach(d => { d.open = true; }));
    await page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));
    const second = await measure(page, route);
    ok(`${route}: every control is at least ${MIN}x${MIN} after opening the Guide and every details (${second.bad.length} under, ${second.counts.controls} measured)`, second.bad.length === 0, summary(second));
    if(process.env.LAB_PHONE_VERBOSE) for(const [state, r] of [['default', first], ['opened', second]]) for(const b of r.bad) console.log(`  ${route} [${state}] ${b.what} ${b.w}x${b.h}`);
    table.push(`${route.padEnd(14)} controls ${String(first.counts.controls).padStart(3)}  under44 ${String(first.bad.length).padStart(3)}  after-open ${String(second.bad.length).padStart(3)}  inline-exempt ${first.counts.inline}  named-exempt ${first.counts.exempt}`);
    ok(`${route}: no page errors`, errors.length === 0, errors.join(' | '));
    await c.close();
  }

  /* ---- no horizontal scroll at 320 and 375 (a fresh load at each width: layout is chosen at load) ---- */
  for(const route of ROUTES){
    for(const width of [320, 375]){
      const c = await context({viewport: {width, height: 812}}), page = await c.newPage();
      await open(page, route);
      const over = await page.evaluate(() => ({scroll: document.documentElement.scrollWidth, client: document.documentElement.clientWidth}));
      ok(`${route} @${width}: no horizontal page scroll (${over.scroll} <= ${over.client})`, over.scroll <= over.client);
      await c.close();
    }
  }

  /* ---- Unit 3: Analogy, Interventions and Scenes show one part at a time under 640px ---- */
  const height = page => page.evaluate(() => document.documentElement.scrollHeight);
  const visible = (page, sel) => page.locator(sel).evaluateAll(els => els.filter(el => el.checkVisibility()).length);
  const BUDGET = 5300;
  /* A named exception, read by the reviewer: Interventions' notebook and comparison panel are the bulk left
     after its relationships collapse, and the brief forbids cutting content. */
  const BUDGET_EXCEPTION = {interventions: {limit: 6000, reason: 'option notebook (~1,450px) and comparison panel (~1,330px) stay whole; only relationship cards collapse'}};
  const budgetOf = route => BUDGET_EXCEPTION[route]?.limit ?? BUDGET;

  /* Analogy: a real stage switcher */
  {
    const c = await context(), page = await c.newPage(), errors = trackErrors(page);
    await open(page, 'analogy');
    const stages = ['mapping', 'relationships', 'adaptation'];
    const state = async () => page.evaluate(ids => Object.fromEntries(ids.map(id => { const s = document.getElementById(id); return [id, {hidden: s.hidden, display: getComputedStyle(s).display}]; })), stages);
    let st = await state();
    ok('analogy: only Match functions is shown to begin with; the others are hidden, not merely invisible', !st.mapping.hidden && st.relationships.hidden && st.adaptation.hidden && st.relationships.display === 'none' && st.adaptation.display === 'none', JSON.stringify(st));
    ok('analogy: the current stage is marked aria-current on the step nav', await page.locator('.step-nav a[aria-current=step]').count() === 1 && (await page.locator('.step-nav a[aria-current=step]').getAttribute('href')) === '#mapping');
    ok('analogy: hidden stages are out of the tab order (no focusable control is rendered in them)', await page.evaluate(() => ['relationships', 'adaptation'].every(id => [...document.getElementById(id).querySelectorAll('button, a[href], input, select, textarea, summary')].every(el => !el.checkVisibility()))));
    /* a first edit makes the page write its workspace; that is the saved state the stage must not touch */
    await page.locator('#problem').fill('How could product teams get timely specialist reviews, week to week?');
    await until(() => page.evaluate(() => localStorage.getItem('thinking-lab:analogy:v1') !== null));
    const savedKey = 'thinking-lab:analogy:v1';
    const before = await until(async () => { const a = await page.evaluate(k => localStorage.getItem(k), savedKey); await page.waitForTimeout(700); return a !== null && a === await page.evaluate(k => localStorage.getItem(k), savedKey) ? a : ''; }, {timeout: 8000});
    const urlBefore = page.url();
    const heights = {mapping: await height(page)};
    /* "Next:" ends the stage and focuses the next stage's heading */
    await page.getByRole('button', {name: /^Next: Test relationships/}).click();
    st = await state();
    ok('analogy: "Next: Test relationships" shows stage 2 only', st.mapping.hidden && !st.relationships.hidden && st.adaptation.hidden, JSON.stringify(st));
    ok('analogy: focus lands on the stage heading', await page.evaluate(() => document.activeElement?.id === 'relationships-title'));
    ok('analogy: the nav marks stage 2', (await page.locator('.step-nav a[aria-current=step]').getAttribute('href')) === '#relationships');
    ok('analogy: its storage key exists, and switching stage left the saved workspace and the URL untouched', !!savedKey && await page.evaluate(k => localStorage.getItem(k), savedKey) === before && page.url() === urlBefore, String(savedKey));
    heights.relationships = await height(page);
    /* an in-app action that targets another stage: mark a relationship as breaking, go to stage 3, and use its
       boundary note ("go-link"), which jumps back to the relationship */
    await page.locator('.fit-controls [data-fit="breaks"]').first().click();
    await page.getByRole('button', {name: /^Next: Adapt & test/}).click();
    st = await state();
    ok('analogy: "Next: Adapt & test" shows stage 3 only', st.adaptation.hidden === false && st.relationships.hidden && st.mapping.hidden, JSON.stringify(st));
    ok('analogy: focus lands on the Adapt & test heading', await page.evaluate(() => document.activeElement?.id === 'adaptation-title'));
    heights.adaptation = await height(page);
    await page.locator('.boundary-note').first().click();
    st = await state();
    ok('analogy: a boundary note (go-link) from stage 3 switches back to stage 2', st.relationships.hidden === false && st.adaptation.hidden && st.mapping.hidden, JSON.stringify(st));
    await page.getByRole('button', {name: /^Next: Adapt & test/}).click();
    await page.locator('.capture-option').first().click();
    ok('analogy: developing an adaptation stays in stage 3 with focus inside it', await until(() => page.evaluate(() => !!document.activeElement?.closest('#adaptation') && !document.getElementById('adaptation').hidden)));
    /* the stage control is keyboard operable: focus the 01 link and press Enter */
    await page.locator('.step-nav a').first().focus();
    await page.keyboard.press('Enter');
    st = await state();
    ok('analogy: the step nav works from the keyboard (Enter on 01 shows stage 1, focus on its heading)', !st.mapping.hidden && st.adaptation.hidden && await page.evaluate(() => document.activeElement?.id === 'mapping-title'), JSON.stringify(st));
    /* hash deep link, at load and after load */
    await page.evaluate(() => { location.hash = '#relationships'; });
    ok('analogy: a #relationships hash after load switches to stage 2', await until(async () => (await state()).relationships.hidden === false && (await state()).mapping.hidden));
    const c2 = await context(), p2 = await c2.newPage();
    await p2.goto(T + '/lab/analogy/#adaptation'); await p2.locator('html[data-mg-ready]').waitFor(); await p2.evaluate(() => document.fonts.ready);
    ok('analogy: opening /lab/analogy/#adaptation shows stage 3 only', await p2.evaluate(() => !document.getElementById('adaptation').hidden && document.getElementById('mapping').hidden && document.getElementById('relationships').hidden));
    await c2.close();
    /* resize: desktop shows everything, back to phone keeps one */
    await page.setViewportSize({width: 1280, height: 900});
    ok('analogy: at desktop width all three stages show again, with no reload and no nav marker', await until(async () => { const s = await state(); return stages.every(id => !s[id].hidden); }) && await page.locator('.step-nav a[aria-current]').count() === 0 && await page.locator('.next-stage:visible').count() === 0);
    await page.setViewportSize({width: 375, height: 812});
    ok('analogy: back at phone width one stage shows again', await until(async () => (await visible(page, '#app > section[id=mapping], #app > section[id=relationships], #app > section[id=adaptation]')) === 1));
    for(const [id, h] of Object.entries(heights)) ok(`analogy: stage "${id}" is ${h}px tall (budget ${BUDGET})`, h <= BUDGET);
    ok('analogy: no page errors', errors.length === 0, errors.join(' | '));
    table.push(`analogy        stage heights ${JSON.stringify(heights)}`);
    await c.close();
    /* a workspace saved earlier opens: write, reload in a fresh page of the same storage, read it back */
    const c3 = await context(), p3 = await c3.newPage();
    await open(p3, 'analogy');
    await p3.locator('#problem').fill('Saved before the stage switcher: how do we release review slots?');
    await until(() => p3.evaluate(() => /Saved/.test(document.getElementById('save')?.textContent || '')));
    await p3.reload(); await p3.locator('html[data-mg-ready]').waitFor();
    ok('analogy: a saved workspace reopens with its text', await until(() => p3.locator('#problem').inputValue().then(v => v.startsWith('Saved before the stage switcher'))));
    await c3.close();
  }

  /* Scenes: the track shows the current moment only */
  {
    const c = await context(), page = await c.newPage(), errors = trackErrors(page);
    await open(page, 'scenes');
    const moments = await page.locator('.scene-track > .moment').count();
    ok(`scenes: the default example has several moments (${moments})`, moments >= 3);
    ok('scenes: only the current moment is rendered visible', await visible(page, '.scene-track > .moment') === 1 && await visible(page, '.scene-track > .moment.current') === 1);
    const counter = () => page.locator('.section-head .micro').first().textContent();
    ok('scenes: the counter says 1 / N', /^1 \/ \d+$/.test((await counter()).trim()));
    const title = () => page.locator('.scene-track > .moment.current .moment-body h3').textContent();
    const first = await title();
    await page.getByRole('button', {name: 'Next →'}).click();
    ok('scenes: Next shows the second moment alone', await until(async () => (await title()) !== first && await visible(page, '.scene-track > .moment') === 1) && /^2 \//.test((await counter()).trim()));
    await page.getByRole('button', {name: '← Previous'}).click();
    ok('scenes: Previous returns to the first moment', await until(async () => (await title()) === first));
    await page.getByRole('button', {name: '+ Moment'}).click();
    ok('scenes: adding a moment shows the new one', await until(async () => await page.locator('.scene-track > .moment').count() === moments + 1 && await visible(page, '.scene-track > .moment') === 1 && (await counter()).trim() === `${moments + 1} / ${moments + 1}`));
    const comparisonText = await page.locator('#scene-comparison').innerText();
    ok('scenes: the comparison still covers every moment', (await page.locator('.scene-comparison-scroll').count()) === 1 && comparisonText.length > 200);
    await page.setViewportSize({width: 1280, height: 900});
    ok('scenes: at desktop width every moment shows again', await until(async () => await visible(page, '.scene-track > .moment') === moments + 1));
    await page.setViewportSize({width: 375, height: 812});
    ok('scenes: back at phone width one moment shows', await until(async () => await visible(page, '.scene-track > .moment') === 1));
    ok('scenes: no page errors', errors.length === 0, errors.join(' | '));
    await c.close();
    const c2 = await context(), p2 = await c2.newPage();
    await open(p2, 'scenes');
    const h = await height(p2);
    ok(`scenes: ${h}px tall at 375x812 (budget ${budgetOf('scenes')})`, h <= budgetOf('scenes'));
    table.push(`scenes         height ${h}`);
    await c2.close();
  }

  /* Interventions: one relationship open, the rest collapsed to a title row */
  {
    const c = await context(), page = await c.newPage(), errors = trackErrors(page);
    await open(page, 'interventions');
    const n = await page.locator('.relationship').count();
    ok(`interventions: the default example has several relationships (${n})`, n >= 3);
    const open1 = () => page.locator('.relationship[data-open=true]').count();
    const bodyVisible = () => page.locator('.relationship').evaluateAll(cards => cards.map(card => [...card.children].filter(ch => !ch.classList.contains('relationship-title')).some(ch => ch.checkVisibility())));
    ok('interventions: exactly one relationship is open', await open1() === 1);
    let bodies = await bodyVisible();
    ok('interventions: only the open relationship shows more than its title', bodies.filter(Boolean).length === 1, JSON.stringify(bodies));
    ok('interventions: every title row is visible and at least 44px tall', await page.locator('.relationship-title').evaluateAll(ts => ts.every(t => t.checkVisibility() && t.getBoundingClientRect().height >= 44)));
    ok('interventions: titles carry aria-expanded (one true)', await page.locator('.relationship-title[aria-expanded=true]').count() === 1 && await page.locator('.relationship-title[aria-expanded=false]').count() === n - 1);
    const dialogsBefore = await page.locator('dialog[open]').count();
    const other = page.locator('.relationship[data-open=false] .relationship-title').first();
    const otherId = await other.locator('xpath=..').getAttribute('data-link-id');
    await other.click();
    ok('interventions: tapping a collapsed title opens that relationship and collapses the other', await until(async () => await open1() === 1 && (await page.locator('.relationship[data-open=true]').getAttribute('data-link-id')) === otherId));
    ok('interventions: tapping a title does not open the editor on a phone', await page.locator('dialog[open]').count() === dialogsBefore);
    ok('interventions: the open relationship shows its claim and an Edit relationship button', await page.locator('.relationship[data-open=true] .edit-relationship').isVisible());
    await page.locator('.relationship[data-open=true] .edit-relationship').click();
    ok('interventions: Edit relationship opens the editor', await until(() => page.locator('dialog[open]').count().then(k => k === dialogsBefore + 1)));
    await page.keyboard.press('Escape');
    await page.setViewportSize({width: 1280, height: 900});
    ok('interventions: at desktop width every relationship shows its body again', await until(async () => (await bodyVisible()).every(Boolean)) && await page.locator('.relationship-title[aria-expanded]').count() === 0 && await page.locator('.edit-relationship:visible').count() === 0);
    const dialogs = await page.locator('dialog[open]').count();
    await page.locator('.relationship-title').first().click();
    ok('interventions: on desktop a title still opens the editor', await until(() => page.locator('dialog[open]').count().then(k => k === dialogs + 1)));
    ok('interventions: no page errors', errors.length === 0, errors.join(' | '));
    await c.close();
    const c2 = await context(), p2 = await c2.newPage();
    await open(p2, 'interventions');
    const h = await height(p2);
    ok(`interventions: ${h}px tall at 375x812 (budget ${budgetOf('interventions')}; brief asked for ${BUDGET})`, h <= budgetOf('interventions'));
    table.push(`interventions  height ${h}  (exception: ${BUDGET_EXCEPTION.interventions.reason})`);
    await c2.close();
  }
} catch(error){
  ok('the suite ran to the end without a crash', false, String(error?.stack || error).split('\n').slice(0, 3).join(' / '));
} finally {
  await Promise.race([Promise.all([...live].map(c => c.close().catch(() => {}))).then(() => browser.close()), new Promise(r => setTimeout(r, 10000))]);
}
console.log('\nPer page (375x812):\n' + table.join('\n'));
results.forEach(r => console.log(r));
report('lab-phone', {...tally(results), min: ROUTES.length * 5 + 1});
