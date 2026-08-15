/* DOM shell: sliders + threshold drag → classify the 1,000-dot population → the
   distribution SVG, the gate canvas, the natural-frequency verdict. Engine, layout
   and renderers are pure; this file owns the DOM, pointer drag, presets, hash. */
import {population, classify, derived, verdicts, fromClaim, markdown, N} from './engine.js';
import {renderDistributions, renderBox, tFromSvgX} from './render.js';
import {layoutFlow, makeDriver} from './gate-canvas.js';
import {readHashState, writeHashState} from '../assets/series.js';
import {themeColors, onThemeChange} from '../assets/app-common.js';
import {wireExports} from '../assets/exports.js';
import {mountMotion} from '../assets/motion.js';
import {REVEAL} from './motion-spec.js';
import {debounced, rafBatched} from '../assets/schedule.js';
import {paintKicker, paintMetrics, paintVerdict, wireCopyVerdict} from '../assets/verdict.js';
import {trapPopoverFocus} from '../assets/popover-focus.js';
import {adjustThreshold, dragEndsForPointer} from './interaction.js';

const $ = id => document.getElementById(id);
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
const DIST_W = 900, DIST_H = 220;   // DIST_W: pinned export width + on-screen floor
let lastDistW = DIST_W;             // live measured distribution width (drag reads this)
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
  const restoreThresholdFocus = document.activeElement?.closest?.('[data-drag="threshold"]') != null;
  const p = readParams();
  lastParams = p;
  syncOutputs(p);
  const C = themeColors();
  const {dots, counts} = classify(POP, p);
  lastCounts = counts;

  lastDistW = Math.max(distwrap.clientWidth || DIST_W, 520);   // native at the container width, floored at 520 (style.css min-width: the phone PANS instead of compressing labels); export stays pinned at DIST_W
  const distSvg = renderDistributions(p, C, {w: lastDistW, h: DIST_H});
  distPaint(distSvg, REVEAL); lastDistSvg = distSvg;   // curves draw on first load; later renders just swap
  if(restoreThresholdFocus) distwrap.querySelector('[data-drag="threshold"]')?.focus({preventScroll: true});

  const boxHtml = renderBox(counts, C);
  if(boxHtml !== lastBoxHtml){ $('boxwrap').innerHTML = boxHtml; lastBoxHtml = boxHtml; }

  const v = verdicts(counts, p);
  paintVerdict($('verdictAlarm'), v.alarm, v.alarmFig);
  $('verdictMiss').textContent = v.miss;
  $('verdictFine').textContent = 'Model expectation — ' + v.fine.replace(/^Expected:\s*/i, '') +
    '. The seeded draw below can differ slightly.';
  paintMetrics($('metrics'), settingLabel(), metricCounts(p));

  // build layout + draw the settled frame immediately (numbers never wait on animation)
  const g = $('gate'), dpr = devicePixelRatio || 1, w = g.clientWidth || 640, h = 360;
  const dotR = w < 480 ? 2 : w >= 1000 ? 3.5 : 3;   // r=3.5 keeps ink density at the wide (~1084) canvas
  if(g.width !== Math.round(w * dpr)){ g.width = Math.round(w * dpr); g.height = h * dpr; }
  lastLayout = layoutFlow(dots, [{split: d => d.alarm, fail: 'Quiet'}], {w, h, dotR}, {passLabel: 'ALARM'});
  lastLayout.dotR = dotR;
  driver.draw(lastLayout, dotColors(C), 1);

  clearTimeout(hashTimer);
  hashTimer = setTimeout(() => { if(claimed) return writeState({c: [claimed.sens, claimed.spec]}); writeState({}); }, 400);
}
let animateAfterRefresh = false;
const refresh = rafBatched(() => {
  doRefresh();
  if(animateAfterRefresh){ animateAfterRefresh = false; animateGate(); }
});
function refreshThenAnimate(){ animateAfterRefresh = true; refresh(); }

function dotColors(C){ return {real: C.accent, benign: C.muted, binLabel: C.muted}; }

/* The metrics row above the distribution: what's being detected, and the three
   numbers the picture is built from. Every value is read back off the live
   settings — the preset chip that's lit (sliders clear it), the base rate the
   1,000 dots were classified at, and the detector's analytic sensitivity. */
function settingLabel(){
  const on = $('presets').querySelector('.chip[data-preset].on');
  if(on) return on.textContent;
  return claimed ? 'Pinned vendor claim' : 'Custom settings';
}
function metricCounts(p){
  return ['1 in ' + Math.round(1 / p.baseRate).toLocaleString('en-GB') + ' real',
    'Sensitivity ' + Math.round(derived(p).sensitivity * 100) + '%',
    N.toLocaleString('en-GB') + ' cases'];
}

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
  $(id).addEventListener('input', () => {
    if(id !== 'baseRate') clearClaim();
    setPresetSelection(null); refresh(); scheduleAnim();
  });

$('presets').addEventListener('click', e => {
  const b = e.target.closest('.chip[data-preset]');
  if(!b) return;
  applyPreset(PRESETS[b.dataset.preset]);
  setPresetSelection(b);
  refreshThenAnimate();
});

function setPresetSelection(selected){
  for(const chip of $('presets').querySelectorAll('.chip[data-preset]')){
    const on = chip === selected;
    chip.classList.toggle('on', on);
    chip.setAttribute('aria-pressed', String(on));
  }
}

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

$('claimBtn').addEventListener('click', openClaim);
$('claimCancel').addEventListener('click', () => closeClaim());
$('claimApply').addEventListener('click', () => {
  const sens = clampPct(+$('claimSens').value), spec = clampPct(+$('claimSpec').value);
  const {dprime, t} = fromClaim(sens, spec);
  setDT(dprime, t); setClaim(sens, spec);
  setPresetSelection(null);
  closeClaim(); refreshThenAnimate();
});
function clampPct(v){ return Math.max(0.01, Math.min(0.999, (isFinite(v) ? v : 99) / 100)); }
let claimReturnFocus = null, claimTrapWired = false;
function openClaim(){
  claimReturnFocus = document.activeElement;
  $('claimPop').hidden = false;
  $('claimBtn').setAttribute('aria-expanded', 'true');
  /* claimPop is a static, always-present element (toggled via hidden, never
     recreated) unlike edit-in-place's ad-hoc popovers — so the trap wires
     once, not on every open (each call would stack another keydown listener).
     trapPopoverFocus's own auto-focus lands on the first BUTTON (Cancel); the
     explicit .focus() below always runs after and wins, on every open. */
  if(!claimTrapWired){ trapPopoverFocus($('claimPop'), () => closeClaim()); claimTrapWired = true; }
  $('claimSens').focus();
}
function closeClaim({restoreFocus = true} = {}){
  if($('claimPop').hidden) return;
  $('claimPop').hidden = true;
  $('claimBtn').setAttribute('aria-expanded', 'false');
  const target = claimReturnFocus?.isConnected ? claimReturnFocus : $('claimBtn');
  claimReturnFocus = null;
  if(restoreFocus) target.focus({preventScroll: true});
}
document.addEventListener('pointerdown', e => {
  if(!$('claimPop').hidden && !$('claimPop').contains(e.target) && e.target !== $('claimBtn'))
    closeClaim({restoreFocus: false});
}, true);

/* ---------- threshold drag on the plot ---------- */
const distwrap = $('distwrap');
let dragPointerId = null;
function tAtClientX(clientX){
  const svg = distwrap.querySelector('svg');
  if(!svg) return null;
  const r = svg.getBoundingClientRect();
  return tFromSvgX((clientX - r.left) / r.width * lastDistW, lastDistW);
}
distwrap.addEventListener('pointerdown', e => {
  if(!e.target.closest('[data-drag]') || dragPointerId != null) return;
  dragPointerId = e.pointerId; distwrap.setPointerCapture(e.pointerId);
  moveThreshold(e.clientX);
});
distwrap.addEventListener('pointermove', e => {
  if(e.pointerId === dragPointerId) moveThreshold(e.clientX);
});
distwrap.addEventListener('pointerup', e => finishThresholdDrag(e.pointerId));
distwrap.addEventListener('pointercancel', e => finishThresholdDrag(e.pointerId));
distwrap.addEventListener('lostpointercapture', e => finishThresholdDrag(e.pointerId, false));
function finishThresholdDrag(pointerId, release = true){
  if(!dragEndsForPointer(dragPointerId, pointerId)) return;
  dragPointerId = null;
  if(release && distwrap.hasPointerCapture(pointerId)) distwrap.releasePointerCapture(pointerId);
  refreshThenAnimate();
}
function moveThreshold(clientX){
  const t = tAtClientX(clientX);
  if(t == null) return;
  $('threshold').value = t; clearClaim(); setPresetSelection(null); refresh();
}
/* keyboard on the handle (delegated — the handle re-renders each refresh) */
distwrap.addEventListener('keydown', e => {
  if(!e.target.closest('[data-drag]')) return;
  const next = adjustThreshold(+$('threshold').value, e.key, e.shiftKey);
  if(next == null) return;
  e.preventDefault();
  $('threshold').value = next;
  clearClaim(); setPresetSelection(null); refresh(); scheduleAnim();
});

/* ---------- exports ---------- */
const slug = () => 'alarm-b' + (lastParams ? Math.round(lastParams.baseRate * 1000) : 'x');
wireExports({buttons: {dlsvg: $('dlsvg'), dlpng: $('dlpng'), copypng: $('copypng')},
  getSvg: () => lastParams ? renderDistributions(lastParams, themeColors(), {w: DIST_W, h: DIST_H}) : null, slug});
$('copydoc').addEventListener('click', async () => {
  if(!lastCounts) return;
  const md = markdown(lastParams, derived(lastParams), lastCounts, verdicts(lastCounts, lastParams), location.href);
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
(async function boot(){
  paintKicker($('kicker'), '13', 'The base rate has its say');
wireCopyVerdict($('verdict'));
wireCopyVerdict($('verdictAlarm'));
  const h = await readHashState();
  if(h && isFinite(+h.b)){
    $('baseRate').value = Math.max(-3, Math.min(-0.30103, +h.b));
    if(isFinite(+h.d)) $('dprime').value = Math.max(0, Math.min(4, +h.d));
    if(isFinite(+h.t)) $('threshold').value = Math.max(-3, Math.min(6, +h.t));
    if(Array.isArray(h.c) && h.c.length === 2) setClaim(+h.c[0], +h.c[1]);
  }
  setPresetSelection(null);
  onThemeChange(() => { lastDistSvg = ''; lastBoxHtml = ''; refreshThenAnimate(); });
  reducedMotion.addEventListener('change', animateGate);
  addEventListener('resize', rafBatched(() => refresh()));
  doRefresh();
  animateGate();
})();
