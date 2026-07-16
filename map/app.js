/* State, refresh loop, saved maps, exports, edit-in-place, drag, boot. */
import {parse} from './parse.js';
import {resolve} from './zones.js';
import {readout, toMarkdown} from './readout.js';
import {render} from './render.js';
import {createEditor} from './editor.js';
import {readHashState, writeHashState} from '../assets/series.js';
import {autoloadExample, shouldPersist} from '../assets/mobile.js';
import {measure, isDark, themeColors, onThemeChange, renderWarningList, slugify, exampleChips} from '../assets/app-common.js';
import {wireExports} from '../assets/exports.js';
import {posterSvg} from '../assets/poster.js';
import {loadSaved, storeSaved, renderSavedChips} from '../assets/saved-items.js';
import {debounced, rafBatched} from '../assets/schedule.js';
import {initWorkspace, setActionsEnabled, mountTouchUndo} from '../assets/workspace.js';
import {mountMotion} from "../assets/motion.js";
import {REVEAL} from "./motion-spec.js";
import {attachEditInPlace} from '../assets/edit-in-place.js';
import {validators, setPosition, editLabel, editField, renameZone, setAxisLabel, addItemLine, removeItemLine} from './edit-targets.js';
import {snapStore, wireSnapshots} from '../assets/snapshots.js';
import {mapDiff, mapDiffView} from './diff.js';
import {gaugeHandoff} from './handoff.js';

const $ = id => document.getElementById(id);
const paint = mountMotion($("preview"));

const EXAMPLES = [
  {name: 'Assumption map', src:
`preset: assumptions
title: Habitat — launch assumptions

Users will log habits daily @ 30,90 :: test: watch 5 onboarding sessions
Streak anxiety drives churn @ 75,80 :: note: held in Q2 interviews
Users want social features @ 20,55 :: test: fake-door invite flow
Push reminders feel caring, not naggy @ 35,75
People will pay for coaching @ 15,85
Habit templates save setup time @ 80,45
App-store reviews drive installs @ 55,25
Legal sign-off on health claims
`},
  {name: 'Stakeholder grid', src:
`preset: stakeholders
title: Habitat 2.0 launch

Head of Product @ 85,90 :: attitude: champion
Finance director @ 30,85 :: attitude: sceptical
Support team lead @ 80,40
Data-privacy officer @ 40,75
App-store contact @ 55,30
Beta community @ 90,20 :: note: loud, low power, high goodwill
`},
  {name: 'Futures matrix', src:
`preset: futures
title: Habitat — 2030 worlds
x: Regulation of wellness apps (light → strict)
y: AI coaching acceptance (novelty → normal)
zone 1,2: Wild garden
zone 2,2: Certified coaches
zone 1,1: Gadget drawer
zone 2,1: Checkbox wellness

Insurers subsidise habit apps @ 75,80
Big-tech habit platform launches @ 30,70
Data-portability law passes @ 80,30
Backlash against streak mechanics @ 25,25
GP surgeries prescribe apps @ 70,65
`},
  {name: 'Skills coverage', src:
`preset: skills
title: Platform team — skills coverage

Payments integration @ 20,90 :: owner: Priya
Release pipeline @ 30,80 :: owner: Sam :: backup: Jo
Data migrations @ 15,70
Mobile build signing @ 40,85 :: owner: Jo
Design system @ 65,55
Customer analytics @ 70,40
Copywriting @ 85,25
`},
  {name: 'RAG honesty', src:
`preset: rag
title: Q3 programme — status honesty check

Billing revamp @ 25,30 :: reported: green
Mobile app parity @ 40,35 :: reported: amber
Onboarding funnel @ 75,70 :: reported: green
Data platform @ 30,60 :: reported: green
Partner API @ 80,30 :: reported: red
Help centre @ 60,75 :: reported: green
`},
  {name: 'Risk grid', src:
`preset: risk
title: Habitat 2.0 — launch risks

Payment migration slips @ 60,85 :: owner: platform team
App review rejection @ 35,90 :: mitigation: pre-review with store contact
Coach marketplace supply thin @ 70,60
Notification fatigue backlash @ 55,45
iOS beta crash spike @ 25,70
Press coverage flops @ 50,25
`},
];

/* ---------- refresh loop ---------- */
let model = null, resolved = null, ro = null;
let lastSvg = '', hashTimer = null;

function renderWarnings(){
  renderWarningList($('warns'), [...(model ? model.warnings : []), ...(resolved ? resolved.warnings : [])]);
}
function hasContent(){
  return model && (model.items.length || model.preset || model.grid || model.ruleZones.length);
}
let snaps = null;   // wired below, after the editor exists
function currentDiff(){
  const cur = snaps && snaps.current();
  if(!cur || !model || !ro) return null;
  return mapDiffView(mapDiff(cur.model, model), cur.label);
}
function activeRender(slide, edit = false, bare = false){
  return render(model, resolved, ro, {colors: themeColors(), measure, slide, dark: isDark(), edit, bare}, currentDiff());
}
function doRefresh(){
  const text = editor.getText();
  model = parse(text);
  resolved = resolve(model);
  const pv = $('preview');
  if(!hasContent()){
    ro = null;
    lastSvg = ''; paint.reset();
    pv.innerHTML = '<p class="placeholder">' + (text.trim()
      ? 'No map yet — add an item, or a preset: line.'
      : 'Start typing — or load an example.') + '</p>';
    $('verdict').textContent = '';
  } else {
    ro = readout(model, resolved);
    const svg = activeRender(false, true);
    paint(svg, REVEAL); lastSvg = svg;
    $('verdict').textContent = ro.verdict;
  }
  renderWarnings();
  setActionsEnabled(!!lastSvg);
  $('togauge').hidden = !(ro && ro.flagged.length);
  try{ if(shouldPersist()) localStorage.setItem('map-src', text); }catch(e){}
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
  const state = {t: editor.getText()};
  if(ws.collapsed()) state.e = 0;
  if(shouldPersist()) writeHashState(state);
}
snaps = wireSnapshots({
  store: snapStore('map-snaps'),
  parse,
  getSrc: () => editor.getText(),
  makeLabel: () => new Date().toISOString().slice(0, 10) +
    (model && model.title ? ' — ' + model.title.slice(0, 30) : ''),
  els: {snap: $('snap'), sel: $('snapsel'), del: $('snapdel')},
  canSnap: () => model && model.items.length,
  onChange(){ lastSvg = ''; paint.reset(); refresh(); },
});
const ws = initWorkspace({
  workspace: $('workspace'), tab: $('railtab'),
  preview: $('preview'), zoomHost: $('zoomctl'),
  onCollapseChange(){ clearTimeout(hashTimer); hashTimer = setTimeout(writeHash, 100); },
});

/* ---------- edit-in-place ---------- */
attachEditInPlace($('preview'), {
  kinds: {
    label: {validate: validators.label},
    field: {validate: validators.field},
    zonename: {validate: validators.zonename},
    axis: {validate: validators.axis},
    additem: {validate: validators.label},
    removeitem: {cycle: ['×']},
    cardmenu: {menu: [
      {label: 'Rename…', opens: 'label'},
      {label: 'Edit field…', opens: 'field'},   // opens the FIRST field target; dead if the item has none
      {label: 'Remove', action: true, danger: true},
    ]},
  },
  onCommit(kind, lineNo, oldRaw, newValue, el){
    if(newValue === '✖Remove'){
      if(removeItemLine(editor.getText(), lineNo)) editor.removeLine(lineNo);
      return;
    }
    if(kind === 'label'){
      const line = editor.getLine(lineNo);
      const newLine = editLabel(line, oldRaw, newValue);
      if(newLine !== line) editor.replaceLine(lineNo, newLine);
    } else if(kind === 'field'){
      const line = editor.getLine(lineNo);
      const newLine = editField(line, el.dataset.key, oldRaw, newValue);
      if(newLine !== line) editor.replaceLine(lineNo, newLine);
    } else if(kind === 'zonename'){
      const z = el.dataset.zone;
      const ref = z.startsWith('c:')
        ? {kind: 'cell', col: +z.slice(2).split(',')[0], row: +z.slice(2).split(',')[1],
           srcLine: lineNo >= 0 ? lineNo : null}
        : {kind: 'rule', srcLine: lineNo >= 0 ? lineNo : null};
      const t = renameZone(editor.getText(), ref, newValue);
      if(t != null && t !== editor.getText()) editor.setText(t);
    } else if(kind === 'axis'){
      const t = setAxisLabel(editor.getText(), el.dataset.axis, newValue);
      if(t !== editor.getText()) editor.setText(t);
    } else if(kind === 'additem'){
      const {afterLine} = addItemLine(editor.getText());
      editor.insertLinesAfter(afterLine, [newValue]);
    } else if(kind === 'removeitem'){
      if(removeItemLine(editor.getText(), lineNo)) editor.removeLine(lineNo);
    }
  },
});

/* ---------- example chips ---------- */
exampleChips($('chips'), EXAMPLES, ex => editor.setText(ex.src));

/* ---------- saved ---------- */
const SAVED_KEY = 'map-saved';
function renderSaved(){
  const row = $('savedrow');
  renderSavedChips(row, loadSaved(SAVED_KEY), {
    deleteLabel: m => 'Delete saved map ' + m.name,
    onLoad: m => editor.setText(m.src),
    onDelete: (m, i) => {
      const l = loadSaved(SAVED_KEY); l.splice(i, 1); storeSaved(SAVED_KEY, l); renderSaved();
    },
  });
  const save = document.createElement('button');
  save.className = 'chip';
  save.textContent = '＋ Save current';
  save.addEventListener('click', () => {
    if(!hasContent()) return;
    const list = loadSaved(SAVED_KEY);
    list.push({name: model.title ? model.title.slice(0, 28) : 'Map ' + (list.length + 1), src: editor.getText()});
    storeSaved(SAVED_KEY, list);
    renderSaved();
  });
  row.appendChild(save);
}

/* ---------- exports ---------- */
function svgString(slide, bare = false){
  if(!hasContent() || !ro) return null;
  return activeRender(slide, false, bare);
}
const isoToday = () => new Date().toISOString().slice(0, 10);
function posterData(){
  const n = model.items.length;
  return {
    verdict: ro.verdict,
    name: model.title || 'Map',
    metrics: [n + (n === 1 ? ' item' : ' items'),
              ...(ro.flagged.length ? [ro.flagged.length + ' flagged'] : []),
              ...(ro.unplaced.length ? [ro.unplaced.length + ' unplaced'] : [])],
  };
}
function posterString(){
  const chart = svgString(true, true);
  if(!chart) return null;
  return posterSvg({chart, ...posterData(), date: isoToday(),
    accent: themeColors().accent, colors: themeColors(), measure});
}
function slug(){
  return slugify(model.title || model.preset, 'map');
}
wireExports({
  buttons: {dlsvg: $('dlsvg'), dlpng: $('dlpng'), dlslide: $('dlslide'), dlposter: $('dlposter'),
            copypng: $('copypng'), copymd: $('copymd')},
  getSvg: () => svgString(false),
  getSvgSlide: () => svgString(true),
  getPoster: posterString,
  getMarkdown: () => ro ? toMarkdown(ro, model) : null,
  slug,
});

/* ---------- drag-to-place: a drop is a text edit ---------- */
let suppressClick = false;   // a completed drag must not open the card menu
const drag = {armed: null, active: false, ghost: null, srcEl: null};
const finePointer = () => matchMedia('(pointer: fine)').matches;   // coarse pointers reposition via the source @ x,y
function planeCoords(cx, cy){
  const plane = document.querySelector('#preview svg rect[data-plane]');
  if(!plane) return null;
  const r = plane.getBoundingClientRect();
  if(cx < r.left || cx > r.right || cy < r.top || cy > r.bottom) return null;
  return {
    x: Math.max(0, Math.min(100, Math.round((cx - r.left) / r.width * 100))),
    y: Math.max(0, Math.min(100, Math.round((1 - (cy - r.top) / r.height) * 100))),
  };
}
function endDrag(){
  if(drag.ghost) drag.ghost.remove();
  if(drag.srcEl) drag.srcEl.style.opacity = '';
  document.body.style.cursor = '';
  drag.armed = null; drag.active = false; drag.ghost = null; drag.srcEl = null;
}
$('preview').addEventListener('pointerdown', e => {
  if(!finePointer()) return;   // fine-only: on coarse, reposition by editing the source @ x,y (Move… cardmenu row is a follow-up)
  const g = e.target.closest && e.target.closest('#preview svg g[data-line]');
  if(!g || e.button !== 0) return;
  const item = model && model.items.find(i => i.srcLine === +g.dataset.line);
  if(!item) return;
  e.preventDefault();   // no text selection while dragging
  drag.armed = {line: +g.dataset.line, label: item.label, x: e.clientX, y: e.clientY};
  drag.srcEl = g;
});
window.addEventListener('pointermove', e => {
  if(!drag.armed) return;
  if(!drag.active){
    if(Math.hypot(e.clientX - drag.armed.x, e.clientY - drag.armed.y) < 4) return;
    drag.active = true;
    const ghost = document.createElement('div');
    ghost.className = 'dragghost';
    document.body.appendChild(ghost);
    drag.ghost = ghost;
    drag.srcEl.style.opacity = '0.3';
    document.body.style.cursor = 'grabbing';
  }
  const at = planeCoords(e.clientX, e.clientY);
  drag.ghost.textContent = drag.armed.label + (at ? '  @ ' + at.x + ',' + at.y : '');
  drag.ghost.style.left = (e.clientX + 12) + 'px';
  drag.ghost.style.top = (e.clientY + 14) + 'px';
});
window.addEventListener('pointerup', e => {
  if(!drag.armed) return;
  const wasActive = drag.active, src = drag.armed.line;
  endDrag();
  if(wasActive) suppressClick = true;
  if(!wasActive) return;
  const at = planeCoords(e.clientX, e.clientY);
  if(!at) return;
  const line = editor.getLine(src);
  const newLine = setPosition(line, at.x, at.y);
  if(newLine !== line) editor.replaceLine(src, newLine);   // one transaction → one undo step
});
window.addEventListener('keydown', e => {
  if(e.key === 'Escape' && drag.armed) endDrag();
});
/* the browser can claim the gesture mid-drag (scroll/gesture) → clean up the
   ghost instead of stranding it until the next pointerup */
window.addEventListener('pointercancel', () => { if(drag.armed) endDrag(); });
$('preview').addEventListener('click', e => {
  if(suppressClick){ e.stopPropagation(); suppressClick = false; }
}, true);

/* ---------- #93: flagged items → gauge session ---------- */
$('togauge').addEventListener('click', () => {
  if(!model || !ro) return;
  const doc = gaugeHandoff(model, ro);
  if(!doc) return;
  location.href = '/gauge/#' + btoa(unescape(encodeURIComponent(JSON.stringify({t: doc}))));
});

/* ---------- theme ---------- */
function rerender(){ lastSvg = ''; paint.reset(); refresh(); }
onThemeChange(rerender);

/* ---------- boot ---------- */
(function(){
  const hash = readHashState();
  let text = hash && typeof hash.t === 'string' ? hash.t : '';
  if(hash && hash.e === 0) ws.setCollapsed(true);
  if(!text){
    try{ text = localStorage.getItem('map-src') || ''; }catch(e){}
  }
  renderSaved();
  if(text) editor.setText(text);
  else if(!autoloadExample(() => editor.setText(EXAMPLES[0].src))) refresh();
})();
