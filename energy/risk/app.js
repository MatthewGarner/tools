/* State, refresh loop, focus, edit-in-place, exports, boot. DOM lives here only. */
import {parse} from './parse.js';
import {simulate, fmtUnit} from './engine.js';
import {render, toMarkdown, riskVerdict, focusedIndex} from './render.js';
import {createEditor} from './editor.js';
import {validators, editField} from './edit-targets.js';
import {readHashState, writeHashState} from '../../assets/series.js';
import {autoloadExample, shouldPersist} from '../../assets/mobile.js';
import {measure, isDark, themeColors, onThemeChange, renderWarningList, slugify, exampleChips} from '../../assets/app-common.js';
import {wireExports} from '../../assets/exports.js';
import {posterSvg} from '../../assets/poster.js';
import {narrowWidth, watchNarrowBucket} from '../../assets/narrow-width.js';
import {initWorkspace, setActionsEnabled} from '../../assets/workspace.js';
import {mountMotion} from "../../assets/motion.js";
import {REVEAL} from "./motion-spec.js";
import {attachEditInPlace} from '../../assets/edit-in-place.js';

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
  return {colors: themeColors(), measure, slide, dark: isDark(), width: forExport ? undefined : renderWidth()};
}
function activeRender(slide, edit = false, forExport = false, bare = false){
  return render(model, sim, ctx(slide, forExport), {edit, focus: focusIdx, bare});
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
    $('verdict').textContent = '';
  } else {
    if(focusIdx !== null && focusIdx >= sim.rows.length) focusIdx = null;
    const svg = activeRender(false, true);
    paint(svg, REVEAL); lastSvg = svg;
    $('verdict').textContent = riskVerdict(sim, model, focusIdx);
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
function writeHash(){
  const state = {t: editor.getText()};
  if(ws.collapsed()) state.e = 0;
  if(focusIdx !== null) state.f = focusIdx;
  if(shouldPersist()) writeHashState(state);
}
const ws = initWorkspace({
  workspace: $('workspace'), tab: $('railtab'),
  preview: $('preview'), zoomHost: $('zoomctl'),
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
exampleChips($('chips'), EXAMPLES, ex => { focusIdx = null; editor.setText(ex.src); });

/* ---------- exports ---------- */
const isoToday = () => new Date().toISOString().slice(0, 10);
function svgString(slide, bare = false){
  return sim ? activeRender(slide, false, true, bare) : null;   // forExport: width undefined => canonical 1200/1280
}
function posterData(){
  const fi = focusedIndex(sim.rows, focusIdx);
  const r = sim.rows[fi];
  return {
    verdict: riskVerdict(sim, model, focusIdx),
    name: model.title || 'Risk transfer',
    /* rows = the structures PLUS the merchant baseline, so counting rows would
       claim one structure more than the model actually has */
    metrics: [model.structures.length + (model.structures.length === 1 ? ' structure' : ' structures'),
              r.label + ' P50 ' + fmtUnit(r.p50, model.unit)],
  };
}
function posterString(){
  if(!sim) return null;
  return posterSvg({chart: svgString(true, true), ...posterData(),
    date: isoToday(), accent: model.accent || themeColors().accent, colors: themeColors(), measure});
}
function slug(){
  return slugify(model && model.title, 'risk');
}
wireExports({
  buttons: {dlsvg: $('dlsvg'), dlpng: $('dlpng'), dlslide: $('dlslide'), dlposter: $('dlposter'), copypng: $('copypng')},
  getSvg: () => svgString(false),
  getSvgSlide: () => svgString(true),
  getPoster: posterString,
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

/* ---------- boot ---------- */
(function(){
  const hash = readHashState();
  let text = hash && typeof hash.t === 'string' ? hash.t : '';
  if(hash && hash.e === 0) ws.setCollapsed(true);
  if(hash && typeof hash.f === 'number') focusIdx = hash.f;
  if(!text){
    try{ text = localStorage.getItem('risk-src') || ''; }catch(e){}
  }
  if(text) editor.setText(text);
  else if(!autoloadExample(() => editor.setText(EXAMPLES[0].src))) refresh();
})();
