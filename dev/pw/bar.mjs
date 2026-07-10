/* The composition bar: side-by-side contact sheets of a tool against a
   shipped sibling, both themes, desktop AND phone. A new tool is reviewed by
   LOOKING at these — "would it survive next to the reference?" — before any
   preview deploy. Usage (from dev/pw, server(s) up):

     node bar.mjs /wardley/ [/map/] [outdir]

   Writes bar-desktop.png and bar-phone.png (reference left, candidate right,
   light above dark) into outdir (default: this repo's .bar/ — gitignored). */
import {chromium, devices} from 'playwright';
import {mkdirSync, writeFileSync} from 'node:fs';

const BASE = process.env.BASE || 'http://localhost:8087';
const tool = process.argv[2];
const ref = process.argv[3] || '/map/';
const outdir = process.argv[4] || new URL('../../.bar/', import.meta.url).pathname;
if(!tool){ console.error('usage: node bar.mjs /tool/ [/reference/] [outdir]'); process.exit(2); }
mkdirSync(outdir, {recursive: true});

const browser = await chromium.launch();

async function shot(path, theme, phone){
  const ctx = phone
    ? await browser.newContext({...devices['iPhone 13'], colorScheme: theme})
    : await browser.newContext({viewport: {width: 1440, height: 950}, colorScheme: theme});
  const page = await ctx.newPage();
  await page.goto(BASE + path, {waitUntil: 'networkidle'}).catch(() => {});
  await page.waitForTimeout(900);
  /* desktop compares the rendered artefact; PHONE always captures the full
     page — page chrome (scaffold, actions row, about band) must face review
     too, or an unstyled page hides behind a pretty SVG (the wardley lesson) */
  const el = page.locator('#preview svg, .stage svg, #chartwrap svg, main svg').first();
  const buf = (!phone && await el.count())
    ? await el.screenshot().catch(() => page.screenshot({fullPage: true}))
    : await page.screenshot({fullPage: true});
  await ctx.close();
  return buf.toString('base64');
}

async function sheet(phone, out){
  const cells = [];
  for(const theme of ['light', 'dark'])
    for(const p of [ref, tool])
      cells.push({theme, p, b64: await shot(p, theme, phone)});
  const page = await browser.newPage({viewport: {width: phone ? 900 : 2960, height: 400}});
  const w = phone ? 400 : 1440;
  await page.setContent('<body style="margin:0;background:#888;font-family:system-ui">' +
    '<div style="display:grid;grid-template-columns:repeat(2,' + w + 'px);gap:16px;padding:16px;width:max-content">' +
    cells.map(cl =>
      '<figure style="margin:0"><figcaption style="font-size:12px;padding:2px 4px;color:#fff">' +
      cl.p + ' · ' + cl.theme + (cl.p === ref ? ' (reference)' : ' (candidate)') + '</figcaption>' +
      '<img style="width:' + w + 'px;display:block" src="data:image/png;base64,' + cl.b64 + '"></figure>'
    ).join('') + '</div></body>');
  await page.waitForTimeout(300);
  const grid = page.locator('div').first();
  writeFileSync(out, await grid.screenshot());
  await page.close();
  console.log('wrote', out);
}

await sheet(false, outdir + 'bar-desktop.png');
await sheet(true, outdir + 'bar-phone.png');
await browser.close();
console.log('Now LOOK at both sheets: does the candidate survive next to the reference?');
