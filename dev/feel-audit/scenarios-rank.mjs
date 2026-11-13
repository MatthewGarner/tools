/* Feel scenarios for Rank. Each opens its own page, drives real input and records checks
   (ids r.<scenario>.<what>). Expectations are the 2026-11-13 rulings (see checks.mjs BAR). */
import {measure, waitQuiet, sleep, press, shot, touchSwipe, newPage} from './lib.mjs';
import {BAR} from './checks.mjs';
import {where, isBody, paint, openFR, readyFR, armUntil, until, window_, now, box, act, stateRows, caretEnd} from './fr-lib.mjs';
import {states} from './controls.mjs';

const M = env => env.mode === 'cpu4x' ? 'cpu4x' : 'normal';
const W = (env, kind) => where('rank', kind, env.mode, env.engine);
const LT = env => M(env) === 'normal' ? 50 : 150;
const order = page => page.evaluate(() => [...document.querySelectorAll('#rrows .rrow')].map(r => r.dataset.itemIdx).join(','));
/* record each replacement of the result rows (an innerHTML render) */
const renderCounter = page => page.evaluate(() => {
  window.__rr = []; new MutationObserver(ms => { for(const m of ms) if(m.target.id === 'rrows' && m.addedNodes.length > 1) window.__rr.push(Math.round(performance.now())); }).observe(document.getElementById('rrows'), {childList: true});
});
const renders = page => page.evaluate(() => window.__rr.slice());

/* a long saved link: twelve initiatives */
export const LONG = {c: [['Value', 3], ['Time criticality', 2], ['Risk reduction', 1]], e: ['Effort', 1], k: 4, w: 50, s: 1,
  i: Array.from({length: 12}, (_, n) => ['Initiative ' + (n + 1), 1 + (n * 7) % 9, 1 + (n * 5) % 9, 1 + (n * 3) % 9, 2 + (n * 4) % 8])};

/* ---------- first load ---------- */
export async function load(env, kind, {hash, label = ''} = {}){
  const {check, note} = env.R;
  const w = W(env, kind) + (label ? '/' + label : '');
  const {ctx, page, errors} = await newPage(env.browser, kind, {throttle: env.throttle, engine: env.engine});
  await page.addInitScript(() => {
    window.__fl = {rows: [], kicker: null};
    new MutationObserver(ms => {
      for(const m of ms) if(m.target.id === 'rrows' && m.addedNodes.length) window.__fl.rows.push(Math.round(performance.now()));
      const k = document.getElementById('kicker');
      if(k && k.textContent && window.__fl.kicker == null) window.__fl.kicker = Math.round(performance.now());
    }).observe(document, {subtree: true, childList: true, characterData: true});
  });
  await page.goto(env.base + '/rank/' + (hash ? '#' + hash : ''), {waitUntil: 'load'});
  await readyFR(page, 'rank');
  await waitQuiet(page, {quiet: 500, max: 8000});
  const s = await page.evaluate(() => { const F = window.__feel; const s = F.summary(0, performance.now() - 450); s.fl = window.__fl; s.fcp = Math.round(performance.getEntriesByName('first-contentful-paint')[0]?.startTime || 0); return s; });
  note('r.load', w, 'first load', {fcp: s.fcp, rowsRendered: s.fl.rows, kicker: s.fl.kicker, cls: s.cls, shiftSources: s.shiftSources, longTasks: s.longTasks, longTaskMax: s.longTaskMax, heightJumps: s.heightJumps, anims: s.animations});
  check('r.load.cls', w, 'layout shift during load', s.cls, s.cls <= 0.05, '<= 0.05');
  check('r.load.renders', w, 'result-row renders during load', s.fl.rows.length, s.fl.rows.length <= 1, '1');
  check('r.load.first', w, 'ranked rows on screen (ms from navigation)', s.fl.rows[0], s.fl.rows[0] <= (M(env) === 'normal' ? 1200 : 3000), M(env) === 'normal' ? '<= 1200ms' : '<= 3000ms');
  check('r.load.longtask', w, 'longest task during load', s.longTaskMax, s.longTaskMax <= (M(env) === 'normal' ? 200 : 600), M(env) === 'normal' ? '<= 200ms' : '<= 600ms');
  check('r.load.kicker', w, 'kicker text present at first contentful paint', {kicker: s.fl.kicker, fcp: s.fcp}, s.fl.kicker != null && s.fl.kicker <= s.fcp + 25, 'in the first painted frame (the observer batches after the parse: 25ms of allowance; a script-painted kicker lands 30-60ms later)');
  if(M(env) === 'normal' && !label) check('r.load.errors', w, 'console errors', errors, errors.length === 0, 'none');
  if(M(env) === 'normal' && !label) await shot(page, `${env.out}/shots/rank-load-${kind}${env.engine === 'webkit' ? '-webkit' : ''}.png`);
  await ctx.close();
}

/* ---------- edit a score: keystroke -> re-ranked rows; the re-order motion ---------- */
export async function score(env, kind){
  const {check, note} = env.R;
  const w = W(env, kind), phone = kind === 'phone';
  const {ctx, page} = await openFR(env, 'rank', kind);
  await renderCounter(page);
  const o0 = await order(page);
  /* the top initiative's Value 8 -> 1 drops it down the list */
  const inp = page.locator('#rows tr').first().locator('input.score').first();
  await inp.scrollIntoViewIfNeeded();
  await press(page, inp, phone);
  await page.keyboard.press('ControlOrMeta+a');
  await armUntil(page, `() => window.__rr.length > 0`, {timeout: 4000});
  const t0 = await now(page);
  const s = await measure(page, () => page.keyboard.type('1'), {quiet: 400});
  const k = await until(page);
  const o1 = await order(page);
  const flips = s.animations.filter(a => /transform/.test(a));
  note('r.score.edit', w, 'type a score that re-orders the list', {keyToRows: k, order: [o0, o1], longTaskMax: s.longTaskMax, renders: await renders(page), anims: s.animations, heightJumps: s.heightJumps, scrollJumps: s.scrollJumps, cls: s.cls, active: s.active, paint: paint(s)});
  check('r.score.keyrender', w, 'score keystroke -> re-ranked rows painted', k, k > 0 && k <= BAR.keyRender[M(env)], '<= ' + BAR.keyRender[M(env)] + 'ms');
  check('r.score.paint', w, 'score keystroke -> next paint', paint(s), paint(s) <= BAR.paint[M(env)], '<= ' + BAR.paint[M(env)] + 'ms');
  check('r.score.longtask', w, 'longest task after a score edit (16,000-run simulation)', s.longTaskMax, s.longTaskMax <= LT(env), '<= ' + LT(env) + 'ms');
  check('r.score.reorder', w, 'rows re-ordered by a score edit move to their new places with motion', {orderChanged: o0 !== o1, motion: flips.length ? flips : 'none: rows replaced in place (hard cut)'}, o0 !== o1 && flips.length > 0, 'the rows glide (the FLIP the slider path already uses), off under reduced motion');
  check('r.score.focus', w, 'focus after the edit re-ranks', s.active, /input\.score/.test(s.active), 'stays in the score field');
  check('r.score.jump', w, 'page height / scroll jumps on a re-rank', {heightJumps: s.heightJumps, scrollJumps: s.scrollJumps, cls: s.cls}, !s.scrollJumps.length && s.cls <= 0.05, 'no scroll jump, cls <= 0.05');
  /* commit (Tab): a second, identical render? */
  const r0 = (await renders(page)).length;
  const c = await measure(page, () => page.keyboard.press('Tab'), {quiet: 300});
  const r1 = (await renders(page)).length;
  check('r.score.commit', w, 'extra full renders when the edited field is left (change event) with nothing changed', r1 - r0, r1 - r0 === 0, '0 (nothing changed)');
  note('r.score.commitcost', w, 'leaving the field', {longTaskMax: c.longTaskMax, active: c.active});
  /* phone: the edited field relative to the on-screen keyboard and to the result it moves */
  if(phone){
    const pos = await page.evaluate(() => { const r = document.getElementById('rrows').getBoundingClientRect(); return {resultsTop: Math.round(r.top), vh: innerHeight}; });
    await waitQuiet(page, {quiet: 300});
    const rd = await page.evaluate(() => { const el = document.getElementById('liveread'), r = el.getBoundingClientRect(); return {on: el.classList.contains('on'), vis: getComputedStyle(el).visibility, text: el.querySelector('button').textContent, top: Math.round(r.top), h: Math.round(r.height), live: el.getAttribute('aria-live')}; });
    check('r.score.phone.visible', w, 'the re-ranked list is visible while editing a score on a phone (the list itself, or the pinned cut line)', {...pos, readout: rd}, pos.resultsTop < pos.vh * 0.55 || rd.on, 'some of the ranking above the keyboard, or its pinned readout');
    check('r.score.readout', w, 'phone: the pinned readout names the top-k in order, sits at the top, polite, >= 44px', rd, rd.on && rd.top === 0 && rd.h >= 44 && /^Top \d+: .+/.test(rd.text) && rd.live === 'polite', 'visible, top 0, "Top k: names in order"');
    const orderNow = await page.evaluate(() => [...document.querySelectorAll('#rrows .nmtext')].slice(0, 3).map(e => e.textContent.trim()).join(' · '));
    check('r.score.readout.order', w, 'the readout lists the same initiatives, in the same order, as the ranking', {readout: rd.text, rows: orderNow}, rd.text.endsWith(orderNow), 'matches the first k rows');
  } else {
    const rd = await page.evaluate(() => ({on: document.getElementById('liveread').classList.contains('on'), vis: getComputedStyle(document.getElementById('liveread')).display === 'none' ? 'hidden' : getComputedStyle(document.getElementById('liveread')).visibility}));
    check('r.score.readout.desktop', w, 'desktop: the pinned readout never appears', rd, !rd.on && rd.vis === 'hidden', 'hidden');
  }
  /* rapid: three different scores within 150ms */
  const r2 = (await renders(page)).length;
  await press(page, inp, phone); await page.keyboard.press('ControlOrMeta+a');
  await page.keyboard.type('9'); await sleep(50); await page.keyboard.press('ControlOrMeta+a'); await page.keyboard.type('3'); await sleep(50); await page.keyboard.press('ControlOrMeta+a'); await page.keyboard.type('7');
  await waitQuiet(page, {quiet: 500});
  const r3 = (await renders(page)).length;
  const final = await page.evaluate(() => document.querySelector('#rows tr input.score').value);
  check('r.score.rapid', w, 'three edits within 150ms: renders and final value', {renders: r3 - r2, final}, r3 - r2 <= 2 && final === '7', 'coalesced (<= 2 renders), ends on 7');
  if(M(env) === 'normal') await shot(page, `${env.out}/shots/rank-score-${kind}.png`);
  await ctx.close();
}

/* ---------- names: initiative and criterion ---------- */
export async function names(env, kind){
  const {check, note} = env.R;
  const w = W(env, kind), phone = kind === 'phone';
  const {ctx, page} = await openFR(env, 'rank', kind);
  const nm = page.locator('#rows .iname').first();
  await press(page, nm, phone); await caretEnd(page);
  await armUntil(page, `() => document.querySelector('#rrows .nmtext').textContent.endsWith('x') || [...document.querySelectorAll('#rrows .nmtext')].some(e => e.textContent.endsWith('x'))`, {timeout: 3000});
  const s = await measure(page, () => page.keyboard.type('x'), {quiet: 300});
  const k = await until(page);
  check('r.name.keyrender', w, 'initiative-name keystroke -> result row label updated', k, k > 0 && k <= BAR.paint[M(env)], '<= ' + BAR.paint[M(env)] + 'ms');
  check('r.name.longtask', w, 'longest task on a name keystroke', s.longTaskMax, s.longTaskMax <= LT(env), '<= ' + LT(env) + 'ms');
  if(!phone){
    const cn = page.locator('#headrow .cname').first();
    await cn.click(); await caretEnd(page);
    const c = await measure(page, async () => { for(const ch of 'abc'){ await page.keyboard.type(ch); await sleep(80); } }, {quiet: 300});
    note('r.name.criterion', w, 'criterion-name typing (rebuilds the input table per key)', {paint: c.nextPaintApprox, longTaskMax: c.longTaskMax, mutations: c.mutations, active: c.active});
    check('r.name.criterion.focus', w, 'focus while renaming a criterion', c.active, /input\.cname/.test(c.active), 'stays in the criterion name');
    check('r.name.criterion.paint', w, 'criterion-name keystroke -> next paint', c.nextPaintApprox, c.nextPaintApprox <= BAR.paint[M(env)], '<= ' + BAR.paint[M(env)] + 'ms');
  } else {
    const can = await page.evaluate(() => [...document.querySelectorAll('#wstrip .wsname, #wstrip .wsnum')].filter(e => e.getClientRects().length && e.getBoundingClientRect().width).length);
    check('r.name.criterion.phone', w, 'criterion name and weight-number fields reachable on a phone', can, can > 0, 'renaming criteria and typing a weight possible at 375px');
    const wn = page.locator('#wstrip .wsnum').nth(1), wsn = page.locator('#wstrip .wsname').nth(1);
    await wsn.scrollIntoViewIfNeeded(); await press(page, wsn, true); await page.keyboard.press('ControlOrMeta+a'); await page.keyboard.type('Urgency');
    await press(page, wn, true); await page.keyboard.press('ControlOrMeta+a'); await page.keyboard.type('9');
    await waitQuiet(page, {quiet: 500});
    const done = await page.evaluate(() => ({name: document.querySelectorAll('#headrow .cname')[1].value, weight: document.querySelectorAll('#headrow .weight')[1].value, cell: document.querySelector('#rows td:nth-child(3)').dataset.label}));
    check('r.name.criterion.phone.typed', w, 'on a phone a criterion is renamed and a weight typed, and the page follows', done, done.name === 'Urgency' && done.weight === '9' && done.cell === 'Urgency', 'renamed to Urgency, weight 9, the table label follows');
  }
  await ctx.close();
}

/* thumb centre of a range input */
const thumb = (page, sel, nth = 0) => page.evaluate(([sel, nth]) => {
  const e = document.querySelectorAll(sel)[nth]; e.scrollIntoView({block: 'center'});
  const r = e.getBoundingClientRect(), f = (e.value - e.min) / (e.max - e.min);
  return {x: r.left + 8 + f * (r.width - 16), y: r.top + r.height / 2, w: r.width, value: e.value, max: e.max};
}, [sel, nth]);
/* per-frame sampler while dragging: the slider's y, the first result row's y, scroll, the row order */
const dragSampler = (page, sel) => page.evaluate(sel => {
  window.__ds = []; window.__dsOn = true;
  const loop = () => { const s = document.querySelector(sel); const rows = [...document.querySelectorAll('#rrows .rrow')];
    window.__ds.push([Math.round(performance.now()), Math.round(s.getBoundingClientRect().top), Math.round(scrollY), rows.map(r => r.dataset.itemIdx).join(''), Math.round(document.documentElement.scrollHeight), document.getElementById('results').classList.contains('pending') ? 1 : 0]);
    if(window.__dsOn) requestAnimationFrame(loop); };
  requestAnimationFrame(loop);
}, sel);
const dragStop = page => page.evaluate(() => { window.__dsOn = false; return window.__ds; });

/* ---------- weight slider drag: live re-rank under the finger ---------- */
export async function slider(env, kind){
  const {check, note} = env.R;
  const w = W(env, kind), phone = kind === 'phone';
  const {ctx, page} = await openFR(env, 'rank', kind);
  await renderCounter(page);
  const sel = phone ? '#wstrip .wslider' : '#headrow .wslider';
  const nth = 1;   // Time criticality
  const th = await thumb(page, sel, nth);
  await sleep(200);
  const th2 = await thumb(page, sel, nth);
  const o0 = await order(page);
  await dragSampler(page, `${phone ? '#wstrip .wsrow' : '#headrow th'}:nth-of-type(${phone ? nth + 1 : nth + 2}) .wslider`);
  const t0 = await now(page);
  const to = {x: th2.x + th2.w * 0.55, y: th2.y + 2};
  if(phone && env.engine !== 'webkit') await touchSwipe(page, th2, to, {steps: 20});   /* WebKit has no CDP touch: mouse on the phone layout there */
  else{
    await page.mouse.move(th2.x, th2.y); await page.mouse.down(); await sleep(30);
    for(let i = 1; i <= 24; i++){ await page.mouse.move(th2.x + (to.x - th2.x) * i / 24, th2.y + (i % 2)); await sleep(16); }
    await sleep(200);   // hold at the end of the drag
    await page.mouse.up();
  }
  const tUp = await now(page);
  await waitQuiet(page, {quiet: 400});
  const t2 = await now(page);
  const ds = await dragStop(page);
  const during = ds.filter(f => f[0] >= t0 && f[0] <= tUp), after = ds.filter(f => f[0] > tUp);
  const dw = await window_(page, t0, tUp), rw = await window_(page, tUp, t2);
  const val = await page.evaluate(([s, n]) => document.querySelectorAll(s)[n].value, [sel, nth]);
  const sY = during.map(f => f[1]), y0 = sY[0];
  const reorders = new Set(during.map(f => f[3])).size - 1;
  const sliderMovedDuring = Math.max(...sY.map(y => Math.abs(y - y0)));
  const sliderMovedAfter = after.length ? Math.max(...after.map(f => Math.abs(f[1] - y0))) : 0;
  const scrollDuring = Math.max(...during.map(f => Math.abs(f[2] - during[0][2])));
  const sel2 = await page.evaluate(() => String(getSelection()).length);
  const anims = await page.evaluate(([a, b]) => window.__feel.anims.filter(x => x[1] >= a && x[1] <= b && x[0] === 'transitionrun').map(x => x[2] + '@' + x[3].split('.')[0] + ' ' + x[4]), [t0, t2]);
  const uniqAnims = [...new Set(anims)];
  const rr = await renders(page);
  note('r.slider.drag', w, 'drag a weight slider', {valueBefore: th2.value, valueAfter: val, max: th2.max, orders: [o0, await order(page)], reordersDuringDrag: reorders, dragFrames: dw, release: rw, sliderMovedDuring, sliderMovedAfter, scrollDuring, selection: sel2, anims: uniqAnims, rendersAfterRelease: rr.filter(t => t > tUp).length, pendingFrames: during.filter(f => f[5]).length + '/' + during.length, heightDuring: [...new Set(during.map(f => f[4]))], heightAfter: [...new Set(after.map(f => f[4]))]});
  check('r.slider.value', w, 'slider follows the drag', {before: th2.value, after: val}, val !== th2.value, 'value changes');
  check('r.slider.frames', w, 'missed frames (gaps >34ms) / longest task while dragging', {missed: dw.missed, over20ms: dw.dropped, worst: dw.worstFrame, frames: dw.frames, longTaskMax: dw.longTaskMax}, dw.missed <= (M(env) === 'normal' ? 0 : 3) && dw.longTaskMax <= LT(env), M(env) === 'normal' ? '0 missed, no task > 50ms' : '<= 3 missed, no task > 150ms');
  check('r.slider.live', w, 'the list re-orders live during the drag', reorders, reorders >= 1, '>= 1 re-order before release');
  check('r.slider.underfinger', w, 'slider moves on screen while being dragged (px)', sliderMovedDuring, sliderMovedDuring <= 1, '0: the thing under the finger stays put');
  check('r.slider.release', w, 'slider moves on screen after release (the full re-simulation re-lays out the panel, px)', sliderMovedAfter, sliderMovedAfter <= 1, '0');
  check('r.slider.releasetask', w, 'longest task at release (full simulation)', rw.longTaskMax, rw.longTaskMax <= LT(env), '<= ' + LT(env) + 'ms');
  check('r.slider.releasecls', w, 'layout shift / page-height change after release', {cls: rw.cls, heightAfter: [...new Set(after.map(f => f[4]))]}, rw.cls <= 0.05, '<= 0.05');
  check('r.slider.page', w, 'page scroll / text selection during the drag', {scrollDuring, selection: sel2}, scrollDuring === 0 && !sel2, 'no scroll, nothing selected');
  check('r.slider.motion', w, 'row motion during the live re-rank', uniqAnims.length ? uniqAnims.slice(0, 6) : 'none', uniqAnims.some(a => /transform/.test(a)) && !uniqAnims.some(a => /^(width|height|top|left|margin)/.test(a)), 'rows glide on transform, no layout property animates');
  if(M(env) === 'normal'){
    const tok = uniqAnims.filter(a => /transform/.test(a));
    check('r.slider.tokens', w, 'FLIP glide timing vs the motion tokens (--dur-base 200ms / --dur-slow 320ms, --ease-out)', tok.slice(0, 3), tok.every(a => /0\.2s|0\.32s/.test(a)), 'a token duration');
    await shot(page, `${env.out}/shots/rank-slider-${kind}.png`);
  }
  /* keyboard: arrow keys on the slider (desktop) */
  if(!phone){
    await page.locator(sel).nth(nth).focus();
    const kb = await measure(page, async () => { for(let i = 0; i < 4; i++){ await page.keyboard.press('ArrowLeft'); await sleep(60); } }, {quiet: 700, max: 3000});
    note('r.slider.keys', w, 'arrow keys on a slider', {paint: kb.nextPaintApprox, longTaskMax: kb.longTaskMax, settled: kb.settled, active: kb.active});
    check('r.slider.keys.longtask', w, 'longest task when stepping a slider with arrow keys (each step can commit)', kb.longTaskMax, kb.longTaskMax <= LT(env), '<= ' + LT(env) + 'ms');
    check('r.slider.keys.focus', w, 'focus after arrow-key steps and the commit', kb.active, /wslider/.test(kb.active), 'stays on the slider');
  }
  await ctx.close();
}

/* ---------- typed weight box ---------- */
export async function weightBox(env, kind){
  const {check, note} = env.R;
  const w = W(env, kind);
  const {ctx, page} = await openFR(env, 'rank', kind);
  await renderCounter(page);
  const b = page.locator('#headrow .weight').nth(1);
  await b.click(); await page.keyboard.press('ControlOrMeta+a');
  const s = await measure(page, async () => { await page.keyboard.type('6'); }, {quiet: 800, max: 3000});
  note('r.weightbox', w, 'type a weight', {paint: paint(s), longTaskMax: s.longTaskMax, anims: s.animations, renders: await renders(page), settled: s.settled, active: s.active});
  check('r.weightbox.paint', w, 'weight keystroke -> next paint', paint(s), paint(s) <= BAR.paint[M(env)], '<= ' + BAR.paint[M(env)] + 'ms');
  check('r.weightbox.longtask', w, 'longest task after a typed weight (live re-rank, then simulation 600ms later)', s.longTaskMax, s.longTaskMax <= LT(env), '<= ' + LT(env) + 'ms');
  check('r.weightbox.focus', w, 'focus after typing a weight', s.active, /input\.weight/.test(s.active), 'stays in the weight box');
  await ctx.close();
}

/* ---------- add / remove / undo ---------- */
export async function addRemove(env, kind){
  const {check} = env.R;
  const w = W(env, kind), phone = kind === 'phone';
  const {ctx, page} = await openFR(env, 'rank', kind);
  const a = await act(env, page, {id: 'r.add', w, label: 'Add initiative', fn: () => press(page, page.locator('#addrow'), phone), focus: /input\.iname/, skip: ['longtask']});
  check('r.add.longtask', w, 'longest task after Add', a.longTaskMax, a.longTaskMax <= LT(env), '<= ' + LT(env) + 'ms');
  const pos = await page.evaluate(() => { const r = document.activeElement.getBoundingClientRect(); return {top: Math.round(r.top), bottom: Math.round(r.bottom), vh: innerHeight}; });
  check('r.add.visible', w, 'new row\'s name field on screen' + (phone ? ' and above where the keyboard would be' : ''), pos, pos.top >= 0 && pos.bottom <= pos.vh * (phone ? 0.55 : 1), phone ? 'bottom <= 55% of the viewport' : 'within the viewport');
  check('r.add.motion', w, 'the added row\'s entrance', a.animations.filter(x => !/color/.test(x)).length ? a.animations : 'none', a.animations.some(x => /opacity|transform/.test(x)), 'recorded: an entrance (the Roadmap audit left this open, add.motion)');
  const del = page.locator('#rows .del').nth(1);
  await del.scrollIntoViewIfNeeded();   // the tap's own scroll-into-view belongs before the measured window
  const r = await act(env, page, {id: 'r.remove', w, label: 'remove an initiative', fn: () => press(page, del, phone), focus: /Undo removal|button\.btn/, cls: true, skip: ['longtask']});
  check('r.remove.longtask', w, 'longest task after remove', r.longTaskMax, r.longTaskMax <= LT(env), '<= ' + LT(env) + 'ms');
  const place = await page.evaluate(() => { const u = document.querySelector('#rows .undorow button'); if(!u) return null; const r = u.getBoundingClientRect(), rows = [...document.querySelectorAll('#rows tr')]; return {atIndex: rows.indexOf(u.closest('tr')), rows: rows.length, top: Math.round(r.top), vh: innerHeight}; });
  check('r.remove.undoinplace', w, 'the Undo removal control appears in the removed row\'s place (second row), on screen', place, !!place && place.atIndex === 1 && place.top >= 0 && place.top < place.vh, 'row 2 of the table, in view');
  const undo = page.locator('button', {hasText: 'Undo removal'});
  await act(env, page, {id: 'r.undo', w, label: 'Undo removal', fn: () => press(page, undo, phone), focus: /input\.iname/, cls: true, skip: ['longtask']});
  await ctx.close();
}

/* ---------- paste from spreadsheet ---------- */
export async function paste(env, kind){
  const {check} = env.R;
  const w = W(env, kind), phone = kind === 'phone';
  const {ctx, page} = await openFR(env, 'rank', kind);
  const o = await act(env, page, {id: 'r.paste.open', w, label: 'Paste from spreadsheet', fn: () => press(page, page.locator('#pastebtn'), phone), focus: /textarea#pastearea/});
  check('r.paste.open.motion', w, 'paste box entrance', o.animations.length ? o.animations : 'none: display toggles', true, 'recorded');
  await page.keyboard.insertText('Alpha\t8\t7\t5\t6\nBeta\t3\t4\t9\t2\nGamma\t6\t6\t6\t6\nDelta\t9\t2\t3\t8');
  const topBefore = await page.evaluate(() => document.querySelector('.tblwrap').getBoundingClientRect().top);
  const imp = await act(env, page, {id: 'r.paste.import', w, label: 'Import', fn: () => press(page, page.locator('#pastego'), phone), focus: /input\.iname/});
  const topAfter = await page.evaluate(() => document.querySelector('.tblwrap').getBoundingClientRect().top);
  check('r.paste.import.anchor', w, 'nothing above the imported rows moves: the table keeps its place on screen (px moved)', Math.round(topAfter - topBefore), Math.abs(topAfter - topBefore) <= 1, '<= 1px');
  check('r.paste.import.scroll', w, 'the page does not scroll on Import', imp.scrollJumps, !imp.scrollJumps.length, 'no scroll');
  check('r.paste.import.firstrow', w, 'focus moves to the first imported row', await page.evaluate(() => ({active: document.activeElement.className, value: document.activeElement.value})), await page.evaluate(() => document.activeElement.className === 'iname' && document.activeElement.value === 'Alpha'), 'the name field of Alpha');
  /* a second Paste press closes the box */
  await press(page, page.locator('#pastebtn'), phone); await sleep(100);
  await page.keyboard.press('Escape'); await sleep(100);
  const open = await page.evaluate(() => document.getElementById('pastebox').classList.contains('open'));
  check('r.paste.escape', w, 'Escape closes the open paste box', open, !open, 'closed');
  await ctx.close();
}

/* ---------- capacity, wobble ---------- */
async function typedNumber(env, page, w, id, sel, text, phone, label){
  const {check, note} = env.R;
  await renderCounter(page);
  const inp = page.locator(sel);
  await inp.scrollIntoViewIfNeeded();
  await press(page, inp, phone);
  await page.keyboard.press('ControlOrMeta+a');
  await armUntil(page, `() => window.__rr.length > 0`, {timeout: 4000});
  const s = await measure(page, () => page.keyboard.type(text), {quiet: 400});
  const k = await until(page);
  note(id, w, label, {keyToRows: k, paint: paint(s), longTaskMax: s.longTaskMax, heightJumps: s.heightJumps, scrollJumps: s.scrollJumps, cls: s.cls, active: s.active});
  check(id + '.keyrender', w, label + ': keystroke -> result painted', k, k > 0 && k <= BAR.keyRender[M(env)], '<= ' + BAR.keyRender[M(env)] + 'ms');
  check(id + '.longtask', w, label + ': longest task', s.longTaskMax, s.longTaskMax <= LT(env), '<= ' + LT(env) + 'ms');
  check(id + '.jump', w, label + ': scroll jumps / layout shift', {scrollJumps: s.scrollJumps, cls: s.cls, heightJumps: s.heightJumps}, !s.scrollJumps.length && s.cls <= 0.05, 'none');
  check(id + '.focus', w, label + ': focus', s.active, new RegExp(sel.replace('#', 'input#')).test(s.active), 'stays in the field');
}
export async function capacity(env, kind){
  const w = W(env, kind);
  const {ctx, page} = await openFR(env, 'rank', kind);
  await typedNumber(env, page, w, 'r.capacity', '#kin', '2', kind === 'phone', 'capacity (top k)');
  await ctx.close();
}
export async function wobble(env, kind){
  const w = W(env, kind);
  const {ctx, page} = await openFR(env, 'rank', kind);
  await typedNumber(env, page, w, 'r.wobble.w', '#ww', '90', kind === 'phone', 'weight wobble');
  await typedNumber(env, page, w, 'r.wobble.s', '#sw', '2', kind === 'phone', 'score wobble');
  await ctx.close();
}

/* ---------- Do two orders agree? ---------- */
export async function orders(env, kind){
  const {check, note} = env.R;
  const w = W(env, kind), phone = kind === 'phone';
  const {ctx, page} = await openFR(env, 'rank', kind);
  const a = page.locator('#oda'), b = page.locator('#odb');
  await press(page, a, phone);
  await page.keyboard.insertText('One\nTwo\nThree\nFour\nFive');
  await press(page, b, phone);
  await page.keyboard.insertText('Three\nOne\nFive\nTwo\nFou');
  await waitQuiet(page);
  await armUntil(page, `() => (window.__od0 ??= document.getElementById('odverdict').textContent) !== document.getElementById('odverdict').textContent`, {timeout: 3000});
  const s = await measure(page, () => page.keyboard.type('r'), {quiet: 400});
  const k = await until(page);
  note('r.orders', w, 'type the last character that completes a match', {keyToVerdict: k, paint: paint(s), longTaskMax: s.longTaskMax, cls: s.cls, heightJumps: s.heightJumps, scrollJumps: s.scrollJumps, active: s.active, verdict: (await page.locator('#odverdict').textContent()).slice(0, 80)});
  check('r.orders.keyrender', w, 'order keystroke -> agreement verdict updated', k, k > 0 && k <= BAR.keyRender[M(env)], '<= ' + BAR.keyRender[M(env)] + 'ms');
  check('r.orders.jump', w, 'scroll jumps while typing an order', s.scrollJumps, !s.scrollJumps.length, 'none');
  check('r.orders.focus', w, 'focus while typing an order', s.active, /textarea#odb/.test(s.active), 'stays in the textarea');
  if(M(env) === 'normal') await shot(page, `${env.out}/shots/rank-orders-${kind}.png`, {fullPage: false});
  await ctx.close();
}

/* ---------- copy ---------- */
export async function copies(env, kind){
  const {check, note} = env.R;
  const w = W(env, kind), phone = kind === 'phone';
  const {ctx, page} = await openFR(env, 'rank', kind);
  const out = {};
  for(const [id, sel] of [['r.copy.markdown', '#copydoc'], ['r.copy.verdict', '.vcopy']]){
    const btn = page.locator(sel);
    await btn.scrollIntoViewIfNeeded();
    const orig = (await btn.textContent()).trim();
    const s = await act(env, page, {id, w, label: 'copy ' + sel, fn: () => press(page, btn, phone), focus: null, skip: ['layoutprops'], cls: true});
    const flash = (await btn.textContent()).trim();
    await press(page, btn, phone); await sleep(700); await press(page, btn, phone); await sleep(2600);
    const after = (await btn.textContent()).trim();
    out[id] = {orig, flash, after, longTaskMax: s.longTaskMax};
    check(id + '.confirm', w, 'confirmation shown and returns to the original label (also after repeated presses)', {orig, flash, after}, flash !== orig && after === orig, 'flashes, then back to "' + orig + '"');
    check(id + '.focus', w, 'focus after copying', s.active, !isBody(s.active), 'stays on the button');
  }
  note('r.copy.all', w, 'copy labels', out);
  await ctx.close();
}

/* ---------- File: New, Examples, Share; the menu ---------- */
export async function shell(env, kind){
  const {check, note} = env.R;
  const w = W(env, kind), phone = kind === 'phone';
  const {ctx, page} = await openFR(env, 'rank', kind);
  const file = page.locator('details.tool-file > summary');
  await press(page, file, phone); await sleep(150);
  const r = await page.evaluate(() => [...document.querySelectorAll('.tool-file .tool-menu > *')].filter(e => e.getClientRects().length).map(e => { const b = e.getBoundingClientRect(); return e.textContent.trim().slice(0, 20) + '@' + Math.round(b.left) + '..' + Math.round(b.right); }));
  const off = r.filter(x => { const [l, rr] = x.split('@')[1].split('..').map(Number); return l < 0 || rr > (phone ? 375 : 1280); });
  check('r.file.onscreen', w, 'File menu items outside the viewport', off.length ? off : 'none', !off.length, 'none');
  await press(page, page.locator('[data-act=examples]'), phone); await sleep(150);
  const ex = page.locator('[data-shell-examples-list] button').nth(1);
  if(await ex.count()){
    await act(env, page, {id: 'r.example', w, label: 'File > Examples > second example', fn: () => press(page, ex, phone), focus: null, cls: true});
  } else check('r.example.ran', w, 'examples listed', 0, false, '>= 2 examples');
  await press(page, file, phone); await sleep(150);
  await act(env, page, {id: 'r.new', w, label: 'File > New (start your own)', fn: () => press(page, page.locator('[data-act=new]'), phone), focus: /input\.iname|summary/, cls: true});
  await page.keyboard.press('Escape');
  await act(env, page, {id: 'r.share', w, label: 'Share', fn: () => press(page, page.locator('[data-act=share]'), phone), focus: /tool-share|data-act/, skip: ['layoutprops']});
  note('r.share.status', w, 'status after Share', await page.locator('.tool-status').textContent());
  await ctx.close();
}

/* ---------- light/dark ---------- */
export async function theme(env, kind){
  const w = W(env, kind), phone = kind === 'phone';
  const {ctx, page} = await openFR(env, 'rank', kind);
  await act(env, page, {id: 'r.theme', w, label: 'toggle light/dark', fn: () => press(page, page.locator('.mg-appearance'), phone), focus: /mg-appearance/, cls: true});
  if(M(env) === 'normal') await shot(page, `${env.out}/shots/rank-dark-${kind}.png`, {fullPage: true});
  await ctx.close();
}

/* ---------- reduced motion ---------- */
export async function reduced(env){
  const {check} = env.R;
  const w = W(env, 'desktop') + '/reduced';
  const {ctx, page} = await openFR(env, 'rank', 'desktop', {reducedMotion: 'reduce'});
  const th = await thumb(page, '#headrow .wslider', 1);
  const s = await measure(page, async () => { await page.mouse.move(th.x, th.y); await page.mouse.down(); for(let i = 1; i <= 16; i++){ await page.mouse.move(th.x + th.w * 0.5 * i / 16, th.y); await sleep(16); } await page.mouse.up(); }, {quiet: 400});
  const a = s.animations.filter(x => !/color/.test(x));
  check('r.reduced.motion', w, 'non-colour transitions under reduced motion while dragging a weight', a.length ? a : 'none', !a.length, 'none');
  await ctx.close();
}

/* ---------- hover / focus / pressed; tap sizes ---------- */
const RANK_CONTROLS = ['#addrow', '#pastebtn', '#copydoc', '.vcopy', 'details.tool-file > summary', '.tool-share', '#rows .del', '#rows .iname', '#rows .score', '#kin', '#ww', '#sw', '.wslider', '#headrow .cname', '#headrow .weight', '#oda'];
export async function controlsRank(env, kind){
  const {check, note} = env.R;
  const w = W(env, kind);
  const {ctx, page} = await openFR(env, 'rank', kind);
  const rows = await stateRows(page, RANK_CONTROLS);
  if(kind === 'phone'){
    const small = rows.filter(r => r.h < 44 || r.w < 44).map(r => `${r.key} "${r.label}" ${r.w}x${r.h}`);
    const kinds = [...new Set(rows.filter(r => r.h < 44 || r.w < 44).map(r => r.key + ' ' + r.w + 'x' + r.h))];
    check('r.controls.tap', w, 'controls under 44x44 on a phone', kinds.length ? kinds : 'none', !kinds.length, 'every control >= 44x44');
    await ctx.close(); return;
  }
  const seen = new Set(), out = [];
  for(const r of rows){ if(seen.has(r.key)) continue; seen.add(r.key); Object.assign(r, await states(page, r)); out.push(r); }
  note('r.controls.states', w, 'hover / focus states', out.map(r => `${r.key}: hover ${r.hoverDelta.join(',') || '-'} | ring ${r.focusRingSpec} | tr ${r.hoverTr}`));
  const silent = out.filter(r => !r.disabled && !r.hoverChanged && !/score|#kin|#ww|#sw|weight|#oda|wslider/.test(r.key)).map(r => r.key);
  check('r.controls.hover', w, 'controls with no visible hover change', silent.length ? silent : 'none', !silent.length, 'every control changes on hover');
  const ring = out.filter(r => !r.disabled && !r.focusRing).map(r => r.key);
  check('r.controls.focus', w, 'controls with no focus-visible ring', ring.length ? ring : 'none', !ring.length, 'every control shows a ring');
  const tok = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--dur-fast').trim());
  const off = out.filter(r => !/score|#kin|#ww|#sw|weight|#oda|wslider|iname|cname/.test(r.key)).filter(r => Math.round(parseFloat((r.hoverTr || '0s').split(' ')[0]) * 1000) !== parseFloat(tok)).map(r => r.key + ' ' + (r.hoverTr || '').slice(0, 40));
  check('r.controls.timing', w, `controls whose hover transition is not --dur-fast (${tok})`, off.length ? off : 'none', !off.length, 'every control eases at --dur-fast');
  const raw = await page.evaluate(() => { const out = []; for(const sh of document.styleSheets){ let rules; try{ rules = sh.cssRules; }catch(e){ continue; } const walk = rs => { for(const r of rs){ if(r.cssRules) walk(r.cssRules); if(r.style && (r.style.transition || r.style.animation) && !/var\(--dur|var\(--ease/.test(r.style.transition + r.style.animation)) out.push((sh.href || 'inline').split('/').slice(-2).join('/') + ' ' + r.selectorText + ' {' + (r.style.transition || r.style.animation) + '}'); } }; walk(rules); } return out; });
  note('r.controls.rawmotion', w, 'transition/animation declarations not using the tokens (all sheets)', raw);
  check('r.controls.tokens', w, 'Rank page CSS and the shared FLIP declaring motion without the tokens', raw.filter(r => /^inline|motion\.css/.test(r)), !raw.filter(r => /^inline|motion\.css/.test(r)).length, 'all motion from --dur-*/--ease-*');
  await ctx.close();
}
