/* DOM shell: sliders → sim → readout + canvas strip. Engine and readout are pure. */
import {simulate, wipSweep, kneeWip, leverTriage, WEEK} from './engine.js';
import {batchEconomics} from './economics.js';
import {expediteSensitivity} from './expedite.js';
import {diceGame} from './dice.js';
import {renderReadout, renderBatch, renderTriage, renderExpedite, renderDice, markdownSummary, readoutVerdictParts} from './render.js';
import {readHashState, writeHashState} from '../assets/series.js';
import {measure, themeColors, onThemeChange} from '../assets/app-common.js';
import {wireExports} from '../assets/exports.js';
import {mountMotion} from '../assets/motion.js';
import {REVEAL} from './motion-spec.js';
import {rafBatched} from '../assets/schedule.js';
import {paintKicker, paintMetrics, wireCopyTap} from '../assets/verdict.js';
import {queueMotionAllowed, queueTime, flowHashState} from './motion-runtime.js';

const $ = id => document.getElementById(id);
const NO_LIMIT = 40;                       // the slider's top position (21) means "no limit"
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
const readoutPaint = mountMotion($('verdictwrap'));   // reveal: the wait-time curve draws on first load
wireCopyTap($('verdictwrap'), () => lastResult ? readoutVerdictParts(lastResult).line : '');

paintKicker($('kicker'), '14', 'Queues, not effort');

const PRESETS = {
  overloaded: {demand: 6, size: 4, team: 4, wip: 12, v: 'high'},
  nolimit:    {demand: 4, size: 4, team: 4, wip: 21, v: 'med'},
  healthy:    {demand: 3, size: 4, team: 4, wip: 4,  v: 'med'},
};

let variability = 'high';
let lastSvg = '', lastResult = null, lastSweep = null, lastKnee = 1, lastParams = null;
let sweepKey = '', debTimer = null, rafId = 0, hashTimer = null;
let lastBatchSvg = '', lastEcon = null, lastTriageSvg = '', lastTriage = null, triageKey = '';
let lastExpediteSvg = '', lastExpedite = null, lastDiceSvg = '', lastDice = null, diceSeed = 0xD1CE;

function params(){
  const wipPos = +$('wip').value;
  return {
    demandPerWeek: +$('demand').value,
    itemDays: +$('size').value,
    team: +$('team').value,
    wipLimit: wipPos >= 21 ? NO_LIMIT : wipPos,
    cov: variability,
  };
}

function econParams(){
  return {
    demandPerWeek: +$('demand').value,
    transactionCost: +$('tcost').value,
    holdCostPerItemWeek: +$('hcost').value,
    currentBatch: +$('batch').value,
    maxBatch: 30,
  };
}

function syncOutputs(){
  const p = params();
  $('demandout').textContent = p.demandPerWeek + '/week';
  $('sizeout').textContent = p.itemDays + (p.itemDays === 1 ? ' day' : ' days');
  $('teamout').textContent = p.team + (p.team === 1 ? ' person' : ' people');
  $('wipout').textContent = p.wipLimit >= NO_LIMIT ? 'no limit' : String(p.wipLimit);
  $('varout').textContent = {low: 'low', med: 'medium', high: 'high'}[variability];
  $('tcostout').textContent = '£' + (+$('tcost').value).toLocaleString('en-GB') + '/release';
  $('hcostout').textContent = '£' + (+$('hcost').value).toLocaleString('en-GB') + '/item·week';
  $('batchout').textContent = $('batch').value + ($('batch').value === '1' ? ' item' : ' items');
  $('backlogout').textContent = $('backlog').value === '0' ? 'none' : $('backlog').value + ' items';
  $('expediteout').textContent = (+$('expedite').value).toFixed(2).replace(/\.00$/, '') + '/week';
  $('diceDaysout').textContent = $('diceDays').value + ' days';
  for(const el of document.querySelectorAll('input[type=range]')){
    const f = (el.value - el.min) / (el.max - el.min) * 100;
    el.style.setProperty('--fill', f + '%');
  }
}

function doRefresh(){
  const p = params();
  syncOutputs();
  const result = simulate(p, {trace: !reducedMotion.matches});
  const key = JSON.stringify({...p, wipLimit: 0});
  if(key !== sweepKey){ lastSweep = wipSweep(p); sweepKey = key; }
  lastKnee = kneeWip(lastSweep);
  lastResult = result;
  lastParams = p;
  const ctx = {colors: themeColors(), measure};
  const svg = renderReadout(result, lastSweep, lastKnee, p, ctx);
  /* the LIVE paint carries the tap-to-copy mark; lastSvg (exports) stays clean */
  readoutPaint(renderReadout(result, lastSweep, lastKnee, p, {...ctx, copyTap: true}), REVEAL);
  lastSvg = svg;
  /* Swiss 6b: the VERDICT lives inside the readout SVG (one per page); the page
     carries the kicker + this metrics row, painted from the same params/result
     the artefact renders from, on the existing debounced/rAF refresh. */
  paintMetrics($('metrics'), 'Flow check', [
    'Demand ' + p.demandPerWeek + '/week',
    p.wipLimit >= NO_LIMIT ? 'No WIP limit' : 'WIP limit ' + p.wipLimit,
    'Team busy ' + Math.round(result.utilisation * 100) + '%',
  ]);

  lastEcon = batchEconomics(econParams());
  const batchSvg = renderBatch(lastEcon, econParams(), ctx);
  if(batchSvg !== lastBatchSvg){ $('batchwrap').innerHTML = batchSvg; lastBatchSvg = batchSvg; }

  const backlogNow = +$('backlog').value;
  const tKey = JSON.stringify({...p, q: backlogNow, k: lastKnee});
  if(tKey !== triageKey){ lastTriage = leverTriage(p, {initialBacklog: backlogNow, knee: lastKnee}); triageKey = tKey; }
  const triageSvg = renderTriage(lastTriage, p, backlogNow, ctx);
  if(triageSvg !== lastTriageSvg){ $('triagewrap').innerHTML = triageSvg; lastTriageSvg = triageSvg; }

  lastExpedite = expediteSensitivity(p, {expeditePerWeek: +$('expedite').value});
  const expediteSvg = renderExpedite(lastExpedite, ctx);
  if(expediteSvg !== lastExpediteSvg){ $('expeditewrap').innerHTML = expediteSvg; lastExpediteSvg = expediteSvg; }
  lastDice = diceGame({days: +$('diceDays').value, seed: diceSeed});
  const diceSvg = renderDice(lastDice, ctx);
  if(diceSvg !== lastDiceSvg){ $('dicewrap').innerHTML = diceSvg; lastDiceSvg = diceSvg; }

  restartAnim(result);
  clearTimeout(hashTimer);
  hashTimer = setTimeout(writeFlowHash, 400);
}
function liveFlowState(){
  return flowHashState(params(), {wip: $('wip').value, transactionCost: $('tcost').value,
    holdCost: $('hcost').value, batch: $('batch').value, backlog: $('backlog').value,
    expedite: $('expedite').value, diceDays: $('diceDays').value, diceSeed});
}
function writeFlowHash(){ hashTimer = null; return writeHashState(liveFlowState()); }
function refresh(){
  cancelAnimationFrame(rafId);
  rafId = requestAnimationFrame(() => { rafId = 0; doRefresh(); });
}
function schedule(){
  clearTimeout(debTimer);
  debTimer = setTimeout(() => { debTimer = null; refresh(); }, 120);
}
function ensureFresh(){
  if(!debTimer && !rafId) return;
  clearTimeout(debTimer); debTimer = null;
  cancelAnimationFrame(rafId); rafId = 0;
  doRefresh();
}

/* ---------- controls ---------- */
for(const id of ['demand', 'size', 'team', 'wip', 'tcost', 'hcost', 'batch', 'backlog', 'expedite', 'diceDays'])
  $(id).addEventListener('input', () => { clearPresetSelection(); schedule(); });
/* the radiogroup's buttons carry real radio state — class alone is invisible
   to a screen reader (merit-order's pattern) */
const varButtons = [...$('variability').children];
const presetButtons = [...$('presets').querySelectorAll('.chip')];
varButtons.forEach(b => b.setAttribute('role', 'radio'));
function clearPresetSelection(){
  for(const b of presetButtons){ b.classList.remove('on'); b.setAttribute('aria-pressed', 'false'); }
}
for(const b of presetButtons) b.setAttribute('aria-pressed', String(b.classList.contains('on')));
function syncVariability(){
  for(const b of varButtons){
    const active = b.dataset.v === variability;
    b.classList.toggle('on', active);
    b.setAttribute('aria-checked', String(active));
  }
}
syncVariability();
$('variability').addEventListener('click', e => {
  const b = e.target.closest('button');
  if(!b) return;
  clearPresetSelection();
  variability = b.dataset.v;
  syncVariability();
  schedule();
});
$('presets').addEventListener('click', e => {
  const b = e.target.closest('.chip');
  if(!b) return;
  const p = PRESETS[b.dataset.preset];
  $('demand').value = p.demand; $('size').value = p.size; $('team').value = p.team; $('wip').value = p.wip;
  variability = p.v;
  syncVariability();
  for(const x of presetButtons){
    const selected = x === b;
    x.classList.toggle('on', selected);
    x.setAttribute('aria-pressed', String(selected));
  }
  schedule();
});

/* ---------- canvas strip ---------- */
/* Replays the trace's final window on a 12s loop. Items: backlog column →
   in-progress dots sliding left→right by work progress → done counter. */
const strip = $('strip');
let animState = null, animRaf = 0, animStart = 0;
let stripVisible = false;

function buildTimeline(events){
  const items = new Map();
  for(const e of events){
    const it = items.get(e.id) || {};
    if(e.kind === 'arrive') it.arrive = e.t;
    if(e.kind === 'start') it.start = e.t;
    if(e.kind === 'done') it.done = e.t;
    items.set(e.id, it);
  }
  return items;
}

function restartAnim(result){
  cancelAnimationFrame(animRaf);
  animRaf = 0;
  const note = $('animnote');
  if(reducedMotion.matches || !result.events){
    animState = null;
    note.textContent = 'motion off — steady-state averages shown';
    $('cbacklog').textContent = result.backlogSlopePerWeek > 0.5
      ? '+' + result.backlogSlopePerWeek.toFixed(1) + '/wk'
      : (result.utilisation > 0.95 ? '↑' : '~0');
    $('cwip').textContent = result.impliedWip.toFixed(1);
    $('cdone').textContent = result.throughputPerWeek.toFixed(1) + '/wk';
    drawFrame(null, 0);
    return;
  }
  const tEnd = result.events.length ? result.events[result.events.length - 1].t : 0;
  const windowDays = 18 * WEEK;
  animState = {items: buildTimeline(result.events), t0: Math.max(0, tEnd - windowDays), t1: tEnd};
  note.textContent = 'the last ' + Math.round(windowDays / WEEK) + ' simulated weeks · replay pauses off screen';
  startAnim();
}

function canRunAnim(){
  return queueMotionAllowed({reduced: reducedMotion.matches, hidden: document.hidden,
    visible: stripVisible, hasEvents: !!animState});
}
function stopAnim(){
  if(animRaf) cancelAnimationFrame(animRaf);
  animRaf = 0;
}
function startAnim(){
  stopAnim();
  if(!animState) return;
  if(!canRunAnim()){
    // Keep a useful settled frame painted without paying for an unseen loop.
    if(!document.hidden) drawFrame(animState, animState.t1);
    return;
  }
  animStart = performance.now();
  const loop = now => {
    if(!canRunAnim()){ animRaf = 0; return; }
    drawFrame(animState, queueTime(now, animStart, animState));
    animRaf = requestAnimationFrame(loop);
  };
  animRaf = requestAnimationFrame(loop);
}

if(typeof IntersectionObserver !== 'undefined'){
  new IntersectionObserver(entries => {
    const entry = entries[entries.length - 1];
    const visible = entry.isIntersecting && entry.intersectionRatio >= 0.15;
    if(visible === stripVisible) return;
    stripVisible = visible;
    visible ? startAnim() : stopAnim();
  }, {threshold: [0, 0.15]}).observe(strip);
} else stripVisible = true;
document.addEventListener('visibilitychange', () => document.hidden ? stopAnim() : startAnim());

function drawFrame(state, tau){
  const C = themeColors();
  const dpr = devicePixelRatio || 1;
  const w = strip.clientWidth, h = 112;
  if(strip.width !== w * dpr){ strip.width = w * dpr; strip.height = h * dpr; }
  const g = strip.getContext('2d');
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  g.clearRect(0, 0, w, h);
  const laneX = {backlog: 14,
    wip0: Math.max(100, w * 0.22), wip1: Math.min(w * 0.78, w - 82), done: w - 52};
  g.font = '600 10px -apple-system, sans-serif';
  g.fillStyle = C.muted;
  g.fillText('BACKLOG' + (state && state.backlogNow > 24 ? ' · ' + state.backlogNow : ''), laneX.backlog, 12);
  g.fillText('IN PROGRESS →', laneX.wip0, 12);
  g.fillText('DONE', laneX.done, 12);
  g.strokeStyle = C.border;
  g.strokeRect(laneX.wip0 - 8, 20, laneX.wip1 - laneX.wip0 + 16, h - 32);
  if(!state){                       // reduced-motion static frame
    return;
  }
  let backlog = 0, done = 0;
  const active = [];
  for(const it of state.items.values()){
    if(it.arrive === undefined || it.arrive > tau) continue;
    if(it.done !== undefined && it.done <= tau){ if(it.done >= state.t0) done++; continue; }
    if(it.start === undefined || it.start > tau){ backlog++; continue; }
    const end = it.done !== undefined ? it.done : state.t1 + 1;
    active.push(Math.min(0.98, (tau - it.start) / Math.max(0.1, end - it.start)));
  }
  /* backlog: stacked dots (cap the drawing, show the number) */
  g.fillStyle = C.muted;
  const bShow = Math.min(backlog, 24);
  for(let i = 0; i < bShow; i++){
    const col = Math.floor(i / 12), row = i % 12;
    g.beginPath();
    g.arc(laneX.backlog + 8 + col * 16, 30 + row * 10, 4, 0, 7);
    g.fill();
  }
  state.backlogNow = backlog;   // next frame's header shows the count
  /* in progress: dots slide by progress, with progress ring */
  active.forEach((prog, i) => {
    const x = laneX.wip0 + prog * (laneX.wip1 - laneX.wip0);
    const y = 34 + (i % 9) * 12;
    g.fillStyle = C.accent;
    g.beginPath(); g.arc(x, y, 5, 0, 7); g.fill();
    g.strokeStyle = C.card; g.lineWidth = 1.5;
    g.beginPath(); g.arc(x, y, 5, 0, 7); g.stroke();
  });
  /* done: counter */
  g.fillStyle = C.ink;
  g.font = '700 22px ui-monospace, Menlo, monospace';
  g.fillText(String(done), laneX.done, h / 2 + 6);
  $('cbacklog').textContent = backlog;
  $('cwip').textContent = active.length;
  $('cdone').textContent = done;
}

/* ---------- exports (shared wiring; one call per card) ---------- */
const slug = () => 'flow-' + (lastParams ? lastParams.demandPerWeek + 'w' + lastParams.wipLimit : 'x');
wireExports({buttons: {dlsvg: $('dlsvg'), dlpng: $('dlpng'), copypng: $('copypng')},
  getSvg: () => { ensureFresh(); return lastSvg || null; }, slug});
wireExports({buttons: {dlsvg: $('dlbatchsvg'), dlpng: $('dlbatchpng'), copypng: $('copybatchpng')},
  getSvg: () => { ensureFresh(); return lastBatchSvg || null; }, slug: () => 'flow-batch-' + (lastEcon ? lastEcon.optimum : 'x')});
wireExports({buttons: {dlsvg: $('dltriagesvg'), dlpng: $('dltriagepng'), copypng: $('copytriagepng')},
  getSvg: () => { ensureFresh(); return lastTriageSvg || null; }, slug: () => 'flow-triage-' + $('backlog').value});
wireExports({buttons: {dlsvg: $('dlexpeditesvg'), dlpng: $('dlexpeditepng'), copypng: $('copyexpeditepng')},
  getSvg: () => { ensureFresh(); return lastExpediteSvg || null; }, slug: () => 'flow-expedite-' + $('expedite').value});
wireExports({buttons: {dlsvg: $('dldicesvg'), dlpng: $('dldicepng'), copypng: $('copydicepng')},
  getSvg: () => { ensureFresh(); return lastDiceSvg || null; }, slug: () => 'flow-dice-' + $('diceDays').value});
$('rolldice').addEventListener('click', () => { diceSeed = (diceSeed + 0x9E3779B9) >>> 0; lastDiceSvg = ''; refresh(); });
$('copydoc').addEventListener('click', async () => {
  ensureFresh();
  if(!lastResult) return;
  clearTimeout(hashTimer);
  await writeFlowHash();
  const md = markdownSummary(lastResult, lastSweep, lastKnee, lastParams,
    {econ: lastEcon, triage: lastTriage, initialBacklog: +$('backlog').value,
      expedite: lastExpedite, dice: lastDice});
  try{ await navigator.clipboard.writeText(md); flash('copydoc', 'Copied'); }
  catch(e){ prompt('Copy this:', md); }
});
function flash(id, msg){
  const b = $(id), was = b.textContent;
  b.textContent = msg;
  setTimeout(() => { b.textContent = was; }, 1500);
}

/* ---------- boot ---------- */
(async function boot(){
  const h = await readHashState();
  if(h && isFinite(+h.d)){
    $('demand').value = +h.d; $('size').value = +h.s || 4; $('team').value = +h.t || 4;
    $('wip').value = +h.w || 4;
    if(['low', 'med', 'high'].includes(h.v)) variability = h.v;
    syncVariability();
    if(isFinite(+h.tc) && +h.tc) $('tcost').value = +h.tc;
    if(isFinite(+h.hc) && +h.hc) $('hcost').value = +h.hc;
    if(isFinite(+h.b) && +h.b) $('batch').value = +h.b;
    if(isFinite(+h.q)) $('backlog').value = +h.q;
    if(isFinite(+h.e)) $('expedite').value = +h.e;
    if(isFinite(+h.dd)) $('diceDays').value = +h.dd;
    if(isFinite(+h.ds)) diceSeed = +h.ds;
  }
  onThemeChange(() => { lastSvg = ''; lastBatchSvg = ''; lastTriageSvg = ''; lastExpediteSvg = ''; lastDiceSvg = ''; refresh(); });
  reducedMotion.addEventListener('change', refresh);
  // a resize fires many events per drag of the browser edge; coalesce to one redraw/frame
  addEventListener('resize', rafBatched(() => { if(lastResult) drawFrame(animState, animState ? animState.t1 : 0); }));
  refresh();
})();
