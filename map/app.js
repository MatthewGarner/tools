/* State, refresh loop, saved maps, exports, edit-in-place, drag, boot. */
import {parse} from './parse.js';
import {resolve} from './zones.js';
import {readout, toMarkdown} from './readout.js';
import {render} from './render.js';
import {createEditor} from './editor.js';
import {readHashState, writeHashState} from '../assets/series.js';
import {measure, isDark, themeColors, download, svgToCanvas} from '../assets/app-common.js';
import {initWorkspace} from '../assets/workspace.js';
import {attachEditInPlace} from '../assets/edit-in-place.js';
import {validators, setPosition, editLabel, editField, renameZone, setAxisLabel} from './edit-targets.js';

const $ = id => document.getElementById(id);

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
let lastSvg = '', rafId = 0, hashTimer = null, debTimer = null;

function renderWarnings(){
  const warns = $('warns');
  warns.textContent = '';
  const all = [...(model ? model.warnings : []), ...(resolved ? resolved.warnings : [])];
  for(const w of all){
    const li = document.createElement('li');
    li.textContent = w;
    warns.appendChild(li);
  }
}
function hasContent(){
  return model && (model.items.length || model.preset || model.grid || model.ruleZones.length);
}
function activeRender(slide){
  return render(model, resolved, ro, {colors: themeColors(), measure, slide, dark: isDark()});
}
function doRefresh(){
  const text = editor.getText();
  model = parse(text);
  resolved = resolve(model);
  const pv = $('preview');
  if(!hasContent()){
    ro = null;
    lastSvg = '';
    pv.innerHTML = '<p class="placeholder">' + (text.trim()
      ? 'No map yet — add an item, or a preset: line.'
      : 'Start typing — or load an example.') + '</p>';
  } else {
    ro = readout(model, resolved);
    const svg = activeRender(false);
    if(svg !== lastSvg){ pv.innerHTML = svg; lastSvg = svg; }
  }
  renderWarnings();
  try{ localStorage.setItem('map-src', text); }catch(e){}
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
  },
  onCommit(kind, lineNo, oldRaw, newValue, el){
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
    }
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
function loadSaved(){
  try{ return JSON.parse(localStorage.getItem('map-saved') || '[]'); }catch(e){ return []; }
}
function storeSaved(list){
  try{ localStorage.setItem('map-saved', JSON.stringify(list)); }catch(e){}
}
function renderSaved(){
  const row = $('savedrow');
  row.textContent = '';
  const list = loadSaved();
  if(list.length){
    const lead = document.createElement('span');
    lead.className = 'lead'; lead.textContent = 'Saved:';
    row.appendChild(lead);
  }
  list.forEach((m, i) => {
    const chip = document.createElement('span');
    chip.className = 'savedchip';
    const load = document.createElement('button');
    load.textContent = m.name;
    load.addEventListener('click', () => editor.setText(m.src));
    const del = document.createElement('button');
    del.className = 'chipdel'; del.textContent = '×';
    del.setAttribute('aria-label', 'Delete saved map ' + m.name);
    del.addEventListener('click', () => {
      const l = loadSaved(); l.splice(i, 1); storeSaved(l); renderSaved();
    });
    chip.append(load, del);
    row.appendChild(chip);
  });
  const save = document.createElement('button');
  save.className = 'chip';
  save.textContent = '＋ Save current';
  save.addEventListener('click', () => {
    if(!hasContent()) return;
    const list = loadSaved();
    list.push({name: model.title ? model.title.slice(0, 28) : 'Map ' + (list.length + 1), src: editor.getText()});
    storeSaved(list);
    renderSaved();
  });
  row.appendChild(save);
}

/* ---------- exports ---------- */
function svgString(slide){
  if(!hasContent() || !ro) return null;
  return activeRender(slide);
}
function slug(){
  return ((model.title || model.preset || 'map')).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
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
function flash(btn, msg, base){
  btn.textContent = msg;
  setTimeout(() => { btn.textContent = base; }, 2000);
}
$('copypng').addEventListener('click', () => {
  const svg = svgString(false);
  if(!svg) return;
  if(!navigator.clipboard || !window.ClipboardItem)
    return flash($('copypng'), 'Clipboard unavailable — use Download', 'Copy PNG');
  const blobPromise = new Promise((resolve, reject) =>
    svgToCanvas(svg, c => c.toBlob(b => b ? resolve(b) : reject(new Error('toBlob')), 'image/png')));
  navigator.clipboard.write([new ClipboardItem({'image/png': blobPromise})])
    .then(() => flash($('copypng'), 'Copied — paste into your deck', 'Copy PNG'))
    .catch(() => flash($('copypng'), 'Copy blocked — use Download', 'Copy PNG'));
});
$('copymd').addEventListener('click', () => {
  if(!ro) return;
  navigator.clipboard.writeText(toMarkdown(ro, model))
    .then(() => flash($('copymd'), 'Copied — paste into your doc', 'Copy for doc'))
    .catch(() => flash($('copymd'), 'Copy blocked', 'Copy for doc'));
});

/* ---------- theme ---------- */
function rerender(){ lastSvg = ''; refresh(); }
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', rerender);
new MutationObserver(rerender).observe(document.documentElement, {attributes: true, attributeFilter: ['data-theme']});

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
  else refresh();
})();
