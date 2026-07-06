/* PWA checks: manifest served + sane, service worker registers, and a visited
   page reloads offline. Run from dev/pw: node pwa.mjs  (server on :8087) */
import {chromium} from 'playwright';

const BASE = process.env.BASE || 'http://localhost:8087';
const browser = await chromium.launch();
const results = [];
const check = (name, ok) => results.push((ok ? 'PASS ' : 'FAIL ') + name);

const ctx = await browser.newContext();
const page = await ctx.newPage();
await page.goto(BASE + '/', {waitUntil: 'networkidle'});

check('manifest link present', await page.locator('link[rel="manifest"]').count() === 1);
const mf = await page.evaluate(async () => {
  const r = await fetch('/manifest.webmanifest');
  return r.ok ? r.json() : null;
});
check('manifest fetches with icons + standalone', !!mf && mf.display === 'standalone' && mf.icons.length >= 3);
const iconOk = await page.evaluate(async () => (await fetch('/assets/icons/icon-512.png')).ok);
check('icon-512 served', iconOk);

const swState = await page.evaluate(async () => {
  const reg = await navigator.serviceWorker.ready;
  return reg && reg.active ? reg.active.state : 'none';
});
check('service worker active', swState === 'activated');

/* warm two pages, then reload them offline */
await page.goto(BASE + '/flow/', {waitUntil: 'networkidle'});
await page.waitForTimeout(800);
await page.goto(BASE + '/', {waitUntil: 'networkidle'});
await page.waitForTimeout(400);
await ctx.setOffline(true);
await page.reload({waitUntil: 'domcontentloaded'});
check('landing reloads offline', (await page.locator('a.tool').count()) >= 9);
await page.goto(BASE + '/flow/', {waitUntil: 'domcontentloaded'});
await page.waitForTimeout(800);
check('visited tool works offline', await page.locator('#verdictwrap svg').count() === 1);
await ctx.setOffline(false);
await ctx.close();

console.log(results.join('\n'));
await browser.close();
process.exit(results.some(r => r.startsWith('FAIL')) ? 1 : 0);
