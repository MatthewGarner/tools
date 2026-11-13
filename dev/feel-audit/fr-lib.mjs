/* Shared helpers for the Fermi and Rank feel scenarios. These two pages are DOM tools (no
   #preview svg, no source editor), so they get their own ready predicate; the probe,
   measure() and the check registry are the Roadmap/Timeline harness's own (lib.mjs). */
import {newPage, waitQuiet, sleep, hashFor} from './lib.mjs';

export const where = (tool, kind, mode, engine = 'chromium') => `${tool}/${kind}/${mode}${engine === 'webkit' ? '/webkit' : ''}`;
export const isBody = a => /^body\b/.test(a || '') || a === '?' || /^main#main/.test(a || '');
export const paint = s => Math.max(s.eventTiming || 0, s.nextPaintApprox || 0);

/* Ready = fonts settled and the tool's first result on screen, then quiet. */
export async function readyFR(page, tool){
  await page.waitForFunction(t => {
    if(document.fonts && document.fonts.status !== 'loaded') return false;
    if(t === 'fermi'){
      const cf = document.getElementById('cfresults');
      if(cf && !cf.hidden) return !!document.querySelector('#cfwrap svg');
      return getComputedStyle(document.getElementById('results')).display !== 'none' || getComputedStyle(document.getElementById('ph')).display !== 'none';
    }
    return document.querySelectorAll('#rrows .rrow').length > 0 || getComputedStyle(document.getElementById('ph')).display !== 'none';
  }, tool, {timeout: 15000});
  await waitQuiet(page, {quiet: 400, max: 6000});
}

export async function openFR(env, tool, kind, {state, reducedMotion, colorScheme, hash} = {}){
  const p = await newPage(env.browser, kind, {throttle: env.throttle, engine: env.engine, reducedMotion, colorScheme});
  const h = hash || (state ? hashOpen(state) : '');
  await p.page.goto(env.base + '/' + tool + '/' + (h ? '#' + h : ''), {waitUntil: 'load'});
  await readyFR(p.page, tool);
  return p;
}
/* model hashes (Fermi and Rank store a plain JSON object, compressed like every tool) */
import {deflateRawSync} from 'node:zlib';
export const hashOpen = obj => 'z:' + deflateRawSync(Buffer.from(JSON.stringify(obj))).toString('base64url');
export {hashFor};

/* Time from a real keystroke/click to the moment `pred` first holds, measured in-page:
   arm() installs a listener for the next input event, then polls `pred` every frame. */
export async function armUntil(page, predSrc, {event = 'keydown', timeout = 6000} = {}){
  await page.evaluate(([src, ev, to]) => {
    const pred = new Function('return (' + src + ')()');
    window.__until = new Promise(res => {
      let t0 = 0;
      addEventListener(ev, () => { t0 = performance.now(); }, {once: true, capture: true});
      const start = performance.now();
      const tick = () => {
        if(t0 && pred()){ const ch = new MessageChannel(); ch.port1.onmessage = () => res(Math.round(performance.now() - t0)); ch.port2.postMessage(0); return; }
        if(performance.now() - start > to) return res(-1);
        requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });
  }, [predSrc, event, timeout]);
}
export const until = page => page.evaluate(() => window.__until);

/* Long tasks and frame gaps between two in-page timestamps */
export async function window_(page, t0, t1){
  return page.evaluate(([a, b]) => {
    const F = window.__feel;
    const lt = F.lt.filter(l => l[0] + l[1] >= a && l[0] <= b);
    const fr = F.frames.filter(f => f[0] >= a && f[0] <= b);
    const d = []; for(let i = 1; i < fr.length; i++) d.push(fr[i][0] - fr[i - 1][0]);
    return {longTasks: lt.length, longTaskMax: lt.length ? Math.round(Math.max(...lt.map(l => l[1]))) : 0, longTaskTotal: Math.round(lt.reduce((s, l) => s + l[1], 0)),
      frames: fr.length, dropped: d.filter(x => x > 20).length, missed: d.filter(x => x > 34).length, worstFrame: d.length ? Math.round(Math.max(...d)) : 0,
      cls: +F.ls.filter(l => l[0] >= a && l[0] <= b).reduce((s, l) => s + l[1], 0).toFixed(4)};
  }, [t0, t1]);
}
/* a pour is canvas-only (no DOM mutation), so quiet is not done: wait for its overlay to go */
export const pourDone = (page, max = 10000) => page.waitForFunction(() => !document.querySelector('.histwrap canvas:not(#hist)'), null, {timeout: max, polling: 50}).then(() => true).catch(() => false);
/* caret to the end of the focused field (End does not move the caret in a field on macOS Chromium) */
export const caretEnd = page => page.evaluate(() => { const e = document.activeElement; if(e && 'setSelectionRange' in e){ try{ e.setSelectionRange(e.value.length, e.value.length); }catch(_){} } });
export const now = page => page.evaluate(() => performance.now());

/* the element's box in viewport coordinates */
export const box = (page, sel) => page.evaluate(s => { const e = document.querySelector(s); if(!e) return null; const r = e.getBoundingClientRect(); return {x: r.x, y: r.y, w: r.width, h: r.height, cx: r.x + r.width / 2, cy: r.y + r.height / 2}; }, sel);

/* every visible interactive control, with its size, font size and touch-action */
export async function controlsOf(page){
  return page.evaluate(() => {
    const sel = 'button, a[href], select, input, textarea, summary, canvas#hist, [tabindex]:not([tabindex="-1"]), [role="button"], [role="tab"]';
    const seen = new Set(), out = [];
    for(const el of document.querySelectorAll(sel)){
      if(seen.has(el)) continue; seen.add(el);
      if(el.closest('.mg-masthead, .mg-footer, .about')) continue;
      const r = el.getBoundingClientRect(), cs = getComputedStyle(el);
      if(!r.width || !r.height || cs.visibility === 'hidden') continue;
      const closed = el.closest('details:not([open])');
      if(closed && !(el.tagName === 'SUMMARY' && el.parentElement === closed)) continue;
      const name = (el.getAttribute('aria-label') || el.textContent || el.placeholder || el.id || '').trim().replace(/\s+/g, ' ').slice(0, 40);
      out.push({tag: el.tagName.toLowerCase() + (el.type && el.tagName === 'INPUT' ? ':' + el.type : ''), id: el.id || '', cls: (el.getAttribute('class') || '').split(/\s+/)[0], name,
        w: Math.round(r.width), h: Math.round(r.height), y: Math.round(r.y + scrollY), font: parseFloat(cs.fontSize), touchAction: cs.touchAction, disabled: !!el.disabled});
    }
    return out;
  });
}

export {sleep, waitQuiet};

/* One measured discrete action with the standard checks:
   paint   input -> next paint <= BAR.paint
   feedback first DOM change <= 100ms (cpu4x 200ms)
   longtask longest task <= 50ms (cpu4x 150ms)
   cls     layout shift <= 0.05 (only where nothing is meant to move: opt in)
   focus   active element after the action (regex), or at least not <body>/<main> */
import {measure} from './lib.mjs';
import {BAR} from './checks.mjs';
export async function act(env, page, {id, w, label, fn, focus, cls = false, quiet = 300, max = 5000, skip = []}){
  const {check, note} = env.R;
  const s = await measure(page, fn, {quiet, max});
  const m = env.mode === 'cpu4x' ? 'cpu4x' : 'normal';
  note(id, w, label, {paint: paint(s), firstResponse: s.firstResponse, settled: s.settled, longTaskMax: s.longTaskMax, dropped: s.dropped, worstFrame: s.worstFrame,
    cls: s.cls, heightJumps: s.heightJumps, scrollJumps: s.scrollJumps, anims: s.animations, layoutAnimated: s.layoutAnimated, active: s.active, quiet: s.quiet});
  if(!skip.includes('paint')) check(id + '.paint', w, label + ': input -> next paint', paint(s), paint(s) <= BAR.paint[m], '<= ' + BAR.paint[m] + 'ms');
  if(!skip.includes('feedback')) check(id + '.feedback', w, label + ': first visible change after the input', s.firstResponse, s.firstResponse != null && s.firstResponse <= (m === 'normal' ? 100 : 200), '<= ' + (m === 'normal' ? 100 : 200) + 'ms');
  if(!skip.includes('longtask')) check(id + '.longtask', w, label + ': longest task', s.longTaskMax, s.longTaskMax <= (m === 'normal' ? 50 : 150), '<= ' + (m === 'normal' ? 50 : 150) + 'ms');
  const post = s.scrollJumps.filter(j => !j.startsWith('-'));
  if(cls) check(id + '.cls', w, label + ': layout shift / page-height jumps (scrolls after the input)', {cls: s.cls, heightJumps: s.heightJumps, scrollJumps: post}, s.cls <= 0.05 && !post.length, 'cls <= 0.05 and no scroll jump');
  if(!skip.includes('layoutprops')) check(id + '.layoutprops', w, label + ': layout properties animated', s.layoutAnimated.length ? s.layoutAnimated : 'none', !s.layoutAnimated.length, 'none (transform/opacity only)');
  if(focus !== null && !skip.includes('focus')){
    const ok = focus ? focus.test(s.active) : !isBody(s.active);
    check(id + '.focus', w, label + ': focus afterwards (frames on body after the input)', s.active + ' (' + s.focusLostFrames + ' frames on body)', ok, focus ? 'matches ' + focus : 'not lost to body/main');
  }
  return s;
}

/* hover / focus-visible / pressed states for a list of selectors, from real input */
export async function stateRows(page, sels){
  return page.evaluate(sels => {
    const rows = [];
    let i = 0;
    for(const sel of sels) for(const el of document.querySelectorAll(sel)){
      const r = el.getBoundingClientRect();
      if(!r.width || !r.height || el.closest('details:not([open])') && el.tagName !== 'SUMMARY') continue;
      if(el.hasAttribute('data-ctl-probe')) continue;
      el.setAttribute('data-ctl-probe', i);
      rows.push({idx: i++, key: sel, label: (el.getAttribute('aria-label') || el.textContent || el.id).trim().slice(0, 24), disabled: !!el.disabled,
        pressedAttr: el.getAttribute('aria-pressed') || el.getAttribute('aria-selected') || (el.classList.contains('on') ? 'on' : ''),
        h: Math.round(r.height), w: Math.round(r.width)});
    }
    return rows;
  }, sels);
}
