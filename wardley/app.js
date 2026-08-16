/* State, refresh loop, drag-to-evolve, edit-in-place, snapshots, exports, boot. */
import {parse} from './parse.js';
import {layoutMap} from './layout.js';
import {renderMap, toMarkdown, GEOM, NARROW} from './render.js';
import {createEditor} from './editor.js';
import {kinds, renameComponent, renameAnchor, cycleStage, dragRewrite,
  addComponent, addedComponentTarget, removeComponent, addEdge, removeEdge} from './edit-targets.js';
import {readHashState, writeHashState, mix} from '../assets/series.js';
import {applyLineOps} from '../assets/editor-common.js';
import {measure, isDark, themeColors, onThemeChange, renderWarningList, slugify, exampleChips} from '../assets/app-common.js';
import {wireExports} from '../assets/exports.js';
import {debounced, rafBatched} from '../assets/schedule.js';
import {initWorkspace, setActionsEnabled, mountTouchUndo} from '../assets/workspace.js';
import {mountMotion} from "../assets/motion.js";
import {REVEAL} from "./motion-spec.js";
import {attachEditInPlace} from '../assets/edit-in-place.js';
import {verdictMenuRows, handleVerdictCommit, validVerdictInput} from '../assets/verdict-edit.js';
import {mapReadout} from './render.js';
import {snapStore, wireSnapshots} from '../assets/snapshots.js';
import {autoloadExample, shouldPersist} from '../assets/mobile.js';
import {paintKicker, paintMetrics} from '../assets/verdict.js';
import {makeDragClickGuard} from './drag-click-guard.js';
import {STARTER} from './starter.js';

const $ = id => document.getElementById(id);
const paint = mountMotion($("preview"));
const todayISO = () => new Date().toISOString().slice(0, 10);

const EXAMPLES = [
  {name: 'Lantern platform', src:
`title: Lantern platform
anchor: Reading

Library @ product
Recommendations @ custom
Book clubs @ genesis
Notification service @ product
Catalogue DB @ commodity
Push gateway @ commodity
Analytics pipeline    // no position yet

Reading -> Library -> Recommendations -> Catalogue DB
Library -> Notification service -> Push gateway
Reading -> Book clubs -> Notification service
Book clubs -> Analytics pipeline
Book clubs -> Recommendations`},
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

let model = null, layout = null, lastSvg = '', hashTimer = null;
let snaps = null;
let inspected = null;
function clearInspection({restore=false} = {}){
  const origin=inspected && inspected.origin;
  inspected=null; $('margin').hidden=true; $('margin').replaceChildren();
  $('margin').parentElement.classList.remove('has-margin');
  for(const el of $('preview').querySelectorAll('.is-inspected')) el.classList.remove('is-inspected');
  if(restore && origin && origin.isConnected) origin.focus();
}
function inspectComponent(line, origin){
  const node=layout && layout.nodes.find(n=>n.srcLine===line); if(!node) return;
  clearInspection(); inspected={line,origin};
  for(const el of $('preview').querySelectorAll('[data-line="'+line+'"]')) el.classList.add('is-inspected');
  const key=node.name.toLowerCase(), needs=model.edges.filter(e=>e.from===key).map(e=>e.to).join(', ')||'—', neededBy=model.edges.filter(e=>e.to===key).map(e=>e.from).join(', ')||'—';
  const m=$('margin'),k=document.createElement('p'),h=document.createElement('h2'),dl=document.createElement('dl');k.className='margin-kicker';k.textContent='DECISION MARGIN';h.id='margin-title';m.setAttribute('aria-labelledby',h.id);h.tabIndex=-1;h.textContent=node.name;
  for(const [a,b] of [['Source','Line '+(line+1)],['Evolution',node.stage || (node.x == null ? 'Unplaced' : Math.round(node.x*100)+'%')],['Needs',needs],['Needed by',neededBy]]){const dt=document.createElement('dt'),dd=document.createElement('dd');dt.textContent=a;dd.textContent=b;dl.append(dt,dd);}
  const actions=document.createElement('div'),edit=document.createElement('button'),close=document.createElement('button');actions.className='margin-actions';edit.className=close.className='btn';edit.textContent='Edit source';close.textContent='Close';edit.addEventListener('click',()=>{clearInspection();ws.setCollapsed(false);const l=editor.view.state.doc.line(line+1);editor.view.dispatch({selection:{anchor:l.from},scrollIntoView:true});editor.view.focus();});close.addEventListener('click',()=>clearInspection({restore:true}));actions.append(edit,close);m.replaceChildren(k,h,dl,actions);m.hidden=false;m.parentElement.classList.add('has-margin');h.focus();
}

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
function activeRender(renderIntent){
  const intent = renderIntent || (sizeBucket === 'narrow' ? 'live-narrow' : 'live-wide');
  const compare = currentCompare();
  const c = ctx();
  c.intent = intent;
  if(intent === 'live-narrow') c.width = $('preview').clientWidth;
  const opts = {intent};
  if(compare) opts.compare = compare;
  if(intent.startsWith('live-')) opts.edit = true;
  const renderLayout = layoutMap(model, {measure, intent, geom: GEOM});
  return renderMap(model, renderLayout, c, opts);
}
function renderWarnings(){
  renderWarningList($('warns'), model ? model.warnings : []);
}
function doRefresh(){
  clearInspection();
  const text = editor.getText();
  model = parse(text);
  const pv = $('preview');
  if(!model.components.size){
    layout = null;
    lastSvg = ''; paint.reset();
    pv.innerHTML = '<p class="placeholder">' + (text.trim()
      ? 'No components yet — write one like “Recommendations @ custom”.'
      : 'Start typing — or load an example.') + '</p>';
    paintMetrics($('metrics'), '', []);
  } else {
    layout = layoutMap(model, {measure, intent: 'native', geom: GEOM});
    const svg = activeRender();
    paint(svg, REVEAL); lastSvg = svg;
    /* the verdict itself is drawn INSIDE the artefact (render.js's readout band) —
       one verdict per page, and it travels with every export */
    paintMetrics($('metrics'), model.title || 'Wardley map', mapCounts());
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
mountTouchUndo(document.querySelector('.stage .actions'), editor);   // phones have no ⌘Z (Rule 2)
function writeHash(){
  if(!shouldPersist()) return;
  const state = {t: editor.getText()};
  state.e = ws.collapsed() ? 0 : 1;
  writeHashState(state);
}
snaps = wireSnapshots({
  store: snapStore('wardley-snaps'),
  parse,
  getSrc: () => editor.getText(),
  makeLabel: () => todayISO() + (model && model.title ? ' — ' + model.title.slice(0, 30) : ''),
  els: {snap: $('snap'), sel: $('snapsel'), del: $('snapdel')},
  canSnap: () => model && model.components.size,
  onChange(){ lastSvg = ''; paint.reset(); refresh(); },
});
const ws = initWorkspace({
  workspace: $('workspace'), tab: $('railtab'),
  preview: $('preview'), zoomHost: $('zoomctl'),
  onCollapseChange(){ clearTimeout(hashTimer); hashTimer = setTimeout(writeHash, 100); }, initialCollapsed:true,
  collapsedLabel:'Edit landscape source', collapsedAriaLabel:'Edit landscape source', expandedLabel:'Hide landscape source',
});

/* narrow-bucket resize: re-render only when the bucket flips (cycles' pattern) */
const ro = new ResizeObserver(() => {
  const w = $('preview').clientWidth;
  const bucket = (w && w < NARROW) ? 'narrow' : 'wide';
  if(bucket === sizeBucket) return;
  sizeBucket = bucket;
  lastSvg = ''; paint.reset();
  refresh();
});
ro.observe($('preview'), {box: 'content-box'});

/* ---------- edit-in-place ---------- */
function applyEdits(edits){
  applyLineOps(editor, edits);
}
/* The ⋯ menu for a component (phone edges, mobile-input stage): Needs… lists
   every OTHER component as a marked toggle row — on = "this -> that" exists —
   and Remove stays the danger action. Resolved fresh from the current model at
   each open (timeline's milestoneMenu idiom). A row commits the self-contained
   kind "needs" ("needs" is a commit payload, not a data-edit target, so it
   lives outside `kinds`); the app toggles via addEdge/removeEdge. Edges also
   touching this component the OTHER way (that -> this) are that component's
   own Needs… rows — each direction is its own edge. */
function componentMenuRows(el){
  const from = el.dataset.raw || '', fk = from.toLowerCase();
  const line = +el.dataset.line;
  const rows = [];
  const targets = model
    ? [...model.components.values()].filter(c => c.name.toLowerCase() !== fk) : [];
  if(targets.length) rows.push({label: 'Needs…', submenu: targets.map(c => ({
    label: c.name,
    on: model.edges.some(e => e.from === fk && e.to === c.name.toLowerCase()),
    commit: {kind: 'needs', line, oldRaw: from, value: c.name},
  }))});
  rows.push({label: 'Inspect…', action: true}, {label: 'Remove component', action: true, danger: true});
  return rows;
}
const eip = attachEditInPlace($('preview'), {
  kinds: {...kinds,
    additem: {validate: kinds.name.validate},
    componentmenu: {menu: componentMenuRows},
    verdict: {menu: () => verdictMenuRows(model && model.verdict)},
    verdictedit: {validate: validVerdictInput,
      placeholder: () => (model && layout) ? mapReadout(model, layout).verdict : ''}},
  onCommit(kind, lineNo, oldRaw, newValue, el){
    if(handleVerdictCommit(kind, newValue, {
      getText: () => editor.getText(), setText: t => editor.setText(t),
      configRe: /^(title|palette|accent|anchor|verdict)\s*:/i,
      getLine: () => (model && layout) ? mapReadout(model, layout).verdict : '',
    })) return;
    if(kind === 'additem'){
      const r = addComponent(editor.getText(), newValue, el.dataset.stage || null);
      editor.insertLinesAfter(r.afterLine, [r.newLine]);
      eip.focusAt(addedComponentTarget(r, newValue), {origin: el});
      return;
    }
    if(kind === 'componentmenu'){
      if(newValue === '✖Inspect…'){ inspectComponent(lineNo, el); return; }
      if(newValue === '✖Remove component')
        applyLineOps(editor, removeComponent(editor.getText(), lineNo, el.dataset.raw));
      return;
    }
    if(kind === 'needs'){
      /* toggle: removeEdge doubles as the existence check (ops iff the pair is
         in the text right now), so a stale menu can never write a duplicate.
         Neither branch focuses the editor — no soft-keyboard jump on coarse. */
      const text = editor.getText();
      const ops = removeEdge(text, oldRaw, newValue);
      if(ops.length){ applyEdits(ops); return; }
      const r = addEdge(text, oldRaw, newValue);
      if(r) editor.insertLinesAfter(r.afterLine, [r.newLine]);
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
const dragClick = makeDragClickGuard();
const drag = {armed: null, active: false, el: null};
const dragKey = d => d.line + '\0' + d.name;
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
  /* A later physical gesture is definitive proof that the compatibility-click
     turn has passed, even if a background tab delayed the expiry timer. */
  dragClick.clear();
  const g = e.target.closest && e.target.closest('#preview svg g[data-drag="evo"]');
  if(!g || e.button !== 0 || !model) return;
  clearInspection();
  e.preventDefault();
  const track = g.hasAttribute('data-strip') ? g.querySelector('[data-track]') : null;
  const dot = track ? g.querySelector('[data-dot]') : null;
  drag.armed = {pointerId: e.pointerId, line: +g.dataset.line, name: g.dataset.name, x: e.clientX, y: e.clientY,
    track, dot, dot0: dot ? +dot.getAttribute('cx') : 0, ratio: null};
  drag.el = g;
  /* capture ONLY strip drags: with capture active, the compatibility click
     retargets to the capturing g, which would blind edit-in-place's
     [data-edit] lookup on the wide pills */
  if(track) try{ g.setPointerCapture(e.pointerId); }catch(err){}
});
window.addEventListener('pointermove', e => {
  if(!drag.armed || e.pointerId !== drag.armed.pointerId) return;
  if(!drag.active){
    if(Math.abs(e.clientX - drag.armed.x) < 4) return;
    drag.active = true;
    drag.el.classList.add('dragging');
    document.body.style.cursor = 'grabbing';
    /* wide-pill (non-track) drags deliberately don't capture at pointerdown —
       mirroring the strip path immediately would retarget the compatibility
       click and blind edit-in-place's [data-edit] lookup on a plain TAP (see
       the pointerdown comment). Once this 4px threshold confirms a REAL drag
       is underway, it's safe: capturing now closes the same release-outside-
       the-window gap the strip path already covers via its early capture,
       without touching plain-click routing (a click never reaches here). */
    if(!drag.armed.track) try{ drag.el.setPointerCapture(drag.armed.pointerId); }catch(err){}
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
  if(!drag.armed || e.pointerId !== drag.armed.pointerId) return;
  const pointerId = drag.armed.pointerId;
  const componentKey = dragKey(drag.armed);
  const releaseTarget = document.elementFromPoint(e.clientX, e.clientY);
  const releasedInside = !!(releaseTarget && $('preview').contains(releaseTarget));
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
    if(releasedInside) dragClick.arm(pointerId, componentKey);
    else dragClick.clear(pointerId);
    applyEdits(dragRewrite(editor.getText(), line,
      Math.min(1, Math.max(0, (e.clientX - r.left) / r.width))));
    if(matchMedia('(pointer: fine)').matches) editor.view.focus();
    return;
  }
  if(!wasActive) return;
  if(releasedInside) dragClick.arm(pointerId, componentKey);
  else dragClick.clear(pointerId);
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
window.addEventListener('pointercancel', e => {
  dragClick.clear(e.pointerId);
  if(drag.armed && e.pointerId === drag.armed.pointerId) dragEnd();
});
$('preview').addEventListener('lostpointercapture', e => {
  /* Automatic release after pointerup is no longer an armed gesture.  A loss
     while armed is cancellation, and must clear both drag and click state. */
  if(drag.armed && e.pointerId === drag.armed.pointerId){
    dragClick.clear(e.pointerId);
    dragEnd();
  }
});
window.addEventListener('keydown', e => {
  if(e.key !== 'Escape' || e.defaultPrevented) return;
  if(drag.armed){ dragClick.clear(drag.armed.pointerId); dragEnd(); }
  else clearInspection({restore:true});
});
$('preview').addEventListener('click', e => {
  const g = e.target.closest && e.target.closest('#preview svg g[data-drag="evo"]');
  const pointerId = typeof e.pointerId === 'number' ? e.pointerId : null;
  const componentKey = g ? g.dataset.line + '\0' + g.dataset.name : '';
  if(dragClick.consume(pointerId, componentKey)) e.stopPropagation();
}, true);

/* ---------- example chips ---------- */
exampleChips($('chips'), EXAMPLES, ex => editor.setText(ex.src), {start: {src: STARTER}});

/* ---------- exports (always the wide artefact, whatever the screen) ---------- */
function svgString(intent){
  return (model && model.components.size) ? activeRender(intent) : null;
}
/* The counted facts the map already knows, feeding the page's metrics row. */
function mapCounts(){
  const comps = layout.nodes.filter(n => !n.anchor);
  const ghostN = comps.filter(n => n.ghost).length;
  return [comps.length + (comps.length === 1 ? ' component' : ' components'),
          model.edges.length + (model.edges.length === 1 ? ' dependency' : ' dependencies'),
          ...(ghostN ? [ghostN + ' unplaced'] : [])];
}
function slug(){
  return slugify(model.title, 'wardley');
}
wireExports({
  buttons: {dlsvg: $('dlsvg'), dlpng: $('dlpng'), copypng: $('copypng')},
  getSvg: () => svgString('native'),
  getCopy: () => svgString('presentation'),
  slug,
});
/* copymd keeps its inline handler: on clipboard failure it falls back to a
   prompt() with the markdown so it's still copyable — wireExports has no
   equivalent fallback, so migrating would lose that behaviour. */
$('copymd').addEventListener('click', async () => {
  if(!model || !model.components.size) return;
  const md = toMarkdown(model, layoutMap(model, {measure, intent: 'native', geom: GEOM}), location.href);
  try{ await navigator.clipboard.writeText(md); flash('copymd', 'Copied', 1500); }
  catch(e){ prompt('Copy this:', md); }
});
function flash(id, msg, ms){
  const b = $(id), was = b.textContent;
  b.textContent = msg;
  setTimeout(() => { b.textContent = was; }, ms);
}

/* ---------- theme ---------- */
onThemeChange(() => { lastSvg = ''; paint.reset(); refresh(); });

/* ---------- boot ---------- */
paintKicker($('kicker'), '09', 'The landscape as text');
(async function(){
  const hash = await readHashState();
  let text = hash && typeof hash.t === 'string' ? hash.t : '';
  if(hash && hash.e === 1) ws.setCollapsed(false);
  if(!text){
    try{ text = localStorage.getItem('wardley-src') || ''; }catch(e){}
  }
  if(text) editor.setText(text);
  else if(!autoloadExample(() => editor.setText(EXAMPLES[0].src))) refresh();
})();

/* try-it specimens: the syntax reference inserts into the editor (2026-08-02) */
import {wireSyntaxTry} from '../assets/syntax-try.js';
wireSyntaxTry(document.querySelector('details.syntax'), editor, ['title', 'palette', 'accent', 'verdict']);
