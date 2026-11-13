/* Paths-only scenarios: selecting a question on every interactive view (receipt rail on
   desktop, the decision sheet on a phone), the Tree-view inspector and an inspector edit,
   Brief's group expand, the Plans -> Roadmap hand-off panel, and "Edit in source". */
import {measure, waitQuiet, sleep, sourceText, press, shot} from './lib.mjs';
import {BAR} from './checks.mjs';
import {pointOn, paintOf} from './scenarios.mjs';
import {fresh, where, timeToRender} from './scenarios-btp.mjs';
import {pathsLarge} from './stress-btp.mjs';

async function toView(page, view, phone){
  const sel = `[data-paths-view="${view}"]`;
  if(!(await page.locator(sel).isVisible())){ await press(page, page.locator('.paths-more-views > summary'), phone); await sleep(150); }
  await press(page, page.locator(sel), phone);
  await waitQuiet(page, {quiet: 500});
}
const state = page => page.evaluate(() => {
  const r = document.getElementById('overview-receipt'), ins = document.getElementById('decision-inspector');
  const box = el => { const b = el.getBoundingClientRect(); return {top: Math.round(b.top), bottom: Math.round(b.bottom), h: Math.round(b.height), inView: b.top < innerHeight && b.bottom > 0, fullyInView: b.top >= 0 && b.bottom <= innerHeight}; };
  return {receipt: r.hidden ? null : {layout: r.dataset.layout, sheet: r.dataset.sheet === 'true', key: r.dataset.decisionKey, ...box(r)},
    inspector: ins.hidden ? null : box(ins), active: window.__feel.describe(document.activeElement), activeText: (document.activeElement?.textContent || '').trim().slice(0, 50),
    bodyLocked: getComputedStyle(document.body).overflow, sheetOpen: document.body.classList.contains('overview-sheet-open'), scrollY: Math.round(scrollY)};
});

/* select a question on each view that offers it */
export async function select(env, kind, {source, label = 'example'} = {}){
  const {check, note} = env.R;
  const w = where('paths', kind, env.mode), phone = kind === 'phone';
  const {ctx, page} = await fresh(env, 'paths', kind, {source});
  const res = [];
  for(const view of ['brief', 'agenda', 'question', 'conditions', 'tree']){
    await toView(page, view, phone);
    const n = await page.locator('#preview [data-select-decision]').count();
    if(!n){ res.push({view, none: true}); continue; }
    const nth = Math.min(1, n - 1);
    const p = await pointOn(page, '#preview [data-select-decision]', {nth, resolve: '[data-select-decision],[data-toggle-decision-group]'});
    if(!p){ res.push({view, nopoint: true}); continue; }
    await sleep(300);
    const y0 = await page.evaluate(() => scrollY);
    const ttr = timeToRender(page, async () => {}, {timeout: 3000});
    const s = await measure(page, () => press(page, p, phone), {quiet: 400});
    const swap = await ttr;
    const st = await state(page);
    res.push({view, paint: paintOf(s), swap, settled: s.settled, swaps: s.svgSwaps, longTaskMax: s.longTaskMax, heightJumps: s.heightJumps, scroll: s.scrollJumps, cls: s.clsNoInput, anims: s.animations, scrolledBy: st.scrollY - y0, ...st});
    if(env.mode === 'normal') await shot(page, `${env.out}/shots/paths-${kind}-select-${view}.png`);
    /* close: Escape */
    if(env.mode === 'normal' && (st.receipt?.sheet || view === 'tree' || st.receipt?.layout === 'overlay')){
      const e = await measure(page, () => page.keyboard.press('Escape'), {quiet: 400});
      const after = await state(page);
      res.at(-1).escape = {paint: paintOf(e), swaps: e.svgSwaps, scroll: e.scrollJumps, active: after.active, receipt: !!after.receipt?.sheet, inspector: !!after.inspector, scrollY: after.scrollY};
    }
  }
  note(`select.${label}`, w, 'select a question on each view', res);
  const ok = res.filter(r => r.paint != null);
  check(`select.${label}.paint`, w, 'select a question -> next paint (worst view)', ok.map(r => r.view + ':' + r.paint).join(' '), ok.every(r => r.paint <= BAR.paint[env.mode]), '<= ' + BAR.paint[env.mode] + 'ms');
  check(`select.${label}.renders`, w, 'artefact renders per selection', ok.map(r => r.view + ':' + r.swaps).join(' '), ok.every(r => r.swaps <= 1), '<= 1');
  check(`select.${label}.longtask`, w, 'longest task in a selection', ok.map(r => r.view + ':' + r.longTaskMax).join(' '), ok.every(r => r.longTaskMax <= (env.mode === 'normal' ? 50 : 150)), env.mode === 'normal' ? '<= 50ms' : '<= 150ms');
  check(`select.${label}.scroll`, w, 'page scroll moved by selecting', ok.map(r => r.view + ':' + r.scrolledBy).join(' '), ok.every(r => Math.abs(r.scrolledBy) <= 1 || (phone && r.receipt?.sheet)), 'no scroll jump (a phone sheet may hold the page)');
  check(`select.${label}.cls`, w, 'layout shift caused by selecting (no-input shifts)', ok.map(r => r.view + ':' + r.cls).join(' '), ok.every(r => r.cls <= 0.05), '<= 0.05');
  check(`select.${label}.detail`, w, 'the selected question\'s detail is visible after selecting', ok.map(r => r.view + ':' + (r.receipt ? 'receipt ' + r.receipt.layout + (r.receipt.inView ? '' : ' OFF-SCREEN') : r.inspector ? 'inspector' + (r.inspector.inView ? '' : ' OFF-SCREEN') : 'in-artefact')).join(' '), ok.every(r => (r.receipt ? r.receipt.inView : true) && (r.inspector ? r.inspector.inView : true)), 'receipt / inspector on screen');
  if(env.mode === 'normal'){
    check(`select.${label}.focus`, w, 'focus after selecting (pointer)', ok.map(r => r.view + ':' + r.active).join(' '), ok.every(r => !/^body\b/.test(r.active)), 'not lost to body');
    if(phone) check(`select.${label}.sheet`, w, 'phone selection opens the decision sheet, focused, page held', ok.filter(r => r.view !== 'tree').map(r => r.view + ':' + JSON.stringify({sheet: r.receipt?.sheet, full: r.receipt?.fullyInView, active: r.active, lock: r.bodyLocked})).join(' '), ok.filter(r => r.view !== 'tree').every(r => r.receipt?.sheet && r.receipt.inView && /overview-receipt|receipt/.test(r.active)), 'sheet open, on screen, focus inside');
    const esc = ok.filter(r => r.escape);
    check(`select.${label}.escape`, w, 'Escape closes the sheet/inspector and returns focus to the question', esc.map(r => r.view + ':' + JSON.stringify({active: r.escape.active, open: r.escape.receipt || r.escape.inspector})).join(' '), esc.every(r => !r.escape.receipt && !r.escape.inspector && /select-decision|\[selectDecision\]|g\b/.test(r.escape.active) && !/^body/.test(r.escape.active)), 'closed, focus on the question that opened it');
  }
  await ctx.close();
}

/* phone sheet: the Close button, scroll under the sheet, Tab containment */
export async function sheet(env){
  const {check, note} = env.R;
  const w = where('paths', 'phone', env.mode);
  const {ctx, page} = await fresh(env, 'paths', 'phone');
  const p = await pointOn(page, '#preview [data-select-decision]', {nth: 0, resolve: '[data-select-decision],[data-toggle-decision-group]'});
  await sleep(300);
  const y0 = await page.evaluate(() => scrollY);
  await press(page, p, true); await sleep(300); await waitQuiet(page, {quiet: 400});
  const st = await state(page);
  const close = page.locator('#overview-receipt [data-receipt-close]');
  const closeBox = await close.boundingBox().catch(() => null);
  const fixed = await page.evaluate(() => { const r = document.getElementById('overview-receipt'); return {position: getComputedStyle(r).position, overflowY: getComputedStyle(r).overflowY, h: Math.round(r.getBoundingClientRect().height), scrollH: r.scrollHeight}; });
  note('sheet.open', w, 'decision sheet opened', {...st, closeBox, fixed, y0});
  await shot(page, `${env.out}/shots/paths-phone-sheet.png`);
  check('sheet.close.size', w, 'sheet Close button size', closeBox && [Math.round(closeBox.width), Math.round(closeBox.height)], closeBox && closeBox.width >= 44 && closeBox.height >= 44, '>= 44x44');
  /* Tab containment: 12 tabs stay inside */
  const outs = [];
  for(let i = 0; i < 12; i++){ await page.keyboard.press('Tab'); outs.push(await page.evaluate(() => !!document.activeElement.closest('#overview-receipt'))); }
  check('sheet.tabtrap', w, 'Tab stays inside the open sheet (12 presses)', outs.filter(x => !x).length, outs.every(Boolean), 'all inside');
  /* swipe on the sheet: does the page behind scroll? */
  const yA = await page.evaluate(() => scrollY);
  const {touchSwipe} = await import('./lib.mjs');
  await touchSwipe(page, {x: 180, y: 650}, {x: 180, y: 300}); await sleep(400);
  const yB = await page.evaluate(() => ({page: scrollY, sheet: document.getElementById('overview-receipt').scrollTop}));
  check('sheet.scroll', w, 'a swipe on the sheet scrolls the sheet, not the page behind it', {pageMoved: yB.page - yA, sheetScrolled: yB.sheet, sheetScrollable: fixed.scrollH > fixed.h}, yB.page - yA === 0, 'page behind holds still');
  const c = await measure(page, () => press(page, close, true), {quiet: 400});
  const after = await state(page);
  note('sheet.close', w, 'close the sheet', {paint: paintOf(c), swaps: c.svgSwaps, anims: c.animations, scroll: c.scrollJumps, ...after});
  check('sheet.close.focus', w, 'focus after the sheet Close button', after.active, /select-decision|selectDecision|\bg\b|^g/.test(after.active) && !/^body/.test(after.active), 'the question that opened it');
  check('sheet.close.position', w, 'page scroll position after closing (vs before opening)', {before: y0, after: after.scrollY}, Math.abs(after.scrollY - y0) <= 2, 'unchanged');
  check('sheet.motion', w, 'sheet open/close motion', c.animations.length ? c.animations : 'none: appears and disappears instantly', c.animations.length > 0, 'a brief slide/fade so the sheet reads as a sheet (recorded)');
  await ctx.close();
}

/* an inspector / receipt field edit (Tree view inspector question) */
export async function inspectorEdit(env, kind){
  const {check, note} = env.R;
  const w = where('paths', kind, env.mode), phone = kind === 'phone';
  const {ctx, page} = await fresh(env, 'paths', kind);
  await toView(page, 'tree', phone);
  for(let nth = 0; nth < 4; nth++){
    const p = await pointOn(page, '#preview [data-select-decision]', {nth, resolve: '[data-select-decision]'});
    if(!p) break;
    await press(page, p, phone); await sleep(300); await waitQuiet(page, {quiet: 400});
    if(await page.locator('#decision-inspector').isVisible()) break;
  }
  const field = page.locator('#decision-inspector [data-edit]').first();
  if(!(await field.count())){ note('inspector.nofield', w, 'no editable field in the inspector', await state(page)); await ctx.close(); return; }
  const kindName = await field.getAttribute('data-edit');
  await field.scrollIntoViewIfNeeded(); await sleep(150);
  const o = await measure(page, () => press(page, field, phone), {quiet: 300});
  const inp = await page.evaluate(() => { const i = document.querySelector('.eip-input'); if(!i) return null; const r = i.getBoundingClientRect(); return {font: parseFloat(getComputedStyle(i).fontSize), bottom: Math.round(r.bottom), vh: innerHeight, focused: document.activeElement === i}; });
  note('inspector.open', w, `open the inspector "${kindName}" field`, {paint: paintOf(o), input: inp});
  if(!inp){ await ctx.close(); return; }
  await page.keyboard.press('ControlOrMeta+A'); await page.keyboard.type('Feel edited question?');
  const t0 = await page.evaluate(() => performance.now());
  await page.keyboard.press('Enter');
  const shownAt = await page.evaluate(t0 => new Promise(res => { const tick = () => { if(document.getElementById('decision-inspector').textContent.includes('Feel edited question')) res(Math.round(performance.now() - t0)); else if(performance.now() - t0 > 3000) res(null); else requestAnimationFrame(tick); }; tick(); }), t0);
  await waitQuiet(page, {quiet: 400});
  const st = await state(page);
  note('inspector.commit', w, 'commit an inspector field', {shownAt, ...st});
  check('inspector.commit.applied', w, 'Enter -> inspector shows the new text (ms)', shownAt, shownAt != null && shownAt <= BAR.commit[env.mode] + 30, '<= ' + (BAR.commit[env.mode] + 30) + 'ms (a discrete edit skips the typing debounce)');
  if(env.mode === 'normal'){
    check('inspector.commit.focus', w, 'focus after an inspector commit', st.active, !/^body\b/.test(st.active), 'on the edited field (not body)');
    if(phone){
      check('inspector.input.font', w, 'inspector field font size on a phone', inp.font, inp.font >= 16, '>= 16px');
      check('inspector.input.keyboard', w, 'inspector field position vs. on-screen keyboard', inp, inp.bottom <= inp.vh * 0.55, 'field in the top 55%');
    }
  }
  await ctx.close();
}

/* Brief: expand a decision-state group */
export async function groups(env, kind){
  const {check, note} = env.R;
  const w = where('paths', kind, env.mode), phone = kind === 'phone';
  const {ctx, page} = await fresh(env, 'paths', kind);
  const p = await pointOn(page, '#preview [data-toggle-decision-group]', {nth: 0, resolve: '[data-toggle-decision-group],[data-select-decision]'});
  if(!p){ note('group.missing', w, 'no group toggle', null); await ctx.close(); return; }
  await sleep(250);
  const s = await measure(page, () => press(page, p, phone), {quiet: 400});
  const st = await page.evaluate(() => ({expanded: document.querySelector('#preview [data-toggle-decision-group]')?.getAttribute('aria-expanded'), active: window.__feel.describe(document.activeElement)}));
  note('group.toggle', w, 'expand a decision-state group', {paint: paintOf(s), swaps: s.svgSwaps, settled: s.settled, heightJumps: s.heightJumps, scroll: s.scrollJumps, anims: s.animations, ...st});
  check('group.toggle.paint', w, 'group toggle -> next paint', paintOf(s), paintOf(s) <= BAR.paint[env.mode], '<= ' + BAR.paint[env.mode] + 'ms');
  if(env.mode === 'normal') check('group.toggle.focus', w, 'focus after toggling a group', st.active, /toggleDecisionGroup|toggle-decision-group/.test(st.active), 'stays on the toggle');
  await ctx.close();
}

/* Plans -> Roadmap hand-off panel */
export async function handoff(env, kind){
  const {check, note} = env.R;
  const w = where('paths', kind, env.mode), phone = kind === 'phone';
  const {ctx, page} = await fresh(env, 'paths', kind);
  await toView(page, 'plans', phone);
  const jump = page.locator('#paths-projection-jump');
  if(await jump.isVisible()){   /* the jump exists at <= 430px only */
    const y0 = await page.evaluate(() => scrollY);
    const j = await measure(page, () => press(page, jump, phone), {quiet: 500, max: 4000});
    await sleep(1200);   // smooth scroll runs without DOM mutations: let it finish before reading where it landed
    const after = await page.evaluate(() => ({y: Math.round(scrollY), active: window.__feel.describe(document.activeElement), panelTop: Math.round(document.getElementById('roadmap-projection').getBoundingClientRect().top)}));
    note('handoff.jump', w, 'Choose exact outcome (jump)', {paint: paintOf(j), settled: j.settled, scrolled: after.y - y0, ...after, label: await jump.textContent()});
    check('handoff.jump.focus', w, 'focus after the jump', after.active, /input|roadmap-projection-title/.test(after.active), 'on the first ready outcome');
  }else note('handoff.jump', w, 'no jump button at this width; the panel follows the Plans matrix', await page.evaluate(() => Math.round(document.getElementById('roadmap-projection').getBoundingClientRect().top + scrollY)));
  const radio = page.locator('#roadmap-projection input[type=radio]:not([disabled])').first();
  if(!(await radio.count())){ note('handoff.none', w, 'no ready outcome', null); await ctx.close(); return; }
  const r = await measure(page, () => press(page, radio, phone), {quiet: 400});
  const st = await page.evaluate(() => ({active: window.__feel.describe(document.activeElement), checked: !!document.querySelector('#roadmap-projection input[type=radio]:checked'), create: !!document.getElementById('createroadmap'), createDisabled: document.getElementById('createroadmap')?.disabled, boxes: [...document.querySelectorAll('#roadmap-projection input')].map(i => { const b = i.getBoundingClientRect(); return Math.round(b.width) + 'x' + Math.round(b.height); }).slice(0, 4), labelH: Math.round(document.querySelector('.projection-choice')?.getBoundingClientRect().height || 0)}));
  note('handoff.choose', w, 'choose an outcome', {paint: paintOf(r), settled: r.settled, heightJumps: r.heightJumps, scroll: r.scrollJumps, cls: r.clsNoInput, ...st});
  check('handoff.choose.paint', w, 'choose an outcome -> next paint', paintOf(r), paintOf(r) <= BAR.paint[env.mode], '<= ' + BAR.paint[env.mode] + 'ms');
  if(env.mode === 'normal'){
    check('handoff.choose.focus', w, 'focus after choosing an outcome (the panel is rebuilt)', st.active, /input/.test(st.active), 'stays on the chosen radio');
    if(phone) check('handoff.choose.tap', w, 'outcome choice row height on a phone', st.labelH, st.labelH >= 44, '>= 44px');
    /* assumptions checkboxes then Create */
    const boxes = page.locator('#roadmap-projection input[type=checkbox]');
    for(let i = 0; i < await boxes.count(); i++){ await press(page, boxes.nth(i), phone); await sleep(120); }
    const act2 = await page.evaluate(() => window.__feel.describe(document.activeElement));
    check('handoff.assume.focus', w, 'focus after ticking an assumption', act2, /input/.test(act2), 'stays on the checkbox');
    const create = page.locator('#createroadmap');
    const enabled = await create.isEnabled().catch(() => false);
    note('handoff.create', w, 'Create Roadmap enabled after ticking assumptions', enabled);
    await shot(page, `${env.out}/shots/paths-${kind}-handoff.png`, {fullPage: true});
    if(enabled){
      const t0 = Date.now();
      const label0 = (await create.textContent()).trim();
      await press(page, create, phone);
      await page.waitForURL(/\/roadmap\//, {timeout: 8000}).catch(() => {});
      note('handoff.navigate', w, 'Create Roadmap -> Roadmap page', {ms: Date.now() - t0, url: page.url().replace(/#.*/, '#…'), label0});
      check('handoff.navigate', w, 'Create Roadmap opens Roadmap', page.url().includes('/roadmap/'), page.url().includes('/roadmap/'), 'navigates');
    }
  }
  await ctx.close();
}

/* Brief receipt "Edit in source" */
export async function editSource(env){
  const {check, note} = env.R;
  const w = where('paths', 'desktop', env.mode);
  const {ctx, page} = await fresh(env, 'paths', 'desktop');
  const btn = page.locator('#overview-receipt [data-edit-decision-source]');
  if(!(await btn.isVisible())){ note('editsource.missing', w, 'no Edit in source in the receipt', null); await ctx.close(); return; }
  const s = await measure(page, () => btn.click(), {quiet: 500});
  const st = await page.evaluate(() => ({active: window.__feel.describe(document.activeElement), ws: document.getElementById('workspace').className}));
  note('editsource', w, 'Edit in source from the receipt', {paint: paintOf(s), settled: s.settled, swaps: s.svgSwaps, anims: s.animations, layout: s.layoutAnimated, scroll: s.scrollJumps, ...st});
  check('editsource.focus', w, 'focus after Edit in source', st.active, /cm-content/.test(st.active), 'caret in the editor on the decision');
  check('editsource.renders', w, 'artefact renders when the rail opens', s.svgSwaps, s.svgSwaps <= 1, '<= 1');
  await shot(page, `${env.out}/shots/paths-desktop-editsource.png`);
  await ctx.close();
}

export const large = () => pathsLarge();
