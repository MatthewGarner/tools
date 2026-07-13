/* DOM shell: sliders + threshold drag → classify the 1,000-dot population → the
   distribution SVG, the gate canvas, the natural-frequency verdict. Engine, layout
   and renderers are pure; this file owns the DOM, pointer drag, presets, hash. */
import {population, classify, derived, verdicts, fromClaim, markdown} from './engine.js';
import {renderDistributions, renderBox, tFromSvgX} from './render.js';
import {layoutFlow, makeDriver} from './gate-canvas.js';
import {readHashState, writeHashState} from '../assets/series.js';
import {themeColors, onThemeChange} from '../assets/app-common.js';
import {wireExports} from '../assets/exports.js';
import {mountMotion} from '../assets/motion.js';
import {REVEAL} from './motion-spec.js';
import {debounced, rafBatched} from '../assets/schedule.js';

const $ = id => document.getElementById(id);
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
const DIST_W = 900, DIST_H = 220;
const POP = population();                              // built once; classify re-derives
const driver = makeDriver($('gate'));
const distPaint = mountMotion($('distwrap'));          // reveal: the curves draw on first load

/* preset params. claim: [sens, spec] → fromClaim sets d′ and t. */
const PRESETS = {
  'alert-fatigue': {b: 0.02,  d: 2.0, t: 1.2},
  'vendor-claim':  {b: 0.01,  claim: [0.99, 0.99]},
  'screening':     {b: 0.008, claim: [0.90, 0.91]},
  'capacity-test': {b: 0.15,  d: 1.6, t: 0.8},
};

let claimed = null;                                    // {sens, spec} while a claim is pinned
let lastDistSvg = '', lastBoxHtml = '', lastLayout = null, lastParams = null, lastCounts = null;
let hashTimer = null;

function readParams(){
  return {baseRate: Math.pow(10, +$('baseRate').value), dprime: +$('dprime').value, t: +$('threshold').value};
}

function syncOutputs(p){
  const pctv = p.baseRate * 100;
  const pctText = (pctv >= 1 ? Math.round(pctv * 10) / 10 : Number(pctv.toPrecision(2))) + '%';
  const oneIn = Math.round(1 / p.baseRate);
  $('baseRateOut').textContent = pctText + ' · 1 in ' + oneIn.toLocaleString('en-GB');
  const auc = derived(p).auc;
  $('dprimeOut').textContent = p.dprime.toFixed(2) + ' · AUC ' + Math.round(auc * 100) + '%';
  $('thresholdOut').textContent = p.t.toFixed(2);
  for(const el of document.querySelectorAll('input[type=range]'))
    el.style.setProperty('--fill', (el.value - el.min) / (el.max - el.min) * 100 + '%');
}

function doRefresh(){
  const p = readParams();
  lastParams = p;
  syncOutputs(p);
  const C = themeColors();
  const {dots, counts} = classify(POP, p);
  lastCounts = counts;

  const distSvg = renderDistributions(p, C, {w: DIST_W, h: DIST_H});
  distPaint(distSvg, REVEAL); lastDistSvg = distSvg;   // curves draw on first load; later renders just swap

  const boxHtml = renderBox(counts, C);
  if(boxHtml !== lastBoxHtml){ $('boxwrap').innerHTML = boxHtml; lastBoxHtml = boxHtml; }

  const v = verdicts(counts);
  $('verdictAlarm').textContent = v.alarm;
  $('verdictMiss').textContent = v.miss;
  $('verdictFine').textContent = v.fine;

  // build layout + draw the settled frame immediately (numbers never wait on animation)
  const g = $('gate'), dpr = devicePixelRatio || 1, w = g.clientWidth || 640, h = 360;
  const dotR = w < 480 ? 2 : 3;                  // shrink dots on narrow so they don't collide
  if(g.width !== Math.round(w * dpr)){ g.width = Math.round(w * dpr); g.height = h * dpr; }
  lastLayout = layoutFlow(dots, [{split: d => d.alarm, fail: 'Quiet'}], {w, h, dotR}, {passLabel: 'ALARM'});
  lastLayout.dotR = dotR;
  driver.draw(lastLayout, dotColors(C), 1);

  clearTimeout(hashTimer);
  hashTimer = setTimeout(() => { if(claimed) return writeState({c: [claimed.sens, claimed.spec]}); writeState({}); }, 400);
}
const refresh = rafBatched(doRefresh);

function dotColors(C){ return {real: C.accent, benign: C.muted, binLabel: C.muted}; }

/* the flight: dots animate start → bins once, then settle. Reduced motion = the
   settled frame only. Debounced off slider input so a drag doesn't re-fly each tick. */
let animRaf = 0;
function animateGate(){
  cancelAnimationFrame(animRaf);
  if(!lastLayout) return;
  const C = dotColors(themeColors());
  const note = $('animnote');
  if(reducedMotion.matches){ note.textContent = 'motion off — final layout shown'; driver.draw(lastLayout, C, 1); return; }
  note.textContent = '';
  const t0 = performance.now(), dur = 850;
  const loop = now => {
    const progress = Math.min(1, (now - t0) / dur);
    driver.draw(lastLayout, C, progress);
    if(progress < 1) animRaf = requestAnimationFrame(loop);
  };
  animRaf = requestAnimationFrame(loop);
}
const scheduleAnim = debounced(animateGate, 250);

function writeState(extra){
  const p = lastParams || readParams();
  writeHashState({b: +$('baseRate').value, d: p.dprime, t: p.t, ...extra});
}

/* ---------- controls ---------- */
for(const id of ['baseRate', 'dprime', 'threshold'])
  $(id).addEventListener('input', () => { clearClaim(); refresh(); scheduleAnim(); });

$('presets').addEventListener('click', e => {
  const b = e.target.closest('.chip[data-preset]');
  if(!b) return;
  applyPreset(PRESETS[b.dataset.preset]);
  for(const x of $('presets').querySelectorAll('.chip[data-preset]')) x.classList.toggle('on', x === b);
  refresh(); animateGate();
});

function applyPreset(p){
  $('baseRate').value = Math.log10(p.b);
  if(p.claim){ const {dprime, t} = fromClaim(p.claim[0], p.claim[1]); setDT(dprime, t); setClaim(p.claim[0], p.claim[1]); }
  else { setDT(p.d, p.t); clearClaim(); }
}
function setDT(d, t){ $('dprime').value = Math.max(0, Math.min(4, d)); $('threshold').value = Math.max(-3, Math.min(6, t)); }

/* ---------- claim pin ---------- */
function setClaim(sens, spec){
  claimed = {sens, spec};
  const chip = $('claimChip');
  chip.hidden = false;
  chip.textContent = 'claimed ' + Math.round(sens * 100) + '% / ' + Math.round(spec * 100) + '%';
}
function clearClaim(){ claimed = null; $('claimChip').hidden = true; }

$('claimBtn').addEventListener('click', () => openClaim(true));
$('claimCancel').addEventListener('click', () => openClaim(false));
$('claimApply').addEventListener('click', () => {
  const sens = clampPct(+$('claimSens').value), spec = clampPct(+$('claimSpec').value);
  const {dprime, t} = fromClaim(sens, spec);
  setDT(dprime, t); setClaim(sens, spec);
  for(const x of $('presets').querySelectorAll('.chip[data-preset]')) x.classList.remove('on');
  openClaim(false); refresh(); animateGate();
});
function clampPct(v){ return Math.max(0.01, Math.min(0.999, (isFinite(v) ? v : 99) / 100)); }
function openClaim(show){
  $('claimPop').hidden = !show;
  $('claimBtn').setAttribute('aria-expanded', String(show));
  if(show) $('claimSens').focus();
}
document.addEventListener('pointerdown', e => {
  if(!$('claimPop').hidden && !$('claimPop').contains(e.target) && e.target !== $('claimBtn')) openClaim(false);
}, true);
document.addEventListener('keydown', e => { if(e.key === 'Escape' && !$('claimPop').hidden) openClaim(false); });

/* ---------- threshold drag on the plot ---------- */
const distwrap = $('distwrap');
let dragging = false;
function tAtClientX(clientX){
  const svg = distwrap.querySelector('svg');
  if(!svg) return null;
  const r = svg.getBoundingClientRect();
  return tFromSvgX((clientX - r.left) / r.width * DIST_W, DIST_W);
}
distwrap.addEventListener('pointerdown', e => {
  if(!e.target.closest('[data-drag]')) return;
  dragging = true; distwrap.setPointerCapture(e.pointerId);
  moveThreshold(e.clientX);
});
distwrap.addEventListener('pointermove', e => { if(dragging) moveThreshold(e.clientX); });
distwrap.addEventListener('pointerup', () => { if(dragging){ dragging = false; animateGate(); } });
function moveThreshold(clientX){
  const t = tAtClientX(clientX);
  if(t == null) return;
  $('threshold').value = t; clearClaim(); refresh();
}
/* keyboard on the handle (delegated — the handle re-renders each refresh) */
distwrap.addEventListener('keydown', e => {
  if(!e.target.closest('[data-drag]')) return;
  const step = e.shiftKey ? 0.25 : 0.05;
  let d = 0;
  if(e.key === 'ArrowRight' || e.key === 'ArrowUp') d = step;
  else if(e.key === 'ArrowLeft' || e.key === 'ArrowDown') d = -step;
  else return;
  e.preventDefault();
  $('threshold').value = Math.max(-3, Math.min(6, +$('threshold').value + d));
  clearClaim(); refresh(); scheduleAnim();
});

/* ---------- exports ---------- */
const slug = () => 'alarm-b' + (lastParams ? Math.round(lastParams.baseRate * 1000) : 'x');
wireExports({buttons: {dlsvg: $('dlsvg'), dlpng: $('dlpng'), copypng: $('copypng')},
  getSvg: () => lastDistSvg || null, slug});
$('copydoc').addEventListener('click', async () => {
  if(!lastCounts) return;
  const md = markdown(lastParams, derived(lastParams), lastCounts, verdicts(lastCounts), location.href);
  try{ await navigator.clipboard.writeText(md); flash('copydoc', 'Copied'); }
  catch(e){ prompt('Copy this:', md); }
});
$('copylink').addEventListener('click', async () => {
  try{ await navigator.clipboard.writeText(location.href); flash('copylink', 'Copied'); }
  catch(e){ prompt('Copy this link:', location.href); }
});
$('replay').addEventListener('click', animateGate);
function flash(id, msg){ const b = $(id), was = b.textContent; b.textContent = msg; setTimeout(() => { b.textContent = was; }, 1500); }

/* ---------- boot ---------- */
(function boot(){
  const h = readHashState();
  if(h && isFinite(+h.b)){
    $('baseRate').value = Math.max(-3, Math.min(-0.30103, +h.b));
    if(isFinite(+h.d)) $('dprime').value = Math.max(0, Math.min(4, +h.d));
    if(isFinite(+h.t)) $('threshold').value = Math.max(-3, Math.min(6, +h.t));
    if(Array.isArray(h.c) && h.c.length === 2) setClaim(+h.c[0], +h.c[1]);
  }
  onThemeChange(() => { lastDistSvg = ''; lastBoxHtml = ''; refresh(); animateGate(); });
  reducedMotion.addEventListener('change', animateGate);
  addEventListener('resize', rafBatched(() => refresh()));
  doRefresh();
  animateGate();
})();
