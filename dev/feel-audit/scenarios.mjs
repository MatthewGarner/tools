/* Interaction scenarios for Roadmap and Timeline. Each scenario opens its own page,
   drives real input (mouse, keyboard, touch), measures with the lib.mjs probe and
   records checks. Scenario ids are stable; check ids are `<scenario>.<what>`. */
import {readFileSync} from 'node:fs';
import {newPage, openTool, measure, waitQuiet, sleep, sourceText, mouseDrag, touchSwipe, press, shot, hashFor} from './lib.mjs';
import {BAR} from './checks.mjs';

const FIX = new URL('../fixtures/export-stress/', import.meta.url);
export const stress = (tool, name) => readFileSync(new URL(`${tool}/${name}.txt`, FIX), 'utf8');

export const TOOLS = {
  roadmap: {views: ['grid', 'board', 'focus', 'register'], source: '#railtab', defaultView: 'focus'},
  timeline: {views: ['field', 'review', 'decisions', 'register'], source: '#editsource', defaultView: 'field'},
};

/* A point inside `sel`'s nth match whose topmost hit resolves (via closest) to that
   same element — so a real click lands on the intended target and nothing else. */
export async function pointOn(page, sel, {nth = 0, resolve = '[data-edit],[data-inspect],[data-whatif],[data-lens]', prefer = 'center'} = {}){
  return page.evaluate(({sel, nth, resolve, prefer}) => {
    const el = document.querySelectorAll(sel)[nth];
    if(!el) return null;
    el.scrollIntoView({block: 'center', inline: 'nearest'});
    const r = el.getBoundingClientRect();
    const cand = [];
    const fx = prefer === 'right' ? [.92, .8, .6, .5] : prefer === 'left' ? [.08, .2, .35] : [.5, .3, .7, .15, .85];
    for(const fy of [.5, .8, .2, .95, .05]) for(const f of fx) cand.push([r.left + r.width * f, r.top + r.height * fy]);
    for(const [x, y] of cand){
      const hit = document.elementFromPoint(x, y);
      if(!hit) continue;
      const owner = hit.closest(resolve);
      if(owner === el || (el.contains(hit) && !el.contains(owner) && owner === null)) return {x, y};
    }
    return null;
  }, {sel, nth, resolve, prefer});
}

const where = (tool, kind, mode) => `${tool}/${kind}/${mode}`;
export const paintOf = s => Math.max(s.eventTiming || 0, s.nextPaintApprox || 0);
const bad = s => /^body\b/.test(s.active) || s.active === '?';
/* the card hover dim (style.css `transition: opacity .15s` on g) is hover feedback, not motion of the change */
export const motionOf = s => s.animations.filter(a => !/opacity @g 0\.1[25]s/.test(a) && !/^\d+x (color|background-color|border(-\w+)?-color|outline-color|fill|stroke) /.test(a));

export async function freshPage(env, tool, kind, opts = {}){ return fresh(env, tool, kind, opts); }
async function fresh(env, tool, kind, opts = {}){
  const p = await newPage(env.browser, kind, {throttle: env.throttle, engine: env.engine, ...opts});
  await openTool(p.page, env.base, tool, opts.source);
  return p;
}
async function openSource(page, tool, phone){
  const collapsed = await page.locator('#workspace').evaluate(w => w.classList.contains('collapsed') || w.classList.contains('focus-artefact'));
  if(collapsed) await press(page, page.locator(TOOLS[tool].source), phone);
  await waitQuiet(page, {quiet: 400});
}

/* ---------- first load ---------- */
export async function load(env, tool, kind, {source, label = 'example'} = {}){
  const {check, note} = env.R;
  const w = where(tool, kind, env.mode);
  const {ctx, page, errors} = await newPage(env.browser, kind, {throttle: env.throttle, engine: env.engine});
  const t = Date.now();
  await page.goto(env.base + '/' + tool + '/' + (source ? '#' + hashFor(source) : ''), {waitUntil: 'load'});
  await page.waitForFunction(() => document.querySelector('#preview svg'), null, {timeout: 20000});
  await waitQuiet(page, {quiet: 500, max: 8000});
  const s = await page.evaluate(() => {
    const F = window.__feel;
    const first = F.frames.find(f => f[4] === 1);
    const s = F.summary(0, performance.now() - 450);
    s.firstSvg = first ? Math.round(first[0]) : null;
    s.fontsReadyAt = Math.round(performance.getEntriesByType('navigation')[0]?.loadEventEnd || 0);
    s.svgReplacements = F.muts.filter(m => m[2] === 'childList' && m[1].startsWith('div#preview') && m[3] === 'svg').length;   // artefact renders; the parser's own insertion of the placeholder is not one
    return s;
  });
  const id = `load.${label}`;
  note(id + '.summary', w, 'first load', {firstSvg: s.firstSvg, settled: s.settled, cls: s.cls, longTasks: s.longTasks, longTaskMax: s.longTaskMax, heightJumps: s.heightJumps.length, previewHeightJumps: s.previewHeightJumps, svgReplacements: s.svgReplacements, animations: s.animations, shiftSources: s.shiftSources, wall: Date.now() - t});
  check(id + '.cls', w, 'layout shift during load (no input)', s.cls, s.cls <= 0.05, '<= 0.05');
  check(id + '.firstsvg', w, 'artefact first on screen (ms from navigation)', s.firstSvg, s.firstSvg <= (env.mode === 'normal' ? 1200 : 3000), env.mode === 'normal' ? '<= 1200ms' : '<= 3000ms');
  check(id + '.replacements', w, 'artefact renders during load (each one after the first flashes/re-lays out)', s.svgReplacements, s.svgReplacements <= 1, '<= 1 render');
  check(id + '.longtask', w, 'longest task during load', s.longTaskMax, s.longTaskMax <= (env.mode === 'normal' ? 200 : 600), env.mode === 'normal' ? '<= 200ms' : '<= 600ms');
  if(env.mode === 'normal' && kind === 'desktop' && label === 'example') check(id + '.errors', w, 'console errors', errors, errors.length === 0, 'none');
  await ctx.close();
  return s;
}

/* ---------- view switching ---------- */
export async function views(env, tool, kind, {source, label = 'example'} = {}){
  const {check, note} = env.R;
  const w = where(tool, kind, env.mode);
  const phone = kind === 'phone';
  const {ctx, page} = await fresh(env, tool, kind, {source});
  const order = [...TOOLS[tool].views.filter(v => v !== TOOLS[tool].defaultView), TOOLS[tool].defaultView];
  const all = [];
  for(const v of order){
    const btn = page.locator(`#stylepicker [data-style="${v}"]`);
    await btn.scrollIntoViewIfNeeded();
    const y0 = await page.evaluate(() => scrollY);
    const s = await measure(page, () => press(page, btn, phone));
    s.view = v;
    s.scrollAfter = await page.evaluate(() => scrollY) - y0;
    s.pressed = await btn.getAttribute('aria-pressed');
    s.pressedAt = await page.evaluate(() => { const F = window.__feel; const down = [...F.inputs].reverse().find(i => i[0] === 'click'); const m = F.muts.find(m => m[0] >= down[1] && m[2] === 'attr:aria-pressed'); return m ? Math.round(m[0] - down[1]) : null; });
    all.push(s);
    note(`view.${label}.${v}`, w, 'switch to ' + v, {paint: paintOf(s), firstResponse: s.firstResponse, settled: s.settled, dropped: s.dropped, longTaskMax: s.longTaskMax, swaps: s.svgSwaps, heightJumps: s.heightJumps, scrollJumps: s.scrollJumps, empty: s.emptyFrames, anims: s.animations, active: s.active});
  }
  const worst = k => Math.max(...all.map(k));
  check(`view.${label}.paint`, w, 'view switch input -> next paint (worst view)', all.map(s => s.view + ':' + paintOf(s)).join(' '), worst(paintOf) <= BAR.paint[env.mode], '<= ' + BAR.paint[env.mode] + 'ms');
  check(`view.${label}.settle`, w, 'view switch settled (worst view)', all.map(s => s.view + ':' + s.settled).join(' '), worst(s => s.settled) <= BAR.settleView[env.mode], '<= ' + BAR.settleView[env.mode] + 'ms');
  check(`view.${label}.longtask`, w, 'longest task in a view switch', worst(s => s.longTaskMax), worst(s => s.longTaskMax) <= BAR.longTask * (env.mode === 'normal' ? 1 : 3), '<= ' + BAR.longTask * (env.mode === 'normal' ? 1 : 3) + 'ms');
  check(`view.${label}.scroll`, w, 'scroll position moved by a view switch', all.map(s => s.view + ':' + s.scrollAfter).join(' '), all.every(s => s.scrollAfter === 0), 'no scroll jump');
  check(`view.${label}.empty`, w, 'frames where the preview had no artefact mid-switch', all.flatMap(s => s.emptyFrames), all.every(s => !s.emptyFrames.length), 'never empty');
  check(`view.${label}.pressedframe`, w, 'pressed state changes in the frame of the press (ms after the click)', all.map(s => s.view + ':' + s.pressedAt).join(' '), all.every(s => s.pressedAt != null && s.pressedAt <= (env.mode === 'normal' ? 20 : 60)), '<= ' + (env.mode === 'normal' ? 20 : 60) + 'ms, before the new view needs to paint');
  check(`view.${label}.pressed`, w, 'picked view shows pressed', all.map(s => s.view + ':' + s.pressed).join(' '), all.every(s => s.pressed === 'true'), 'aria-pressed=true');
  check(`view.${label}.focus`, w, 'focus after a view switch', all.map(s => s.active).join(' '), all.every(s => /button\[style\]|button\.ctl\[style\]|\[style\]/.test(s.active) && !bad(s)), 'stays on the pressed view button');
  if(label === 'example' && env.mode === 'normal'){
    const anims = all.flatMap(motionOf);
    const ghosts = anims.filter(a => /mo-ghost/.test(a));
    check(`view.transition`, w, 'motion between views (non-colour transitions/animations)', anims.length ? anims : 'none: hard cut', ghosts.length === all.length && all.every(s => !s.layoutAnimated.length), 'every switch cross-fades (opacity only, ~140ms) and no layout property animates');
    const heightMoves = all.filter(s => s.heightJumps.length).map(s => s.view + ':' + s.heightJumps.join(','));
    note('view.heightjumps', w, 'page height changes caused by view switches', heightMoves);
  }
  /* interruption: two views within 40 ms, then the default */
  if(env.mode === 'normal'){
    const [a, b] = order;
    await page.locator(`#stylepicker [data-style="${a}"]`).click();
    await sleep(30);
    await page.locator(`#stylepicker [data-style="${b}"]`).click();
    await waitQuiet(page, {quiet: 400});
    const st = await page.evaluate(() => [...document.querySelectorAll('#stylepicker [aria-pressed="true"]')].map(b => b.dataset.style));
    const src = (await sourceText(page)).match(/^style:\s*(\S+)/m)?.[1];
    const left = await page.evaluate(() => ({ghosts: document.querySelectorAll('.mo-ghost').length, svgs: document.querySelectorAll('#preview svg').length, half: [...document.querySelectorAll('#preview svg')].filter(s => getComputedStyle(s).opacity !== '1').length}));
    check('view.rapid', w, `two view clicks 30ms apart (${a} then ${b})`, {pressed: st, source: src, ...left}, st.length === 1 && st[0] === b && src === b && !left.ghosts && left.svgs === 1 && !left.half, `ends on ${b} in picker and source, no cross-fade copy left behind, nothing half-faded`);
  }
  await ctx.close();
  return all;
}

/* ---------- source editor: rail open/close and typing ---------- */
export async function rail(env, tool, kind){
  const {check, note} = env.R;
  const w = where(tool, kind, env.mode);
  const phone = kind === 'phone';
  const {ctx, page} = await fresh(env, tool, kind);
  const opener = page.locator(TOOLS[tool].source);
  const open = await measure(page, () => press(page, opener, phone), {quiet: 400});
  note('rail.open', w, 'open the source editor', {paint: paintOf(open), settled: open.settled, swaps: open.svgSwaps, dropped: open.dropped, worstFrame: open.worstFrame, longTaskMax: open.longTaskMax, layoutAnimated: open.layoutAnimated, anims: open.animations, scroll: open.scrollJumps, active: open.active});
  if(!phone){
    check('rail.open.layoutprops', w, 'rail open animates layout properties', open.layoutAnimated.length ? open.layoutAnimated : 'none', open.layoutAnimated.length === 0, 'transform/opacity only');
    check('rail.open.rerenders', w, 'artefact re-rendered during the rail animation', open.svgSwaps, open.svgSwaps <= 1, '<= 1 re-render');
    check('rail.open.dropped', w, 'dropped frames (>20ms) during rail open', {dropped: open.dropped, worst: open.worstFrame}, open.dropped <= (env.engine === 'webkit' ? 1 : 0), env.engine === 'webkit' ? '<= 1 (the one render at the final width can take a frame in WebKit)' : '0');
  }
  check('rail.open.focus', w, 'focus after opening the editor', open.active, /cm-content/.test(open.active), 'in the source editor');
  const close = await measure(page, () => press(page, page.locator('#railtab:visible, ' + TOOLS[tool].source).first(), phone), {quiet: 400});
  note('rail.close', w, 'close the source editor', {paint: paintOf(close), settled: close.settled, swaps: close.svgSwaps, dropped: close.dropped, layoutAnimated: close.layoutAnimated, active: close.active});
  if(!phone && env.mode === 'normal'){
    check('rail.close.focus', w, 'focus after closing the editor', close.active, !bad(close), 'not lost to body');
    /* interruption: toggle twice within 60ms */
    const before = await page.locator('#workspace').getAttribute('class');
    await opener.click(); await sleep(60); await page.locator('#railtab').click();
    await waitQuiet(page, {quiet: 500});
    const after = await page.locator('#workspace').getAttribute('class');
    const railBox = await page.evaluate(() => { const r = document.querySelector('.rail').getBoundingClientRect(); return {w: Math.round(r.width), op: getComputedStyle(document.querySelector('.rail')).opacity}; });
    check('rail.rapid', w, 'open then close 60ms apart', {before, after, rail: railBox}, before === after && (railBox.w <= 1 || railBox.op === '0'), 'returns to the starting state with no half-open rail');
  }
  await ctx.close();
}

/* Keystroke -> artefact repaint, sampled one key at a time. */
export async function keyRender(env, tool, kind, {source, label = 'example'} = {}){
  const {check, note} = env.R;
  const w = where(tool, kind, env.mode);
  const {ctx, page} = await fresh(env, tool, kind, {source});
  await openSource(page, tool, kind === 'phone');
  await page.locator('.cm-content').click();
  /* type into the title line: every keystroke there visibly changes the artefact */
  const hasTitle = await page.evaluate(async () => {
    const {EditorView} = await import('/assets/vendor/codemirror.js');
    const view = EditorView.findFromDOM(document.querySelector('.cm-editor'));
    const doc = view.state.doc;
    for(let i = 1; i <= doc.lines; i++){ const l = doc.line(i); if(/^title:/i.test(l.text)){ view.dispatch({selection: {anchor: l.to}}); view.focus(); return true; } }
    return false;
  });
  if(!hasTitle){ await page.keyboard.press('ControlOrMeta+Home'); await page.keyboard.type('title: Feel', {delay: 30}); await page.keyboard.press('Enter'); await page.keyboard.press('ArrowUp'); await page.keyboard.press('End'); }
  await page.keyboard.type(' x', {delay: 30});
  await waitQuiet(page, {quiet: 500});
  const samples = [];
  for(let i = 0; i < 6; i++){
    await page.evaluate(() => {
      window.__kr = new Promise(res => {
        const pv = document.getElementById('preview');
        let t0 = 0;
        addEventListener('keydown', () => { t0 = performance.now(); }, {once: true, capture: true});
        const mo = new MutationObserver(() => { mo.disconnect(); requestAnimationFrame(() => { const c = new MessageChannel(); c.port1.onmessage = () => res(performance.now() - t0); c.port2.postMessage(0); }); });
        mo.observe(pv, {childList: true, subtree: true, characterData: true});
        setTimeout(() => { mo.disconnect(); res(-1); }, 5000);
      });
    });
    await page.keyboard.type('abcdef'[i]);
    samples.push(Math.round(await page.evaluate(() => window.__kr)));
    await waitQuiet(page, {quiet: 300});
  }
  /* sustained burst: 16 keys at 70ms, frames and long tasks while typing */
  const burst = await measure(page, () => page.keyboard.type(' quick brown fox', {delay: 70}), {quiet: 400});
  const med = [...samples].sort((a, b) => a - b)[Math.floor(samples.length / 2)];
  check(`type.${label}.render`, w, 'keystroke -> artefact repainted (median of 6)', {median: med, samples}, med >= 0 && med <= BAR.keyRender[env.mode], '<= ' + BAR.keyRender[env.mode] + 'ms');
  check(`type.${label}.burst`, w, 'typing burst: long tasks / dropped frames', {longTasks: burst.longTasks, longTaskMax: burst.longTaskMax, dropped: burst.dropped, worstFrame: burst.worstFrame, swaps: burst.svgSwaps}, burst.longTaskMax <= (env.mode === 'normal' ? 50 : 150), env.mode === 'normal' ? 'no task > 50ms' : 'no task > 150ms');
  note(`type.${label}.burst.detail`, w, 'typing burst detail', {settledAfterFirstKey: burst.settled, heightJumps: burst.heightJumps, previewHeightJumps: burst.previewHeightJumps, cls: burst.cls, scroll: burst.scrollJumps});
  await ctx.close();
}

/* ---------- edit in place ---------- */
async function openCardMenu(page, phone, nth = 0){
  const p = await pointOn(page, '#preview [data-edit="cardmenu"]', {nth, prefer: 'right'});
  if(!p) throw new Error('no card-menu point');
  return {p, s: await measure(page, () => press(page, p, phone), {quiet: 250})};
}

export async function menus(env, tool, kind){
  const {check, note} = env.R;
  const w = where(tool, kind, env.mode);
  const phone = kind === 'phone';
  const {ctx, page} = await fresh(env, tool, kind);
  const {s} = await openCardMenu(page, phone);
  const pop = await page.evaluate(() => {
    const p = document.querySelector('.eip-pop'); if(!p) return null;
    const r = p.getBoundingClientRect();
    const rows = [...p.querySelectorAll('button')].map(b => Math.round(b.getBoundingClientRect().height));
    return {inView: r.left >= 0 && r.top >= 0 && r.right <= innerWidth && r.bottom <= innerHeight, box: [r.left, r.top, r.width, r.height].map(Math.round), rows: rows.length, minRow: Math.min(...rows), active: document.activeElement?.textContent};
  });
  note('menu.open', w, 'open a card menu', {paint: paintOf(s), firstResponse: s.firstResponse, settled: s.settled, anims: s.animations, pop});
  check('menu.open.paint', w, 'card menu click -> next paint', paintOf(s), paintOf(s) <= BAR.paint[env.mode], '<= ' + BAR.paint[env.mode] + 'ms');
  check('menu.open.shown', w, 'popover visible and inside the viewport', pop, !!pop && pop.inView, 'fully on screen');
  if(env.mode === 'normal'){
    check('menu.open.focus', w, 'focus on open', pop && pop.active, !!(pop && pop.active), 'first menu row');
    if(phone) check('menu.rows.tap', w, 'menu row height on a phone', pop && pop.minRow, pop && pop.minRow >= BAR.tap, '>= 44px');
    check('menu.open.motion', w, 'menu appearance motion', motionOf(s).length ? motionOf(s) : 'none: appears instantly', motionOf(s).length > 0, 'a brief (<=150ms) opacity/scale entrance consistent with other surfaces');
    if(!phone){
      await page.keyboard.press('ArrowDown');
      const second = await page.evaluate(() => document.activeElement?.textContent);
      check('menu.arrow', w, 'ArrowDown moves to the next row', second, !!second && second !== pop?.active, 'second row focused');
    }
    const esc = await measure(page, () => page.keyboard.press('Escape'), {quiet: 200});
    const restored = await page.evaluate(() => document.activeElement?.dataset?.edit || document.activeElement?.tagName);
    check('menu.escape.focus', w, 'focus after Escape closes the card menu', restored, restored === 'cardmenu', 'back on the card that opened it');
    /* reopen and dismiss by clicking elsewhere */
    await openCardMenu(page, phone);
    await press(page, {x: 5, y: 5}, phone);
    await sleep(150);
    const gone = await page.evaluate(() => !document.querySelector('.eip-pop'));
    check('menu.away', w, 'tap outside closes the menu', gone, gone, 'closed');
  }
  await ctx.close();
}

/* Rename through the menu (phone) or the inline target (desktop), commit with Enter. */
export async function rename(env, tool, kind){
  const {check, note} = env.R;
  const w = where(tool, kind, env.mode);
  const phone = kind === 'phone';
  const {ctx, page} = await fresh(env, tool, kind);
  let openS;
  if(!phone && tool === 'roadmap'){
    const p = await pointOn(page, '#preview [data-edit="title"]');
    openS = await measure(page, () => press(page, p, false), {quiet: 200});
  }else{
    await openCardMenu(page, phone);
    const row = page.locator('.eip-pop button', {hasText: 'Rename'}).first();
    openS = await measure(page, () => press(page, row, phone), {quiet: 200});
  }
  const input = await page.evaluate(() => {
    const i = document.querySelector('.eip-input'); if(!i) return null;
    const r = i.getBoundingClientRect();
    return {font: parseFloat(getComputedStyle(i).fontSize), top: Math.round(r.top), bottom: Math.round(r.bottom), vh: innerHeight, focused: document.activeElement === i, selected: i.selectionEnd - i.selectionStart};
  });
  note('eip.open', w, 'open the rename field', {paint: paintOf(openS), settled: openS.settled, anims: openS.animations, input});
  check('eip.open.paint', w, 'rename field appears (input -> next paint)', paintOf(openS), paintOf(openS) <= BAR.paint[env.mode], '<= ' + BAR.paint[env.mode] + 'ms');
  if(env.mode === 'normal'){
    check('eip.open.focus', w, 'rename field focused with text selected', input, !!input && input.focused && input.selected > 0, 'focused, text selected');
    if(phone){
      check('eip.input.font', w, 'rename field font size on a phone (iOS zoom floor)', input && input.font, input && input.font >= BAR.inputFont, '>= 16px');
      check('eip.input.keyboard', w, 'rename field position vs. on-screen keyboard (keyboard ~ bottom 45% of 812px)', input, input && input.bottom <= input.vh * 0.55, 'field in top 55% of the viewport (not under the keyboard)');
    }
  }
  await page.keyboard.press('ControlOrMeta+A');
  await page.keyboard.type('Feel renamed');
  const commit = await measure(page, async () => {
    await page.keyboard.press('Enter');
    await page.waitForFunction(() => document.querySelector('#preview svg')?.textContent.includes('Feel renamed'), null, {timeout: 4000}).catch(() => {});
  }, {quiet: 400});
  const applied = await page.evaluate(() => {
    const F = window.__feel; const enter = [...F.inputs].reverse().find(i => i[0] === 'keydown');
    const m = F.muts.find(m => m[0] > enter[1] && m[2] === 'childList' && m[1].startsWith('div#preview'));
    return m ? Math.round(m[0] - enter[1]) : null;
  });
  note('eip.commit', w, 'commit rename with Enter', {applied, settled: commit.settled, swaps: commit.svgSwaps, anims: commit.animations, focusLostFrames: commit.focusLostFrames, active: commit.active, scroll: commit.scrollJumps});
  check('eip.commit.applied', w, 'Enter -> renamed text on the artefact', applied, applied != null && applied <= BAR.commit[env.mode], '<= ' + BAR.commit[env.mode] + 'ms (a discrete edit skips the typing debounce)');
  if(env.mode === 'normal'){
    check('eip.commit.focus', w, 'focus after commit', commit.active, !bad(commit), 'on the edited item (not body)');
    check('eip.commit.scroll', w, 'scroll jump on commit', commit.scrollJumps, !commit.scrollJumps.length, 'none');
    /* cancel path */
    if(!phone && tool === 'roadmap'){
      const p = await pointOn(page, '#preview [data-edit="title"]', {nth: 1});
      await press(page, p, false);
    }else{
      await openCardMenu(page, phone, 1);
      await press(page, page.locator('.eip-pop button', {hasText: 'Rename'}).first(), phone);
    }
    await page.keyboard.type('zzz');
    await page.keyboard.press('Escape');
    await sleep(120);
    const after = await page.evaluate(() => ({active: window.__feel.describe(document.activeElement), edit: document.activeElement?.dataset?.edit || null, open: !!document.querySelector('.eip-input')}));
    check('eip.cancel.focus', w, 'focus after Escape cancels a rename', after, !after.open && after.active !== 'body', 'back on the target that opened it');
    const unchanged = !(await sourceText(page)).includes('zzz');
    check('eip.cancel.discard', w, 'Escape discards typed text', unchanged, unchanged, 'source unchanged');
  }
  await ctx.close();
}

/* Validation: a bad value keeps the field open, marks it invalid and shakes it. */
export async function validation(env, tool, kind){
  const {check} = env.R;
  const w = where(tool, kind, env.mode);
  const phone = kind === 'phone';
  const {ctx, page} = await fresh(env, tool, kind);
  await openCardMenu(page, phone);
  const rowName = tool === 'timeline' ? 'Dates' : 'Rename';
  await press(page, page.locator('.eip-pop button', {hasText: rowName}).first(), phone);
  await page.keyboard.press('ControlOrMeta+A');
  await page.keyboard.type(tool === 'timeline' ? 'not a date' : '   ');
  const s = await measure(page, () => page.keyboard.press('Enter'), {quiet: 400});
  const st = await page.evaluate(() => { const i = document.querySelector('.eip-input'); return i ? {open: true, invalid: i.getAttribute('aria-invalid'), cls: i.className, err: document.getElementById(i.getAttribute('aria-describedby'))?.textContent, visibleMsg: [...document.querySelectorAll('.eip-err')].some(e => { const r = e.getBoundingClientRect(); return e.textContent.trim().length > 0 && r.width > 8 && r.height > 8 && r.left >= 0 && r.right <= innerWidth && r.top >= 0 && r.bottom <= innerHeight; })} : {open: false}; });
  check('eip.invalid.state', w, 'invalid value on Enter', {...st, anims: s.animations}, st.open && st.invalid === 'true', 'field stays open, aria-invalid, shake');
  check('eip.invalid.visible', w, 'a visible explanation of what is wrong', st, !!st.visibleMsg, 'visible message beside the field (not only a red border + sr-only text)');
  await page.keyboard.press('Escape');
  await ctx.close();
}

/* Status change through the menu: commit + where focus lands. */
export async function menuCommit(env, tool, kind){
  const {check, note} = env.R;
  const w = where(tool, kind, env.mode);
  const phone = kind === 'phone';
  const {ctx, page} = await fresh(env, tool, kind);
  await openCardMenu(page, phone);
  await press(page, page.locator('.eip-pop button', {hasText: 'Status'}).first(), phone);
  const sub = page.locator('.eip-pop button', {hasText: tool === 'timeline' ? 'risk' : 'blocked'}).first();
  const s = await measure(page, () => press(page, sub, phone), {quiet: 400});
  note('menu.commit', w, 'pick a status from the card menu', {settled: s.settled, swaps: s.svgSwaps, anims: s.animations, active: s.active, focusLostFrames: s.focusLostFrames});
  check('menu.commit.settle', w, 'status pick -> artefact settled', s.settled, s.settled <= BAR.pick[env.mode], '<= ' + BAR.pick[env.mode] + 'ms');
  if(env.mode === 'normal') check('menu.commit.focus', w, 'focus after a menu commit', s.active, !bad(s), 'on the changed item (not body)');
  await ctx.close();
}

/* Add an item from the artefact; remove one from the menu. */
export async function addRemove(env, tool, kind){
  const {check, note} = env.R;
  const w = where(tool, kind, env.mode);
  const phone = kind === 'phone';
  const {ctx, page} = await fresh(env, tool, kind);
  const p = await pointOn(page, '#preview [data-edit="additem"]');
  const open = await measure(page, () => press(page, p, phone), {quiet: 200});
  const field = await page.evaluate(() => !!document.querySelector('.eip-input'));
  await page.keyboard.type('Feel added');
  /* watch the new item's own first frames: does IT animate in, or just appear? */
  await page.evaluate(() => {
    window.__entrance = new Promise(res => {
      const pv = document.getElementById('preview');
      const mo = new MutationObserver(() => {
        const t = [...pv.querySelectorAll('text')].find(x => x.textContent.includes('Feel added'));
        if(!t) return;
        mo.disconnect();
        const g = t.closest('g[data-line],g[data-field-item],g') || t;
        requestAnimationFrame(() => {
          /* the card-dim hover transition (120-150 ms) is not an entrance */
          const anims = [g, ...g.querySelectorAll('*')].flatMap(e => e.getAnimations())
            .filter(a => !(a.transitionProperty === 'opacity' && [120, 150].includes(a.effect.getTiming().duration))).length;
          res({anims, opacity: getComputedStyle(g).opacity, transform: getComputedStyle(g).transform});
        });
      });
      mo.observe(pv, {childList: true, subtree: true});
      setTimeout(() => res(null), 4000);
    });
  });
  const s = await measure(page, async () => {
    await page.keyboard.press('Enter');
    await page.waitForFunction(() => document.querySelector('#preview svg')?.textContent.includes('Feel added'), null, {timeout: 4000}).catch(() => {});
  }, {quiet: 600});
  note('add', w, 'add an item from the artefact', {openPaint: paintOf(open), field, settled: s.settled, swaps: s.svgSwaps, anims: s.animations, active: s.active, scroll: s.scrollJumps});
  const appeared = await page.evaluate(() => document.querySelector('#preview svg')?.textContent.includes('Feel added'));
  check('add.applied', w, 'added item appears', {appeared, settled: s.settled}, appeared && s.settled <= BAR.settleEdit[env.mode] + 200, 'appears within ' + (BAR.settleEdit[env.mode] + 200) + 'ms');
  if(env.mode === 'normal'){
    const addedLine = await page.evaluate(() => [...document.querySelectorAll('#preview [data-edit="cardmenu"]')].find(g => (g.getAttribute('aria-label') || g.textContent).includes('Feel added'))?.dataset.line);
    const onNew = await page.evaluate(() => document.activeElement?.closest?.('[data-line]')?.dataset.line);
    check('add.focus', w, 'focus after adding', {active: s.active, addedLine, focusLine: onNew}, !bad(s) && addedLine != null && onNew === addedLine, 'on the new item');
    const ent = await page.evaluate(() => window.__entrance);
    check('add.motion', w, 'new item entrance (animations on the new item itself)', {newItem: ent, elsewhere: motionOf(s)}, !!ent && ent.anims > 0, 'the new item fades/slides in so the eye finds it');
    /* remove it */
    const idx = await page.evaluate(() => [...document.querySelectorAll('#preview [data-edit="cardmenu"]')].findIndex(g => (g.getAttribute('aria-label') || g.textContent).includes('Feel added')));
    if(idx >= 0){
      await openCardMenu(page, phone, idx);
      const row = page.locator('.eip-pop button', {hasText: /^Remove/}).first();
      const r = await measure(page, async () => { await press(page, row, phone); if(phone || tool === 'roadmap'){ const c = page.locator('.eip-pop button.danger'); if(await c.count()) await press(page, c.first(), phone); } }, {quiet: 500});
      const gone = await page.evaluate(() => !document.querySelector('#preview svg')?.textContent.includes('Feel added'));
      note('remove', w, 'remove from the card menu', {gone, settled: r.settled, anims: r.animations, active: r.active});
      const landed = await page.evaluate(() => { const a = document.activeElement; return {edit: a?.dataset?.edit || null, visible: !!a && a.getClientRects().length > 0, count: document.querySelectorAll('#preview [data-edit="cardmenu"]').length}; });
      check('remove.focus', w, 'focus after removing an item', {active: r.active, ...landed}, gone && !bad(r) && (landed.edit === 'cardmenu' || landed.edit === 'additem') && landed.visible, 'on a neighbouring item (next, else previous) or the add control');
    }
  }
  await ctx.close();
}

/* ---------- roadmap drag ---------- */
export async function drag(env){
  const {check, note} = env.R;
  const w = where('roadmap', 'desktop', env.mode);
  const {ctx, page} = await fresh(env, 'roadmap', 'desktop');
  await page.locator('#stylepicker [data-style="grid"]').click();
  await waitQuiet(page, {quiet: 400});
  const from = await pointOn(page, '#preview g[data-line]', {nth: 0, resolve: 'g[data-line]'});
  const cells = await page.evaluate(() => [...document.querySelectorAll('#preview rect[data-cell]')].map(r => { const b = r.getBoundingClientRect(); return {c: r.dataset.cell, x: b.x + b.width / 2, y: b.y + b.height - 6, w: b.width}; }));
  const target = cells.find(c => c.c.startsWith('2|')) || cells.at(-1);
  const before = await sourceText(page);
  const dragged = await page.evaluate(() => { const g = document.querySelector('#preview g[data-line]'); const r = g.getBoundingClientRect(); return {key: g.dataset.key, x: r.left, y: r.top}; });
  /* arm a watcher just before release: time from pointerup until the artefact's svg is replaced */
  const s = await measure(page, async () => {
    await page.mouse.move(from.x, from.y); await page.mouse.down(); await sleep(30);
    for(let i = 1; i <= 24; i++){ await page.mouse.move(from.x + (target.x - from.x) * i / 24, from.y + (target.y - from.y) * i / 24); await sleep(16); }
    await page.evaluate(key => {
      window.__dropFrames = [];
      addEventListener('pointerup', e => {
        const t0 = performance.now(), release = {x: e.clientX, y: e.clientY};
        const tick = () => {
          const els = [...document.querySelectorAll('#preview g[data-key]')].filter(g => g.dataset.key === key);
          const vis = els.filter(g => { let o = 1; for(let n = g; n && n.id !== 'preview'; n = n.parentElement) o *= parseFloat(getComputedStyle(n).opacity); return o > 0.05; });
          const r = vis[0] && vis[0].getBoundingClientRect();
          window.__dropFrames.push({t: Math.round(performance.now() - t0), x: r ? Math.round(r.left) : null, y: r ? Math.round(r.top) : null, release});
          if(performance.now() - t0 < 500) requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      }, {once: true});
    }, dragged.key);
    await page.evaluate(() => {
      const old = document.querySelector('#preview svg');
      window.__dropGap = new Promise(res => {
        let t0 = 0;
        addEventListener('pointerup', () => { t0 = performance.now(); const tick = () => { if(document.querySelector('#preview svg') !== old) res(Math.round(performance.now() - t0)); else if(performance.now() - t0 > 3000) res(null); else requestAnimationFrame(tick); }; requestAnimationFrame(tick); }, {once: true, capture: true});
      });
    });
    await page.mouse.up();
  }, {quiet: 600});
  const after = await sourceText(page);
  /* gap between releasing the card and the artefact showing the move: during it the
     dimmed card is restored in its OLD slot (the drop looks undone, then jumps) */
  const gap = await page.evaluate(() => window.__dropGap);
  check('drag.dropgap', w, 'pointer release -> moved card shown (old slot restored meanwhile)', gap, gap != null && gap <= 50, '<= 50ms (one or two frames)');
  const frames = (await page.evaluate(() => window.__dropFrames || [])).filter(f => f.x != null);
  const near = (f, x, y, d) => Math.abs(f.x - x) <= d && Math.abs(f.y - y) <= d;
  const last = frames.at(-1);
  const backInOldSlot = last && near(last, dragged.x, dragged.y, 8);
  const bad = backInOldSlot ? [] : frames.filter(f => near(f, dragged.x, dragged.y, 8));
  const first = frames[0];
  const firstOk = !first || near(first, first.release.x, first.release.y, 40) || near(first, last.x, last.y, 8);
  check('drag.dropframes', w, 'the dragged card is never drawn in its old slot after release; its first frame is at the release point or already home', {frames: frames.length, inOldSlot: bad.map(f => f.t + 'ms'), first: first && {x: first.x, y: first.y, release: first.release}, final: last && {x: last.x, y: last.y}, old: dragged}, frames.length > 3 && bad.length === 0 && firstOk, 'no frame within 8px of the pre-drag slot; first frame within 40px of the release point or in the new slot');
  const sel = await page.evaluate(() => getSelection().toString());
  const leftovers = await page.evaluate(() => ({ghost: document.querySelectorAll('.dragghost').length, line: document.querySelectorAll('.dropline').length, cursor: document.body.style.cursor}));
  note('drag', w, 'drag a card to another column', {moved: before !== after, dropped: s.dropped, worstFrame: s.worstFrame, longTasks: s.longTasks, longTaskMax: s.longTaskMax, settled: s.settled, anims: s.animations, leftovers});
  check('drag.frames', w, 'dropped frames during the drag gesture', {dropped: s.dropped, worst: s.worstFrame, frames: s.frames}, s.dropped <= 1, '<= 1 frame over 20ms');
  check('drag.moved', w, 'drop rewrites the source', before !== after, before !== after, 'moved');
  check('drag.clean', w, 'nothing left behind after the drop', {...leftovers, selection: sel}, !leftovers.ghost && !leftovers.line && !leftovers.cursor && !sel, 'no ghost/dropline/cursor/selection');
  check('drag.glide', w, 'cards glide to new homes after the drop', s.animations.filter(a => /transform/.test(a)), s.animations.some(a => /transform/.test(a)), 'FLIP transform transition runs');
  /* escape mid-drag */
  if(env.mode === 'normal'){
    const f2 = await pointOn(page, '#preview g[data-line]', {nth: 1, resolve: 'g[data-line]'});
    await page.mouse.move(f2.x, f2.y); await page.mouse.down();
    for(let i = 1; i <= 8; i++){ await page.mouse.move(f2.x + i * 15, f2.y + i * 4); await sleep(16); }
    await page.keyboard.press('Escape');
    await page.mouse.up();
    await sleep(200);
    const l2 = await page.evaluate(() => ({ghost: document.querySelectorAll('.dragghost').length, srcOpacity: [...document.querySelectorAll('#preview g[data-line]')].filter(g => g.style.opacity).length}));
    const t2 = await sourceText(page);
    check('drag.escape', w, 'Escape mid-drag cancels cleanly', {...l2, changed: t2 !== after}, !l2.ghost && !l2.srcOpacity && t2 === after, 'ghost gone, card restored, source unchanged');
    await shot(page, env.out + '/shots/drag-after-' + env.mode + '.png');
  }
  await ctx.close();
}

/* ---------- roadmap what-if ---------- */
export async function whatif(env){
  const {check, note} = env.R;
  const w = where('roadmap', 'desktop', env.mode);
  const {ctx, page} = await fresh(env, 'roadmap', 'desktop');
  const p = await pointOn(page, '#preview [data-whatif]', {resolve: '[data-whatif]'});
  await sleep(300);
  const s = await measure(page, () => page.mouse.click(p.x, p.y), {quiet: 400});
  const chip1 = await page.locator('#whatifchip').evaluate(c => c.hidden ? '' : c.textContent);
  note('whatif', w, 'flip a bet world', {paint: paintOf(s), inputs: s.inputs, mutations: s.mutations, settled: s.settled, anims: s.animations, active: s.active, heightJumps: s.heightJumps, scroll: s.scrollJumps, chip: chip1});
  check('whatif.applied', w, 'one click on the capsule previews the "pays off" world', chip1, /pays off/.test(chip1) && !/doesn't/.test(chip1), 'chip names the world');
  check('whatif.motion', w, 'world flip cross-fade (the view cross-fade, every time)', motionOf(s).length ? motionOf(s) : s.animations, s.animations.some(a => /mo-ghost/.test(a)), 'the old picture fades out over the new one');
  check('whatif.paint', w, 'world flip input -> next paint', paintOf(s), paintOf(s) <= BAR.paint[env.mode], '<= ' + BAR.paint[env.mode] + 'ms');
  check('whatif.shift', w, 'page height / scroll moved by a world flip (chip appears above content)', {heightJumps: s.heightJumps, scroll: s.scrollJumps}, !s.scrollJumps.length, 'no scroll jump');
  if(env.mode === 'normal'){
    const p2 = await pointOn(page, '#preview [data-whatif]', {resolve: '[data-whatif]'});
    /* two clicks 60ms apart (faster than the 150ms fade): ends one step further on, nothing half-faded */
    await page.mouse.click(p2.x, p2.y); await sleep(60); await page.mouse.click(p2.x, p2.y);
    await waitQuiet(page, {quiet: 500});
    const st = await page.evaluate(() => ({chip: document.getElementById('whatifchip').hidden ? '' : document.getElementById('whatifchip').textContent,
      half: [...document.querySelectorAll('#preview g[data-line]')].filter(g => { const o = parseFloat(getComputedStyle(g).opacity); return o > 0.05 && o < 0.95 && !g.matches(':hover'); }).length}));
    check('whatif.rapid', w, 'click the capsule twice more 60ms apart (pays off -> none? -> ...)', st, st.half === 0 && st.chip === '', 'three cycles end on "no preview", no card left part-faded');
    /* keyboard: focus stays on the capsule after Enter */
    await page.locator('#preview [data-whatif]').first().focus();
    await page.keyboard.press('Enter'); await waitQuiet(page, {quiet: 300});
    const act = await page.evaluate(() => window.__feel.describe(document.activeElement));
    check('whatif.keyboard.focus', w, 'focus after Enter on the capsule', act, /whatif/.test(act), 'stays on the capsule');
  }
  await ctx.close();
}

/* ---------- inspector (timeline) and item review (roadmap) ---------- */
export async function inspector(env, kind){
  const {check, note} = env.R;
  const w = where('timeline', kind, env.mode);
  const phone = kind === 'phone';
  const {ctx, page} = await fresh(env, 'timeline', kind);
  const p = await pointOn(page, '#preview [data-inspect]', {resolve: '[data-inspect],[data-edit]', prefer: 'left'});
  await sleep(250);   // pointOn scrolls the row into view: let that scroll finish so it is not read as the inspector's
  const s = await measure(page, () => press(page, p, phone), {quiet: 400});
  const box = await page.evaluate(() => { const r = document.getElementById('inspector').getBoundingClientRect(); return {hidden: document.getElementById('inspector').hidden, top: Math.round(r.top), h: Math.round(r.height), inView: r.top < innerHeight && r.bottom > 0}; });
  note('inspect.open', w, 'select a milestone', {paint: paintOf(s), settled: s.settled, swaps: s.svgSwaps, anims: s.animations, heightJumps: s.heightJumps, scroll: s.scrollJumps, active: s.active, box});
  check('inspect.open.paint', w, 'select milestone -> next paint', paintOf(s), paintOf(s) <= BAR.paint[env.mode], '<= ' + BAR.paint[env.mode] + 'ms');
  check('inspect.open.rerenders', w, 'artefact re-renders when the inspector opens', s.svgSwaps, s.svgSwaps <= 1, '<= 1');
  check('inspect.open.visible', w, 'inspector visible after selecting', box, !box.hidden && box.inView, 'in view');
  check('inspect.open.stable', w, 'page scroll and height when the inspector opens', {scroll: s.scrollJumps, heightJumps: s.heightJumps}, s.scrollJumps.length === 0 && s.heightJumps.every(h => Math.abs(parseInt(h.split(':')[1])) <= 24), 'no scroll, page height within a few px');
  check('inspect.open.focus', w, 'focus moves into the inspector', s.active, /inspect/.test(s.active), 'on the inspector (its Close button)');
  if(env.mode === 'normal'){
    const esc = await measure(page, () => page.keyboard.press('Escape'), {quiet: 400});
    check('inspect.escape.focus', w, 'focus after Escape closes the inspector', esc.active, /inspect/.test(esc.active), 'the row that opened it');
    note('inspect.close', w, 'close inspector', {settled: esc.settled, swaps: esc.svgSwaps, heightJumps: esc.heightJumps, scroll: esc.scrollJumps});
  }
  await shot(page, `${env.out}/shots/timeline-inspector-${kind}-${env.mode}.png`);
  await ctx.close();
}

export async function review(env, kind){
  const {check, note} = env.R;
  const w = where('roadmap', kind, env.mode);
  const phone = kind === 'phone';
  const {ctx, page} = await fresh(env, 'roadmap', kind);
  await openCardMenu(page, phone);
  const row = page.locator('.eip-pop button', {hasText: /Review|Inspect|Details/}).first();
  if(!(await row.count())){ note('review.missing', w, 'no review row in the card menu', await page.locator('.eip-pop button').allTextContents()); await ctx.close(); return; }
  const s = await measure(page, () => press(page, row, phone), {quiet: 400});
  const r = await page.evaluate(() => { const b = document.getElementById('roadmapreceipt').getBoundingClientRect(); return {top: Math.round(b.top), h: Math.round(b.height), inView: b.top < innerHeight && b.bottom > 0}; });
  note('review.open', w, 'open item review', {settled: s.settled, swaps: s.svgSwaps, anims: s.animations, heightJumps: s.heightJumps, scroll: s.scrollJumps, active: s.active, receipt: r});
  check('review.open.visible', w, 'item review visible after opening', r, r.inView, 'in view');
  check('review.open.rerenders', w, 'artefact re-renders when item review opens', s.svgSwaps, s.svgSwaps <= 1, '<= 1');
  await shot(page, `${env.out}/shots/roadmap-review-${kind}-${env.mode}.png`);
  await ctx.close();
}

/* ---------- shell: File, Share, Export, History, copy, deck, examples ---------- */
export async function shell(env, tool, kind){
  const {check, note} = env.R;
  const w = where(tool, kind, env.mode);
  const phone = kind === 'phone';
  const {ctx, page} = await fresh(env, tool, kind);
  /* File menu */
  const file = page.locator('[data-shell-file] > summary');
  const fo = await measure(page, () => press(page, file, phone), {quiet: 200});
  note('file.open', w, 'open File', {paint: paintOf(fo), anims: fo.animations, active: fo.active});
  await page.keyboard.press('Escape');
  await sleep(100);
  const closedByEsc = await page.locator('[data-shell-file]').evaluate(d => !d.open);
  check('file.escape', w, 'Escape closes the File menu', closedByEsc, closedByEsc, 'closed');
  if(!closedByEsc) await press(page, file, phone);
  /* Examples switch */
  await press(page, file, phone);
  await press(page, page.locator('[data-act="examples"]'), phone);
  const ex = page.locator('[data-shell-examples-list] button, [data-shell-examples-list] a').nth(1);
  if(await ex.count()){
    const y0 = await page.evaluate(() => scrollY);
    const s = await measure(page, () => press(page, ex, phone), {quiet: 500, max: 8000});
    note('example.switch', w, 'switch to another example', {paint: paintOf(s), settled: s.settled, swaps: s.svgSwaps, anims: s.animations, heightJumps: s.heightJumps, scroll: s.scrollJumps, menuOpen: await page.locator('[data-shell-file]').evaluate(d => d.open), active: s.active});
    check('example.switch.settle', w, 'example switch settled', s.settled, s.settled <= BAR.settleView[env.mode] * 2, '<= ' + BAR.settleView[env.mode] * 2 + 'ms');
    if(env.mode === 'normal') check('example.switch.focus', w, 'focus after choosing an example', s.active, !bad(s), 'not lost to body');
  }else note('example.switch', w, 'no example list button found', null);
  await waitQuiet(page);
  if(await page.locator('[data-shell-file]').evaluate(d => d.open)) await press(page, file, phone);
  /* Share */
  const share = page.locator('[data-act="share"]');
  /* the acknowledgement is the status line filling in, which arrives a little after the click (the link is encoded first):
     watch for it directly rather than for whatever the page happens to mutate */
  await page.evaluate(() => { window.__shareAck = new Promise(res => { const el = document.querySelector('.tool-status'), t0 = performance.now();
    new MutationObserver((m, mo) => { if(el.textContent){ mo.disconnect(); res(Math.round(performance.now() - t0)); } }).observe(el, {childList: true, characterData: true, subtree: true});
    setTimeout(() => res(null), 3000); }); });
  const sh = await measure(page, () => press(page, share, phone), {quiet: 300});
  sh.firstResponse = await page.evaluate(() => window.__shareAck);
  const shareState = await page.evaluate(() => ({status: document.querySelector('.tool-status')?.textContent, label: document.querySelector('[data-act="share"]')?.textContent, dialog: !!document.querySelector('dialog[open]')}));
  note('share', w, 'press Share', {firstResponse: sh.firstResponse, settled: sh.settled, state: shareState, active: sh.active});
  const shareBar = BAR.feedback * (env.mode === 'normal' ? 1 : 4);
  check('share.feedback', w, 'Share acknowledged (the status line says the link is copied)', sh.firstResponse, sh.firstResponse != null && sh.firstResponse <= shareBar, '<= ' + shareBar + 'ms');
  check('share.focus', w, 'focus stays on Share after pressing it', sh.active, /tool-share/.test(sh.active), 'Share keeps focus');
  await page.keyboard.press('Escape');
  await sleep(200);
  if(env.mode !== 'normal'){ await ctx.close(); return; }
  /* Export deck dialog */
  const deck = page.locator('#exportdeck');
  const d = await measure(page, () => press(page, deck, phone), {quiet: 300});
  const dlg = await page.evaluate(() => { const g = document.getElementById('slidepreviewdialog'); return {open: g.open, active: document.activeElement?.id || document.activeElement?.tagName}; });
  note('deck.open', w, 'open Export deck', {paint: paintOf(d), settled: d.settled, longTaskMax: d.longTaskMax, anims: d.animations, dlg});
  check('deck.open.paint', w, 'Export deck click -> next paint', {paint: paintOf(d), longTaskMax: d.longTaskMax}, paintOf(d) <= BAR.paint.normal, '<= 100ms');
  await shot(page, `${env.out}/shots/${tool}-deck-${kind}.png`);
  const next = page.locator('#slidenext');
  if(await next.isVisible() && await next.isEnabled()){
    const n = await measure(page, () => press(page, next, phone), {quiet: 200});
    note('deck.next', w, 'next slide', {paint: paintOf(n), settled: n.settled, anims: n.animations});
  }
  await page.keyboard.press('Escape');
  await sleep(150);
  const back = await page.evaluate(() => document.activeElement?.id);
  check('deck.escape.focus', w, 'focus after Escape closes the deck dialog', back, back === 'exportdeck', '#exportdeck');
  /* Copy PNG twice */
  if(!phone){
    const copy = page.locator('#copypng');
    const orig = (await copy.textContent()).trim();
    await copy.click();
    await page.waitForFunction(o => document.getElementById('copypng').textContent.trim() !== o, orig, {timeout: 4000}).catch(() => {});
    const t1 = Date.now();
    const flashed = (await copy.textContent()).trim();
    await copy.click();
    await sleep(4600);
    const finalLabel = (await copy.textContent()).trim();
    check('copy.png.double', w, `Copy PNG pressed again while it says "${flashed}" (+${Date.now() - t1 - 4600}ms)`, {orig, flashed, after5s: finalLabel}, finalLabel === orig, 'label returns to "' + orig + '"');
    /* Copy as Markdown */
    await page.locator('.action-disclosure:not(.history):not(#appearance):not(.appearance) > summary').last().click();
    const md = page.locator('#copymd');
    const mdOrig = (await md.textContent()).trim();
    const ms = await measure(page, () => md.click(), {quiet: 200});
    const mdFlash = (await md.textContent()).trim();
    await md.click();
    await sleep(3200);
    const mdFinal = (await md.textContent()).trim();
    note('copy.md', w, 'Copy as Markdown', {firstResponse: ms.firstResponse, flash: mdFlash});
    check('copy.md.label', w, 'Copy as Markdown label after the confirmation clears (pressed twice)', {before: mdOrig, flash: mdFlash, after3s: mdFinal}, mdFinal === mdOrig, 'returns to "' + mdOrig + '"');
    const menuOpen = await page.locator('#copymd').isVisible();
    note('copy.md.menu', w, 'Export menu still open after copying', menuOpen);
  }
  /* History: snapshot + compare */
  await press(page, page.locator('details.history > summary'), phone);
  const snap = await measure(page, () => press(page, page.locator('#snap'), phone), {quiet: 300});
  const snapState = await page.evaluate(() => ({options: document.getElementById('snapsel').options.length, label: document.getElementById('snap').textContent, status: document.querySelector('.tool-status')?.textContent}));
  note('snapshot', w, 'take a snapshot', {firstResponse: snap.firstResponse, settled: snap.settled, snapState});
  check('snapshot.feedback', w, 'snapshot acknowledged within 100ms', {firstResponse: snap.firstResponse, snapState}, snap.firstResponse != null && snap.firstResponse <= BAR.feedback, 'visible confirmation');
  await ctx.close();
}

/* ---------- theme ---------- */
export async function theme(env, tool, kind, reduced = false){
  const {check, note} = env.R;
  const w = where(tool, kind, env.mode) + (reduced ? '/reduced' : '');
  const {ctx, page} = await fresh(env, tool, kind, reduced ? {reducedMotion: 'reduce'} : {});
  const s = await measure(page, () => press(page, page.locator('.mg-appearance'), kind === 'phone'), {quiet: 500});
  note('theme', w, 'toggle light/dark', {paint: paintOf(s), settled: s.settled, swaps: s.svgSwaps, dropped: s.dropped, worstFrame: s.worstFrame, longTaskMax: s.longTaskMax, anims: s.animations, empty: s.emptyFrames, scroll: s.scrollJumps});
  if(!reduced){
    check('theme.longtask', w, 'longest task in a theme toggle', s.longTaskMax, s.longTaskMax <= BAR.longTask * (env.mode === 'normal' ? 2 : 6), '<= ' + BAR.longTask * (env.mode === 'normal' ? 2 : 6) + 'ms');
    check('theme.dropped', w, 'dropped frames in the theme transition', {dropped: s.dropped, worst: s.worstFrame}, s.dropped <= (env.engine === 'webkit' ? 2 : env.mode === 'normal' ? 1 : 3), '<= ' + (env.engine === 'webkit' ? 2 : env.mode === 'normal' ? 1 : 3));
  }else{
    const motion = s.animations.filter(a => !/^\d+x (color|background|border|fill)/.test(a) && !/ 0s\|/.test(a));
    check('reduced.theme', w, 'motion under prefers-reduced-motion on theme toggle', motion.length ? motion : 'none', motion.length === 0, 'none');
  }
  await ctx.close();
}

/* reduced motion across view switch, rail, edit */
export async function reduced(env, tool){
  const {check} = env.R;
  const w = where(tool, 'desktop', env.mode) + '/reduced';
  const {ctx, page} = await fresh(env, tool, 'desktop', {reducedMotion: 'reduce'});
  const found = [];
  const record = s => found.push(...s.animations.filter(a => !/ 0s\|/.test(a) && !/^\d+x (color|background-color|border-color)/.test(a)));
  record(await measure(page, () => page.locator('#stylepicker [data-style]').first().click()));
  record(await measure(page, () => page.locator(TOOLS[tool].source).click(), {quiet: 400}));
  record(await measure(page, () => page.locator('#railtab').click(), {quiet: 400}));
  check('reduced.motion', w, 'non-colour motion under prefers-reduced-motion (view switch, rail open/close)', found.length ? [...new Set(found)] : 'none', found.length === 0, 'none');
  await ctx.close();
}

/* ---------- keyboard: focus visibility and tab order ---------- */
export async function keyboard(env, tool){
  const {check, note} = env.R;
  const w = where(tool, 'desktop', env.mode);
  const {ctx, page} = await fresh(env, tool, 'desktop');
  await page.locator('#stylepicker [data-style]').first().focus();
  const stops = [];
  for(let i = 0; i < 70; i++){
    await page.keyboard.press('Tab');
    stops.push(await page.evaluate(() => {
      const el = document.activeElement; if(!el || el === document.body) return {body: true};
      const cs = getComputedStyle(el); const r = el.getBoundingClientRect();
      /* a 1px anchor has no ring of its own to see: the visible stand-in is the row it edits (data-kbd-ring) */
      const stand = r.width < 4 || r.height < 4 ? document.querySelector('[data-kbd-ring]') : null;
      const sc = stand ? getComputedStyle(stand) : cs, sr = stand ? stand.getBoundingClientRect() : r;
      const ring = (sc.outlineStyle !== 'none' && parseFloat(sc.outlineWidth) > 0) || (sc.boxShadow && sc.boxShadow !== 'none');
      return {d: window.__feel.describe(el), name: (el.getAttribute('aria-label') || el.textContent || '').trim().slice(0, 30), ring, outline: sc.outlineStyle + ' ' + sc.outlineWidth, w: Math.round(sr.width), h: Math.round(sr.height), anchor: !!stand, inPreview: !!el.closest('#preview')};
    }));
  }
  const tiny = stops.filter(s => !s.body && (s.w < 4 || s.h < 4));
  const noRing = stops.filter(s => !s.body && !s.ring);
  const previewStops = stops.filter(s => s.inPreview).length;
  note('keyboard.stops', w, 'first 70 Tab stops from the view picker', stops.map(s => s.body ? 'BODY' : `${s.d}${s.ring ? '' : '(no ring)'}${s.w < 4 || s.h < 4 ? '(' + s.w + 'x' + s.h + ')' : ''}`));
  check('keyboard.tiny', w, 'Tab stops with no visible box or stand-in ring in the first 70', tiny.length, tiny.length === 0, '0');
  const anchors = stops.filter(s => s.anchor).length;
  note('keyboard.anchors', w, '1px anchor stops that show their ring on the row they edit', {anchors, perMilestone: 9});
  check('keyboard.ring', w, 'Tab stops with no visible focus indicator (outline/box-shadow)', {count: noRing.length, examples: [...new Set(noRing.map(s => s.d.replace(/\[.*$/, '')))].slice(0, 8)}, noRing.length === 0, '0');
  check('keyboard.body', w, 'focus fell to body while tabbing', stops.filter(s => s.body).length, !stops.some(s => s.body), 'never');
  await ctx.close();
}

/* ---------- hover and press feedback ---------- */
export async function hover(env, tool){
  const {check} = env.R;
  const w = where(tool, 'desktop', env.mode);
  const {ctx, page} = await fresh(env, tool, 'desktop');
  const targets = ['#stylepicker [data-style]:not([aria-pressed="true"])', '[data-shell-file] > summary', '[data-act="share"]', '#exportdeck', '#copypng',
    '.action-disclosure > summary', '#zoomctl button:not(.on)', TOOLS[tool].source, '#preview [data-edit="cardmenu"]', '#preview [data-edit="additem"]', tool === 'timeline' ? '#preview [data-inspect]' : '#preview [data-edit="title"]', '.mg-appearance'];
  const silent = [], seen = [];
  for(const sel of targets){
    const loc = page.locator(sel).first();
    if(!(await loc.count()) || !(await loc.isVisible())) continue;
    await loc.scrollIntoViewIfNeeded(); await sleep(100);
    await page.mouse.move(2, 2); await sleep(220);
    const snap = () => loc.evaluate(el => { const c = getComputedStyle(el); const k = el.querySelector('rect,text') ; const ck = k ? getComputedStyle(k) : null; return [c.backgroundColor, c.color, c.textDecorationLine, c.opacity, c.borderColor, c.outlineStyle, ck && ck.fill, ck && ck.opacity, ck && ck.textDecorationLine, ck && ck.stroke].join('|'); });
    const a = await snap();
    const box = await loc.boundingBox();
    await page.mouse.move(box.x + box.width / 2, box.y + Math.min(box.height / 2, 20)); await sleep(220);
    const b = await snap();
    const cursor = await loc.evaluate(el => getComputedStyle(el).cursor);
    seen.push(sel + ' cursor=' + cursor);
    if(a === b) silent.push(sel + ' (cursor ' + cursor + ')');
  }
  check('hover.silent', w, 'controls with no visible hover change', silent.length ? silent : 'none', silent.length === 0, 'every control acknowledges hover');
  await ctx.close();
}

/* ---------- touch specifics ---------- */
export async function touch(env, tool){
  const {check, note} = env.R;
  const w = where(tool, 'phone', env.mode);
  const {ctx, page} = await fresh(env, tool, 'phone');
  const ta = await page.evaluate(() => {
    const q = s => { const e = document.querySelector(s); return e ? getComputedStyle(e).touchAction : 'n/a'; };
    const us = s => { const e = document.querySelector(s); return e ? getComputedStyle(e).webkitUserSelect || getComputedStyle(e).userSelect : 'n/a'; };
    return {preview: q('#preview'), card: q('#preview [data-edit="cardmenu"]'), btn: q('#copypng'), seg: q('#stylepicker button'), html: q('html'), cardSelect: us('#preview svg [data-edit] text, #preview svg [data-inspect] text'), callout: getComputedStyle(document.querySelector('#preview svg')).webkitTouchCallout};
  });
  note('touch.css', w, 'touch-action / user-select on touch surfaces', ta);
  check('touch.dbltapzoom', w, 'touch-action on tappable controls (double-tap zoom / delay)', ta, ['manipulation', 'none', 'pan-x pan-y', 'pan-x pan-y pinch-zoom'].includes(ta.btn) && ta.card !== 'auto', 'manipulation on buttons and tappable cards');
  check('touch.select', w, 'artefact text selectable by long-press on tappable cards', ta.cardSelect, ta.cardSelect === 'none', 'user-select:none on tap targets');
  /* tap on a card then swipe: page scrolls, no menu opens from the swipe */
  const y0 = await page.evaluate(() => scrollY);
  const b = await page.locator('#preview').boundingBox();
  await touchSwipe(page, {x: b.x + b.width / 2, y: 600}, {x: b.x + b.width / 2, y: 250});
  await sleep(500);
  const y1 = await page.evaluate(() => scrollY);
  const menu = await page.evaluate(() => !!document.querySelector('.eip-pop'));
  const selText = await page.evaluate(() => getSelection().toString());
  check('touch.swipe', w, 'vertical swipe over the artefact scrolls the page and opens nothing', {scrolled: y1 - y0, menu, selection: selText}, y1 - y0 > 100 && !menu && !selText, 'scrolls > 100px, no menu, no selection');
  /* tap targets below 44px */
  const small = await page.evaluate(() => [...document.querySelectorAll('button, summary, select, a[href], [data-edit], [data-inspect]')].filter(el => {
    if(el.closest('.mg-footer, .about, .syntax, .mg-masthead, .rail')) return false;
    const r = el.getBoundingClientRect(); if(!r.width || !r.height || getComputedStyle(el).visibility === 'hidden') return false;
    if(el.getAttribute('pointer-events') === 'none') return false;
    return Math.min(r.width, r.height) < 44;
  }).map(el => window.__feel.describe(el) + ' ' + Math.round(el.getBoundingClientRect().width) + 'x' + Math.round(el.getBoundingClientRect().height)));
  check('touch.targets', w, 'tap targets under 44px in the tool surface', small.length ? small.slice(0, 12) : 'none', small.length === 0, 'none');
  /* hover-only affordances: tappable controls drawn at opacity 0 at rest on a touch device */
  const invisible = await page.evaluate(() => [...document.querySelectorAll('#preview [data-edit], #preview [data-add-control], #preview [data-empty-control]')].filter(el => {
    const r = el.getBoundingClientRect(); if(r.width < 4 || r.height < 4) return false;
    let o = 1; for(let e = el; e && e.id !== 'preview'; e = e.parentElement) o *= parseFloat(getComputedStyle(e).opacity);
    return o < 0.2;
  }).map(el => (el.getAttribute('aria-label') || el.dataset.edit) + ' ' + Math.round(el.getBoundingClientRect().width) + 'x' + Math.round(el.getBoundingClientRect().height)));
  check('touch.hoveronly', w, 'tappable artefact controls invisible at rest on touch (hover-only affordance)', invisible.length ? invisible.slice(0, 8) : 'none', invisible.length === 0, 'visible at rest on touch');
  await ctx.close();
}

/* ---------- scrolling with a large document ---------- */
export async function scroll(env, tool, kind, source){
  const {check, note} = env.R;
  const w = where(tool, kind, env.mode);
  const gesture = async page => {
    if(kind === 'phone'){
      for(let i = 0; i < 4; i++){ await touchSwipe(page, {x: 180, y: 650}, {x: 180, y: 200}, {steps: 10}); }
    }else for(let i = 0; i < 20; i++){ await page.mouse.wheel(0, 120); await sleep(16); }
  };
  /* frames counted over the whole gesture (start..end marks), on the tool and on a
     trivial control page, so the cost of synthetic input itself is visible */
  const framed = async page => {
    const t0 = await page.evaluate(() => performance.now());
    await gesture(page);
    await sleep(300);
    return page.evaluate(t0 => { const f = window.__feel.frames.filter(x => x[0] >= t0); const d = []; for(let i = 1; i < f.length; i++) d.push(f[i][0] - f[i - 1][0]); return {frames: f.length, dropped: d.filter(x => x > 20).length, worst: Math.round(Math.max(0, ...d))}; }, t0);
  };
  const ctl = await newPage(env.browser, kind, {throttle: env.throttle, engine: env.engine});
  await ctl.page.goto('data:text/html,' + encodeURIComponent('<meta name="viewport" content="width=device-width,initial-scale=1"><div style="height:8000px;background:linear-gradient(#fff,#999)"></div>'));
  await sleep(300);
  const control = await framed(ctl.page);
  await ctl.ctx.close();
  const {ctx, page} = await fresh(env, tool, kind, {source});
  const fr = await framed(page);
  await page.evaluate(() => scrollTo(0, 0)); await sleep(300);
  const s = await measure(page, () => gesture(page), {quiet: 400});
  check('scroll.frames.vs.control', w, 'dropped frames scrolling a large document, minus the same gesture on a blank control page', {tool: fr, control}, fr.dropped - control.dropped <= 2, '<= 2 more than control');
  const sticky = await page.evaluate(() => [...document.querySelectorAll('body *')].filter(e => ['sticky', 'fixed'].includes(getComputedStyle(e).position) && e.getBoundingClientRect().height > 0).map(e => window.__feel.describe(e)).slice(0, 8));
  note('scroll', w, 'scroll a large document', {dropped: s.dropped, worstFrame: s.worstFrame, longTaskMax: s.longTaskMax, mutations: s.mutations, swaps: s.svgSwaps, sticky, scrolled: await page.evaluate(() => scrollY)});
  check('scroll.mutations', w, 'DOM work triggered by plain scrolling', {mutations: s.mutations, swaps: s.svgSwaps}, s.svgSwaps === 0, 'no artefact re-render');
  await ctx.close();
}

/* ---------- zoom control ---------- */
export async function zoom(env, tool, kind){
  const {check, note} = env.R;
  const w = where(tool, kind, env.mode);
  const phone = kind === 'phone';
  const {ctx, page} = await fresh(env, tool, kind);
  const res = [];
  for(const z of ['plus', 'plus', 'minus', 'fit']){
    const b = page.locator(`#zoomctl button[data-z="${z}"]`);
    if(!(await b.isEnabled())) continue;
    await b.scrollIntoViewIfNeeded(); await sleep(150);
    const s = await measure(page, () => press(page, b, phone), {quiet: 300});
    res.push({z, paint: paintOf(s), settled: s.settled, anims: s.animations, layout: s.layoutAnimated, scroll: s.scrollJumps, pans: s.pans});
  }
  note('zoom', w, 'zoom + + - Fit', res);
  check('zoom.paint', w, 'zoom input -> next paint (worst)', res.map(r => r.z + ':' + r.paint).join(' '), res.every(r => r.paint <= BAR.paint[env.mode]), '<= ' + BAR.paint[env.mode] + 'ms');
  check('zoom.anchor', w, 'zoom keeps the reading position (scroll/pan moves)', res.map(r => r.z + ':' + JSON.stringify({scroll: r.scroll, pan: r.pans})).join(' '), true, 'recorded');
  await ctx.close();
}

/* ---------- timeline Review view with no snapshot ---------- */
export async function reviewEmpty(env, kind){
  const {check} = env.R;
  const w = where('timeline', kind, env.mode);
  const {ctx, page} = await fresh(env, 'timeline', kind);
  const top = () => page.evaluate(() => Math.round(document.querySelector('#preview [data-inspect]')?.getBoundingClientRect().top + scrollY));
  const topBefore = await top();
  const s = await measure(page, () => press(page, page.locator('#stylepicker [data-style="review"]'), kind === 'phone'), {quiet: 400});
  const topAfter = await top();
  const st = await page.evaluate(() => {
    const hint = document.getElementById('reviewhint'), btn = hint && hint.querySelector('button');
    const r = btn && btn.getBoundingClientRect();
    return {pressed: document.querySelector('#stylepicker [aria-pressed="true"]')?.dataset.style,
      svgText: document.querySelector('#preview svg')?.textContent.slice(0, 160),
      hint: hint && !hint.hidden ? hint.textContent.trim() : null, btnH: r ? Math.round(r.height) : null, btnTab: btn ? btn.tabIndex : null};
  });
  await shot(page, `${env.out}/shots/timeline-review-empty-${kind}.png`);
  const move = topAfter - topBefore;
  check('review.empty.chartmove', w, 'chart top edge when Review is chosen with no snapshot (px)', {before: topBefore, after: topAfter, move}, Math.abs(move) <= 2, 'moves at most 2px');
  check('review.empty', w, 'Review with no saved comparison offers the action in the control row', {firstResponse: s.firstResponse, ...st}, st.pressed === 'review' && !!st.hint && /snapshot/i.test(st.hint) && st.btnTab === 0 && (kind !== 'phone' || st.btnH >= BAR.tap), 'Review selected; the control row says no snapshot and offers one (button reachable, >= 44px on phones)');
  if(env.mode === 'normal'){
    const snaps = await page.evaluate(() => document.querySelectorAll('#snapsel option').length);
    await page.locator('#reviewsnap').focus(); await page.keyboard.press('Enter'); await sleep(300);
    const after = await page.evaluate(() => ({options: document.querySelectorAll('#snapsel option').length, hintHidden: document.getElementById('reviewhint').hidden}));
    check('review.empty.action', w, 'the hint button takes a snapshot from the keyboard', {snaps, after}, after.options === snaps + 1 && after.hintHidden !== undefined, 'one more snapshot saved');
  }
  await ctx.close();
}
