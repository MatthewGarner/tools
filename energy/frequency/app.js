// energy/frequency/app.js
/* DOM shell: sliders → simulate() → animated canvas trace + readouts + verdict.
   Engine and renderer are pure; the DOM lives only here. */
import {simulate, verdict, leverDeltas, GFM_GVAS_PER_GW, HEADROOM_PER_GVAS, F0} from './engine.js';
import {renderTrace, toMarkdown} from './render.js';
import {PRESETS, paramsFromControls} from './state.js';
import {readHashState, writeHashState} from '../../assets/series.js';
import {measure, themeColors, onThemeChange} from '../../assets/app-common.js';
import {wireExports} from '../../assets/exports.js';
import {rafBatched} from '../../assets/schedule.js';

if (typeof document !== 'undefined') boot();

function boot(){
  const $ = id => document.getElementById(id);
  const IDS = ['inertia', 'trip', 'dr', 'dm', 'dc', 'gfm'];
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  let lastSvg = '', rafId = 0, hashTimer = null;
  let lastResult = null, lastParams = null;

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
    for(const el of document.querySelectorAll('input[type=range]')){
      el.style.setProperty('--fill', (el.value - el.min) / (el.max - el.min) * 100 + '%');
    }
  }

  function refresh(animate = true){
    const v = controls();
    syncOutputs(v);
    const p = paramsFromControls(v);
    const result = simulate(p);
    lastResult = result; lastParams = p;
    // readout tiles
    $('t-rocof').textContent = result.rocof.toFixed(2) + ' Hz/s';
    $('t-nadir').textContent = result.nadir.f.toFixed(2) + ' Hz';
    $('t-tnadir').textContent = result.nadir.t.toFixed(1) + ' s';
    $('t-settle').textContent = result.settle.toFixed(2) + ' Hz';
    $('t-shed').textContent = result.shedOccurred ? Math.round(result.shedTotal * 100) + '%' : 'none';
    $('verdict').textContent = verdict(result, p);
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
    lastSvg = renderTrace(result, p, {colors: themeColors(), measure});
    const still = reducedMotion.matches || !animate;
    drawCanvas(result, p, still ? Infinity : 0);   // Infinity = draw fully at once
    clearTimeout(hashTimer);
    hashTimer = setTimeout(() => writeHashState({
      i: v.inertia, tr: v.trip, dr: v.dr, dm: v.dm, dc: v.dc, g: v.gfm}), 400);
  }

  const CANVAS_FONT = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif";

  /* Animate the fall: reveal the trace up to a moving time cursor.
     Annotation set mirrors render.js's renderTrace — keep the two consistent. */
  function drawCanvas(result, p, fromTime){
    cancelAnimationFrame(rafId);
    const cv = $('trace'), dpr = devicePixelRatio || 1;
    const w = cv.clientWidth, h = cv.clientHeight;
    cv.width = w * dpr; cv.height = h * dpr;
    const g = cv.getContext('2d'); g.scale(dpr, dpr);
    const C = themeColors();
    const tEnd = result.t[result.t.length - 1];
    // no-battery counterfactual: only meaningful when a battery is actually active
    const ghost = (p.drMw > 0 || p.dmMw > 0 || p.dcMw > 0 || p.eGfm > 0)
      ? simulate({...p, drMw: 0, dmMw: 0, dcMw: 0, eGfm: 0}) : null;
    // tighter range: 48.8 UFLS always shows with margin; shallow nadirs fill the space;
    // extend to include the ghost's (deeper) dip when present
    const lowNadir = ghost ? Math.min(result.nadir.f, ghost.nadir.f) : result.nadir.f;
    const fMin = Math.min(lowNadir - 0.4, 48.5), fMax = 50.3;
    const x0 = 48, x1 = w - 16, y0 = 14, y1 = h - 24;
    const sx = t => x0 + (t / tEnd) * (x1 - x0);
    const sy = f => y0 + (1 - (f - fMin) / (fMax - fMin)) * (y1 - y0);
    const start = performance.now();
    const DURATION = 2200;   // ms to play the ~30 s fall

    const frame = now => {
      const cursor = fromTime === Infinity ? tEnd : ((now - start) / DURATION) * tEnd;
      g.clearRect(0, 0, w, h);

      // normal band 49.8-50.2 Hz, subtly tinted
      g.globalAlpha = 0.06; g.fillStyle = C.accent;
      g.fillRect(x0, sy(50.2), x1 - x0, sy(49.8) - sy(50.2));
      // sub-48.8 Hz load-shedding zone — the danger floor, washed red
      g.globalAlpha = 0.09; g.fillStyle = C.err;
      g.fillRect(x0, sy(48.8), x1 - x0, y1 - sy(48.8));
      g.globalAlpha = 1;

      // whole-Hz gridlines (50 solid, others faint) + right-aligned left-margin labels
      g.font = '11px ' + CANVAS_FONT; g.textAlign = 'right'; g.textBaseline = 'middle';
      g.lineWidth = 1;
      for(let fi = Math.floor(fMax); fi >= Math.ceil(fMin); fi--){
        g.strokeStyle = C.muted;
        g.globalAlpha = fi === 50 ? 1 : 0.3;
        g.beginPath(); g.moveTo(x0, sy(fi)); g.lineTo(x1, sy(fi)); g.stroke();
        g.globalAlpha = 1;
        g.fillStyle = C.muted;
        g.fillText(String(fi), x0 - 6, sy(fi));
      }
      // right-edge "50 Hz" label on the nominal line
      g.textBaseline = 'alphabetic';
      g.fillStyle = C.muted;
      g.fillText('50 Hz', x1, sy(50) - 6);

      // UFLS line + label
      g.strokeStyle = C.err; g.setLineDash([5, 4]);
      g.beginPath(); g.moveTo(x0, sy(48.8)); g.lineTo(x1, sy(48.8)); g.stroke();
      g.setLineDash([]);
      g.fillStyle = C.err;
      g.fillText('48.8 Hz — load shed', x1, sy(48.8) - 6);

      // ghost: no-battery counterfactual, drawn behind the main trace, static (not animated)
      if(ghost){
        g.globalAlpha = 0.55; g.strokeStyle = C.muted; g.lineWidth = 2; g.setLineDash([6, 4]);
        g.beginPath();
        for(let i = 0; i < ghost.t.length; i++){
          const x = sx(ghost.t[i]), y = sy(ghost.f[i]);
          i === 0 ? g.moveTo(x, y) : g.lineTo(x, y);
        }
        g.stroke();
        g.setLineDash([]); g.globalAlpha = 1;
        g.fillStyle = C.muted; g.textAlign = 'center'; g.textBaseline = 'alphabetic';
        g.fillText('same grid, no battery', sx(ghost.nadir.t), sy(ghost.nadir.f) - 8);
      }

      // trace up to the cursor
      g.strokeStyle = C.accent; g.lineWidth = 2.5; g.beginPath();
      for(let i = 0; i < result.t.length && result.t[i] <= cursor; i++){
        const x = sx(result.t[i]), y = sy(result.f[i]);
        i === 0 ? g.moveTo(x, y) : g.lineTo(x, y);
      }
      g.stroke();

      // nadir marker: only once the cursor has passed it
      if(cursor >= result.nadir.t){
        g.fillStyle = C.ink;
        g.beginPath(); g.arc(sx(result.nadir.t), sy(result.nadir.f), 4, 0, Math.PI * 2); g.fill();
        g.textAlign = 'center';
        g.fillText(`nadir ${result.nadir.f.toFixed(2)} Hz`, sx(result.nadir.t), sy(result.nadir.f) + 18);
      }

      // RoCoF: the initial fall rate, a dashed tangent peeling off the trace at t=0
      if(result.rocof > 0.01){
        const tRc = Math.min(Math.min(1.0, F0 - fMin - 0.2) / result.rocof, tEnd * 0.32);
        const fRc = F0 - result.rocof * tRc;
        g.strokeStyle = C.ink; g.lineWidth = 1.5; g.setLineDash([4, 3]);
        g.beginPath(); g.moveTo(sx(0), sy(F0)); g.lineTo(sx(tRc), sy(fRc)); g.stroke();
        g.setLineDash([]);
        g.fillStyle = C.ink; g.textAlign = 'left';
        g.fillText(`RoCoF ${result.rocof.toFixed(2)} Hz/s`, sx(tRc) + 8, sy(fRc) + 4);
      }

      // x-axis
      g.fillStyle = C.muted;
      g.textAlign = 'left'; g.fillText('0 s', x0, h - 6);
      g.textAlign = 'right'; g.fillText(`${Math.round(tEnd)} s`, x1, h - 6);

      if(cursor < tEnd) rafId = requestAnimationFrame(frame);
    };
    rafId = requestAnimationFrame(frame);
  }

  // wiring
  // sliders: rAF single-flight — a fast drag fires many `input` events per
  // frame, each triggering up to 7 full 3000-step ODE integrations (simulate
  // + leverDeltas's 5x + the ghost); coalesce N events/frame to one refresh.
  // No delay (unlike the 120ms debounce elsewhere) — a slider wants immediacy.
  const scheduleRefresh = rafBatched(() => {
    for(const c of document.querySelectorAll('#presets .chip')) c.classList.remove('on');
    refresh(false);
  });
  for(const id of IDS) $(id).addEventListener('input', scheduleRefresh);
  $('tripbtn').addEventListener('click', () => refresh(true));
  for(const btn of document.querySelectorAll('#presets .chip')){
    btn.addEventListener('click', () => {
      const preset = PRESETS[btn.dataset.preset];
      for(const id of IDS) $(id).value = preset[id];
      for(const c of document.querySelectorAll('#presets .chip')) c.classList.toggle('on', c === btn);
      refresh(true);
    });
  }
  wireExports({
    buttons: {dlsvg: $('dlsvg'), dlpng: $('dlpng'), copypng: $('copypng'), copymd: $('copydoc')},
    getSvg: () => lastSvg,
    getMarkdown: () => toMarkdown(lastResult, lastParams),
    slug: () => 'frequency-inertia',
  });
  onThemeChange(() => refresh(false));
  addEventListener('resize', () => { if(lastResult) drawCanvas(lastResult, lastParams, Infinity); });

  // restore state from the URL, else default (guard s.dr/s.dm for older links
  // saved before those levers existed)
  const s = readHashState();
  if(s){
    $('inertia').value = s.i; $('trip').value = s.tr;
    $('dr').value = s.dr ?? 0; $('dm').value = s.dm ?? 0;
    $('dc').value = s.dc; $('gfm').value = s.g;
  }
  refresh();
}
