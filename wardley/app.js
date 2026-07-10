/* State, refresh loop, drag-to-evolve, edit-in-place, snapshots, exports, boot. */
import {parse} from './parse.js';
import {layoutMap} from './layout.js';
import {renderMap, toMarkdown, GEOM} from './render.js';
import {createEditor} from './editor.js';
import {kinds, renameComponent, renameAnchor, cycleStage, dragRewrite} from './edit-targets.js';
import {readHashState, writeHashState, mix} from '../assets/series.js';
import {measure, isDark, themeColors, download, svgToCanvas, onThemeChange} from '../assets/app-common.js';
import {initWorkspace, setActionsEnabled} from '../assets/workspace.js';
import {attachEditInPlace} from '../assets/edit-in-place.js';
import {snapStore, wireSnapshots} from '../assets/snapshots.js';
import {autoloadExample, shouldPersist} from '../assets/mobile.js';

const $ = id => document.getElementById(id);
const todayISO = () => new Date().toISOString().slice(0, 10);

const EXAMPLES = [
  {name: 'Habitat platform', src:
`title: Habitat platform
anchor: Habit tracking

Habit builder @ product
Streak engine @ custom
Social feed @ genesis
Notification service @ product
User DB @ commodity
Push gateway @ commodity
Analytics pipeline    // no position yet — drag it onto the map

Habit tracking -> Habit builder -> Streak engine -> User DB
Habit builder -> Notification service -> Push gateway
Habit tracking -> Social feed -> Notification service
Social feed -> Analytics pipeline`},
  {name: 'Online tea shop', src:
`title: Online tea shop
anchor: Thirsty customer

Storefront @ product
House blends @ custom
Tea supply @ commodity
Payments @ commodity
Hosting @ commodity

Thirsty customer -> Storefront -> Payments
Storefront -> House blends -> Tea supply
Storefront -> Hosting`},
];

let model = null, lastSvg = '', rafId = 0, hashTimer = null, debTimer = null;
let snaps = null;

/* validated 2026-07-10 (dataviz validate_palette, ordinal mode, both themes):
   one-hue evolution ramp accent → ink at t = 0, ⅓, ⅔, 1.
   light #0c7fae→#22323c 4.23:1 vs #F7F8F6 · dark #2e93c4→#d7e0e6 5.04:1 vs #141B21 */
function stageRamp(c){
  return [0, 1 / 3, 2 / 3, 1].map(t => mix(c.accent, c.ink, t));
}
function ctx(){
  const colors = themeColors();
  return {colors, measure, dark: isDark(), palette: stageRamp(colors)};
}
function currentCompare(){
  const cur = snaps && snaps.current();
  if(!cur || !model) return null;
  return {prev: cur.model, label: cur.label};
}
function activeRender(){
  const compare = currentCompare();
  return renderMap(model, layoutMap(model), ctx(), compare ? {compare} : {});
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
  const pv = $('preview');
  if(!model.components.size){
    lastSvg = '';
    pv.innerHTML = '<p class="placeholder">' + (text.trim()
      ? 'No components yet — write one like “Streak engine @ custom”.'
      : 'Start typing — or load an example.') + '</p>';
  } else {
    const svg = activeRender();
    if(svg !== lastSvg){ pv.innerHTML = svg; lastSvg = svg; }
  }
  renderWarnings();
  setActionsEnabled(!!lastSvg);
  if(shouldPersist()){ try{ localStorage.setItem('wardley-src', text); }catch(e){} }
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
  if(!shouldPersist()) return;
  const state = {t: editor.getText()};
  if(ws.collapsed()) state.e = 0;
  writeHashState(state);
}
snaps = wireSnapshots({
  store: snapStore('wardley-snaps'),
  parse,
  getSrc: () => editor.getText(),
  makeLabel: () => todayISO() + (model && model.title ? ' — ' + model.title.slice(0, 30) : ''),
  els: {snap: $('snap'), sel: $('snapsel'), del: $('snapdel')},
  canSnap: () => model && model.components.size,
  onChange(){ lastSvg = ''; refresh(); },
});
const ws = initWorkspace({
  workspace: $('workspace'), tab: $('railtab'),
  preview: $('preview'), zoomHost: $('zoomctl'),
  onCollapseChange(){ clearTimeout(hashTimer); hashTimer = setTimeout(writeHash, 100); },
});

/* ---------- edit-in-place ---------- */
function applyEdits(edits){
  for(const e of edits) editor.replaceLine(e.line, e.text);
}
attachEditInPlace($('preview'), {
  kinds,
  onCommit(kind, lineNo, oldRaw, newValue){
    const text = editor.getText();
    const edits = kind === 'stage' ? cycleStage(text, lineNo, newValue)
      : kind === 'anchor' ? renameAnchor(text, lineNo, oldRaw, newValue)
      : renameComponent(text, lineNo, oldRaw, newValue);
    applyEdits(edits);
  },
});

/* ---------- drag-to-evolve (horizontal only; release writes "@ x") ---------- */
let suppressClick = false;   // a completed drag must not open the name editor
const drag = {armed: null, active: false, el: null};
function dragEnd(){
  if(drag.el){
    drag.el.classList.remove('dragging');
    drag.el.removeAttribute('transform');
  }
  drag.armed = null;
  drag.active = false;
  drag.el = null;
  document.body.style.cursor = '';
}
function evoScale(){
  const svg = $('preview').querySelector('svg');
  if(!svg) return null;
  const r = svg.getBoundingClientRect();
  return {perPx: (GEOM.w / r.width) / (GEOM.w - 2 * GEOM.pad), userPerPx: GEOM.w / r.width};
}
$('preview').addEventListener('pointerdown', e => {
  const g = e.target.closest && e.target.closest('#preview svg g[data-drag="evo"]');
  if(!g || e.button !== 0 || !model) return;
  e.preventDefault();
  drag.armed = {line: +g.dataset.line, name: g.dataset.name, x: e.clientX, y: e.clientY};
  drag.el = g;
});
window.addEventListener('pointermove', e => {
  if(!drag.armed) return;
  if(!drag.active){
    if(Math.abs(e.clientX - drag.armed.x) < 4) return;
    drag.active = true;
    drag.el.classList.add('dragging');
    document.body.style.cursor = 'grabbing';
  }
  const s = evoScale();
  if(!s) return;
  const dxUser = (e.clientX - drag.armed.x) * s.userPerPx;
  drag.el.setAttribute('transform', 'translate(' + dxUser + ' 0)');
});
window.addEventListener('pointerup', e => {
  if(!drag.armed) return;
  const wasActive = drag.active, line = drag.armed.line, startX = drag.armed.x;
  const key = drag.armed.name.toLowerCase();
  dragEnd();
  if(!wasActive || !model) return;
  suppressClick = true;
  const s = evoScale();
  const comp = model.components.get(key);
  if(!s || !comp) return;
  const origEvo = comp.x === null ? 0 : comp.x;
  const newX = origEvo + (e.clientX - startX) * s.perPx;
  applyEdits(dragRewrite(editor.getText(), line, newX));
  /* keep ⌘Z live after a drag; never on coarse pointers (focus pops the keyboard) */
  if(matchMedia('(pointer: fine)').matches) editor.view.focus();
});
window.addEventListener('keydown', e => {
  if(e.key === 'Escape' && drag.armed) dragEnd();
});
$('preview').addEventListener('click', e => {
  if(suppressClick){ e.stopPropagation(); suppressClick = false; }
}, true);

/* ---------- example chips ---------- */
for(const ex of EXAMPLES){
  const b = document.createElement('button');
  b.className = 'chip';
  b.textContent = ex.name;
  b.addEventListener('click', () => editor.setText(ex.src));
  $('chips').appendChild(b);
}

/* ---------- exports ---------- */
function svgString(){
  return (model && model.components.size) ? activeRender() : null;
}
function slug(){
  return ((model.title || 'wardley')).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}
$('dlsvg').addEventListener('click', () => {
  const svg = svgString();
  if(svg) download(slug() + '.svg', new Blob([svg], {type: 'image/svg+xml'}));
});
$('dlpng').addEventListener('click', () => {
  const svg = svgString();
  if(svg) svgToCanvas(svg, c => c.toBlob(b => download(slug() + '.png', b), 'image/png'));
});
$('dlslide').addEventListener('click', () => {
  const svg = svgString();
  if(svg) svgToCanvas(svg, c => c.toBlob(b => download(slug() + '-slide.png', b), 'image/png'));
});
$('copypng').addEventListener('click', () => {
  const svg = svgString();
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
  if(!model || !model.components.size) return;
  const md = toMarkdown(model, layoutMap(model), location.href);
  try{ await navigator.clipboard.writeText(md); flash('copymd', 'Copied', 1500); }
  catch(e){ prompt('Copy this:', md); }
});
function flash(id, msg, ms){
  const b = $(id), was = b.textContent;
  b.textContent = msg;
  setTimeout(() => { b.textContent = was; }, ms);
}

/* ---------- theme ---------- */
onThemeChange(() => { lastSvg = ''; refresh(); });

/* ---------- boot ---------- */
(function(){
  const hash = readHashState();
  let text = hash && typeof hash.t === 'string' ? hash.t : '';
  if(hash && hash.e === 0) ws.setCollapsed(true);
  if(!text){
    try{ text = localStorage.getItem('wardley-src') || ''; }catch(e){}
  }
  if(text) editor.setText(text);
  else if(!autoloadExample(() => editor.setText(EXAMPLES[0].src))) refresh();
})();
