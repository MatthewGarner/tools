/* Every disclosure menu (File, Appearance, Export, History): opens fully on screen,
   closes on Escape, closes on a click elsewhere. */
import {measure, sleep, press, shot} from './lib.mjs';
import {freshPage, paintOf, motionOf} from './scenarios.mjs';

const SKIP = /syntax|about|forecast/i;

export async function disclosures(env, tool, kind){
  const {check, note} = env.R;
  const w = `${tool}/${kind}/${env.mode}`;
  const phone = kind === 'phone';
  const {ctx, page} = await freshPage(env, tool, kind);
  const sums = page.locator('details > summary:visible');
  const n = await sums.count();
  const off = [], seen = [], escLeftOpen = [], outsideLeftOpen = [];
  for(let i = 0; i < n; i++){
    const sum = sums.nth(i);
    const name = (await sum.textContent()).trim().slice(0, 30);
    if(SKIP.test(name)) continue;
    await sum.scrollIntoViewIfNeeded();
    const s = await measure(page, () => press(page, sum, phone), {quiet: 200});
    const r = await sum.evaluate(su => {
      const d = su.parentElement; if(!d.open) return {open: false};
      const kids = [...d.querySelectorAll('button, select, a, input')].filter(e => !su.contains(e) && e.getClientRects().length);
      const outside = kids.filter(e => { const b = e.getBoundingClientRect(); return b.left < 0 || b.right > innerWidth + 1; }).map(e => (e.id || e.textContent.trim().slice(0, 20)) + '@x=' + Math.round(e.getBoundingClientRect().left));
      return {open: true, items: kids.length, outside};
    });
    seen.push({name, paint: paintOf(s), motion: motionOf(s), ...r});
    if(r.outside && r.outside.length) off.push(name + ': ' + r.outside.join(', '));
    await shot(page, `${env.out}/shots/${tool}-${kind}-menu-${name.replace(/\W+/g, '')}.png`);
    await page.keyboard.press('Escape');
    await sleep(80);
    if(await sum.evaluate(su => su.parentElement.open)){ escLeftOpen.push(name); await press(page, sum, phone); await sleep(60); }
    await press(page, sum, phone); await sleep(80);
    await press(page, {x: phone ? 365 : 1270, y: 120}, phone); await sleep(100);
    if(await sum.evaluate(su => su.parentElement.open)){ outsideLeftOpen.push(name); await press(page, sum, phone); await sleep(60); }
  }
  note('disclosure.all', w, 'every disclosure menu', seen);
  check('disclosure.onscreen', w, 'disclosure menu items outside the viewport when opened', off.length ? off : 'none', off.length === 0, 'every item on screen');
  check('disclosure.escape', w, 'disclosure menus that Escape does not close', escLeftOpen.length ? escLeftOpen : 'none', escLeftOpen.length === 0, 'Escape closes every menu');
  check('disclosure.outside', w, 'disclosure menus left open after a click elsewhere', outsideLeftOpen.length ? outsideLeftOpen : 'none', outsideLeftOpen.length === 0, 'a click elsewhere closes them (as the card menu does)');
  check('disclosure.motion', w, 'disclosure menus with an entrance', seen.map(s => s.name + ':' + (s.motion.length ? 'animated' : 'instant')).join(' '), true, 'recorded (consistency)');
  await ctx.close();
}
