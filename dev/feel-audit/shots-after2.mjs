/* Pictures of the Bets / Tree / Paths feel work, at 1280x800 and 375x812: loads, the Bets view swap, a Paths view switch, a
   selection with its detail, the phone decision sheet, the Tree slider (example, large, a number near the bottom), Tree
   "Add option" start to finish, and each tool's menus on a phone. Frame strips are real screenshots taken back to back.
   node dev/feel-audit/shots-after2.mjs <outDir> [only-substring] */
import {chromium, startServer, newPage, openTool, sleep, waitQuiet, hashOpen, press} from './lib.mjs';
import {pointOn} from './scenarios.mjs';
import {treeLarge, pathsLarge} from './stress-btp.mjs';
import {mkdirSync} from 'node:fs';

const out = process.argv[2], only = process.argv[3] || '';
mkdirSync(out, {recursive: true});
const server = await startServer();
const browser = await chromium.launch();
const DESK = {x: 0, y: 0, width: 1280, height: 800}, PHONE = {x: 0, y: 0, width: 375, height: 812};
const want = name => !only || name.includes(only);

async function grab(page, act, {n = 6, clip, gap = 0} = {}){
  const t0 = Date.now(), frames = [];
  const run = act();
  for(let i = 0; i < n; i++){
    const buf = await page.screenshot({clip, type: 'jpeg', quality: 75, scale: 'css'}).catch(() => null);
    if(buf) frames.push({label: '+' + (Date.now() - t0) + 'ms', b64: buf.toString('base64')});
    if(gap) await sleep(gap);
  }
  await run;
  const last = await page.screenshot({clip, type: 'jpeg', quality: 75, scale: 'css'}).catch(() => null);
  if(last) frames.push({label: 'settled', b64: last.toString('base64')});
  return frames;
}
async function stitch(frames, name, {width = 300, cols = 4} = {}){
  const p = await browser.newPage({viewport: {width: cols * (width + 8) + 8, height: 200}});
  await p.setContent('<body style="margin:0;background:#222;display:flex;flex-wrap:wrap;gap:8px;padding:8px;font:13px sans-serif;color:#fff;align-items:flex-start">' +
    frames.map(f => `<figure style="margin:0;width:${width}px"><figcaption>${f.label}</figcaption><img style="width:${width}px;display:block" src="data:image/jpeg;base64,${f.b64}"></figure>`).join('') + '</body>');
  await p.screenshot({path: `${out}/${name}.png`, fullPage: true});
  await p.close();
  console.log('wrote', name);
}
const still = async (page, name, clip) => { await page.screenshot({path: `${out}/${name}.png`, clip}); console.log('wrote', name); };
const clipOf = kind => kind === 'phone' ? PHONE : DESK;
const strip = kind => kind === 'phone' ? {width: 180, cols: 6} : {width: 300, cols: 4};

try{
  /* loads */
  for(const tool of ['bets', 'tree', 'paths']) for(const kind of ['desktop', 'phone']){
    if(!want(`load-${tool}`)) continue;
    const {ctx, page} = await newPage(browser, kind);
    await page.goto(server.base + '/' + tool + '/', {waitUntil: 'load'}); await page.waitForFunction(() => document.querySelector('#preview svg')); await waitQuiet(page, {quiet: 500});
    await still(page, `load-${tool}-${kind}`, clipOf(kind));
    await ctx.close();
  }
  /* Bets Board <-> Quadrant strips */
  if(want('bets-view')) for(const kind of ['desktop', 'phone']){
    const {ctx, page} = await newPage(browser, kind);
    await openTool(page, server.base, 'bets');
    const q = page.locator('#viewtoggle [data-view="quadrant"]'), b = page.locator('#viewtoggle [data-view="board"]');
    await q.scrollIntoViewIfNeeded(); await sleep(200);
    const f1 = await grab(page, () => q.click(), {n: 5, clip: clipOf(kind)});
    const f2 = await grab(page, () => b.click(), {n: 5, clip: clipOf(kind)});
    await stitch([...f1.map(f => ({...f, label: 'to Quadrant ' + f.label})), ...f2.map(f => ({...f, label: 'to Board ' + f.label}))], `bets-board-quadrant-${kind}`, strip(kind));
    await ctx.close();
  }
  /* Paths view switch */
  if(want('paths-view')) for(const kind of ['desktop', 'phone']){
    const {ctx, page} = await newPage(browser, kind);
    await openTool(page, server.base, 'paths');
    const btn = page.locator('[data-paths-view="agenda"]');
    if(!(await btn.isVisible())){ await press(page, page.locator('.paths-more-views > summary'), kind === 'phone'); await sleep(200); }
    await btn.scrollIntoViewIfNeeded(); await sleep(200);
    const f = await grab(page, () => press(page, btn, kind === 'phone'), {n: 6, clip: clipOf(kind)});
    await stitch(f.map(x => ({...x, label: 'Brief to Learning agenda ' + x.label})), `paths-view-switch-${kind}`, strip(kind));
    await ctx.close();
  }
  /* Paths: a question selected, detail visible (all desktop views), and the phone sheet opening */
  if(want('paths-select')){
    for(const view of ['brief', 'question', 'conditions', 'agenda', 'tree']){
      const {ctx, page} = await newPage(browser, 'desktop');
      await openTool(page, server.base, 'paths', view === 'brief' ? undefined : undefined);
      const btn = page.locator(`[data-paths-view="${view}"]`);
      if(!(await btn.isVisible())){ await page.locator('.paths-more-views > summary').click(); await sleep(200); }
      await btn.click(); await waitQuiet(page, {quiet: 500});
      let p = await pointOn(page, '#preview [data-select-decision]', {nth: 1, resolve: '[data-select-decision],[data-toggle-decision-group]'});
      if(!p) p = await pointOn(page, '#preview [data-select-decision]', {nth: 0, resolve: '[data-select-decision],[data-toggle-decision-group]'});
      if(!p){ console.log('no point on', view); await ctx.close(); continue; }
      await sleep(300);
      const y0 = await page.evaluate(() => scrollY);
      const f = await grab(page, () => page.mouse.click(p.x, p.y), {n: 5, clip: DESK, gap: 30});
      await sleep(300);
      await stitch(f.map(x => ({...x, label: `${view}: select (page was at ${y0}) ` + x.label})), `paths-select-${view}-desktop-strip`, {width: 300, cols: 3});
      await still(page, `paths-select-${view}-desktop`, DESK);
      await ctx.close();
    }
    const {ctx, page} = await newPage(browser, 'phone');
    await openTool(page, server.base, 'paths');
    const p = await pointOn(page, '#preview [data-select-decision]', {nth: 0, resolve: '[data-select-decision],[data-toggle-decision-group]'});
    await sleep(300);
    const f = await grab(page, () => press(page, p, true), {n: 6, clip: PHONE});
    await stitch(f.map(x => ({...x, label: 'phone decision sheet ' + x.label})), 'paths-phone-sheet-open', {width: 180, cols: 6});
    await still(page, 'paths-phone-sheet', PHONE);
    await ctx.close();
  }
  /* Tree slider: example, large, a number near the bottom */
  if(want('tree-slider')){
    for(const [label, src] of [['example', null], ['large', treeLarge()]]){
      const {ctx, page} = await newPage(browser, 'desktop');
      if(src) { await page.goto(server.base + '/tree/#' + hashOpen(src), {waitUntil: 'load'}); await page.waitForFunction(() => document.querySelector('#preview svg')); await waitQuiet(page, {quiet: 500}); }
      else await openTool(page, server.base, 'tree');
      const sel = '#preview [data-hot][data-edit="prob"]';
      await page.evaluate(sel => { const r = document.querySelector(sel).getBoundingClientRect(); scrollTo(0, scrollY + r.bottom - (innerHeight - 24)); }, sel);
      await sleep(300);
      const p = await pointOn(page, sel, {resolve: '[data-edit]'});
      const before = await page.screenshot({type: 'jpeg', quality: 75, clip: DESK});
      const f = await grab(page, () => page.mouse.click(p.x, p.y), {n: 4, clip: DESK, gap: 40});
      await stitch([{label: 'number placed near the bottom edge', b64: before.toString('base64')}, ...f.map(x => ({...x, label: 'tap ' + x.label}))], `tree-slider-${label}-nearbottom`, {width: 400, cols: 3});
      await ctx.close();
    }
    const {ctx, page} = await newPage(browser, 'phone');
    await openTool(page, server.base, 'tree');
    const n = await page.locator('#preview [data-edit="cardmenu-leaf"]').count();
    for(let i = 0; i < n; i++){
      await press(page, await pointOn(page, '#preview [data-edit="cardmenu-leaf"]', {nth: i, resolve: '[data-edit]'}), true); await sleep(250);
      const row = page.locator('.eip-pop button', {hasText: /^Explore odds/});
      if(await row.count()){ await still(page, 'tree-phone-menu-explore', PHONE); await press(page, row.first(), true); await sleep(600); await still(page, 'tree-slider-phone', PHONE); break; }
      await page.keyboard.press('Escape'); await sleep(100);
    }
    await ctx.close();
  }
  /* Tree: Add option, start to finish */
  if(want('tree-add')) for(const kind of ['desktop', 'phone']){
    const {ctx, page} = await newPage(browser, kind);
    await openTool(page, server.base, 'tree');
    const phone = kind === 'phone', clip = clipOf(kind), frames = [];
    const snap = async label => { const b = await page.screenshot({type: 'jpeg', quality: 75, clip}); frames.push({label, b64: b.toString('base64')}); };
    await snap('start');
    await press(page, await pointOn(page, '#preview [data-edit^="cardmenu"]', {nth: 0, resolve: '[data-edit]'}), phone); await sleep(300); await snap('menu open');
    await press(page, page.locator('.eip-pop button', {hasText: /Add option|Add outcome/}).first(), phone); await sleep(300); await snap('add field');
    await page.keyboard.type('Pilot with one partner'); await sleep(150); await snap('typed');
    await page.keyboard.press('Enter'); await sleep(120); await snap('+120ms'); await waitQuiet(page, {quiet: 500}); await snap('settled');
    await stitch(frames, `tree-add-option-${kind}`, strip(kind));
    await ctx.close();
  }
  /* menus at 375px */
  if(want('menus')) for(const tool of ['bets', 'tree', 'paths']){
    const {ctx, page} = await newPage(browser, 'phone');
    await openTool(page, server.base, tool);
    const frames = [];
    const snap = async label => { const b = await page.screenshot({type: 'jpeg', quality: 75, clip: PHONE}); frames.push({label, b64: b.toString('base64')}); };
    for(const sel of ['[data-shell-file] > summary', '.action-disclosure > summary', '.method > summary']){
      const s = page.locator(sel).first();
      if(!(await s.count()) || !(await s.isVisible())) continue;
      await s.scrollIntoViewIfNeeded(); await s.click(); await sleep(300); await snap(sel);
      await page.keyboard.press('Escape'); await sleep(150);
    }
    const cardSel = tool === 'bets' ? '#preview [data-edit="cardmenu"]' : tool === 'tree' ? '#preview [data-edit^="cardmenu"]' : '#preview [data-select-decision]';
    const p = await pointOn(page, cardSel, {nth: 0, resolve: '[data-edit],[data-select-decision]'});
    if(p){ await press(page, p, true); await sleep(350); await snap(tool === 'paths' ? 'question tap' : 'card menu'); }
    await stitch(frames, `menus-${tool}-phone`, {width: 200, cols: 5});
    await ctx.close();
  }
}finally{
  await browser.close();
  server.stop();
}
