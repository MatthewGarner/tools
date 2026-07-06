/* State, refresh loop, snapshot slip-compare, edit-in-place, exports, boot. */
import {parse} from './parse.js';
import {render, toMarkdown} from './render.js';
import {timelineDiff, timelineDiffView} from './diff.js';
import {createEditor, insertAndSelect} from './editor.js';
import {validators, editLabel, editDates, cycleStatus, addItemLine, removeItemLine} from './edit-targets.js';
import {readHashState, writeHashState} from '../assets/series.js';
import {measure, isDark, themeColors, download, svgToCanvas, onThemeChange} from '../assets/app-common.js';
import {initWorkspace, setActionsEnabled} from '../assets/workspace.js';
import {attachEditInPlace} from '../assets/edit-in-place.js';
import {snapStore, wireSnapshots} from '../assets/snapshots.js';

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

let model = null, lastSvg = '', rafId = 0, hashTimer = null, debTimer = null;
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
  if(!model.items.length){
    lastSvg = '';
    pv.innerHTML = '<p class="placeholder">' + (text.trim()
      ? 'No milestones yet — write one like “Grid: Energisation 2027-02 .. 2027-06”.'
      : 'Start typing — or load an example.') + '</p>';
  } else {
    const svg = activeRender(false, true);
    if(svg !== lastSvg){ pv.innerHTML = svg; lastSvg = svg; }
  }
  renderWarnings();
  setActionsEnabled(!!lastSvg);
  try{ localStorage.setItem('timeline-src', text); }catch(e){}
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
  onCommit(kind, lineNo, oldRaw, newValue){
    if(kind === 'additem'){
      const r = addItemLine(editor.getText(), todayISO());
      const label = newValue.replace(/^✖/, '').trim();
      const line = r.newLine.replace('New milestone', label || 'New milestone');
      insertAndSelect(editor, r.afterLine, line, label || 'New milestone');
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
  return ((model.title || 'timeline')).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
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
  else refresh();
})();
