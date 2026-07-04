/* State, refresh loop, snapshots, saved roadmaps, import, exports, boot. */
import {parse, STATUS_LABEL} from './parse.js';
import {render} from './render.js';
import {createEditor} from './editor.js';

const $ = id => document.getElementById(id);

/* ---------- DOM-side render context ---------- */
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
  return {card:g('--card'), border:g('--border'), ink:g('--ink'), muted:g('--muted'),
    accent:g('--accent'), bg:g('--bg'), err:g('--err'),
    status:{done:g('--st-done'), doing:g('--st-doing'), risk:g('--st-risk'), blocked:g('--st-blocked')}};
}

/* ---------- examples ---------- */
const EXAMPLES = [
  {name:'Habit app roadmap', src:
`title: Habitat — Product Roadmap
horizons: Now, Next, Later

NOW
Core: Streak freeze [doing] -- the top-requested fix for streak anxiety
Core: Habit templates library [doing]
Growth: Referral flow [risk] -- waiting on app-store review
Platform: Sync engine rewrite -- conflicts are the #1 support driver

NEXT
Core: Smart reminders -- learn each habit's natural time of day
Growth: Home-screen widget gallery
Platform: Full offline mode

LATER
Core: Accountability circles -- small groups, shared streaks
Growth: Coach marketplace
Platform: Wearables integration`},
  {name:'Quarterly view', src:
`title: Platform Delivery Plan
horizons: quarterly from Q3 2026 x4
wip: off

Q3 2026
Infra: Sync engine rewrite [doing]
App: Habit templates library [done]

Q4 2026
Infra: Full offline mode
App: Smart reminders

Q1 2027
App: Accountability circles
Infra: Wearables integration

Q2 2027
App: Coach marketplace`},
  {name:'Simple (no lanes)', src:
`title: Team roadmap

NOW
Onboarding revamp [doing]
Billing self-serve [risk] -- waiting on finance sign-off

NEXT
Enterprise SSO
Analytics dashboard

LATER
Mobile app parity
API rate-limit tiers`},
];

/* ---------- snapshots + memoised diff ---------- */
function loadSnaps(){
  try{ return JSON.parse(localStorage.getItem('roadmap-snaps') || '[]'); }catch(e){ return []; }
}
function storeSnaps(list){
  try{ localStorage.setItem('roadmap-snaps', JSON.stringify(list.slice(-20))); }catch(e){}
}
function renderSnapSel(){
  const sel = $('snapsel');
  const cur = sel.value;
  sel.textContent = '';
  const none = document.createElement('option');
  none.value = ''; none.textContent = 'Compare with…';
  sel.appendChild(none);
  loadSnaps().forEach((sn, i) => {
    const o = document.createElement('option');
    o.value = String(i);
    o.textContent = sn.label;
    sel.appendChild(o);
  });
  sel.value = [...sel.options].some(o => o.value === cur) ? cur : '';
  $('snapdel').style.display = sel.value ? '' : 'none';
}
const normTitle = s => s.toLowerCase().replace(/\s+/g, ' ').trim();
const snapModelCache = new Map();   // "idx|src-length|label" -> parsed model
function snapModel(idx){
  const sn = loadSnaps()[+idx];
  if(!sn) return null;
  const key = idx + '|' + sn.src.length + '|' + sn.label;
  if(!snapModelCache.has(key)) snapModelCache.set(key, parse(sn.src));
  return snapModelCache.get(key);
}
function makeDiff(model){
  const idx = $('snapsel').value;
  if(idx === '') return null;
  const sn = loadSnaps()[+idx];
  const old = snapModel(idx);
  if(!old) return null;
  const oldMap = new Map();
  for(const it of old.items) oldMap.set(normTitle(it.title), old.horizons[it.h] || '?');
  const curSet = new Set(model.items.map(it => normTitle(it.title)));
  const dropped = old.items.filter(it => !curSet.has(normTitle(it.title))).map(it => it.title);
  let any = false;
  const badge = it => {
    const key = normTitle(it.title);
    if(!oldMap.has(key)){ any = true; return {kind:'new', label:'New'}; }
    const oldH = oldMap.get(key);
    const curH = model.horizons[it.h];
    if(oldH.toLowerCase() !== String(curH).toLowerCase()){
      any = true;
      return {kind:'moved', label:'was ' + oldH};
    }
    return null;
  };
  for(const it of model.items) badge(it);   // prime `any` for the legend
  return {badge, dropped, since: sn.label, get any(){ return any || dropped.length > 0; }};
}

/* ---------- refresh loop ---------- */
let model = null, lastSvg = '', rafId = 0, hashTimer = null, debTimer = null;
function renderWarnings(m){
  const warns = $('warns');
  warns.textContent = '';
  const firstColCount = m.items.filter(i => i.h === 0).length;
  if(m.wip > 0 && firstColCount > m.wip){
    m.warnings.push(m.horizons[0] + ' has ' + firstColCount +
      ' items — that’s a list, not a strategy. (Raise or silence with wip: N / wip: off.)');
  }
  for(const w of m.warnings){
    const li = document.createElement('li');
    li.textContent = w;
    warns.appendChild(li);
  }
}
function writeHash(){
  const text = editor.getText();
  const enc = btoa(unescape(encodeURIComponent(text)));
  history.replaceState(null, '', enc.length < 6000 ? '#' + enc : location.pathname);
}
function doRefresh(){
  const text = editor.getText();
  model = parse(text);
  editor.setHorizons(model.horizons);
  renderWarnings(model);
  const pv = $('preview');
  if(!model.items.length){
    lastSvg = '';
    pv.innerHTML = '<p class="placeholder">' + (text.trim()
      ? 'No items yet — add lines under a NOW / NEXT / LATER header.'
      : 'Start typing — or load an example.') + '</p>';
  } else {
    const svg = render(model, {colors: themeColors(), measure, diff: makeDiff(model), dark: isDark()});
    if(svg !== lastSvg){ pv.innerHTML = svg; lastSvg = svg; }
  }
  try{ localStorage.setItem('roadmap-src', text); }catch(e){}
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

/* ---------- example + import chips ---------- */
for(const ex of EXAMPLES){
  const b = document.createElement('button');
  b.className = 'chip';
  b.textContent = ex.name;
  b.addEventListener('click', () => editor.setText(ex.src));
  $('chips').appendChild(b);
}
{
  const b = document.createElement('button');
  b.className = 'chip';
  b.textContent = 'Import markdown';
  b.addEventListener('click', () => {
    $('importbox').classList.toggle('open');
    if($('importbox').classList.contains('open')) $('importarea').focus();
  });
  $('chips').appendChild(b);
}

/* ---------- exports ---------- */
function svgString(slide){
  if(!model || !model.items.length) return null;
  return render(model, {colors: themeColors(), measure, diff: makeDiff(model), slide, dark: isDark()});
}
function download(name, blob){
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}
function slug(){
  return (model.title || 'roadmap').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'roadmap';
}
function pngFrom(svg, name){
  const img = new Image();
  const dims = svg.match(/width="(\d+)" height="(\d+)"/);
  const w = +dims[1], h = +dims[2], scale = 2;
  img.onload = () => {
    const c = document.createElement('canvas');
    c.width = w * scale; c.height = h * scale;
    const cctx = c.getContext('2d');
    cctx.scale(scale, scale);
    cctx.drawImage(img, 0, 0);
    c.toBlob(b => download(name, b), 'image/png');
  };
  img.src = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(svg)));
}
$('dlsvg').addEventListener('click', () => {
  const svg = svgString();
  if(svg) download(slug() + '.svg', new Blob([svg], {type:'image/svg+xml'}));
});
$('dlpng').addEventListener('click', () => {
  const svg = svgString();
  if(svg) pngFrom(svg, slug() + '.png');
});
$('dlslide').addEventListener('click', () => {
  const svg = svgString(true);
  if(svg) pngFrom(svg, slug() + '-slide.png');
});
$('copypng').addEventListener('click', () => {
  const svg = svgString();
  if(!svg) return;
  if(!navigator.clipboard || !window.ClipboardItem){
    $('copypng').textContent = 'Clipboard unavailable — use Download';
    setTimeout(() => { $('copypng').textContent = 'Copy PNG'; }, 2200);
    return;
  }
  const blobPromise = new Promise((resolve, reject) => {
    const img = new Image();
    const dims = svg.match(/width="(\d+)" height="(\d+)"/);
    const w = +dims[1], h = +dims[2], scale = 2;
    img.onload = () => {
      const c = document.createElement('canvas');
      c.width = w * scale; c.height = h * scale;
      const cctx = c.getContext('2d');
      cctx.scale(scale, scale);
      cctx.drawImage(img, 0, 0);
      c.toBlob(b => b ? resolve(b) : reject(new Error('toBlob failed')), 'image/png');
    };
    img.onerror = reject;
    img.src = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(svg)));
  });
  navigator.clipboard.write([new ClipboardItem({'image/png': blobPromise})]).then(() => {
    $('copypng').textContent = 'Copied — paste into your deck';
    setTimeout(() => { $('copypng').textContent = 'Copy PNG'; }, 1800);
  }).catch(() => {
    $('copypng').textContent = 'Copy blocked — use Download';
    setTimeout(() => { $('copypng').textContent = 'Copy PNG'; }, 2200);
  });
});
$('copymd').addEventListener('click', async () => {
  if(!model || !model.items.length) return;
  const lines = [];
  if(model.title) lines.push('## ' + model.title, '');
  model.horizons.forEach((hName, h) => {
    const inH = model.items.filter(i => i.h === h);
    if(!inH.length) return;
    lines.push('### ' + hName, '');
    for(const lane of model.lanes){
      const inLane = inH.filter(i => i.lane === lane);
      for(const it of inLane){
        let l = '- ' + (lane ? '**' + lane + ':** ' : '') + it.title;
        if(it.status) l += ' _(' + STATUS_LABEL[it.status].toLowerCase() + ')_';
        if(it.note) l += ' — ' + it.note;
        lines.push(l);
      }
    }
    lines.push('');
  });
  lines.push('_[Live roadmap](' + location.href + ')_');
  try{
    await navigator.clipboard.writeText(lines.join('\n'));
    $('copymd').textContent = 'Copied';
    setTimeout(() => { $('copymd').textContent = 'Copy as markdown'; }, 1500);
  }catch(e){ prompt('Copy this:', lines.join('\n')); }
});

/* ---------- snapshot wiring ---------- */
$('snap').addEventListener('click', () => {
  if(!model || !model.items.length) return;
  const list = loadSnaps();
  const label = new Date().toISOString().slice(0, 10) +
    (model.title ? ' — ' + model.title.slice(0, 30) : '');
  list.push({label, src: editor.getText()});
  storeSnaps(list);
  renderSnapSel();
  $('snap').textContent = 'Saved';
  setTimeout(() => { $('snap').textContent = 'Snapshot'; }, 1200);
});
$('snapsel').addEventListener('change', () => {
  $('snapdel').style.display = $('snapsel').value ? '' : 'none';
  lastSvg = '';
  refresh();
});
$('snapdel').addEventListener('click', () => {
  const idx = $('snapsel').value;
  if(idx === '') return;
  const list = loadSnaps();
  list.splice(+idx, 1);
  storeSnaps(list);
  snapModelCache.clear();
  $('snapsel').value = '';
  renderSnapSel();
  lastSvg = '';
  refresh();
});

/* ---------- saved roadmaps ---------- */
function loadSaved(){
  try{ return JSON.parse(localStorage.getItem('roadmap-saved') || '[]'); }catch(e){ return []; }
}
function storeSaved(list){
  try{ localStorage.setItem('roadmap-saved', JSON.stringify(list)); }catch(e){}
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
    del.setAttribute('aria-label', 'Delete saved roadmap ' + m.name);
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
    if(!model || !model.items.length) return;
    const list = loadSaved();
    list.push({name: model.title ? model.title.slice(0, 28) : 'Roadmap ' + (list.length + 1), src: editor.getText()});
    storeSaved(list);
    renderSaved();
  });
  row.appendChild(save);
}

/* ---------- markdown import ---------- */
const STATUS_FROM_LABEL = {'done':'done','in progress':'doing','doing':'doing','at risk':'risk','risk':'risk','blocked':'blocked'};
function mdToDsl(md){
  const out = [];
  for(const raw of md.split(/\r?\n/)){
    const line = raw.trim();
    if(!line) continue;
    let m;
    if((m = line.match(/^##\s+(.*)$/)) && !line.startsWith('###')){ out.unshift('title: ' + m[1].trim()); continue; }
    if((m = line.match(/^###\s+(.*)$/))){ out.push('', m[1].trim()); continue; }
    if((m = line.match(/^[-*]\s+(.*)$/))){
      let item = m[1].trim();
      let lane = '', status = '', note = '';
      const laneM = item.match(/^\*\*(.+?):?\*\*:?\s+(.*)$/);
      if(laneM){ lane = laneM[1].replace(/:$/, ''); item = laneM[2]; }
      const stM = item.match(/_\(([^)]+)\)_/);
      if(stM){
        const st = STATUS_FROM_LABEL[stM[1].toLowerCase().trim()];
        if(st) status = ' [' + st + ']';
        item = item.replace(stM[0], '').trim();
      }
      const noteM = item.match(/^(.*?)\s+—\s+(.*)$/);
      if(noteM){ item = noteM[1].trim(); note = ' -- ' + noteM[2].trim(); }
      out.push((lane ? lane + ': ' : '') + item + status + note);
      continue;
    }
  }
  return out.join('\n');
}
$('importgo').addEventListener('click', () => {
  const dsl = mdToDsl($('importarea').value);
  if(!dsl.trim()) return;
  $('importbox').classList.remove('open');
  $('importarea').value = '';
  editor.setText(dsl);
});

/* ---------- theme change → re-render ---------- */
function rerender(){ lastSvg = ''; refresh(); }
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', rerender);
new MutationObserver(rerender).observe(document.documentElement, {attributes:true, attributeFilter:['data-theme']});

/* ---------- boot: hash > localStorage > empty ---------- */
(function(){
  let text = '';
  if(location.hash && location.hash.length > 1){
    try{ text = decodeURIComponent(escape(atob(location.hash.slice(1)))); }catch(e){}
  }
  if(!text){
    try{ text = localStorage.getItem('roadmap-src') || ''; }catch(e){}
  }
  renderSnapSel();
  renderSaved();
  if(text) editor.setText(text);
  else refresh();
})();
