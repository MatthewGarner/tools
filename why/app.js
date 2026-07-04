/* State, view toggle, refresh loop, saved trees, exports, boot. */
import {parse} from './parse.js';
import {project} from './project.js';
import {renderOst} from './render-ost.js';
import {renderMap} from './render-map.js';
import {createEditor} from './editor.js';
import {readHashState, writeHashState} from '../assets/series.js';

const $ = id => document.getElementById(id);

const measCtx = document.createElement('canvas').getContext('2d');
const measure = (text, font) => { measCtx.font = font; return measCtx.measureText(text).width; };
function isDark(){
  const t = document.documentElement.dataset.theme;
  if(t === 'dark') return true;
  if(t === 'light') return false;
  return matchMedia('(prefers-color-scheme: dark)').matches;
}
function themeColors(){
  const cs = getComputedStyle(document.documentElement);
  const g = n => cs.getPropertyValue(n).trim();
  return {card: g('--card'), border: g('--border'), ink: g('--ink'), muted: g('--muted'),
    accent: g('--accent'), bg: g('--bg'), err: g('--err'),
    status: {done: g('--st-done'), doing: g('--st-doing'), risk: g('--st-risk'), blocked: g('--st-blocked')}};
}

const EXAMPLES = [
  {name: 'Habitat retention', src:
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
let lastSvg = '', rafId = 0, hashTimer = null, debTimer = null;
function renderWarnings(){
  const warns = $('warns');
  warns.textContent = '';
  for(const w of (model ? model.warnings : [])){
    const li = document.createElement('li');
    li.textContent = w;
    warns.appendChild(li);
  }
}
function activeRender(slide){
  const ctx = {colors: themeColors(), measure, slide, dark: isDark()};
  return view === 'ost' ? renderOst(model, projection, ctx) : renderMap(model, projection, ctx);
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
    const svg = activeRender(false);
    if(svg !== lastSvg){ pv.innerHTML = svg; lastSvg = svg; }
  }
  renderWarnings();
  try{ localStorage.setItem('why-src', text); }catch(e){}
  clearTimeout(hashTimer);
  hashTimer = setTimeout(() => writeHashState({t: text, v: view}), 400);
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

/* ---------- view toggle ---------- */
function setView(v){
  view = v;
  $('viewost').classList.toggle('on', v === 'ost');
  $('viewmap').classList.toggle('on', v === 'map');
  lastSvg = '';
  refresh();
}
$('viewost').addEventListener('click', () => setView('ost'));
$('viewmap').addEventListener('click', () => setView('map'));

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
  try{ return JSON.parse(localStorage.getItem('why-saved') || '[]'); }catch(e){ return []; }
}
function storeSaved(list){
  try{ localStorage.setItem('why-saved', JSON.stringify(list)); }catch(e){}
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
    if(!model || !model.outcomes.length) return;
    const list = loadSaved();
    list.push({name: model.title ? model.title.slice(0, 28) : 'Tree ' + (list.length + 1), src: editor.getText()});
    storeSaved(list);
    renderSaved();
  });
  row.appendChild(save);
}

/* ---------- exports (active view) ---------- */
function svgString(slide){
  if(!model || !model.outcomes.length || !projection) return null;
  return activeRender(slide);
}
function download(name, blob){
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}
function slug(){
  return ((model.title || 'why') + '-' + view).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}
function svgToCanvas(svg, cb){
  const img = new Image();
  const dims = svg.match(/width="(\d+)" height="(\d+)"/);
  const w = +dims[1], h = +dims[2], scale = 2;
  img.onload = () => {
    const c = document.createElement('canvas');
    c.width = w * scale; c.height = h * scale;
    const cctx = c.getContext('2d');
    cctx.scale(scale, scale);
    cctx.drawImage(img, 0, 0);
    cb(c);
  };
  img.src = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(svg)));
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

/* ---------- theme ---------- */
function rerender(){ lastSvg = ''; refresh(); }
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', rerender);
new MutationObserver(rerender).observe(document.documentElement, {attributes: true, attributeFilter: ['data-theme']});

/* ---------- boot ---------- */
(function(){
  const hash = readHashState();
  let text = hash && typeof hash.t === 'string' ? hash.t : '';
  if(hash && (hash.v === 'map' || hash.v === 'ost')) view = hash.v;
  if(!text){
    try{ text = localStorage.getItem('why-src') || ''; }catch(e){}
  }
  renderSaved();
  $('viewost').classList.toggle('on', view === 'ost');
  $('viewmap').classList.toggle('on', view === 'map');
  if(text) editor.setText(text);
  else refresh();
})();
