/* Feel scenarios for Fermi. Each opens its own page, drives real input and records checks
   (ids f.<scenario>.<what>). Expectations are the 2026-11-13 rulings (see checks.mjs BAR). */
import {measure, waitQuiet, sleep, press, shot, frameStrip, touchSwipe} from './lib.mjs';
import {BAR} from './checks.mjs';
import {where, isBody, paint, openFR, readyFR, hashOpen, armUntil, until, window_, now, box, act, stateRows, pourDone, caretEnd} from './fr-lib.mjs';
import {states} from './controls.mjs';

const M = env => env.mode === 'cpu4x' ? 'cpu4x' : 'normal';
const W = (env, kind) => where('fermi', kind, env.mode, env.engine);

/* a long, non-product formula: sensitivity falls back to pinned re-simulation per input (the slow path) */
const LONG_VARS = 'abcdefghijklm'.split('').map(c => 'in_' + c);
export const LONG = {f: 'in_a*in_b + in_c*in_d - in_e/in_f + in_g*in_h*in_i + in_j - in_k + in_l*in_m',
  v: Object.fromEntries(LONG_VARS.map((n, i) => [n, [String(10 + i), String(30 + 3 * i), 'auto']])), q: 'Long formula', u: 'units'};

async function openAuthor(page, phone){
  if(await page.locator('#modelsource').isHidden()) await press(page, page.locator('#editmodel'), phone);
  await waitQuiet(page, {quiet: 300});
}
/* sample, every frame, whether the result panel is ghosted (is-stale) */
const staleSampler = page => page.evaluate(() => {
  window.__stale = [];
  const loop = () => { const r = document.getElementById('results'); window.__stale.push([performance.now(), r.classList.contains('is-stale') ? 1 : 0, document.getElementById('estimate-status').hidden ? 0 : 1]); if(window.__staleOn) requestAnimationFrame(loop); };
  window.__staleOn = true; requestAnimationFrame(loop);
});
const staleStop = page => page.evaluate(() => { window.__staleOn = false; const s = window.__stale; let toggles = 0; for(let i = 1; i < s.length; i++) if(s[i][1] !== s[i - 1][1]) toggles++; return {frames: s.length, ghosted: s.filter(f => f[1]).length, toggles}; });

/* ---------- first load ---------- */
export async function load(env, kind, {hash, label = 'example'} = {}){
  const {check, note} = env.R;
  const w = W(env, kind);
  const {newPage} = await import('./lib.mjs');
  const {ctx, page, errors} = await newPage(env.browser, kind, {throttle: env.throttle, engine: env.engine});
  await page.evaluate(() => 0).catch(() => {});
  await page.addInitScript(() => {
    /* record every change to the P50 figure and the result panel's display, and when the kicker first has text */
    window.__fl = {p50: [], kicker: null, results: []};
    new MutationObserver(() => {
      const p = document.getElementById('p50'), k = document.getElementById('kicker'), r = document.getElementById('results');
      if(p && p.textContent && window.__fl.p50.at(-1)?.[1] !== p.textContent) window.__fl.p50.push([Math.round(performance.now()), p.textContent]);
      if(k && k.textContent && window.__fl.kicker == null) window.__fl.kicker = Math.round(performance.now());
      if(r){ const d = r.style.display; if(window.__fl.results.at(-1)?.[1] !== d) window.__fl.results.push([Math.round(performance.now()), d]); }
    }).observe(document, {subtree: true, childList: true, characterData: true, attributes: true});
  });
  await page.goto(env.base + '/fermi/' + (hash ? '#' + hash : ''), {waitUntil: 'load'});
  await readyFR(page, 'fermi');
  await waitQuiet(page, {quiet: 500, max: 8000});
  const s = await page.evaluate(() => { const F = window.__feel; const s = F.summary(0, performance.now() - 450); s.fl = window.__fl; s.fcp = Math.round(performance.getEntriesByName('first-contentful-paint')[0]?.startTime || 0); return s; });
  const id = 'f.load.' + label;
  note(id, w, 'first load', {fcp: s.fcp, resultShown: s.fl.results, p50: s.fl.p50, kicker: s.fl.kicker, cls: s.cls, shiftSources: s.shiftSources, longTasks: s.longTasks, longTaskMax: s.longTaskMax, heightJumps: s.heightJumps, anims: s.animations});
  check(id + '.cls', w, 'layout shift during load', s.cls, s.cls <= 0.05, '<= 0.05');
  check(id + '.renders', w, 'times the P50 figure is painted during load (one render on load)', s.fl.p50.length, s.fl.p50.length <= 1, '1');
  const shown = s.fl.results.find(r => r[1] === 'grid');
  check(id + '.first', w, 'result on screen (ms from navigation)', shown ? shown[0] : null, shown && shown[0] <= (M(env) === 'normal' ? 1200 : 3000), M(env) === 'normal' ? '<= 1200ms' : '<= 3000ms');
  check(id + '.longtask', w, 'longest task during load', s.longTaskMax, s.longTaskMax <= (M(env) === 'normal' ? 200 : 600), M(env) === 'normal' ? '<= 200ms' : '<= 600ms');
  check(id + '.kicker', w, 'kicker painted by script after the first paint (ms after FCP)', {kicker: s.fl.kicker, fcp: s.fcp}, s.fl.kicker != null && s.fl.kicker <= s.fcp, 'in the first painted frame');
  if(label === 'example' && M(env) === 'normal') check(id + '.errors', w, 'console errors', errors, errors.length === 0, 'none');
  if(M(env) === 'normal' && label === 'example') await shot(page, `${env.out}/shots/fermi-load-${kind}${env.engine === 'webkit' ? '-webkit' : ''}.png`);
  await ctx.close();
}

/* ---------- typing: formula and range boxes ---------- */
export async function typing(env, kind, {label = 'short', state} = {}){
  const {check, note} = env.R;
  const w = W(env, kind);
  const phone = kind === 'phone';
  const {ctx, page} = await openFR(env, 'fermi', kind, {state});
  await openAuthor(page, phone);
  const f = page.locator('#formula');
  await f.click(); await caretEnd(page);
  /* per keystroke: keydown -> the result reflects the edit (went stale, then current again) */
  const pred = `() => { const st = document.getElementById('results').classList.contains('is-stale'); if(st) window.__seen = 1; return window.__seen && !st && document.getElementById('err').style.display !== 'block' && getComputedStyle(document.getElementById('results')).display !== 'none'; }`;
  const samples = [];
  for(const ch of [' ', '*', ' ', '1', '.', '0', '5']){
    await page.evaluate(() => { window.__seen = 0; });
    await armUntil(page, pred, {timeout: 3000});
    await page.keyboard.type(ch);
    const ms = await until(page);
    samples.push(ch + ':' + ms);
    await waitQuiet(page, {quiet: 250});
  }
  const valid = samples.filter(s => /^[1-9]/.test(s.split(':')[0]) || s.startsWith('5') || s.startsWith('0')).map(s => +s.split(':')[1]);
  note(`f.type.${label}.perkey`, w, 'formula keystroke -> result current again (-1 = still not current/erroring after 3s)', samples);
  const lastKey = +samples.at(-1).split(':')[1];
  check(`f.type.${label}.keyrender`, w, 'formula keystroke -> recomputed result painted (last key, formula valid)', lastKey, lastKey > 0 && lastKey <= BAR.keyRender[M(env)], '<= ' + BAR.keyRender[M(env)] + 'ms');
  /* burst: 10 keys at 90ms: does typing stall, and does the result ghost/unghost on every key? */
  await staleSampler(page);
  const t0 = await now(page);
  const s = await measure(page, async () => { for(const ch of ' + 2 - 1 ') { await page.keyboard.type(ch); await sleep(90); } }, {quiet: 400});
  const st = await staleStop(page);
  note(`f.type.${label}.burst`, w, 'typing burst (9 keys @90ms)', {worstKeyPaint: s.nextPaintApprox, eventTiming: s.eventTiming, longTasks: s.longTasks, longTaskMax: s.longTaskMax, longTaskTotal: s.longTaskTotal, dropped: s.dropped, worstFrame: s.worstFrame, heightJumps: s.heightJumps, scrollJumps: s.scrollJumps, cls: s.cls, stale: st, active: s.active});
  check(`f.type.${label}.stall`, w, 'worst keystroke -> next paint while typing', s.nextPaintApprox, s.nextPaintApprox <= BAR.paint[M(env)], '<= ' + BAR.paint[M(env)] + 'ms (typing never stalls)');
  check(`f.type.${label}.longtask`, w, 'longest task while typing', s.longTaskMax, s.longTaskMax <= (M(env) === 'normal' ? 50 : 150), '<= ' + (M(env) === 'normal' ? 50 : 150) + 'ms');
  check(`f.type.${label}.ghost`, w, 'result panel ghosted (opacity .32) and restored while typing: frames ghosted / toggles', st, st.toggles <= 2, 'ghosts at most once per pause (<= 2 toggles), not on every keystroke');
  check(`f.type.${label}.jump`, w, 'page height / scroll jumps while typing in the formula', {heightJumps: s.heightJumps, scrollJumps: s.scrollJumps, cls: s.cls}, !s.heightJumps.length && !s.scrollJumps.length, 'none: the page under the caret holds still');
  check(`f.type.${label}.focus`, w, 'focus after typing', s.active, /textarea#formula/.test(s.active), 'stays in the formula');
  if(label === 'short' && M(env) === 'normal'){
    /* range box: low of the first input */
    const lo = page.locator('#vrows .vrow input').first();
    await lo.click(); await page.keyboard.press('ControlOrMeta+a');
    const r = [];
    for(const ch of ['2', '.', '5', 'M']){
      await page.evaluate(() => { window.__seen = 0; });
      await armUntil(page, pred, {timeout: 3000});
      await page.keyboard.type(ch);
      r.push(ch + ':' + await until(page));
      await waitQuiet(page, {quiet: 250});
    }
    note('f.type.range.perkey', w, 'range box keystroke -> result current', r);
    const v = +r.at(-1).split(':')[1];
    check('f.type.range.keyrender', w, 'range keystroke -> recomputed result painted', v, v > 0 && v <= BAR.keyRender[M(env)], '<= ' + BAR.keyRender[M(env)] + 'ms');
    const rb = await page.evaluate(() => { const el = document.activeElement; const r = el.getBoundingClientRect(); return {active: el.getAttribute('aria-label'), font: getComputedStyle(el).fontSize, top: Math.round(r.top), bottom: Math.round(r.bottom), vh: innerHeight}; });
    note('f.type.range.field', w, 'edited range box position (keyboard covers ~the bottom 45% of a phone)', rb);
    if(phone) check('f.type.range.keyboard', w, 'edited range box sits above where an on-screen keyboard would be (top 55% of the viewport)', rb, rb.bottom <= rb.vh * 0.55, 'bottom <= 55% of viewport height');
  }
  if(phone && label === 'short' && M(env) === 'normal'){
    const fb = await page.evaluate(() => { const r = document.getElementById('formula').getBoundingClientRect(); return {top: Math.round(r.top), bottom: Math.round(r.bottom), vh: innerHeight, resultsTop: Math.round(document.getElementById('results').getBoundingClientRect().top)}; });
    note('f.type.phone.layout', w, 'formula box and the result it drives on a phone (result top relative to viewport)', fb);
    check('f.type.phone.visible', w, 'the result the formula drives is visible while typing on a phone', fb, fb.resultsTop < fb.vh * 0.55, 'some of the result above the on-screen keyboard');
  }
  await ctx.close();
}

/* ---------- distribution / driver tree ---------- */
export async function views(env, kind){
  const w = W(env, kind), phone = kind === 'phone';
  const {ctx, page} = await openFR(env, 'fermi', kind);
  await page.locator('#viewtree').scrollIntoViewIfNeeded();
  const y0 = await page.evaluate(() => scrollY);
  const a = await act(env, page, {id: 'f.view.tree', w, label: 'switch to driver tree', fn: () => press(page, page.locator('#viewtree'), phone), focus: /button#viewtree/, cls: true});
  if(M(env) === 'normal') await shot(page, `${env.out}/shots/fermi-tree-${kind}.png`);
  const b = await act(env, page, {id: 'f.view.dist', w, label: 'switch back to distribution', fn: () => press(page, page.locator('#viewdist'), phone), focus: /button#viewdist/, cls: true});
  env.R.note('f.view.motion', w, 'motion on the view switch', {tree: a.animations, dist: b.animations, scrollMoved: await page.evaluate(() => scrollY) - y0});
  env.R.check('f.view.transition', w, 'distribution <-> tree: motion between views', [...a.animations, ...b.animations].filter(x => !/color/.test(x)).length ? [...a.animations, ...b.animations] : 'none: hard cut', [...a.animations, ...b.animations].some(x => /opacity|mo-ghost/.test(x)), 'the suite view transition (opacity cross-fade ~140ms, as Roadmap/Timeline)');
  await ctx.close();
}

/* ---------- Replay the maths ---------- */
const overlaySampler = page => page.evaluate(() => {
  window.__ov = []; let prev = -1;
  const loop = () => { const n = document.querySelectorAll('.histwrap canvas:not(#hist)').length; if(n !== prev){ window.__ov.push([Math.round(performance.now()), n]); prev = n; } if(window.__ovOn) requestAnimationFrame(loop); };
  window.__ovOn = true; requestAnimationFrame(loop);
});
const overlayStop = page => page.evaluate(() => { window.__ovOn = false; return window.__ov; });
export async function replay(env, kind, {reduced = false} = {}){
  const {check, note} = env.R;
  const w = W(env, kind) + (reduced ? '/reduced' : '');
  const phone = kind === 'phone';
  const {ctx, page} = await openFR(env, 'fermi', kind, {reducedMotion: reduced ? 'reduce' : 'no-preference'});
  const btn = page.locator('#replay');
  await btn.scrollIntoViewIfNeeded();
  await overlaySampler(page);
  const t0 = await now(page);
  const s = await measure(page, () => press(page, btn, phone), {quiet: 400, max: 8000});
  await pourDone(page); await sleep(100);
  const ov = await overlayStop(page);
  const t1 = await now(page);
  const win = await window_(page, t0, t1);
  const on = ov.find(o => o[1] > 0), off = ov.filter(o => o[1] === 0).at(-1);
  const dur = on && off && off[0] > on[0] ? off[0] - on[0] : null;
  note('f.replay.run', w, 'Replay the maths: overlay timeline [t, overlays] and frame stats', {paint: paint(s), firstResponse: s.firstResponse, overlay: ov.map(o => [Math.round(o[0] - t0), o[1]]), duration: dur, ...win, active: s.active, verdict: await page.locator('#pourverdict').textContent()});
  check('f.replay.paint', w, 'Replay: click -> next paint', paint(s), paint(s) <= BAR.paint[M(env)], '<= ' + BAR.paint[M(env)] + 'ms');
  check('f.replay.firstresponse', w, 'Replay: first visible change', on ? Math.round(on[0] - t0) : null, on && on[0] - t0 <= 150, '<= ~100ms after the click');
  if(!reduced){
    check('f.replay.dropped', w, 'Replay: missed frames (gaps >34ms) during the pour', {missed: win.missed, over20ms: win.dropped, worst: win.worstFrame, frames: win.frames}, win.missed <= (M(env) === 'normal' ? 1 : 6), M(env) === 'normal' ? '<= 1' : '<= 6');
    check('f.replay.longtask', w, 'Replay: longest task during the pour', win.longTaskMax, win.longTaskMax <= (M(env) === 'normal' ? 50 : 150), '<= ' + (M(env) === 'normal' ? 50 : 150) + 'ms');
    note('f.replay.duration', w, 'pour overlay on screen (ms)', dur);
  } else {
    check('f.replay.reduced', w, 'Replay under reduced motion: overlay animation time', dur, dur == null || dur <= 50, 'end state at once, no animated pour');
  }
  check('f.replay.focus', w, 'Replay: focus afterwards', s.active, /button#replay/.test(s.active), 'stays on the Replay button');
  check('f.replay.jump', w, 'Replay: page height / scroll jumps', {heightJumps: s.heightJumps, scrollJumps: s.scrollJumps, cls: win.cls}, !s.heightJumps.length && !s.scrollJumps.length && win.cls <= 0.05, 'none');
  if(!reduced && M(env) === 'normal'){
    /* frame strip of the pour; and does the 360px overlay paint over the controls above the histogram? */
    const clip = await page.evaluate(() => { const r = document.querySelector('.histwrap').getBoundingClientRect(); return {x: 0, y: Math.max(0, r.top - 200), width: innerWidth, height: Math.min(innerHeight - Math.max(0, r.top - 200), 420)}; });
    const strip = await frameStrip(page, () => press(page, btn, phone), null, {n: 8, gap: 450, clip});
    const {writeFileSync} = await import('node:fs');
    strip.forEach((b, i) => writeFileSync(`${env.out}/shots/fermi-replay-${kind}-${i}.png`, b));
    const cover = await page.evaluate(() => { const o = document.querySelector('.histwrap canvas:not(#hist)'); if(!o) return 'gone'; const r = o.getBoundingClientRect(); const hits = ['#replay', '#viewdist', '#viewtree', '#spread', '#provenance', '.verdict-block'].filter(s => { const e = document.querySelector(s); if(!e || e.hidden) return false; const b = e.getBoundingClientRect(); return b.bottom > r.top && b.top < r.bottom && b.right > r.left && b.left < r.right; }); return {top: Math.round(r.top), height: Math.round(r.height), overlaps: hits}; });
    note('f.replay.overlay', w, 'overlay box at the end of the strip and the controls it paints over', cover);
    await pourDone(page);
    /* interruption: replay twice within 80ms, then replay mid-pour, then switch view mid-pour */
    await overlaySampler(page);
    await press(page, btn, phone); await sleep(80); await press(page, btn, phone);
    await sleep(300);
    const mid = await page.evaluate(() => document.querySelectorAll('.histwrap canvas:not(#hist)').length);
    await sleep(500); await press(page, btn, phone); await sleep(200);
    const mid2 = await page.evaluate(() => document.querySelectorAll('.histwrap canvas:not(#hist)').length);
    await pourDone(page); await sleep(200);
    const end = await page.evaluate(() => ({overlays: document.querySelectorAll('.histwrap canvas:not(#hist)').length, verdict: document.getElementById('pourverdict').textContent.slice(0, 40)}));
    const ov2 = await overlayStop(page);
    check('f.replay.rapid', w, 'Replay twice 80ms apart, then again mid-pour: overlays at each point, end state', {afterDouble: mid, afterRestart: mid2, end, timeline: ov2.length}, mid === 1 && mid2 === 1 && end.overlays === 0 && end.verdict, 'one pour at a time, restarts cleanly, ends with no overlay and the verdict');
    await press(page, btn, phone); await sleep(600);
    await press(page, page.locator('#viewtree'), phone); await sleep(100);
    const afterSwitch = await page.evaluate(() => document.querySelectorAll('.histwrap canvas:not(#hist)').length + document.querySelectorAll('canvas[style*="z-index:6"]').length);
    check('f.replay.interrupt', w, 'switch to driver tree mid-pour: overlays left behind', afterSwitch, afterSwitch === 0, '0');
  }
  await ctx.close();
}

/* find the threshold handle: the red line's x at mid-plot, the handle sits at y = 17 css px */
const handleAt = page => page.evaluate(() => {
  const c = document.getElementById('hist'), x = c.getContext('2d'), dpr = c.width / c.clientWidth;
  const y = Math.round(80 * dpr), row = x.getImageData(0, y, c.width, 1).data;
  for(let i = 0; i < c.width; i++){ const r = row[i * 4], g = row[i * 4 + 1], b = row[i * 4 + 2], a = row[i * 4 + 3]; if(a > 200 && r > 150 && g < 110 && b < 110){ const rr = c.getBoundingClientRect(); return {x: rr.left + i / dpr + 1, y: rr.top + 17}; } }
  return null;
});
/* ---------- goal line: typed threshold, drag, the solver ---------- */
export async function goal(env, kind){
  const {check, note} = env.R;
  const w = W(env, kind), phone = kind === 'phone';
  const {ctx, page} = await openFR(env, 'fermi', kind);
  const tin = page.locator('#tin');
  await tin.scrollIntoViewIfNeeded();
  await press(page, tin, phone);
  /* typed: per key the P(>T) readout, then the debounced solver */
  const r = [];
  for(const ch of ['2', '5', '0']){
    await page.evaluate(() => { window.__t0txt = document.getElementById('tout').textContent; });
    await armUntil(page, `() => document.getElementById('tout').textContent !== window.__t0txt`, {timeout: 2000});
    await page.keyboard.type(ch);
    r.push(ch + ':' + await until(page));
    await sleep(120);
  }
  const t0 = await now(page);
  await page.waitForFunction(() => !document.getElementById('confessverdict').hidden, null, {timeout: 6000}).catch(() => {});
  const conf = await page.evaluate(t => ({at: Math.round(performance.now() - t), text: document.getElementById('confessverdict').textContent.slice(0, 80)}), t0);
  await waitQuiet(page, {quiet: 300});
  const win = await window_(page, t0, await now(page));
  note('f.goal.typed', w, 'threshold keystroke -> P(>T) readout updated, then confession after the last key', {perKey: r, confession: conf, ...win});
  const worst = Math.max(...r.map(x => +x.split(':')[1]));
  check('f.goal.typed.keyrender', w, 'threshold keystroke -> P(>T) painted (worst key)', worst, worst > 0 && worst <= BAR.paint[M(env)], '<= ' + BAR.paint[M(env)] + 'ms');
  check('f.goal.typed.solver', w, 'longest task when the debounced solver runs after typing', win.longTaskMax, win.longTaskMax <= (M(env) === 'normal' ? 50 : 150), '<= ' + (M(env) === 'normal' ? 50 : 150) + 'ms');
  check('f.goal.typed.jump', w, 'layout shift when the confession appears under the threshold', win.cls, win.cls <= 0.05, '<= 0.05');
  /* where does the confession's per-input evidence (ghost ranges, Adopt) render? */
  const ghosts = await page.evaluate(() => [...document.querySelectorAll('.cghost')].map(g => ({visible: !!g.offsetParent, adopt: !!g.querySelector('.adopt')})));
  note('f.goal.ghosts', w, 'confession ghost rows (rendered in the authoring panel)', ghosts);
  check('f.goal.ghosts.visible', w, 'confession ghost ranges and Adopt visible with the authoring panel closed (the default)', ghosts, ghosts.length && ghosts.some(g => g.visible), 'the evidence and its Adopt button are on screen when the confession speaks');
  /* drag the goal line */
  await page.locator('#hist').scrollIntoViewIfNeeded();
  const h = await handleAt(page);
  note('f.goal.handle', w, 'grab handle position', h);
  if(!h){ check('f.goal.drag.ran', w, 'grab handle found', null, false, 'a handle'); await ctx.close(); return; }
  const before = await page.locator('#tin').inputValue();
  const y0 = await page.evaluate(() => scrollY);
  const t1 = await now(page);
  const dx = phone ? -90 : -160;
  if(phone) await touchSwipe(page, h, {x: h.x + dx, y: h.y + 4}, {steps: 14});
  else{
    await page.mouse.move(h.x, h.y); await page.mouse.down(); await sleep(30);
    for(let i = 1; i <= 18; i++){ await page.mouse.move(h.x + dx * i / 18, h.y + 3); await sleep(16); }
    await page.mouse.up();
  }
  const tUp = await now(page);
  await page.waitForFunction(() => !document.getElementById('confessverdict').hidden, null, {timeout: 6000}).catch(() => {});
  const tConf = await now(page);
  await waitQuiet(page, {quiet: 300});
  const drag = await window_(page, t1, tUp);
  const rel = await window_(page, tUp - 5, await now(page));
  const after = await page.locator('#tin').inputValue();
  const y1 = await page.evaluate(() => scrollY);
  const sel = await page.evaluate(() => String(getSelection()).length);
  note('f.goal.drag', w, 'drag the goal line', {before, after, during: drag, release: rel, confessionAfterRelease: Math.round(tConf - tUp), scrolled: y1 - y0, selection: sel});
  check('f.goal.drag.moved', w, 'threshold follows the drag', {before, after}, before !== after, 'value changes');
  check('f.goal.drag.frames', w, 'missed frames (gaps >34ms) while dragging the goal line', {missed: drag.missed, over20ms: drag.dropped, worst: drag.worstFrame, longTaskMax: drag.longTaskMax}, drag.missed <= (M(env) === 'normal' ? 0 : 3) && drag.longTaskMax <= (M(env) === 'normal' ? 50 : 150), M(env) === 'normal' ? '0 missed, no task > 50ms' : '<= 3 missed, no task > 150ms');
  check('f.goal.drag.solver', w, 'release -> confession painted (the solver)', Math.round(tConf - tUp), tConf - tUp <= (M(env) === 'normal' ? 100 : 400), M(env) === 'normal' ? '<= 100ms' : '<= 400ms');
  check('f.goal.drag.solvertask', w, 'longest task at release (the solver)', rel.longTaskMax, rel.longTaskMax <= (M(env) === 'normal' ? 50 : 150), '<= ' + (M(env) === 'normal' ? 50 : 150) + 'ms');
  check('f.goal.drag.page', w, 'page scroll / text selection during the drag', {scrolled: y1 - y0, selection: sel}, y1 === y0 && !sel, 'no scroll, nothing selected');
  if(M(env) === 'normal') await shot(page, `${env.out}/shots/fermi-goal-${kind}.png`);
  /* a tap on the histogram (not the handle) sets the threshold */
  const hb = await box(page, '#hist');
  const tap = await act(env, page, {id: 'f.goal.tap', w, label: 'tap the histogram to set the goal line', fn: () => press(page, {x: hb.x + hb.w * 0.8, y: hb.y + 120}, phone), focus: null, skip: ['longtask']});
  check('f.goal.tap.solvertask', w, 'longest task after a tap on the histogram (solver runs synchronously in the click)', tap.longTaskMax, tap.longTaskMax <= (M(env) === 'normal' ? 50 : 150), '<= ' + (M(env) === 'normal' ? 50 : 150) + 'ms');
  /* Escape from the threshold box dissolves the confession */
  await tin.focus(); await page.keyboard.press('Escape'); await sleep(100);
  const esc = await page.evaluate(() => ({hidden: document.getElementById('confessverdict').hidden, active: document.activeElement.id}));
  check('f.goal.escape', w, 'Escape in the threshold box: confession dissolves, focus stays', esc, esc.hidden && esc.active === 'tin', 'hidden, focus on #tin');
  await ctx.close();
}

/* ---------- Adopt / Undo from the confession ---------- */
export async function adopt(env, kind){
  const {check} = env.R;
  const w = W(env, kind), phone = kind === 'phone';
  const {ctx, page} = await openFR(env, 'fermi', kind);
  await openAuthor(page, phone);
  await page.locator('#tin').fill('300');
  await page.locator('#tin').dispatchEvent('input');
  await page.waitForSelector('.cghost .adopt', {timeout: 6000}).catch(() => {});
  const a = page.locator('.cghost .adopt').first();
  if(!(await a.count())){ check('f.adopt.ran', w, 'Adopt offered', 0, false, 'an Adopt button'); await ctx.close(); return; }
  await act(env, page, {id: 'f.adopt', w, label: 'Adopt the cheapest change', fn: () => press(page, a, phone), focus: /Undo|button\.adopt/, cls: true});
  const u = page.locator('#confessverdict .adopt');
  if(await u.count()) await act(env, page, {id: 'f.adopt.undo', w, label: 'Undo the adopt', fn: () => press(page, u, phone), focus: null, cls: true});
  await ctx.close();
}

/* ---------- P10/P50/P90 review tiles ---------- */
export async function review(env, kind){
  const {check} = env.R;
  const w = W(env, kind), phone = kind === 'phone';
  const {ctx, page} = await openFR(env, 'fermi', kind);
  const s = await act(env, page, {id: 'f.review.pick', w, label: 'pick P50 to inspect', fn: () => press(page, page.locator('#reviewp50'), phone), focus: /h2#resultreviewtitle/});
  const vis = await page.evaluate(() => { const r = document.getElementById('resultreviewtitle').getBoundingClientRect(); return {top: Math.round(r.top), bottom: Math.round(r.bottom), vh: innerHeight}; });
  check('f.review.visible', w, 'the inspected detail is on screen after the pick', {...vis, scrollJumps: s.scrollJumps}, vis.top >= 0 && vis.bottom <= vis.vh, 'within the viewport (or scrolled to smoothly)');
  await page.keyboard.press('Escape'); await sleep(100);
  const back = await page.evaluate(() => ({active: document.activeElement.id, pressed: document.getElementById('reviewp50').getAttribute('aria-pressed')}));
  check('f.review.escape', w, 'Escape clears the pick and returns focus to the tile', back, back.active === 'reviewp50' && back.pressed === 'false', 'focus on #reviewp50, unpressed');
  await ctx.close();
}

/* ---------- A/B compare ---------- */
export async function compare(env, kind){
  const w = W(env, kind), phone = kind === 'phone';
  const {ctx, page} = await openFR(env, 'fermi', kind);
  await act(env, page, {id: 'f.compare.on', w, label: 'Compare variants', fn: () => press(page, page.locator('#scentabs .tab').first(), phone), focus: /#scentabs|button\.tab/});
  await act(env, page, {id: 'f.compare.switch', w, label: 'switch to variant A', fn: () => press(page, page.locator('#scentabs .tab[data-s="A"]'), phone), focus: /button\.tab/, cls: true});
  await act(env, page, {id: 'f.compare.off', w, label: 'stop comparing', fn: () => press(page, page.locator('#scentabs .tab').last(), phone), focus: /button\.tab|#scentabs/});
  await ctx.close();
}

/* ---------- authoring panel open/close, estimate/cashflow mode ---------- */
export async function author(env, kind){
  const w = W(env, kind), phone = kind === 'phone';
  const {ctx, page} = await openFR(env, 'fermi', kind);
  await act(env, page, {id: 'f.author.open', w, label: 'Edit formula & ranges', fn: () => press(page, page.locator('#editmodel'), phone), focus: /textarea#formula/});
  await act(env, page, {id: 'f.author.close', w, label: 'Back to estimate', fn: () => press(page, page.locator('#returntoreview'), phone), focus: /button#editmodel/});
  await act(env, page, {id: 'f.mode.cf', w, label: 'switch to Cashflow', fn: () => press(page, page.locator('#modecf'), phone), focus: /button#modecf/});
  if(M(env) === 'normal') await shot(page, `${env.out}/shots/fermi-cashflow-${kind}.png`);
  await act(env, page, {id: 'f.mode.est', w, label: 'switch back to Estimate', fn: () => press(page, page.locator('#modeest'), phone), focus: /button#modeest/});
  await ctx.close();
}

/* ---------- cashflow rows and the debt panel ---------- */
export async function cashflow(env, kind){
  const {check, note} = env.R;
  const w = W(env, kind), phone = kind === 'phone';
  const {ctx, page} = await openFR(env, 'fermi', kind);
  await press(page, page.locator('#modecf'), phone); await waitQuiet(page);
  await openAuthor(page, phone);
  const add = await act(env, page, {id: 'f.cf.add', w, label: 'Add period', fn: () => press(page, page.locator('#cfadd'), phone), focus: /input|button#cfadd/});
  await act(env, page, {id: 'f.cf.remove', w, label: 'remove the last period', fn: () => press(page, page.locator('#cfrows .del'), phone), focus: /button\.del|input|button#cfadd/});
  /* keystroke in a period box -> chart redrawn */
  const hi = page.locator('#cfrows input').nth(5);
  await press(page, hi, phone); await page.keyboard.press('ControlOrMeta+a'); await page.keyboard.type('9');
  await waitQuiet(page, {quiet: 300});
  await page.evaluate(() => { window.__cfsvg = document.querySelector('#cfwrap svg'); });
  await armUntil(page, `() => { const s = document.querySelector('#cfwrap svg'); return s && s !== window.__cfsvg; }`, {timeout: 3000});
  await page.keyboard.type('5');
  const k = await until(page);
  await waitQuiet(page);
  check('f.cf.keyrender', w, 'period keystroke -> cashflow chart redrawn', k, k > 0 && k <= BAR.keyRender[M(env)], '<= ' + BAR.keyRender[M(env)] + 'ms');
  /* burst */
  const s = await measure(page, async () => { for(const ch of '1234') { await page.keyboard.type(ch); await sleep(90); } }, {quiet: 400});
  note('f.cf.burst', w, 'typing in a period box', {worstKeyPaint: s.nextPaintApprox, longTaskMax: s.longTaskMax, heightJumps: s.heightJumps, scrollJumps: s.scrollJumps, cls: s.cls});
  check('f.cf.stall', w, 'worst keystroke -> next paint while typing a period', s.nextPaintApprox, s.nextPaintApprox <= BAR.paint[M(env)], '<= ' + BAR.paint[M(env)] + 'ms');
  check('f.cf.longtask', w, 'longest task while typing a period (40,000-run simulation)', s.longTaskMax, s.longTaskMax <= (M(env) === 'normal' ? 50 : 150), '<= ' + (M(env) === 'normal' ? 50 : 150) + 'ms');
  await act(env, page, {id: 'f.cf.grain', w, label: 'switch grain to Months', fn: () => press(page, page.locator('#cfgrain button[data-g="month"]'), phone), focus: /button/, skip: []});
  await act(env, page, {id: 'f.cf.example', w, label: 'Geared build example', fn: () => press(page, page.locator('#cfchips .chip', {hasText: 'Geared'}), phone), focus: /button\.chip/});
  const deb = page.locator('#cfdebton');
  const on = await deb.isChecked();
  await act(env, page, {id: 'f.cf.debt', w, label: (on ? 'turn off' : 'turn on') + ' debt sizing', fn: () => press(page, page.locator('.cfdebttoggle'), phone), focus: /input#cfdebton/});
  if(phone){ const lb = await box(page, '.cfdebttoggle'); check('f.cf.debt.tap', w, 'debt toggle label (the tap target around an 18px checkbox)', [Math.round(lb.w), Math.round(lb.h)], lb.h >= 44, 'label row >= 44px tall'); }
  await ctx.close();
}

/* ---------- copy buttons and their confirmations ---------- */
async function copyCheck(env, page, w, id, sel, phone){
  const {check} = env.R;
  const btn = page.locator(sel).first();
  await btn.scrollIntoViewIfNeeded();
  const orig = (await btn.textContent()).trim();
  const s = await act(env, page, {id, w, label: 'copy ' + sel, fn: () => press(page, btn, phone), focus: null, skip: ['layoutprops']});
  const flash = (await btn.textContent()).trim();
  const wasW = await btn.evaluate(b => b.getBoundingClientRect().width);
  await press(page, btn, phone); await sleep(700); await press(page, btn, phone);   // repeat while confirming
  await sleep(2600);
  const after = (await btn.textContent()).trim();
  const w2 = await btn.evaluate(b => b.getBoundingClientRect().width);
  check(id + '.confirm', w, 'confirmation shown and returns to the original label (also after repeated presses)', {orig, flash, after}, flash !== orig && after === orig, 'flashes, then back to "' + orig + '"');
  check(id + '.focus', w, 'focus after copying', s.active, !isBody(s.active), 'stays on the button');
  return {orig, flash, widthChange: Math.round(w2 - wasW)};
}
export async function copies(env, kind){
  const {note} = env.R;
  const w = W(env, kind), phone = kind === 'phone';
  const {ctx, page} = await openFR(env, 'fermi', kind);
  const res = {};
  res.summary = await copyCheck(env, page, w, 'f.copy.summary', '#copy', phone);
  res.markdown = await copyCheck(env, page, w, 'f.copy.markdown', '#copydoc', phone);
  res.verdict = await copyCheck(env, page, w, 'f.copy.verdict', '.vcopy', phone);
  /* PNG: a download built synchronously in the click */
  const dl = page.waitForEvent('download', {timeout: 6000}).catch(() => null);
  const pngS = await act(env, page, {id: 'f.copy.png', w, label: 'PNG download', fn: () => press(page, page.locator('#png'), phone), focus: null, skip: ['feedback']});
  const d = await dl;
  note('f.copy.png.file', w, 'PNG download', d ? d.suggestedFilename() : 'none');
  env.R.check('f.copy.png.ack', w, 'PNG: first DOM change on the page after the click (any acknowledgement)', pngS.firstResponse, pngS.firstResponse != null && pngS.firstResponse <= 100, 'a status or label change within 100ms');
  await press(page, page.locator('#modecf'), phone); await waitQuiet(page);
  await press(page, page.locator('#cfresults .action-disclosure > summary'), phone); await sleep(150);
  res.cfmarkdown = await copyCheck(env, page, w, 'f.copy.cfmarkdown', '#cfcopydoc', phone);
  res.cfpng = await copyCheck(env, page, w, 'f.copy.cfpng', '#cfcopypng', phone);
  note('f.copy.all', w, 'copy labels', res);
  await ctx.close();
}

/* ---------- menus: File, cashflow Export and Method ---------- */
export async function menus(env, kind){
  const {check, note} = env.R;
  const w = W(env, kind), phone = kind === 'phone';
  const {ctx, page} = await openFR(env, 'fermi', kind);
  await press(page, page.locator('#modecf'), phone); await waitQuiet(page);
  const rows = [];
  for(const [name, sel] of [['File', 'details.tool-file > summary'], ['Export', '#cfresults .action-disclosure > summary'], ['Method', '#cfresults details.method > summary']]){
    const sum = page.locator(sel);
    await sum.scrollIntoViewIfNeeded();
    const s = await measure(page, () => press(page, sum, phone), {quiet: 200});
    const firstTap = await sum.evaluate(su => su.parentElement.open);
    if(!firstTap){ await press(page, sum, phone); await sleep(200); }
    const r = await sum.evaluate(su => { const d = su.parentElement; const kids = [...d.querySelectorAll('button, a, p')].filter(e => !su.contains(e) && e.getClientRects().length); return {open: d.open, outside: kids.filter(e => { const b = e.getBoundingClientRect(); return b.left < 0 || b.right > innerWidth + 1; }).map(e => (e.id || e.textContent.trim().slice(0, 16)) + '@' + Math.round(e.getBoundingClientRect().left) + '..' + Math.round(e.getBoundingClientRect().right))}; });
    await shot(page, `${env.out}/shots/fermi-${kind}-menu-${name}.png`);
    await page.keyboard.press('Escape'); await sleep(100);
    const esc = await sum.evaluate(su => ({open: su.parentElement.open, focus: document.activeElement === su}));
    if(esc.open){ await press(page, sum, phone); await sleep(80); }
    await press(page, sum, phone); await sleep(100);
    await press(page, {x: phone ? 6 : 1270, y: phone ? 520 : 300}, phone); await sleep(120);   /* phone: the left gutter, well clear of any menu (Chromium's touch adjustment snaps a tap a few px off a menu onto its item) */
    const out = await sum.evaluate(su => su.parentElement.open);
    if(out){ await press(page, sum, phone); await sleep(80); }
    rows.push({name, firstTapOpened: firstTap, paint: paint(s), anims: s.animations, ...r, escOpen: esc.open, escFocus: esc.focus, outsideOpen: out, size: await sum.evaluate(e => [Math.round(e.getBoundingClientRect().width), Math.round(e.getBoundingClientRect().height)])});
  }
  note('f.menu.all', w, 'menus', rows);
  check('f.menu.opens', w, 'menus that did not open on the first press', rows.filter(r => !r.firstTapOpened).map(r => r.name), rows.every(r => r.firstTapOpened), 'every menu opens on the first press');
  check('f.menu.onscreen', w, 'menu items outside the viewport', rows.filter(r => r.outside.length).map(r => r.name + ': ' + r.outside.join(',')), rows.every(r => !r.outside.length), 'none');
  check('f.menu.escape', w, 'menus Escape does not close / focus not returned', rows.filter(r => r.escOpen || !r.escFocus).map(r => r.name + (r.escOpen ? ' stays open' : ' focus lost')), rows.every(r => !r.escOpen && r.escFocus), 'Escape closes and returns focus to the summary');
  check('f.menu.outside', w, 'menus left open after a press elsewhere', rows.filter(r => r.outsideOpen).map(r => r.name), rows.every(r => !r.outsideOpen), 'none');
  check('f.menu.entrance', w, 'menu entrance motion', rows.map(r => r.name + ':' + (r.anims.filter(a => !/color/.test(a)).length ? 'animated' : 'instant')).join(' '), rows.filter(r => r.name !== 'Method').every(r => r.anims.some(a => /opacity|transform|tool-|menu/.test(a))), 'the shared menu entrance (ruling F18)');
  if(phone) check('f.menu.tap', w, 'disclosure summaries under 44px', rows.filter(r => r.size[1] < 44 || r.size[0] < 44).map(r => r.name + ' ' + r.size.join('x')), rows.every(r => r.size[1] >= 44 && r.size[0] >= 44), '>= 44x44');
  await ctx.close();
}

/* ---------- File > Share, File > New from template ---------- */
export async function shell(env, kind){
  const {check, note} = env.R;
  const w = W(env, kind), phone = kind === 'phone';
  const {ctx, page} = await openFR(env, 'fermi', kind);
  const s = await act(env, page, {id: 'f.share', w, label: 'Share', fn: () => press(page, page.locator('[data-act=share]'), phone), focus: /tool-share|data-act/, skip: ['layoutprops']});
  note('f.share.status', w, 'status after Share', await page.locator('.tool-status').textContent());
  await press(page, page.locator('details.tool-file > summary'), phone); await sleep(150);
  const items = await page.evaluate(() => [...document.querySelectorAll('.tool-file .tool-menu > *')].filter(e => e.getClientRects().length).map(e => e.textContent.trim()));
  note('f.file.items', w, 'File menu items', items);
  check('f.file.startown', w, 'a blank "Start your own" / New and the examples reachable from File (as the other tools)', items, items.some(i => /^New\b|Start/.test(i)) && items.some(i => /Example/.test(i)), 'File offers New/Start your own and Examples');
  await ctx.close();
}

/* ---------- examples (chips in the authoring panel) ---------- */
export async function examples(env, kind){
  const w = W(env, kind), phone = kind === 'phone';
  const {ctx, page} = await openFR(env, 'fermi', kind);
  await openAuthor(page, phone);
  await act(env, page, {id: 'f.example', w, label: 'pick an example (Weekly meeting)', fn: () => press(page, page.locator('#chips .chip', {hasText: 'Weekly'}), phone), focus: /button\.chip/, cls: true});
  await act(env, page, {id: 'f.example.long', w, label: 'pick an example with an additive formula path (Availability chain)', fn: () => press(page, page.locator('#chips .chip', {hasText: 'Availability'}), phone), focus: /button\.chip/, cls: true});
  await ctx.close();
}

/* ---------- light/dark ---------- */
export async function theme(env, kind){
  const w = W(env, kind), phone = kind === 'phone';
  const {ctx, page} = await openFR(env, 'fermi', kind);
  const s = await act(env, page, {id: 'f.theme', w, label: 'toggle light/dark (estimate)', fn: () => press(page, page.locator('.mg-appearance'), phone), focus: /mg-appearance/, cls: true});
  if(M(env) === 'normal') await shot(page, `${env.out}/shots/fermi-dark-${kind}.png`);
  await press(page, page.locator('#modecf'), phone); await waitQuiet(page);
  await act(env, page, {id: 'f.theme.cf', w, label: 'toggle light/dark (cashflow)', fn: () => press(page, page.locator('.mg-appearance'), phone), focus: /mg-appearance/, cls: true});
  await ctx.close();
}

/* ---------- reduced motion: no transition or animation runs anywhere we press ---------- */
export async function reduced(env){
  const {check} = env.R;
  const w = W(env, 'desktop') + '/reduced';
  const {ctx, page} = await openFR(env, 'fermi', 'desktop', {reducedMotion: 'reduce'});
  const all = [];
  for(const sel of ['#viewtree', '#viewdist', '#scentabs .tab', '#editmodel', '#formula', '#returntoreview', '#modecf', '#modeest', '#reviewp50']){
    const loc = page.locator(sel).first();
    const s = await measure(page, async () => { await loc.click(); if(sel === '#formula') await page.keyboard.type(' '); }, {quiet: 300});
    all.push(...s.animations.filter(a => !/color/.test(a)).map(a => sel + ' ' + a));
  }
  check('f.reduced.motion', w, 'non-colour transitions/animations under reduced motion', all.length ? all : 'none', !all.length, 'none');
  await ctx.close();
}

/* ---------- hover / focus / pressed states and tap sizes ---------- */
const FERMI_CONTROLS = ['#scentabs .tab', '#modeest', '#modecf', '#editmodel', '.tile', '.vcopy', '#viewdist', '#viewtree', '#replay', '#copy', '#copydoc', '#png', '#tin', 'details.tool-file > summary', '.tool-share', '#returntoreview', '#chips .chip', '#vrows select', '#vrows input', '#formula'];
export async function controlsFermi(env, kind){
  const {check, note} = env.R;
  const w = W(env, kind);
  const {ctx, page} = await openFR(env, 'fermi', kind);
  await openAuthor(page, kind === 'phone');
  const rows = await stateRows(page, FERMI_CONTROLS);
  if(kind === 'phone'){
    const small = rows.filter(r => r.h < 44 || r.w < 44).map(r => `${r.key} "${r.label}" ${r.w}x${r.h}`);
    const uniq = [...new Set(small.map(s => s.replace(/"[^"]*"/, '').trim()))];
    check('f.controls.tap', w, 'controls under 44x44 on a phone', uniq.length ? small.slice(0, 40) : 'none', !uniq.length, 'every control >= 44x44');
    /* cashflow authoring with the debt panel open */
    await press(page, page.locator('#modecf'), true); await waitQuiet(page);
    await press(page, page.locator('#cfchips .chip', {hasText: 'Geared'}), true); await waitQuiet(page);
    const cfRows = await stateRows(page, ['#cfrows input', '#cfrows .del', '#cfrlo', '#cfrhi', '#cfhorizon', '#cfdebton', '#cfdscr', '#cfrd', '#cften', '#cfcase', '#cftin', '#cfresults details.method > summary']);
    const cfSmall = [...new Set(cfRows.filter(r => r.h < 44 || r.w < 44).map(r => `${r.key} ${r.w}x${r.h}`))];
    check('f.controls.tap.cf', w, 'cashflow controls under 44x44 on a phone', cfSmall.length ? cfSmall : 'none', !cfSmall.length, 'every control >= 44x44');
    const fonts = await page.evaluate(() => ['#cfcase', '#cfdebton'].map(s => s + ':' + getComputedStyle(document.querySelector(s)).fontSize));
    check('f.controls.font.cf', w, 'cashflow form controls under the 16px input floor', fonts.filter(f => parseFloat(f.split(':')[1]) < 16 && !/cfdebton/.test(f)), !fonts.filter(f => parseFloat(f.split(':')[1]) < 16 && !/cfdebton/.test(f)).length, '>= 16px (iOS zooms otherwise)');
    await ctx.close(); return;
  }
  const seenKeys = new Set(), out = [];
  for(const r of rows){ if(seenKeys.has(r.key)) continue; seenKeys.add(r.key); Object.assign(r, await states(page, r)); out.push(r); }
  note('f.controls.states', w, 'hover / focus states', out.map(r => `${r.key}: hover ${r.hoverDelta.join(',') || '-'} | ring ${r.focusRingSpec} | tr ${r.hoverTr}`));
  const silent = out.filter(r => !r.disabled && !r.hoverChanged && !['true', 'on'].includes(r.pressedAttr) && !/input|select|textarea|#formula|#tin/.test(r.key)).map(r => r.key);
  check('f.controls.hover', w, 'controls with no visible hover change', silent.length ? silent : 'none', !silent.length, 'every control changes on hover');
  const ring = out.filter(r => !r.disabled && !r.focusRing).map(r => r.key);
  check('f.controls.focus', w, 'controls with no focus-visible ring', ring.length ? ring : 'none', !ring.length, 'every control shows a ring');
  const tok = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--dur-fast').trim());
  const off = out.filter(r => !/input|select|textarea|#formula|#tin/.test(r.key)).filter(r => { const ms = Math.round(parseFloat((r.hoverTr || '0s').split(' ')[0]) * 1000); return ms !== parseFloat(tok); }).map(r => r.key + ' ' + (r.hoverTr || '').slice(0, 40));
  check('f.controls.timing', w, `controls whose hover transition is not --dur-fast (${tok})`, off.length ? off : 'none', !off.length, 'every control eases at --dur-fast');
  /* pressed (aria) state on the segmented toggles */
  const seg = await page.evaluate(() => ['#modeest', '#modecf', '#viewdist', '#viewtree', '#scentabs .tab'].map(s => { const e = document.querySelector(s); return s + ':' + (e.getAttribute('aria-pressed') ?? e.getAttribute('aria-selected') ?? 'none'); }));
  check('f.controls.pressed', w, 'segment toggles exposing a pressed/selected state', seg, seg.every(x => !/none$/.test(x)), 'every toggle exposes aria-pressed/selected');
  /* motion tokens in the page's own CSS */
  const raw = await page.evaluate(() => { const out = []; for(const sh of document.styleSheets){ let rules; try{ rules = sh.cssRules; }catch(e){ continue; } const walk = rs => { for(const r of rs){ if(r.cssRules) walk(r.cssRules); if(r.style && (r.style.transition || r.style.animation) && !/var\(--dur|var\(--ease/.test(r.style.transition + r.style.animation)) out.push((sh.href || 'inline').split('/').slice(-2).join('/') + ' ' + r.selectorText + ' {' + (r.style.transition || r.style.animation) + '}'); } }; walk(rules); } return out; });
  note('f.controls.rawmotion', w, 'transition/animation declarations not using --dur-*/--ease-* tokens (all sheets on the page)', raw);
  check('f.controls.tokens', w, 'Fermi page CSS declaring motion without the tokens', raw.filter(r => /^inline|fermi/.test(r)), !raw.filter(r => /^inline|fermi/.test(r)).length, 'all motion from --dur-*/--ease-*');
  await ctx.close();
}

/* ---------- touch specifics on the phone ---------- */
export async function touch(env){
  const {check, note} = env.R;
  const w = W(env, 'phone');
  const {ctx, page} = await openFR(env, 'fermi', 'phone');
  const ta = await page.evaluate(() => ['#hist', '.tile', '#viewdist', '#replay', '#tin'].map(s => s + ':' + getComputedStyle(document.querySelector(s)).touchAction + '/' + getComputedStyle(document.querySelector(s)).userSelect));
  note('f.touch.actions', w, 'touch-action / user-select', ta);
  /* vertical swipe starting on the histogram must scroll the page */
  const hb = await box(page, '#hist');
  await page.evaluate(() => scrollTo(0, document.getElementById('hist').getBoundingClientRect().top + scrollY - 300));
  await sleep(150);
  const hb2 = await box(page, '#hist');
  const y0 = await page.evaluate(() => scrollY);
  await touchSwipe(page, {x: hb2.x + hb2.w / 2, y: hb2.y + 100}, {x: hb2.x + hb2.w / 2, y: hb2.y - 100});
  await sleep(400);
  const y1 = await page.evaluate(() => scrollY);
  check('f.touch.histscroll', w, 'vertical swipe on the histogram scrolls the page (px)', y1 - y0, y1 - y0 > 50, '> 50px');
  await ctx.close();
}
