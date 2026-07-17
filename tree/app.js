/* State, refresh loop, saved trees, exports, boot. */
import {parse} from './parse.js';
import {evaluate, evalDet, findByLine, refMid, sliderExtent, loadBearing, hingesBeyondTrack} from './engine.js';
import {pricedCopy, seamCopy} from './format.js';
import {render, treeVerdict} from './render.js';
import {createEditor} from './editor.js';
import {insertAndSelect} from '../assets/editor-common.js';
import {readHashState, writeHashState} from '../assets/series.js';
import {autoloadExample, shouldPersist} from '../assets/mobile.js';
import {measure, isDark, themeColors, onThemeChange, renderWarningList, slugify, exampleChips} from '../assets/app-common.js';
import {wireExports} from '../assets/exports.js';
import {posterSvg} from '../assets/poster.js';
import {loadSaved, storeSaved, renderSavedChips} from '../assets/saved-items.js';
import {rafBatched} from '../assets/schedule.js';
import {initWorkspace, setActionsEnabled, mountTouchUndo} from '../assets/workspace.js';
import {mountMotion} from "../assets/motion.js";
import {REVEAL} from "./motion-spec.js";
import {attachEditInPlace, cardMenu} from '../assets/edit-in-place.js';
import {validators, applies, subtreeRange, childLineFor, applyExplore} from './edit-targets.js';

const $ = id => document.getElementById(id);
const preview = $('preview');
const paint = mountMotion(preview);


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
function renderWarnings(){
  renderWarningList($('warns'), [...(model ? model.warnings : []), ...(results ? results.warnings : [])]);
}
function doRefresh(){
  const text = editor.getText();
  model = parse(text);
  const pv = $('preview');
  if(!model.root){
    results = null;
    lastSvg = ''; paint.reset();
    pv.innerHTML = '<p class="placeholder">' + (text.trim()
      ? 'No tree yet — add an indented option or two.'
      : 'Start typing — or load an example.') + '</p>';
    $('verdict').textContent = '';
    dismissFocus();
  } else {
    results = evaluate(model);
    rebindFocus();   // I-5: re-resolve/dismiss the focused ref before ctx.hot is built (I-8 needs it fresh)
    const hot = computeHotSet(model);
    if(focus) hot.add(focus.kind + ':' + focus.line);   // I-8: keep the focused mark whatever loadBearing now says
    const svg = render(model, results, {colors: themeColors(), measure, dark: isDark(), edit: true, hot});
    paint(svg, REVEAL, {onSwap: reapplyActiveMark}); lastSvg = svg;
    $('verdict').textContent = treeVerdict(model, results);
    if(focus) resyncFocusUI();   // repaint the slider's own extent/value + clear any mid-drag classes
  }
  updateSeam();
  renderWarnings();
  setActionsEnabled(!!lastSvg);
  try{ if(shouldPersist()) localStorage.setItem('tree-src', text); }catch(e){}
  clearTimeout(hashTimer);
  hashTimer = setTimeout(writeHash, 400);
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
const editor = createEditor({
  parent: $('cmhost'),
  doc: '',
  onChange: scheduleRefresh,
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
let committingFocus = false;   // true only while OUR OWN commit's settle-refresh is running

function computeHotSet(m){
  const set = new Set();
  for(const {ref} of loadBearing(m)) set.add(ref.kind + ':' + ref.line);
  return set;
}
/* identifies the bound ref by kind+line+label+raw, NEVER node identity — parse() rebuilds fresh
   node objects every call, and duplicate labels exist (the perf fixture carries twins), so a
   weaker key would silently rebind to the wrong node. */
function refFingerprint(m, ref){
  const node = findByLine(m, ref.line);
  if(!node) return null;
  if(ref.kind === 'prob'){
    if(!node.p || node.p === 'rest') return null;
    return {label: node.label, raw: node.pRaw || ''};
  }
  if(!node.value) return null;
  return {label: node.label, raw: node.valueRaw || ''};
}

function showExploreBar(on){ exploreBar.hidden = !on; }

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
  const noun = isProb ? 'success odds' : 'payoff';
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
  if(committingFocus){ focus.raw = fp.raw; focus.label = fp.label; return; }
  if(fp.label !== focus.label || fp.raw !== focus.raw) dismissFocus();
}
function resyncFocusUI(){
  if(!focus) return;
  const ref = {kind: focus.kind, line: focus.line};
  const cur = refMid(model, ref);
  if(cur === null){ dismissFocus(); return; }
  const ext = sliderExtent(ref, model);
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
  const hasProb = !!node.p && node.p !== 'rest';
  const hasValue = !!node.value;
  const rows = [];
  if(hasProb && kind !== 'cardmenu-chance') rows.push({label: 'Edit probability…', opens: 'prob'});
  /* Explore only makes sense where there's an actual decision to re-route (evalDet/loadBearing's
     own precondition) — a tree with no root-level decision (e.g. a bare chance/leaf root) has no
     recommendation for the slider to price against, so don't offer it there. The plain typed-entry
     row above is unaffected — it's just precise numeric entry, independent of routing. */
  if(model.root && model.root.kind === 'decision' && model.root.children.length >= 2){
    if(hasProb) rows.push({label: 'Explore success odds…', commit: {kind: 'explore', line: node.srcLine, value: 'prob'}});
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
  const line = editor.getLine(focus.line);
  const newLine = applyExplore(line, node, x, focus.kind === 'prob');
  committingFocus = true;
  if(newLine !== line){
    editor.replaceLine(focus.line, newLine);
    clearTimeout(changeTimer);   // M-2: cancel the echo scheduleRefresh() (onChange) just queued —
                                  // the direct doRefresh() below already lands the settled MC now
  }
  doRefresh();
  committingFocus = false;
}

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
exploreRange.addEventListener('change', () => {
  if(!focus) return;
  commitFocus(parseFloat(exploreRange.value));
});
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
  return svgEl && svgEl.querySelector('[data-hot][data-line="' + focus.line + '"][data-edit="' + focus.kind + '"]');
}
/* Escape reverts the uncommitted drag (never a text edit — nothing was committed), strips
   the crossfade + un-fades the MC readouts, and returns DOM focus to the number. Tab is never
   trapped — the slider is an ordinary tab stop, not inside a popover. */
exploreRange.addEventListener('keydown', e => {
  if(e.key !== 'Escape' || !focus) return;
  e.preventDefault();
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
  const t = focusedTarget();
  dismissFocus();
  if(t) t.focus({preventScroll: true});
});

attachEditInPlace(preview, {
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
    /* card menu supersedes the old node-<kind> add/remove-only popover with
       Rename/Edit value or probability/Add/Remove; opens:'value'/'prob' is a
       dead no-op on the (rare) node instance that doesn't carry that field —
       e.g. the root marker has no incoming edge so no label/value/prob tspan
       exists for it at all — same accepted no-op as why's fieldless rows.
       `extra: exploreRowsFor` (B3) appends the Explore…/leaf-p rows above. */
    'cardmenu-decision': cardMenu({field: {label: 'Edit value…', opens: 'value'}, add: 'option', extra: exploreRowsFor}),
    'cardmenu-chance': cardMenu({field: {label: 'Edit probability…', opens: 'prob'}, add: 'outcome', extra: exploreRowsFor}),
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
  onCommit(kind, lineNo, oldRaw, newValue){
    if(kind === 'explore'){ engageSlider({kind: newValue, line: lineNo}); return; }
    if(kind.startsWith('cardmenu-')){
      if(newValue === '✖＋ Add option' || newValue === '✖＋ Add outcome'){
        const r = childLineFor(editor.getText(), lineNo);
        if(!r) return;
        insertAndSelect(editor, r.afterLine, r.newLine, r.select);
      } else if(newValue === '✖Remove branch' || newValue === '✖Remove'){
        if(lineNo < 0) return;   // implicit root has no line of its own
        const rr = subtreeRange(editor.getText(), lineNo);
        if(rr) editor.removeLines(rr.from, rr.to);
      }
      return;
    }
    const line = editor.getLine(lineNo);
    const newLine = applies[kind](line, oldRaw, newValue);
    if(newLine !== line) editor.replaceLine(lineNo, newLine);
  },
});

/* ---------- chips ---------- */
exampleChips($('chips'), EXAMPLES, ex => editor.setText(ex.src));

/* ---------- saved trees ---------- */
const SAVED_KEY = 'tree-saved';
function renderSaved(){
  const row = $('savedrow');
  renderSavedChips(row, loadSaved(SAVED_KEY), {
    deleteLabel: m => 'Delete saved tree ' + m.name,
    onLoad: m => editor.setText(m.src),
    onDelete: (m, i) => {
      const l = loadSaved(SAVED_KEY); l.splice(i, 1); storeSaved(SAVED_KEY, l); renderSaved();
    },
  });
  const save = document.createElement('button');
  save.className = 'chip';
  save.textContent = '＋ Save current';
  save.addEventListener('click', () => {
    if(!model || !model.root) return;
    const list = loadSaved(SAVED_KEY);
    list.push({name: model.title ? model.title.slice(0, 28) : 'Tree ' + (list.length + 1), src: editor.getText()});
    storeSaved(SAVED_KEY, list);
    renderSaved();
  });
  row.appendChild(save);
}

/* ---------- exports ---------- */
const isoToday = () => new Date().toISOString().slice(0, 10);
function svgString(slide, bare = false){
  if(!model || !model.root || !results) return null;
  return render(model, results, {colors: themeColors(), measure, slide, dark: isDark(), bare});
}
function countLeaves(node){
  return node.children.length === 0 ? 1 : node.children.reduce((a, c) => a + countLeaves(c), 0);
}
function posterData(){
  const n = model.root.kind === 'decision' ? model.root.children.length : null;
  const leaves = countLeaves(model.root);
  const flips = (results.flips || []).length;
  return {
    verdict: treeVerdict(model, results),
    name: model.title || 'Decision tree',
    metrics: [
      ...(n !== null ? [n + (n === 1 ? ' option' : ' options')] : []),
      leaves + (leaves === 1 ? ' outcome' : ' outcomes'),
      ...(flips ? [flips + (flips === 1 ? ' flip condition' : ' flip conditions')] : []),
    ],
  };
}
function posterString(){
  if(!model || !model.root || !results) return null;
  return posterSvg({chart: svgString(true, true), ...posterData(),
    date: isoToday(), accent: model.accent || themeColors().accent, colors: themeColors(), measure});
}
function slug(){
  return slugify(model.title, 'decision-tree');
}
wireExports({
  buttons: {dlsvg: $('dlsvg'), dlpng: $('dlpng'), dlslide: $('dlslide'), dlposter: $('dlposter'), copypng: $('copypng')},
  getSvg: () => svgString(),
  getSvgSlide: () => svgString(true),
  getPoster: posterString,
  slug,
});

/* ---------- theme change ---------- */
function rerender(){ lastSvg = ''; paint.reset(); refresh(); }
onThemeChange(rerender);

/* ---------- boot ---------- */
(function(){
  const hash = readHashState();
  let text = hash && typeof hash.t === 'string' ? hash.t : '';
  if(hash && hash.e === 0) ws.setCollapsed(true);
  if(!text){
    try{ text = localStorage.getItem('tree-src') || ''; }catch(e){}
  }
  renderSaved();
  if(text) editor.setText(text);
  else if(!autoloadExample(() => editor.setText(EXAMPLES[0].src))) refresh();
})();
