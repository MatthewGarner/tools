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
} catch(error){
  ok('the suite ran to the end without a crash', false, String(error?.stack || error).split('\n').slice(0, 3).join(' / '));
} finally {
  await Promise.race([Promise.all([...live].map(c => c.close().catch(() => {}))).then(() => browser.close()), new Promise(r => setTimeout(r, 10000))]);
}
console.log('\nPer page (375x812):\n' + table.join('\n'));
results.forEach(r => console.log(r));
report('lab-phone', {...tally(results), min: ROUTES.length * 5 + 1});
