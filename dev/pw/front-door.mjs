/* Front door gate (spec 2026-11-11 section 3). The page at `/` is generated and static, so the
   contract is what a visitor sees: the first screen on a phone, the job titles on a laptop, a
   returning strip that exists only when this browser has work, every link resolving, no tool
   engine loaded, and the page working offline from the Product service worker.
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
const PHONE = {width: 375, height: 812}, LAPTOP = {width: 1280, height: 800};

try {
  /* ---- 375x812: the first screen, the page's length, tap targets ---- */
  {
    const c = await context({viewport: PHONE}), page = await c.newPage(), errors = trackErrors(page);
    await page.goto(T + '/'); await settle(page); await stripReady(page);
    const box = sel => page.locator(sel).first().evaluate(el => { const r = el.getBoundingClientRect(); return {top: r.top + scrollY, bottom: r.bottom + scrollY, left: r.left, right: r.right, width: r.width, height: r.height}; });
    const heading = await box('#instruments h2'), name = await box('.door-job:first-child .door-flagship .door-name'), sketch = await box('.door-job:first-child .door-flagship svg.sketch');
    ok('phone: the Instruments heading is fully inside the first screen', heading.top >= 0 && heading.bottom <= 812, JSON.stringify(heading));
    ok('phone: the first job\'s flagship name is fully inside the first screen', name.top >= 0 && name.bottom <= 812, JSON.stringify(name));
    ok('phone: the first job\'s flagship sketch is fully inside the first screen and drawn', sketch.top >= 0 && sketch.bottom <= 812 && sketch.width >= 40 && sketch.height >= 15, JSON.stringify(sketch));
    ok('phone: the first flagship is Fermi', (await page.locator('.door-job:first-child .door-flagship .door-name').textContent()) === 'Fermi');
    const height = await page.evaluate(() => document.documentElement.scrollHeight);
    ok(`phone: the whole page is at most 3,300px tall (${height})`, height <= 3300);
    const small = await page.locator('main a').evaluateAll(links => links.filter(a => { const r = a.getBoundingClientRect(); return r.width > 0 && (r.width < 44 || r.height < 44); }).map(a => a.textContent.trim().slice(0, 30) + ' ' + Math.round(a.getBoundingClientRect().width) + 'x' + Math.round(a.getBoundingClientRect().height)));
    ok('phone: every link in the page is at least 44x44', small.length === 0, small.join('; '));
    ok('phone: there are links to measure', await page.locator('main a:visible').count() >= 35);
    const stacked = await page.locator('.door-job').first().evaluate(row => { const cols = getComputedStyle(row).gridTemplateColumns.split(' ').length; return cols; });
    ok('phone: a job row stacks into one column', stacked === 1, String(stacked));
    ok('phone: nothing logged an error', errors.length === 0, errors.join(' | '));
    await c.close();
  }

  /* ---- no horizontal scroll at four widths ---- */
  for(const width of [320, 375, 768, 1280]){
    const c = await context({viewport: {width, height: 800}}), page = await c.newPage();
    await page.goto(T + '/'); await settle(page); await stripReady(page);
    const over = await page.evaluate(() => ({scroll: document.documentElement.scrollWidth, client: document.documentElement.clientWidth}));
    ok(`${width}px: no horizontal scroll (${over.scroll} <= ${over.client})`, over.scroll <= over.client);
    await c.close();
  }

  /* ---- 1280x800: all five job titles inside the first two screens ---- */
  {
    const c = await context({viewport: LAPTOP}), page = await c.newPage();
    await page.goto(T + '/'); await settle(page); await stripReady(page);
    const titles = await page.locator('.door-job-title').evaluateAll(els => els.map(el => ({text: el.textContent, top: Math.round(el.getBoundingClientRect().top + scrollY), bottom: Math.round(el.getBoundingClientRect().bottom + scrollY)})));
    ok('laptop: the five jobs are Size it, Choose, Plan it, Test the argument, Make the case, in that order',
      JSON.stringify(titles.map(t => t.text)) === JSON.stringify(['Size it', 'Choose', 'Plan it', 'Test the argument', 'Make the case']), JSON.stringify(titles));
    ok(`laptop: every job title is inside the first two screens (last bottom ${titles.at(-1)?.bottom}px <= 1600)`, titles.length === 5 && titles.every(t => t.bottom <= 1600));
    const order = await page.evaluate(() => [...document.querySelectorAll('main section[id], main header + section')].map(s => s.id));
    ok('laptop: the rooms run Instruments, Models, Workbenches, Energy', JSON.stringify(order.filter(Boolean).filter(id => id !== 'resume')) === JSON.stringify(['instruments', 'models', 'workbenches', 'energy']), order.join(','));
    ok('laptop: no filter bar on the front door', await page.locator('input[type=search], [data-explore-form], select').count() === 0);
    ok('laptop: the masthead item is Tools Lab and current', await page.locator('.mg-nav [data-suite-link="explore"][aria-current="page"]').textContent() === 'Tools Lab' && await page.locator('.mg-nav [aria-current]').count() === 1);
    ok('laptop: Instruments for judgement is retired from the page', !(await page.locator('body').innerText()).toLowerCase().includes('instruments for judgement'));
    await c.close();
  }

  /* ---- the returning strip: absent with empty storage, present with saved work ---- */
  {
    const c = await context({viewport: LAPTOP}), page = await c.newPage();
    await page.goto(T + '/'); await settle(page); await stripReady(page);
    const gap = () => page.evaluate(() => document.querySelector('#instruments').getBoundingClientRect().top - document.querySelector('.catalogue-intro').getBoundingClientRect().bottom);
    const emptyGap = await gap();
    ok('strip: absent with empty storage', await page.locator('[data-door-resume]').isVisible() === false && await page.locator('[data-door-work] li').count() === 0 && await page.getByText('Pick up where you left off').isVisible() === false);
    ok(`strip: absent leaves no gap (${Math.round(emptyGap)}px between intro and Instruments)`, emptyGap < 60);

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
    const smallStrip = await page.locator('[data-door-resume] a:visible').evaluateAll(links => links.filter(a => { const r = a.getBoundingClientRect(); return r.width < 44 || r.height < 44; }).map(a => a.textContent.trim().slice(0, 30)));
    ok('strip: its links are at least 44x44 on a phone', smallStrip.length === 0 && await page.locator('[data-door-resume] a:visible').count() >= 5, smallStrip.join('; '));
    await page.setViewportSize(LAPTOP);
    const gapWith = await gap();
    ok(`strip: present pushes Instruments down (${Math.round(gapWith)}px > ${Math.round(emptyGap)}px)`, gapWith > emptyGap + 60);
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
    await page.goto(T + '/'); await settle(page); await stripReady(page);
    const hrefs = await page.locator('a[href]').evaluateAll(links => [...new Set(links.map(a => a.getAttribute('href')))]);
    const local = hrefs.filter(h => h.startsWith('/') || h.startsWith('#')), external = hrefs.filter(h => /^https:\/\//.test(h));
    ok('links: there are many to check', local.length >= 35, String(local.length));
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
    /* "All N models" opens a catalogue list of exactly N */
    const all = page.getByRole('link', {name: /^All \d+ models$/});
    const n = Number((await all.textContent()).match(/\d+/)[0]);
    await all.click(); await page.waitForURL(u => u.pathname === '/explore/');
    await page.locator('[data-result-count]').waitFor();
    ok(`models: "All ${n} models" opens ${n} rows`, await until(async () => (await page.locator('[data-catalog-id]:not([hidden])').count()) === n), String(await page.locator('[data-catalog-id]:not([hidden])').count()));
    ok('models: the list it opens is the models filter', new URL(page.url()).searchParams.get('type') === 'model');
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
    ok('weight: the sketches are inline SVG, not image requests', urls.every(p => !/\.(svg|png)$/.test(p) || p.startsWith('/assets/icons/') || p.includes('/fonts/')) && await page.locator('svg.sketch').count() === 11);
    await c.close();
  }

  /* ---- light and dark: renders, no console errors ---- */
  {
    const colours = {};
    for(const scheme of ['light', 'dark']){
      const c = await context({viewport: LAPTOP, colorScheme: scheme}), page = await c.newPage(), errors = trackErrors(page);
      await page.goto(T + '/', {waitUntil: 'networkidle'}); await settle(page); await stripReady(page);
      colours[scheme] = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
      const painted = await page.locator('svg.sketch').first().evaluate(svg => { const s = getComputedStyle(svg.querySelector('[stroke]')); return s.stroke; });
      ok(`${scheme}: the page rendered and logged no errors`, await page.locator('.door-job').count() === 5 && errors.length === 0, errors.join(' | '));
      ok(`${scheme}: sketch strokes resolve to a colour, not nothing`, !!painted && painted !== 'none' && painted !== 'rgba(0, 0, 0, 0)', painted);
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
      ok('offline: the Instruments room renders', await until(() => page.locator('#instruments .door-job').count().then(n => n === 5), {timeout: 8000}));
      ok('offline: the page is styled from the cache (jobs are a grid)', await until(() => page.locator('.door-job').first().evaluate(el => getComputedStyle(el).display === 'grid'), {timeout: 8000}));
      ok('offline: the returning strip works from the cached modules', await until(() => page.locator('[data-door-work] li a').first().textContent().then(t => t.includes('Offline fixture')), {timeout: 8000}));
      ok('offline: all eleven sketches are in the page', await page.locator('svg.sketch').count() === 11);
    }
    await c.close();
  }
} catch(error){
  ok('the suite ran to the end without a crash', false, String(error?.stack || error).split('\n').slice(0, 3).join(' / '));
} finally {
  await Promise.race([Promise.all([...live].map(c => c.close().catch(() => {}))).then(() => browser.close()), new Promise(r => setTimeout(r, 10000))]);
}
results.forEach(r => console.log(r));
report('front-door', {...tally(results), min: 70});
