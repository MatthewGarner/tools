/* Mobile foundations gate: phone-width first-run behaviour for in-scope tools.
   Run from dev/pw with both servers up (:8087 tools, :8089 energy). */
import {chromium, devices} from 'playwright';

const T = 'http://localhost:8087', E = 'http://localhost:8089';
const AUTOLOAD = [
  ['roadmap', T + '/roadmap/'], ['tree', T + '/tree/'], ['why', T + '/why/'],
  ['map', T + '/map/'], ['cycles', E + '/cycles/'], ['risk', E + '/risk/'],
];
const ALL = [...AUTOLOAD,
  ['rank', T + '/rank/'], ['flow', T + '/flow/'], ['gauge', T + '/gauge/'],
  ['timeline', T + '/timeline/'], ['fermi', T + '/fermi/'], ['frequency', E + '/frequency/'],
];

let pass = 0, fail = 0;
const ok = (c, m) => { if(c){ pass++; console.log('PASS', m); } else { fail++; console.log('FAIL', m); } };

const browser = await chromium.launch();
const ctx = await browser.newContext({...devices['iPhone 13']});

for(const [name, url] of ALL){
  const page = await ctx.newPage();
  await page.goto(url, {waitUntil: 'networkidle'}).catch(()=>{});
  await page.waitForTimeout(900);
  const vw = await page.evaluate(() => innerWidth);
  const docSW = await page.evaluate(() => document.documentElement.scrollWidth);
  ok(docSW <= vw + 1, `${name}: no page-level horizontal scroll (${docSW} <= ${vw})`);
  await page.close();
}

for(const [name, url] of AUTOLOAD){
  const page = await ctx.newPage();
  await page.goto(url, {waitUntil: 'networkidle'}).catch(()=>{});
  await page.waitForTimeout(1000);
  const hash = await page.evaluate(() => location.hash);
  const hasOutput = await page.evaluate(() =>
    !!document.querySelector('.stage svg, .preview svg, #chartwrap svg, main svg, svg'));
  ok(hasOutput, `${name}: renders a default example on phone first-run`);
  ok(hash === '', `${name}: URL not polluted by auto-load (hash="${hash}")`);
  await page.close();
}

await browser.close();
console.log(`\n${pass} PASS, ${fail} FAIL`);
process.exit(fail ? 1 : 0);
