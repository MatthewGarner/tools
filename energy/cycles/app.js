/* State, refresh loop, edit-in-place, exports, boot. DOM lives here only. */
import {parse} from './parse.js';
import {simulate} from './engine.js';
import {render, toMarkdown} from './render.js';
import {createEditor} from './editor.js';
import {validators, editField} from './edit-targets.js';
import {readHashState, writeHashState} from '../../assets/series.js';
import {autoloadExample, shouldPersist} from '../../assets/mobile.js';
import {measure, isDark, themeColors, download, svgToCanvas, onThemeChange, renderWarningList} from '../../assets/app-common.js';
import {initWorkspace, setActionsEnabled} from '../../assets/workspace.js';
import {attachEditInPlace} from '../../assets/edit-in-place.js';

const $ = id => document.getElementById(id);

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

let model = null, out = null, lastSvg = '';
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
  return render(model, out, ctx(slide, forExport), {edit});
}
function renderWarnings(){
  renderWarningList($('warns'), model ? model.warnings : []);
}
function doRefresh(){
  const text = editor.getText();
  model = parse(text);
  out = simulate(model, {seed: 1, n: 5000});
  const pv = $('preview');
  if(!out){
    lastSvg = '';
    pv.innerHTML = '<p class="placeholder">' + (text.trim()
      ? 'Missing: ' + model.missing.join(', ') + ' — or load an example.'
      : 'Start typing — or load an example.') + '</p>';
  } else {
    const svg = activeRender(false, true);
    if(svg !== lastSvg){ pv.innerHTML = svg; lastSvg = svg; }
  }
  renderWarnings();
  setActionsEnabled(!!out);
  try{ if(shouldPersist()) localStorage.setItem('cycles-src', text); }catch(e){}
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
  return ((model && model.title) || 'cycles').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
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
  if(!text){
    try{ text = localStorage.getItem('cycles-src') || ''; }catch(e){}
  }
  if(text) editor.setText(text);
  else if(!autoloadExample(() => editor.setText(EXAMPLES[0].src))) refresh();
})();
