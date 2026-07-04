/* State, refresh loop, saved trees, exports, boot. */
import {parse} from './parse.js';
import {evaluate} from './engine.js';
import {render} from './render.js';
import {createEditor} from './editor.js';
import {readHashState, writeHashState} from '../assets/series.js';
import {measure, isDark, themeColors, download, svgToCanvas} from '../assets/app-common.js';
import {initWorkspace} from '../assets/workspace.js';
import {attachEditInPlace} from '../assets/edit-in-place.js';
import {validators, applies} from './edit-targets.js';

const $ = id => document.getElementById(id);


const EXAMPLES = [
  {name: 'Bid or no bid', src:
`title: Bid for the Acme contract
currency: £

Bid decision
  Submit bid: -150k
    Outcome
      Win (p=0.3-0.45): 2M to 5M
      Lose (p=rest): 0
  No bid: 0`},
  {name: 'Build vs buy', src:
`title: Build vs buy the reporting module
currency: £

Approach
  Build in-house: -400k to -700k
    Delivery
      On time (p=0.5-0.7): 1.5M to 2.5M
      Late, still ships (p=rest): 800k to 1.2M
  Buy vendor product: -250k
    Fit
      Good fit (p=0.6-0.8): 1M to 1.6M
      Poor fit, heavy rework (p=rest): 200k to 600k
  Do nothing: 0`},
];

/* ---------- refresh loop ---------- */
let model = null, results = null, lastSvg = '', rafId = 0, hashTimer = null, debTimer = null;
function renderWarnings(){
  const warns = $('warns');
  warns.textContent = '';
  const all = [...(model ? model.warnings : []), ...(results ? results.warnings : [])];
  for(const w of all){
    const li = document.createElement('li');
    li.textContent = w;
    warns.appendChild(li);
  }
}
function doRefresh(){
  const text = editor.getText();
  model = parse(text);
  const pv = $('preview');
  if(!model.root){
    results = null;
    lastSvg = '';
    pv.innerHTML = '<p class="placeholder">' + (text.trim()
      ? 'No tree yet — add an indented option or two.'
      : 'Start typing — or load an example.') + '</p>';
  } else {
    results = evaluate(model);
    const svg = render(model, results, {colors: themeColors(), measure, dark: isDark()});
    if(svg !== lastSvg){ pv.innerHTML = svg; lastSvg = svg; }
  }
  renderWarnings();
  try{ localStorage.setItem('tree-src', text); }catch(e){}
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

attachEditInPlace($('preview'), {
  kinds: {
    prob: {validate: validators.prob},
    value: {validate: validators.value},
    label: {validate: validators.label},
  },
  onCommit(kind, lineNo, oldRaw, newValue){
    const line = editor.getLine(lineNo);
    const newLine = applies[kind](line, oldRaw, newValue);
    if(newLine !== line) editor.replaceLine(lineNo, newLine);
  },
});

/* ---------- chips ---------- */
for(const ex of EXAMPLES){
  const b = document.createElement('button');
  b.className = 'chip';
  b.textContent = ex.name;
  b.addEventListener('click', () => editor.setText(ex.src));
  $('chips').appendChild(b);
}

/* ---------- saved trees ---------- */
function loadSaved(){
  try{ return JSON.parse(localStorage.getItem('tree-saved') || '[]'); }catch(e){ return []; }
}
function storeSaved(list){
  try{ localStorage.setItem('tree-saved', JSON.stringify(list)); }catch(e){}
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
    del.setAttribute('aria-label', 'Delete saved tree ' + m.name);
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
    if(!model || !model.root) return;
    const list = loadSaved();
    list.push({name: model.title ? model.title.slice(0, 28) : 'Tree ' + (list.length + 1), src: editor.getText()});
    storeSaved(list);
    renderSaved();
  });
  row.appendChild(save);
}

/* ---------- exports ---------- */
function svgString(slide){
  if(!model || !model.root || !results) return null;
  return render(model, results, {colors: themeColors(), measure, slide, dark: isDark()});
}
function slug(){
  return (model.title || 'decision-tree').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'decision-tree';
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
  const svg = svgString(true);
  if(svg) svgToCanvas(svg, c => c.toBlob(b => download(slug() + '-slide.png', b), 'image/png'));
});
$('copypng').addEventListener('click', () => {
  const svg = svgString();
  if(!svg) return;
  if(!navigator.clipboard || !window.ClipboardItem){
    $('copypng').textContent = 'Clipboard unavailable — use Download';
    setTimeout(() => { $('copypng').textContent = 'Copy PNG'; }, 2200);
    return;
  }
  const blobPromise = new Promise((resolve, reject) =>
    svgToCanvas(svg, c => c.toBlob(b => b ? resolve(b) : reject(new Error('toBlob')), 'image/png')));
  navigator.clipboard.write([new ClipboardItem({'image/png': blobPromise})]).then(() => {
    $('copypng').textContent = 'Copied — paste into your deck';
    setTimeout(() => { $('copypng').textContent = 'Copy PNG'; }, 1800);
  }).catch(() => {
    $('copypng').textContent = 'Copy blocked — use Download';
    setTimeout(() => { $('copypng').textContent = 'Copy PNG'; }, 2200);
  });
});

/* ---------- theme change ---------- */
function rerender(){ lastSvg = ''; refresh(); }
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', rerender);
new MutationObserver(rerender).observe(document.documentElement, {attributes: true, attributeFilter: ['data-theme']});

/* ---------- boot ---------- */
(function(){
  const hash = readHashState();
  let text = hash && typeof hash.t === 'string' ? hash.t : '';
  if(hash && hash.e === 0) ws.setCollapsed(true);
  if(!text){
    try{ text = localStorage.getItem('tree-src') || ''; }catch(e){}
  }
  renderSaved();
  if(text) editor.setText(text);
  else refresh();
})();
