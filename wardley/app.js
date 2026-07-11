/* State, refresh loop, drag-to-evolve, edit-in-place, snapshots, exports, boot. */
import {parse} from './parse.js';
import {layoutMap} from './layout.js';
import {renderMap, toMarkdown, GEOM, NARROW} from './render.js';
import {createEditor} from './editor.js';
import {kinds, renameComponent, renameAnchor, cycleStage, dragRewrite,
  addComponent, removeComponent} from './edit-targets.js';
import {readHashState, writeHashState, mix} from '../assets/series.js';
import {applyLineOps, insertAndSelect} from '../assets/editor-common.js';
import {measure, isDark, themeColors, onThemeChange, renderWarningList, slugify} from '../assets/app-common.js';
import {wireExports} from '../assets/exports.js';
import {debounced, rafBatched} from '../assets/schedule.js';
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
Analytics pipeline    // no position yet

Habit tracking -> Habit builder -> Streak engine -> User DB
Habit builder -> Notification service -> Push gateway
Habit tracking -> Social feed -> Notification service
Social feed -> Analytics pipeline
Social feed -> Streak engine`},
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

let model = null, lastSvg = '', hashTimer = null;
let snaps = null;

/* validated 2026-07-10 (dataviz validate_palette, ordinal mode, both themes):
   one-hue evolution ramp accent → ink at t = 0, ⅓, ⅔, 1.
   light #0c7fae→#22323c 4.23:1 vs #F7F8F6 · dark #2e93c4→#d7e0e6 5.04:1 vs #141B21 */
function stageRamp(c){
  return [0, 1 / 3, 2 / 3, 1].map(t => mix(c.accent, c.ink, t));
}
function ctx(){
  const colors = themeColors();
  return {colors, measure, dark: isDark(), palette: stageRamp(colors), today: todayISO()};
}
function currentCompare(){
  const cur = snaps && snaps.current();
  if(!cur || !model) return null;
  return {prev: cur.model, label: cur.label};
}
/* width-aware: the preview re-lays-out below NARROW; exports stay pinned wide */
let sizeBucket = 'wide';
function activeRender(forExport = false){
  const compare = currentCompare();
  const c = ctx();
  if(!forExport && sizeBucket === 'narrow') c.width = $('preview').clientWidth;
  const opts = {};
  if(compare) opts.compare = compare;
  if(!forExport) opts.edit = true;   // chrome only for the live preview, never exports
  return renderMap(model, layoutMap(model), c, opts);
}
function renderWarnings(){
  renderWarningList($('warns'), model ? model.warnings : []);
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
const refresh = rafBatched(doRefresh);
const editor = createEditor({
  parent: $('cmhost'),
  doc: '',
  onChange: debounced(refresh, 120),
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

/* narrow-bucket resize: re-render only when the bucket flips (cycles' pattern) */
const ro = new ResizeObserver(() => {
  const w = $('preview').clientWidth;
  const bucket = (w && w < NARROW) ? 'narrow' : 'wide';
  if(bucket === sizeBucket) return;
  sizeBucket = bucket;
  lastSvg = '';
  refresh();
});
ro.observe($('preview'), {box: 'content-box'});

/* ---------- edit-in-place ---------- */
function applyEdits(edits){
  applyLineOps(editor, edits);
}
attachEditInPlace($('preview'), {
  kinds: {...kinds,
    additem: {validate: kinds.name.validate},
    componentmenu: {actions: [{label: 'Remove component', danger: true}]}},
  onCommit(kind, lineNo, oldRaw, newValue, el){
    if(kind === 'additem'){
      const r = addComponent(editor.getText(), newValue, el.dataset.stage || null);
      insertAndSelect(editor, r.afterLine, r.newLine, r.select,
        {focus: matchMedia('(pointer: fine)').matches});
      return;
    }
    if(kind === 'componentmenu'){
      if(newValue === '✖Remove component')
        applyLineOps(editor, removeComponent(editor.getText(), lineNo, el.dataset.raw));
      return;
    }
    const text = editor.getText();
    const edits = kind === 'stage' ? cycleStage(text, lineNo, newValue)
      : kind === 'anchor' ? renameAnchor(text, lineNo, oldRaw, newValue)
      : renameComponent(text, lineNo, oldRaw, newValue);
    applyEdits(edits);
  },
});

/* ---------- drag-to-evolve (horizontal only; release writes "@ x") ----------
   Two modes: wide pills drag by DELTA (grab anywhere on the pill); narrow
   strips map the pointer ABSOLUTELY across the card's track (thumb-natural). */
let suppressClick = false;   // a completed drag must not open the name editor
const drag = {armed: null, active: false, el: null};
function dragEnd(commit = false){
  if(drag.el){
    drag.el.classList.remove('dragging');
    drag.el.removeAttribute('transform');
    if(!commit && drag.armed && drag.armed.dot) drag.armed.dot.setAttribute('cx', drag.armed.dot0);
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
  const track = g.hasAttribute('data-strip') ? g.querySelector('[data-track]') : null;
  const dot = track ? g.querySelector('[data-dot]') : null;
  drag.armed = {line: +g.dataset.line, name: g.dataset.name, x: e.clientX, y: e.clientY,
    track, dot, dot0: dot ? +dot.getAttribute('cx') : 0, ratio: null};
  drag.el = g;
  /* capture ONLY strip drags: with capture active, the compatibility click
     retargets to the capturing g, which would blind edit-in-place's
     [data-edit] lookup on the wide pills */
  if(track) try{ g.setPointerCapture(e.pointerId); }catch(err){}
});
window.addEventListener('pointermove', e => {
  if(!drag.armed) return;
  if(!drag.active){
    if(Math.abs(e.clientX - drag.armed.x) < 4) return;
    drag.active = true;
    drag.el.classList.add('dragging');
    document.body.style.cursor = 'grabbing';
  }
  if(drag.armed.track){
    const r = drag.armed.track.getBoundingClientRect();
    const ratio = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width));
    drag.armed.ratio = ratio;
    drag.armed.dot.setAttribute('cx',
      +drag.armed.track.dataset.x0 + ratio * +drag.armed.track.dataset.w);
    return;
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
  const ratio = drag.armed.ratio;
  const track = drag.armed.track;
  dragEnd(wasActive);
  if(!model) return;
  /* a plain TAP on a strip places the dot under the thumb — placement should
     not demand a drag on a phone */
  if(track && !wasActive){
    const r = track.getBoundingClientRect();
    suppressClick = true;
    applyEdits(dragRewrite(editor.getText(), line,
      Math.min(1, Math.max(0, (e.clientX - r.left) / r.width))));
    if(matchMedia('(pointer: fine)').matches) editor.view.focus();
    return;
  }
  if(!wasActive) return;
  suppressClick = true;
  if(track){
    if(ratio !== null) applyEdits(dragRewrite(editor.getText(), line, ratio));
  } else {
    const s = evoScale();
    const comp = model.components.get(key);
    if(!s || !comp) return;
    const origEvo = comp.x === null ? 0 : comp.x;
    applyEdits(dragRewrite(editor.getText(), line, origEvo + (e.clientX - startX) * s.perPx));
  }
  /* keep ⌘Z live after a drag; never on coarse pointers (focus pops the keyboard) */
  if(matchMedia('(pointer: fine)').matches) editor.view.focus();
});
window.addEventListener('pointercancel', () => { if(drag.armed) dragEnd(); });
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

/* ---------- exports (always the wide artefact, whatever the screen) ---------- */
function svgString(){
  return (model && model.components.size) ? activeRender(true) : null;
}
function slug(){
  return slugify(model.title, 'wardley');
}
wireExports({
  buttons: {dlsvg: $('dlsvg'), dlpng: $('dlpng'), dlslide: $('dlslide'), copypng: $('copypng')},
  getSvg: () => svgString(),
  getSvgSlide: () => svgString(),
  slug,
});
/* copymd keeps its inline handler: on clipboard failure it falls back to a
   prompt() with the markdown so it's still copyable — wireExports has no
   equivalent fallback, so migrating would lose that behaviour. */
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
