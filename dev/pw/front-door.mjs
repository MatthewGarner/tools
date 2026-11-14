/* Front door gate (specs 2026-11-11 and 2026-11-13). The page at `/` is a character-select device over
   generated class lists, so the contract is what a visitor sees and does: the first screen on a phone and a
   laptop, the carousel, scrubber, arrows and keys each moving the selected card, the remembered class and tool,
   the page as four plain lists without JavaScript, a returning strip that exists only when this browser has work,
   every link resolving, no tool engine loaded, and the page working offline from the Product service worker.
   Run from dev/pw with both servers up, or set BASE / EBASE like the sibling suites. Every wait is
   bounded (10s default) so a broken page reports FAIL lines in seconds. */
import {chromium} from 'playwright';
import {report, tally, until, trackErrors} from './_harness.mjs';
import {TOOL_DIRS, ENERGY_TOOL_DIRS} from '../tool-dirs.mjs';
import {LAB_ROUTES} from '../suite-pages.mjs';
import {encodeHash} from '../../assets/series.js';

const T = process.env.BASE || 'http://localhost:8087';
const E = process.env.EBASE || process.env.ENERGY_BASE || 'http://localhost:' + (process.env.EPORT || 8089);
const results = [];
const ok = (name, pass, detail = '') => { results.push((pass ? 'PASS ' : 'FAIL ') + name + (pass ? '' : detail ? ' — ' + detail : '')); if(!pass) console.log('FAIL ' + name + (detail ? ' — ' + detail : '')); };

const browser = await chromium.launch();
const live = new Set();
async function context(opts = {}){
  const c = await browser.newContext({reducedMotion: 'reduce', serviceWorkers: 'block', ...opts});
  c.setDefaultTimeout(10000); c.setDefaultNavigationTimeout(20000);
  live.add(c);
  return c;
}
const settle = page => page.evaluate(() => document.fonts.ready);
/* the first read of storage has finished, so a hidden strip means nothing is stored (not "not run yet") */
const stripReady = page => page.locator('[data-door-resume][data-ready]').waitFor({state: 'attached'});
const PHONE = {width: 375, height: 812}, SMALL = {width: 375, height: 667}, LAPTOP = {width: 1280, height: 800};
const ready = page => page.locator('.door-rooms.door-ready').waitFor({state: 'attached'});
const visible = page => page.locator('.door-class:not([hidden]) .door-card.is-current');
const where = async page => ({
  cls: (await page.locator('[role=tab][aria-selected=true] .door-tab-name').textContent()).trim(),
  name: (await visible(page).locator('.door-name').textContent()).trim(),
  count: (await page.locator('.door-counter').textContent()).trim(),
});
const phone = (viewport, o = {}) => context({viewport, hasTouch: true, isMobile: true, reducedMotion: 'reduce', ...o});
/* A swipe, as the carousel sees it: the list scrolls sideways by most of a card and is left to snap. Synthesised
   touch gestures do not scroll it on CI's headless Linux, so the native scroll is the reliable input here;
   real touch is checked in WebKit and on a phone. */
const swipe = async (page, dir) => { await page.locator('.door-class:not([hidden]) .door-list').evaluate((l, d) => l.scrollBy({left: -d * l.clientWidth * 0.8, behavior: 'smooth'}), dir); };

try {
  /* ---- phone: the selection screen is the page (375x812 and 375x667) ---- */
  for(const vp of [PHONE, SMALL]){
    const c = await phone(vp), page = await c.newPage(), errors = trackErrors(page);
    await page.goto(T + '/'); await settle(page); await stripReady(page); await ready(page);
    const tag = `phone ${vp.width}x${vp.height}`;
    const r = sel => page.locator(sel).first().evaluate(el => { const b = el.getBoundingClientRect(); return {top: b.top, bottom: b.bottom, left: b.left, right: b.right, width: b.width, height: b.height}; });
    const name = await r('.is-current .door-name'), line = await r('.is-current .door-line'), open = await r('.is-current .door-open'), nav = await r('.door-nav'), tabs = await r('.door-classes'), art = await r('.is-current .door-art');
    ok(`${tag}: the default card is Instruments / Fermi, 1 / 15`, JSON.stringify(await where(page)) === JSON.stringify({cls: 'Instruments', name: 'Fermi', count: '1 / 15'}), JSON.stringify(await where(page)));
    ok(`${tag}: name, description and Open are on the first screen, clear of the bar`, name.top >= 0 && line.bottom <= open.top && open.bottom <= nav.top, JSON.stringify({name, line, open, nav}));
    ok(`${tag}: the class control and the scrubber are on the first screen, the control against the bottom edge`, nav.bottom <= tabs.top + 1 && Math.abs(tabs.bottom - vp.height) <= 1 && nav.height >= 44 && tabs.height >= 48, JSON.stringify({nav, tabs}));
    ok(`${tag}: the sketch is drawn on the card`, art.width >= 100 && art.height >= 40, JSON.stringify(art));
    const height = await page.evaluate(() => document.documentElement.scrollHeight);
    ok(`${tag}: the page is at most two screens (${height})`, height <= 2 * vp.height + 2);
    const bar = await page.evaluate(() => [...document.styleSheets].flatMap(s => { try { return [...s.cssRules]; } catch { return []; } }).map(r => r.cssText).join('\n'));
    ok(`${tag}: the fixed bar and the stage leave room for the safe area (env(safe-area-inset-bottom))`, /\.door-classes[^}]*safe-area-inset-bottom/.test(bar) && /\.door-nav[^}]*safe-area-inset-bottom/.test(bar));
    const peek = await page.evaluate(() => { const [a, b] = [...document.querySelectorAll('.door-class:not([hidden]) .door-card')].slice(0, 2).map(e => e.getBoundingClientRect()); return {next: b.left, edge: innerWidth, gap: b.left - a.right}; });
    ok(`${tag}: the next card peeks about 24px at the edge`, peek.edge - peek.next >= 16 && peek.edge - peek.next <= 36, JSON.stringify(peek));
    const small = await page.evaluate(() => [...document.querySelectorAll('.door-resume a, .door-classes button, .is-current .door-open, .is-current .door-art, .door-rosters')].filter(e => e.offsetParent !== null || getComputedStyle(e).position === 'fixed').map(e => [e, e.getBoundingClientRect()]).filter(([e, b]) => b.width > 0 && (b.width < 44 || b.height < 44)).map(([e, b]) => (e.className || e.tagName) + ' ' + Math.round(b.width) + 'x' + Math.round(b.height)));
    ok(`${tag}: every control (classes, Open, art, the scrubber strip) is at least 44x44`, small.length === 0, small.join('; '));
    ok(`${tag}: nothing logged an error`, errors.length === 0, errors.join(' | '));
    await c.close();
  }

  /* ---- no horizontal scroll at four widths ---- */
  for(const width of [320, 375, 768, 1280]){
    const c = await context({viewport: {width, height: 800}}), page = await c.newPage();
    await page.goto(T + '/'); await settle(page); await stripReady(page); await ready(page);
    const over = await page.evaluate(() => ({scroll: document.documentElement.scrollWidth, client: document.documentElement.clientWidth}));
    ok(`${width}px: no horizontal scroll (${over.scroll} <= ${over.client})`, over.scroll <= over.client);
    await c.close();
  }

  /* ---- 1280x800: the class row, the whole card and the roster fit the first screen; the device is the page ---- */
  {
    const c = await context({viewport: LAPTOP}), page = await c.newPage();
    await page.goto(T + '/'); await settle(page); await stripReady(page); await ready(page);
    const b = sel => page.locator(sel).first().evaluate(el => { const r = el.getBoundingClientRect(); return {top: r.top, bottom: r.bottom}; });
    const tabs = await b('.door-classes'), card = await b('.is-current'), open = await b('.is-current .door-open'), roster = await b('.door-roster:not([hidden])'), counter = await b('.door-counter');
    ok('laptop: the class row, the full card (Open included), the roster and the counter are inside 800px', tabs.top >= 0 && open.bottom <= card.bottom && card.bottom <= roster.top && counter.bottom <= 800, JSON.stringify({tabs, card, open, roster, counter}));
    ok('laptop: four classes, Instruments pressed, with their lines', JSON.stringify(await page.locator('[role=tab]').evaluateAll(t => t.map(x => [x.querySelector('.door-tab-name').textContent, x.getAttribute('aria-selected'), x.querySelector('.door-tab-line').textContent]))) === JSON.stringify([['Instruments', 'true', 'Bring a decision'], ['Models', 'false', 'Play a mechanism'], ['Workbenches', 'false', 'Another way in'], ['Energy', 'false', 'Batteries and power markets']]));
    ok('laptop: one card is shown, with kicker, name, description, three stats and an Open link', await page.locator('.door-class:not([hidden]) .door-card:visible').count() === 1 && await visible(page).locator('.door-kicker').textContent() === 'Instruments · Size it' && await visible(page).locator('.door-stats > div').count() === 3 && await visible(page).locator('a.door-open').getAttribute('href') === '/fermi/' && (await visible(page).locator('a.door-open').textContent()) === 'Open Fermi');
    ok('laptop: the Instruments roster is grouped under the five jobs', JSON.stringify(await page.locator('.door-roster:not([hidden]) .door-roster-job').allTextContents()) === JSON.stringify(['Size it', 'Choose', 'Plan it', 'Test the argument', 'Make the case']));
    const roles = await page.evaluate(() => ({panel: document.querySelector('.door-class:not([hidden])').getAttribute('role'), labelled: !!document.getElementById(document.querySelector('.door-class:not([hidden])').getAttribute('aria-labelledby')), pressed: document.querySelectorAll('.door-roster:not([hidden]) [aria-pressed=true]').length, live: document.querySelector('[aria-live=polite]').textContent, thumbLabel: document.querySelector('.door-thumb').getAttribute('aria-label'), tablist: !!document.querySelector('[role=tablist]'), region: !!document.querySelector('[role=region][aria-label]')}));
    ok('laptop: tablist, tabpanel labelled by its tab, one pressed roster button named by the tool, an empty polite live region and a labelled region', roles.panel === 'tabpanel' && roles.labelled && roles.pressed === 1 && roles.thumbLabel === 'Fermi' && roles.tablist && roles.region && roles.live === '', JSON.stringify(roles));
    await page.keyboard.press('ArrowRight');
    ok('laptop: the live region is silent on load and announces the next tool after a move', await page.locator('[aria-live=polite]').textContent() === 'Gauge. Collect independent estimates, compare ranges and run another round. 2 of 15.', await page.locator('[aria-live=polite]').textContent());
    ok('laptop: no filter bar on the front door', await page.locator('input[type=search], [data-explore-form], select').count() === 0);
    ok('laptop: the masthead item is Tools Lab and current', await page.locator('.mg-nav [data-suite-link="explore"][aria-current="page"]').textContent() === 'Tools Lab' && await page.locator('.mg-nav [aria-current]').count() === 1);
    ok('laptop: Instruments for judgement is retired from the page', !(await page.locator('body').innerText()).toLowerCase().includes('instruments for judgement'));
    const painted = await visible(page).locator('svg.sketch [stroke]').first().evaluate(el => getComputedStyle(el).stroke);
    ok(`laptop: the stage sketch strokes in the stronger --sketch-line (${painted})`, painted === 'rgb(163, 163, 159)', painted);
    await c.close();
  }

  /* ---- moving around on a wide screen: arrows, keys, roster, class, wrap, counter ---- */
  {
    const c = await context({viewport: LAPTOP, reducedMotion: 'no-preference'}), page = await c.newPage();
    await page.goto(T + '/'); await settle(page); await stripReady(page); await ready(page);
    await page.getByRole('button', {name: 'Next tool'}).click();
    ok('wide: the next arrow moves to Gauge, 2 / 15', JSON.stringify(await where(page)) === JSON.stringify({cls: 'Instruments', name: 'Gauge', count: '2 / 15'}), JSON.stringify(await where(page)));
    await page.getByRole('button', {name: 'Previous tool'}).click(); await page.getByRole('button', {name: 'Previous tool'}).click();
    ok('wide: the previous arrow wraps from the first card to the last (Case file, 15 / 15)', JSON.stringify(await where(page)) === JSON.stringify({cls: 'Instruments', name: 'Case file', count: '15 / 15'}), JSON.stringify(await where(page)));
    await page.getByRole('button', {name: 'Next tool'}).click();
    ok('wide: the next arrow wraps from the last card to the first', (await where(page)).count === '1 / 15');
    await page.getByRole('button', {name: 'Next tool'}).focus(); await page.keyboard.press('ArrowRight');
    ok('wide: the right arrow key moves on (2 / 15)', (await where(page)).count === '2 / 15');
    await page.keyboard.press('ArrowLeft'); await page.keyboard.press('ArrowLeft');
    ok('wide: the left arrow key wraps to 15 / 15', (await where(page)).count === '15 / 15');
    await page.locator('.door-roster:not([hidden]) .door-thumb[aria-label="Premortem"]').click();
    ok('wide: a roster tap selects that tool (Premortem, 11 / 15) and presses its thumbnail', JSON.stringify(await where(page)) === JSON.stringify({cls: 'Instruments', name: 'Premortem', count: '11 / 15'}) && await page.locator('.door-roster:not([hidden]) [aria-pressed=true]').getAttribute('aria-label') === 'Premortem', JSON.stringify(await where(page)));
    await page.getByRole('tab', {name: /Models/}).click();
    ok('wide: changing class selects its first tool (Flow, 1 / 19)', JSON.stringify(await where(page)) === JSON.stringify({cls: 'Models', name: 'Flow', count: '1 / 19'}), JSON.stringify(await where(page)));
    ok('wide: the Models roster has all 19 thumbnails and the Instruments panel is hidden', await page.locator('.door-roster:not([hidden]) .door-thumb').count() === 19 && await page.locator('#door-panel-instruments').isHidden());
    await page.getByRole('tab', {name: /Models/}).focus(); await page.keyboard.press('ArrowRight');
    ok('wide: the arrow key on the class row moves to Workbenches (Reframing workbench, 1 / 7)', JSON.stringify(await where(page)) === JSON.stringify({cls: 'Workbenches', name: 'Reframing workbench', count: '1 / 7'}), JSON.stringify(await where(page)));
    await page.getByRole('tab', {name: /Energy/}).click();
    ok('wide: Energy has five cards', (await where(page)).count === '1 / 5');
    ok('wide: Open is a real link to the tool, and the art does not navigate on a click', await visible(page).locator('a.door-open').evaluate(a => a.getAttribute('href').startsWith('/energy/')) && await visible(page).locator('.door-art').evaluate(a => getComputedStyle(a).pointerEvents === 'none'));
    /* the swap animates (known positive), then reduced motion removes it */
    await page.getByRole('button', {name: 'Next tool'}).click();
    ok('wide: a swap runs the 200ms scale-and-fade', await visible(page).evaluate(el => getComputedStyle(el).animationName !== 'none' && parseFloat(getComputedStyle(el).animationDuration) <= 0.25));
    await c.close();
    const r = await context({viewport: LAPTOP, reducedMotion: 'reduce'}), rp = await r.newPage();
    await rp.goto(T + '/'); await ready(rp); await rp.getByRole('button', {name: 'Next tool'}).click();
    ok('reduced motion: a swap has no animation and no transition', await visible(rp).evaluate(el => getComputedStyle(el).animationName === 'none' && getComputedStyle(el).transitionDuration.split(',').every(d => parseFloat(d) === 0)) && (await where(rp)).name === 'Gauge');
    await r.close();
  }

  /* ---- remembered class and tool; blocked storage; the hash ---- */
  {
    const c = await context({viewport: LAPTOP}), page = await c.newPage();
    await page.goto(T + '/'); await ready(page);
    await page.getByRole('tab', {name: /Models/}).click();
    await page.locator('.door-roster:not([hidden]) .door-thumb[aria-label="Teams" i], .door-roster:not([hidden]) .door-thumb').nth(4).click();
    const chosen = await where(page);
    await page.reload(); await ready(page);
    ok(`remember: the class and tool survive a reload (${chosen.cls} / ${chosen.name})`, JSON.stringify(await where(page)) === JSON.stringify(chosen) && chosen.cls === 'Models' && chosen.count === '5 / 19', JSON.stringify(await where(page)));
    await page.evaluate(() => localStorage.setItem('tools:door:v1', JSON.stringify({c: 'nope', t: '<img src=x onerror=alert(1)>'})));
    await page.reload(); await ready(page);
    ok('remember: a corrupt stored value falls back to Instruments / Fermi', (await where(page)).name === 'Fermi' && await page.locator('img[src=x]').count() === 0);
    await page.goto(T + '/#energy'); await ready(page);
    ok('hash: /#energy selects the Energy class', (await where(page)).cls === 'Energy');
    for(const [hash, cls] of [['instruments', 'Instruments'], ['models', 'Models'], ['workbenches', 'Workbenches']]){
      await page.evaluate(h => { location.hash = h; }, hash);
      ok(`hash: #${hash} selects ${cls}`, await until(async () => (await where(page)).cls === cls));
    }
    await page.goto(T + '/product/'); await ready(page);
    ok('hash: /product/ lands on the front door with Instruments selected', new URL(page.url()).pathname === '/' && (await where(page)).cls === 'Instruments');
    await c.close();
    const blocked = await context({viewport: LAPTOP}); await blocked.addInitScript(() => { Object.defineProperty(window, 'localStorage', {get() { throw new Error('blocked'); }}); });
    const bp = await blocked.newPage(), errors = trackErrors(bp);
    await bp.goto(T + '/'); await ready(bp); await bp.getByRole('button', {name: 'Next tool'}).click();
    ok('remember: with storage blocked the default still renders and the device still works', (await where(bp)).count === '2 / 15' && errors.length === 0, errors.join(' | '));
    await blocked.close();
  }

  /* ---- the phone: carousel scroll, scrubber drag, ends, taps and drags ---- */
  {
    const c = await phone(PHONE), page = await c.newPage(), errors = trackErrors(page);
    await page.goto(T + '/'); await settle(page); await ready(page);
    {
      await page.evaluate(() => scrollTo(0, document.documentElement.scrollHeight)); await page.waitForTimeout(150);
      const foot = await page.evaluate(() => ({footer: Math.round(document.querySelector('.mg-footer').getBoundingClientRect().bottom), bar: Math.round(Math.min(...[...document.querySelectorAll('.door-nav, .door-classes')].map(e => e.getBoundingClientRect().top)))}));
      ok('phone: scrolled to the end, the site footer clears the fixed bar (it is reachable, not under it)', foot.footer <= foot.bar, JSON.stringify(foot));
      await page.evaluate(() => scrollTo(0, 0)); await page.waitForTimeout(150);
    }
    const scrollLeft = () => page.locator('.door-class:not([hidden]) .door-list').evaluate(l => l.scrollLeft);
    await swipe(page, -1);
    ok('carousel: a sideways scroll of most of a card snaps to Gauge and the counter follows (2 / 15)', await until(async () => JSON.stringify(await where(page)) === JSON.stringify({cls: 'Instruments', name: 'Gauge', count: '2 / 15'})), JSON.stringify(await where(page)));
    ok('carousel: the selected card sits snapped at the centre', await until(() => visible(page).evaluate(el => Math.abs(el.getBoundingClientRect().left + el.getBoundingClientRect().width / 2 - innerWidth / 2) < 2)));
    ok('carousel: a swipe never opened a tool', new URL(page.url()).pathname === '/');
    /* the scrubber: drag from the first tick to the last, the cards follow live */
    const strip = await page.locator('.door-rosters').boundingBox();
    const seen = new Set();
    await page.mouse.move(strip.x + 6, strip.y + 22); await page.mouse.down();
    for(let i = 1; i <= 12; i++){ await page.mouse.move(strip.x + 6 + (strip.width - 14) * i / 12, strip.y + 22); seen.add((await where(page)).name); }
    ok('scrubber: dragging along the strip passes through many cards live', seen.size >= 8, [...seen].join(','));
    await page.mouse.up();
    ok('scrubber: it lands on the last card (Case file, 15 / 15) and the carousel is there', await until(async () => (await where(page)).count === '15 / 15'), JSON.stringify(await where(page)));
    ok('scrubber: the carousel scrolled to follow', await visible(page).evaluate(el => Math.abs(el.getBoundingClientRect().left + el.getBoundingClientRect().width / 2 - innerWidth / 2) < 2));
    ok('scrubber: a drag along it never opened a tool', new URL(page.url()).pathname === '/');
    /* ends: no wrap on a phone */
    await page.keyboard.press('Tab'); await page.locator('.door-class:not([hidden]) .door-list').evaluate(l => l.scrollBy({left: 400, behavior: 'instant'}));
    await page.waitForTimeout(300);
    ok('ends: the carousel stops at the last card (no wrap)', (await where(page)).count === '15 / 15');
    await page.locator('.door-rosters').click({position: {x: 3, y: 22}});
    ok('scrubber: a tap on the first tick lands on card 1', await until(async () => (await where(page)).count === '1 / 15'), JSON.stringify(await where(page)));
    await page.locator('.door-rosters').focus().catch(() => {});
    await page.evaluate(() => document.activeElement && document.activeElement.blur());
    await swipe(page, 1);
    await page.waitForTimeout(400);
    ok('ends: swiping back past the first card stays on 1 / 15 (no wrap)', (await where(page)).count === '1 / 15');
    /* a horizontal mouse drag across the art never counts as a tap */
    const art = await visible(page).locator('.door-art').boundingBox();
    await page.mouse.move(art.x + art.width / 2, art.y + art.height / 2); await page.mouse.down(); await page.mouse.move(art.x + art.width / 2 - 60, art.y + art.height / 2 + 2, {steps: 6}); await page.mouse.move(art.x + art.width / 2 - 60, art.y + art.height / 2 + 2); await page.mouse.up();
    await page.waitForTimeout(300);
    ok('tap: a horizontal drag that ends on the art does not open the tool', new URL(page.url()).pathname === '/', page.url());
    /* the Models class: the long roster (19 ticks), class change cross-fades and starts at its first tool */
    await page.getByRole('tab', {name: /Models/}).tap();
    ok('class: the segmented control switches to Models (Flow, 1 / 19)', JSON.stringify(await where(page)) === JSON.stringify({cls: 'Models', name: 'Flow', count: '1 / 19'}), JSON.stringify(await where(page)));
    await page.mouse.move(strip.x + 4, strip.y + 22); await page.mouse.down(); await page.mouse.move(strip.x + strip.width - 4, strip.y + 22, {steps: 10}); await page.mouse.up();
    ok('scrubber: across the 19 models it reaches 19 / 19', await until(async () => (await where(page)).count === '19 / 19'), JSON.stringify(await where(page)));
    /* thumbnails replace ticks where they fit */
    await page.getByRole('tab', {name: /Energy/}).tap();
    ok('scrubber: Energy (5) shows thumbnails, Instruments (15) shows ticks', await page.locator('.door-roster:not([hidden]) .door-thumb svg').first().isVisible() && await (async () => { await page.getByRole('tab', {name: /Instruments/}).tap(); return !(await page.locator('.door-roster:not([hidden]) .door-thumb svg').first().isVisible()); })());
    /* a tap on the art opens the tool */
    await visible(page).locator('.door-art').tap();
    ok('tap: a tap on the art opens the tool (Fermi)', await until(() => new URL(page.url()).pathname === '/fermi/'), page.url());
    ok('phone: nothing logged an error', errors.length === 0, errors.join(' | '));
    await c.close();
  }

  /* ---- landscape phone: the card goes side by side and the bar stays ---- */
  {
    const c = await phone({width: 812, height: 375}), page = await c.newPage();
    await page.goto(T + '/'); await ready(page);
    const g = await page.evaluate(() => { const a = document.querySelector('.is-current .door-art').getBoundingClientRect(), b = document.querySelector('.is-current .door-body').getBoundingClientRect(), n = document.querySelector('.door-nav').getBoundingClientRect(), t = document.querySelector('.door-classes').getBoundingClientRect(); return {artRight: a.right, bodyLeft: b.left, artTop: a.top, bodyTop: b.top, navBottom: n.bottom, tabsBottom: t.bottom, h: innerHeight, sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth}; });
    ok('landscape: art left, text right', g.artRight <= g.bodyLeft + 1 && Math.abs(g.artTop - g.bodyTop) < 80, JSON.stringify(g));
    ok('landscape: the bar stays on the bottom edge, no horizontal scroll', g.navBottom === g.h && g.tabsBottom === g.h && g.sw <= g.cw, JSON.stringify(g));
    await c.close();
  }

  /* ---- JavaScript off: four plain lists, every staged tool a visible link ---- */
  {
    const c = await context({viewport: LAPTOP, javaScriptEnabled: false}), page = await c.newPage();
    await page.goto(T + '/');
    const links = await page.locator('.door-card a.door-open').evaluateAll(as => as.map(a => { const r = a.getBoundingClientRect(); return {href: a.getAttribute('href'), seen: r.width > 0 && r.height > 0 && getComputedStyle(a).visibility === 'visible'}; }));
    ok(`no JS: all 46 tools are visible "Open" links (${links.length})`, links.length === 46 && links.every(l => l.seen), links.filter(l => !l.seen).map(l => l.href).join(' '));
    await page.setViewportSize({width: 320, height: 800});
    ok('no JS: no horizontal scroll at 320', await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth));
    await page.setViewportSize(LAPTOP);
    ok('no JS: four class headings and no device chrome', JSON.stringify(await page.locator('.door-head h2').allTextContents()) === JSON.stringify(['Instruments', 'Models', 'Workbenches', 'Energy']) && await page.locator('.door-classes').count() === 0);
    ok('no JS: a card reads whole (kicker, name, description, three stats)', await page.locator('.door-card').nth(20).evaluate(li => li.querySelectorAll('.door-kicker, .door-name, .door-line, .door-stats > div').length === 6));
    await c.close();
  }

  /* ---- no flash of the lists, no layout shift on a normal load ---- */
  for(const [label, vp, opts] of [['laptop', LAPTOP, {}], ['phone', PHONE, {hasTouch: true, isMobile: true}]]){
    const c = await context({viewport: vp, ...opts});
    await c.addInitScript(() => {
      window.__cls = 0; window.__shown = [];
      new PerformanceObserver(l => { for(const e of l.getEntries()) if(!e.hadRecentInput) window.__cls += e.value; }).observe({type: 'layout-shift', buffered: true});
      new MutationObserver(() => {}).observe(document, {childList: true, subtree: true});
      const probe = () => { const r = document.querySelector('[data-door-rooms]'); if(r && !r.classList.contains('door-ready') && !r.classList.contains('door-plain') && getComputedStyle(r).visibility !== 'hidden') window.__shown.push(performance.now()); requestAnimationFrame(probe); };
      probe();
    });
    const page = await c.newPage();
    await page.goto(T + '/', {waitUntil: 'networkidle'}); await ready(page); await page.waitForTimeout(500);
    const m = await page.evaluate(() => ({cls: window.__cls, shown: window.__shown.length}));
    ok(`${label}: the unenhanced lists are never shown on a normal load`, m.shown === 0, String(m.shown));
    ok(`${label}: no layout shift on load (CLS ${m.cls.toFixed(3)})`, m.cls < 0.02, String(m.cls));
    await c.close();
  }

  /* ---- the returning strip: absent with empty storage, present with saved work ---- */
  {
    const c = await context({viewport: LAPTOP}), page = await c.newPage();
    await page.goto(T + '/'); await settle(page); await stripReady(page);
    const gap = () => page.evaluate(() => document.querySelector('.door-classes').getBoundingClientRect().top - document.querySelector('.catalogue-intro').getBoundingClientRect().bottom);
    const emptyGap = await gap();
    ok('strip: absent with empty storage', await page.locator('[data-door-resume]').isVisible() === false && await page.locator('[data-door-work] li').count() === 0 && await page.getByText('Pick up where you left off').isVisible() === false);
    ok(`strip: absent leaves no gap (${Math.round(emptyGap)}px between intro and the class row)`, emptyGap < 60);
    /* merely opening a tool is not work: Premortem and most Lab pages store a workspace the moment they load */
    for(const path of ['/premortem/', '/lab/reframe/', '/lab/delay/']){ await page.goto(T + path, {waitUntil: 'networkidle'}); await page.waitForTimeout(1200); }
    await page.goto(T + '/'); await settle(page); await stripReady(page);
    ok('strip: opening tools without saving anything does not fill it', await page.locator('[data-door-resume]').isVisible() === false, (await page.locator('[data-door-resume]').textContent()).replace(/\s+/g, ' ').trim().slice(0, 140));

    /* seed with the real record shape: the store's own add() validates it */
    const hash = await encodeHash({t: 'title: Door fixture plan\nNow\n- First item'});
    await page.evaluate(async ({hash}) => {
      const {recentStore} = await import('/assets/recent-store.js');
      const store = recentStore(localStorage, 'tools');
      const at = Date.now();
      store.add({id: 'door-seed-a', tool: 'roadmap', name: 'Fixture roadmap', hash, savedAt: at});
      for(const [i, id] of ['b', 'c', 'd'].entries()) store.add({id: 'door-seed-' + id, tool: 'roadmap', name: 'Older fixture ' + id, hash, savedAt: at - (i + 1) * 1000});
      localStorage.setItem('tools:catalogue:favourite:v1:product:rank', '1');
    }, {hash});
    await page.reload(); await settle(page); await stripReady(page);
    ok('strip: present once a saved copy is stored', await until(() => page.locator('[data-door-resume]').isVisible()));
    const items = await page.locator('[data-door-work] li').count();
    ok(`strip: at most three items of the four stored (${items})`, items === 3);
    const first = page.locator('[data-door-work] li a').first();
    ok('strip: the newest item is first and shows its name', (await first.locator('.door-name').textContent()) === 'Fixture roadmap');
    ok('strip: an item says which tool it belongs to', (await first.textContent()).includes('Roadmap'));
    const href = await first.getAttribute('href');
    ok('strip: the item links to its tool with the saved model in the hash', href === '/roadmap/#' + hash, href);
    ok('strip: favourites appear, linking to the favourite', await page.locator('[data-door-favourite-links] a').first().getAttribute('href') === '/rank/' && (await page.locator('[data-door-favourite-links]').textContent()) === 'Rank');
    ok('strip: a link on to Your work', await page.locator('[data-door-resume] .door-resume-all a').getAttribute('href') === '/explore/#recent-work');
    await page.setViewportSize(PHONE);
    const oneLine = await page.evaluate(() => { const vis = [...document.querySelectorAll('[data-door-resume] a')].filter(a => a.getBoundingClientRect().width > 0); const strip = document.querySelector('[data-door-resume]').getBoundingClientRect(); return {links: vis.map(a => a.textContent.trim().slice(0, 40) + ' ' + Math.round(a.getBoundingClientRect().width) + 'x' + Math.round(a.getBoundingClientRect().height)), small: vis.filter(a => a.getBoundingClientRect().width < 44 || a.getBoundingClientRect().height < 44).length, height: strip.height}; });
    ok('strip: on a phone it is one line, "Continue: <name> ›" plus "Your work", both at least 44x44', oneLine.links.length === 2 && oneLine.small === 0 && oneLine.height <= 60 && /^Fixture roadmap/.test(oneLine.links[0]) && /Your work/.test(oneLine.links[1]) && /Continue/.test(await page.locator('[data-door-work] li:first-child .door-name').evaluate(el => getComputedStyle(el, '::before').content)), JSON.stringify(oneLine));
    const stageIn = await page.evaluate(() => { const o = document.querySelector('.is-current .door-open').getBoundingClientRect(), n = document.querySelector('.door-nav').getBoundingClientRect(); return {open: o.bottom, nav: n.top}; });
    ok('strip: with the strip present the Open button is still clear of the bar on the first screen', stageIn.open <= stageIn.nav, JSON.stringify(stageIn));
    await page.setViewportSize({width: 375, height: 667});
    const stageSmall = await page.evaluate(() => { const o = document.querySelector('.is-current .door-open').getBoundingClientRect(), n = document.querySelector('.door-nav').getBoundingClientRect(); return {open: o.bottom, nav: n.top}; });
    ok('strip: at 375x667 too, the stage is not pushed under the bar', stageSmall.open <= stageSmall.nav, JSON.stringify(stageSmall));
    await page.setViewportSize(LAPTOP);
    const gapWith = await gap();
    ok(`strip: present pushes the class row down (${Math.round(gapWith)}px > ${Math.round(emptyGap)}px)`, gapWith > emptyGap + 60);
    /* the link really works: it lands on the tool, with the model, and nothing errors */
    const errors = trackErrors(page);
    await first.click(); await page.waitForURL(u => u.pathname === '/roadmap/');
    ok('strip: following the item opens the tool with the saved hash', new URL(page.url()).hash === '#' + hash);
    ok('strip: opening it logged no errors', errors.length === 0, errors.join(' | '));
    /* Your work on /explore/ lists the same work (the full shelf the strip points at) */
    await page.goto(T + '/explore/#recent-work');
    await page.locator('#recent-work .work-disclosure-summary').waitFor({state: 'visible'});
    ok('strip: Your work at /explore/#recent-work opens on the full shelf', await page.locator('#recent-work').isVisible() && (await page.locator('#recent-work .work-disclosure-summary').textContent()).includes('saved'));
    await c.close();
  }

  /* ---- every link resolves, on the right origin ---- */
  {
    const c = await context({viewport: LAPTOP}), page = await c.newPage();
    await page.goto(T + '/'); await settle(page); await stripReady(page); await ready(page);
    const hrefs = await page.locator('a[href]').evaluateAll(links => [...new Set(links.map(a => a.getAttribute('href')))]);
    const local = hrefs.filter(h => h.startsWith('/') || h.startsWith('#')), external = hrefs.filter(h => /^https:\/\//.test(h));
    ok('links: there are many to check', local.length >= 46, String(local.length));
    ok('links: external links are the personal site and the source only', external.every(h => /^https:\/\/(www\.matthewgarner\.me|github\.com\/MatthewGarner\/tools)(\/|$)/.test(h)), external.join(' '));
    for(const href of local){
      if(href.startsWith('#')){ ok(`link ${href}: the target exists on the page`, await page.locator('[id="' + href.slice(1) + '"]').count() === 1); continue; }
      const path = href.split('#')[0];
      const r = await c.request.get(T + path);
      ok(`link ${href}: 200 on the tools origin`, r.status() === 200, String(r.status()));
      if(path.startsWith('/energy/')){
        /* production sends /energy/... to the Energy host, which serves the same page at the root */
        const energyPath = path.slice('/energy'.length) || '/';
        const er = await c.request.get(E + energyPath);
        ok(`link ${href}: 200 on the Energy origin as ${energyPath}`, er.status() === 200, String(er.status()));
      }
    }
    for(const dir of ENERGY_TOOL_DIRS) ok(`the Energy row links ${dir}`, local.includes('/energy/' + dir + '/'));
    await c.close();
  }

  /* ---- no tool engine, no Lab gallery, no editor ---- */
  {
    const c = await context({viewport: LAPTOP}), page = await c.newPage(), urls = [];
    page.on('request', r => urls.push(new URL(r.url()).pathname));
    await page.goto(T + '/', {waitUntil: 'networkidle'}); await stripReady(page);
    const engineDirs = [...TOOL_DIRS, ...ENERGY_TOOL_DIRS.map(d => 'energy/' + d), 'lab'];
    const engine = urls.filter(p => engineDirs.some(d => p.startsWith('/' + d + '/') && /\.(m?js|css)$/.test(p)));
    ok('weight: a known-positive request is seen (the listener works)', urls.includes('/assets/front-door.js') && urls.includes('/assets/front-door.css'), urls.join(' '));
    ok('weight: no tool engine script or stylesheet is requested', engine.length === 0, engine.join(' '));
    ok('weight: gallery.js is not requested', !urls.some(p => p.endsWith('gallery.js')));
    ok('weight: no Lab page asset is requested', !urls.some(p => /^\/lab\//.test(p)) && LAB_ROUTES.length > 0);
    ok('weight: no template editor, work library or Your work module', !urls.some(p => /\/assets\/(template-ui|template-store|work-library|work-actions|your-work|recent-work|tool-work|explore)\.js$/.test(p)), urls.join(' '));
    ok('weight: the sketches are inline SVG, not image requests', urls.every(p => !/\.(svg|png)$/.test(p) || p.startsWith('/assets/icons/') || p.includes('/fonts/')) && await page.locator('.door-card svg.sketch').count() === 46);
    await c.close();
  }

  /* ---- light and dark: renders, no console errors ---- */
  {
    const colours = {};
    for(const scheme of ['light', 'dark']){
      const c = await context({viewport: LAPTOP, colorScheme: scheme}), page = await c.newPage(), errors = trackErrors(page);
      await page.goto(T + '/', {waitUntil: 'networkidle'}); await settle(page); await stripReady(page);
      colours[scheme] = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
      const painted = await page.locator('.is-current svg.sketch').first().evaluate(svg => { const s = getComputedStyle(svg.querySelector('[stroke]')); return s.stroke; });
      ok(`${scheme}: the page rendered and logged no errors`, await page.locator('.door-card').count() === 46 && errors.length === 0, errors.join(' | '));
      ok(`${scheme}: sketch strokes resolve to the scoped --sketch-line (${painted})`, painted === (scheme === 'light' ? 'rgb(163, 163, 159)' : 'rgb(108, 104, 116)'), painted);
      await c.close();
    }
    ok(`light and dark paint different backgrounds (${colours.light} vs ${colours.dark})`, colours.light !== colours.dark);
  }

  /* ---- works offline from the Product service worker after one online visit ---- */
  {
    const c = await context({viewport: LAPTOP, serviceWorkers: 'allow'}), page = await c.newPage();
    await page.goto(T + '/', {waitUntil: 'networkidle'});
    const installed = await page.evaluate(() => Promise.race([navigator.serviceWorker.ready.then(() => true), new Promise(resolve => setTimeout(() => resolve(false), 15000))]));
    ok('offline: the service worker installs (if not: an integrity hash is stale, run npm run sync)', installed);
    if(installed){
      /* a stored copy proves the strip's module graph is cached too, not just the markup */
      const hash = await encodeHash({t: 'title: Offline fixture\nNow\n- Item'});
      await page.evaluate(async ({hash}) => {
        const {recentStore} = await import('/assets/recent-store.js');
        recentStore(localStorage, 'tools').add({id: 'door-offline', tool: 'roadmap', name: 'Offline fixture', hash, savedAt: Date.now()});
      }, {hash});
      await page.reload({waitUntil: 'networkidle'});
      ok('offline: the worker controls the reloaded page before going offline', await until(() => page.evaluate(() => !!navigator.serviceWorker.controller), {timeout: 15000}));
      await c.setOffline(true);
      await page.reload({waitUntil: 'domcontentloaded'});
      ok('offline: the device renders (46 cards, the class row)', await until(() => page.locator('.door-rooms.door-ready .door-card').count().then(n => n === 46), {timeout: 8000}) && await page.locator('[role=tab]').count() === 4);
      ok('offline: the page is styled from the cache (the class row is a grid)', await until(() => page.locator('.door-classes').evaluate(el => getComputedStyle(el).display === 'grid'), {timeout: 8000}));
      ok('offline: the returning strip works from the cached modules', await until(() => page.locator('[data-door-work] li a').first().textContent().then(t => t.includes('Offline fixture')), {timeout: 8000}));
      ok('offline: all 46 sketches are in the page', await page.locator('.door-card svg.sketch').count() === 46);
    }
    await c.close();
  }
} catch(error){
  ok('the suite ran to the end without a crash', false, String(error?.stack || error).split('\n').slice(0, 3).join(' / '));
} finally {
  await Promise.race([Promise.all([...live].map(c => c.close().catch(() => {}))).then(() => browser.close()), new Promise(r => setTimeout(r, 10000))]);
}
results.forEach(r => console.log(r));
report('front-door', {...tally(results), min: 120});
