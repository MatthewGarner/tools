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
import {mkdirSync} from 'node:fs';

const T = process.env.BASE || 'http://localhost:8087';
const E = process.env.EBASE || 'http://localhost:8089';
const SHOTS = process.env.SHOTS ? '/tmp/wk-shots' : null;
if(SHOTS) mkdirSync(SHOTS, {recursive: true});

const TOOLS = [
  [T, 'fermi'], [T, 'flow'], [T, 'rank'], [T, 'map'], [T, 'timeline'],
  [T, 'roadmap'], [T, 'tree'], [T, 'wardley'], [T, 'gauge'], [T, 'why'], [T, 'alarm'], [T, 'duel'], [T, ''],
  [E, ''], [E, 'risk'], [E, 'cycles'], [E, 'frequency'], [E, 'merit-order'], [E, 'intraday'],
];

let pass = 0, fail = 0;
const ok = (c, m) => { if(c){ pass++; console.log('PASS', m); } else { fail++; console.log('FAIL', m); } };

const browser = await webkit.launch();
console.log('real WebKit', browser.version(), '\n');

for(const theme of ['light', 'dark']){
  const ctx = await browser.newContext({...devices['iPhone 13'],
    colorScheme: theme === 'dark' ? 'dark' : 'light'});
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
await browser.close();
console.log('\n' + pass + ' PASS, ' + fail + ' FAIL' + (SHOTS ? '  (shots: ' + SHOTS + ')' : ''));
process.exit(fail ? 1 : 0);
