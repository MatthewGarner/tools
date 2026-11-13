/* Tree-only scenarios: the "Explore odds/payoff" slider (engage, drag, commit, Undo,
   Escape, close) on the example and a 57-node tree, the slider on a phone through the
   card menu with a touch drag, and the reading-view advisory a wide tree raises. */
import {measure, waitQuiet, sleep, sourceText, press, shot, touchSwipe, newPage, ready, hashOpen} from './lib.mjs';
import {BAR} from './checks.mjs';
import {pointOn, paintOf} from './scenarios.mjs';
import {fresh, where, timeToRender} from './scenarios-btp.mjs';
import {treeLarge} from './stress-btp.mjs';

async function engage(page, phone){
  if(!phone){
    const p = await pointOn(page, '#preview [data-hot][data-edit="prob"]', {nth: 0, resolve: '[data-edit]'});
    if(!p) return null;
    await sleep(200);
    return measure(page, () => press(page, p, false), {quiet: 300});
  }
  /* phone: the hot numbers are not drawn; "Explore odds…" lives in a leaf's card menu */
  const n = await page.locator('#preview [data-edit="cardmenu-leaf"]').count();
  for(let i = 0; i < n; i++){
    await press(page, await pointOn(page, '#preview [data-edit="cardmenu-leaf"]', {nth: i, resolve: '[data-edit]'}), true); await sleep(200);
    const row = page.locator('.eip-pop button', {hasText: /^Explore odds/});
    if(await row.count()) return measure(page, () => press(page, row.first(), true), {quiet: 300});
    await page.keyboard.press('Escape'); await sleep(100);
  }
  return null;
}

export async function slider(env, kind, {source, label = 'example'} = {}){
  const {check, note} = env.R;
  const w = where('tree', kind, env.mode), phone = kind === 'phone';
  if(phone && env.engine === 'webkit'){ note(`slider.${label}.skip`, w, 'phone slider drag needs CDP touch (Chromium only)', null); return; }
  const {ctx, page} = await fresh(env, 'tree', kind, {source});
  const e = await engage(page, phone);
  if(!e){ check(`slider.${label}.engage`, w, 'a slider could be engaged', null, false, 'Explore reachable'); await ctx.close(); return; }
  const bar = await page.evaluate(() => { const b = document.getElementById('explorebar'); const r = b.getBoundingClientRect(); const rg = document.getElementById('exploreRange').getBoundingClientRect(); return {hidden: b.hidden, top: Math.round(r.top), bottom: Math.round(r.bottom), vh: innerHeight, inView: r.top >= 0 && r.bottom <= innerHeight, rangeH: Math.round(rg.height), rangeW: Math.round(rg.width), active: window.__feel.describe(document.activeElement), label: document.getElementById('exploreLabel').textContent, priced: document.getElementById('explorePriced').textContent.slice(0, 120), touchAction: getComputedStyle(document.getElementById('exploreRange')).touchAction}; });
  note(`slider.${label}.engage`, w, 'engage the slider', {paint: paintOf(e), settled: e.settled, swaps: e.svgSwaps, anims: e.animations, heightJumps: e.heightJumps, scroll: e.scrollJumps, cls: e.clsNoInput, bar});
  check(`slider.${label}.engage.paint`, w, 'tap a hot number -> slider shown (input -> next paint)', paintOf(e), paintOf(e) <= BAR.paint[env.mode], '<= ' + BAR.paint[env.mode] + 'ms');
  check(`slider.${label}.engage.visible`, w, 'slider fully on screen when it appears', bar, !bar.hidden && bar.inView, 'in view without scrolling');
  if(env.mode === 'normal'){
    check(`slider.${label}.engage.focus`, w, 'focus on engage', bar.active, /exploreRange/.test(bar.active), 'on the slider');
    check(`slider.${label}.engage.motion`, w, 'slider entrance', e.animations.length ? e.animations : 'none: appears instantly', e.animations.some(a => /opacity|transform|menu-in/.test(a)), 'a brief opacity/transform entrance like other surfaces');
    if(phone) check(`slider.${label}.tap`, w, 'slider thumb/track hit height on a phone', bar.rangeH, bar.rangeH >= BAR.tap, '>= 44px');
  }
  /* drag the thumb across the track (scrolled into view first: on a tall tree it can appear off screen) */
  await page.locator('#exploreRange').scrollIntoViewIfNeeded(); await sleep(250);
  const rg = await page.locator('#exploreRange').boundingBox();
  const v0 = await page.locator('#exploreRange').inputValue();
  const t0 = await page.evaluate(() => performance.now());
  const yStart = await page.evaluate(() => scrollY);
  if(phone){
    await touchSwipe(page, {x: rg.x + rg.width * 0.5, y: rg.y + rg.height / 2}, {x: rg.x + rg.width * 0.15, y: rg.y + rg.height / 2}, {steps: 20});
  }else{
    const thumbX = await page.evaluate(() => { const r = document.getElementById('exploreRange'); const f = (r.value - r.min) / (r.max - r.min); const b = r.getBoundingClientRect(); return b.left + 8 + f * (b.width - 16); });
    await page.mouse.move(thumbX, rg.y + rg.height / 2); await page.mouse.down();
    for(let i = 1; i <= 30; i++){ await page.mouse.move(thumbX - (thumbX - rg.x - 10) * i / 30, rg.y + rg.height / 2 + (i % 3)); await sleep(16); }
    await page.evaluate(() => { window.__relT = new Promise(res => { let t0 = 0; addEventListener('pointerup', () => { t0 = performance.now(); }, {once: true, capture: true}); const pv = document.getElementById('preview'); const mo = new MutationObserver(() => { mo.disconnect(); requestAnimationFrame(() => res(t0 ? Math.round(performance.now() - t0) : -2)); }); mo.observe(pv, {childList: true}); setTimeout(() => { mo.disconnect(); res(-1); }, 4000); }); });
    await page.mouse.up();
  }
  const rel = phone ? null : await page.evaluate(() => window.__relT);
  await waitQuiet(page, {quiet: 500});
  const d = await page.evaluate(([t0, y]) => {
    const F = window.__feel;
    const fr = F.frames.filter(f => f[0] >= t0); const dl = []; for(let i = 1; i < fr.length; i++) dl.push(fr[i][0] - fr[i - 1][0]);
    const lt = F.lt.filter(l => l[0] >= t0);
    const ev = F.ev.filter(e => e[1] >= t0);
    return {frames: fr.length, dropped: dl.filter(x => x > 20).length, worstFrame: Math.round(Math.max(0, ...dl)), longTasks: lt.length, longTaskMax: Math.round(Math.max(0, ...lt.map(l => l[1]))),
      worstEvent: ev.length ? Math.round(Math.max(...ev.map(e => e[2]))) : 0, worstEventName: ev.length ? ev.sort((a, b) => b[2] - a[2])[0][0] : '',
      scrolled: Math.round(scrollY - y), selection: getSelection().toString().slice(0, 40), value: document.getElementById('exploreRange').value, pending: document.querySelectorAll('#preview .pending').length, live: document.querySelectorAll('#preview .live-on,#preview .live-off').length, active: F.describe(document.activeElement)};
  }, [t0, yStart]);
  const src = await sourceText(page);
  note(`slider.${label}.drag`, w, 'drag the slider and release', {v0, releaseToRender: rel, ...d});
  check(`slider.${label}.drag.frames`, w, 'dropped frames (>20ms) during the drag', {dropped: d.dropped, worst: d.worstFrame, frames: d.frames}, d.dropped <= 1, '<= 1');
  check(`slider.${label}.drag.events`, w, 'worst input event during the drag (Event Timing)', {worst: d.worstEvent, name: d.worstEventName}, d.worstEvent <= BAR.paint[env.mode], '<= ' + BAR.paint[env.mode] + 'ms');
  check(`slider.${label}.drag.moved`, w, 'the drag moved the value', {v0, v1: d.value}, d.value !== v0, 'value changed');
  if(!phone) check(`slider.${label}.release`, w, 'release -> settled re-render (ms)', rel, rel != null && rel >= 0 && rel <= BAR.commit[env.mode] + 50, '<= ' + (BAR.commit[env.mode] + 50) + 'ms');
  check(`slider.${label}.release.longtask`, w, 'longest task in the drag + release', d.longTaskMax, d.longTaskMax <= (env.mode === 'normal' ? 50 : 150), env.mode === 'normal' ? '<= 50ms' : '<= 150ms');
  check(`slider.${label}.settled`, w, 'nothing left faded or mid-drag after release', {pending: d.pending, live: d.live}, d.pending === 0 && d.live === 0, 'no .pending/.live-* classes');
  if(phone) check(`slider.${label}.touch.scroll`, w, 'page scroll / selection during a horizontal touch drag on the slider', {scrolled: d.scrolled, selection: d.selection}, Math.abs(d.scrolled) <= 2 && !d.selection, 'page holds still, nothing selected');
  if(env.mode === 'normal'){
    check(`slider.${label}.release.focus`, w, 'focus after release', d.active, /exploreRange/.test(d.active), 'stays on the slider');
    /* Undo the committed drag from the keyboard (focus on the slider) */
    const before = src;
    await page.keyboard.press('ControlOrMeta+z'); await sleep(400);
    const afterKey = await sourceText(page);
    note(`slider.${label}.undo.key`, w, 'Cmd/Ctrl+Z with focus on the slider', {reverted: afterKey !== before});
    if(!phone) check(`slider.${label}.undo.key`, w, 'Cmd/Ctrl+Z while the slider has focus undoes the committed drag', afterKey !== before, afterKey !== before, 'reverted');
    /* Escape returns focus to the number (focus on the slider, two uncommitted-looking arrow steps) */
    if(!phone && afterKey === before){
      await page.locator('#exploreRange').focus().catch(() => {});
      await page.keyboard.press('ArrowRight'); await sleep(80);
      await page.keyboard.press('Escape'); await sleep(250);
      const esc = await page.evaluate(() => ({active: window.__feel.describe(document.activeElement), edit: document.activeElement?.dataset?.edit, bar: !document.getElementById('explorebar').hidden}));
      check(`slider.${label}.escape.focus`, w, 'focus after Escape on the slider', esc, esc.edit === 'prob' || esc.edit === 'value', 'back on the hot number');
    }
    /* the Undo button after a slider commit */
    const undoBtn = page.locator('.touch-undo');
    if(afterKey === before && !(await page.locator('#explorebar').evaluate(b => b.hidden)) && await undoBtn.isVisible()){
      const pre = await sourceText(page);
      const u = await timeToRender(page, () => press(page, undoBtn, phone));
      await waitQuiet(page, {quiet: 400});
      const st = await page.evaluate(() => ({bar: !document.getElementById('explorebar').hidden, value: document.getElementById('exploreRange').value, active: window.__feel.describe(document.activeElement)}));
      const reverted = (await sourceText(page)) !== pre;
      check(`slider.${label}.undo.button`, w, 'Undo button after a slider commit', {ms: u, reverted, ...st}, reverted && u >= 0 && u <= 200, 'reverted within 200ms; slider follows the restored value');
    }
    if(await page.locator('#explorebar').evaluate(b => b.hidden)) await engage(page, phone);
    /* close button */
    if(await page.locator('#exploreClose').isVisible()){
      const c = await measure(page, () => press(page, page.locator('#exploreClose'), phone), {quiet: 300});
      const st = await page.evaluate(() => ({active: window.__feel.describe(document.activeElement), hidden: document.getElementById('explorebar').hidden}));
      note(`slider.${label}.close`, w, 'close the slider', {paint: paintOf(c), heightJumps: c.heightJumps, scroll: c.scrollJumps, ...st});
      check(`slider.${label}.close.focus`, w, 'focus after the close button', st, st.hidden && !/^body\b/.test(st.active), 'on the number it explored (not body)');
      const box = await page.locator('#exploreClose').boundingBox().catch(() => null);
      note(`slider.${label}.close.size`, w, 'close button box', box);
    }
    await shot(page, `${env.out}/shots/tree-${kind}-slider-${label}.png`);
  }
  await ctx.close();
}

/* keyboard: arrow keys on the slider (each arrow is a change -> commit -> full evaluation) */
export async function sliderKeys(env, {source, label = 'example'} = {}){
  const {check, note} = env.R;
  const w = where('tree', 'desktop', env.mode);
  const {ctx, page} = await fresh(env, 'tree', 'desktop', {source});
  if(!(await engage(page, false))){ await ctx.close(); return; }
  await page.locator('#exploreRange').focus();
  const s = await measure(page, async () => { for(let i = 0; i < 10; i++){ await page.keyboard.press('ArrowLeft'); await sleep(40); } }, {quiet: 500});
  const undoDepth = await page.evaluate(async () => { const {undoDepth} = await import('/assets/vendor/codemirror.js').catch(() => ({})); if(!undoDepth) return null; const {EditorView} = await import('/assets/vendor/codemirror.js'); return undoDepth(EditorView.findFromDOM(document.querySelector('.cm-editor')).state); });
  note(`sliderkeys.${label}`, w, '10 ArrowLeft presses on the slider, 40ms apart', {paint: paintOf(s), settled: s.settled, swaps: s.svgSwaps, longTasks: s.longTasks, longTaskMax: s.longTaskMax, longTaskTotal: s.longTaskTotal, dropped: s.dropped, undoDepth, active: s.active});
  check(`sliderkeys.${label}.longtask`, w, 'longest task while arrowing the slider', s.longTaskMax, s.longTaskMax <= (env.mode === 'normal' ? 50 : 150), env.mode === 'normal' ? '<= 50ms' : '<= 150ms');
  check(`sliderkeys.${label}.renders`, w, 'artefact re-renders for 10 arrow presses (each arrow commits a source edit)', s.svgSwaps, s.svgSwaps <= 10, 'recorded');
  check(`sliderkeys.${label}.undo`, w, 'undo entries created by 10 arrow presses', undoDepth, undoDepth == null || undoDepth <= 2, 'one undoable step for one adjustment (recorded)');
  await ctx.close();
}

/* reading view: a tree wider than the authoring pane raises "Open reading view" */
export async function reading(env){
  const {check, note} = env.R;
  const w = where('tree', 'desktop', env.mode);
  /* a shared link that keeps the editor open (no e:0): the artefact lands beside the source */
  const {ctx, page} = await newPage(env.browser, 'desktop', {throttle: env.throttle, engine: env.engine});
  await page.goto(env.base + '/tree/#' + hashOpen(treeLarge()), {waitUntil: 'load'});
  await ready(page);
  const adv = page.locator('.fit-readability-advisory button');
  const shown = await adv.isVisible().catch(() => false);
  await shot(page, `${env.out}/shots/tree-large-landing-${env.mode}.png`);
  note('reading.advisory', w, 'reading-view advisory on a 57-node tree', {shown, text: shown ? await page.locator('.fit-readability-advisory').textContent() : null, collapsed: await page.locator('#workspace').getAttribute('class')});
  if(!shown){ await ctx.close(); return; }
  const s = await measure(page, () => adv.click(), {quiet: 500, max: 6000});
  const st = await page.evaluate(() => ({cls: document.getElementById('workspace').className, active: window.__feel.describe(document.activeElement)}));
  note('reading.open', w, 'Open reading view', {paint: paintOf(s), settled: s.settled, swaps: s.svgSwaps, anims: s.animations, layout: s.layoutAnimated, longTaskMax: s.longTaskMax, heightJumps: s.heightJumps, scroll: s.scrollJumps, ...st});
  check('reading.open.renders', w, 'artefact renders when the reading view opens', s.svgSwaps, s.svgSwaps <= 1, '<= 1');
  check('reading.open.layoutprops', w, 'layout properties animated', s.layoutAnimated.length ? s.layoutAnimated : 'none', !s.layoutAnimated.length, 'none');
  check('reading.open.focus', w, 'focus after opening the reading view', st.active, !/^body\b/.test(st.active), 'not lost to body (the button is removed)');
  await shot(page, `${env.out}/shots/tree-large-reading-${env.mode}.png`);
  await ctx.close();
}

export const large = () => treeLarge();
