/* Feel-audit instruments: one in-page probe (installed before any app script runs)
   plus Node helpers that wrap a real input in a measured window and summarise what
   the page did between the input and the moment it went quiet.

   Every number reported comes from this probe; nothing here asserts. Checks live in
   checks.mjs so an expectation can change without touching the instrument. */
import {chromium, webkit} from '../pw/node_modules/playwright/index.mjs';
import {startServer} from '../pw/session.mjs';
import {deflateRawSync} from 'node:zlib';

export {chromium, webkit, startServer};

export const hashFor = source => 'z:' + deflateRawSync(Buffer.from(JSON.stringify({t: source, e: 0}))).toString('base64url');
export const hashOpen = source => 'z:' + deflateRawSync(Buffer.from(JSON.stringify({t: source}))).toString('base64url');
export const sleep = ms => new Promise(r => setTimeout(r, ms));

export const VIEWPORTS = {
  desktop: {viewport: {width: 1280, height: 800}, deviceScaleFactor: 1},
  phone: {viewport: {width: 375, height: 812}, deviceScaleFactor: 2, isMobile: true, hasTouch: true},
};

/* Installed with addInitScript. Records, continuously:
   frames  [t, scrollHeight, scrollY, previewHeight, hasSvg, previewScrollLeft, focusOnBody]
   lt      long tasks [start, duration]
   ls      layout shifts [start, value, hadRecentInput, sources]
   ev      Event Timing entries [name, start, duration, interactionId]
   anims   transition/animation events [type, t, property|name, target, duration|easing]
   muts    DOM mutations outside the source editor [t, target, kind]
   inputs  [type, t, approxNextPaint] — the paint time is rAF + a posted task */
export function probe(){
  if(window.__feel) return;
  const F = window.__feel = {frames: [], lt: [], ls: [], ev: [], anims: [], muts: [], inputs: [], lastMut: 0, lastAnim: 0, paused: false};
  const describe = node => {
    if(!node || node.nodeType !== 1) node = node && node.parentElement;
    if(!node) return '?';
    const id = node.id ? '#' + node.id : '';
    const cls = node.getAttribute && node.getAttribute('class') ? '.' + String(node.getAttribute('class')).trim().split(/\s+/).slice(0, 2).join('.') : '';
    const data = node.dataset ? Object.keys(node.dataset).slice(0, 2).map(k => '[' + k + ']').join('') : '';
    return node.tagName.toLowerCase() + id + cls + data;
  };
  F.describe = describe;
  const loop = () => {
    const pv = document.getElementById('preview');
    const svg = pv && pv.querySelector('svg');
    F.frames.push([performance.now(), document.documentElement.scrollHeight, scrollY,
      pv ? Math.round(pv.getBoundingClientRect().height) : -1, svg ? 1 : 0, pv ? pv.scrollLeft : 0,
      document.activeElement === document.body || !document.activeElement ? 1 : 0]);
    if(F.frames.length > 30000) F.frames.splice(0, 15000);
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
  const obs = (type, fn, extra = {}) => { try{ new PerformanceObserver(l => l.getEntries().forEach(fn)).observe({type, buffered: true, ...extra}); }catch(e){} };
  obs('longtask', e => F.lt.push([e.startTime, e.duration]));
  obs('layout-shift', e => F.ls.push([e.startTime, e.value, e.hadRecentInput, (e.sources || []).slice(0, 3).map(s => describe(s.node))]));
  obs('event', e => F.ev.push([e.name, e.startTime, e.duration, e.interactionId || 0]), {durationThreshold: 16});
  for(const type of ['transitionrun', 'transitionend', 'transitioncancel', 'animationstart', 'animationend', 'animationcancel']){
    addEventListener(type, e => {
      const t = e.target;
      if(t.closest && t.closest('.cm-editor')) return;
      const cs = getComputedStyle(t);
      const timing = type.startsWith('transition') ? cs.transitionDuration + '|' + cs.transitionTimingFunction : cs.animationDuration + '|' + cs.animationTimingFunction;
      F.anims.push([type, performance.now(), e.propertyName || e.animationName, describe(t), timing]);
      F.lastAnim = performance.now();
    }, true);
  }
  const start = () => new MutationObserver(ms => {
    const now = performance.now();
    for(const m of ms){
      const el = m.target.nodeType === 1 ? m.target : m.target.parentElement;
      if(!el || (el.closest && el.closest('.cm-editor'))) continue;
      F.muts.push([now, describe(el), m.type === 'attributes' ? 'attr:' + m.attributeName : m.type, m.addedNodes && m.addedNodes[0] ? m.addedNodes[0].nodeName.toLowerCase() : '']);
      F.lastMut = now;
    }
    if(F.muts.length > 50000) F.muts.splice(0, 25000);
  }).observe(document, {subtree: true, childList: true, attributes: true, characterData: true});
  start();
  const stamp = e => {
    const rec = [e.type, performance.now(), 0, describe(e.target)];
    F.inputs.push(rec);
    requestAnimationFrame(() => { const ch = new MessageChannel(); ch.port1.onmessage = () => { rec[2] = performance.now(); }; ch.port2.postMessage(0); });
  };
  for(const type of ['pointerdown', 'pointerup', 'keydown', 'click', 'touchstart', 'touchend', 'input']) addEventListener(type, stamp, true);
  /* scroll gestures: stamped for the measurement window only (no paint probe) */
  for(const type of ['wheel', 'touchmove']) addEventListener(type, e => F.inputs.push([e.type, performance.now(), 0, '']), {capture: true, passive: true});
  F.summary = (t0, t1) => {
    t1 = t1 || performance.now();
    const inputs = F.inputs.filter(i => i[1] >= t0 && i[1] <= t1);
    const tIn = inputs.length ? inputs[0][1] : t0;
    const lastIn = inputs.length ? inputs[inputs.length - 1][1] : t0;
    const muts = F.muts.filter(m => m[0] >= tIn && m[0] <= t1);
    const firstMut = muts.length ? muts[0][0] - tIn : null;
    const lastMut = muts.length ? muts[muts.length - 1][0] - tIn : 0;
    /* the card hover dim (an opacity transition on a <g>) answers the pointer sitting still while the artefact repaints under it: not part of the change */
    const anims = F.anims.filter(a => a[1] >= t0 && a[1] <= t1 && !(a[0].startsWith('transition') && a[2] === 'opacity' && /^g(?![a-z])/.test(a[3])));
    const lastAnim = anims.length ? Math.max(...anims.map(a => a[1])) - tIn : 0;
    const settled = Math.max(lastMut, lastAnim, 0);
    const frames = F.frames.filter(f => f[0] >= tIn && f[0] <= Math.max(tIn + Math.max(settled, 50), lastIn) + 34);
    const deltas = [];
    for(let i = 1; i < frames.length; i++) deltas.push(frames[i][0] - frames[i - 1][0]);
    const lt = F.lt.filter(l => l[0] + l[1] >= tIn && l[0] <= t1);
    const ls = F.ls.filter(l => l[0] >= tIn - 5 && l[0] <= t1);
    const ev = F.ev.filter(e => e[1] >= t0 - 5 && e[1] <= t1);
    const heights = [], scrolls = [], empties = [], pvHeights = [], pans = [];
    const all = F.frames.filter(f => f[0] >= tIn - 20 && f[0] <= t1);
    for(let i = 1; i < all.length; i++){
      if(all[i][1] !== all[i - 1][1]) heights.push(Math.round(all[i][0] - tIn) + 'ms:' + (all[i][1] - all[i - 1][1]));
      if(all[i][2] !== all[i - 1][2]) scrolls.push(Math.round(all[i][0] - tIn) + 'ms:' + Math.round(all[i][2] - all[i - 1][2]));
      if(all[i][4] === 0 && all[i - 1][4] === 1) empties.push(Math.round(all[i][0] - tIn));
      if(Math.abs(all[i][3] - all[i - 1][3]) > 1) pvHeights.push(Math.round(all[i][0] - tIn) + 'ms:' + (all[i][3] - all[i - 1][3]));
      if(all[i][5] !== all[i - 1][5]) pans.push(Math.round(all[i][0] - tIn) + 'ms:' + Math.round(all[i][5] - all[i - 1][5]));
    }
    const focusLostFrames = all.filter(f => f[0] > lastIn && f[6] === 1).length;
    const paints = inputs.filter(i => i[2]).map(i => i[2] - i[1]);
    const eventDur = ev.length ? Math.max(...ev.map(e => e[2])) : null;
    const uniq = new Map();
    for(const a of anims) if(a[0] === 'transitionrun' || a[0] === 'animationstart'){
      const k = a[2] + ' @' + a[3].replace(/\[.*$/, '') + ' ' + a[4];
      uniq.set(k, (uniq.get(k) || 0) + 1);
    }
    return {
      inputs: inputs.length, firstInput: inputs[0] ? inputs[0][0] : null,
      nextPaintApprox: paints.length ? Math.round(Math.max(...paints)) : null,
      eventTiming: eventDur, eventNames: [...new Set(ev.map(e => e[0]))],
      firstResponse: firstMut == null ? null : Math.round(firstMut),
      settled: Math.round(settled),
      mutations: muts.length,
      svgSwaps: muts.filter(m => m[2] === 'childList' && /#preview/.test(m[1])).length,
      frames: frames.length, dropped: deltas.filter(d => d > 20).length, worstFrame: deltas.length ? Math.round(Math.max(...deltas)) : 0,
      longTasks: lt.length, longTaskMax: lt.length ? Math.round(Math.max(...lt.map(l => l[1]))) : 0, longTaskTotal: Math.round(lt.reduce((s, l) => s + l[1], 0)),
      cls: +ls.reduce((s, l) => s + l[1], 0).toFixed(4), clsNoInput: +ls.filter(l => !l[2]).reduce((s, l) => s + l[1], 0).toFixed(4),
      shiftSources: [...new Set(ls.flatMap(l => l[3]))].slice(0, 6),
      heightJumps: heights.slice(0, 12), scrollJumps: scrolls.slice(0, 12), previewHeightJumps: pvHeights.slice(0, 12), pans: pans.slice(0, 6),
      emptyFrames: empties.slice(0, 6),
      animations: [...uniq.entries()].map(([k, n]) => n + 'x ' + k),
      layoutAnimated: [...uniq.keys()].filter(k => /^(width|height|grid-template-columns|top|left|right|bottom|margin|padding|max-height|min-height)/.test(k)),
      focusLostFrames,
      active: describe(document.activeElement),
    };
  };
}

/* Wait until nothing in the page has mutated or animated for `quiet` ms and no
   finite animation is running. Bounded; returns whether it actually settled. */
export async function waitQuiet(page, {quiet = 300, max = 5000} = {}){
  return page.waitForFunction(q => {
    const F = window.__feel; if(!F) return true;
    const now = performance.now();
    const running = document.getAnimations().filter(a => {
      if(a.playState !== 'running') return false;
      const t = a.effect && a.effect.getComputedTiming ? a.effect.getComputedTiming() : null;
      if(t && t.iterations === Infinity) return false;
      if(a.animationName === 'tool-late') return false;
      const tgt = a.effect && a.effect.target;
      return !(tgt && tgt.closest && tgt.closest('.cm-editor'));
    }).length;
    return !running && now - Math.max(F.lastMut, F.lastAnim) > q;
  }, quiet, {timeout: max, polling: 40}).then(() => true).catch(() => false);
}

/* Run `act` (real inputs) inside a measured window. Returns the probe summary plus
   whether the page went quiet before `max`. */
export async function measure(page, act, {quiet = 300, max = 5000, pre = 0} = {}){
  if(pre) await sleep(pre);
  const t0 = await page.evaluate(() => performance.now());
  await act();
  /* give a reaction that arrives after the input (a clipboard write, a debounced pass) time to begin: without this a page
     that was already quiet reads as "quiet" before anything has happened, and the window below comes out empty */
  await sleep(Math.min(quiet, 250));
  const quietOk = await waitQuiet(page, {quiet, max});
  const t1 = await page.evaluate(() => performance.now());
  const s = await page.evaluate(([a, b]) => window.__feel.summary(a, b), [t0, Math.max(t1 - quiet + 30, t0 + Math.min(quiet, 250))]);
  s.quiet = quietOk;
  return s;
}

export async function newPage(browser, kind, {throttle = 1, reducedMotion = 'no-preference', colorScheme = 'light', engine = 'chromium'} = {}){
  const ctx = await browser.newContext({...VIEWPORTS[kind], reducedMotion, colorScheme,
    ...(engine === 'chromium' ? {permissions: ['clipboard-read', 'clipboard-write']} : {})});
  await ctx.addInitScript(probe);
  const page = await ctx.newPage();
  page.setDefaultTimeout(8000);
  const errors = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if(m.type() === 'error') errors.push('console: ' + m.text().slice(0, 200)); });
  if(engine === 'chromium' && throttle > 1){
    const cdp = await ctx.newCDPSession(page);
    await cdp.send('Emulation.setCPUThrottlingRate', {rate: throttle});
  }
  page.__errors = errors;
  return {ctx, page, errors};
}

/* Ready = fonts loaded, an svg in the preview, and the page quiet. */
export async function ready(page){
  await page.waitForFunction(() => {
    const fs = document.getElementById('fontstatus');
    return document.querySelector('#preview svg') && (!fs || fs.hidden);
  }, null, {timeout: 15000});
  await waitQuiet(page, {quiet: 400, max: 6000});
}

export async function openTool(page, base, tool, source){
  await page.goto(base + '/' + tool + '/' + (source ? '#' + hashFor(source) : ''), {waitUntil: 'load'});
  await ready(page);
}

/* Read the live CodeMirror document. */
export async function sourceText(page){
  return page.evaluate(async () => {
    const {EditorView} = await import('/assets/vendor/codemirror.js');
    return EditorView.findFromDOM(document.querySelector('.cm-editor')).state.doc.toString();
  });
}

/* Real mouse drag with realistic intermediate moves. */
export async function mouseDrag(page, from, to, {steps = 18, hold = 30} = {}){
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await sleep(hold);
  for(let i = 1; i <= steps; i++){
    await page.mouse.move(from.x + (to.x - from.x) * i / steps, from.y + (to.y - from.y) * i / steps);
    await sleep(16);
  }
  await page.mouse.up();
}

/* Real touch swipe via CDP (Chromium only): touchStart, intermediate touchMoves, touchEnd. */
export async function touchSwipe(page, from, to, {steps = 12} = {}){
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Input.dispatchTouchEvent', {type: 'touchStart', touchPoints: [{x: from.x, y: from.y}]});
  for(let i = 1; i <= steps; i++){
    await cdp.send('Input.dispatchTouchEvent', {type: 'touchMove', touchPoints: [{x: from.x + (to.x - from.x) * i / steps, y: from.y + (to.y - from.y) * i / steps}]});
    await sleep(16);
  }
  await cdp.send('Input.dispatchTouchEvent', {type: 'touchEnd', touchPoints: []});
  await cdp.detach();
}

/* Tap: a real touch on a phone context, a real mouse click elsewhere. */
export async function press(page, locatorOrPoint, phone){
  let p = locatorOrPoint;
  if(typeof locatorOrPoint.boundingBox === 'function'){
    await locatorOrPoint.scrollIntoViewIfNeeded().catch(() => {});
    const b = await locatorOrPoint.boundingBox();
    if(!b) throw new Error('press: target has no box');
    p = {x: b.x + b.width / 2, y: b.y + b.height / 2};
  }
  if(phone) await page.touchscreen.tap(p.x, p.y);
  else await page.mouse.click(p.x, p.y);
  return p;
}

export async function shot(page, path, opts = {}){
  try{ await page.screenshot({path, ...opts}); }catch(e){}
  return path;
}

/* Capture a frame strip: n screenshots ~every `gap` ms while `act` runs. */
export async function frameStrip(page, act, path, {n = 6, gap = 60, clip} = {}){
  const shots = [];
  const p = act();
  for(let i = 0; i < n; i++){
    shots.push(await page.screenshot({clip, type: 'png'}).catch(() => null));
    await sleep(gap);
  }
  await p;
  return shots.filter(Boolean);
}
