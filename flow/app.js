/* DOM shell: sliders → sim → readout + canvas strip. Engine and readout are pure. */
import {simulate, wipSweep, kneeWip, leverTriage, WEEK} from './engine.js';
import {batchEconomics} from './economics.js';
import {renderReadout, renderBatch, renderTriage, readoutVerdict, markdownSummary} from './render.js';
import {readHashState, writeHashState} from '../assets/series.js';
import {measure, themeColors, onThemeChange} from '../assets/app-common.js';
import {wireExports} from '../assets/exports.js';
import {mountMotion} from '../assets/motion.js';
import {REVEAL} from './motion-spec.js';
import {rafBatched} from '../assets/schedule.js';

const $ = id => document.getElementById(id);
const NO_LIMIT = 40;                       // the slider's top position (21) means "no limit"
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
const readoutPaint = mountMotion($('verdictwrap'));   // reveal: the wait-time curve draws on first load

const PRESETS = {
  overloaded: {demand: 6, size: 4, team: 4, wip: 12, v: 'high'},
  nolimit:    {demand: 4, size: 4, team: 4, wip: 21, v: 'med'},
  healthy:    {demand: 3, size: 4, team: 4, wip: 4,  v: 'med'},
};

let variability = 'high';
let lastSvg = '', lastResult = null, lastSweep = null, lastKnee = 1, lastParams = null;
let sweepKey = '', debTimer = null, rafId = 0, hashTimer = null;
let lastBatchSvg = '', lastEcon = null, lastTriageSvg = '', lastTriage = null, triageKey = '';

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
  readoutPaint(svg, REVEAL); lastSvg = svg;   // curve draws on first load; later renders just swap
  $('verdict').textContent = readoutVerdict(result);

  lastEcon = batchEconomics(econParams());
  const batchSvg = renderBatch(lastEcon, econParams(), ctx);
  if(batchSvg !== lastBatchSvg){ $('batchwrap').innerHTML = batchSvg; lastBatchSvg = batchSvg; }

  const backlogNow = +$('backlog').value;
  const tKey = JSON.stringify({...p, q: backlogNow, k: lastKnee});
  if(tKey !== triageKey){ lastTriage = leverTriage(p, {initialBacklog: backlogNow, knee: lastKnee}); triageKey = tKey; }
  const triageSvg = renderTriage(lastTriage, p, backlogNow, ctx);
  if(triageSvg !== lastTriageSvg){ $('triagewrap').innerHTML = triageSvg; lastTriageSvg = triageSvg; }

  restartAnim(result);
  clearTimeout(hashTimer);
  hashTimer = setTimeout(() => writeHashState({d: p.demandPerWeek, s: p.itemDays, t: p.team,
    w: +$('wip').value, v: variability, tc: +$('tcost').value, hc: +$('hcost').value,
    b: +$('batch').value, q: backlogNow}), 400);
}
function refresh(){ cancelAnimationFrame(rafId); rafId = requestAnimationFrame(doRefresh); }
function schedule(){ clearTimeout(debTimer); debTimer = setTimeout(refresh, 120); }

/* ---------- controls ---------- */
for(const id of ['demand', 'size', 'team', 'wip', 'tcost', 'hcost', 'batch', 'backlog'])
  $(id).addEventListener('input', schedule);
$('variability').addEventListener('click', e => {
  const b = e.target.closest('button');
  if(!b) return;
  variability = b.dataset.v;
  for(const x of $('variability').children) x.classList.toggle('on', x === b);
  schedule();
});
$('presets').addEventListener('click', e => {
  const b = e.target.closest('.chip');
  if(!b) return;
  const p = PRESETS[b.dataset.preset];
  $('demand').value = p.demand; $('size').value = p.size; $('team').value = p.team; $('wip').value = p.wip;
  variability = p.v;
  for(const x of $('variability').children) x.classList.toggle('on', x.dataset.v === p.v);
  for(const x of $('presets').querySelectorAll('.chip')) x.classList.toggle('on', x === b);
  schedule();
});

/* ---------- canvas strip ---------- */
/* Replays the trace's final window on a 12s loop. Items: backlog column →
   in-progress dots sliding left→right by work progress → done counter. */
const strip = $('strip');
let animState = null, animRaf = 0, animStart = 0;

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
  const note = $('animnote');
  if(reducedMotion.matches || !result.events){
    note.textContent = 'motion off — steady-state averages shown';
    $('cbacklog').textContent = Math.max(0, Math.round(result.backlogSlopePerWeek * 10)) || (result.utilisation > 0.95 ? '↑' : '~0');
    $('cwip').textContent = result.impliedWip.toFixed(1);
    $('cdone').textContent = result.throughputPerWeek.toFixed(1) + '/wk';
    drawFrame(null, 0);
    return;
  }
  const tEnd = result.events.length ? result.events[result.events.length - 1].t : 0;
  const windowDays = 18 * WEEK;
  animState = {items: buildTimeline(result.events), t0: Math.max(0, tEnd - windowDays), t1: tEnd};
  note.textContent = 'replaying the last ' + Math.round(windowDays / WEEK) + ' simulated weeks on a 12s loop';
  animStart = performance.now();
  const loop = now => {
    const frac = ((now - animStart) / 12000) % 1;
    drawFrame(animState, animState.t0 + frac * (animState.t1 - animState.t0));
    animRaf = requestAnimationFrame(loop);
  };
  animRaf = requestAnimationFrame(loop);
}

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
  getSvg: () => lastSvg || null, slug});
wireExports({buttons: {dlsvg: $('dlbatchsvg'), dlpng: $('dlbatchpng'), copypng: $('copybatchpng')},
  getSvg: () => lastBatchSvg || null, slug: () => 'flow-batch-' + (lastEcon ? lastEcon.optimum : 'x')});
wireExports({buttons: {dlsvg: $('dltriagesvg'), dlpng: $('dltriagepng'), copypng: $('copytriagepng')},
  getSvg: () => lastTriageSvg || null, slug: () => 'flow-triage-' + $('backlog').value});
$('copydoc').addEventListener('click', async () => {
  if(!lastResult) return;
  const md = markdownSummary(lastResult, lastSweep, lastKnee, lastParams,
    {econ: lastEcon, triage: lastTriage, initialBacklog: +$('backlog').value});
  try{ await navigator.clipboard.writeText(md); flash('copydoc', 'Copied'); }
  catch(e){ prompt('Copy this:', md); }
});
function flash(id, msg){
  const b = $(id), was = b.textContent;
  b.textContent = msg;
  setTimeout(() => { b.textContent = was; }, 1500);
}

/* ---------- boot ---------- */
(function boot(){
  const h = readHashState();
  if(h && isFinite(+h.d)){
    $('demand').value = +h.d; $('size').value = +h.s || 4; $('team').value = +h.t || 4;
    $('wip').value = +h.w || 4;
    if(['low', 'med', 'high'].includes(h.v)) variability = h.v;
    for(const x of $('variability').children) x.classList.toggle('on', x.dataset.v === variability);
    if(isFinite(+h.tc) && +h.tc) $('tcost').value = +h.tc;
    if(isFinite(+h.hc) && +h.hc) $('hcost').value = +h.hc;
    if(isFinite(+h.b) && +h.b) $('batch').value = +h.b;
    if(isFinite(+h.q)) $('backlog').value = +h.q;
  }
  onThemeChange(() => { lastSvg = ''; lastBatchSvg = ''; lastTriageSvg = ''; refresh(); });
  reducedMotion.addEventListener('change', refresh);
  // a resize fires many events per drag of the browser edge; coalesce to one redraw/frame
  addEventListener('resize', rafBatched(() => { if(lastResult) drawFrame(animState, animState ? animState.t1 : 0); }));
  refresh();
})();
