/* State, refresh loop, focus, edit-in-place, exports, boot. DOM lives here only. */
import {parse} from './parse.js';
import {simulate} from './engine.js';
import {render, toMarkdown} from './render.js';
import {createEditor} from './editor.js';
import {validators, editField} from './edit-targets.js';
import {readHashState, writeHashState} from '../../assets/series.js';
import {mobileAutoload, shouldPersist} from '../../assets/mobile.js';
import {measure, isDark, themeColors, download, svgToCanvas, onThemeChange} from '../../assets/app-common.js';
import {initWorkspace, setActionsEnabled} from '../../assets/workspace.js';
import {attachEditInPlace} from '../../assets/edit-in-place.js';

const $ = id => document.getElementById(id);

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

const NARROW = 520;
const stageEl = $('preview');
function renderWidth(){
  const w = stageEl.clientWidth;
  return (w && w < NARROW) ? w : undefined;   // undefined => renderer keeps its constant
}
function ctx(slide, forExport = false){
  return {colors: themeColors(), measure, slide, dark: isDark(), width: forExport ? undefined : renderWidth()};
}
function activeRender(slide, edit = false, forExport = false){
  return render(model, sim, ctx(slide, forExport), {edit, focus: focusIdx});
}
function renderWarnings(){
  const warns = $('warns');
  warns.textContent = '';
  for(const w of (model ? model.warnings : [])){
    const li = document.createElement('li');
    li.textContent = w;
    warns.appendChild(li);
  }
}
function doRefresh(){
  const text = editor.getText();
  model = parse(text);
  sim = simulate(model);
  const pv = $('preview');
  if(!sim){
    lastSvg = '';
    pv.innerHTML = '<p class="placeholder">' + (text.trim()
      ? 'Add a merchant line — like “merchant: 60..180” — to have something to compare against.'
      : 'Start typing — or load an example.') + '</p>';
  } else {
    if(focusIdx !== null && focusIdx >= sim.rows.length) focusIdx = null;
    const svg = activeRender(false, true);
    if(svg !== lastSvg){ pv.innerHTML = svg; lastSvg = svg; }
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
  lastSvg = '';
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
for(const ex of EXAMPLES){
  const b = document.createElement('button');
  b.className = 'chip';
  b.textContent = ex.name;
  b.addEventListener('click', () => { focusIdx = null; editor.setText(ex.src); });
  $('chips').appendChild(b);
}

/* ---------- exports ---------- */
function svgString(slide){
  return sim ? activeRender(slide, false, true) : null;   // forExport: width undefined => canonical 1200/1280
}
function slug(){
  return ((model && model.title) || 'risk').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}
$('dlsvg').addEventListener('click', () => {
  const svg = svgString(false);
  if(svg) download(slug() + '.svg', new Blob([svg], {type: 'image/svg+xml'}));
});
$('dlpng').addEventListener('click', () => {
  const svg = svgString(false);
  if(svg) svgToCanvas(svg, c => c.toBlob(b => download(slug() + '.png', b), 'image/png'));
});
$('dlslide').addEventListener('click', () => {
  const svg = svgString(true);
  if(svg) svgToCanvas(svg, c => c.toBlob(b => download(slug() + '-slide.png', b), 'image/png'));
});
$('copypng').addEventListener('click', () => {
  const svg = svgString(false);
  if(!svg) return;
  if(!navigator.clipboard || !window.ClipboardItem){
    flash('copypng', 'Clipboard unavailable — use Download', 2200);
    return;
  }
  const blobPromise = new Promise((resolve, reject) =>
    svgToCanvas(svg, c => c.toBlob(b => b ? resolve(b) : reject(new Error('toBlob')), 'image/png')));
  navigator.clipboard.write([new ClipboardItem({'image/png': blobPromise})])
    .then(() => flash('copypng', 'Copied — paste into your deck', 1800))
    .catch(() => flash('copypng', 'Copy blocked — use Download', 2200));
});
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
function rerender(){ lastSvg = ''; refresh(); }
onThemeChange(rerender);

/* ---------- narrow-bucket resize: re-render only when the bucket flips ---------- */
let lastBucket = null;
const ro = new ResizeObserver(() => {
  const w = stageEl.clientWidth;
  const bucket = (w && w < NARROW) ? 'narrow' : 'wide';
  if(bucket === lastBucket) return;
  lastBucket = bucket;
  rerender();
});
ro.observe(stageEl, {box: 'content-box'});

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
  else if(!mobileAutoload(() => editor.setText(EXAMPLES[0].src))) refresh();
})();
