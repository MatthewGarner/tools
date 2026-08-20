/* State, refresh loop, focus, edit-in-place, exports, boot. DOM lives here only. */
import {parse} from './parse.js';
import {simulate, fmtUnit} from './engine.js';
import {render, toMarkdown, riskVerdict, riskVerdictParts, focusedIndex} from './render.js';
import {createEditor} from './editor.js';
import {validators, editField, editLabel, removeParam, addLegLine, removeLegLine,
  addedLegTarget} from './edit-targets.js';
import {readHashState, writeHashState} from '../../assets/series.js';
import {autoloadExample, shouldPersist} from '../../assets/mobile.js';
import {measure, isDark, themeColors, onThemeChange, renderWarningList, slugify, exampleChips} from '../../assets/app-common.js';
import {wireExports} from '../../assets/exports.js';
import {narrowWidth, watchNarrowBucket} from '../../assets/narrow-width.js';
import {initWorkspace, setActionsEnabled, mountTouchUndo} from '../../assets/workspace.js';
import {mountMotion} from "../../assets/motion.js";
import {REVEAL} from "./motion-spec.js";
import {attachEditInPlace} from '../../assets/edit-in-place.js';
import {verdictMenuRows, handleVerdictCommit, validVerdictInput} from '../../assets/verdict-edit.js';
import {paintKicker, paintMetrics, paintVerdict} from '../../assets/verdict.js';
import {STARTER} from './starter.js';

const $ = id => document.getElementById(id);
const paint = mountMotion($("preview"));

const EXAMPLES = [
  {name: 'Route to market', src:
`title: Route to market — Wexcombe 100MW/2h
merchant: 60..180            // £k/MW/yr, 90% range

floor: 70 share 60% fee 5    // optimiser floor
toll: 95                     // fixed, all risk transferred
insure: premium 6 attach 65 limit 30`},
  {name: 'Optimiser fees', src:
`title: Optimiser selection — same maths, different labels
merchant: 60..180

floor: 0 share 88% "Pure share 88/12"
floor: 55 share 75% "Floor 55 + 75/25"
toll: 92 "Fixed-fee equivalent"`},
  {name: 'Wind PPA floor', src:
`title: Wind PPA — floor or merchant
unit: £/MWh
merchant: 28..74             // capture price, 90% range

floor: 41 share 55% "PPA floor + share"
toll: 47 "Fixed-price PPA"`},
];

let model = null, sim = null, lastSvg = '', focusIdx = null;
let rafId = 0, debTimer = null, hashTimer = null;

const stageEl = $('preview');
function renderWidth(){ return narrowWidth(stageEl); }
function ctx(slide, forExport = false){
  return {colors: themeColors(), measure, slide, dark: isDark(), width: forExport ? undefined : renderWidth(),
    readerFloor: forExport ? null : .75};
}
function activeRender(slide, edit = false, forExport = false){
  return render(model, sim, ctx(slide, forExport), {edit, focus: focusIdx});
}
function renderWarnings(){
  renderWarningList($('warns'), model ? model.warnings : []);
}
function doRefresh(){
  const text = editor.getText();
  model = parse(text);
  sim = simulate(model);
  const pv = $('preview');
  if(!sim){
    lastSvg = ''; paint.reset();
    pv.innerHTML = '<p class="placeholder">' + (text.trim()
      ? 'Add a merchant line — like “merchant: 60..180” — to have something to compare against.'
      : 'Start typing — or load an example.') + '</p>';
    paintVerdict($('verdict'), '', '');
    paintMetrics($('metrics'), '', []);
  } else {
    if(focusIdx !== null && focusIdx >= sim.rows.length) focusIdx = null;
    const svg = activeRender(false, true);
    paint(svg, REVEAL); lastSvg = svg;
    const v = riskVerdictParts(sim, model, focusIdx);
    paintVerdict($('verdict'), v.line, v.fig);
    $('verdict').parentElement.dataset.raw = model.verdict == null ? '' : String(model.verdict);
    /* metrics: the routes on the board, the merchant belief they all share, and
       the sample the payoffs are read off — all straight from model/sim. */
    paintMetrics($('metrics'), model.title, [
      `${sim.rows.length} route${sim.rows.length === 1 ? '' : 's'}`,
      `merchant ${Math.round(model.merchant.lo)}–${Math.round(model.merchant.hi)} ${model.unit}`,
      `${sim.n.toLocaleString('en-GB')} draws`,
    ]);
  }
  renderWarnings();
  setActionsEnabled(!!sim);
  try{ if(shouldPersist()) localStorage.setItem('risk-src', text); }catch(e){}
  clearTimeout(hashTimer);
  hashTimer = setTimeout(writeHash, 400);
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
  if(focusIdx !== null) state.f = focusIdx;
  if(shouldPersist()) writeHashState(state);
}
const ws = initWorkspace({
  workspace: $('workspace'), tab: $('railtab'),
  preview: $('preview'), zoomHost: $('zoomctl'),
  initialReading: 'when-guarded',
  focusEditor: () => editor.view.focus(),
  onCollapseChange(){ clearTimeout(hashTimer); hashTimer = setTimeout(writeHash, 100); },
});

/* focus: click a row card to move the verdict onto that structure */
$('preview').addEventListener('click', e => {
  const row = e.target.closest('[data-focus]');
  if(!row) return;
  const i = +row.dataset.focus;
  focusIdx = (focusIdx === i) ? null : i;
  lastSvg = ''; paint.reset();
  doRefresh();
});
/* keyboard equivalent: every [data-focus] row carries tabindex="0" (render.js) */
$('preview').addEventListener('keydown', e => {
  if(e.key !== 'Enter' && e.key !== ' ' && e.key !== 'Spacebar') return;
  const row = e.target.closest('[data-focus]');
  if(!row) return;
  e.preventDefault();
  const i = +row.dataset.focus;
  focusIdx = (focusIdx === i) ? null : i;
  lastSvg = ''; paint.reset();
  doRefresh();
});

/* The phone card menu ("the card is the control"): each structure's ⋯ opens the
   edits it owns — Rename, insure limit add/remove, Remove — while the num pills
   stay directly editable. Merchant is the baseline: no menu. Resolved fresh from
   the model each open, keyed on the tapped row's kind + srcLine. */
function limitDefault(){
  return model.merchant ? String(Math.round(0.25 * (model.merchant.hi - model.merchant.lo))) : '30';
}
function structureMenu(m, kind, srcLine){
  const st = m.structures.find(s => s.srcLine === srcLine);
  const rows = [{label: 'Rename…', opens: 'label'}];
  if(kind === 'insure'){
    const hasLimit = st && st.params.limit !== Infinity;
    rows.push(hasLimit
      ? {label: 'Remove limit', commit: {kind: 'removelimit', line: srcLine, oldRaw: '', value: ''}}
      : {label: '＋ Add limit', commit: {kind: 'addlimit', line: srcLine, oldRaw: '', value: limitDefault()}});
  }
  rows.push({label: 'Remove structure', danger: true, commit: {kind: 'removeleg', line: srcLine, oldRaw: '', value: ''}});
  return rows;
}

/* edit-in-place: numeric field pills, per-structure ⋯ card menu, title Rename,
   and a ＋ Add structure picker. Structure edits route through the pure
   add/removeLegLine + editLabel + editField/removeParam rewrites → one undoable
   CodeMirror dispatch each. */
function riskVerdictLine(){
  return sim ? riskVerdictParts(sim, model, focusIdx).line : '';
}
attachEditInPlace($('verdict').parentElement.parentElement, {
  kinds: {
    verdict: {menu: () => verdictMenuRows(model && model.verdict)},
    verdictedit: {validate: validVerdictInput, placeholder: riskVerdictLine},
  },
  onCommit(kind, lineNo, oldRaw, newValue){
    handleVerdictCommit(kind, newValue, {
      getText: () => editor.getText(), setText: t => editor.setText(t),
      configRe: /^(title|palette|accent|unit|verdict)\s*:/i,
      getLine: riskVerdictLine,
    });
  },
});

const announceEdit = text => { $('editstatus').textContent = text; };
let pendingLegAdd = null;
function insertLeg(add){
  const source = editor.view.state.doc.line(add.afterLine + 1);
  editor.view.dispatch({changes: {from: source.to, to: source.to, insert: '\n' + add.newLine},
    userEvent: 'input.complete'});
}
function replaceFreshLeg(line, text){
  const source = editor.view.state.doc.line(line + 1);
  editor.view.dispatch({changes: {from: source.from, to: source.to, insert: text},
    userEvent: 'input.complete'});
}
function focusRiskAdd(){
  const started = performance.now();
  const attempt = () => {
    const target = $('preview').querySelector('[data-edit="addleg"]');
    if(target?.isConnected && target.getClientRects().length){ target.focus({preventScroll: true}); return; }
    if(performance.now() - started < 1200) requestAnimationFrame(attempt);
    else $('railtab').focus({preventScroll: true});
  };
  requestAnimationFrame(attempt);
}
const riskEip = attachEditInPlace($('preview'), {
  kinds: {
    num: {validate: validators.num},
    label: {validate: validators.label},
    cardmenu: {menu: el => structureMenu(model, el.dataset.kind, +el.dataset.line)},
    /* the kind CHOICE is the commit step, so a bare capsule tap adds nothing */
    addleg: {menu: [
      {label: 'Floor', commit: {kind: 'addleg', line: -1, oldRaw: '', value: 'floor'}},
      {label: 'Toll', commit: {kind: 'addleg', line: -1, oldRaw: '', value: 'toll'}},
      {label: 'Insure', commit: {kind: 'addleg', line: -1, oldRaw: '', value: 'insure'}},
    ]},
  },
  onCommit(kind, line, raw, value, el){
    if(kind === 'addleg'){
      // a second add activation while the first's popover hasn't resolved yet
      // would silently close that first input (attachEditInPlace allows only
      // one open target) and orphan its pendingLegAdd tracking — no-op instead.
      if(pendingLegAdd){ announceEdit('Still adding the last structure — finish or cancel it first.'); return; }
      const r = addLegLine(editor.getText(), value);
      if(!r) return;
      const freshLine = r.afterLine + 1;
      insertLeg(r);
      const addedText = editor.getText();   // onCancel only rolls back if nothing else changed since
      pendingLegAdd = {line: freshLine, newLine: r.newLine};
      void riskEip.openAt(addedLegTarget(r), {
        origin: el,
        onCancel(){
          // only safe to roll back if the doc is EXACTLY as the add left it — anything else
          // (an edit elsewhere) and we leave the document alone. Rolling back via undo()
          // (not a forward removeLine dispatch) keeps history clean too: Escape leaves no
          // extra "remove" entry for a stray Ctrl+Z to un-remove — undo() pops the add's
          // own isolated group (insertLinesAfter/'input.complete' tag it as such).
          const removed = editor.getText() === addedText;
          if(removed) editor.undo();
          pendingLegAdd = null;
          announceEdit(removed ? 'Structure creation cancelled.' : 'Structure kept — document changed.');
          setTimeout(focusRiskAdd, 140);
        },
        onMiss(){ pendingLegAdd = null; announceEdit('Structure added. Its in-place editor could not be opened.'); focusRiskAdd(); },
        timeout: 1200,
      });
      return;
    }
    if(kind === 'removeleg'){
      if(removeLegLine(editor.getText(), line)) editor.removeLine(line);
      return;
    }
    const cur = editor.getLine(line);
    const next = kind === 'label' ? editLabel(cur, value)
      : kind === 'addlimit' ? editField(cur, 'limit', value)
      : kind === 'removelimit' ? removeParam(cur, 'limit')
      : editField(cur, el.dataset.field, value);
    if(next !== cur){
      if(kind === 'label' && pendingLegAdd?.line === line){
        replaceFreshLeg(line, next);          // a separate undo step from creating the structure
        pendingLegAdd = null;
      } else editor.replaceLine(line, next);
    }
  },
});

/* chips */
exampleChips($('chips'), EXAMPLES, ex => { focusIdx = null; editor.setText(ex.src); }, {start: {src: STARTER}});

/* ---------- exports ---------- */
const isoToday = () => new Date().toISOString().slice(0, 10);
function svgString(slide){
  return sim ? activeRender(slide, false, true) : null;   // forExport: width undefined => canonical 1200/1280
}
function slug(){
  return slugify(model && model.title, 'risk');
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
  if(!sim) return;
  const md = toMarkdown(model, sim);
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
  paintKicker($('kicker'), 'E2', 'Every route to market, one uncertain year');
  $('kicker').append(' · Ember series');
})();

/* ---------- boot ---------- */
(async function(){
  const hash = await readHashState();
  let text = hash && typeof hash.t === 'string' ? hash.t : '';
  if(hash && hash.e === 0) ws.setCollapsed(true);
  if(hash && typeof hash.f === 'number') focusIdx = hash.f;
  if(!text){
    try{ text = localStorage.getItem('risk-src') || ''; }catch(e){}
  }
  if(text) editor.setText(text);
  else if(!autoloadExample(() => editor.setText(EXAMPLES[0].src))) refresh();
})();

/* try-it specimens: the syntax reference inserts into the editor (2026-08-02) */
import {wireSyntaxTry} from '../../assets/syntax-try.js';
wireSyntaxTry(document.querySelector('details.syntax'), editor, ['title', 'palette', 'accent', 'unit', 'verdict', 'merchant']);
