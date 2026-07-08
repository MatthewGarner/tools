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
  let lastResult = null, lastParams = null;

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
    lastSvg = renderTrace(result, p, {colors: themeColors(), measure});
    const still = reducedMotion.matches || !animate;
    drawCanvas(result, still ? Infinity : 0);   // Infinity = draw fully at once
    clearTimeout(hashTimer);
    hashTimer = setTimeout(() => writeHashState({
      i: v.inertia, tr: v.trip, dc: v.dc, ds: v.dcspeed, g: v.gfm}), 400);
  }

  const CANVAS_FONT = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif";

  /* Animate the fall: reveal the trace up to a moving time cursor.
     Annotation set mirrors render.js's renderTrace — keep the two consistent. */
  function drawCanvas(result, fromTime){
    cancelAnimationFrame(rafId);
    const cv = $('trace'), dpr = devicePixelRatio || 1;
    const w = cv.clientWidth, h = cv.clientHeight;
    cv.width = w * dpr; cv.height = h * dpr;
    const g = cv.getContext('2d'); g.scale(dpr, dpr);
    const C = themeColors();
    const tEnd = result.t[result.t.length - 1];
    // tighter range: 48.8 UFLS always shows with margin; shallow nadirs fill the space
    const fMin = Math.min(result.nadir.f - 0.4, 48.5), fMax = 50.3;
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

      // x-axis
      g.fillStyle = C.muted;
      g.textAlign = 'left'; g.fillText('0 s', x0, h - 6);
      g.textAlign = 'right'; g.fillText(`${Math.round(tEnd)} s`, x1, h - 6);

      if(cursor < tEnd) rafId = requestAnimationFrame(frame);
    };
    rafId = requestAnimationFrame(frame);
  }

  // wiring
  for(const id of IDS) $(id).addEventListener('input', () => {
    for(const c of document.querySelectorAll('#presets .chip')) c.classList.remove('on');
    refresh(false);
  });
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
  addEventListener('resize', () => { if(lastResult) drawCanvas(lastResult, Infinity); });

  // restore state from the URL, else default
  const s = readHashState();
  if(s){ $('inertia').value = s.i; $('trip').value = s.tr; $('dc').value = s.dc; $('dcspeed').value = s.ds; $('gfm').value = s.g; }
  refresh();
}
