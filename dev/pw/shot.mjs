/* Screenshot the rendered roadmap SVG (diagram only) for design iteration.
   Usage: node shot.mjs [light|dark] [outfile.png] */
import {chromium} from 'playwright';

const BASE = (process.env.BASE || 'http://localhost:8087') + '/roadmap/';
const theme = process.argv[2] || 'light';
const out = process.argv[3] || 'shot-' + theme + '.png';
const browser = await chromium.launch();
const page = await browser.newPage({viewport: {width: 1400, height: 1000}, colorScheme: theme});
await page.goto(BASE, {waitUntil: 'networkidle'});
await page.getByRole('button', {name: 'Habit app roadmap'}).click();
await page.waitForTimeout(400);
await page.locator('#preview svg').screenshot({path: out});
console.log('saved ' + out);
await browser.close();
