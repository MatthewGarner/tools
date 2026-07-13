/* State, refresh loop, edit-in-place, exports, boot. DOM lives here only. */
import {parse} from './parse.js';
import {simulate, verdict, simKey} from './engine.js';
import {render as renderSvg, toMarkdown} from './render.js';
import {createEditor} from './editor.js';
import {validators, editField} from './edit-targets.js';
import {readHashState, writeHashState} from '../../assets/series.js';
import {autoloadExample, shouldPersist} from '../../assets/mobile.js';
import {measure, isDark, themeColors, onThemeChange, renderWarningList, slugify} from '../../assets/app-common.js';
import {wireExports} from '../../assets/exports.js';
import {narrowWidth, watchNarrowBucket} from '../../assets/narrow-width.js';
import {initWorkspace, setActionsEnabled} from '../../assets/workspace.js';
import {mountMotion} from "../../assets/motion.js";
import {REVEAL} from "./motion-spec.js";
import {attachEditInPlace} from '../../assets/edit-in-place.js';

const $ = id => document.getElementById(id);
const paint = mountMotion($("preview"));

const EXAMPLES = [
  {name: 'Wexcombe base case', src:
`title: Cycle budget — Wexcombe 100MW/2h
battery: 100MW / 200MWh
spread: 35..85               // £/MWh, day-to-day 90% range
charge: 15..45
second: 35..60%              // second cycle: % of the day's best
drift: -4..0 %/yr
rte: 86..90%
fade: 0.006..0.012 %/cycle
calendar: 1.0..1.8 %/yr
cycles: 6000 over 15yr
augment: 120..180 £/kWh
discount: 7..10%`},
  {name: 'Tight warranty', src:
`title: Rationed — same asset, half the budget
battery: 100MW / 200MWh
spread: 35..85
charge: 15..45
second: 35..60%
drift: -4..0 %/yr
rte: 86..90%
fade: 0.006..0.012 %/cycle
calendar: 1.0..1.8 %/yr
cycles: 3000 over 15yr       // the warranty becomes the price-setter
augment: 120..180 £/kWh`},
  {name: 'Optimistic OEM', src:
`title: The fade debate — datasheet vs your belief
battery: 100MW / 200MWh
spread: 35..85
charge: 15..45
drift: -4..0 %/yr
rte: 88..91%
fade: 0.003..0.004 %/cycle   // the datasheet, taken at its word
calendar: 0.8..1.0 %/yr
cycles: 6000 over 15yr
augment: 120..180 £/kWh`},
];

let model = null, out = null, lastSvg = '', lastText = '';
/* Memoisation: doRefresh re-parses on every keystroke/theme-flip/resize, but
   simulate() only needs to re-run when the sim-relevant fields actually
   change (simKey excludes title/accent/palette/battery.mw/etc). lastKey
   tracks the last model actually simulated; __cyclesSimCount is exposed on
   globalThis (module-set, CSP-fine) so tests can assert the memoisation. */
let lastKey = null;
globalThis.__cyclesSimCount = 0;
let rafId = 0, debTimer = null, hashTimer = null;

/* ---------- async sim dispatch (rev-3 state machine, spec §"Refresh loop
   (app.js) — rev 3 state machine") ----------
   The Monte Carlo (~0.5-2s) runs off the main thread in a module Worker.
   pendingKey (in-flight simKey) is distinct from lastKey (last completed) so
   the boot race (watchNarrowBucket's guaranteed first-fire vs. the debounced
   edit, both calling doRefresh with the same model) can't double-dispatch.
   The one invariant that makes a stale worker response structurally unable
   to clobber the current render: every path that lands on a renderable
   result OTHER than the pending request completing (null-key, revert to
   lastKey, or a fresh dispatch superseding a different in-flight one) calls
   abandonInFlight() FIRST — clear the in-flight request's failsafe timer, bump
   seq (so a late reqId!==seq response is dropped), clear pendingKey, terminate+
   respawn the worker (stop the wasted CPU; a queued new sim must never wait
   behind an abandoned one). The clearTimeout is load-bearing: without it the
   abandoned dispatch's 5s timer survives and, ~5s later, markWorkerDead()s
   whatever worker is CURRENT then — self-killing a healthy worker and forcing
   every later edit onto the main thread for the rest of the session (review
   Critical, reproduced with a mocked-timer harness). */
let pendingKey = null, seq = 0, timeoutId = 0;
const SIM_TIMEOUT_MS = 5000;
/* test seam: a suite can shrink the failsafe window (globalThis.__cyclesSim-
   TimeoutMs) so the timeout/leak paths are exercisable in ms, not 5s. */
const simTimeoutMs = () => globalThis.__cyclesSimTimeoutMs || SIM_TIMEOUT_MS;

function spawnWorker(){
  try{
    const w = new Worker(new URL('./sim-worker.js', import.meta.url), {type: 'module'});
    w.onmessage = ({data}) => onWorkerMessage(data);
    /* only act on the CURRENT worker's error — an abandoned/terminated worker's
       stray onerror must not markWorkerDead the healthy one that replaced it
       (symmetric to onWorkerMessage's reqId!==seq guard). */
    w.onerror = () => { if(worker === w) onWorkerError(); };
    return w;
  }catch(e){ return null; }
}
let worker = spawnWorker();
globalThis.__cyclesWorkerAlive = () => worker != null;   // test hook: proves the worker wasn't self-killed

function abandonInFlight(){
  if(pendingKey === null) return;
  clearTimeout(timeoutId);                      // CRITICAL: cancel the abandoned dispatch's failsafe timer
  seq++;                                        // invalidate any in-flight/late response
  pendingKey = null;
  if(worker){ worker.terminate(); worker = spawnWorker(); }   // stop wasted CPU; fresh worker for next
}

function commit(res, key){
  out = res; lastKey = key; pendingKey = null;
  render();                                     // renders out + sets actions ON (via setActionsEnabled(!!out))
}

function runSync(key, id){
  if(id !== seq) return;                        // superseded before we ran
  clearTimeout(timeoutId);
  __cyclesSimCount++;
  commit(simulate(model, {seed: 1, n: 5000}), key);
}

function markWorkerDead(){
  if(worker){ worker.terminate(); worker = null; }   // all subsequent dispatches take runSync directly
}

function onWorkerMessage({out: res, reqId}){
  if(reqId !== seq) return;                     // superseded/abandoned
  clearTimeout(timeoutId);
  commit(res, pendingKey);
}

/* Both fallbacks (durable onerror + failsafe timeout) route through dispatch,
   which runs abandonInFlight() (bumps seq) before the sync run. That seq bump
   is what invalidates the just-terminated worker's reqId: terminate() isn't
   guaranteed to drop an already-posted message, and without the bump a late
   message for the same reqId would still pass onWorkerMessage's reqId===seq
   guard and commit with pendingKey already null → lastKey=null, corrupting the
   memo (review Important). worker is null here (markWorkerDead), so dispatch
   goes straight to runSync — no new timer, no loop. */
function onWorkerError(){
  markWorkerDead();                             // durable failure → don't retry the worker this session
  if(pendingKey !== null) dispatch(pendingKey);
}

function dispatch(key){
  abandonInFlight();                            // supersede: kill any different in-flight sim first
  pendingKey = key;
  const id = ++seq;
  setActionsEnabled(false);
  if(!worker) return runSync(key, id);
  __cyclesSimCount++;
  worker.postMessage({model, seed: 1, n: 5000, reqId: id});
  timeoutId = setTimeout(() => { markWorkerDead(); dispatch(key); }, simTimeoutMs());
}

const stageEl = $('preview');
function renderWidth(){ return narrowWidth(stageEl); }
function ctx(slide, forExport = false){
  return {colors: themeColors(), measure, slide, dark: isDark(), width: forExport ? undefined : renderWidth()};
}
function activeRender(slide, edit = false, forExport = false){
  return renderSvg(model, out, ctx(slide, forExport), {edit});
}
function renderWarnings(){
  renderWarningList($('warns'), model ? model.warnings : []);
}
/* HTML mirror of the three verdict bands the SVG draws (threshold/second/
   augment) — one <p> per band that has one, so screen readers (via the
   container's aria-live) and sighted users both get the same quotable text. */
function renderVerdict(){
  const el = $('verdict');
  el.textContent = '';
  if(!out) return;
  for(const band of ['threshold', 'second', 'augment']){
    const v = verdict(band, out);
    if(!v) continue;
    const p = document.createElement('p');
    p.textContent = v;
    el.appendChild(p);
  }
}
/* Draws from current `model`/`out` — never re-parses or re-simulates. Called
   both after a real refresh and after a memoised (sim-skipped) one, so
   theme toggles and narrow-bucket flips still update the DOM. */
function render(){
  const pv = $('preview');
  if(!out){
    lastSvg = ''; paint.reset();
    pv.innerHTML = '<p class="placeholder">' + (lastText.trim()
      ? 'Missing: ' + model.missing.join(', ') + ' — or load an example.'
      : 'Start typing — or load an example.') + '</p>';
  } else {
    const svg = activeRender(false, true);
    paint(svg, REVEAL); lastSvg = svg;
  }
  renderVerdict();
  renderWarnings();
  setActionsEnabled(!!out);
}
function persistAndScheduleHash(text){
  try{ if(shouldPersist()) localStorage.setItem('cycles-src', text); }catch(e){}
  clearTimeout(hashTimer);
  hashTimer = setTimeout(writeHash, 400);
}
function doRefresh(){
  const text = editor.getText();
  lastText = text;
  model = parse(text);
  const key = simKey(model);
  persistAndScheduleHash(text);                 // the existing localStorage + writeHash timer, always
  if(key === null){ abandonInFlight(); out = null; lastKey = null; render(); return; }
  if(key === pendingKey) return;                // in-flight request will render this
  if(key === lastKey){ abandonInFlight(); render(); return; }   // memoised: theme/rotation/no-op/revert
  dispatch(key);                                // key is new → fresh sim, off the main thread
}
function refresh(){
  cancelAnimationFrame(rafId);
  rafId = requestAnimationFrame(doRefresh);
}
const editor = createEditor({
  parent: $('cmhost'),
  doc: '',
  onChange(){ clearTimeout(debTimer); debTimer = setTimeout(refresh, 120); },
});
function writeHash(){
  const state = {t: editor.getText()};
  if(ws.collapsed()) state.e = 0;
  if(shouldPersist()) writeHashState(state);
}
const ws = initWorkspace({
  workspace: $('workspace'), tab: $('railtab'),
  preview: $('preview'), zoomHost: $('zoomctl'),
  onCollapseChange(){ clearTimeout(hashTimer); hashTimer = setTimeout(writeHash, 100); },
});

/* edit-in-place: one numeric kind; the field rides on the element */
attachEditInPlace($('preview'), {
  kinds: {num: {validate: validators.num}},
  onCommit(kind, line, raw, value, el){
    const cur = editor.getLine(line);
    const next = editField(cur, el.dataset.field, value);
    if(next === cur) return;
    editor.replaceLine(line, next);   // dispatches through CodeMirror — undoable
  },
});

/* chips */
for(const ex of EXAMPLES){
  const b = document.createElement('button');
  b.className = 'chip';
  b.textContent = ex.name;
  b.addEventListener('click', () => editor.setText(ex.src));
  $('chips').appendChild(b);
}

/* ---------- exports ---------- */
function svgString(slide){
  return out ? activeRender(slide, false, true) : null;   // forExport: width undefined => canonical 1200/1280
}
function slug(){
  return slugify(model && model.title, 'cycles');
}
wireExports({
  buttons: {dlsvg: $('dlsvg'), dlpng: $('dlpng'), dlslide: $('dlslide'), copypng: $('copypng')},
  getSvg: () => svgString(false),
  getSvgSlide: () => svgString(true),
  slug,
});
/* copymd keeps its inline handler: on clipboard failure it falls back to a
   prompt() with the markdown so it's still copyable — wireExports has no
   equivalent fallback, so migrating would lose that behaviour. */
$('copymd').addEventListener('click', async () => {
  if(!out) return;
  const md = toMarkdown(model, out);
  try{ await navigator.clipboard.writeText(md); flash('copymd', 'Copied', 1500); }
  catch(e){ prompt('Copy this:', md); }
});
function flash(id, msg, ms){
  const b = $(id), was = b.textContent;
  b.textContent = msg;
  setTimeout(() => { b.textContent = was; }, ms);
}

/* ---------- theme ---------- */
function rerender(){ lastSvg = ''; paint.reset(); refresh(); }
onThemeChange(rerender);

/* ---------- narrow-bucket resize: re-render only when the bucket flips ---------- */
watchNarrowBucket(stageEl, rerender);

/* ---------- boot ---------- */
(function(){
  const hash = readHashState();
  let text = hash && typeof hash.t === 'string' ? hash.t : '';
  if(hash && hash.e === 0) ws.setCollapsed(true);
  if(!text){
    try{ text = localStorage.getItem('cycles-src') || ''; }catch(e){}
  }
  if(text) editor.setText(text);
  else if(!autoloadExample(() => editor.setText(EXAMPLES[0].src))) refresh();
})();
