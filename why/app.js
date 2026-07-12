/* State, view toggle, refresh loop, saved trees, exports, boot. */
import {parse} from './parse.js';
import {project} from './project.js';
import {renderOst} from './render-ost.js';
import {snapStore, wireSnapshots} from '../assets/snapshots.js';
import {whyDiff, whyDiffView} from './diff.js';
import {renderMap} from './render-map.js';
import {createEditor} from './editor.js';
import {insertAndSelect} from '../assets/editor-common.js';
import {readHashState, writeHashState} from '../assets/series.js';
import {autoloadExample, shouldPersist} from '../assets/mobile.js';
import {narrowWidth, watchNarrowBucket} from '../assets/narrow-width.js';
import {measure, isDark, themeColors, onThemeChange, renderWarningList, slugify} from '../assets/app-common.js';
import {wireExports} from '../assets/exports.js';
import {loadSaved, storeSaved, renderSavedChips} from '../assets/saved-items.js';
import {debounced, rafBatched} from '../assets/schedule.js';
import {initWorkspace, setActionsEnabled} from '../assets/workspace.js';
import {attachEditInPlace, cardMenu} from '../assets/edit-in-place.js';
import {validators as eipValidators, applies as eipApplies, SOLUTION_STATUSES, ASSUMPTION_CYCLE, subtreeRange, childLineFor} from './edit-targets.js';
import {solutionMenu} from './app-menu.js';

const $ = id => document.getElementById(id);


const EXAMPLES = [
  {name: 'Habit retention', src:
`title: Q3 — 90-day retention
outcome: Improve 90-day retention

  Users forget mid-afternoon habits
    Users don't open the app at work
      Smart reminders [testing]
        ? users want to be interrupted at work [testing]
        ? habit time is detectable [holds]
    Streak freeze [delivering]
      ? streak anxiety drives churn [holds]

  Habits feel like chores
    Habit templates library [shipped]
    Accountability circles [candidate]
      ? users will invite friends

  Progress feels invisible
`},
  {name: 'Two outcomes', src:
`title: H2 product bets
outcome: Improve 90-day retention
  Users forget mid-afternoon habits
    Smart reminders [testing]
      ? users want interruptions
outcome: Grow referral revenue
  Sharing feels braggy
    Private progress cards [delivering]
      ? cards get shared [testing]
  No reason to invite others
`},
];

/* ---------- refresh loop ---------- */
let model = null, projection = null, view = 'ost';
let lastSvg = '', hashTimer = null;
const previewEl = $('preview');
function renderWidth(){ return narrowWidth(previewEl); }
function renderWarnings(){
  renderWarningList($('warns'), model ? model.warnings : []);
}
let snaps = null;   // wired below, after the editor exists
function currentDiff(){
  const cur = snaps && snaps.current();
  if(!cur || !model || !model.outcomes.length) return null;
  return whyDiffView(whyDiff(cur.model, model), cur.label);
}
/* width rides the shared ctx into BOTH views: renderOst reads ctx.width
   directly, and renderMap forwards {...ctx} untouched into roadmap's
   renderer (render-map.js), so the map view inherits roadmap's narrow
   relayout for free. Exports never pass edit:true, so they never carry a
   width — the wide artefact stays pinned regardless of the on-screen bucket. */
function activeRender(slide, edit){
  const ctx = {colors: themeColors(), measure, slide, dark: isDark(), edit, width: edit ? renderWidth() : undefined};
  return view === 'ost' ? renderOst(model, projection, ctx, currentDiff()) : renderMap(model, projection, ctx);
}
function doRefresh(){
  const text = editor.getText();
  model = parse(text);
  const pv = $('preview');
  if(!model.outcomes.length){
    projection = null;
    lastSvg = '';
    pv.innerHTML = '<p class="placeholder">' + (text.trim()
      ? 'No tree yet — start with an outcome: line.'
      : 'Start typing — or load an example.') + '</p>';
  } else {
    projection = project(model);
    const svg = activeRender(false, true);
    if(svg !== lastSvg){ pv.innerHTML = svg; lastSvg = svg; }
  }
  renderWarnings();
  setActionsEnabled(!!lastSvg);
  try{ if(shouldPersist()) localStorage.setItem('why-src', text); }catch(e){}
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
  const state = {t: editor.getText(), v: view};
  if(ws.collapsed()) state.e = 0;
  if(shouldPersist()) writeHashState(state);
}
snaps = wireSnapshots({
  store: snapStore('why-snaps'),
  parse,
  getSrc: () => editor.getText(),
  makeLabel: () => new Date().toISOString().slice(0, 10) +
    (model && model.title ? ' — ' + model.title.slice(0, 30) : ''),
  els: {snap: $('snap'), sel: $('snapsel'), del: $('snapdel')},
  canSnap: () => model && model.outcomes.length,
  onChange(){ lastSvg = ''; refresh(); },
});
const ws = initWorkspace({
  workspace: $('workspace'), tab: $('railtab'),
  preview: $('preview'), zoomHost: $('zoomctl'),
  onCollapseChange(){ clearTimeout(hashTimer); hashTimer = setTimeout(writeHash, 100); },
});

/* ---------- view toggle ---------- */
function setView(v){
  view = v;
  $('viewost').classList.toggle('on', v === 'ost');
  $('viewmap').classList.toggle('on', v === 'map');
  $('viewost').setAttribute('aria-selected', String(v === 'ost'));
  $('viewmap').setAttribute('aria-selected', String(v === 'map'));
  lastSvg = '';
  refresh();
}
$('viewost').addEventListener('click', () => setView('ost'));
$('viewmap').addEventListener('click', () => setView('map'));

attachEditInPlace($('preview'), {
  kinds: {
    status: {options: SOLUTION_STATUSES},
    astatus: {cycle: ASSUMPTION_CYCLE},
    label: {validate: eipValidators.label},
    title: {validate: eipValidators.label},   // map-view card titles are labels
    /* card menu supersedes the old card-<kind> action popover (single Add +
       Remove) with Rename/Status/Add/Remove; opens:'status' is dead for
       outcome/opportunity cards (only solutions carry a status pill) — same
       accepted no-op as roadmap's note-less "Edit note…" row */
    'cardmenu-outcome': cardMenu({field: {label: 'Status…', opens: 'status'}, add: 'opportunity'}),
    'cardmenu-opportunity': cardMenu({field: {label: 'Status…', opens: 'status'}, add: 'solution'}),
    /* dynamic: base Rename/Status/＋ Add rows plus one submenu row per
       assumption (status picker + danger remove), resolved fresh from the
       current model each time the menu opens — app-menu.js's solutionMenu. */
    'cardmenu-solution': {menu: (el) => solutionMenu(model, +el.dataset.line)},
    /* map-view cards are roadmap-rendered (render-map.js → roadmap/render.js),
       so they carry a bare data-edit="cardmenu" with no per-kind suffix — the
       roadmap renderer doesn't know outcome/opportunity/solution. opens:'title'
       (not 'label') because that's the data-edit kind roadmap's renderer emits
       for the title text. No Status/Add rows: map items carry no status pill
       and adding a child node from a projected roadmap position is out of
       scope here. */
    cardmenu: {menu: [
      {label: 'Rename…', opens: 'title'},
      {label: 'Remove branch', action: true, danger: true},
    ]},
    removeassump: {cycle: ['×']},
  },
  onCommit(kind, lineNo, oldRaw, newValue){
    if(kind.startsWith('cardmenu')){
      if(newValue.startsWith('✖＋ Add')){
        const r = childLineFor(editor.getText(), lineNo);
        if(!r) return;
        insertAndSelect(editor, r.afterLine, r.newLine, r.select);
      } else if(newValue === '✖Remove branch'){
        const rr = subtreeRange(editor.getText(), lineNo);
        if(rr) editor.removeLines(rr.from, rr.to);
      }
      return;
    }
    if(kind === 'removeassump'){
      if(!editor.getLine(lineNo).trim().startsWith('?')) return;
      const rr = subtreeRange(editor.getText(), lineNo);
      if(rr) editor.removeLines(rr.from, rr.to);
      return;
    }
    const apply = kind === 'status' || kind === 'astatus' ? eipApplies.status : eipApplies.label;
    const line = editor.getLine(lineNo);
    const newLine = apply(line, oldRaw, newValue);
    if(newLine !== line) editor.replaceLine(lineNo, newLine);
  },
});

/* ---------- example chips ---------- */
for(const ex of EXAMPLES){
  const b = document.createElement('button');
  b.className = 'chip';
  b.textContent = ex.name;
  b.addEventListener('click', () => editor.setText(ex.src));
  $('chips').appendChild(b);
}

/* ---------- saved ---------- */
const SAVED_KEY = 'why-saved';
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
    if(!model || !model.outcomes.length) return;
    const list = loadSaved(SAVED_KEY);
    list.push({name: model.title ? model.title.slice(0, 28) : 'Tree ' + (list.length + 1), src: editor.getText()});
    storeSaved(SAVED_KEY, list);
    renderSaved();
  });
  row.appendChild(save);
}

/* ---------- exports (active view) ---------- */
function svgString(slide){
  if(!model || !model.outcomes.length || !projection) return null;
  return activeRender(slide);
}
function slug(){
  return slugify((model.title || 'why') + '-' + view);
}
wireExports({
  buttons: {dlsvg: $('dlsvg'), dlpng: $('dlpng'), dlslide: $('dlslide'), copypng: $('copypng')},
  getSvg: () => svgString(false),
  getSvgSlide: () => svgString(true),
  slug,
});

/* ---------- theme ---------- */
function rerender(){ lastSvg = ''; refresh(); }
onThemeChange(rerender);

/* ---------- narrow-bucket resize: re-render only when the bucket flips ---------- */
watchNarrowBucket(previewEl, rerender);

/* ---------- boot ---------- */
(function(){
  const hash = readHashState();
  let text = hash && typeof hash.t === 'string' ? hash.t : '';
  if(hash && (hash.v === 'map' || hash.v === 'ost')) view = hash.v;
  if(hash && hash.e === 0) ws.setCollapsed(true);
  if(!text){
    try{ text = localStorage.getItem('why-src') || ''; }catch(e){}
  }
  renderSaved();
  $('viewost').classList.toggle('on', view === 'ost');
  $('viewmap').classList.toggle('on', view === 'map');
  if(text) editor.setText(text);
  else if(!autoloadExample(() => editor.setText(EXAMPLES[0].src))) refresh();
})();
