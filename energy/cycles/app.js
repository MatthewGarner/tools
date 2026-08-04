/* State, refresh loop, edit-in-place, exports, boot. DOM lives here only. */
import {parse} from './parse.js';
import {simulate, verdict, thresholdFigure, simKey, fmtUnit} from './engine.js';
import {render as renderSvg, toMarkdown} from './render.js';
import {createEditor} from './editor.js';
import {validators, editField, addKeyLine, removeKeyLine, addedKeyTarget,
  addKeyReturnIdentity, isUntouchedKeyAdd} from './edit-targets.js';
import {readHashState, writeHashState} from '../../assets/series.js';
import {autoloadExample, shouldPersist} from '../../assets/mobile.js';
import {measure, isDark, themeColors, onThemeChange, renderWarningList, slugify, exampleChips} from '../../assets/app-common.js';
import {wireExports} from '../../assets/exports.js';
import {narrowWidth, watchNarrowBucket} from '../../assets/narrow-width.js';
import {initWorkspace, setActionsEnabled, mountTouchUndo} from '../../assets/workspace.js';
import {mountMotion} from "../../assets/motion.js";
import {REVEAL} from "./motion-spec.js";
import {attachEditInPlace} from '../../assets/edit-in-place.js';
import {paintKicker, paintMetrics, paintVerdict, resolveVerdict} from '../../assets/verdict.js';
import {verdictMenuRows, handleVerdictCommit, validVerdictInput} from '../../assets/verdict-edit.js';
import {createPreviewRevisionGuard} from './interaction-state.js';

const $ = id => document.getElementById(id);
const stageEl = $('preview');
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
let previewEip = null, verdictEip = null;

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

const previewRevision = createPreviewRevisionGuard({
  closeActive(){
    if(previewEip) previewEip.close();
    if(verdictEip) verdictEip.close();
  },
  onBlockedChange(blocked, revision){
    stageEl.toggleAttribute('inert', blocked);
    stageEl.setAttribute('aria-busy', String(blocked));
    if(blocked) stageEl.dataset.pendingRevision = String(revision);
    else {
      delete stageEl.dataset.pendingRevision;
      stageEl.dataset.renderRevision = String(revision);
    }
  },
});

/* `inert` handles real pointer/keyboard input. The capture guard also rejects
   synthetic/delayed events and proves the target still belongs to the rendered
   revision and remains connected before shared EIP sees it. */
function rejectStaleEdit(e){
  const target = e.target.closest && e.target.closest('[data-edit]');
  if(!target) return;
  const revision = Number(stageEl.dataset.renderRevision);
  const entityExists = target.isConnected && stageEl.contains(target);
  if(previewRevision.accepts(revision, entityExists)) return;
  e.preventDefault();
  e.stopImmediatePropagation();
}
stageEl.addEventListener('click', rejectStaleEdit, true);
stageEl.addEventListener('keydown', e => {
  if(e.key === 'Enter' || e.key === ' ' || e.key === 'Spacebar') rejectStaleEdit(e);
}, true);

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

function commit(res, key, revision){
  if(!previewRevision.settle(revision)) return;
  out = res; lastKey = key; pendingKey = null;
  render();                                     // renders out + sets actions ON (via setActionsEnabled(!!out))
}

function runSync(key, id){
  if(id !== seq) return;                        // superseded before we ran
  clearTimeout(timeoutId);
  __cyclesSimCount++;
  commit(simulate(model, {seed: 1, n: 5000}), key, id);
}

function markWorkerDead(){
  if(worker){ worker.terminate(); worker = null; }   // all subsequent dispatches take runSync directly
}

function onWorkerMessage({out: res, reqId}){
  if(reqId !== seq) return;                     // superseded/abandoned
  clearTimeout(timeoutId);
  commit(res, pendingKey, reqId);
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
  previewRevision.begin(id);
  setActionsEnabled(false);
  if(!worker) return runSync(key, id);          // sync path commits instantly — no wait to signal
  __cyclesSimCount++;
  busy(true);                                   // the MC is 0.5–2s off-thread; acknowledge the wait
  worker.postMessage({model, seed: 1, n: 5000, reqId: id});
  timeoutId = setTimeout(() => { markWorkerDead(); dispatch(key); }, simTimeoutMs());
}

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
/* The page's ONE verdict (Swiss 6c): the threshold band — the tool's headline,
   and the line the poster already quotes as its hero. The second-cycle and
   augmentation sentences are not repeated here; they are drawn inside the
   artefact itself, band by band, where they belong to the picture they explain. */
function renderVerdict(){
  if(!out){ paintVerdict($('verdict'), '', ''); return; }
  /* the HTML mirror honours `verdict:` too, so the page and the artefact agree */
  const vv = resolveVerdict(model.verdict, {line: verdict('threshold', out), fig: thresholdFigure(out)});
  paintVerdict($('verdict'), vv.line, vv.fig);
  /* the block is the menu-first edit target; its wrapper anchors the input */
  const raw = model.verdict == null ? '' : String(model.verdict);
  $('verdict').parentElement.dataset.raw = raw;
}
function cyclesVerdictLine(){
  return out ? resolveVerdict(model.verdict, {line: verdict('threshold', out), fig: ''}).line : '';
}
verdictEip = attachEditInPlace($('verdict').parentElement.parentElement, {
  kinds: {
    verdict: {menu: () => verdictMenuRows(model && model.verdict)},
    verdictedit: {validate: validVerdictInput, placeholder: cyclesVerdictLine},
  },
  onCommit(kind, lineNo, oldRaw, newValue){
    handleVerdictCommit(kind, newValue, {
      getText: () => editor.getText(), setText: t => editor.setText(t),
      configRe: /^(title|verdict|accent|palette|battery|spread|charge|second|drift|rte|fade|calendar|cycles|augment|discount)\s*:/i,
      getLine: cyclesVerdictLine,
    });
  },
});

/* Metrics: the battery, the warranty budget and the spread belief — every one a
   number the model states, re-read on each refresh so the row moves with the text. */
function renderMetrics(){
  const m = model;
  if(!m || !out){ paintMetrics($('metrics'), '', []); return; }
  paintMetrics($('metrics'), m.title, [
    m.battery ? `${m.battery.mw} MW / ${m.battery.mwh} MWh` : '',
    m.cycles ? `${m.cycles.budget} cycles over ${m.cycles.years} yr` : '',
    m.spread ? `spread £${Math.round(m.spread.lo)}–£${Math.round(m.spread.hi)}/MWh` : '',
  ]);
}
/* Draws from current `model`/`out` — never re-parses or re-simulates. Called
   both after a real refresh and after a memoised (sim-skipped) one, so
   theme toggles and narrow-bucket flips still update the DOM. */
/* "recomputing…" hint while the off-thread MC runs: the preview shows the STALE
   artefact for ~0.7s after a keystroke with no acknowledgement otherwise (audit). */
function busy(on){ const s = stageEl.closest('.stage'); if(s) s.classList.toggle('recomputing', on); }
function render(){
  busy(false);                                  // a result (or empty) landed — stop signalling
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
  renderMetrics();
  renderWarnings();
  setActionsEnabled(!!out && !previewRevision.blocked);
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
  if(key === null){ abandonInFlight(); previewRevision.clear(seq); out = null; lastKey = null; render(); return; }
  if(key === pendingKey) return;                // in-flight request will render this
  if(key === lastKey){ abandonInFlight(); previewRevision.clear(seq); render(); return; }   // memoised: theme/rotation/no-op/revert
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
mountTouchUndo(document.querySelector('.stage .actions'), editor);   // phones have no ⌘Z (Rule 2)
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

/* The phone card menu ("the card is the control"): each band's ⋯ opens a menu
   of the structural edits that band owns — add/remove an OPTIONAL key. Required
   keys stay directly editable through their num pills. Rows commit an explicit
   {kind,value=key} (no data-line coupling — the rewrite finds the line itself),
   so a coarse tap never blind-commits. Resolved fresh from the model each open. */
function bandMenu(m, band){
  const addRow = (key, label) => ({label: '＋ Add ' + label, commit: {kind: 'addkey', line: -1, oldRaw: '', value: key}});
  const rmRow  = (key, label) => ({label: 'Remove ' + label, danger: true, commit: {kind: 'removekey', line: -1, oldRaw: '', value: key}});
  const has = k => m.srcLines[k] != null;
  if(band === 'price')
    return [m.chargeDefaulted ? addRow('charge', 'charge cost') : rmRow('charge', 'charge (use 45% default)')];
  if(band === 'second')
    return [rmRow('second', 'second cycle')];
  if(band === 'life')
    return [
      has('drift') ? rmRow('drift', 'drift') : addRow('drift', 'drift'),
      has('discount') ? rmRow('discount', 'discount') : addRow('discount', 'discount'),
      rmRow('augment', 'augmentation'),
    ];
  return [];
}

/* edit-in-place: numeric field pills, per-band card menu (⋯), and a one-tap
   ＋ capsule on the ghost bands. All structure edits route through the pure
   add/removeKeyLine rewrites → one undoable CodeMirror dispatch each. */
let pendingKeyAdd = null;
function insertKey(add){
  const source = editor.view.state.doc.line(add.afterLine + 1);
  editor.view.dispatch({changes: {from: source.to, to: source.to, insert: '\n' + add.newLine},
    userEvent: 'input.complete'});
}
previewEip = attachEditInPlace($('preview'), {
  kinds: {
    num: {validate: validators.num},
    cardmenu: {menu: el => bandMenu(model, el.dataset.band)},
    addkey: {cycle: ['add']},   // ghost-capsule one-tap (visible, undoable); coarse tap does NOT open a picker
  },
  onCommit(kind, line, raw, value, el){
    if(kind === 'addkey'){
      const key = (el && el.dataset && el.dataset.key) || value;   // capsule carries data-key; menu row passes key as value
      const r = addKeyLine(editor.getText(), key);
      if(!r) return;
      const freshLine = r.afterLine + 1;
      insertKey(r);
      pendingKeyAdd = {line: freshLine, key};
      const returnIdentity = addKeyReturnIdentity(key);
      const focusFreshAdd = () => {
        const started = performance.now();
        const attempt = () => {
          const candidates = [...stageEl.querySelectorAll('[data-edit="' + returnIdentity.kind + '"]')];
          const target = candidates.find(node => Object.entries(returnIdentity.data)
            .every(([name, expected]) => node.dataset[name] === String(expected)));
          if(target?.isConnected && !stageEl.inert && target.getClientRects().length){
            target.focus({preventScroll: true}); return;
          }
          if(performance.now() - started < 6500) requestAnimationFrame(attempt);
          else $('railtab').focus({preventScroll: true});
        };
        requestAnimationFrame(attempt);
      };
      void previewEip.openAt(addedKeyTarget(r, key), {
        origin: el,
        onCancel(){
          if(isUntouchedKeyAdd(editor.getText(), freshLine, r.newLine)) editor.removeLine(freshLine);
          pendingKeyAdd = null;
          $('editstatus').textContent = 'Assumption creation cancelled.';
          focusFreshAdd();
        },
        onMiss(){
          pendingKeyAdd = null;
          $('editstatus').textContent = 'Assumption added. Its in-place editor could not be opened.';
          focusFreshAdd();
        },
        timeout: 6500,
      });
      return;
    }
    if(kind === 'removekey'){
      const ln = removeKeyLine(editor.getText(), value);
      if(ln >= 0) editor.removeLine(ln);
      return;
    }
    const cur = editor.getLine(line);
    const next = editField(cur, el.dataset.field, value);
    if(next === cur) return;
    if(pendingKeyAdd?.line === line){
      const source = editor.view.state.doc.line(line + 1);
      editor.view.dispatch({changes: {from: source.from, to: source.to, insert: next},
        userEvent: 'input.complete'});
      pendingKeyAdd = null;
    } else editor.replaceLine(line, next);   // dispatches through CodeMirror — undoable
  },
});

/* chips */
exampleChips($('chips'), EXAMPLES, ex => editor.setText(ex.src));

/* ---------- exports ---------- */
const isoToday = () => new Date().toISOString().slice(0, 10);
function svgString(slide){
  return out ? activeRender(slide, false, true) : null;   // forExport: width undefined => canonical 1200/1280
}
function slug(){
  return slugify(model && model.title, 'cycles');
}
wireExports({
  buttons: {dlsvg: $('dlsvg'), dlpng: $('dlpng'), copypng: $('copypng')},
  getSvg: () => svgString(false),
  getCopy: () => svgString(true),      // Copy PNG hands over the deck-shaped render
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

/* ---------- masthead + kicker: painted once ---------- */
(function(){
  const mh = $('mhdate');
  if(mh) mh.textContent = new Date().toLocaleDateString('en-GB', {day: 'numeric', month: 'short', year: 'numeric'});
  paintKicker($('kicker'), 'E1', 'What each cycle is really worth');
  $('kicker').append(' · Ember series');
})();

/* ---------- boot ---------- */
(async function(){
  const hash = await readHashState();
  let text = hash && typeof hash.t === 'string' ? hash.t : '';
  if(hash && hash.e === 0) ws.setCollapsed(true);
  if(!text){
    try{ text = localStorage.getItem('cycles-src') || ''; }catch(e){}
  }
  if(text) editor.setText(text);
  else if(!autoloadExample(() => editor.setText(EXAMPLES[0].src))) refresh();
})();

/* try-it specimens: the syntax reference inserts into the editor (2026-08-02) */
import {wireSyntaxTry} from '../../assets/syntax-try.js';
wireSyntaxTry(document.querySelector('details.syntax'), editor, ['title', 'palette', 'accent', 'verdict', 'battery', 'spread', 'charge', 'second', 'drift', 'rte', 'fade', 'calendar', 'cycles', 'augment', 'discount']);
