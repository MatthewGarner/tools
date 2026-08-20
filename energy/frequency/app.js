// energy/frequency/app.js
/* DOM shell: sliders → simulate() → animated canvas trace + readouts + verdict.
   Engine and renderer are pure; the DOM lives only here. */
import {simulate, verdict, verdictFigure, leverDeltas, GFM_GVAS_PER_GW, HEADROOM_PER_GVAS} from './engine.js';
import {renderTraceScene, toMarkdown} from './render.js';
import {buildTraceScene} from './scene.js';
import {paintTraceScene} from './canvas.js';
import {PRESETS, paramsFromControls} from './state.js';
import {readHashState, writeHashState} from '../../assets/series.js';
import {measure, themeColors, onThemeChange} from '../../assets/app-common.js';
import {wireExports} from '../../assets/exports.js';
import {paintKicker, paintMetrics, paintVerdict, wireCopyVerdict} from '../../assets/verdict.js';
import {traceMotionMode} from './interaction.js';

if (typeof document !== 'undefined') boot();

async function boot(){
  const $ = id => document.getElementById(id);
  const IDS = ['inertia', 'trip', 'dr', 'dm', 'dc', 'gfm'];
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  let lastSvg = '', rafId = 0, inputRaf = 0, hashTimer = null, resizeRaf = 0;
  let lastResult = null, lastParams = null, lastScene = null;

  // hot-path DOM queries: both node lists are static (fixed markup, no
  // dynamically added/removed sliders or preset chips) — cache once at
  // boot instead of re-querying on every input/render (batch 7).
  const rangeInputs = [...document.querySelectorAll('input[type=range]')];
  const presetChips = [...document.querySelectorAll('#presets .chip')];

  const controls = () => Object.fromEntries(IDS.map(id => [id, +$(id).value]));

  function syncOutputs(v){
    $('inertiaout').textContent = v.inertia + ' GVA·s';
    $('tripout').textContent = v.trip.toFixed(1) + ' GW';
    $('drout').textContent = v.dr === 0 ? 'none' : v.dr.toFixed(1) + ' GW';
    $('dmout').textContent = v.dm === 0 ? 'none' : v.dm.toFixed(1) + ' GW';
    $('dcout').textContent = v.dc === 0 ? 'none' : v.dc.toFixed(1) + ' GW';
    const gfmCap = GFM_GVAS_PER_GW * Math.max(1, v.dr + v.dm + v.dc);
    $('gfmout').textContent = v.gfm === 0 ? 'none'
      : v.gfm > gfmCap ? gfmCap + ' GVA·s (capped)' : v.gfm + ' GVA·s';
    $('govout').textContent = (HEADROOM_PER_GVAS * v.inertia).toFixed(2) + ' GW';
    const gfmEff = Math.min(v.gfm, gfmCap);
    const eff = v.inertia + gfmEff;
    $('effinertia').textContent = `${v.inertia} synchronous + ${gfmEff} grid-forming = ${eff} GVA·s`;
    for(const el of rangeInputs){
      el.style.setProperty('--fill', (el.value - el.min) / (el.max - el.min) * 100 + '%');
    }
  }

  function refresh(animate = true){
    const v = controls();
    syncOutputs(v);
    const p = paramsFromControls(v);
    const result = simulate(p);
    lastResult = result; lastParams = p; lastScene = buildTraceScene(result, p);
    // readout tiles
    $('t-rocof').textContent = result.rocof.toFixed(2) + ' Hz/s';
    $('t-nadir').textContent = result.nadir.f.toFixed(2) + ' Hz';
    $('t-tnadir').textContent = result.nadir.t.toFixed(1) + ' s';
    $('t-settle').textContent = result.settle.toFixed(2) + ' Hz';
    $('t-shed').textContent = result.shedOccurred ? Math.round(result.shedTotal * 100) + '%' : 'none';
    const verdictCopy = verdict(result, p);
    paintVerdict($('verdict'), verdictCopy, verdictFigure(result));
    /* metrics: the three numbers that decide the fall — what was lost, what
       inertia is left to resist it, and how much fast response is contracted.
       Counts only (no model title): the grid here is the sliders, not a document. */
    const gfmCapM = GFM_GVAS_PER_GW * Math.max(1, v.dr + v.dm + v.dc);
    paintMetrics($('metrics'), '', [
      `${v.trip.toFixed(1)} GW trip`,
      `${v.inertia + Math.min(v.gfm, gfmCapM)} GVA·s effective inertia`,
      `${(v.dr + v.dm + v.dc).toFixed(1)} GW dynamic response`,
    ]);
    const hasBattery = p.drMw > 0 || p.dmMw > 0 || p.dcMw > 0 || p.eGfm > 0;
    if(hasBattery){
      const d = leverDeltas(p);
      // named clauses for each active service, in fastest-to-slowest order; the
      // verb ("lifts the nadir") appears once, on the first active clause —
      // later clauses read as a continuation of the same list
      const services = [
        {mw: p.dcMw, name: 'Dynamic Containment', delta: d.dc, suffix: ''},
        {mw: p.dmMw, name: 'Dynamic Moderation', delta: d.dm, suffix: ''},
        {mw: p.drMw, name: 'Dynamic Regulation', delta: d.dr, suffix: ' (slow — mostly after the nadir)'},
      ].filter(s => s.mw > 0);
      let text = '';
      if(services.length){
        text = services.map((s, i) =>
          (i === 0 ? `${s.name} lifts the nadir ` : `${s.name} `) +
          s.delta.nadir.toFixed(2) + ' Hz' + s.suffix
        ).join(' · ') + '.';
      }
      if(p.eGfm > 0){
        text += (text ? ' ' : '') + `Grid-forming eases the slope ${Math.abs(d.gfm.rocof).toFixed(2)} Hz/s.`;
      }
      $('deltas').textContent = text;
    } else {
      $('deltas').textContent = '';
    }
    lastSvg = renderTraceScene(lastScene, {colors: themeColors(), measure}, {ariaLabel: verdictCopy, footer: verdictCopy});
    const still = traceMotionMode({reduced: reducedMotion.matches, hidden: document.hidden, animate}) === 'still';
    drawCanvas(lastScene, still ? Infinity : 0, still);   // Infinity = draw fully at once
    clearTimeout(hashTimer);
    hashTimer = setTimeout(() => writeHashState({
      i: v.inertia, tr: v.trip, dr: v.dr, dm: v.dm, dc: v.dc, g: v.gfm}), 400);
  }

  /* Animate only the primary trace. Scene construction (including the one
     counterfactual) happened in refresh; each frame merely maps that scene. */
  function drawCanvas(scene, fromTime, immediate = false){
    cancelAnimationFrame(rafId);
    const cv = $('trace'), dpr = devicePixelRatio || 1;
    const w = cv.clientWidth, h = cv.clientHeight;
    if(w <= 64 || h <= 38) return;
    cv.width = w * dpr; cv.height = h * dpr;
    const g = cv.getContext('2d'); g.scale(dpr, dpr);
    const start = performance.now();
    const frame = now => {
      const cursor = fromTime === Infinity ? scene.time.end : ((now - start) / 2200) * scene.time.end;
      paintTraceScene(scene, g, w, h, cursor, themeColors());
      if(cursor < scene.time.end) rafId = requestAnimationFrame(frame);
    };
    if(immediate) frame(performance.now());
    else {
      /* Establish the explanatory frame before relying on the next browser
         tick. Under a busy tab, a delayed first rAF must not skip straight
         from controls to an already-complete incident. */
      paintTraceScene(scene, g, w, h, 0, themeColors());
      rafId = requestAnimationFrame(frame);
    }
  }

  // wiring
  // sliders: rAF single-flight — a fast drag fires many `input` events per
  // frame, each triggering up to 7 full 3000-step ODE integrations (simulate
  // + leverDeltas's 5x + the ghost); coalesce N events/frame to one refresh.
  // No delay (unlike the 120ms debounce elsewhere) — a slider wants immediacy.
  const scheduleRefresh = () => {
    for(const c of presetChips){ c.classList.remove('on'); c.setAttribute('aria-pressed', 'false'); }
    if(inputRaf) return;
    inputRaf = requestAnimationFrame(() => { inputRaf = 0; refresh(false); });
  };
  const ensureFresh = () => {
    if(!inputRaf) return;
    cancelAnimationFrame(inputRaf); inputRaf = 0;
    refresh(false);
  };
  for(const id of IDS) $(id).addEventListener('input', scheduleRefresh);
  $('tripbtn').addEventListener('click', () => refresh(true));
  for(const btn of presetChips){
    btn.addEventListener('click', () => {
      const preset = PRESETS[btn.dataset.preset];
      for(const id of IDS) $(id).value = preset[id];
      for(const c of presetChips){
        const selected = c === btn;
        c.classList.toggle('on', selected);
        c.setAttribute('aria-pressed', String(selected));
      }
      refresh(true);
    });
  }
  for(const c of presetChips) c.setAttribute('aria-pressed', String(c.classList.contains('on')));
  wireExports({
    buttons: {dlsvg: $('dlsvg'), dlpng: $('dlpng'), copypng: $('copypng'), copymd: $('copydoc')},
    getSvg: () => { ensureFresh(); return lastSvg; },
    getMarkdown: () => { ensureFresh(); return toMarkdown(lastResult, lastParams); },
    slug: () => 'frequency-inertia',
  });
  onThemeChange(() => refresh(false));
  // resize fires many times per frame during a drag-resize — coalesce to one
  // settled repaint per frame (cancel any pending, schedule one), same idiom
  // as the slider's inputRaf single-flight above. reducedMotion's own 'change'
  // is rarer and must win immediately over any resize still in flight: cancel
  // whatever's pending and paint the final frame synchronously right there.
  addEventListener('resize', () => {
    if(!lastResult) return;
    if(resizeRaf) cancelAnimationFrame(resizeRaf);
    resizeRaf = requestAnimationFrame(() => { resizeRaf = 0; drawCanvas(lastScene, Infinity, true); });
  });
  reducedMotion.addEventListener('change', () => {
    if(resizeRaf){ cancelAnimationFrame(resizeRaf); resizeRaf = 0; }
    if(lastScene) drawCanvas(lastScene, Infinity, true);
  });
  document.addEventListener('visibilitychange', () => {
    if(document.hidden) cancelAnimationFrame(rafId);
    else { if(inputRaf){ cancelAnimationFrame(inputRaf); inputRaf = 0; } refresh(false); }
  });

  // restore state from the URL, else default (guard s.dr/s.dm for older links
  // saved before those levers existed)
  const s = await readHashState();
  if(s){
    $('inertia').value = s.i; $('trip').value = s.tr;
    $('dr').value = s.dr ?? 0; $('dm').value = s.dm ?? 0;
    $('dc').value = s.dc; $('gfm').value = s.g;
  }
  /* masthead + kicker: static page furniture, painted once (Swiss 6c) */
  const mh = $('mhdate');
  if(mh) mh.textContent = new Date().toLocaleDateString('en-GB', {day: 'numeric', month: 'short', year: 'numeric'});
  paintKicker($('kicker'), 'E3', 'The grid catching itself');
wireCopyVerdict($('verdict'));
  $('kicker').append(' · Ember series');

  refresh();
}
