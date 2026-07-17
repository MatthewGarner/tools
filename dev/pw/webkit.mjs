/* Real-WebKit (Safari engine) smoke — the gap that let two "unstyled on Safari
   iOS" bugs ship. mobile.mjs runs Blink with iPhone metrics, so Safari-specific
   layout/CSP/paint regressions never surface there; this launches webkit.launch()
   (the actual engine WebKit ships) at iPhone-13 viewport and, per tool × both
   themes, asserts the four things those bugs broke: the stylesheet applied at all,
   no page/CSP errors, and no horizontal overflow. Not a duplicate of mobile.mjs's
   tap-target/font math (that's engine-agnostic) — this is specifically "does it
   render on Safari". Run from dev/pw with both servers up (:8087 tools, :8089
   energy), same BASE/EBASE knobs as the siblings. Needs the webkit browser:
   `npx playwright install webkit` once. SHOTS=1 dumps screenshots for eyeballing. */
import {webkit, devices} from 'playwright';
import {report} from './_harness.mjs';
import {mkdirSync} from 'node:fs';
import {TOOL_DIRS, ENERGY_TOOL_DIRS} from '../tool-dirs.mjs';
import {END_STATES, measureEndState, assertEndState} from './end-states.mjs';

const T = process.env.BASE || 'http://localhost:8087';
const E = process.env.EBASE || 'http://localhost:8089';
const SHOTS = process.env.SHOTS ? '/tmp/wk-shots' : null;
if(SHOTS) mkdirSync(SHOTS, {recursive: true});

// DERIVED from tool-dirs.mjs (+ the two landing pages) so a new tool can never be
// silently skipped by this real-Safari gate — see mobile.mjs for the same pattern.
const TOOLS = [
  ...TOOL_DIRS.map(d => [T, d]), [T, ''],
  ...ENERGY_TOOL_DIRS.map(d => [E, d]), [E, ''],
];

let pass = 0, fail = 0;
const ok = (c, m) => { if(c){ pass++; console.log('PASS', m); } else { fail++; console.log('FAIL', m); } };

const browser = await webkit.launch();
console.log('real WebKit', browser.version(), '\n');

for(const theme of ['light', 'dark']){
  const ctx = await browser.newContext({...devices['iPhone 13'],
    colorScheme: theme === 'dark' ? 'dark' : 'light', reducedMotion: 'reduce'});
  for(const [base, path] of TOOLS){
    const page = await ctx.newPage();
    const errs = [], csp = [];
    page.on('pageerror', e => errs.push(String(e).split('\n')[0]));
    page.on('console', m => { if(m.type() === 'error'){ const t = m.text();
      (/Content Security Policy|violates/.test(t) ? csp : errs).push(t.slice(0, 120)); } });
    const label = (base === E ? 'energy/' : '') + (path || 'home') + ' [' + theme + ']';
    try{
      await page.goto(base + '/' + (path ? path + '/' : ''), {waitUntil: 'networkidle', timeout: 20000});
      await page.waitForTimeout(200);
      const m = await page.evaluate(() => {
        const de = document.scrollingElement || document.documentElement;
        return {sw: de.scrollWidth, cw: de.clientWidth,
          bg: getComputedStyle(document.body).backgroundColor,
          // the stylesheet applying at all: the header h1 must resolve to the
          // Charter/serif display stack from tokens.css, not the UA default
          serif: /charter|georgia|serif/i.test(
            getComputedStyle(document.querySelector('h1') || document.body).fontFamily)};
      });
      ok(m.sw - m.cw <= 1, label + ': no horizontal overflow (' + m.sw + ' <= ' + m.cw + ')');
      ok(m.bg && m.bg !== 'rgba(0, 0, 0, 0)', label + ': body background styled (' + m.bg + ')');
      ok(m.serif, label + ': display font stack applied (stylesheet loaded)');
      ok(errs.length === 0, label + ': no page errors' + (errs.length ? ' — ' + errs.slice(0, 2).join(' | ') : ''));
      ok(csp.length === 0, label + ': no CSP violations' + (csp.length ? ' — ' + csp.slice(0, 2).join(' | ') : ''));
      if(SHOTS) await page.screenshot({path: SHOTS + '/' + (base === E ? 'energy-' : '') + (path || 'home') + '-' + theme + '.png'});
    }catch(e){
      ok(false, label + ': loads — ' + String(e).split('\n')[0]);
    }
    await page.close();
  }
  await ctx.close();
}

/* End-state legibility on the REAL Safari engine (shared table+measure with mobile.mjs).
   The shrink-to-fit bug class shipped TWICE specifically past the Blink-emulated suites,
   so the interaction-reached payoff artefacts get gated on WebKit too, not just Blink. */
{
  const ctx = await browser.newContext({...devices['iPhone 13'], reducedMotion: 'reduce'});
  for(const es of END_STATES){
    const base = es.origin === 'E' ? E : T;
    const page = await ctx.newPage();
    const loaded = await page.goto(base + es.path, {waitUntil: 'networkidle', timeout: 20000}).then(() => true).catch(() => false);
    if(!loaded){ ok(false, `${es.name} (webkit): end-state loads`); await page.close(); continue; }
    await page.waitForTimeout(500);
    await assertEndState(page, ok, es.name + ' (webkit)', await measureEndState(page, es.sel, es.readySel), es.sel);
    await page.close();
  }
  await ctx.close();
}

/* motion-on carve-out: the rest of this suite forces reduced-motion, so the
   stroke-dashoffset/getTotalLength reveal path is otherwise only exercised on
   Blink (motion.mjs). Confirm the curves actually draw on the REAL Safari engine
   — the "renders on Blink, breaks on Safari" class that shipped twice. */
{
  const ctx = await browser.newContext({...devices['iPhone 13']});   // motion ON
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', e => errs.push(String(e).split('\n')[0]));
  try{
    await page.goto(T + '/alarm/', {waitUntil: 'networkidle', timeout: 20000});
    await page.waitForTimeout(150);
    const drew = await page.evaluate(() => document.querySelectorAll('#distwrap .mo-draw').length);
    ok(drew >= 1, 'motion(webkit): alarm curves stroke-draw on real Safari (.mo-draw ' + drew + ')');
    ok(errs.length === 0, 'motion(webkit): no page errors' + (errs.length ? ' — ' + errs[0] : ''));
  }catch(e){ ok(false, 'motion(webkit): alarm loads — ' + String(e).split('\n')[0]); }
  await ctx.close();
}

/* tree B4 (real WebKit): the coarse-pointer sticky-bottom explore bar is
   CSS-only (`@media (pointer:coarse)`), and this file exists precisely
   because Blink-emulated coarse-pointer checks (mobile.mjs, which walks the
   full card-menu → Explore… → slider mechanism) have twice missed a real-
   Safari-only layout break. Engage the same path here and confirm the
   fixed-position bar renders without blowing out the page on the actual
   WebKit engine at phone width. */
{
  const ctx = await browser.newContext({...devices['iPhone 13'], reducedMotion: 'reduce'});
  const page = await ctx.newPage();
  try{
    await page.goto(T + '/tree/', {waitUntil: 'networkidle', timeout: 20000});
    await page.waitForTimeout(900);
    const line = await page.evaluate(() => {
      const el = document.querySelector('#preview svg [data-hot]');
      return el ? el.dataset.line : null;
    });
    if(line !== null){
      const marker = page.locator(`#preview svg [data-menu][data-line="${line}"]`);
      const box = await marker.locator('[data-hit]').boundingBox();
      if(box) await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
      await page.waitForTimeout(300);
      const row = page.locator('.eip-pop button', {hasText: 'Explore'}).first();
      if(await row.count()) await row.click();
      await page.waitForTimeout(300);
    }
    const m = await page.evaluate(() => {
      const de = document.scrollingElement || document.documentElement;
      const bar = document.getElementById('explorebar');
      return {sw: de.scrollWidth, cw: de.clientWidth,
        barVisible: bar ? (getComputedStyle(bar).display !== 'none' && !bar.hidden) : false,
        barFixed: bar ? getComputedStyle(bar).position === 'fixed' : false};
    });
    ok(m.sw - m.cw <= 1, `tree (webkit): the sticky explore bar causes no horizontal overflow (${m.sw} <= ${m.cw})`);
    ok(m.barVisible && m.barFixed, 'tree (webkit): the explore bar engaged via the card menu and is position:fixed on a coarse pointer');
  }catch(e){
    ok(false, 'tree (webkit): sticky explore bar check — ' + String(e).split('\n')[0]);
  }
  await page.close();
  await ctx.close();
}
await browser.close();
if(SHOTS) console.log('  (shots: ' + SHOTS + ')');
report('webkit', {pass, fail, min: TOOLS.length * 2});   // ≥1 check/tool/theme; catches a crash or empty derived list
