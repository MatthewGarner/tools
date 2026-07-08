// energy/frequency/app.js
/* DOM shell: sliders → simulate() → animated canvas trace + readouts + verdict.
   Engine and renderer are pure; the DOM lives only here. */
import {simulate, verdict} from './engine.js';
import {renderTrace, toMarkdown} from './render.js';
import {PRESETS, paramsFromControls} from './state.js';
import {readHashState, writeHashState} from '../../assets/series.js';
import {measure, themeColors, onThemeChange} from '../../assets/app-common.js';
import {wireExports} from '../../assets/exports.js';

if (typeof document !== 'undefined') boot();

function boot(){
  const $ = id => document.getElementById(id);
  const IDS = ['inertia', 'trip', 'dc', 'dcspeed', 'gfm'];
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  let lastSvg = '', rafId = 0, hashTimer = null;

  const controls = () => Object.fromEntries(IDS.map(id => [id, +$(id).value]));

  function syncOutputs(v){
    $('inertiaout').textContent = v.inertia + ' GVA·s';
    $('tripout').textContent = v.trip.toFixed(1) + ' GW';
    $('dcout').textContent = v.dc === 0 ? 'none' : v.dc.toFixed(1) + ' GW';
    $('dcspeedout').textContent = v.dcspeed.toFixed(1) + ' s';
    $('gfmout').textContent = v.gfm === 0 ? 'none' : v.gfm + ' GVA·s';
    for(const el of document.querySelectorAll('input[type=range]')){
      el.style.setProperty('--fill', (el.value - el.min) / (el.max - el.min) * 100 + '%');
    }
  }

  function refresh(){
    const v = controls();
    syncOutputs(v);
    const p = paramsFromControls(v);
    const result = simulate(p);
    // readout tiles
    $('t-rocof').textContent = result.rocof.toFixed(2) + ' Hz/s';
    $('t-nadir').textContent = result.nadir.f.toFixed(2) + ' Hz';
    $('t-tnadir').textContent = result.nadir.t.toFixed(1) + ' s';
    $('t-settle').textContent = result.settle.toFixed(2) + ' Hz';
    $('t-shed').textContent = result.shedOccurred ? Math.round(result.shedTotal * 100) + '%' : 'none';
    $('verdict').textContent = verdict(result, p);
    lastSvg = renderTrace(result, p, {colors: themeColors(), measure});
    drawCanvas(result, reducedMotion.matches ? Infinity : 0);   // Infinity = draw fully at once
    clearTimeout(hashTimer);
    hashTimer = setTimeout(() => writeHashState({
      i: v.inertia, tr: v.trip, dc: v.dc, ds: v.dcspeed, g: v.gfm}), 400);
  }

  /* Animate the fall: reveal the trace up to a moving time cursor. */
  function drawCanvas(result, fromTime){
    cancelAnimationFrame(rafId);
    const cv = $('trace'), dpr = devicePixelRatio || 1;
    const w = cv.clientWidth, h = cv.clientHeight;
    cv.width = w * dpr; cv.height = h * dpr;
    const g = cv.getContext('2d'); g.scale(dpr, dpr);
    const C = themeColors();
    const tEnd = result.t[result.t.length - 1];
    const fMin = Math.min(47.6, result.nadir.f - 0.2), fMax = 50.3;
    const sx = t => 48 + (t / tEnd) * (w - 64);
    const sy = f => 16 + (1 - (f - fMin) / (fMax - fMin)) * (h - 40);
    const start = performance.now();
    const DURATION = 2200;   // ms to play the ~30 s fall

    const frame = now => {
      const cursor = fromTime === Infinity ? tEnd : ((now - start) / DURATION) * tEnd;
      g.clearRect(0, 0, w, h);
      // reference lines
      g.strokeStyle = C.muted; g.lineWidth = 1;
      for(const f of [50, 49.8, 50.2]){ g.beginPath(); g.moveTo(48, sy(f)); g.lineTo(w - 16, sy(f)); g.stroke(); }
      g.strokeStyle = C.err; g.setLineDash([5, 4]);
      g.beginPath(); g.moveTo(48, sy(48.8)); g.lineTo(w - 16, sy(48.8)); g.stroke();
      g.setLineDash([]);
      // trace up to the cursor
      g.strokeStyle = C.accent; g.lineWidth = 2.5; g.beginPath();
      for(let i = 0; i < result.t.length && result.t[i] <= cursor; i++){
        const x = sx(result.t[i]), y = sy(result.f[i]);
        i === 0 ? g.moveTo(x, y) : g.lineTo(x, y);
      }
      g.stroke();
      if(cursor < tEnd) rafId = requestAnimationFrame(frame);
    };
    rafId = requestAnimationFrame(frame);
  }

  // wiring
  for(const id of IDS) $(id).addEventListener('input', refresh);
  $('tripbtn').addEventListener('click', () => drawCanvas(simulate(paramsFromControls(controls())), 0));
  for(const btn of document.querySelectorAll('#presets .chip')){
    btn.addEventListener('click', () => {
      const preset = PRESETS[btn.dataset.preset];
      for(const id of IDS) $(id).value = preset[id];
      refresh();
    });
  }
  wireExports({
    buttons: {dlsvg: $('dlsvg'), dlpng: $('dlpng'), copypng: $('copypng'), copymd: $('copydoc')},
    getSvg: () => lastSvg,
    getMarkdown: () => toMarkdown(simulate(paramsFromControls(controls())), paramsFromControls(controls())),
    slug: () => 'frequency-inertia',
  });
  onThemeChange(refresh);

  // restore state from the URL, else default
  const s = readHashState();
  if(s){ $('inertia').value = s.i; $('trip').value = s.tr; $('dc').value = s.dc; $('dcspeed').value = s.ds; $('gfm').value = s.g; }
  refresh();
}
