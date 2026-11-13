import {saveTrackedWork} from '../assets/work-metadata.js';
import {offer as provide} from '../assets/recent-ui.js';
import {mountModelLink} from '../assets/model-link.js';
/* State, refresh loop, saved trees, exports, boot. */
import {parse} from './parse.js';
import {evalDet, findByLine, probabilityActionState, refMid, sliderExtent, loadBearing, hingesBeyondTrack} from './engine.js';
import {pricedCopy, seamCopy} from './format.js';
import {render, treeVerdictParts} from './render.js';
import {createEditor} from './editor.js';
import {insertAndSelect, applyLineOps} from '../assets/editor-common.js';
import {readHashState, writeHashState, fmt} from '../assets/series.js';
import {autoloadExample, shouldPersist} from '../assets/mobile.js';
import {measure, isDark, themeColors, onThemeChange, renderWarningList, slugify} from '../assets/app-common.js';
import {wireExports} from '../assets/exports.js';
import {wirePrintArtefact, lightTheme} from '../assets/print-artefact.js';
import {loadChapterFonts, chapterFontsReady, embedChapterFonts} from '../assets/chapter-font-loader.js';
import {rafBatched} from '../assets/schedule.js';
import {narrowWidth, watchNarrowBucket} from '../assets/narrow-width.js';
import {paintKicker, paintMetrics} from '../assets/verdict.js';
import {initWorkspace, setActionsEnabled, mountTouchUndo} from '../assets/workspace.js';
import {mountMotion, scrollPageTo} from "../assets/motion.js";
import {REVEAL} from "./motion-spec.js";
import {attachEditInPlace, cardMenu} from '../assets/edit-in-place.js';
import {setVerdictText, verdictMenuRows, handleVerdictCommit, validVerdictInput} from '../assets/verdict-edit.js';
import {validators, applies, subtreeRange, childLineFor, applyExplore, exploreProbOps, hasIncomingProb} from './edit-targets.js';
import {STARTER} from './starter.js';
import {createEvalMemo, pendingResults, isSmall} from './eval-memo.js';
import {runEvaluation, decodeResults} from './eval-wire.js';
import {createSimSequencer} from '../assets/sim-sequencer.js';
import {createSimPending, holdWhilePending, keepFocus, afterFieldCloses} from '../assets/sim-pending.js';
import {createSliderCommit} from './slider-commit.js';

const evalMemo = createEvalMemo();   // the evaluation is kept, keyed on the tree: a theme change, zoom or re-layout never re-runs it

const $ = id => document.getElementById(id);
const preview = $('preview');
const paint = mountMotion(preview);
/* the page's own signal for "the figures are final" (#preview[data-sim]), and the polite announcement that goes with it */
const simLive = document.createElement('p');
simLive.className = 'sr-only'; simLive.setAttribute('role', 'status'); simLive.setAttribute('aria-live', 'polite');
preview.after(simLive);
const pending = createSimPending({host: preview, live: simLive});

const EXAMPLES = [
  {name: 'Bid or no bid', src:
`title: Bid for the Acme contract
currency: £

Bid decision
  Submit bid: -150k
    Outcome
      Win (p=0.3-0.45): 2M to 5M
      Lose (p=rest): 0
  No bid: 0`},
  {name: 'Build vs buy', src:
`title: Build vs buy the reporting module
currency: £

Approach
  Build in-house: -400k to -700k
    Delivery
      On time (p=0.5-0.7): 1.5M to 2.5M
      Late, still ships (p=rest): 800k to 1.2M
  Buy vendor product: -250k
    Fit
      Good fit (p=0.6-0.8): 1M to 1.6M
      Poor fit, heavy rework (p=rest): 200k to 600k
  Do nothing: 0`},
];



/* ---------- refresh loop ---------- */
let model = null, results = null, lastSvg = '', hashTimer = null;
function renderWarnings(error = ''){
  renderWarningList($('warns'), [...(model ? model.warnings : []), ...(results ? results.warnings : []),
    ...(error ? ['the evaluation could not solve this tree (' + error + ') — the figures are the last that worked'] : [])]);
}
/* ---------- the evaluation, off the main thread (tree/sim-worker.js) ----------
   An edit paints at once from what is already known (the tree as edited, and the last evaluation carried onto the nodes that were
   there), the worker runs the engine's own function, and the page repaints with the final figures. The memo is the single place a
   result is looked up: a tree it already holds is drawn final in the same task. */
let lastGood = null;      // {root, results}: the last picture drawn from final figures
let asked = null;         // the model the run in flight was asked for
let simError = '';        // the engine's message when it could not evaluate this tree; '' otherwise
let lastText = '';
let fromResult = false;   // this repaint is the final figures arriving over a pending one: the reveal already playing is not played again
let inlineNow = false;   // the first picture of a small tree is drawn from the evaluation in the boot task
const seqr = createSimSequencer({
  spawn({message, failure}){
    try{
      const w = new Worker(new URL('./sim-worker.js', import.meta.url), {type: 'module'});
      w.onmessage = ({data}) => message(data);
      w.onerror = failure; w.onmessageerror = failure;
      return w;
    }catch(e){ return null; }
  },
  runSync: runEvaluation,
  onResult(key, wire){
    const sent = asked; asked = null;
    if(!sent) return;
    evalMemo.put(sent, decodeResults(sent.root, wire));
    drawFinal();
  },
  onError(key, message){ asked = null; modelError(message); },
});
/* the figures have arrived: draw them over the pending picture (not under an open edit field: see afterFieldCloses) */
function drawFinal(){
  if(afterFieldCloses(drawFinal)) return;
  fromResult = true;
  try{ paintModel(); }finally{ fromResult = false; }
}
globalThis.__treeWorkerAlive = () => seqr.workerAlive();   // test hook: a model error must not retire the worker
const announcement = () => (model && results) ? treeVerdictParts(model, results).line : '';
/* the engine could not evaluate this tree: the structure is the tree's, the figures are the last that worked, and nothing is
   exported from them */
function modelError(message){
  simError = message;
  drawPicture();
  pending.fail();
}
function paintModel(){
  if(!model.root){
    seqr.cancel(); asked = null; results = null; simError = '';
    drawPicture();
    pending.end();
    return;
  }
  let kept = evalMemo.peek(model);
  if(!kept && (inlineNow || !seqr.workerAlive())) kept = evalMemo.get(model);   // no worker: the same function, here, drawn once
  if(kept) simError = '';
  results = kept || pendingResults(lastGood, model);
  drawPicture();
  if(kept){
    lastGood = {root: model.root, results};
    seqr.cancel(); asked = null;
    pending.end(announcement());
    return;
  }
  /* a slider release is waiting on the worker: the drawing keeps the call the slider was showing until the figures arrive */
  if(committingFocus && focus){ applyLiveWinner(evalDet(model).rec); setPending(true); }
  pending.begin();
  asked = model;
  seqr.request(evalMemo.key(model), {root: model.root});
}
function doRefresh(){
  lastText = editor.getText();
  model = parse(lastText);
  simError = '';
  paintModel();
  try{ if(shouldPersist()) saveTrackedWork(localStorage,'tree-src', lastText); }catch(e){}
  clearTimeout(hashTimer);
  hashTimer = setTimeout(writeHash, 400);
}
/* draw `model` with `results`, whatever state the figures are in */
function drawPicture(){
  const pv = $('preview');
  if(!model.root){
    lastSvg = ''; paint.reset();
    pv.innerHTML = '<p class="placeholder">' + (lastText.trim()
      ? 'No tree yet — add an indented option or two.'
      : 'Start typing — or load an example.') + '</p>';
    paintMetrics($('metrics'), '', []);
    dismissFocus();
  } else {
    rebindFocus();   // I-5: re-resolve/dismiss the focused ref before ctx.hot is built (I-8 needs it fresh)
    const hot = computeHotSet(model);
    if(focus) hot.add(focus.kind + ':' + focus.line);   // I-8: keep the focused mark whatever loadBearing now says
    const width = narrowWidth(pv);
    const svg = render(model, results, {colors: themeColors(), measure, dark: isDark(), edit: true, hot,
      intent: width ? 'live-narrow' : 'live-wide', width,
      coarse: matchMedia('(pointer: coarse)').matches});
    keepFocus(pv, () => paint(svg, fromResult ? {} : REVEAL, {onSwap: reapplyActiveMark})); lastSvg = svg;
    paintMetrics($('metrics'), model.title || 'Untitled tree', metricCounts());
    if(focus) resyncFocusUI();   // repaint the slider's own extent/value + clear any mid-drag classes
  }
  updateSeam();
  renderWarnings(simError);
  setActionsEnabled(!!lastSvg);
}
const refresh = rafBatched(doRefresh);
/* onChange's debounce is inlined here (rather than assets/schedule.js's shared
   debounced()) so commitFocus (M-2, below) can cancel a just-scheduled echo by
   its own timer id — a slider release already replaces the line AND calls
   doRefresh() directly/synchronously (the settled MC must land without the
   120ms lag), so the debounced refresh that same replaceLine's onChange just
   queued is pure waste (a second full 10k-sim pass) unless cancelled. CodeMirror's
   dispatch runs onChange synchronously before replaceLine returns, so the timer
   is always set by the time commitFocus resumes to cancel it. */
let changeTimer = null;
function scheduleRefresh(){
  clearTimeout(changeTimer);
  changeTimer = setTimeout(refresh, 120);
}
/* a discrete edit (a commit, a menu pick, Undo) paints at once; the debounce is for typing in the source only */
function refreshNow(){ clearTimeout(changeTimer); refresh(); }
const editor = createEditor({
  parent: $('cmhost'),
  doc: '',
  onChange: scheduleRefresh,
});
mountTouchUndo(document.querySelector('.stage .actions'), editor, {onUndo: () => undoRefresh()});   // phones have no ⌘Z (Rule 2)
function modelLinkState(){
  const state = {t: editor.getText()};
  if(ws.collapsed()) state.e = 0;
  return state;
}
function writeHash(){ if(shouldPersist()) writeHashState(modelLinkState()); }
const ws = initWorkspace({
  workspace: $('workspace'), tab: $('railtab'),
  preview: $('preview'), zoomHost: $('zoomctl'),
  focusEditor: () => editor.view.focus(),   // opening the rail moves focus into the editor
  onCollapseChange(){ clearTimeout(hashTimer); hashTimer = setTimeout(writeHash, 100); },
});
watchNarrowBucket(preview, () => { lastSvg = ''; paint.reset(); refresh(); }, {skipFirst: true});

/* ---------- priced-insistence walk (B3) ----------
   Tap (or Enter/Space) a load-bearing number → the ONE persistent slider (outside #preview,
   created once, never recreated) binds to it → drag re-routes the recommendation on the
   MIDPOINT story (evalDet) with a live priced readout → release commits a width-preserving
   shift (shiftRange via edit-targets.js's applyExplore) as one undoable text edit, then settles
   with a direct (non-debounced) refresh so the full 10k-sim MC catches up immediately (M-3). */
const exploreBar = $('explorebar'), exploreLabel = $('exploreLabel'), exploreClose = $('exploreClose'),
  exploreRange = $('exploreRange'), exploreBand = $('exploreBand'),
  exploreNotchBelow = $('exploreNotchBelow'), exploreNotchAbove = $('exploreNotchAbove'),
  explorePriced = $('explorePriced'), seamEl = $('seam');

let focus = null;             // {kind, line, label, raw, ext, focusValue} — the bound ref's fingerprint (I-5)
let undoing = false;           // true only while an Undo/Redo's refresh runs: the slider stays on its node and shows the restored value
let committingFocus = false;   // true only while OUR OWN commit's settle-refresh is running

/* the load-bearing numbers come with the evaluation (the worker works them out beside it); a picture whose results carry none (an inline
   run, a coarse fill) works them out here once and keeps them on the results */
function computeHotSet(m){
  if(!results.hot) results.hot = loadBearing(m).map(({ref}) => ref.kind + ':' + ref.line);
  return new Set(results.hot);
}
/* identifies the bound ref by kind+line+label+raw, NEVER node identity — parse() rebuilds fresh
   node objects every call, and duplicate labels exist (the perf fixture carries twins), so a
   weaker key would silently rebind to the wrong node. */
function refFingerprint(m, ref){
  const node = findByLine(m, ref.line);
  if(!node) return null;
  if(ref.kind === 'prob'){
    if(node.pParseValid === false || !node.p || node.p === 'rest') return null;
    return {label: node.label, raw: node.pRaw || ''};
  }
  if(!node.value) return null;
  return {label: node.label, raw: node.valueRaw || ''};
}

/* The bar is pinned inside the viewport: the bottom of the artefact pane on a desktop (placed from the stage's own rectangle),
   the bottom of the screen on a phone (assets in tree/style.css). It overlays the page, so opening and closing it never moves
   anything or scrolls the page. */
function placeExploreBar(){
  if(exploreBar.hidden) return;
  if(matchMedia('(pointer: coarse)').matches){ exploreBar.style.left = exploreBar.style.width = ''; return; }
  const r = $('preview').getBoundingClientRect();
  exploreBar.style.left = Math.round(r.left) + 'px';
  exploreBar.style.width = Math.round(r.width) + 'px';
}
addEventListener('resize', placeExploreBar);
function showExploreBar(on){ exploreBar.hidden = !on; placeExploreBar(); }

function clearLiveClasses(){
  const svgEl = preview.querySelector('svg');
  if(!svgEl) return;
  svgEl.querySelectorAll('[data-opt].live-on,[data-opt].live-off').forEach(g => g.classList.remove('live-on', 'live-off'));
  svgEl.querySelectorAll('[data-mc].pending,[data-verdict].pending').forEach(el => el.classList.remove('pending'));
}
function applyLiveWinner(rec){
  const svgEl = preview.querySelector('svg');
  if(!svgEl) return;
  svgEl.querySelectorAll('[data-opt]').forEach(g => {
    const on = !!rec && g.getAttribute('data-opt') === String(rec.srcLine);
    g.classList.toggle('live-on', on);
    g.classList.toggle('live-off', !on);
  });
}
function setPending(on){
  const svgEl = preview.querySelector('svg');
  if(!svgEl) return;
  svgEl.querySelectorAll('[data-mc],[data-verdict]').forEach(el => el.classList.toggle('pending', on));
}
/* the post-paint hook (motion.js's onSwap, already existed for FLIP re-application; tree just
   needed to pass it): re-marks the active number after #preview's innerHTML is replaced, since
   every render is a fresh DOM subtree with no memory of the previous one's classes. */
function reapplyActiveMark(){
  const svgEl = preview.querySelector('svg');
  if(!svgEl) return;
  svgEl.querySelectorAll('[data-hot]').forEach(el => {
    const on = !!focus && el.dataset.line === String(focus.line) && el.dataset.edit === focus.kind;
    el.classList.toggle('active-hot', on);
    el.setAttribute('aria-pressed', on ? 'true' : 'false');
  });
  /* a card-menu "Explore…" (I-3) can engage a number that ISN'T (yet) load-bearing — ctx.hot only
     catches up on the NEXT actual re-render (doRefresh forces the focused ref in), so give it the
     same visual mark right away rather than leaving it unmarked until something is committed. */
  if(focus){
    const t = svgEl.querySelector('[data-line="' + focus.line + '"][data-edit="' + focus.kind + '"]');
    if(t && !t.hasAttribute('data-hot')) t.classList.add('active-hot');
  }
}

const formatValueText = (kind, x) => kind === 'prob'
  ? Math.round(x * 100) + '%'
  : (model.currency || '£') + Math.round(x).toLocaleString();

function setNotch(el, x, pct){
  if(x === null || x === undefined || !isFinite(x)){ el.hidden = true; return; }
  el.hidden = false;
  el.style.left = Math.max(0, Math.min(100, pct(x))) + '%';
}
/* the stated-range band (SEEN, not just written — M2): a tinted span for the input's own 90%
   interval, so the notch's position relative to YOUR range is visible at a glance. */
function drawBand(ext){
  const span = (ext.hi - ext.lo) || 1;
  const pct = v => (v - ext.lo) / span * 100;
  const node = findByLine(model, focus.line);
  const stated = node && (focus.kind === 'prob' ? node.p : node.value);
  if(stated && stated !== 'rest'){
    const l = Math.max(0, Math.min(100, pct(stated.lo))), r = Math.max(0, Math.min(100, pct(stated.hi)));
    exploreBand.style.left = l + '%';
    exploreBand.style.width = Math.max(0, r - l) + '%';
    exploreBand.hidden = false;
  } else exploreBand.hidden = true;
  setNotch(exploreNotchBelow, ext.flips && ext.flips.below, pct);
  setNotch(exploreNotchAbove, ext.flips && ext.flips.above, pct);
}
function paintSlider(ext, value){
  const isProb = focus.kind === 'prob';
  exploreRange.min = ext.lo; exploreRange.max = ext.hi;
  exploreRange.step = isProb ? 0.001 : Math.max((ext.hi - ext.lo) / 500, 0.01);
  exploreRange.value = value;
  const noun = isProb ? 'odds' : 'payoff';
  exploreLabel.textContent = focus.label + ' — ' + noun;
  exploreRange.setAttribute('aria-label', focus.label + ' ' + noun);
  exploreRange.setAttribute('aria-valuetext', formatValueText(focus.kind, value));
  drawBand(ext);
}

/* nearest flip boundary to x among the ones sliderExtent already found inside the track at
   engage/resync time — reused as-is during a drag rather than re-scanning per frame (the track
   itself doesn't move mid-drag, only the live x within it). */
function nearestInTrack(boundaries, x){
  let best = null;
  for(const b of boundaries || []) if(best === null || Math.abs(b - x) < Math.abs(best - x)) best = b;
  return best;
}
/* the priced-insistence readout (I1/I4). `det`, if supplied, is the already-computed evalDet
   result for this x (the 'input' handler needs it anyway for the crossfade — passed through so
   it isn't computed twice per frame); otherwise computed fresh (engage/resync/Escape). */
function updatePriced(ext, x, {settle = false, det} = {}){
  if(!focus) return;
  const node = findByLine(model, focus.line);
  if(!node) return;
  const isProb = focus.kind === 'prob';
  if(!det) det = evalDet(model, isProb ? new Map([[node, x]]) : new Map(), isProb ? new Map() : new Map([[node, x]]));
  const boundary = nearestInTrack(ext.flips && ext.flips.boundaries, x);
  const hingesBeyond = boundary === null ? hingesBeyondTrack(model, {kind: focus.kind, line: focus.line}, ext) : null;
  const text = pricedCopy({winnerLabel: det.rec ? det.rec.label : '', kind: focus.kind, label: focus.label,
    currency: model.currency || '£', x, boundary, hingesBeyond, trackLo: ext.lo, trackHi: ext.hi});
  /* aria-live toggled off mid-drag, polite right as the settled text is written (I7b): this
     element's TEXT updates continuously either way (sighted users see it move as they drag) —
     the toggle only controls whether a screen reader is notified, so an arrow-key drag isn't
     triple-announced per step. */
  explorePriced.setAttribute('aria-live', settle ? 'polite' : 'off');
  explorePriced.textContent = text;
}

function engageSlider(ref){
  if(!model || !model.root) return;
  const node = findByLine(model, ref.line);
  if(!node) return;
  const cur = refMid(model, ref);
  if(cur === null) return;   // the field doesn't actually exist on this node (e.g. a stale menu row)
  const ext = sliderExtent(ref, model);
  focus = {kind: ref.kind, line: ref.line, label: node.label,
    raw: ref.kind === 'prob' ? (node.pRaw || '') : (node.valueRaw || ''), ext, focusValue: cur};
  showExploreBar(true);
  paintSlider(ext, cur);
  updatePriced(ext, cur, {settle: true});
  reapplyActiveMark();
  exploreRange.focus({preventScroll: true});
  keepNumberClear();
}
/* the bar is pinned over the bottom of the viewport: a number that would sit under it scrolls up by just enough to stay
   in sight (over the base duration, a jump under reduced motion). Nothing else moves the page: opening and closing do not. */
function keepNumberClear(){
  const t = focusedTarget();
  if(!t) return;
  const r = t.getBoundingClientRect(), bar = exploreBar.getBoundingClientRect();
  const need = r.bottom + 16 - bar.top;
  if(need > 0) scrollPageTo(scrollY + Math.min(need, Math.max(0, r.top - 8)));
}
function dismissFocus(){
  if(!focus) return;
  focus = null;
  showExploreBar(false);
  clearLiveClasses();
  reapplyActiveMark();
}
/* I-5: re-resolved every refresh; dismissed the moment it no longer matches — UNLESS this
   refresh follows the slider's OWN commit (committingFocus), where a raw/label change is
   expected and re-synced rather than mistaken for a foreign edit. */
function rebindFocus(){
  if(!focus) return;
  const fp = refFingerprint(model, {kind: focus.kind, line: focus.line});
  if(!fp){ dismissFocus(); return; }
  if(committingFocus || undoing){ focus.raw = fp.raw; focus.label = fp.label; return; }
  if(fp.label !== focus.label || fp.raw !== focus.raw) dismissFocus();
}
function resyncFocusUI(){
  if(!focus) return;
  const ref = {kind: focus.kind, line: focus.line};
  const cur = refMid(model, ref);
  if(cur === null){ dismissFocus(); return; }
  // Keep the BIND-TIME extent stable while this number stays focused. Recomputing sliderExtent on
  // every commit rescaled the whole track (min/max), so the band, notch and thumb lurched under
  // the finger — "it doesn't stay where I place it, it jumps around". A single input's flip point
  // doesn't move as you change THAT input (it's a property of the OTHER inputs), so the track
  // mustn't either; only a fresh tap (engageSlider) sizes a new track. cur is always inside the
  // held extent (you can't drag the thumb past the track), so the thumb lands exactly where you left it.
  const ext = focus.ext || sliderExtent(ref, model);
  focus.ext = ext; focus.focusValue = cur;
  clearLiveClasses();
  paintSlider(ext, cur);
  updatePriced(ext, cur, {settle: true});
  reapplyActiveMark();
}

/* I-6: the honesty seam. evalDet's midpoint story and the settled MC policy can legitimately
   disagree AT REST (a lognormal mean isn't its midpoint) — this is a PERSISTENT line, not just a
   mid-drag label, and the copy (tree/format.js's seamCopy) never claims the MC verdict flipped. */
function updateSeam(){
  if(!model || !model.root || model.root.kind !== 'decision' || !results){
    seamEl.hidden = true; seamEl.textContent = ''; return;
  }
  const detRec = evalDet(model).rec;
  const mcRec = results.policy.get(model.root);
  const text = seamCopy(detRec && detRec.label, mcRec && mcRec.label);
  seamEl.hidden = !text;
  seamEl.textContent = text;
}

/* card-menu "Explore…" rows (I-3, the coarse-pointer entry): appended to EVERY node's menu that
   carries the field, regardless of load-bearing/hot status — the fine-pointer tap-affordance
   declutters to load-bearing numbers only (that's the honesty-via-decluttering story), but the
   menu doesn't decline to explore a number just because it isn't marked. Also fills the leaf-p
   hole (Fable I-3): a node whose `field` menu slot is already 'Edit value…' (decision/leaf kinds)
   had NO typed-entry row for its own probability at all — added here as an ordinary opens row. */
function exploreRowsFor(el){
  if(!model) return [];
  const node = findByLine(model, +el.dataset.line);
  if(!node) return [];
  const kind = el.dataset.edit;
  const probabilityActions = probabilityActionState(node);
  const hasProb = probabilityActions.editable;
  const hasValue = !!node.value;
  const rows = [];
  if(hasProb && kind !== 'cardmenu-chance') rows.push({label: 'Edit probability…', opens: 'prob'});
  /* Explore only makes sense where there's an actual decision to re-route (evalDet/loadBearing's
     own precondition) — a tree with no root-level decision (e.g. a bare chance/leaf root) has no
     recommendation for the slider to price against, so don't offer it there. The plain typed-entry
     row above is unaffected — it's just precise numeric entry, independent of routing. */
  if(model.root && model.root.kind === 'decision' && model.root.children.length >= 2){
    if(probabilityActions.explorable) rows.push({label: 'Explore odds…', commit: {kind: 'explore', line: node.srcLine, value: 'prob'}});
    if(hasValue) rows.push({label: 'Explore payoff…', commit: {kind: 'explore', line: node.srcLine, value: 'value'}});
  }
  return rows;
}

/* release → commit (C2): width-preserving shift, one undoable text edit, then a DIRECT
   (non-debounced) refresh so the settled truth (the full MC re-render) arrives immediately
   rather than lagging ~150ms behind the debounce+rAF path (M-3). */
function commitFocus(x){
  if(!focus) return;
  const node = findByLine(model, focus.line);
  if(!node){ dismissFocus(); return; }
  /* a probability with no rest sibling carries its siblings with it (TR-4): they are rewritten in
     the same change set so the text says what the slider said — one undoable edit */
  const ops = focus.kind === 'prob'
    ? exploreProbOps(model, node, x, n => editor.getLine(n))
    : [{line: focus.line, text: applyExplore(editor.getLine(focus.line), node, x, false)}];
  const changed = ops.filter(op => op.text !== editor.getLine(op.line));
  committingFocus = true;
  if(changed.length){
    if(changed.length === 1) editor.replaceLine(changed[0].line, changed[0].text);
    else applyLineOps(editor, changed);
    clearTimeout(changeTimer);   // M-2: cancel the echo scheduleRefresh() (onChange) just queued —
                                  // the direct doRefresh() below already lands the settled MC now
  }
  doRefresh();
  committingFocus = false;
  /* WebKit drops focus from a control the pointer released on, and a repaint can too: the slider keeps it */
  if(focus && document.activeElement !== exploreRange) exploreRange.focus({preventScroll: true});
}
/* An Undo: the slider stays open on the same node and shows the restored value (the node still exists), the tree repaints at once */
function undoRefresh(){
  sliderCommit.cancel();
  undoing = true;
  clearTimeout(changeTimer);
  try{ doRefresh(); } finally { undoing = false; }
}
const sliderCommit = createSliderCommit(() => { if(focus) commitFocus(parseFloat(exploreRange.value)); });

exploreRange.addEventListener('input', () => {
  if(!focus) return;
  const x = parseFloat(exploreRange.value);
  if(!isFinite(x)) return;
  const node = findByLine(model, focus.line);
  if(!node) return;
  const isProb = focus.kind === 'prob';
  const det = evalDet(model, isProb ? new Map([[node, x]]) : new Map(), isProb ? new Map() : new Map([[node, x]]));
  applyLiveWinner(det.rec);
  setPending(true);
  updatePriced(focus.ext, x, {settle: false, det});
  exploreRange.setAttribute('aria-valuetext', formatValueText(focus.kind, x));
});
/* a pointer release commits at once; arrow keys commit once, 250ms after the last key or on blur (the readout moves with every key) */
let pointerDown = false, lastPointerUp = -1e9;
exploreRange.addEventListener('change', () => {
  if(!focus) return;
  if(pointerDown || performance.now() - lastPointerUp < 150) sliderCommit.now(); else sliderCommit.key();
});
exploreRange.addEventListener('blur', () => sliderCommit.flush());
exploreRange.addEventListener('pointerdown', () => { pointerDown = true; });
const pointerEnded = () => { pointerDown = false; lastPointerUp = performance.now(); };
exploreRange.addEventListener('pointerup', pointerEnded);
exploreRange.addEventListener('pointercancel', pointerEnded);
/* strips the crossfade + un-fades the MC readouts + resets the priced readout to the settled
   (focusValue) text — the "nothing left mid-drag" reconcile shared by Escape, a release-with-
   no-net-change (I-2, below), and (about to be superseded by a real re-render) a commit. */
function settleUI(){
  if(!focus) return;
  clearLiveClasses();
  updatePriced(focus.ext, focus.focusValue, {settle: true});
  exploreRange.setAttribute('aria-valuetext', formatValueText(focus.kind, focus.focusValue));
}
function focusedTarget(){
  if(!focus) return null;
  const svgEl = preview.querySelector('svg');
  if(!svgEl) return null;
  /* the number that opened the slider; failing that (a phone draws no number marks, or the hot set moved on) the same mark
     without the hot flag, then the node's own card menu */
  return svgEl.querySelector('[data-hot][data-line="' + focus.line + '"][data-edit="' + focus.kind + '"]')
    || svgEl.querySelector('[data-line="' + focus.line + '"][data-edit="' + focus.kind + '"][tabindex]')
    || svgEl.querySelector('[data-line="' + focus.line + '"][data-edit^="cardmenu"]');
}
/* Escape reverts the uncommitted drag (never a text edit — nothing was committed), strips
   the crossfade + un-fades the MC readouts, and returns DOM focus to the number. Tab is never
   trapped — the slider is an ordinary tab stop, not inside a popover. */
exploreRange.addEventListener('keydown', e => {
  /* Cmd/Ctrl+Z works with focus on the slider: an uncommitted key adjustment is dropped first, else the last model edit is undone */
  if((e.metaKey || e.ctrlKey) && !e.altKey && !e.shiftKey && e.key.toLowerCase() === 'z' && focus){
    e.preventDefault();
    if(sliderCommit.pending()){ sliderCommit.cancel(); resyncFocusUI(); }
    else if(editor.undo()) undoRefresh();
    return;
  }
  if(e.key !== 'Escape' || !focus) return;
  e.preventDefault();
  sliderCommit.cancel();
  exploreRange.value = focus.focusValue;
  settleUI();
  const t = focusedTarget();
  if(t) t.focus({preventScroll: true});
});
/* I-2: a drag that releases back at the value it was bound at nets no value change, so the
   native 'change' event never fires (mirrors rank/app.js's own pointerup-release note) — nothing
   would otherwise reconcile the .pending/.live-on/.live-off classes the 'input' stream left
   behind, and they'd sit faded at rest indefinitely. Only settle (never commit/re-render) when
   there's truly no net change; a real change is left entirely to 'change' → commitFocus, so this
   is a harmless no-op whenever a real commit follows. */
// 'change' fires iff the release value differs from the value the control had when the drag
// STARTED (pointerdown), so compare against that — NOT focus.focusValue, which is the unsnapped
// midpoint the range input rounds to its step (they never match, so the reconcile never fired).
// Both are the slider's own snapped string values ⇒ an exact, snap-consistent comparison.
let dragStartVal = null;
exploreRange.addEventListener('pointerdown', () => { dragStartVal = exploreRange.value; });
function reconcileIfUnchanged(){
  if(focus && dragStartVal !== null && exploreRange.value === dragStartVal) settleUI();
  dragStartVal = null;
}
exploreRange.addEventListener('pointerup', reconcileIfUnchanged);
exploreRange.addEventListener('pointercancel', reconcileIfUnchanged);
/* M-3: the close button ends the explore session the same way Escape's revert does — return DOM
   focus to the bound number's own tspan (captured before dismissFocus() nulls `focus`), rather
   than dropping it to <body>. */
exploreClose.addEventListener('click', () => {
  sliderCommit.flush();
  const t = focusedTarget();
  dismissFocus();
  if(t) t.focus({preventScroll: true});
});

const treeEip = attachEditInPlace(preview, {
  hitSlop: 12,   // a mouse reaches a 9-11px number or label from 12px above or below it
  kinds: {
    /* custom (I-2): a hot (load-bearing) number's tap/Enter binds the slider instead of opening
       the text popover; a plain number keeps the popover untouched (checked via data-hot, which
       is only ever present when ctx.hot marked that exact tspan). Returns false (fall through to
       the normal popover) for every non-hot instance of the same kind. */
    prob: {validate: validators.prob, custom: el => {
      if(!el.hasAttribute('data-hot')) return false;
      engageSlider({kind: 'prob', line: +el.dataset.line}); return true;
    }},
    value: {validate: validators.value, custom: el => {
      if(!el.hasAttribute('data-hot')) return false;
      engageSlider({kind: 'value', line: +el.dataset.line}); return true;
    }},
    label: {validate: validators.label},
    verdict: {menu: () => verdictMenuRows(model && model.verdict)},
    verdictedit: {validate: validVerdictInput,
      placeholder: () => (model && results) ? treeVerdictParts(model, results).line : ''},
    /* card menu supersedes the old node-<kind> add/remove-only popover with
       Rename/Edit value or probability/Add/Remove. opens:'value'/'prob' can
       still name a field this particular node instance has no INLINE target
       for yet (an unset value, or an unset-but-real probability) — the shared
       edit-in-place fallback (assets/edit-in-place.js's opens-row handler)
       opens the same interaction anchored at the menu itself rather than
       silently no-op'ing, so "Edit value…" on a valueless decision/leaf node
       and "Edit probability…" on a p-less-but-annotatable chance node both
       still work, landing in a fresh empty input. cardmenu-chance's field row
       goes one step further and is OMITTED outright when the node's own
       PARENT isn't chance-kind (hasIncomingProb, edit-targets.js): that node
       has no incoming p at all, ever — nothing honest to edit, not merely
       nothing filled in yet (same distinction the root marker draws: no
       incoming edge, no label/value/prob field, so cardmenu-root-* below
       carries no field row of any kind).
       `extra: exploreRowsFor` (B3) appends the Explore…/leaf-p rows above. */
    'cardmenu-decision': cardMenu({field: {label: 'Edit value…', opens: 'value'}, add: 'option', extra: exploreRowsFor}),
    'cardmenu-chance': cardMenu({
      field: el => hasIncomingProb(model && findByLine(model, +el.dataset.line))
        ? {label: 'Edit probability…', opens: 'prob'} : null,
      add: 'outcome', extra: exploreRowsFor,
    }),
    'cardmenu-leaf': cardMenu({field: {label: 'Edit value…', opens: 'value'}, add: 'outcome', remove: 'Remove', extra: exploreRowsFor}),
    /* the root's Add-only menu, one per root kind so the label's noun matches
       what childLineFor actually inserts: a decision root gets a top-level
       "option", a chance/leaf root grows an "outcome" (a fresh single-line
       root parses as leaf — Add there inserts "New outcome (p=…)", so the
       label must read "Add outcome", not "Add option"). Both '✖＋ Add option'
       and '✖＋ Add outcome' sentinels are already handled by onCommit's
       existing branch; cardmenu-root-* still starts with 'cardmenu-'. */
    'cardmenu-root-decision': {menu: [{label: '＋ Add option', action: true}]},
    'cardmenu-root-chance': {menu: [{label: '＋ Add outcome', action: true}]},
    'cardmenu-root-leaf': {menu: [{label: '＋ Add outcome', action: true}]},
  },
  onCommit(kind, lineNo, oldRaw, newValue, el){
    commitEdit(kind, lineNo, oldRaw, newValue, el);
    if(kind !== 'explore' && !kind.startsWith('cardmenu-')) refreshNow();   // a menu row that opens a field changes nothing to repaint
  },
});
function commitEdit(kind, lineNo, oldRaw, newValue, el){
    if(handleVerdictCommit(kind, newValue, {
      getText: () => editor.getText(), setText: t => editor.setText(t),
      configRe: /^(title|currency|palette|accent|verdict)\s*:/i,
      getLine: () => (model && results) ? treeVerdictParts(model, results).line : '',
    })) return;
    if(kind === 'explore'){ engageSlider({kind: newValue, line: lineNo}); return; }
    if(kind.startsWith('cardmenu-')){
      if(newValue === '✖＋ Add option' || newValue === '✖＋ Add outcome'){
        const r = childLineFor(editor.getText(), lineNo);
        if(!r) return;
        const inserted = insertAndSelect(editor, r.afterLine, r.newLine, r.select);
        /* the new node is drawn in this task, before its field is sought: otherwise the old drawing still has a node at that
           line, and the name field opens on it instead */
        clearTimeout(changeTimer); doRefresh();
        const addedText = editor.getText();   // onCancel only rolls back if nothing else changed since
        const menuOnly = matchMedia('(pointer: coarse)').matches;
        treeEip.openAt({kind: menuOnly ? 'cardmenu-leaf' : 'label', line: inserted.srcLine}, {
          origin: el,
          /* Coarse rows intentionally carry no tiny label tspan. Open the
             same prefilled label editor, visibly anchored to the fresh 44px
             card menu, rather than focusing the hidden source editor. */
          openAs: menuOnly ? {kind: 'label', raw: inserted.select} : undefined,
          // undo() (not a forward removeLine) pops the insert's own isolated group —
          // Escape leaves no extra "remove" entry for a stray Ctrl+Z to resurrect.
          onCancel(){ if(editor.getText() === addedText) editor.undo(); },
        });
      } else if(newValue === '✖Remove branch' || newValue === '✖Remove'){
        if(lineNo < 0) return;   // implicit root has no line of its own
        const rr = subtreeRange(editor.getText(), lineNo);
        if(rr){ editor.removeLines(rr.from, rr.to); refreshNow(); }
      }
      return;
    }
    const line = editor.getLine(lineNo);
    const newLine = applies[kind](line, oldRaw, newValue);
    if(newLine !== line) editor.replaceLine(lineNo, newLine);
}

/* ---------- chips ---------- */
provide({blank: () => editor.setText(STARTER), examples: EXAMPLES.map(ex => ({name: ex.name, pick: () => editor.setText(ex.src)}))});


/* ---------- header anatomy (Swiss 6b) ---------- */
/* The VERDICT lives INSIDE the artefact (tree/render.js draws it), so the page
   carries only the kicker and the metrics row — one verdict per page. Counts
   come from the parsed model + the same MC results the tree renders from. */
paintKicker($('kicker'), '07', 'Choices priced before you make them');
function countLeaves(node){
  return node.children.length === 0 ? 1 : node.children.reduce((a, c) => a + countLeaves(c), 0);
}
function metricCounts(){
  if(!model || !model.root || !results) return [];
  const n = model.root.kind === 'decision' ? model.root.children.length : null;
  const leaves = countLeaves(model.root);
  const st = results.stats.get(model.root);
  const cur = model.currency || '£';
  return [
    ...(n !== null ? [n + (n === 1 ? ' option' : ' options')] : []),
    leaves + (leaves === 1 ? ' outcome' : ' outcomes'),
    ...(st ? ['EV ' + (st.mean < 0 ? '−' : '') + cur + fmt(Math.abs(st.mean))] : []),
  ];
}

/* ---------- exports ---------- */
/* Everything that leaves the page is drawn in the house face and carries it embedded; until the face has loaded there is nothing
   to export (the live picture does not wait: it uses the page's own font). */
function svgString(intent){
  if(!model || !model.root || !results || !chapterFontsReady() || !pending.isFinal() || simError) return null;   // nothing leaves with pending figures
  return embedChapterFonts(render(model, results, {colors: themeColors(), measure, intent, dark: isDark()}));
}
/* Print cannot wait for a worker, so a print asked for while the figures are pending runs the same function here */
function printSvgString(){
  if(!pending.isFinal() && model && model.root && !simError && chapterFontsReady())
    return embedChapterFonts(render(model, evalMemo.get(model), {colors: themeColors(), measure, intent: 'native', dark: isDark()}));
  return svgString('native');
}
function slug(){
  return slugify(model.title, 'decision-tree');
}
/* Copy PNG and Download PNG are the picture of the tree on the page; "Copy slide" is the 16:9 comparison of the options */
const exportButtons = {dlsvg: $('dlsvg'), dlpng: $('dlpng'), copypng: $('copypng'), copyslide: $('copyslide')};
holdWhilePending(Object.values(exportButtons), pending, {say: text => { const line = $('exportstatus'); if(line){ line.textContent = text; line.hidden = !text; } }});
wireExports({
  buttons: exportButtons,
  getSvg: () => svgString('native'),
  getSlide: () => svgString('presentation'),
  slug,
});
/* Print is the tree alone, light, whatever theme the page is in, shrunk onto one sheet (a tree is one picture, not rows) */
wirePrintArtefact({getSvg: () => lightTheme(printSvgString), fitOne: true});
loadChapterFonts().then(() => { setActionsEnabled(!!lastSvg); }, () => {
  const line = $('exportstatus');
  if(line){ line.textContent = 'The typeface could not load, so exports are unavailable. Reload the page to try again.'; line.hidden = false; }
});

/* ---------- theme change ---------- */
function rerender(){ lastSvg = ''; paint.reset(); refresh(); }
onThemeChange(rerender);

/* ---------- boot ---------- */
(async function(){
  const hash = await readHashState();
  let text = hash && typeof hash.t === 'string' ? hash.t : '';
  if(hash && hash.e === 0) ws.setCollapsed(true);
  if(!text){
    try{ text = localStorage.getItem('tree-src') || ''; }catch(e){}
  }
  /* the first tree is drawn in this task, from the source that is already known: one render, nothing after it moves */
  const first = () => { clearTimeout(changeTimer); inlineNow = isSmall(parse(editor.getText())); try{ doRefresh(); }finally{ inlineNow = false; } };
  if(text){ editor.setText(text); first(); }
  else if(autoloadExample(() => editor.setText(EXAMPLES[0].src))){ first(); }
  else refresh();
})();

/* try-it specimens: the syntax reference inserts into the editor (2026-08-02) */
import {wireSyntaxTry} from '../assets/syntax-try.js';
wireSyntaxTry(document.querySelector('details.syntax'), editor, ['title', 'currency', 'palette', 'accent', 'verdict']);

mountModelLink({getState: modelLinkState});
