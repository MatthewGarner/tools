/* Screenshot the house example in each palette (light theme). */
import {chromium} from 'playwright';

const BASE = (process.env.BASE || 'http://localhost:8087') + '/roadmap/';
const doc = (p) => `title: Lantern — ${p} palette
palette: ${p}

NOW
Core: Resume where you left off [doing] -- top-requested fix
Growth: Referral flow [risk]

NEXT
Core: Reading reminders

LATER
Growth: Publisher storefront [done]`;

const browser = await chromium.launch();
const page = await browser.newPage({viewport: {width: 1200, height: 700}});
for(const p of ['ocean', 'slate', 'ember', 'plum']){
  const hash = Buffer.from(doc(p), 'utf8').toString('base64');
  await page.goto(BASE + '?v=' + p + '#' + hash, {waitUntil: 'networkidle'});
  await page.waitForTimeout(400);
  await page.locator('#preview svg').screenshot({path: 'palette-' + p + '.png'});
  console.log('saved palette-' + p + '.png');
}
await browser.close();
