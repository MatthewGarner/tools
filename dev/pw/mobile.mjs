/* Mobile foundations gate: phone-width first-run behaviour for in-scope tools.
   Run from dev/pw with both servers up (:8087 tools, :8089 energy), or point
   BASE/EBASE at other servers — same env-knob convention as the sibling suites. */
import {chromium, devices} from 'playwright';

const T = process.env.BASE || 'http://localhost:8087';
const E = process.env.EBASE || 'http://localhost:8089';
const AUTOLOAD = [
  ['roadmap', T + '/roadmap/'], ['tree', T + '/tree/'], ['why', T + '/why/'],
  ['map', T + '/map/'], ['wardley', T + '/wardley/'], ['cycles', E + '/cycles/'], ['risk', E + '/risk/'],
];
const ALL = [...AUTOLOAD,
  ['rank', T + '/rank/'], ['flow', T + '/flow/'], ['gauge', T + '/gauge/'],
  ['timeline', T + '/timeline/'], ['fermi', T + '/fermi/'], ['frequency', E + '/frequency/'],
  ['intraday', E + '/intraday/'],
];

let pass = 0, fail = 0;
const ok = (c, m) => { if(c){ pass++; console.log('PASS', m); } else { fail++; console.log('FAIL', m); } };

const browser = await chromium.launch();
const ctx = await browser.newContext({...devices['iPhone 13']});

for(const [name, url] of ALL){
  const page = await ctx.newPage();
  await page.goto(url, {waitUntil: 'networkidle'}).catch(()=>{});
  await page.waitForTimeout(900);
  // clientWidth is the stable layout-viewport width; innerWidth expands to fit
  // overflowing content on mobile, which masks exactly the h-scroll we're testing for.
  const vw = await page.evaluate(() => document.documentElement.clientWidth);
  const docSW = await page.evaluate(() => document.documentElement.scrollWidth);
  ok(docSW <= vw + 1, `${name}: no page-level horizontal scroll (${docSW} <= ${vw})`);
  // A visible editable field under 16px makes iOS Safari zoom the page on focus. Guard it.
  const tiny = await page.evaluate(() => {
    for(const el of document.querySelectorAll('input[type=text],input[type=number],input:not([type]),textarea,.cm-content')){
      if(el.offsetParent === null) continue;
      if(parseFloat(getComputedStyle(el).fontSize) < 16) return (el.id || el.className.toString().slice(0, 20) || el.tagName);
    }
    return null;
  });
  ok(tiny === null, `${name}: no <16px editable field (iOS zoom-on-focus)${tiny ? ' — ' + tiny : ''}`);
  /* page-scaffold parity: the per-tool style.css must carry the house page
     (a tool once shipped with Times New Roman on a transparent body) */
  const parity = await page.evaluate(() => {
    const cs = getComputedStyle(document.body);
    const bg = getComputedStyle(document.documentElement).getPropertyValue('--bg').trim();
    const probe = document.createElement('div');
    probe.style.color = bg;
    document.body.appendChild(probe);
    const bgResolved = getComputedStyle(probe).color;
    probe.remove();
    const h1 = document.querySelector('h1');
    return {
      font: cs.fontFamily.includes('-apple-system') || cs.fontFamily.includes('system-ui'),
      bg: cs.backgroundColor === bgResolved,
      h1: h1 ? getComputedStyle(h1).fontFamily.includes('Charter') : true,
    };
  });
  ok(parity.font, `${name}: body wears the system font stack`);
  ok(parity.bg, `${name}: body background is the token --bg`);
  ok(parity.h1, `${name}: h1 wears Charter`);
  await page.close();
}

for(const [name, url] of AUTOLOAD){
  const page = await ctx.newPage();
  await page.goto(url, {waitUntil: 'networkidle'}).catch(()=>{});
  await page.waitForTimeout(1000);
  const hash = await page.evaluate(() => location.hash);
  const hasOutput = await page.evaluate(() =>
    !!document.querySelector('.stage svg, .preview svg, #chartwrap svg, main svg'));
  ok(hasOutput, `${name}: renders a default example on phone first-run`);
  ok(hash === '', `${name}: URL not polluted by auto-load (hash="${hash}")`);
  await page.close();
}

// Narrow no-overflow gate: the four tools whose charts/tables were just
// re-laid-out must not let their INNER render container overflow sideways —
// that's the "no sideways pan" guarantee this effort delivers. Page-level
// scroll is already covered above; this checks the container itself, since
// a workspace shell can clip page overflow while the container inside it
// still overflows (e.g. an oversized SVG or a fixed-width table row).
const CONTAINERS = [
  ['cycles', E + '/cycles/', ['#preview']],
  ['risk', E + '/risk/', ['#preview']],
  ['merit-order', E + '/merit-order/', ['#chartwrap']],
  ['rank', T + '/rank/', ['.tblwrap']],
  ['intraday', E + '/intraday/', ['#stackwrap', '#pricewrap']],
  ['wardley', T + '/wardley/', ['#preview']],
];

for(const [name, url, selectors] of CONTAINERS){
  const page = await ctx.newPage();
  await page.goto(url, {waitUntil: 'networkidle'}).catch(()=>{});
  await page.waitForTimeout(1000);
  for(const sel of selectors){
    const found = await page.evaluate((s) => !!document.querySelector(s), sel);
    if(!found){
      ok(false, `${name}: container ${sel} not found on page`);
      continue;
    }
    const {sw, cw} = await page.evaluate((s) => {
      const el = document.querySelector(s);
      return {sw: el.scrollWidth, cw: el.clientWidth};
    }, sel);
    ok(sw <= cw + 2, `${name}: ${sel} no horizontal overflow (${sw} <= ${cw})`);
  }
  await page.close();
}

await browser.close();
console.log(`\n${pass} PASS, ${fail} FAIL`);
process.exit(fail ? 1 : 0);
