/* State, refresh loop, snapshot slip-compare, edit-in-place, exports, boot. */
import {parse} from './parse.js';
import {render, toMarkdown, timelineReadout} from './render.js';
import {timelineDiff, timelineDiffView} from './diff.js';
import {createEditor, insertAndSelect} from './editor.js';
import {validators, editLabel, editDates, cycleStatus, addItemLine, removeItemLine} from './edit-targets.js';
import {readHashState, writeHashState} from '../assets/series.js';
import {measure, isDark, themeColors, onThemeChange, renderWarningList, slugify} from '../assets/app-common.js';
import {wireExports} from '../assets/exports.js';
import {debounced, rafBatched} from '../assets/schedule.js';
import {initWorkspace, setActionsEnabled} from '../assets/workspace.js';
import {attachEditInPlace} from '../assets/edit-in-place.js';
import {snapStore, wireSnapshots} from '../assets/snapshots.js';
import {autoloadExample, shouldPersist} from '../assets/mobile.js';

const $ = id => document.getElementById(id);
const todayDay = () => Math.floor(Date.now() / 86400000);
const todayISO = () => new Date().toISOString().slice(0, 10);

const EXAMPLES = [
  {name: 'App launch programme', src:
`title: Habitat 2.0 — launch programme
App: Feature freeze 2026-08-14 .. 2026-08-28
App: Beta cut 2026-09 .. 2026-10
App: Store review passed 2026-10 .. 2026-11 [risk] // review times vary wildly
Marketing: Landing page live 2026-08-21 [done]
Marketing: Campaign start 2026-10 .. 2026-11
Compliance: Privacy audit signed 2026-09 .. 2026-12 // external firm, long tail
Launch day 2026-11 .. 2027-01`},
  {name: 'Office move', src:
`title: Office move
Lease signed 2026-06-20 [done]
Fit-out: Design approved 2026-07 .. 2026-08
Fit-out: Construction done 2026-09 .. 2026-12 // contractor's range, not ours
IT: Network installed 2026-11 .. 2027-01
IT: Desks and AV 2026-12 .. 2027-01
Move-in day 2027-01 .. 2027-02`},
];

let model = null, lastSvg = '', hashTimer = null;
let snaps = null;

function currentDiff(){
  const cur = snaps && snaps.current();
  if(!cur || !model || !model.items.length) return null;
  return timelineDiffView(timelineDiff(cur.model, model), cur.label);
}
function ctx(slide){
  return {colors: themeColors(), measure, slide, dark: isDark(), today: todayDay()};
}
function activeRender(slide, edit = false){
  return render(model, ctx(slide), currentDiff(), {edit});
}
function renderWarnings(){
  renderWarningList($('warns'), model ? model.warnings : []);
}
function doRefresh(){
  const text = editor.getText();
  model = parse(text);
  const pv = $('preview');
  if(!model.items.length){
    lastSvg = '';
    pv.innerHTML = '<p class="placeholder">' + (text.trim()
      ? 'No milestones yet — write one like “Grid: Energisation 2027-02 .. 2027-06”.'
      : 'Start typing — or load an example.') + '</p>';
    $('verdict').textContent = '';
  } else {
    const svg = activeRender(false, true);
    if(svg !== lastSvg){ pv.innerHTML = svg; lastSvg = svg; }
    $('verdict').textContent = timelineReadout(model, model.today ?? todayDay());
  }
  renderWarnings();
  setActionsEnabled(!!lastSvg);
  if(shouldPersist()){ try{ localStorage.setItem('timeline-src', text); }catch(e){} }
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
  store: snapStore('timeline-snaps'),
  parse,
  getSrc: () => editor.getText(),
  makeLabel: () => todayISO() + (model && model.title ? ' — ' + model.title.slice(0, 30) : ''),
  els: {snap: $('snap'), sel: $('snapsel'), del: $('snapdel')},
  canSnap: () => model && model.items.length,
  onChange(){ lastSvg = ''; refresh(); },
});
const ws = initWorkspace({
  workspace: $('workspace'), tab: $('railtab'),
  preview: $('preview'), zoomHost: $('zoomctl'),
  onCollapseChange(){ clearTimeout(hashTimer); hashTimer = setTimeout(writeHash, 100); },
});

attachEditInPlace($('preview'), {
  kinds: {
    label: {validate: validators.label},
    dates: {validate: validators.dates},
    status: {cycle: ['cycle']},
    additem: {validate: validators.label},
    removeitem: {cycle: ['×']},
  },
  onCommit(kind, lineNo, oldRaw, newValue, el){
    if(kind === 'additem'){
      const r = addItemLine(editor.getText(), todayISO(), el.dataset.lane || undefined);
      const label = newValue.replace(/^✖/, '').trim();
      const line = r.newLine.replace('New milestone', label || 'New milestone');
      insertAndSelect(editor, r.afterLine, line, label || 'New milestone',
        {focus: matchMedia('(pointer: fine)').matches});
      return;
    }
    if(kind === 'removeitem'){
      if(removeItemLine(editor.getText(), lineNo)) editor.removeLine(lineNo);
      return;
    }
    const line = editor.getLine(lineNo);
    const newLine = kind === 'status' ? cycleStatus(line, oldRaw)
      : kind === 'dates' ? editDates(line, oldRaw, newValue)
      : editLabel(line, oldRaw, newValue);
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

/* ---------- exports ---------- */
function svgString(slide){
  return (model && model.items.length) ? activeRender(slide) : null;
}
function slug(){
  return slugify(model.title, 'timeline');
}
wireExports({
  buttons: {dlsvg: $('dlsvg'), dlpng: $('dlpng'), dlslide: $('dlslide'), copypng: $('copypng')},
  getSvg: () => svgString(false),
  getSvgSlide: () => svgString(true),
  slug,
});
/* copymd keeps its inline handler: on clipboard failure it falls back to a
   prompt() with the markdown so it's still copyable — wireExports has no
   equivalent fallback, so migrating would lose that behaviour. */
$('copymd').addEventListener('click', async () => {
  if(!model || !model.items.length) return;
  const md = toMarkdown(model, currentDiff(), location.href);
  try{ await navigator.clipboard.writeText(md); flash('copymd', 'Copied', 1500); }
  catch(e){ prompt('Copy this:', md); }
});
function flash(id, msg, ms){
  const b = $(id), was = b.textContent;
  b.textContent = msg;
  setTimeout(() => { b.textContent = was; }, ms);
}

/* fingers open at 100% zoom — pan so the today line starts in view */
let panned = false;
function panToToday(){
  if(panned || !matchMedia('(pointer: coarse)').matches) return;
  const line = $('preview').querySelector('[data-today]');
  if(!line) return;
  const x = parseFloat(line.getAttribute('x1'));
  if(isFinite(x)){
    $('preview').scrollLeft = Math.max(0, x - $('preview').clientWidth * 0.25);
    panned = true;
  }
}
new MutationObserver(panToToday).observe($('preview'), {childList: true});

/* ---------- theme ---------- */
onThemeChange(() => { lastSvg = ''; refresh(); });

/* ---------- boot ---------- */
(function(){
  const hash = readHashState();
  let text = hash && typeof hash.t === 'string' ? hash.t : '';
  if(hash && hash.e === 0) ws.setCollapsed(true);
  if(!text){
    try{ text = localStorage.getItem('timeline-src') || ''; }catch(e){}
  }
  if(text) editor.setText(text);
  else if(!autoloadExample(() => editor.setText(EXAMPLES[0].src))) refresh();
})();
