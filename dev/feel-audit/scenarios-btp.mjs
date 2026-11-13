/* Scenarios shared by Bets, Tree and Paths (feel audit 2026-11-13, second pass).
   Where a Roadmap/Timeline scenario in scenarios.mjs already fits these pages it is
   reused through TOOLS; the rest are written here against each tool's own selectors
   (CFG). Every check states its expectation; ids follow `<scenario>.<what>`. */
import {newPage, openTool, measure, waitQuiet, sleep, sourceText, touchSwipe, press, shot} from './lib.mjs';
import {BAR} from './checks.mjs';
import {TOOLS, pointOn, paintOf, motionOf, freshPage} from './scenarios.mjs';
import {betsLarge, treeLarge, pathsLarge} from './stress-btp.mjs';

/* the shared scenarios read the editor opener and the default view from TOOLS */
TOOLS.bets = {views: [], source: '#railtab', defaultView: 'board'};
TOOLS.tree = {views: [], source: '#railtab', defaultView: null};
TOOLS.paths = {views: [], source: '#railtab', defaultView: 'brief'};

export const LARGE = {bets: betsLarge, tree: treeLarge, paths: pathsLarge};
export const CFG = {
  bets: {card: '#preview [data-edit="cardmenu"]', cardRe: /^cardmenu$/, renameRow: /^Rename/, inline: '#preview [data-edit="name"]',
    removeRow: /^Remove/, probe: 'Referral flow v2', views: {picker: '#viewtoggle [data-view]', attr: 'view', list: ['quadrant', 'board']}},
  tree: {card: '#preview [data-edit^="cardmenu-"]:not([data-edit^="cardmenu-root"])', cardRe: /^cardmenu-/, renameRow: /^Rename/, inline: '#preview [data-edit="label"]',
    removeRow: /^Remove/, probe: 'Submit bid', views: null},
  paths: {card: null, probe: 'Resume position fix', views: {picker: '[data-paths-view]', attr: 'pathsView', list: ['agenda', 'question', 'conditions', 'tree', 'plans', 'brief']}},
};

export const where = (tool, kind, mode, extra = '') => `${tool}/${kind}/${mode}${extra}`;
export const bad = s => /^body\b/.test(s.active) || s.active === '?';
export async function fresh(env, tool, kind, opts = {}){ return freshPage(env, tool, kind, opts); }

/* Wait for the next artefact replacement after `act` and return ms from the input. */
export async function timeToRender(page, act, {timeout = 5000} = {}){
  await page.evaluate(timeout => {
    window.__ttr = new Promise(res => {
      const pv = document.getElementById('preview'); let t0 = 0;
      for(const type of ['pointerdown', 'keydown', 'touchstart']) addEventListener(type, () => { if(!t0) t0 = performance.now(); }, {once: true, capture: true});
      const mo = new MutationObserver(() => { mo.disconnect(); requestAnimationFrame(() => { const c = new MessageChannel(); c.port1.onmessage = () => res(t0 ? Math.round(performance.now() - t0) : -2); c.port2.postMessage(0); }); });
      mo.observe(pv, {childList: true});
      setTimeout(() => { mo.disconnect(); res(-1); }, timeout);
    });
  }, timeout);
  await act();
  return page.evaluate(() => window.__ttr);
}

/* ---------- card menu: open, rows, focus, Escape, outside ---------- */
export async function menus(env, tool, kind){
  const {check, note} = env.R; const c = CFG[tool];
  const w = where(tool, kind, env.mode), phone = kind === 'phone';
  const {ctx, page} = await fresh(env, tool, kind);
  const p = await pointOn(page, c.card, {nth: 0, prefer: 'center', resolve: '[data-edit]'});
  if(!p) throw new Error('no card-menu point');
  await sleep(200);
  const s = await measure(page, () => press(page, p, phone), {quiet: 250});
  const pop = await page.evaluate(() => {
    const p = document.querySelector('.eip-pop'); if(!p) return null;
    const r = p.getBoundingClientRect();
    const rows = [...p.querySelectorAll('button')].map(b => Math.round(b.getBoundingClientRect().height));
    return {inView: r.left >= 0 && r.top >= 0 && r.right <= innerWidth && r.bottom <= innerHeight, box: [r.left, r.top, r.width, r.height].map(Math.round), rows: rows.length, minRow: Math.min(...rows), active: document.activeElement?.textContent};
  });
  note('menu.open', w, 'open a card menu', {paint: paintOf(s), firstResponse: s.firstResponse, settled: s.settled, anims: s.animations, pop});
  check('menu.open.paint', w, 'card menu press -> next paint', paintOf(s), paintOf(s) <= BAR.paint[env.mode], '<= ' + BAR.paint[env.mode] + 'ms');
  check('menu.open.shown', w, 'popover visible and inside the viewport', pop, !!pop && pop.inView, 'fully on screen');
  if(env.mode === 'normal'){
    check('menu.open.focus', w, 'focus on open', pop && pop.active, !!(pop && pop.active), 'first menu row');
    if(phone) check('menu.rows.tap', w, 'menu row height on a phone', pop && pop.minRow, pop && pop.minRow >= BAR.tap, '>= 44px');
    check('menu.open.motion', w, 'menu appearance motion', motionOf(s).length ? motionOf(s) : 'none: appears instantly', motionOf(s).length > 0, 'the shared brief opacity/scale entrance');
    await page.keyboard.press('Escape'); await sleep(150);
    const restored = await page.evaluate(() => document.activeElement?.dataset?.edit || document.activeElement?.tagName);
    check('menu.escape.focus', w, 'focus after Escape closes the card menu', restored, c.cardRe.test(restored || ''), 'back on the card that opened it');
    await press(page, await pointOn(page, c.card, {nth: 0, resolve: '[data-edit]'}), phone); await sleep(200);
    await press(page, {x: 5, y: phone ? 300 : 400}, phone); await sleep(150);
    const gone = await page.evaluate(() => !document.querySelector('.eip-pop'));
    check('menu.away', w, 'press outside closes the menu', gone, gone, 'closed');
    /* rapid: open and Escape three times quickly — nothing left behind */
    for(let i = 0; i < 3; i++){ await press(page, await pointOn(page, c.card, {nth: 1, resolve: '[data-edit]'}), phone); await sleep(40); await page.keyboard.press('Escape'); await sleep(30); }
    await sleep(250);
    const left = await page.evaluate(() => document.querySelectorAll('.eip-pop').length);
    check('menu.rapid', w, 'open + Escape x3, 40ms apart', left, left === 0, 'no popover left behind');
  }
  await ctx.close();
}

/* ---------- rename: open, commit, cancel ---------- */
async function openRename(page, tool, phone, nth = 0){
  const c = CFG[tool];
  if(!phone){
    const p = await pointOn(page, c.inline, {nth, resolve: '[data-edit]'});
    if(!p) throw new Error('no inline rename point');
    await sleep(150);
    return measure(page, () => press(page, p, false), {quiet: 200});
  }
  await press(page, await pointOn(page, c.card, {nth, resolve: '[data-edit]'}), phone); await sleep(200);
  const row = page.locator('.eip-pop button', {hasText: c.renameRow}).first();
  return measure(page, () => press(page, row, phone), {quiet: 200});
}
export async function rename(env, tool, kind){
  const {check, note} = env.R;
  const w = where(tool, kind, env.mode), phone = kind === 'phone';
  const {ctx, page} = await fresh(env, tool, kind);
  const openS = await openRename(page, tool, phone, tool === 'tree' ? 1 : 0);
  const input = await page.evaluate(() => {
    const i = document.querySelector('.eip-input'); if(!i) return null;
    const r = i.getBoundingClientRect();
    return {font: parseFloat(getComputedStyle(i).fontSize), top: Math.round(r.top), bottom: Math.round(r.bottom), h: Math.round(r.height), vh: innerHeight, focused: document.activeElement === i, selected: i.selectionEnd - i.selectionStart};
  });
  note('eip.open', w, 'open the rename field', {paint: paintOf(openS), settled: openS.settled, anims: openS.animations, input});
  check('eip.open.paint', w, 'rename field appears (input -> next paint)', paintOf(openS), paintOf(openS) <= BAR.paint[env.mode], '<= ' + BAR.paint[env.mode] + 'ms');
  if(env.mode === 'normal'){
    check('eip.open.focus', w, 'rename field focused with text selected', input, !!input && input.focused && input.selected > 0, 'focused, text selected');
    if(phone){
      check('eip.input.font', w, 'rename field font size on a phone (iOS zoom floor)', input && input.font, input && input.font >= BAR.inputFont, '>= 16px');
      check('eip.input.keyboard', w, 'rename field position vs. on-screen keyboard (keyboard ~ bottom 45%)', input, input && input.bottom <= input.vh * 0.55, 'field in top 55% of the viewport');
    }
  }
  await page.keyboard.press('ControlOrMeta+A');
  await page.keyboard.type('Feel renamed');
  const applied = await timeToRender(page, async () => {
    await page.keyboard.press('Enter');
  });
  await waitQuiet(page, {quiet: 400});
  const after = await page.evaluate(() => ({active: window.__feel.describe(document.activeElement), shown: document.querySelector('#preview svg')?.textContent.includes('Feel renamed')}));
  note('eip.commit', w, 'commit rename with Enter', {applied, ...after});
  check('eip.commit.applied', w, 'Enter -> renamed text on the artefact', {applied, shown: after.shown}, after.shown && applied >= 0 && applied <= BAR.commit[env.mode], '<= ' + BAR.commit[env.mode] + 'ms (a discrete edit skips the typing debounce)');
  if(env.mode === 'normal'){
    check('eip.commit.focus', w, 'focus after commit', after.active, !/^body\b/.test(after.active), 'on the edited item (not body)');
    const cancel = await openRename(page, tool, phone, tool === 'tree' ? 2 : 1);
    await page.keyboard.type('zzz'); await page.keyboard.press('Escape'); await sleep(150);
    const st = await page.evaluate(() => ({active: window.__feel.describe(document.activeElement), open: !!document.querySelector('.eip-input')}));
    check('eip.cancel.focus', w, 'focus after Escape cancels a rename', st, !st.open && !/^body\b/.test(st.active), 'back on the target that opened it');
    const unchanged = !(await sourceText(page)).includes('zzz');
    check('eip.cancel.discard', w, 'Escape discards typed text', unchanged, unchanged, 'source unchanged');
    note('eip.cancel.open', w, 'second rename open', {paint: paintOf(cancel)});
  }
  await ctx.close();
}

/* ---------- invalid value: stays open, visible sentence ---------- */
export async function invalid(env, tool, kind, {row, value}){
  const {check} = env.R; const c = CFG[tool];
  const w = where(tool, kind, env.mode), phone = kind === 'phone';
  const {ctx, page} = await fresh(env, tool, kind);
  await press(page, await pointOn(page, c.card, {nth: 1, resolve: '[data-edit]'}), phone); await sleep(200);
  await press(page, page.locator('.eip-pop button', {hasText: row}).first(), phone); await sleep(150);
  await page.keyboard.press('ControlOrMeta+A');
  await page.keyboard.type(value);
  const s = await measure(page, () => page.keyboard.press('Enter'), {quiet: 400});
  const st = await page.evaluate(() => { const i = document.querySelector('.eip-input'); return i ? {open: true, invalid: i.getAttribute('aria-invalid'), visibleMsg: [...document.querySelectorAll('.eip-err')].some(e => { const r = e.getBoundingClientRect(); return e.textContent.trim().length > 0 && r.width > 8 && r.height > 8 && r.left >= 0 && r.right <= innerWidth && r.top >= 0 && r.bottom <= innerHeight; }), msg: document.querySelector('.eip-err')?.textContent} : {open: false}; });
  check('eip.invalid.state', w, `invalid ${row.source || row} "${value}" on Enter`, {...st, anims: s.animations}, st.open && st.invalid === 'true', 'field stays open, aria-invalid');
  check('eip.invalid.visible', w, 'a visible explanation of what is wrong', st, !!st.visibleMsg, 'visible message beside the field');
  await page.keyboard.press('Escape');
  await ctx.close();
}

/* ---------- add + remove through the card menu ---------- */
export async function addRemove(env, tool, kind, {addSel, addRow, typed = 'Feel added'}){
  const {check, note} = env.R; const c = CFG[tool];
  const w = where(tool, kind, env.mode), phone = kind === 'phone';
  const {ctx, page} = await fresh(env, tool, kind);
  let open;
  if(addSel){
    const p = await pointOn(page, addSel, {resolve: '[data-edit]'});
    if(!p){ note('add.missing', w, 'no add control on the artefact at this viewport', addSel); await ctx.close(); return; }
    open = await measure(page, () => press(page, p, phone), {quiet: 200});
  }else{
    await press(page, await pointOn(page, c.card, {nth: 0, resolve: '[data-edit]'}), phone); await sleep(200);
    open = await measure(page, () => press(page, page.locator('.eip-pop button', {hasText: addRow}).first(), phone), {quiet: 300});
  }
  const field = await page.evaluate(() => ({field: !!document.querySelector('.eip-input'), value: document.querySelector('.eip-input')?.value}));
  note('add.open', w, 'open the add field', {paint: paintOf(open), settled: open.settled, swaps: open.svgSwaps, ...field});
  if(!field.field){ check('add.field', w, 'add opens a name field', field, false, 'a focused name field'); await ctx.close(); return; }
  const existing = await page.evaluate(v => !!v && [...document.querySelectorAll('#preview [aria-label]')].some(e => (e.getAttribute('aria-label') || '').endsWith(': ' + v) || (e.getAttribute('aria-label') || '').endsWith(' ' + v)), field.value);
  check('add.field.value', w, 'the field opened by Add names the NEW item', field.value, !existing, 'empty or the new placeholder, never an existing item\'s name');
  await page.keyboard.press('ControlOrMeta+A');
  await page.keyboard.type(typed);
  const applied = await timeToRender(page, () => page.keyboard.press('Enter'));
  await waitQuiet(page, {quiet: 500});
  const appeared = await page.evaluate(t => document.querySelector('#preview svg')?.textContent.includes(t), typed);
  const act = await page.evaluate(() => ({active: window.__feel.describe(document.activeElement), label: document.activeElement?.getAttribute('aria-label') || document.activeElement?.textContent?.slice(0, 40)}));
  note('add', w, 'commit the new item', {applied, appeared, ...act});
  check('add.applied', w, 'Enter -> new item drawn (ms)', {applied, appeared}, appeared && applied >= 0 && applied <= BAR.commit[env.mode] + 50, '<= ' + (BAR.commit[env.mode] + 50) + 'ms');
  if(env.mode === 'normal'){
    check('add.focus', w, 'focus after adding', act, !/^body\b/.test(act.active) && (act.label || '').includes(typed), 'on the new item');
    const idx = await page.evaluate(([sel, t]) => [...document.querySelectorAll(sel)].findIndex(g => (g.getAttribute('aria-label') || '').includes(t)), [c.card, typed]);
    if(idx >= 0){
      await press(page, await pointOn(page, c.card, {nth: idx, resolve: '[data-edit]'}), phone); await sleep(200);
      const r = await measure(page, async () => { await press(page, page.locator('.eip-pop button', {hasText: c.removeRow}).first(), phone); await sleep(60); const conf = page.locator('.eip-pop button.danger'); if(await conf.count()) await press(page, conf.first(), phone); }, {quiet: 500});
      const gone = await page.evaluate(t => !document.querySelector('#preview svg')?.textContent.includes(t), typed);
      const landed = await page.evaluate(() => ({edit: document.activeElement?.dataset?.edit || null, visible: !!document.activeElement && document.activeElement.getClientRects().length > 0}));
      check('remove.focus', w, 'focus after removing an item', {gone, active: r.active, ...landed}, gone && !bad(r) && !!landed.edit && landed.visible, 'on a neighbouring item or the add control');
    }else note('remove.skip', w, 'added item not found in a card menu', idx);
  }
  await ctx.close();
}

/* ---------- view switch (Bets Board/Quadrant, Paths views) ---------- */
export async function views(env, tool, kind, {source, label = 'example'} = {}){
  const {check, note} = env.R; const v = CFG[tool].views;
  const w = where(tool, kind, env.mode), phone = kind === 'phone';
  const {ctx, page} = await fresh(env, tool, kind, {source});
  const all = [];
  for(const name of v.list){
    const sel = `${v.picker.split('[')[0]}[data-${v.attr.replace(/[A-Z]/g, m => '-' + m.toLowerCase())}="${name}"]`;
    let btn = page.locator(sel).first();
    if(!(await btn.isVisible())){   // Paths: Tree and Plans live under "More views"
      await press(page, page.locator('.paths-more-views > summary'), phone); await sleep(150);
      btn = page.locator(sel).first();
    }
    await btn.scrollIntoViewIfNeeded(); await sleep(120);
    const y0 = await page.evaluate(() => scrollY);
    const ttr = page.evaluate(() => new Promise(res => { const pv = document.getElementById('preview'); const t0 = performance.now(); const mo = new MutationObserver(() => { mo.disconnect(); res(Math.round(performance.now() - t0)); }); mo.observe(pv, {childList: true}); setTimeout(() => res(null), 4000); }));
    const s = await measure(page, () => press(page, btn, phone), {quiet: 350});
    s.view = name; s.swapAt = await ttr;
    s.scrollAfter = await page.evaluate(() => scrollY) - y0;
    s.pressed = await page.locator(sel).first().getAttribute('aria-pressed');
    s.pressedAt = await page.evaluate(() => { const F = window.__feel; const down = [...F.inputs].reverse().find(i => i[0] === 'click' || i[0] === 'touchend'); const m = down && F.muts.find(m => m[0] >= down[1] && m[2] === 'attr:aria-pressed'); return m ? Math.round(m[0] - down[1]) : null; });
    s.pageH = await page.evaluate(() => document.documentElement.scrollHeight);
    all.push(s);
    note(`view.${label}.${name}`, w, 'switch to ' + name, {paint: paintOf(s), swapAt: s.swapAt, pressedAt: s.pressedAt, settled: s.settled, dropped: s.dropped, longTaskMax: s.longTaskMax, swaps: s.svgSwaps, heightJumps: s.heightJumps, scrollJumps: s.scrollJumps, empty: s.emptyFrames, anims: s.animations, active: s.active, cls: s.cls});
    if(env.mode === 'normal' && label === 'example') await shot(page, `${env.out}/shots/${tool}-${kind}-view-${name}.png`);
  }
  const worst = k => Math.max(...all.map(k));
  check(`view.${label}.paint`, w, 'view switch input -> next paint (worst view)', all.map(s => s.view + ':' + paintOf(s)).join(' '), worst(paintOf) <= BAR.paint[env.mode], '<= ' + BAR.paint[env.mode] + 'ms');
  check(`view.${label}.swap`, w, 'view switch input -> new artefact in the DOM', all.map(s => s.view + ':' + s.swapAt).join(' '), all.every(s => s.swapAt != null && s.swapAt <= BAR.commit[env.mode]), '<= ' + BAR.commit[env.mode] + 'ms (a discrete action, no typing debounce)');
  check(`view.${label}.settle`, w, 'view switch settled (worst view)', all.map(s => s.view + ':' + s.settled).join(' '), worst(s => s.settled) <= BAR.settleView[env.mode], '<= ' + BAR.settleView[env.mode] + 'ms');
  check(`view.${label}.longtask`, w, 'longest task in a view switch', all.map(s => s.view + ':' + s.longTaskMax).join(' '), worst(s => s.longTaskMax) <= BAR.longTask * (env.mode === 'normal' ? 1 : 3), '<= ' + BAR.longTask * (env.mode === 'normal' ? 1 : 3) + 'ms');
  check(`view.${label}.scroll`, w, 'scroll position moved by a view switch', all.map(s => s.view + ':' + s.scrollAfter).join(' '), all.every(s => Math.abs(s.scrollAfter) <= 1), 'no scroll jump');
  check(`view.${label}.empty`, w, 'frames where the preview had no artefact mid-switch', all.flatMap(s => s.emptyFrames), all.every(s => !s.emptyFrames.length), 'never empty');
  check(`view.${label}.pressedframe`, w, 'pressed state changes with the press (ms after the click)', all.map(s => s.view + ':' + s.pressedAt).join(' '), all.every(s => s.pressedAt != null && s.pressedAt <= (env.mode === 'normal' ? 20 : 60)), '<= ' + (env.mode === 'normal' ? 20 : 60) + 'ms, before the new view paints');
  check(`view.${label}.pressed`, w, 'picked view shows pressed', all.map(s => s.view + ':' + s.pressed).join(' '), all.every(s => s.pressed === 'true'), 'aria-pressed=true');
  check(`view.${label}.focus`, w, 'focus after a view switch', all.map(s => s.view + ':' + s.active).join(' '), all.every(s => !bad(s) && /button|summary/.test(s.active)), 'stays on the pressed view button');
  check(`view.${label}.cls`, w, 'layout shift during view switches (no-input shifts)', all.map(s => s.view + ':' + s.clsNoInput).join(' '), all.every(s => s.clsNoInput <= 0.05), '<= 0.05');
  if(label === 'example' && env.mode === 'normal'){
    const anims = all.flatMap(motionOf);
    const ghosts = anims.filter(a => /mo-ghost/.test(a));
    check('view.transition', w, 'motion between views (non-colour transitions/animations)', anims.length ? anims : 'none: hard cut', ghosts.length >= all.length && all.every(s => !s.layoutAnimated.length), 'every switch uses the shared cross-fade (opacity only, ~140ms), no layout property animates');
    note('view.heightjumps', w, 'page height changes caused by view switches', all.filter(s => s.heightJumps.length).map(s => s.view + ':' + s.heightJumps.join(',')));
    /* interruption: two views 30ms apart */
    const [a, b] = v.list.filter(n => !['tree', 'plans'].includes(n));
    const sel = n => `${v.picker.split('[')[0]}[data-${v.attr.replace(/[A-Z]/g, m => '-' + m.toLowerCase())}="${n}"]`;
    await page.locator(sel(a)).first().click(); await sleep(30); await page.locator(sel(b)).first().click();
    await waitQuiet(page, {quiet: 500});
    const st = await page.evaluate(sel => ({pressed: [...document.querySelectorAll(sel)].filter(b => b.getAttribute('aria-pressed') === 'true').map(b => b.dataset.view || b.dataset.pathsView), svgs: document.querySelectorAll('#preview svg').length, ghosts: document.querySelectorAll('.mo-ghost').length}), v.picker);
    check('view.rapid', w, `two view clicks 30ms apart (${a} then ${b})`, st, st.pressed.length === 1 && st.pressed[0] === b && st.svgs === 1 && !st.ghosts, `ends on ${b}, one artefact, nothing left behind`);
  }
  await ctx.close();
  return all;
}

/* ---------- typing stall: per-key event timing and dropped input ---------- */
export async function stall(env, tool, kind, {source, label}){
  const {check, note} = env.R;
  const w = where(tool, kind, env.mode);
  const {ctx, page} = await fresh(env, tool, kind, {source});
  const ws = await page.locator('#workspace').evaluate(w => w.classList.contains('collapsed') || w.classList.contains('focus-artefact'));
  if(ws) await press(page, page.locator('#railtab'), kind === 'phone');
  await waitQuiet(page, {quiet: 400});
  await page.evaluate(async () => {
    const {EditorView} = await import('/assets/vendor/codemirror.js');
    const view = EditorView.findFromDOM(document.querySelector('.cm-editor'));
    const l = view.state.doc.line(1); view.dispatch({selection: {anchor: l.to}}); view.focus();
  });
  await sleep(200);
  const text = ' typing at sixty words a minute';
  const t0 = await page.evaluate(() => performance.now());
  await page.keyboard.type(text, {delay: 50});
  const burstEnd = await page.evaluate(() => performance.now());
  /* a natural pause just long enough for the 120ms debounce to fire, then the next key: it lands on the render */
  await sleep(135);
  await page.keyboard.type('!');
  const typedEnd = await page.evaluate(() => performance.now());
  await sleep(400);   // past the debounce: only now can "quiet" mean the page has finished
  await waitQuiet(page, {quiet: 500, max: 8000});
  const r = await page.evaluate(([t0, t1, tb]) => {
    const F = window.__feel;
    const keys = F.ev.filter(e => e[1] >= t0 && (e[0] === 'keydown' || e[0] === 'keypress' || e[0] === 'keyup'));
    const lt = F.lt.filter(l => l[0] >= t0 && l[0] <= t1 + 1000);
    const swaps = F.muts.filter(m => m[0] >= t0 && m[0] <= tb && m[2] === 'childList' && /#preview/.test(m[1]) && m[3] === 'svg').length;
    return {worstKeyEvent: keys.length ? Math.round(Math.max(...keys.map(k => k[2]))) : 0, keyEventsOver50: keys.filter(k => k[2] > 50).length, keyEventsOver100: keys.filter(k => k[2] > 100).length,
      longTasks: lt.length, longTaskMax: Math.round(Math.max(0, ...lt.map(l => l[1]))), longTaskTotal: Math.round(lt.reduce((s, l) => s + l[1], 0)), renders: swaps, typingMs: Math.round(t1 - t0)};
  }, [t0, typedEnd, burstEnd]);
  const src = await sourceText(page);
  const intact = src.split('\n')[0].endsWith(text + '!');
  note(`stall.${label}`, w, `type ${text.length} keys at 50ms into the title line, pause 135ms, one more key`, r);
  check(`stall.${label}.live`, w, 'artefact renders while typing continuously at 50ms a key (it waits for a 120ms pause)', r.renders, r.renders >= 2, 'the picture keeps up while typing (recorded: the debounce defers every render to the pause)');
  check(`stall.${label}.keys`, w, 'worst keystroke event (input -> next paint, Event Timing) while the artefact re-renders behind it', {worst: r.worstKeyEvent, over50: r.keyEventsOver50, over100: r.keyEventsOver100}, r.worstKeyEvent <= BAR.paint[env.mode], '<= ' + BAR.paint[env.mode] + 'ms: typing never visibly stalls');
  check(`stall.${label}.longtask`, w, 'longest task while typing', {max: r.longTaskMax, n: r.longTasks, total: r.longTaskTotal, renders: r.renders}, r.longTaskMax <= (env.mode === 'normal' ? 50 : 150), env.mode === 'normal' ? '<= 50ms' : '<= 150ms');
  check(`stall.${label}.dropped`, w, 'every typed character landed in the source', intact, intact, 'no dropped input');
  await ctx.close();
}

/* ---------- source editor rail: close (if it lands open) then open; rapid toggle ---------- */
export async function rail(env, tool){
  const {check, note} = env.R;
  const w = where(tool, 'desktop', env.mode);
  const {ctx, page} = await fresh(env, tool, 'desktop');
  const tab = page.locator('#railtab');
  const startCollapsed = await page.locator('#workspace').evaluate(w => w.classList.contains('collapsed') || w.classList.contains('focus-artefact'));
  note('rail.landing', w, 'rail state on landing', {collapsed: startCollapsed, label: await tab.getAttribute('aria-label')});
  if(!startCollapsed){
    const c = await measure(page, () => tab.click(), {quiet: 400});
    note('rail.close', w, 'close the source editor', {paint: paintOf(c), settled: c.settled, swaps: c.svgSwaps, dropped: c.dropped, longTaskMax: c.longTaskMax, layoutAnimated: c.layoutAnimated, anims: c.animations, cls: c.clsNoInput, active: c.active});
    check('rail.close.rerenders', w, 'artefact renders when the rail closes', c.svgSwaps, c.svgSwaps <= 1, '<= 1');
    check('rail.close.layoutprops', w, 'rail close animates layout properties', c.layoutAnimated.length ? c.layoutAnimated : 'none', !c.layoutAnimated.length, 'none');
    if(env.mode === 'normal') check('rail.close.focus', w, 'focus after closing the editor', c.active, !bad(c), 'not lost to body');
  }
  const o = await measure(page, () => tab.click(), {quiet: 400});
  note('rail.open', w, 'open the source editor', {paint: paintOf(o), settled: o.settled, swaps: o.svgSwaps, dropped: o.dropped, worstFrame: o.worstFrame, longTaskMax: o.longTaskMax, layoutAnimated: o.layoutAnimated, anims: o.animations, cls: o.clsNoInput, active: o.active});
  check('rail.open.paint', w, 'rail open input -> next paint', paintOf(o), paintOf(o) <= BAR.paint[env.mode], '<= ' + BAR.paint[env.mode] + 'ms');
  check('rail.open.rerenders', w, 'artefact renders when the rail opens', o.svgSwaps, o.svgSwaps <= 1, '<= 1');
  check('rail.open.layoutprops', w, 'rail open animates layout properties', o.layoutAnimated.length ? o.layoutAnimated : 'none', !o.layoutAnimated.length, 'transform/opacity only');
  check('rail.open.dropped', w, 'dropped frames during rail open', {dropped: o.dropped, worst: o.worstFrame}, o.dropped <= (env.engine === 'webkit' ? 1 : 0), env.engine === 'webkit' ? '<= 1' : '0');
  check('rail.open.longtask', w, 'longest task during rail open (the artefact re-fits)', o.longTaskMax, o.longTaskMax <= BAR.longTask * (env.mode === 'normal' ? 1 : 3), '<= ' + BAR.longTask * (env.mode === 'normal' ? 1 : 3) + 'ms');
  check('rail.open.focus', w, 'focus after opening the editor', o.active, /cm-content/.test(o.active), 'in the source editor');
  if(env.mode === 'normal'){
    const before = await page.locator('#workspace').getAttribute('class');
    await tab.click(); await sleep(60); await tab.click();
    await waitQuiet(page, {quiet: 500});
    const after = await page.locator('#workspace').getAttribute('class');
    const rail = await page.evaluate(() => { const r = document.querySelector('.rail'); const b = r.getBoundingClientRect(); return {w: Math.round(b.width), op: getComputedStyle(r).opacity, svgs: document.querySelectorAll('#preview svg').length}; });
    check('rail.rapid', w, 'close then open 60ms apart', {before, after, rail}, before === after && rail.w > 100 && rail.op === '1' && rail.svgs === 1, 'back where it started: rail fully open, one artefact');
  }
  await ctx.close();
}

/* ---------- Undo button ---------- */
export async function undo(env, tool, kind){
  const {check, note} = env.R;
  const w = where(tool, kind, env.mode), phone = kind === 'phone';
  const {ctx, page} = await fresh(env, tool, kind);
  const btn = page.locator('.touch-undo');
  const vis = await btn.isVisible().catch(() => false);
  note('undo.visible', w, 'Undo button visible', {visible: vis, coarse: phone});
  if(!vis){ await ctx.close(); return; }
  const disabledAtRest = await btn.isDisabled();
  /* make one source edit through the editor (rename a visible item), then Undo from the button */
  await page.evaluate(async probe => {
    const {EditorView} = await import('/assets/vendor/codemirror.js');
    const view = EditorView.findFromDOM(document.querySelector('.cm-editor'));
    const i = view.state.doc.toString().indexOf(probe);
    view.dispatch({changes: {from: i, to: i + probe.length, insert: 'undo-me'}});
  }, CFG[tool].probe);
  await sleep(400);   // the typing debounce (120ms) must fire before "quiet" means anything
  await waitQuiet(page, {quiet: 500});
  const before = await page.evaluate(() => document.querySelector('#preview svg')?.textContent.includes('undo-me'));
  await btn.scrollIntoViewIfNeeded(); await sleep(150);
  const applied = await timeToRender(page, () => press(page, btn, phone));
  await waitQuiet(page, {quiet: 400});
  const st = await page.evaluate(() => ({gone: !document.querySelector('#preview svg')?.textContent.includes('undo-me'), active: window.__feel.describe(document.activeElement)}));
  note('undo', w, 'press Undo after a source edit', {disabledAtRest, before, applied, ...st});
  check('undo.applied', w, 'Undo press -> artefact shows the previous state (ms)', {applied, before, ...st}, before && st.gone && applied >= 0 && applied <= BAR.commit[env.mode] + 120, '<= ' + (BAR.commit[env.mode] + 120) + 'ms');
  if(env.mode === 'normal') check('undo.focus', w, 'focus after pressing Undo', st.active, !/^body\b/.test(st.active), 'not lost to body');
  if(!phone) check('undo.desktop', w, 'touch Undo button shown on a fine-pointer desktop (earlier audit F44)', vis, !vis, 'phones only (desktop has Cmd/Ctrl+Z)');
  await ctx.close();
}

/* ---------- shell: File/Examples, Share, Copy PNG, Export, History ---------- */
export async function shell(env, tool, kind){
  const {check, note} = env.R;
  const w = where(tool, kind, env.mode), phone = kind === 'phone';
  const {ctx, page} = await fresh(env, tool, kind);
  const file = page.locator('[data-shell-file] > summary');
  const fo = await measure(page, () => press(page, file, phone), {quiet: 200});
  note('file.open', w, 'open File', {paint: paintOf(fo), anims: fo.animations, active: fo.active});
  await page.keyboard.press('Escape'); await sleep(100);
  check('file.escape', w, 'Escape closes the File menu', await page.locator('[data-shell-file]').evaluate(d => !d.open), await page.locator('[data-shell-file]').evaluate(d => !d.open), 'closed');
  if(await page.locator('[data-shell-file]').evaluate(d => d.open)) await press(page, file, phone);
  /* Start your own */
  await press(page, file, phone); await sleep(100);
  const newBtn = page.locator('[data-act="new"]');
  if(await newBtn.isEnabled()){
    const s = await measure(page, () => press(page, newBtn, phone), {quiet: 500, max: 8000});
    const st = await page.evaluate(() => ({svg: !!document.querySelector('#preview svg'), placeholder: document.querySelector('#preview .placeholder')?.textContent?.slice(0, 60), dialog: !!document.querySelector('dialog[open]'), open: document.querySelector('[data-shell-file]').open}));
    note('new', w, 'File -> New (Start your own)', {paint: paintOf(s), settled: s.settled, swaps: s.svgSwaps, anims: s.animations, scroll: s.scrollJumps, active: s.active, ...st});
    if(env.mode === 'normal') check('new.focus', w, 'focus after File -> New', s.active, !bad(s), 'not lost to body (in the editor or the artefact)');
    await shot(page, `${env.out}/shots/${tool}-${kind}-new.png`);
    if(st.dialog) await page.keyboard.press('Escape');
  }
  /* Examples */
  if(!(await page.locator('[data-shell-file]').evaluate(d => d.open))) await press(page, file, phone);
  await sleep(100);
  await press(page, page.locator('[data-act="examples"]'), phone); await sleep(120);
  const exs = page.locator('[data-shell-examples-list] button, [data-shell-examples-list] a');
  note('examples.list', w, 'examples offered', await exs.allTextContents());
  const ex = exs.nth(Math.min(1, (await exs.count()) - 1));
  if(await ex.count()){
    const s = await measure(page, () => press(page, ex, phone), {quiet: 500, max: 8000});
    note('example.switch', w, 'switch example', {paint: paintOf(s), settled: s.settled, swaps: s.svgSwaps, anims: s.animations, heightJumps: s.heightJumps, scroll: s.scrollJumps, longTaskMax: s.longTaskMax, menuOpen: await page.locator('[data-shell-file]').evaluate(d => d.open), active: s.active});
    check('example.switch.settle', w, 'example switch settled', s.settled, s.settled <= BAR.settleView[env.mode] * 2, '<= ' + BAR.settleView[env.mode] * 2 + 'ms');
    if(env.mode === 'normal') check('example.switch.focus', w, 'focus after choosing an example', s.active, !bad(s), 'not lost to body');
  }
  await waitQuiet(page);
  if(await page.locator('[data-shell-file]').evaluate(d => d.open)) await press(page, file, phone);
  /* Share */
  await page.evaluate(() => { window.__shareAck = new Promise(res => { const el = document.querySelector('.tool-status'), t0 = performance.now();
    new MutationObserver((m, mo) => { if(el.textContent){ mo.disconnect(); res(Math.round(performance.now() - t0)); } }).observe(el, {childList: true, characterData: true, subtree: true});
    setTimeout(() => res(null), 3000); }); });
  const sh = await measure(page, () => press(page, page.locator('[data-act="share"]'), phone), {quiet: 300});
  const ack = await page.evaluate(() => window.__shareAck);
  note('share', w, 'press Share', {ack, status: await page.locator('.tool-status').textContent(), active: sh.active});
  check('share.feedback', w, 'Share acknowledged in the status line', ack, ack != null && ack <= BAR.feedback * (env.mode === 'normal' ? 1 : 4), '<= ' + BAR.feedback * (env.mode === 'normal' ? 1 : 4) + 'ms');
  if(env.mode === 'normal') check('share.focus', w, 'focus after pressing Share', sh.active, /tool-share/.test(sh.active), 'Share keeps focus');
  if(env.mode !== 'normal' || phone){ await ctx.close(); return; }
  /* Copy PNG twice */
  const copy = page.locator('#copypng');
  const orig = (await copy.textContent()).trim();
  const c1 = await measure(page, () => copy.click(), {quiet: 300, max: 6000});
  const flashed = (await copy.textContent()).trim();
  await copy.click(); await sleep(4600);
  const finalLabel = (await copy.textContent()).trim();
  note('copy.png', w, 'Copy PNG', {firstResponse: c1.firstResponse, longTaskMax: c1.longTaskMax, flashed});
  check('copy.png.feedback', w, 'Copy PNG acknowledged (label changes)', {firstResponse: c1.firstResponse, flashed}, flashed !== orig && c1.firstResponse != null && c1.firstResponse <= BAR.feedback * 3, 'label changes within 300ms');
  check('copy.png.double', w, 'Copy PNG pressed again while confirming, label after 4.6s', {orig, flashed, after: finalLabel}, finalLabel === orig, 'returns to "' + orig + '"');
  /* Export menu: Copy as markdown (Bets) */
  const md = page.locator('#copymd');
  if(await md.count()){
    await page.locator('.action-disclosure:not(.history) > summary').first().click(); await sleep(100);
    const mdOrig = (await md.textContent()).trim();
    const ms = await measure(page, () => md.click(), {quiet: 200});
    const mdFlash = (await md.textContent()).trim();
    await md.click(); await sleep(3200);
    const mdFinal = (await md.textContent()).trim();
    note('copy.md', w, 'Copy as markdown', {firstResponse: ms.firstResponse, longTaskMax: ms.longTaskMax, flash: mdFlash});
    check('copy.md.label', w, 'Copy as markdown label after the confirmation clears (pressed twice)', {before: mdOrig, flash: mdFlash, after3s: mdFinal}, mdFinal === mdOrig, 'returns to "' + mdOrig + '"');
    await page.keyboard.press('Escape');
  }
  await ctx.close();
}

/* ---------- reduced motion: view switch, rail, edit ---------- */
export async function reduced(env, tool){
  const {check} = env.R;
  const w = where(tool, 'desktop', env.mode) + '/reduced';
  const {ctx, page} = await fresh(env, tool, 'desktop', {reducedMotion: 'reduce'});
  const found = [];
  const record = s => found.push(...s.animations.filter(a => !/ 0s\|/.test(a) && !/^\d+x (color|background-color|border-color|border-\w+-color|outline-color|fill|stroke) /.test(a)));
  const v = CFG[tool].views;
  if(v){ const b = page.locator(v.picker).first(); record(await measure(page, () => b.click())); }
  record(await measure(page, () => page.locator('#railtab').click(), {quiet: 400}));
  record(await measure(page, () => page.locator('#railtab').click(), {quiet: 400}));
  if(CFG[tool].card){ const p = await pointOn(page, CFG[tool].card, {resolve: '[data-edit]'}); record(await measure(page, () => page.mouse.click(p.x, p.y))); await page.keyboard.press('Escape'); }
  check('reduced.motion', w, 'non-colour motion under prefers-reduced-motion (view, rail open/close, menu)', found.length ? [...new Set(found)] : 'none', found.length === 0, 'none');
  await ctx.close();
}

/* ---------- keyboard: Tab order and rings across the stage ---------- */
export async function keyboard(env, tool){
  const {check, note} = env.R;
  const w = where(tool, 'desktop', env.mode);
  const {ctx, page} = await fresh(env, tool, 'desktop');
  /* Tab inside the source editor: does it indent (trapped) or move on? */
  const before = await sourceText(page);
  const collapsed = await page.locator('#workspace').evaluate(w => w.classList.contains('collapsed') || w.classList.contains('focus-artefact'));
  if(!collapsed){
    await page.locator('.cm-content').click(); await page.keyboard.press('Tab'); await sleep(150);
    const trap = await page.evaluate(() => ({inEditor: !!document.activeElement.closest('.cm-editor')}));
    const changed = (await sourceText(page)) !== before;
    note('keyboard.editortab', w, 'Tab pressed in the source editor', {...trap, sourceChanged: changed});
    if(changed) await page.keyboard.press('ControlOrMeta+z');
  }
  /* then walk the stage from the control that follows the editor toggle */
  await page.locator('#railtab').focus();
  const stops = [];
  for(let i = 0; i < 60; i++){
    await page.keyboard.press('Tab');
    stops.push(await page.evaluate(() => {
      const el = document.activeElement; if(!el || el === document.body) return {body: true};
      const cs = getComputedStyle(el); const r = el.getBoundingClientRect();
      const ring = (cs.outlineStyle !== 'none' && parseFloat(cs.outlineWidth) > 0) || (cs.boxShadow && cs.boxShadow !== 'none');
      const inView = r.bottom > 0 && r.top < innerHeight && r.right > 0 && r.left < innerWidth;
      return {d: window.__feel.describe(el), ring, w: Math.round(r.width), h: Math.round(r.height), inView, inPreview: !!el.closest('#preview'), past: !!el.closest('.mg-footer, .about')};
    }));
    if(stops.at(-1).past || stops.at(-1).body) break;   // left the tool surface
  }
  /* CodeMirror draws its focus on the editor wrapper, not on .cm-content */
  const noRing = stops.filter(s => !s.body && !s.past && !s.ring && !/cm-content/.test(s.d));
  const hidden = stops.filter(s => !s.body && !s.past && !s.inView);
  note('keyboard.stops', w, 'Tab stops from the editor toggle', stops.map(s => s.body ? 'BODY' : `${s.d}${s.ring ? '' : '(no ring)'}${s.inView ? '' : '(off-screen)'}${s.w < 4 || s.h < 4 ? '(' + s.w + 'x' + s.h + ')' : ''}`));
  check('keyboard.ring', w, 'Tab stops with no visible focus indicator (outline/box-shadow)', {count: noRing.length, examples: [...new Set(noRing.map(s => s.d.replace(/\[.*$/, '')))].slice(0, 8)}, noRing.length === 0, '0');
  check('keyboard.offscreen', w, 'Tab stops not scrolled into view', hidden.map(s => s.d).slice(0, 8), hidden.length === 0, 'every focused control is on screen');
  check('keyboard.body', w, 'focus fell to body while tabbing', stops.filter(s => s.body).length, !stops.some(s => s.body), 'never');
  await ctx.close();
}

/* ---------- touch specifics ---------- */
export async function touch(env, tool){
  const {check, note} = env.R;
  const w = where(tool, 'phone', env.mode);
  const {ctx, page} = await fresh(env, tool, 'phone');
  const cardSel = CFG[tool].card || '#preview [data-select-decision]';
  const ta = await page.evaluate(card => {
    /* touch-action is not inherited but applies along the ancestor chain: report the most restrictive value on the way up */
    const q = s => { let e = document.querySelector(s); if(!e) return 'n/a'; let v = 'auto'; for(; e && e !== document.documentElement; e = e.parentElement){ const t = getComputedStyle(e).touchAction; if(t === 'none') return 'none'; if(t === 'manipulation') v = 'manipulation'; } return v; };
    const us = s => { const e = document.querySelector(s); return e ? (getComputedStyle(e).webkitUserSelect || getComputedStyle(e).userSelect) : 'n/a'; };
    return {preview: q('#preview'), card: q(card), cardText: us(card + ' text') === 'n/a' ? us(card) : us(card + ' text'), btn: q('#copypng'), html: q('html')};
  }, cardSel);
  note('touch.css', w, 'touch-action / user-select on touch surfaces', ta);
  check('touch.dbltapzoom', w, 'touch-action on tappable controls and cards', ta, ['manipulation', 'none'].includes(ta.btn) && ['manipulation', 'none', 'pan-x pan-y'].includes(ta.card), 'manipulation on buttons and tappable cards');
  check('touch.select', w, 'artefact text selectable by long-press on tappable cards', ta.cardText, ta.cardText === 'none', 'user-select:none on tap targets');
  const y0 = await page.evaluate(() => scrollY);
  const b = await page.locator('#preview').boundingBox();
  await touchSwipe(page, {x: b.x + b.width / 2, y: 600}, {x: b.x + b.width / 2, y: 250});
  await sleep(500);
  const st = await page.evaluate(y0 => ({scrolled: scrollY - y0, menu: !!document.querySelector('.eip-pop'), sheet: document.body.classList.contains('overview-sheet-open'), selection: getSelection().toString()}), y0);
  check('touch.swipe', w, 'vertical swipe over the artefact scrolls the page and opens nothing', st, st.scrolled > 100 && !st.menu && !st.sheet && !st.selection, 'scrolls > 100px, no menu or sheet, no selection');
  const small = await page.evaluate(() => [...document.querySelectorAll('button, summary, select, a[href], input, [data-edit], [data-select-decision], [role="button"]')].filter(el => {
    if(el.closest('.mg-footer, .about, .syntax, .mg-masthead, .rail, .cm-editor')) return false;
    const r = el.getBoundingClientRect(); if(!r.width || !r.height || getComputedStyle(el).visibility === 'hidden') return false;
    if(el.closest('details:not([open])') && el.tagName !== 'SUMMARY') return false;
    if(el.tabIndex < 0 && !el.matches('[data-select-decision]')) return false;
    return Math.min(r.width, r.height) < 44;
  }).map(el => window.__feel.describe(el) + ' ' + Math.round(el.getBoundingClientRect().width) + 'x' + Math.round(el.getBoundingClientRect().height)));
  check('touch.targets', w, 'tap targets under 44px in the tool surface', small.length ? small.slice(0, 14) : 'none', small.length === 0, 'none');
  await ctx.close();
}
