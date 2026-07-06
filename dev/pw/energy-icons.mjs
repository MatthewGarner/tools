/* One-shot: renders the energy icon SVG to the four PNGs. Run from dev/pw:
   node energy-icons.mjs — then LOOK at the output before accepting it. */
import {chromium} from 'playwright';
import {mkdirSync} from 'node:fs';

const svg = (pad) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
  <rect width="100" height="100" fill="#1B242C"/>
  <g transform="translate(${pad} ${pad}) scale(${(100 - 2 * pad) / 100})">
    <line x1="18" y1="50" x2="82" y2="50" stroke="#C97A35" stroke-width="7" stroke-linecap="round"/>
    <line x1="18" y1="36" x2="18" y2="64" stroke="#C97A35" stroke-width="7" stroke-linecap="round"/>
    <line x1="82" y1="36" x2="82" y2="64" stroke="#C97A35" stroke-width="7" stroke-linecap="round"/>
    <path d="M50 28 L62 50 L50 72 L38 50 Z" fill="#F0B27A"/>
  </g></svg>`;

const browser = await chromium.launch();
const page = await browser.newPage();
mkdirSync('../../energy/icons', {recursive: true});
for(const [name, size, pad] of [['icon-192', 192, 0], ['icon-512', 512, 0],
    ['icon-maskable-512', 512, 12], ['apple-touch-icon', 180, 0]]){
  await page.setViewportSize({width: size, height: size});
  await page.setContent('<body style="margin:0">' + svg(pad) + '</body>');
  await page.locator('svg').evaluate((el, s) => { el.style.width = s + 'px'; el.style.height = s + 'px'; el.style.display = 'block'; }, size);
  await page.screenshot({path: '../../energy/icons/' + name + '.png', clip: {x: 0, y: 0, width: size, height: size}});
}
await browser.close();
console.log('energy icons written');
