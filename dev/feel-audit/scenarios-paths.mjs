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
    bar: !document.getElementById('selected-bar').hidden, bodyLocked: getComputedStyle(document.body).overflow, sheetOpen: document.body.classList.contains('overview-sheet-open'), scrollY: Math.round(scrollY)};
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
    await sleep(350);   // the reveal scroll runs over the base duration with no DOM mutation to wait on
    const st2 = await state(page);
    res.push({view, paint: paintOf(s), swap, settled: s.settled, swaps: s.svgSwaps, longTaskMax: s.longTaskMax, heightJumps: s.heightJumps, scroll: s.scrollJumps, cls: s.clsNoInput, anims: s.animations, y0, scrolledBy: st2.scrollY - y0, ...st2});
    if(env.mode === 'normal') await shot(page, `${env.out}/shots/paths-${kind}-select-${view}.png`);
    /* close: Escape */
    if(env.mode === 'normal' && (st.receipt?.sheet || view === 'tree' || st.receipt?.layout === 'overlay')){
      const e = await measure(page, () => page.keyboard.press('Escape'), {quiet: 400});
      await sleep(350);
      const after = await state(page);
      res.at(-1).escape = {paint: paintOf(e), swaps: e.svgSwaps, scroll: e.scrollJumps, active: after.active, receipt: !!after.receipt?.sheet, inspector: !!after.inspector, scrollY: after.scrollY};
    }
  }
  note(`select.${label}`, w, 'select a question on each view', res);
  const ok = res.filter(r => r.paint != null);
  check(`select.${label}.paint`, w, 'select a question -> next paint (worst view)', ok.map(r => r.view + ':' + r.paint).join(' '), ok.every(r => r.paint <= BAR.paint[env.mode]), '<= ' + BAR.paint[env.mode] + 'ms');
  check(`select.${label}.renders`, w, 'artefact renders per selection', ok.map(r => r.view + ':' + r.swaps).join(' '), ok.every(r => r.swaps <= 1), '<= 1');
  check(`select.${label}.longtask`, w, 'longest task in a selection', ok.map(r => r.view + ':' + r.longTaskMax).join(' '), ok.every(r => r.longTaskMax <= (env.mode === 'normal' ? 50 : 150)), env.mode === 'normal' ? '<= 50ms' : '<= 150ms');
  check(`select.${label}.scroll`, w, 'page scroll moved by selecting', ok.map(r => r.view + ':' + r.scrolledBy).join(' '), ok.every(r => Math.abs(r.scrolledBy) <= 1), 'selecting never moves the page (0px)');
  check(`select.${label}.cls`, w, 'layout shift caused by selecting (no-input shifts)', ok.map(r => r.view + ':' + r.cls).join(' '), ok.every(r => r.cls <= 0.05), '<= 0.05');
  const detailOk = r => r.sheet || (r.receipt ? r.receipt.inView : true) && (r.inspector ? r.inspector.inView : true);
  check(`select.${label}.detail`, w, 'the selected question\'s detail is on screen, or the pinned bar says where it is', ok.map(r => r.view + ':' + (r.receipt ? 'receipt ' + r.receipt.layout : r.inspector ? 'inspector' : 'in-artefact') + ((r.receipt ? r.receipt.inView : r.inspector ? r.inspector.inView : true) ? '' : r.bar ? ' OFF-SCREEN+BAR' : ' OFF-SCREEN')).join(' '), ok.every(r => detailOk(r) || r.bar), 'detail on screen or the bar shown');
  const escTree = ok.filter(r => r.escape && r.view === 'tree');
  if(env.mode === 'normal') check(`select.${label}.escape.scroll`, w, 'Escape leaves the page where it was', escTree.map(r => r.view + ':' + JSON.stringify({before: r.y0, after: r.escape.scrollY})).join(' '), escTree.every(r => Math.abs(r.escape.scrollY - r.y0) <= 2), 'back at the starting scroll position');
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
  const o = await measure(page, () => press(page, p, true), {quiet: 400});
  await sleep(300);
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
  const enter = o.animations.filter(a => /sheet-in/.test(a));
  check('sheet.motion', w, 'sheet opens with the shared entrance (opacity + rise, fast) and closes at once', {open: o.animations.length ? o.animations : 'none', close: c.animations.length ? c.animations : 'none'}, enter.length === 1 && /0\.12s/.test(enter[0]) && !c.animations.some(a => /sheet-in/.test(a)), 'an opacity/transform entrance of the fast duration on open; none on close');
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
  const st = await page.evaluate(() => { const ae = document.activeElement, first = document.querySelector('#preview [data-toggle-decision-group]'); return {expanded: first?.getAttribute('aria-expanded'), active: window.__feel.describe(ae), onToggle: !!ae?.matches?.('[data-toggle-decision-group]'), sameGroup: !!ae && ae.dataset?.stateGroup === first?.dataset?.stateGroup}; });
  note('group.toggle', w, 'expand a decision-state group', {paint: paintOf(s), swaps: s.svgSwaps, settled: s.settled, heightJumps: s.heightJumps, scroll: s.scrollJumps, anims: s.animations, ...st});
  check('group.toggle.paint', w, 'group toggle -> next paint', paintOf(s), paintOf(s) <= BAR.paint[env.mode], '<= ' + BAR.paint[env.mode] + 'ms');
  if(env.mode === 'normal') check('group.toggle.focus', w, 'focus after toggling a group', {active: st.active, onToggle: st.onToggle, sameGroup: st.sameGroup}, st.onToggle && st.sameGroup, 'stays on the toggle');
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
  await radio.scrollIntoViewIfNeeded(); await sleep(150);   // the harness's own scroll to reach the control stays outside the measured window
  const r = await measure(page, () => press(page, radio, phone), {quiet: 400});
  const st = await page.evaluate(() => ({active: window.__feel.describe(document.activeElement), checked: !!document.querySelector('#roadmap-projection input[type=radio]:checked'), create: !!document.getElementById('createroadmap'), createDisabled: document.getElementById('createroadmap')?.disabled, boxes: [...document.querySelectorAll('#roadmap-projection input')].map(i => { const b = i.getBoundingClientRect(); return Math.round(b.width) + 'x' + Math.round(b.height); }).slice(0, 4), labelH: Math.round(document.querySelector('.projection-choice')?.getBoundingClientRect().height || 0)}));
  note('handoff.choose', w, 'choose an outcome', {paint: paintOf(r), settled: r.settled, heightJumps: r.heightJumps, scroll: r.scrollJumps, cls: r.clsNoInput, ...st});
  check('handoff.choose.scroll', w, 'the page does not scroll when the panel rebuilds after choosing an outcome', r.scrollJumps.length ? r.scrollJumps : 'none', r.scrollJumps.length === 0, 'no scroll');
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

/* The decision margin never sits on the artefact: with a question selected on desktop, no part of the drawing is under the margin,
   and the drawing is not wider than its pane. The Brief is laid out for the width beside the rail, so at laptop widths (1280, 1600)
   the Brief's margin is a rail with nothing under it, never moved above the drawing. */
export async function margin(env){
  const {check, note} = env.R;
  for(const width of [1280, 1600]){
    const w = where('paths', 'desktop', env.mode) + '@' + width;
    const {ctx, page} = await fresh(env, 'paths', 'desktop');
    await page.setViewportSize({width, height: 800}); await sleep(500);
    const res = [];
    for(const view of ['brief', 'agenda', 'question', 'conditions']){
      await toView(page, view, false);
      let p = await pointOn(page, '#preview [data-select-decision]', {nth: 1, resolve: '[data-select-decision],[data-toggle-decision-group]'});
      if(!p) p = await pointOn(page, '#preview [data-select-decision]', {nth: 0, resolve: '[data-select-decision],[data-toggle-decision-group]'});
      if(!p){ res.push({view, none: true}); continue; }
      await page.mouse.click(p.x, p.y); await sleep(500); await waitQuiet(page, {quiet: 400});
      res.push({view, ...(await page.evaluate(() => {
        const live = document.getElementById('overview-live'), rc = document.getElementById('overview-receipt'), sv = document.querySelector('#preview svg'), pv = document.getElementById('preview');
        const r = rc.hidden ? null : rc.getBoundingClientRect(), s = sv.getBoundingClientRect(), pr = pv.getBoundingClientRect();
        const layout = live.dataset.receiptLayout;
        const overlap = !r ? false : !(r.right <= s.left + 1 || r.left >= s.right - 1 || r.bottom <= s.top + 1 || r.top >= s.bottom - 1);
        return {layout, receipt: !!r, overlap, svgRight: Math.round(s.right), paneRight: Math.round(pr.right), overflow: Math.round(s.right - pr.right), svgW: Math.round(s.width)};
      }))});
    }
    note('margin.detail', w, 'drawing vs margin per view', res);
    const ok = res.filter(r => !r.none);
    check('margin.clear', w, 'nothing in the drawing is under the decision margin', ok.map(r => r.view + ':' + r.layout + (r.overlap ? ' OVERLAP' : '')).join(' '), ok.every(r => !r.overlap), 'no overlap in any view');
    const brief = res.find(r => r.view === 'brief');
    check('margin.rail', w, 'the Brief keeps the margin as a rail beside the drawing', brief ? brief.layout + ' receipt:' + brief.receipt + ' svgW:' + brief.svgW : 'no brief', !!brief && brief.layout === 'rail' && brief.receipt && !brief.overlap && brief.overflow <= 1, 'rail, open, the drawing inside its pane');
    check('margin.fits', w, 'the drawing fits the pane that remains', ok.map(r => r.view + ':' + r.overflow).join(' '), ok.every(r => r.overflow <= 1), 'not wider than its pane');
    await ctx.close();
  }
}

/* The pinned "Selected: ..." bar: shown while a question is selected and its detail is out of sight, hidden when the detail is on
   screen, never over the view buttons, 44px on a phone, announced once; "Show details" goes to the detail, "Back to question" and
   Escape return to where the reader was and to the question. */
export async function pin(env){
  const {check, note} = env.R;
  for(const kind of ['desktop', 'phone']){
    const phone = kind === 'phone', w = where('paths', kind, env.mode);
    const {ctx, page} = await fresh(env, 'paths', kind);
    const views = phone ? ['tree'] : ['agenda', 'question', 'conditions', 'tree'];
    const rows = [];
    for(const view of views){
      await toView(page, view, phone);
      await page.evaluate(() => scrollTo(0, 0)); await sleep(200);
      const p = await pointOn(page, '#preview [data-select-decision]', {nth: 1, resolve: '[data-select-decision]'});
      if(!p){ rows.push({view, none: true}); continue; }
      await sleep(300);
      const y0 = await page.evaluate(() => scrollY);
      await press(page, p, phone); await sleep(450); await waitQuiet(page, {quiet: 300});
      const read = () => page.evaluate(() => {
        const bar = document.getElementById('selected-bar'), nav = document.querySelector('.paths-views').getBoundingClientRect(), br = bar.getBoundingClientRect();
        const det = document.getElementById('decision-inspector').hidden ? document.getElementById('overview-receipt') : document.getElementById('decision-inspector');
        const d = det.getBoundingClientRect();
        return {y: Math.round(scrollY), bar: !bar.hidden, barTop: Math.round(br.top), barH: Math.round(br.height), navBottom: Math.round(nav.bottom), navVisible: nav.bottom > 0 && nav.top < innerHeight,
          live: document.getElementById('selected-live').textContent, words: document.getElementById('selected-words').textContent, detailTop: Math.round(d.top), detailHidden: det.hidden,
          active: window.__feel.describe(document.activeElement), onQuestion: !!document.activeElement?.matches?.('[data-select-decision]')};
      });
      const a = await read();
      const row = {view, moved: a.y - y0, ...a};
      if(a.bar){
        await press(page, page.locator('#selected-show'), phone); await sleep(500);
        const b = await read();
        await press(page, page.locator('[data-back-to-question]').first(), phone); await sleep(600);
        const c = await read();
        row.show = {y: b.y, bar: b.bar, detailTop: b.detailTop, active: b.active};
        row.back = {y: c.y, onQuestion: c.onQuestion, bar: c.bar};
        if(view !== 'tree'){   /* Escape from an inline receipt goes back too */
          await press(page, page.locator('#selected-show'), phone); await sleep(500);
          await page.keyboard.press('Escape'); await sleep(600);
          const d = await read(); row.esc = {y: d.y, onQuestion: d.onQuestion};
        }else{
          await press(page, page.locator('#selected-show'), phone); await sleep(500);
          await page.keyboard.press('Escape'); await sleep(600);
          const d = await read(); row.esc = {y: d.y, closed: d.detailHidden};
        }
      }
      rows.push(row);
      if(env.mode === 'normal') await shot(page, `${env.out}/shots/paths-${kind}-pin-${view}.png`);
    }
    /* at the top of the page the view buttons are on screen: the bar, shown by force, sits below them */
    await page.evaluate(() => { scrollTo(0, 0); document.getElementById('selected-bar').hidden = false; }); await sleep(200);
    const top = await page.evaluate(() => ({nav: Math.round(document.querySelector('.paths-views').getBoundingClientRect().bottom), bar: Math.round(document.getElementById('selected-bar').getBoundingClientRect().top)}));
    check('pin.clear.top', w, 'at the top of the page the bar sits below the view buttons', top, top.bar >= top.nav - 1, 'bar top >= buttons bottom');
    note('pin.rows', w, 'selected bar per view', rows);
    const ok = rows.filter(r => !r.none);
    check('pin.nomove', w, 'selecting moves the page by 0px', ok.map(r => r.view + ':' + r.moved).join(' '), ok.every(r => r.moved === 0), '0px');
    check('pin.focus', w, 'focus stays on the selected question', ok.map(r => r.view + ':' + r.active).join(' '), ok.every(r => r.onQuestion || r.view === 'tree'), 'on the question');
    const withBar = ok.filter(r => r.bar);
    check('pin.shown', w, 'the bar appears when the detail is out of sight', ok.map(r => r.view + ':' + (r.bar ? 'bar' : 'detail ' + r.detailTop)).join(' '), ok.every(r => r.bar || (r.detailTop >= -10 && r.detailTop <= (phone ? 812 : 800) - 160) || r.detailHidden), 'bar, or the detail on screen');
    check('pin.words', w, 'the bar names the question and is announced once', withBar.map(r => r.view + ':' + r.words.slice(0, 24) + '|' + r.live.slice(0, 20)).join(' '), withBar.every(r => r.words && /^Selected:/.test(r.live)), '"Selected: ..." in the bar and the live region');
    check('pin.clear', w, 'the bar never covers the view buttons', withBar.map(r => r.view + ':' + r.barTop + '>=' + r.navBottom + (r.navVisible ? '' : '(buttons off screen)')).join(' '), withBar.every(r => !r.navVisible || r.barTop >= r.navBottom - 1), 'below the buttons while they are on screen');
    if(phone) check('pin.tap', w, 'the bar is at least 44px tall on a phone', withBar.map(r => r.view + ':' + r.barH).join(' '), withBar.every(r => r.barH >= 44), '>= 44px');
    check('pin.show', w, 'Show details takes the reader to the detail and hides the bar', withBar.map(r => r.view + ':' + JSON.stringify(r.show)).join(' '), withBar.every(r => r.show && r.show.detailTop >= 0 && r.show.detailTop <= 200 && !r.show.bar), 'detail head near the top, bar gone');
    check('pin.back', w, 'Back to question returns to where the reader was and to the question', withBar.map(r => r.view + ':' + JSON.stringify(r.back)).join(' '), withBar.every(r => r.back && Math.abs(r.back.y - (r.y - r.moved)) <= 2 && r.back.onQuestion), 'same scroll, focus on the question');
    check('pin.escape', w, 'Escape returns to where the reader was', withBar.map(r => r.view + ':' + JSON.stringify(r.esc)).join(' '), withBar.every(r => r.esc && Math.abs(r.esc.y - (r.y - r.moved)) <= 2 && (r.esc.onQuestion || r.esc.closed)), 'same scroll (and focus on the question or the inspector closed)');
    await ctx.close();
  }
}

/* "Edit in source": the page stays put when the decision's line is already on screen, and goes to the line (without a jump the
   reader did not ask for) when it is not. Each of the first questions is tried; both cases must occur. */
export async function editSourceLine(env){
  const {check, note} = env.R;
  const w = where('paths', 'desktop', env.mode);
  const rows = [];
  for(const railOpen of [false, true]) for(let i = 0; i < 4; i++){
    const {ctx, page} = await fresh(env, 'paths', 'desktop');
    if(railOpen){ await page.locator('#railtab').click(); await sleep(600); await waitQuiet(page, {quiet: 300}); }
    const p = await pointOn(page, '#preview [data-select-decision]', {nth: i, resolve: '[data-select-decision],[data-toggle-decision-group]'});
    if(!p){ await ctx.close(); continue; }
    await sleep(300);
    await press(page, p, false); await sleep(500); await waitQuiet(page, {quiet: 300});
    const btn = page.locator('#overview-receipt [data-edit-decision-source]');
    if(!(await btn.isVisible())){ await ctx.close(); continue; }
    const y0 = await page.evaluate(() => scrollY);
    await btn.click(); await sleep(1000);
    const r = await page.evaluate(() => { const l = document.querySelector('.cm-activeLine'); const b = l.getBoundingClientRect(); return {y: Math.round(scrollY), lineTop: Math.round(b.top + scrollY), inViewNow: b.top >= 0 && b.bottom <= innerHeight}; });
    rows.push({railOpen, i, y0, ...r, scrolled: r.y !== y0});
    await ctx.close();
  }
  /* the same press with the page scrolled so that the line (its position is known now) sits mid-screen */
  const known = rows.find(r => r.railOpen);
  if(known){
    const {ctx, page} = await fresh(env, 'paths', 'desktop');
    await page.locator('#railtab').click(); await sleep(600); await waitQuiet(page, {quiet: 300});
    const p = await pointOn(page, '#preview [data-select-decision]', {nth: known.i, resolve: '[data-select-decision],[data-toggle-decision-group]'});
    await sleep(300); await press(page, p, false); await sleep(500); await waitQuiet(page, {quiet: 300});
    await page.evaluate(top => scrollTo(0, top - 350), known.lineTop); await sleep(300);
    const y0 = await page.evaluate(() => scrollY);
    await page.locator('#overview-receipt [data-edit-decision-source]').evaluate(el => el.click()); await sleep(1000);
    const r = await page.evaluate(() => { const l = document.querySelector('.cm-activeLine'); const b = l.getBoundingClientRect(); return {y: Math.round(scrollY), lineTop: Math.round(b.top + scrollY), inViewNow: b.top >= 0 && b.bottom <= innerHeight}; });
    rows.push({railOpen: true, i: known.i, placed: true, y0, ...r, scrolled: r.y !== y0});
    await ctx.close();
  }
  /* was the line on screen when pressed? the rail is the same height before and after, so compare against the pressed scroll */
  for(const r of rows) r.wasInSight = r.lineTop - r.y0 >= 72 && r.lineTop - r.y0 <= 800 - 96;
  note('editsource.line', w, 'Edit in source for the first questions', rows);
  const vis = rows.filter(r => r.wasInSight), out = rows.filter(r => !r.wasInSight);
  check('editsource.line.visible', w, 'the line was already on screen: the page did not scroll', vis.map(r => r.railOpen + '/' + r.i + ':' + r.y0 + '->' + r.y), vis.length > 0 && vis.every(r => !r.scrolled), 'unchanged (and the case occurs)');
  check('editsource.line.hidden', w, 'the line was out of sight: the page scrolled to it', out.map(r => r.railOpen + '/' + r.i + ':' + r.y0 + '->' + r.y + (r.inViewNow ? '' : ' NOT IN VIEW')), out.length > 0 && out.every(r => r.scrolled && r.inViewNow), 'scrolled, line on screen (and the case occurs)');
}
