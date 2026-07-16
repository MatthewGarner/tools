/* Formula parsing + Monte Carlo + sensitivity live in ./engine.js (pure, tested);
   this script owns the DOM. */
import {parseNum, tokenize, parse, collectVars, evalNode,
  distMedian, effDist, Z90, simulateModel, computeSensitivity, traceDraws, sig, fmt} from './engine.js';
import {quantile, readHashState, writeHashState} from '../assets/series.js';
import {renderDriverTree} from './render-driver.js';
import {histLayout} from './histlayout.js';
import {mountPour, pourVerdict} from './pour.js';
import {confess} from './solve.js';
import {simulateCashflow} from './cashflow.js';
import {renderCashflow, cashflowMarkdown} from './render-cashflow.js';
import {measure, download, onThemeChange, themeColors as sharedThemeColors} from '../assets/app-common.js';
import {loadSaved, storeSaved, renderSavedChips} from '../assets/saved-items.js';
import {wireExports} from '../assets/exports.js';
import {autoloadExample, shouldPersist} from '../assets/mobile.js';
import {rafBatched, debounced} from '../assets/schedule.js';

/* ---------- examples ---------- */
const EXAMPLES = [
  {name:'Piano tuners in Chicago',
   f:'households * share_with_piano * tunings_per_year / (tunings_per_day * working_days)',
   v:{households:['3M','4M'], share_with_piano:['0.02','0.08'], tunings_per_year:['0.5','2'],
      tunings_per_day:['2','5'], working_days:['220','260']}},
  {name:'Weekly meeting, annual cost',
   f:'attendees * hourly_cost * meeting_hours * weeks_per_year',
   v:{attendees:['6','10'], hourly_cost:['60','120'], meeting_hours:['0.75','1.5'], weeks_per_year:['44','48']}},
  {name:'New feature revenue',
   f:'monthly_visitors * signup_rate * paid_conversion * annual_price',
   v:{monthly_visitors:['80k','200k'], signup_rate:['0.02','0.06'], paid_conversion:['0.05','0.15'], annual_price:['90','140']}},
  {name:'Availability chain',
   f:'app_up * db_up * network_up * api_up',
   v:{app_up:['0.97','0.999'], db_up:['0.98','0.9995'], network_up:['0.99','0.9999'], api_up:['0.95','0.999']}},
  {name:'Cadence economics',
   f:'decisions_per_quarter * hours_per_decision * people_in_room * hourly_cost',
   v:{decisions_per_quarter:['12','30'], hours_per_decision:['1','4'], people_in_room:['4','9'], hourly_cost:['60','120']}},
];

/* ---------- state ---------- */
const N = 20000;
const varState = new Map();           // name -> {lo:'', hi:''}
let last = null;                      // latest run: {varNames, valid, sorted, p10, p50, p90, sens, invalid}
let threshStr = '';                   // threshold input, as typed
let threshHandle = null;              // {x,y} of the draggable threshold grab tab (set in drawHist), for hit-testing
let curLayout = null;                 // the live histLayout (px/inv) so a drag can map clientX -> value
let draggingHandle = false;           // suppresses click-to-set + hover tooltip during a threshold drag
let confessSnapshot = null;           // pre-Adopt varState snapshot for the one-shot Undo
const $ = id => document.getElementById(id);

/* ---------- scenarios (A/B compare) ---------- */
let active = 'A';
let compareOn = false;
const scenStore = {A:null, B:null};   // snapshots of both scenarios
const lastBy = {A:null, B:null};      // computed results per scenario
const SEEDS = {A:0x5EED, B:0x0B5EED};
function snapshot(){
  return {
    f: $('formula').value,
    vars: new Map([...varState].map(([k, s]) => [k, {...s}])),
    thresh: threshStr,
  };
}
function loadSnap(s){
  $('formula').value = s ? s.f : '';
  varState.clear();
  if(s) for(const [k, v] of s.vars) varState.set(k, {...v});
  threshStr = s ? s.thresh : '';
  $('tin').value = threshStr;
  varRowsSig = '';
}
function renderTabs(){
  const holder = $('scentabs');
  holder.textContent = '';
  if(!compareOn){
    const b = document.createElement('button');
    b.className = 'tab';
    b.textContent = '⇄ Compare A/B';
    b.addEventListener('click', enableCompare);
    holder.appendChild(b);
    return;
  }
  for(const s of ['A', 'B']){
    const b = document.createElement('button');
    b.className = 'tab' + (s === active ? ' on' : '');
    b.dataset.s = s;
    const dot = document.createElement('span'); dot.className = 'dot';
    b.append(dot, document.createTextNode(s));
    b.setAttribute('aria-label', 'Edit scenario ' + s);
    b.addEventListener('click', () => switchTo(s));
    holder.appendChild(b);
  }
  const x = document.createElement('button');
  x.className = 'tab';
  x.textContent = '× stop comparing';
  x.addEventListener('click', disableCompare);
  holder.appendChild(x);
}
function switchTo(s){
  if(s === active) return;
  scenStore[active] = snapshot();
  active = s;
  loadSnap(scenStore[s]);
  renderTabs();
  lint();
}
function enableCompare(){
  compareOn = true;
  scenStore[active] = snapshot();
  if(!scenStore.B) scenStore.B = snapshot();   // B starts as a copy of A: change one assumption
  if(active === 'A'){ active = 'B'; loadSnap(scenStore.B); }
  renderTabs();
  lint();
}
function disableCompare(){
  compareOn = false;
  scenStore.B = null;
  lastBy.B = null;
  if(active === 'B'){ active = 'A'; loadSnap(scenStore.A); }
  renderTabs();
  lint();
}
/* full pipeline for the scenario not being edited (no DOM side effects) */
function computeScenario(snap, scen){
  if(!snap || !snap.f || !snap.f.trim()) return null;
  try{
    const ast = parse(tokenize(snap.f.trim()));
    const names = collectVars(ast, []);
    if(!names.length) return null;
    const ranges = {}, dists = {};
    for(const n of names){
      const st = snap.vars.get(n);
      if(!st) return null;
      const lo = parseNum(st.lo), hi = parseNum(st.hi);
      if(!isFinite(lo) || !isFinite(hi)) return null;
      ranges[n] = [lo, hi]; dists[n] = st.dist;
    }
    const {raw, sorted} = simulateModel({ast, varNames: names, ranges, dists}, {seed: SEEDS[scen], n: N});
    if(raw.length < N * 0.5) return null;
    return {raw, p10:quantile(sorted, .1), p50:quantile(sorted, .5), p90:quantile(sorted, .9)};
  }catch(e){ return null; }
}
function pBeatsStr(){
  const A = lastBy.A, B = lastBy.B;
  if(!A || !B) return null;
  const n = Math.min(A.raw.length, B.raw.length);
  if(!n) return null;
  let c = 0;
  for(let i = 0; i < n; i++) if(B.raw[i] > A.raw[i]) c++;
  const p = c / n;
  return p < 0.001 ? '<0.1%' : p > 0.999 ? '>99.9%' : (p * 100).toFixed(p < 0.095 ? 1 : 0) + '%';
}
function renderCompare(){
  const el = $('cmp');
  const p = compareOn ? pBeatsStr() : null;
  if(p === null){ el.style.display = 'none'; return; }
  el.style.display = 'flex';
  el.textContent = '';
  const mk = (cls, label, p50) => {
    const span = document.createElement('span');
    const sw = document.createElement('span'); sw.className = 'sw ' + cls;
    span.append(sw, document.createTextNode(label + ' P50 '));
    const b = document.createElement('b'); b.textContent = fmt(p50);
    span.appendChild(b);
    return span;
  };
  el.appendChild(mk('swA', 'A', lastBy.A.p50));
  el.appendChild(mk('swB', 'B', lastBy.B.p50));
  const pb = document.createElement('span');
  pb.append(document.createTextNode('P(B > A) = '));
  const b = document.createElement('b'); b.textContent = p;
  pb.appendChild(b);
  el.appendChild(pb);
  const note = document.createElement('span');
  note.className = 'note';
  note.textContent = 'Chart: ' + active + ' filled, ' + (active === 'A' ? 'B' : 'A') + ' outlined.';
  el.appendChild(note);
}
function threshValue(){
  if(!threshStr.trim()) return null;
  const t = parseNum(threshStr);
  return isFinite(t) ? t : null;
}
// pulled out of renderThresh() so renderResults()'s output-unchanged
// signature can read the same text without a second DOM write (batch 7)
function threshPctText(){
  const t = threshValue();
  if(!last || t === null) return '—';
  let c = 0;
  for(let i = 0; i < last.valid.length; i++) if(last.valid[i] > t) c++;
  const p = c / last.valid.length;
  return p < 0.001 ? '<0.1%' : p > 0.999 ? '>99.9%' : (p * 100).toFixed(p < 0.095 ? 1 : 0) + '%';
}
function renderThresh(){ $('tout').textContent = threshPctText(); }

function readHash(){
  try{
    const s = readHashState();
    if(!s) return null;
    if(s.a && s.b && typeof s.a.f === 'string' && typeof s.b.f === 'string') return s;
    if(s.m === 'cf' && Array.isArray(s.p)) return s;
    if(typeof s.f !== 'string' || typeof s.v !== 'object') return null;
    return s;
  }catch(e){ return null; }
}
let currentVarNames = [];
function packScen(snap){
  const v = {};
  for(const [k, st] of snap.vars) v[k] = [st.lo, st.hi, st.dist || 'auto'];
  const o = {f: snap.f, v};
  if(snap.thresh) o.t = snap.thresh;
  return o;
}
function writeHash(){
  if(!shouldPersist()) return;   // an auto-loaded example must not rewrite the blank URL until first interaction
  scenStore[active] = snapshot();
  const state = compareOn
    ? {a: packScen(scenStore.A), b: packScen(scenStore.B), on: active}
    : packScen(scenStore.A);
  writeHashState(state);
}

/* ---------- variable rows ---------- */
let varRowsSig = '';
const sparks = [];   // {canvas, name}
function renderVarRows(varNames){
  $('vars').style.display = varNames.length ? 'block' : 'none';
  const sigNow = varNames.join('|');
  if(sigNow === varRowsSig){ drawSparks(); return; }   // don't rebuild while typing
  varRowsSig = sigNow;
  sparks.length = 0;
  const holder = $('vrows');
  holder.textContent = '';
  for(const name of varNames){
    if(!varState.has(name)) varState.set(name, {lo:'', hi:'', dist:'auto'});
    const st = varState.get(name);
    if(!st.dist) st.dist = 'auto';
    const row = document.createElement('div');
    row.className = 'vrow';
    const nm = document.createElement('div');
    nm.className = 'vname mono';
    nm.textContent = name;
    nm.title = name;
    const lo = document.createElement('input');
    lo.className = 'vlo';
    lo.value = st.lo; lo.placeholder = 'low';
    lo.setAttribute('aria-label', name + ' low (90% interval)');
    const dash = document.createElement('div');
    dash.className = 'dash vdash'; dash.textContent = '–';
    const hi = document.createElement('input');
    hi.className = 'vhi';
    hi.value = st.hi; hi.placeholder = 'high';
    hi.setAttribute('aria-label', name + ' high (90% interval)');
    const sel = document.createElement('select');
    sel.setAttribute('aria-label', name + ' distribution');
    for(const [v, l] of [['auto','auto'],['logn','log-normal'],['norm','normal'],['uni','uniform']]){
      const o = document.createElement('option');
      o.value = v; o.textContent = l;
      sel.appendChild(o);
    }
    sel.value = st.dist;
    const spark = document.createElement('canvas');
    spark.className = 'spark';
    spark.setAttribute('aria-hidden', 'true');
    lo.addEventListener('input', () => { st.lo = lo.value; schedule(100); });
    hi.addEventListener('input', () => { st.hi = hi.value; schedule(100); });
    sel.addEventListener('change', () => { st.dist = sel.value; schedule(50); });
    row.append(nm, lo, dash, hi, sel, spark);
    holder.appendChild(row);
    sparks.push({canvas: spark, name});
  }
  drawSparks();
}

/* fitted-distribution sparklines */
function drawSparks(){
  const C = themeColors();
  for(const {canvas, name} of sparks){
    const st = varState.get(name);
    const w = 56, h = 26;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = w * dpr; canvas.height = h * dpr;
    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    if(!st) continue;
    const a = parseNum(st.lo), b = parseNum(st.hi);
    if(!isFinite(a) || !isFinite(b)) continue;
    const lo = Math.min(a, b), hi = Math.max(a, b);
    const fill = (active === 'A') ? C.accent : C.accent2;
    if(lo === hi){
      ctx.strokeStyle = fill; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(w/2, 4); ctx.lineTo(w/2, h-2); ctx.stroke();
      continue;
    }
    const d = effDist(st.dist, lo);
    let x0, x1, pdf;
    if(d === 'uni'){
      const pad = (hi - lo) * .18;
      x0 = lo - pad; x1 = hi + pad;
      pdf = x => (x >= lo && x <= hi) ? 1 : 0;
    } else if(d === 'logn'){
      const mu = (Math.log(lo) + Math.log(hi)) / 2;
      const sg = (Math.log(hi) - Math.log(lo)) / (2 * Z90);
      x0 = Math.exp(mu - 3.2 * sg); x1 = Math.exp(mu + 3.2 * sg);
      pdf = x => Math.exp(-((Math.log(x) - mu) ** 2) / (2 * sg * sg)) / x;
    } else {
      const mu = (lo + hi) / 2, sg = (hi - lo) / (2 * Z90);
      x0 = mu - 3.2 * sg; x1 = mu + 3.2 * sg;
      pdf = x => Math.exp(-((x - mu) ** 2) / (2 * sg * sg));
    }
    const nP = 48, ys = [];
    let max = 0;
    for(let i = 0; i < nP; i++){
      const y = pdf(x0 + (x1 - x0) * i / (nP - 1));
      ys.push(y); if(y > max) max = y;
    }
    ctx.fillStyle = fill;
    ctx.globalAlpha = .5;
    ctx.beginPath();
    ctx.moveTo(0, h - 1);
    for(let i = 0; i < nP; i++) ctx.lineTo(i / (nP - 1) * w, h - 1 - (max ? ys[i] / max : 0) * (h - 6));
    ctx.lineTo(w, h - 1);
    ctx.closePath();
    ctx.fill();
    ctx.globalAlpha = 1;
  }
}

/* ---------- lint / compute ---------- */
let timer = null;
function schedule(ms){ clearTimeout(timer); timer = setTimeout(lint, ms); }

function showPlaceholder(msg){
  $('ph').textContent = msg;
  $('ph').style.display = 'block';
  $('results').style.display = 'none';
  $('results').classList.remove('is-stale');
}
function showError(msg){
  $('err').textContent = msg;
  $('err').style.display = 'block';
  // keep the last result on screen but ghost it — the error is the only current truth
  $('results').classList.add('is-stale');
}

function lint(){
  $('err').style.display = 'none';
  const src = $('formula').value.trim();
  last = null;
  // a recompute (any edit / scenario switch) invalidates a running pour + its verdict
  pour.stop(); pourVerdictText = ''; $('pourverdict').textContent = ''; $('replay').disabled = true;
  clearConfession();   // any recompute (edit / scenario switch) invalidates a shown confession
  lastBy[active] = null;
  if(!src){
    renderVarRows([]);
    showPlaceholder('Type a formula — each name in it becomes a variable you give a range to. Ranges are 90% intervals: you’d be surprised, but not shocked, to see a value outside them.');
    return;
  }
  let ast;
  try{
    ast = parse(tokenize(src));
  }catch(e){
    showError('Can’t read the formula: ' + (e.msg || 'syntax error') + '.');
    return;
  }
  const varNames = collectVars(ast, []);
  currentVarNames = varNames;
  renderVarRows(varNames);
  if(!varNames.length){
    const v = evalNode(ast, {});
    showPlaceholder('That’s just arithmetic — it comes to ' + fmt(v) + '. Name a quantity (e.g. attendees) to make it an estimate.');
    return;
  }
  const missing = [], ranges = {};
  for(const name of varNames){
    const st = varState.get(name);
    const lo = parseNum(st.lo), hi = parseNum(st.hi);
    if(!isFinite(lo) || !isFinite(hi)) missing.push(name);
    else ranges[name] = [lo, hi];
  }
  if(missing.length){
    showPlaceholder('Waiting on ranges for: ' + missing.join(', ') + '.');
    writeHashSafe();
    return;
  }

  /* Monte Carlo — reseed so identical models always give identical numbers */
  const dists = {};
  for(const name of varNames) dists[name] = varState.get(name).dist;
  function simulate(pinName, pinValue, n){
    return simulateModel({ast, varNames, ranges, dists}, {seed: SEEDS[active], n, pinName, pinValue});
  }
  const main = simulate(null, 0, N);
  const sorted = main.sorted;
  if(sorted.length < N * 0.5){
    showPlaceholder('More than half the simulated runs produced invalid maths (divide by zero, 0^negative…). Check ranges that cross zero.');
    return;
  }
  const p10 = quantile(sorted, .10), p50 = quantile(sorted, .50), p90 = quantile(sorted, .90);

  /* sensitivity as value of information — pure, in ./engine.js (pinned runs at 8k) */
  const {sens, fullRatio} = computeSensitivity({ast, varNames, ranges, dists},
    {seed: SEEDS[active], p10, p90});

  last = {ast, ranges, dists, varNames, valid: sorted, sorted, p10, p50, p90, sens, fullRatio, invalid: N - sorted.length};
  // pour needs at least one ranged driver AND a finite all-medians point estimate to pour FROM
  // (e.g. a / b with b crossing 0 pins to a 0 divisor → no spout); disable with a reason, never a dead button.
  const meds = {}; for(const n of varNames){ const [lo, hi] = ranges[n]; meds[n] = lo === hi ? lo : distMedian(lo, hi, dists[n]); }
  const baseFinite = isFinite(evalNode(ast, meds));
  $('replay').disabled = !sens.length || !baseFinite;
  $('replay').title = (sens.length && !baseFinite) ? 'This model has no finite point estimate to pour from.' : '';
  lastBy[active] = {raw: main.raw, p10, p50, p90};
  if(compareOn){
    const other = active === 'A' ? 'B' : 'A';
    scenStore[active] = snapshot();
    lastBy[other] = computeScenario(scenStore[other], other);
  }
  renderResults();
  writeHashSafe();
}
let hashTimer = null;
function writeHashSafe(){ clearTimeout(hashTimer); hashTimer = setTimeout(writeHash, 400); }

/* ---------- render results ---------- */
let resultsSig = '';   // output-unchanged gate: skip the DOM rebuild when nothing shown would differ (batch 7)
function renderResults(){
  const r = last;
  $('ph').style.display = 'none';
  $('results').style.display = 'block';
  $('results').classList.remove('is-stale');

  const p10Text = fmt(r.p10), p50Text = fmt(r.p50), p90Text = fmt(r.p90);
  const sayText = '“Probably around ' + p50Text + ' — I’d be surprised outside ' +
    p10Text + ' to ' + p90Text + '.”';
  const ratio = (r.p10 > 0) ? r.p90 / r.p10 : NaN;
  const spreadText = isFinite(ratio)
    ? 'Spread: ×' + sig(ratio, 2) + ' (P90 / P10)' + (ratio > 10 ? ' — an order-of-magnitude answer, and that’s fine.' : '')
    : 'Spread: ' + fmt(r.p90 - r.p10) + ' (P90 − P10)';
  const notes = [];
  if(r.invalid > N * 0.01){
    notes.push(sig(100 * r.invalid / N, 2) + '% of runs hit invalid maths and were dropped — a range probably crosses zero.');
  }
  const inverted = r.varNames.filter(n => r.ranges[n][0] > r.ranges[n][1]);
  if(inverted.length){
    notes.push('Entered high-to-low: ' + inverted.map(n => n.replace(/_/g, ' ')).join(', ') + ' — read as a range either way.');
  }
  const warnText = notes.join(' ');

  const sens = r.sens;
  const sensSig = sens.map(s => s.name + ':' + s.share.toFixed(4) + ':' + s.label).join(',');
  const cmpP = compareOn ? pBeatsStr() : null;
  const cmpSig = cmpP === null ? 'off' : cmpP + '|' + fmt(lastBy.A.p50) + '|' + fmt(lastBy.B.p50) + '|' + active;
  const threshPct = threshPctText();

  // signature over everything the panel shows: percentiles, sensitivity
  // rows, compare-mode P(B>A), threshold % — mirrors merit-order's
  // svg!==lastSvg / fermi's own varRowsSig gate, just for this DOM instead
  // of an SVG string.
  const sigNow = [p10Text, p50Text, p90Text, sayText, spreadText, warnText, cmpSig, sensSig, threshPct].join('¦');
  if(sigNow === resultsSig){
    $('tout').textContent = threshPct;
    drawHist();
    renderDriverView();
    return;
  }
  resultsSig = sigNow;

  renderCompare();
  $('p10').textContent = p10Text;
  $('p50').textContent = p50Text;
  $('p90').textContent = p90Text;
  $('say').textContent = sayText;
  $('spread').textContent = spreadText;
  const w = $('warn');
  w.textContent = warnText;
  w.style.display = notes.length ? 'block' : 'none';

  /* sensitivity rows */
  const holder = $('srows');
  holder.textContent = '';
  $('sens').style.display = sens.length > 1 ? 'block' : 'none';
  if(sens.length > 1){
    const top = sens[0];
    const fullLabel = isFinite(r.fullRatio) ? '×' + sig(r.fullRatio, 2) : fmt(r.p10) + ' – ' + fmt(r.p90);
    $('senshint').textContent = top.share > 0.35
      ? 'Each bar: how much of the spread disappears if you learn that number exactly. Pin ' +
        top.name.replace(/_/g,' ') + ' and the spread drops from ' + fullLabel + ' to ' + top.label + ' — research it first.'
      : 'No single input dominates — pinning any one variable barely moves the spread. Tighten the top two together.';
    for(const s of sens){
      const row = document.createElement('div');
      row.className = 'srow';
      const nm = document.createElement('div');
      nm.className = 'sn mono'; nm.textContent = s.name; nm.title = s.name;
      const track = document.createElement('div'); track.className = 'track';
      const bar = document.createElement('div'); bar.className = 'bar';
      bar.style.width = Math.max(2, Math.round(s.share * 100)) + '%';
      track.appendChild(bar);
      const pct = document.createElement('div');
      pct.className = 'sp';
      pct.textContent = '→ ' + s.label;
      pct.title = 'Spread if ' + s.name + ' were known exactly';
      row.append(nm, track, pct);
      holder.appendChild(row);
    }
  }
  $('tout').textContent = threshPct;
  drawHist();
  renderDriverView();
}

/* ---------- driver-tree view (#73) ---------- */
let view = 'dist', lastTreeSvg = '';
function renderDriverView(){
  if(view !== 'tree' || !last) return;
  const svg = renderDriverTree({...last, scenLabel: compareOn ? active : null},
    {colors: themeColors(), measure});
  if(svg !== lastTreeSvg){ $('driverwrap').innerHTML = svg; lastTreeSvg = svg; }
}
function applyView(){
  const tree = view === 'tree';
  $('viewdist').classList.toggle('on', !tree);
  $('viewtree').classList.toggle('on', tree);
  $('viewdist').setAttribute('aria-selected', String(!tree));
  $('viewtree').setAttribute('aria-selected', String(tree));
  $('driverwrap').hidden = !tree;
  document.querySelector('.histwrap').hidden = tree;
  $('replay').hidden = tree;                    // the pour is dist-view only
  $('pourverdict').hidden = tree;
  if(tree){ pour.stop(); clearConfession(); }   // the confession is dist-view only too
  $('threshrow').hidden = tree;
  $('png').hidden = tree;
  $('treesvg').hidden = !tree;
  $('treepng').hidden = !tree;
  renderDriverView();
}
$('viewdist').addEventListener('click', () => { view = 'dist'; applyView(); });
$('viewtree').addEventListener('click', () => { view = 'tree'; applyView(); });
const treeSlug = () => 'drivers-' + ($('formula').value.trim().split(/[^A-Za-z0-9_]/)[0] || 'model');
wireExports({buttons: {dlsvg: $('treesvg'), dlpng: $('treepng')},
  getSvg: () => lastTreeSvg || null, slug: treeSlug});

/* ---------- histogram ---------- */
let bins = [], histGeom = null;
function themeColors(){
  return {...sharedThemeColors(), accent2: getComputedStyle(document.documentElement).getPropertyValue('--accent2').trim()};
}
function drawHist(hoverIdx){
  const r = last;
  if(!r) return;
  const canvas = $('hist');
  const cw = canvas.clientWidth, ch = 180;
  const dpr = window.devicePixelRatio || 1;
  canvas.width = Math.round(cw * dpr);
  canvas.height = Math.round(ch * dpr);
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, cw, ch);
  const C = themeColors();

  const tv = threshValue();
  const L = histLayout(r.sorted, {width: cw, threshold: tv});   // the shared geometry seam
  curLayout = L.ok ? L : null;                                   // the drag maps clientX -> value through this
  if(!L.ok) return;
  const {lo, hi, useLog, tx, inv, tlo, thi, NB, px, cmax} = L;
  bins = L.bins;
  const padT = 26, padB = 20;         // drawing constants — stay local to drawHist
  const plotH = ch - padT - padB;
  const bw = cw / NB;

  for(let b = 0; b < NB; b++){
    const bin = bins[b];
    const h = bin.count / cmax * plotH;
    if(h < 0.5) continue;
    ctx.fillStyle = (active === 'A') ? C.accent : C.accent2;
    const base = (tv === null) ? 0.82 : ((bin.v0 + bin.v1) / 2 > tv ? 0.95 : 0.4);
    ctx.globalAlpha = (hoverIdx === b) ? 1 : base;
    const bx = b * bw + 1, bwv = Math.max(1, bw - 2), by = padT + plotH - h;
    ctx.beginPath();
    if(ctx.roundRect) ctx.roundRect(bx, by, bwv, h, [3, 3, 0, 0]);
    else ctx.rect(bx, by, bwv, h);
    ctx.fill();
  }
  ctx.globalAlpha = 1;

  /* baseline */
  ctx.strokeStyle = C.border;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(0, padT + plotH + 0.5);
  ctx.lineTo(cw, padT + plotH + 0.5);
  ctx.stroke();

  /* percentile markers */
  ctx.font = '600 11px -apple-system, BlinkMacSystemFont, sans-serif';
  for(const [v, name] of [[r.p10, 'P10'], [r.p50, 'P50'], [r.p90, 'P90']]){
    const x = px(v);
    if(x < 0 || x > cw) continue;
    ctx.strokeStyle = C.ink;
    ctx.lineWidth = name === 'P50' ? 1.5 : 1;
    ctx.setLineDash(name === 'P50' ? [] : [3, 3]);
    ctx.beginPath();
    ctx.moveTo(x + 0.5, padT - 4);
    ctx.lineTo(x + 0.5, padT + plotH);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = C.ink;
    ctx.textAlign = name === 'P10' ? 'right' : (name === 'P90' ? 'left' : 'center');
    const lx = name === 'P10' ? x - 4 : (name === 'P90' ? x + 4 : x);
    ctx.fillText(name, lx, padT - 8);
  }
  /* inactive scenario as a step outline, own-max normalised */
  if(compareOn){
    const other = lastBy[active === 'A' ? 'B' : 'A'];
    if(other && other.raw && other.raw.length){
      const oc = (active === 'A') ? C.accent2 : C.accent;
      const counts2 = new Array(NB).fill(0);
      for(const v of other.raw){
        if(v < lo || v > hi || (useLog && v <= 0)) continue;
        let b2 = Math.floor((tx(v) - tlo) / (thi - tlo) * NB);
        if(b2 === NB) b2 = NB - 1;
        if(b2 >= 0 && b2 < NB) counts2[b2]++;
      }
      const cmax2 = Math.max(...counts2);
      if(cmax2 > 0){
        ctx.strokeStyle = oc;
        ctx.lineWidth = 2;
        ctx.beginPath();
        for(let b2 = 0; b2 < NB; b2++){
          const y = padT + plotH - counts2[b2] / cmax2 * plotH;
          const x0 = b2 * bw, x1 = (b2 + 1) * bw;
          if(b2 === 0) ctx.moveTo(x0, y); else ctx.lineTo(x0, y);
          ctx.lineTo(x1, y);
        }
        ctx.stroke();
      }
    }
  }
  /* threshold line + draggable grab handle */
  threshHandle = null;
  if(tv !== null && tv >= lo && tv <= hi){
    const x = px(tv);
    ctx.strokeStyle = C.err;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(x + 0.5, padT - 4);
    ctx.lineTo(x + 0.5, padT + plotH);
    ctx.stroke();
    // the grab handle: a small rounded tab at the top of the line — the ONLY place the drag starts
    const hw2 = 7, hh = 10, hy = padT - 4 - hh;
    ctx.fillStyle = C.err;
    ctx.beginPath();
    if(ctx.roundRect) ctx.roundRect(x - hw2, hy, hw2 * 2, hh, 3); else ctx.rect(x - hw2, hy, hw2 * 2, hh);
    ctx.fill();
    // grip lines
    ctx.strokeStyle = C.card; ctx.lineWidth = 1;
    for(const dx of [-2.5, 0, 2.5]){ ctx.beginPath(); ctx.moveTo(x + dx, hy + 3); ctx.lineTo(x + dx, hy + hh - 3); ctx.stroke(); }
    threshHandle = {x, y: hy + hh / 2};
  }
  /* axis end labels */
  ctx.fillStyle = C.muted;
  ctx.font = '11px ui-monospace, Menlo, monospace';
  ctx.textAlign = 'left';
  ctx.fillText(fmt(lo), 2, ch - 5);
  ctx.textAlign = 'right';
  ctx.fillText(fmt(hi), cw - 2, ch - 5);
  histGeom = {cw};
}

/* histogram hover */
(function(){
  const canvas = $('hist'), tip = $('tip');
  let lastHover = -1, downOnHandle = false;
  const HITPAD = 22;   // half of a 44px coarse-pointer hit box around the grab handle
  const valAt = clientX => {
    const L = curLayout; if(!L) return null;
    const rect = canvas.getBoundingClientRect();
    const x = Math.max(0, Math.min(rect.width, clientX - rect.left));
    return Math.max(L.lo, Math.min(L.hi, L.inv(L.tlo + (x / rect.width) * (L.thi - L.tlo))));   // clamp to axis
  };
  canvas.addEventListener('pointermove', e => {
    if(draggingHandle){                                   // M2: no hover tooltip during a drag; move the line live
      const v = valAt(e.clientX); if(v === null) return;
      threshStr = fmt(v); $('tin').value = threshStr; renderThresh(); drawHist();
      e.preventDefault(); return;
    }
    if(!bins.length) return;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const idx = Math.max(0, Math.min(bins.length - 1, Math.floor(x / (rect.width / bins.length))));
    const b = bins[idx];
    tip.style.display = 'block';
    tip.style.left = (b.x + b.w / 2) + 'px';
    tip.style.top = '26px';
    tip.textContent = fmt(b.v0) + ' – ' + fmt(b.v1) + ' · ' + (b.share * 100).toFixed(1) + '% of runs';
    if(idx !== lastHover){ lastHover = idx; drawHist(idx); }
  });
  canvas.addEventListener('pointerleave', () => {
    tip.style.display = 'none';
    lastHover = -1;
    drawHist();
  });
  canvas.addEventListener('pointerdown', e => {                     // drag starts ONLY on the handle
    if(!threshHandle) return;
    const rect = canvas.getBoundingClientRect();
    if(Math.abs(e.clientX - rect.left - threshHandle.x) > HITPAD ||
       Math.abs(e.clientY - rect.top - threshHandle.y) > HITPAD) return;
    downOnHandle = true; draggingHandle = true;
    try{ canvas.setPointerCapture(e.pointerId); }catch(_){}
    tip.style.display = 'none';
    e.preventDefault();
  });
  const endDrag = e => {
    if(!draggingHandle) return;
    draggingHandle = false;
    try{ canvas.releasePointerCapture(e.pointerId); }catch(_){}
    writeHashSafe();
    runConfession();                                               // the solver runs on release
    requestAnimationFrame(() => { downOnHandle = false; });        // keep the flag through the click that follows (M3)
  };
  canvas.addEventListener('pointerup', endDrag);
  canvas.addEventListener('pointercancel', endDrag);
  canvas.addEventListener('click', e => {
    if(!bins.length || downOnHandle) return;                       // M3: a tap on the handle must not jump T
    const rect = canvas.getBoundingClientRect();
    const idx = Math.max(0, Math.min(bins.length - 1, Math.floor((e.clientX - rect.left) / (rect.width / bins.length))));
    const b = bins[idx];
    threshStr = fmt((b.v0 + b.v1) / 2);
    $('tin').value = threshStr;
    renderThresh();
    drawHist();
    writeHashSafe();
    runConfession();
  });
})();
const confessDebounced = debounced(runConfession, 500);   // I3: the typed path must not solve per keystroke
$('tin').addEventListener('input', () => {
  threshStr = $('tin').value;
  renderThresh();          // cheap P(>T), per keystroke
  drawHist();
  writeHashSafe();
  confessDebounced();      // the solver, debounced
});

/* ---------- "Replay the maths" — the pour ---------- */
const pour = mountPour($('hist'), document.querySelector('.histwrap'));
let pourVerdictText = '';
const reducedMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
function replay(){
  if(!last || !last.sens || !last.sens.length || view !== 'dist' || pageMode !== 'est') return;
  const model = {ast: last.ast, varNames: last.varNames, ranges: last.ranges, dists: last.dists};
  const order = last.sens.map(s => s.name);
  const trace = traceDraws(model, {seed: SEEDS[active], g: 500, order});
  if(!trace.ok) return;
  const cw = $('hist').clientWidth;
  let layout = histLayout(last.sorted, {width: cw, threshold: threshValue()});
  if(!layout.ok) return;
  // >5% grains ≤0-under-log or off-axis → re-layout linear for the pour (spec I1)
  const bad = (layout.useLog ? trace.draws.filter(d => d.steps.some(x => x <= 0)).length : 0) +
    trace.draws.filter(d => d.y < layout.lo || d.y > layout.hi).length + trace.dropped;
  if(bad / 500 > 0.05) layout = histLayout(last.sorted, {width: cw, forceLinear: true});
  const C = themeColors();
  const colors = {card: C.card, line: C.border, ink: C.ink, muted: C.muted, faint: C.muted,
    accent: (active === 'A') ? C.accent : C.accent2};
  const shareByName = Object.fromEntries(last.sens.map(s => [s.name, s.share]));
  const rows = trace.order.map(n => ({name: n, share: shareByName[n] || 0}));
  const v = pourVerdict(trace, layout, {names: Object.fromEntries(last.varNames.map(n => [n, n]))});
  pourVerdictText = v.text;
  $('pourverdict').textContent = v.text;
  pour.play(trace, layout, rows, colors, {reduced: reducedMotion(), dom: v.topName});
}
$('replay').addEventListener('click', replay);
// press-and-hold on the P50 tile is the accelerator (pointerdown only — not also click)
$('p50').addEventListener('pointerdown', e => { e.preventDefault(); replay(); });
$('p50').addEventListener('contextmenu', e => { e.preventDefault(); });

/* ---------- "What must be true" — the confession ---------- */
let lastConfess = null;   // {c, T} cache so a theme flip repaints without re-solving
const asciiNum = x => sig(x, 3).replace(/−/g, '-').replace(/e\+/g, 'e');   // parseNum rejects U+2212 AND e+
const nmOf = n => n.replace(/_/g, ' ');
const stretchLabel = r => r.kind === 'mult'
  ? '×' + r.factor.toFixed(1) + ' stretch'
  : 'shifted ' + (r.delta >= 0 ? '+' : '−') + fmt(Math.abs(r.delta));
function clearConfession(){
  document.querySelectorAll('.cghost').forEach(el => el.remove());
  const v = $('confessverdict'); v.textContent = ''; v.className = 'confessverdict'; v.hidden = true;
  lastConfess = null;
}
function drawGhostSpark(canvas, lo, hi, d, color){
  const w = 56, h = 26, dpr = window.devicePixelRatio || 1;
  canvas.width = w * dpr; canvas.height = h * dpr;
  const ctx = canvas.getContext('2d'); ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);
  const a = Math.min(lo, hi), b = Math.max(lo, hi); let x0, x1, pdf;
  if(d === 'uni'){ const pad = (b - a) * .18; x0 = a - pad; x1 = b + pad; pdf = x => (x >= a && x <= b) ? 1 : 0; }
  else if(d === 'logn' && a > 0){ const mu = (Math.log(a) + Math.log(b)) / 2, sg = (Math.log(b) - Math.log(a)) / (2 * Z90);
    x0 = Math.exp(mu - 3.2 * sg); x1 = Math.exp(mu + 3.2 * sg);
    pdf = x => x > 0 ? Math.exp(-((Math.log(x) - mu) ** 2) / (2 * sg * sg)) / x : 0; }
  else { const mu = (a + b) / 2, sg = (b - a) / (2 * Z90); x0 = mu - 3.2 * sg; x1 = mu + 3.2 * sg;
    pdf = x => Math.exp(-((x - mu) ** 2) / (2 * sg * sg)); }
  const N = 40, ys = []; let pmax = 0;
  for(let i = 0; i <= N; i++){ const p = pdf(x0 + (x1 - x0) * i / N); ys.push(p); if(p > pmax) pmax = p; }
  ctx.strokeStyle = color; ctx.lineWidth = 1.5; ctx.setLineDash([3, 2]); ctx.beginPath();
  for(let i = 0; i <= N; i++){ const x = i / N * w, y = h - 2 - ys[i] / (pmax || 1) * (h - 6); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }
  ctx.stroke(); ctx.setLineDash([]);
}
function renderGhost(r, primary){
  const idx = currentVarNames.indexOf(r.varName);
  const rows = $('vrows').querySelectorAll('.vrow');   // static, class-scoped ⇒ ignores inserted .cghost
  if(idx < 0 || idx >= rows.length) return;
  const C = themeColors(), over = r.normCost > 1;
  const g = document.createElement('div'); g.className = 'cghost' + (over ? ' over' : '');
  const spark = document.createElement('canvas'); spark.className = 'cspark'; spark.setAttribute('aria-hidden', 'true');
  const txt = document.createElement('span'); txt.className = 'ctxt';
  txt.textContent = '→ ' + fmt(r.range[0]) + ' – ' + fmt(r.range[1]) + ' (' + stretchLabel(r) + ')';
  g.append(spark, txt);
  if(primary){
    const adopt = document.createElement('button'); adopt.className = 'adopt'; adopt.type = 'button'; adopt.textContent = 'Adopt';
    adopt.addEventListener('click', () => adoptConfession(r));
    g.appendChild(adopt);
  }
  rows[idx].after(g);
  drawGhostSpark(spark, r.range[0], r.range[1], r.dist, over ? C.err : (active === 'A' ? C.accent : C.accent2));
}
function paintConfession(){
  document.querySelectorAll('.cghost').forEach(el => el.remove());
  if(!lastConfess) return;
  const {c, T} = lastConfess, v = $('confessverdict'); v.hidden = false; v.className = 'confessverdict';
  if(c === 'even'){ v.textContent = 'You’re already at even odds for ' + fmt(T) + '.'; return; }
  if(c.best){
    renderGhost(c.best, true);
    for(const alt of c.alternates.slice(0, 3)) renderGhost(alt, false);
    const lead = c.dir < 0 ? 'To keep this under ' + fmt(T) + ', you’d have to believe '
                           : 'For even odds at ' + fmt(T) + ', believe ';
    const tail = c.alternates.length
      ? ' — the cheapest single change. Or ' + c.alternates.slice(0, 2).map(a => nmOf(a.varName) + ' ' + stretchLabel(a)).join(', ') + '.'
      : ' — the cheapest single change.';
    v.textContent = '';
    v.append(document.createTextNode(lead));
    const b = document.createElement('b');
    b.textContent = nmOf(c.best.varName) + ' ≈ ' + fmt(c.best.range[0]) + '–' + fmt(c.best.range[1]);
    if(c.best.normCost > 1) b.className = 'over';
    v.append(b, document.createTextNode(' (' + stretchLabel(c.best) + ')' + tail));
  } else if(c.pair && c.pair.feasible){
    renderGhost(c.pair.a, false); renderGhost(c.pair.b, false);
    v.textContent = 'No single assumption gets you to ' + fmt(T) + '. The cheapest pair, moved together: '
      + nmOf(c.pair.a.varName) + ' ' + stretchLabel(c.pair.a) + ' and ' + nmOf(c.pair.b.varName) + ' ' + stretchLabel(c.pair.b) + '.';
  } else {
    v.textContent = 'Nothing plausible gets you to ' + fmt(T) + '.';
  }
}
function runConfession(){
  clearConfession();
  if(!last || threshValue() === null || view !== 'dist' || pageMode !== 'est') return;
  const T = threshValue();
  if(last.p50 && Math.abs(T - last.p50) / Math.abs(last.p50) < 0.02){ lastConfess = {c: 'even', T}; paintConfession(); return; }   // M4
  const model = {ast: last.ast, varNames: last.varNames, ranges: last.ranges, dists: last.dists};
  lastConfess = {c: confess(model, {seed: SEEDS[active], target: T}), T};
  paintConfession();
}
function adoptConfession(r){
  const snap = new Map([...varState].map(([k, s]) => [k, {...s}]));   // pre-adopt snapshot for Undo (closure-local)
  const st = varState.get(r.varName);
  st.lo = asciiNum(r.range[0]); st.hi = asciiNum(r.range[1]);
  varRowsSig = '';   // I4: force renderVarRows to repaint the input values
  lint();            // clears the confession UI, recomputes, repaints inputs; threshold stays put
  const v = $('confessverdict'); v.hidden = false; v.className = 'confessverdict';
  v.textContent = 'Adopted — ' + nmOf(r.varName) + ' is now ' + fmt(r.range[0]) + '–' + fmt(r.range[1]) + '. ';
  const undo = document.createElement('button'); undo.className = 'adopt'; undo.type = 'button'; undo.textContent = 'Undo';
  undo.addEventListener('click', () => {
    varState.clear(); for(const [k, s] of snap) varState.set(k, s);
    varRowsSig = ''; lint();
  });
  v.appendChild(undo);
}

/* redraw on resize + theme change */
function redrawAll(){ drawHist(); drawSparks(); lastTreeSvg = ''; renderDriverView(); cfSvg = ''; cfPaint(); }
// a ResizeObserver can fire multiple ticks per resize drag; coalesce to one redraw/frame
if(window.ResizeObserver) new ResizeObserver(rafBatched(() => { pour.stop(); drawHist(); })).observe($('hist'));
onThemeChange(() => { pour.stop(); redrawAll(); if(lastConfess) paintConfession(); });

/* ---------- chips / copy / boot ---------- */
for(const ex of EXAMPLES){
  const b = document.createElement('button');
  b.className = 'chip';
  b.textContent = ex.name;
  b.addEventListener('click', () => {
    $('formula').value = ex.f;
    for(const [k, [lo, hi]] of Object.entries(ex.v)) varState.set(k, {lo, hi, dist:'auto'});
    varRowsSig = '';
    lint();
  });
  $('chips').appendChild(b);
}
$('copy').addEventListener('click', async () => {
  if(!last) return;
  const txt = 'P10 ' + fmt(last.p10) + ' · P50 ' + fmt(last.p50) + ' · P90 ' + fmt(last.p90) +
    (last.p10 > 0 ? ' (spread ×' + sig(last.p90 / last.p10, 2) + ')' : '') +
    ' — ' + $('formula').value + ' — ' + location.href;
  try{
    await navigator.clipboard.writeText(txt);
    $('copy').textContent = 'Copied';
    setTimeout(() => { $('copy').textContent = 'Copy summary'; }, 1500);
  }catch(e){
    prompt('Copy this:', txt);
  }
});
$('copydoc').addEventListener('click', async () => {
  if(!last) return;
  const lines = [];
  lines.push('**Estimate — `' + $('formula').value.trim() + '`**');
  lines.push('');
  let head = 'P50 ≈ **' + fmt(last.p50) + '** · 90% range ' + fmt(last.p10) + ' – ' + fmt(last.p90);
  if(last.p10 > 0) head += ' (spread ×' + sig(last.p90 / last.p10, 2) + ')';
  lines.push(head);
  const t = threshValue();
  if(t !== null) lines.push('P(> ' + fmt(t) + ') = ' + $('tout').textContent);
  lines.push('');
  lines.push('Assumptions (90% intervals):');
  for(const name of currentVarNames){
    const st = varState.get(name);
    if(st) lines.push('- ' + name.replace(/_/g,' ') + ': ' + st.lo + ' – ' + st.hi);
  }
  if(last.sens.length > 1){
    const top = last.sens[0];
    const fullLabel = isFinite(last.fullRatio) ? '×' + sig(last.fullRatio, 2) : fmt(last.p10) + ' – ' + fmt(last.p90);
    lines.push('');
    lines.push('Biggest lever: ' + top.name.replace(/_/g,' ') +
      ' — knowing it exactly shrinks the spread from ' + fullLabel + ' to ' + top.label + '.');
  }
  if(pourVerdictText){ lines.push(''); lines.push(pourVerdictText); }
  if(lastConfess){ const cv = $('confessverdict').textContent.replace(/\s*(Adopt|Undo)$/, '').trim(); if(cv){ lines.push(''); lines.push(cv); } }
  const pcmp = compareOn ? pBeatsStr() : null;
  if(pcmp !== null){
    lines.push('');
    lines.push('Scenario A P50 ' + fmt(lastBy.A.p50) + ' vs scenario B P50 ' + fmt(lastBy.B.p50) +
      ' — P(B > A) = ' + pcmp + '.');
  }
  lines.push('');
  lines.push('_Log-normal fit per 90% range · 20,000 Monte Carlo samples · [live model](' + location.href + ')_');
  const txt = lines.join('\n');
  try{
    await navigator.clipboard.writeText(txt);
    $('copydoc').textContent = 'Copied';
    setTimeout(() => { $('copydoc').textContent = 'Copy for a doc'; }, 1500);
  }catch(e){
    prompt('Copy this:', txt);
  }
});
$('png').addEventListener('click', () => {
  if(!last) return;
  const src = $('hist');
  const C = themeColors();
  const pad = 24, capH = 46;
  const w = src.clientWidth, h = 180;
  const c = document.createElement('canvas');
  const scale = 2;
  c.width = (w + pad * 2) * scale;
  c.height = (h + capH + pad * 2) * scale;
  const ctx = c.getContext('2d');
  ctx.scale(scale, scale);
  ctx.fillStyle = C.card;
  ctx.fillRect(0, 0, w + pad * 2, h + capH + pad * 2);
  ctx.drawImage(src, pad, pad, w, h);
  ctx.fillStyle = C.ink;
  ctx.font = '600 13px -apple-system, BlinkMacSystemFont, sans-serif';
  ctx.fillText($('formula').value.trim(), pad, pad + h + 18);
  ctx.fillStyle = C.muted;
  ctx.font = '12px ui-monospace, Menlo, monospace';
  ctx.fillText('P10 ' + fmt(last.p10) + ' · P50 ' + fmt(last.p50) + ' · P90 ' + fmt(last.p90) +
    (last.p10 > 0 ? ' · spread ×' + sig(last.p90 / last.p10, 2) : ''), pad, pad + h + 36);
  c.toBlob(b => download('estimate.png', b), 'image/png');
});

/* ---------- saved models (localStorage) ---------- */
const SAVED_KEY = 'fermi-models';
function renderSaved(){
  const row = $('savedrow');
  renderSavedChips(row, loadSaved(SAVED_KEY), {
    title: m => m.f,
    deleteLabel: m => 'Delete saved model ' + m.name,
    onLoad: m => {
      $('formula').value = m.f;
      for(const [k, p] of Object.entries(m.v || {})){
        varState.set(k, {lo:String(p[0] ?? ''), hi:String(p[1] ?? ''), dist:p[2] || 'auto'});
      }
      threshStr = m.t || '';
      $('tin').value = threshStr;
      varRowsSig = '';
      lint();
    },
    onDelete: (m, i) => {
      const l = loadSaved(SAVED_KEY);
      l.splice(i, 1);
      storeSaved(SAVED_KEY, l);
      renderSaved();
    },
  });
  const save = document.createElement('button');
  save.className = 'chip';
  save.textContent = '＋ Save current';
  save.addEventListener('click', () => {
    const f = $('formula').value.trim();
    if(!f) return;
    const v = {};
    for(const n of currentVarNames){
      const st = varState.get(n);
      if(st) v[n] = [st.lo, st.hi, st.dist || 'auto'];
    }
    const list = loadSaved(SAVED_KEY);
    list.push({name: f.length > 26 ? f.slice(0, 24) + '…' : f, f, v, t: threshStr});
    storeSaved(SAVED_KEY, list);
    renderSaved();
  });
  row.appendChild(save);
}
renderSaved();

$('formula').addEventListener('input', () => schedule(180));

function unpackScen(o){
  const vars = new Map();
  for(const [k, pair] of Object.entries(o.v || {})){
    if(Array.isArray(pair)) vars.set(k, {lo:String(pair[0] ?? ''), hi:String(pair[1] ?? ''), dist:pair[2] || 'auto'});
  }
  return {f: o.f, vars, thresh: typeof o.t === 'string' ? o.t : ''};
}
const boot = readHash();
if(boot && boot.a && boot.b){
  compareOn = true;
  scenStore.A = unpackScen(boot.a);
  scenStore.B = unpackScen(boot.b);
  active = boot.on === 'B' ? 'B' : 'A';
  loadSnap(scenStore[active]);
}else if(boot){
  loadSnap(unpackScen(boot));
}else{
  // open alive: seed the first example so fermi greets you rendered, not blank.
  // hash-safe — writeHash() no-ops until the first real interaction (shouldPersist).
  autoloadExample(() => {
    const ex = EXAMPLES[0];
    $('formula').value = ex.f;
    for(const [k, [lo, hi]] of Object.entries(ex.v)) varState.set(k, {lo, hi, dist: 'auto'});
    varRowsSig = '';
  });
}
renderTabs();
lint();

/* ---------- cashflow mode (#13, absorbs #57) ---------- */
let pageMode = 'est';
const cf = {grain: 'year', horizon: 5, rlo: '8', rhi: '12',
  debtOn: false, dscr: '1.30', rd: '6.5', tenor: '', sizingCase: 'central',
  periods: [{lo: '-250k', hi: '-180k'}, {lo: '-40k', hi: '20k'}, {lo: '30k', hi: '90k'}, {lo: '60k', hi: '140k'}]};
const CF_EXAMPLES = [
  {name: 'New feature investment', grain: 'year', horizon: 5, rlo: '8', rhi: '12',
   periods: [{lo: '-250k', hi: '-180k'}, {lo: '-40k', hi: '20k'}, {lo: '30k', hi: '90k'}, {lo: '60k', hi: '140k'}]},
  {name: 'Runway', grain: 'month', horizon: 24, rlo: '0', rhi: '0',
   periods: [{lo: '400k', hi: '400k'}, {lo: '-45k', hi: '-25k'}]},
  {name: 'Geared build (levered IRR)', grain: 'year', horizon: 15, rlo: '9', rhi: '11',
   debtOn: true, dscr: '1.45', rd: '6.5', tenor: '9', sizingCase: 'central',
   periods: [{lo: '-7.2M', hi: '-6.8M'}, ...Array(15).fill({lo: '880k', hi: '1.35M'})]},
];
let cfResult = null, cfSpec = null, cfSig = '', cfSvg = '', cfTimer = null, cfHashTimer = null;

function setMode(m){
  pageMode = m;
  const est = m === 'est';
  $('modeest').classList.toggle('on', est);
  $('modecf').classList.toggle('on', !est);
  $('modeest').setAttribute('aria-selected', String(est));
  $('modecf').setAttribute('aria-selected', String(!est));
  $('estinputs').hidden = !est;
  $('scentabs').hidden = !est;
  $('cfinputs').hidden = est;
  $('cfresults').hidden = est;
  $('cardlabel').textContent = est ? 'Formula' : 'Cashflow';
  if(est){
    lint();
  } else {
    $('ph').style.display = 'none';
    $('results').style.display = 'none';
    renderCfRows();
    cfPaint();
  }
}
$('modeest').addEventListener('click', () => { if(pageMode !== 'est'){ setMode('est'); writeHashSafe(); } });
$('modecf').addEventListener('click', () => { if(pageMode !== 'cf'){ setMode('cf'); cfWriteHashSafe(); } });

function renderCfRows(){
  const holder = $('cfrows');
  holder.textContent = '';
  cf.periods.forEach((p, i) => {
    const row = document.createElement('div');
    row.className = 'cfrow';
    const t = document.createElement('div');
    t.className = 'cft';
    t.textContent = 't' + i;
    const lo = document.createElement('input');
    lo.value = p.lo; lo.placeholder = 'low';
    lo.setAttribute('aria-label', 'Period ' + i + ' low');
    const dash = document.createElement('div'); dash.textContent = '–';
    const hi = document.createElement('input');
    hi.value = p.hi; hi.placeholder = 'high';
    hi.setAttribute('aria-label', 'Period ' + i + ' high');
    lo.addEventListener('input', () => { p.lo = lo.value; cfSchedule(); });
    hi.addEventListener('input', () => { p.hi = hi.value; cfSchedule(); });
    row.append(t, lo, dash, hi);
    if(i > 0 && i === cf.periods.length - 1 && cf.periods.length > 2){
      const del = document.createElement('button');
      del.className = 'del'; del.textContent = '×';
      del.setAttribute('aria-label', 'Remove period ' + i);
      del.addEventListener('click', () => { cf.periods.pop(); renderCfRows(); cfSchedule(); });
      row.appendChild(del);
    } else row.appendChild(document.createElement('div'));
    holder.appendChild(row);
  });
  $('cftailnote').textContent = 't' + cf.periods.length + '…t' + cf.horizon +
    ' repeat the t' + (cf.periods.length - 1) + ' range';
  $('cfgrain').querySelectorAll('button').forEach(b => b.classList.toggle('on', b.dataset.g === cf.grain));
  $('cfrlo').value = cf.rlo; $('cfrhi').value = cf.rhi; $('cfhorizon').value = cf.horizon;
  $('cfdebton').checked = cf.debtOn;
  $('cfdebtfields').hidden = !cf.debtOn;
  $('cfdscr').value = cf.dscr; $('cfrd').value = cf.rd; $('cften').value = cf.tenor; $('cfcase').value = cf.sizingCase;
}
$('cfadd').addEventListener('click', () => {
  const last = cf.periods[cf.periods.length - 1];
  cf.periods.push({lo: last.lo, hi: last.hi});
  if(cf.horizon < cf.periods.length - 1) cf.horizon = cf.periods.length - 1;
  renderCfRows();
  cfSchedule();
});
$('cfgrain').addEventListener('click', e => {
  const b = e.target.closest('button');
  if(!b) return;
  cf.grain = b.dataset.g;
  renderCfRows();
  cfSchedule();
});
for(const id of ['cfrlo', 'cfrhi']) $(id).addEventListener('input', () => {
  cf.rlo = $('cfrlo').value; cf.rhi = $('cfrhi').value; cfSchedule();
});
$('cfhorizon').addEventListener('input', () => {
  cf.horizon = Math.max(1, Math.min(60, parseInt($('cfhorizon').value, 10) || cf.periods.length - 1));
  $('cftailnote').textContent = 't' + cf.periods.length + '…t' + cf.horizon +
    ' repeat the t' + (cf.periods.length - 1) + ' range';
  cfSchedule();
});
$('cfdebton').addEventListener('change', () => {
  cf.debtOn = $('cfdebton').checked;
  $('cfdebtfields').hidden = !cf.debtOn;
  cfSchedule();
});
for(const [id, key] of [['cfdscr', 'dscr'], ['cfrd', 'rd'], ['cften', 'tenor']])
  $(id).addEventListener('input', () => { cf[key] = $(id).value; cfSchedule(); });
$('cfcase').addEventListener('change', () => { cf.sizingCase = $('cfcase').value; cfSchedule(); });
function cfSchedule(){ clearTimeout(cfTimer); cfTimer = setTimeout(cfPaint, 150); }

function cfParse(){
  const periods = [];
  for(const p of cf.periods){
    const lo = parseNum(p.lo), hi = parseNum(p.hi);
    if(!isFinite(lo) || !isFinite(hi)) return null;
    periods.push({lo: Math.min(lo, hi), hi: Math.max(lo, hi)});
  }
  const rlo = parseFloat(cf.rlo), rhi = parseFloat(cf.rhi);
  if(!isFinite(rlo) || !isFinite(rhi)) return null;
  const spec = {periods, horizon: Math.max(cf.horizon, periods.length - 1), grain: cf.grain,
    rate: {lo: Math.min(rlo, rhi), hi: Math.max(rlo, rhi)}};
  if(cf.debtOn){
    // pass raw values through; sizeDebt gates invalid dscr / cost-of-debt cleanly
    spec.debt = {dscr: parseFloat(cf.dscr), costOfDebt: parseFloat(cf.rd) / 100,
      tenor: cf.tenor ? parseInt(cf.tenor, 10) : undefined, sizingCase: cf.sizingCase};
  }
  return spec;
}
function cfPaint(){
  if(pageMode !== 'cf') return;
  const spec = cfParse();
  if(!spec){
    $('cfwrap').innerHTML = '<p class="placeholder">Waiting on ranges — every period needs two numbers (k / M suffixes fine), and the discount rate two percentages.</p>';
    cfResult = null; cfSig = ''; cfSvg = '';
    $('cftout').textContent = '—';
    $('cfdebtbox').hidden = true;
    return;
  }
  const sig = JSON.stringify(spec);
  if(sig !== cfSig){
    cfResult = simulateCashflow(spec, {seed: 0xCA5F, n: 10000});
    cfSpec = spec;
    cfSig = sig;
    cfSvg = '';
  }
  const svg = renderCashflow(cfResult, cfSpec, {colors: themeColors()});
  if(svg !== cfSvg){ $('cfwrap').innerHTML = svg; cfSvg = svg; }
  // debt sizing only makes sense for an investment (money out then in)
  $('cfdebtbox').hidden = cfResult.framing !== 'invest';
  $('cfdebtfields').hidden = !cf.debtOn;
  cfRenderThresh();
  clearTimeout(cfHashTimer);
  cfHashTimer = setTimeout(cfWriteHash, 400);
}
function cfRenderThresh(){
  const el = $('cftout');
  const t = $('cftin').value.trim() ? parseNum($('cftin').value) : 0;
  if(!cfResult || !isFinite(t)){ el.textContent = '—'; return; }
  const s = cfResult.npvSorted;
  let lo = 0, hi = s.length;
  while(lo < hi){ const m = (lo + hi) >> 1; if(s[m] <= t) lo = m + 1; else hi = m; }
  const p = (s.length - lo) / s.length;
  el.textContent = p < 0.001 ? '<0.1%' : p > 0.999 ? '>99.9%' : (p * 100).toFixed(p < 0.095 ? 1 : 0) + '%';
}
$('cftin').addEventListener('input', cfRenderThresh);

for(const ex of CF_EXAMPLES){
  const b = document.createElement('button');
  b.className = 'chip';
  b.textContent = ex.name;
  b.addEventListener('click', () => {
    cf.grain = ex.grain; cf.horizon = ex.horizon; cf.rlo = ex.rlo; cf.rhi = ex.rhi;
    cf.periods = ex.periods.map(p => ({...p}));
    cf.debtOn = !!ex.debtOn;
    cf.dscr = ex.dscr || '1.30'; cf.rd = ex.rd || '6.5';
    cf.tenor = ex.tenor || ''; cf.sizingCase = ex.sizingCase || 'central';
    renderCfRows();
    cfPaint();
  });
  $('cfchips').appendChild(b);
}

wireExports({buttons: {dlsvg: $('cfsvg'), dlpng: $('cfpng'), copypng: $('cfcopypng')},
  getSvg: () => cfSvg || null,
  slug: () => cfResult && cfResult.framing === 'runway' ? 'runway' : 'cashflow-npv'});
$('cfcopydoc').addEventListener('click', async () => {
  if(!cfResult) return;
  const md = cashflowMarkdown(cfResult, cfSpec, location.href);
  try{
    await navigator.clipboard.writeText(md);
    $('cfcopydoc').textContent = 'Copied';
    setTimeout(() => { $('cfcopydoc').textContent = 'Copy for a doc'; }, 1500);
  }catch(e){ prompt('Copy this:', md); }
});

function cfWriteHash(){
  const state = {m: 'cf', g: cf.grain, h: cf.horizon, rl: cf.rlo, rh: cf.rhi,
    p: cf.periods.map(p => [p.lo, p.hi])};
  if(cf.debtOn){
    state.d1 = 1; state.dscr = cf.dscr; state.rd = cf.rd; state.dcase = cf.sizingCase;
    if(cf.tenor) state.ten = cf.tenor;
  }
  writeHashState(state);
}
function cfWriteHashSafe(){ clearTimeout(cfHashTimer); cfHashTimer = setTimeout(cfWriteHash, 100); }

/* cashflow boot: the hash decides the mode */
if(boot && boot.m === 'cf'){
  if(['year', 'month'].includes(boot.g)) cf.grain = boot.g;
  if(isFinite(+boot.h)) cf.horizon = Math.max(1, Math.min(60, +boot.h));
  if(typeof boot.rl === 'string') cf.rlo = boot.rl;
  if(typeof boot.rh === 'string') cf.rhi = boot.rh;
  if(Array.isArray(boot.p) && boot.p.length){
    cf.periods = boot.p.slice(0, 61).map(pair => ({lo: String(pair[0] ?? ''), hi: String(pair[1] ?? '')}));
  }
  if(boot.d1){
    cf.debtOn = true;
    if(typeof boot.dscr === 'string') cf.dscr = boot.dscr;
    if(typeof boot.rd === 'string') cf.rd = boot.rd;
    if(boot.ten != null) cf.tenor = String(boot.ten);
    if(boot.dcase === 'downside' || boot.dcase === 'central') cf.sizingCase = boot.dcase;
  }
  setMode('cf');
}
