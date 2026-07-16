/* Simulation + verdict copy live in ./engine.js (pure, tested); this script owns the DOM. */
import {simulate, verdictCopy, flipAnalysis, flipCopy, orderDiff, orderDiffCopy, perRowKnife} from './engine.js';
import {readHashState, writeHashState} from '../assets/series.js';
import {captureFlip, applyFlip} from '../assets/motion.js';

/* ---------- state ---------- */
const $ = id => document.getElementById(id);
const state = {
  criteria: [
    {name:'Value', w:3},
    {name:'Time criticality', w:2},
    {name:'Risk reduction', w:1},
  ],
  effort: {name:'Effort', w:1},
  items: [],           // {name, s:[b1,b2,b3], e}
  k: 3,
  ww: 50,              // weight wobble: ±% as a 90% interval
  sw: 1,               // score wobble: ± points
};
let lastResult = null;

/* ---------- examples ---------- */
const EXAMPLES = [
  {name:'Ops & infra backlog', k:3, items:[
    ['Incident response automation',    8, 7, 6, 6],
    ['Observability dashboard overhaul',7, 5, 5, 5],
    ['Legacy job scheduler migration',  6, 4, 8, 8],
    ['Cloud cost reporting',            4, 6, 3, 3],
    ['Disaster recovery drill tooling', 5, 3, 9, 8],
    ['Access control audit',            6, 8, 6, 4],
    ['Internal API gateway rewrite',    7, 6, 5, 5],
  ]},
  {name:'Classic product backlog', k:3, items:[
    ['Onboarding revamp',    8, 5, 3, 5],
    ['Enterprise SSO',       6, 8, 4, 4],
    ['Mobile app parity',    7, 4, 3, 9],
    ['Billing self-serve',   5, 6, 5, 4],
    ['Analytics dashboard',  6, 3, 4, 6],
    ['API rate-limit tier',  4, 7, 6, 3],
  ]},
];

/* ---------- table rendering ---------- */
function renderHead(){
  const tr = $('headrow');
  tr.textContent = '';
  const th0 = document.createElement('th');
  th0.innerHTML = '<span class="lbl">Initiative</span>';
  tr.appendChild(th0);
  const sliderMax = 2 * Math.max(1, ...state.criteria.map(x => x.w || 0));   // 0 → 2× the largest weight (M3)
  const wstrip = $('wstrip'); wstrip.textContent = '';   // phone weight surface (header is display:none on phones)
  const sliderStep = String(Math.max(0.1, sliderMax / 100));
  state.criteria.forEach((c, ci) => {
    const th = document.createElement('th');
    const nm = document.createElement('input');
    nm.className = 'cname'; nm.value = c.name;
    nm.setAttribute('aria-label', 'Criterion ' + (ci+1) + ' name');
    const wrow = document.createElement('div');
    wrow.className = 'wrow';
    const wl = document.createElement('span'); wl.textContent = 'w';
    const w = document.createElement('input');
    w.className = 'weight'; w.type = 'number'; w.min = '0'; w.step = '0.5'; w.value = c.w;
    w.setAttribute('aria-label', c.name + ' weight');
    const mkSlider = label => { const s = document.createElement('input');
      s.className = 'wslider'; s.type = 'range'; s.min = '0'; s.max = String(sliderMax); s.step = sliderStep;
      s.value = c.w; s.setAttribute('aria-label', label); return s; };
    const sl = mkSlider(c.name + ' weight slider');
    // phone strip control (the header is display:none on phones)
    const srow = document.createElement('div'); srow.className = 'wsrow';
    const slab = document.createElement('span'); slab.className = 'wslabel'; slab.textContent = c.name || 'Criterion';
    const ssl = mkSlider((c.name || 'Criterion') + ' weight');
    const sval = document.createElement('span'); sval.className = 'wsval'; sval.textContent = c.w;
    srow.append(slab, ssl, sval); wstrip.appendChild(srow);
    // name edit updates BOTH labels; no resim (names don't affect the numeric result — batch 7)
    nm.addEventListener('input', () => { c.name = nm.value; slab.textContent = nm.value || 'Criterion';
      w.setAttribute('aria-label', nm.value + ' weight'); scheduleHashOnly(400); });
    // drag/type ANY control = live deterministic re-rank (FLIP); MC re-runs on commit (change).
    // NEVER write back to the control the user is typing in (C1: Chrome returns '' for '1.', so a
    // write-back stomps the keystroke). A debounced safety commit (I2) covers drag-back-to-start /
    // typed edits, where `change` may never fire.
    const setW = (val, src) => {
      if(!isFinite(val)) return;
      c.w = val;
      if(src !== w) w.value = val;
      if(src !== sl) sl.value = val;
      if(src !== ssl) ssl.value = val;
      sval.textContent = Math.round(val * 10) / 10;
      liveReweight();
      schedule(600);
    };
    w.addEventListener('input', () => { if(w.value !== '') setW(parseFloat(w.value), w); });
    sl.addEventListener('input', () => setW(parseFloat(sl.value), sl));
    ssl.addEventListener('input', () => setW(parseFloat(ssl.value), ssl));
    const commit = () => {
      if(w.value === ''){ c.w = 0; w.value = 0; sl.value = 0; ssl.value = 0; sval.textContent = 0; }   // coerce empty→0 only on blur
      schedule(0);
    };
    [w, sl, ssl].forEach(el => el.addEventListener('change', commit));
    wrow.append(wl, w, sl);
    th.append(nm, wrow);
    tr.appendChild(th);
  });
  const the = document.createElement('th');
  the.className = 'effcol';
  const enm = document.createElement('input');
  enm.className = 'cname'; enm.value = state.effort.name;
  enm.setAttribute('aria-label', 'Effort criterion name');
  enm.addEventListener('input', () => { state.effort.name = enm.value; scheduleHashOnly(400); });   // name-only: no resim (see above)
  const ed = document.createElement('div');
  ed.className = 'wrow'; ed.innerHTML = '<span>÷ divisor</span>';
  the.append(enm, ed);
  tr.appendChild(the);
  tr.appendChild(document.createElement('th'));
}
function renderRows(){
  const tb = $('rows');
  tb.textContent = '';
  state.items.forEach((it, i) => {
    const tr = document.createElement('tr');
    const tdn = document.createElement('td');
    tdn.dataset.label = 'Initiative';
    const nm = document.createElement('input');
    nm.className = 'iname'; nm.value = it.name; nm.placeholder = 'Initiative name';
    nm.title = it.name;
    nm.setAttribute('aria-label', 'Initiative ' + (i+1) + ' name');
    // name-only edit: simulate() reads it.name only to carry it through to
    // stats[].name for display — it never affects the numeric Monte Carlo
    // result. So skip the resim; patch the visible results-panel row label
    // directly (a text-node update) and just debounce the hash write.
    nm.addEventListener('input', () => {
      it.name = nm.value; nm.title = nm.value;
      patchInitiativeName(i, nm.value);
      scheduleHashOnly(400);
    });
    tdn.appendChild(nm);
    tr.appendChild(tdn);
    state.criteria.forEach((c, ci) => {
      const td = document.createElement('td');
      td.dataset.label = c.name;
      const s = document.createElement('input');
      s.className = 'score'; s.type = 'number'; s.min = '1'; s.max = '10'; s.step = '1';
      s.value = it.s[ci];
      s.setAttribute('aria-label', it.name + ' ' + c.name + ' score');
      s.addEventListener('input', () => { it.s[ci] = parseFloat(s.value); schedule(200); });
      td.appendChild(s);
      tr.appendChild(td);
    });
    const tde = document.createElement('td');
    tde.className = 'effcol';
    tde.dataset.label = state.effort.name;
    const e = document.createElement('input');
    e.className = 'score'; e.type = 'number'; e.min = '1'; e.max = '10'; e.step = '1';
    e.value = it.e;
    e.setAttribute('aria-label', it.name + ' effort score');
    e.addEventListener('input', () => { it.e = parseFloat(e.value); schedule(200); });
    tde.appendChild(e);
    tr.appendChild(tde);
    const tdd = document.createElement('td');
    const del = document.createElement('button');
    del.className = 'del'; del.textContent = '×';
    del.setAttribute('aria-label', 'Remove ' + (it.name || 'initiative'));
    del.addEventListener('click', () => { state.items.splice(i, 1); renderRows(); schedule(50); });
    tdd.appendChild(del);
    tr.appendChild(tdd);
    tb.appendChild(tr);
  });
}

/* ---------- simulation (pure, in ./engine.js) ---------- */
function compute(){ lastResult = simulate(state); }

/* Live drag path: re-rank by the DETERMINISTIC score (cheap — no MC), FLIP the existing rows
   into the new order, update positions + knife pills, fade the MC-derived readouts as pending.
   The full simulate() re-runs on commit (change) via schedule(0), which clears the fade. */
function liveReweight(){
  const holder = $('rrows');
  if(!lastResult || !holder.children.length) return;
  const valid = it => it.s.every(v => isFinite(v) && v > 0) && isFinite(it.e) && it.e > 0;
  const score = it => state.criteria.reduce((a, c, ci) => a + c.w * it.s[ci], 0) / it.e;
  // stable sort over index-ascending, NO name tie-break — matches simulate()'s baseOrder exactly
  // (which has none), so genuinely-tied rows don't fake a flip on-screen then snap back on commit (I1)
  const order = state.items.map((_, i) => i).filter(i => valid(state.items[i]))
    .sort((a, b) => score(state.items[b]) - score(state.items[a]));
  const old = captureFlip(holder, 'data-item-idx');
  order.forEach((idx, pos) => {
    const row = holder.querySelector('.rrow[data-item-idx="' + idx + '"]');
    if(!row) return;
    holder.appendChild(row);                       // reorder DOM to the new rank
    row.querySelector('.pos').textContent = pos + 1;
  });
  applyFlip(holder, 'data-item-idx', old);
  const knife = perRowKnife(state);
  holder.querySelectorAll('.rrow').forEach(row => row.classList.toggle('knife', !!knife[+row.dataset.itemIdx]));
  $('results').classList.add('pending');           // MC bars/ptop/verdict stale mid-drag → certainty-fade
}

/* ---------- render results ---------- */
function pctStr(p){
  return p > 0.995 ? '>99%' : p < 0.005 ? '<1%' : Math.round(p * 100) + '%';
}
function renderResults(){
  const R = lastResult;
  if(!R){
    $('ph').style.display = 'block';
    $('results').style.display = 'none';
    return;
  }
  $('ph').style.display = 'none';
  $('results').style.display = 'block';
  $('results').classList.remove('pending');   // fresh MC — the readouts are current again
  const {stats, baseOrder, n, k} = R;

  const {headline, body, contested} = verdictCopy(stats, k);
  const v = $('verdict');
  v.textContent = '';
  const strong = document.createElement('span');
  strong.className = 'smear';
  strong.textContent = headline;
  v.append(strong, document.createTextNode(body));
  $('subverdict').textContent = contested.length
    ? 'Contested for the cut: ' + contested.map(s => s.name + ' (' + pctStr(s.ptop) + ')').join(' · ')
    : '';

  const fc = flipCopy(flipAnalysis(state), state.ww);
  const fl = $('flipline');
  fl.className = 'flipline' + (fc.tone === 'fragile' ? ' fragile' : '');
  fl.textContent = fc.text;

  const holder = $('rrows');
  holder.textContent = '';
  const knife = perRowKnife(state);   // per-row ±10% fragility (I10 — labelled below)
  baseOrder.forEach((idx, pos) => {
    const s = stats.find(x => x.i === idx);
    const row = document.createElement('div');
    row.className = 'rrow' + (knife[s.i] ? ' knife' : '');
    row.dataset.itemIdx = String(s.i);   // lets a name-only edit patch this row without a resim (see patchInitiativeName)
    const p = document.createElement('div'); p.className = 'pos'; p.textContent = pos + 1;
    const nm = document.createElement('div'); nm.className = 'nm';
    const nmtext = document.createElement('span'); nmtext.className = 'nmtext';
    nmtext.textContent = s.name; nmtext.title = s.name;
    nm.appendChild(nmtext);
    const kp = document.createElement('span'); kp.className = 'knifepill';
    kp.textContent = 'knife-edge';
    kp.title = 'This rank flips under a ±10% nudge of a single weight';
    kp.setAttribute('aria-label', 'knife-edge: rank flips under a ±10% weight nudge');
    nm.appendChild(kp);
    const bar = document.createElement('div');
    bar.className = 'rankbar';
    bar.style.gridTemplateColumns = 'repeat(' + n + ',1fr)';
    bar.setAttribute('role', 'img');
    bar.dataset.med = s.med + 1; bar.dataset.p10 = s.p10 + 1; bar.dataset.p90 = s.p90 + 1;
    bar.setAttribute('aria-label', s.name + ': median rank ' + (s.med+1) +
      ', 90% range ' + (s.p10+1) + ' to ' + (s.p90+1));
    for(let r = 0; r < n; r++){
      const cell = document.createElement('div');
      cell.className = 'cell' + (r >= s.p10 && r <= s.p90 ? ' in' : '') +
        (r === s.med ? ' med' : '');
      cell.title = 'Rank ' + (r+1);
      bar.appendChild(cell);
    }
    const pt = document.createElement('div');
    pt.className = 'ptop';
    pt.innerHTML = 'top-' + k + ' <b>' + pctStr(s.ptop) + '</b>';
    row.append(p, nm, bar, pt);
    holder.appendChild(row);
  });
}

/* ---------- copy for a doc ---------- */
$('copydoc').addEventListener('click', async () => {
  if(!lastResult) return;
  const {stats, baseOrder, k} = lastResult;
  const lines = [];
  lines.push('**Prioritisation — rank stability check**');
  lines.push('');
  lines.push('| # | Initiative | Median rank | 90% rank range | P(top-' + k + ') |');
  lines.push('|---|---|---|---|---|');
  baseOrder.forEach((idx, pos) => {
    const s = stats.find(x => x.i === idx);
    lines.push('| ' + (pos+1) + ' | ' + s.name + ' | ' + (s.med+1) + ' | ' +
      (s.p10+1) + '–' + (s.p90+1) + ' | ' + pctStr(s.ptop) + ' |');
  });
  lines.push('');
  lines.push($('verdict').textContent);
  const flipText = $('flipline').textContent;
  if(flipText){ lines.push(''); lines.push(flipText); }
  lines.push('');
  lines.push('_Weights perturbed ±' + state.ww + '%, scores ±' + state.sw + ', 4,000 simulations · [live table](' + location.href + ')_');
  const txt = lines.join('\n');
  try{
    await navigator.clipboard.writeText(txt);
    $('copydoc').textContent = 'Copied';
    setTimeout(() => { $('copydoc').textContent = 'Copy for a doc'; }, 1500);
  }catch(e){ prompt('Copy this:', txt); }
});

/* ---------- URL state ---------- */
function writeHash(){
  const s = {
    c: state.criteria.map(c => [c.name, c.w]),
    e: [state.effort.name, state.effort.w],
    i: state.items.map(it => [it.name, ...it.s, it.e]),
    k: state.k, w: state.ww, s: state.sw,
  };
  if($('oda').value.trim() || $('odb').value.trim()) s.o = [$('oda').value, $('odb').value];
  writeHashState(s);
}
function readHash(){
  try{
    const s = readHashState();
    if(!s || !Array.isArray(s.c) || !Array.isArray(s.i)) return false;
    state.criteria = s.c.map(p => ({name:String(p[0]), w:+p[1] || 0}));
    if(Array.isArray(s.e)) state.effort = {name:String(s.e[0]), w:+s.e[1] || 1};
    state.items = s.i.map(row => ({
      name: String(row[0]),
      s: row.slice(1, 1 + state.criteria.length).map(Number),
      e: +row[1 + state.criteria.length],
    }));
    if(isFinite(+s.k)) state.k = +s.k;
    if(isFinite(+s.w)) state.ww = +s.w;
    if(isFinite(+s.s)) state.sw = +s.s;
    if(Array.isArray(s.o)){
      $('oda').value = String(s.o[0] || '');
      $('odb').value = String(s.o[1] || '');
    }
    return true;
  }catch(e){ return false; }
}

/* ---------- ranking diff (#87) ---------- */
function renderOrderDiff(){
  const aTxt = $('oda').value, bTxt = $('odb').value;
  const v = $('odverdict'), rows = $('odrows');
  rows.textContent = '';
  if(!aTxt.trim() || !bTxt.trim()){ v.hidden = true; return; }
  const d = orderDiff(aTxt.split('\n'), bTxt.split('\n'));
  v.hidden = false;
  v.textContent = orderDiffCopy(d);
  for(const m of d.movers.slice(0, 8)){
    const row = document.createElement('div');
    row.className = 'odrow';
    const nm = document.createElement('span');
    nm.className = 'nm'; nm.textContent = m.title; nm.title = m.title;
    const mv = document.createElement('span');
    mv.className = 'mv'; mv.textContent = '#' + m.a + ' → #' + m.b;
    const dl = document.createElement('span');
    dl.className = 'dl' + (m.delta < 0 ? ' up' : '');
    dl.textContent = (m.delta < 0 ? '▲' : '▼') + Math.abs(m.delta);
    row.append(nm, mv, dl);
    rows.appendChild(row);
  }
  if(d.movers.length > 8){
    const more = document.createElement('div');
    more.className = 'odrow';
    more.innerHTML = '<span class="nm" style="color:var(--muted)">+ ' + (d.movers.length - 8) + ' more</span>';
    rows.appendChild(more);
  }
}
let odTimer = null;
for(const id of ['oda', 'odb']) $(id).addEventListener('input', () => {
  clearTimeout(odTimer);
  odTimer = setTimeout(() => {
    renderOrderDiff();
    clearTimeout(hashTimer);
    hashTimer = setTimeout(writeHash, 400);
  }, 200);
});

/* ---------- wiring ---------- */
let timer = null, hashTimer = null;
function schedule(ms){
  clearTimeout(timer);
  timer = setTimeout(() => {
    compute();
    renderResults();
    clearTimeout(hashTimer);
    hashTimer = setTimeout(writeHash, 400);
  }, ms);
}
/* name-only edits (criterion/effort/initiative) skip the 4000-run resim
   entirely — they route here instead of schedule() (batch 7). */
function scheduleHashOnly(ms){
  clearTimeout(hashTimer);
  hashTimer = setTimeout(writeHash, ms);
}
/* live-patch an initiative's row label in the results panel without a
   resim: the row carries data-item-idx (== stats[].i, the original
   state.items index) and the bar carries its med/p10/p90 so the
   aria-label can be rebuilt with the new name alone. No-op if the results
   panel isn't showing this item yet (e.g. before the first compute()). */
function patchInitiativeName(i, name){
  const row = $('rrows').querySelector('.rrow[data-item-idx="' + i + '"]');
  if(!row) return;
  const nm = row.querySelector('.nmtext');
  nm.textContent = name; nm.title = name;
  const bar = row.querySelector('.rankbar');
  bar.setAttribute('aria-label', name + ': median rank ' + bar.dataset.med +
    ', 90% range ' + bar.dataset.p10 + ' to ' + bar.dataset.p90);
}
$('addrow').addEventListener('click', () => {
  state.items.push({name:'', s: state.criteria.map(() => 5), e: 5});
  renderRows();
  $('rows').lastElementChild.querySelector('.iname').focus();
  schedule(50);
});
$('kin').addEventListener('input', () => {
  state.k = parseInt($('kin').value, 10) || 3;
  schedule(150);
});
$('ww').addEventListener('input', () => {
  state.ww = Math.max(0, parseFloat($('ww').value) || 0);
  schedule(200);
});
$('sw').addEventListener('input', () => {
  state.sw = Math.max(0, parseFloat($('sw').value) || 0);
  schedule(200);
});

/* ---------- paste import ---------- */
$('pastebtn').addEventListener('click', () => {
  $('pastebox').classList.toggle('open');
  if($('pastebox').classList.contains('open')) $('pastearea').focus();
});
function parsePaste(text){
  const items = [], bad = [];
  for(const rawLine of text.split(/\r?\n/)){
    const line = rawLine.trim();
    if(!line) continue;
    if(/^\|?[\s:|-]+\|?$/.test(line)) continue;            // markdown separator row
    let parts;
    if(line.includes('|')) parts = line.split('|').map(s => s.trim()).filter(Boolean);
    else if(line.includes('\t')) parts = line.split('\t').map(s => s.trim());
    else parts = line.split(',').map(s => s.trim());
    if(parts.length < 5){ bad.push(line); continue; }
    const nums = parts.slice(-4).map(Number);
    if(nums.some(v => !isFinite(v) || v <= 0)){
      // probably a header row — skip silently if nothing numeric at all
      if(parts.slice(-4).every(v => isNaN(Number(v)))) continue;
      bad.push(line); continue;
    }
    items.push({name: parts.slice(0, parts.length - 4).join(' '), s: nums.slice(0, 3), e: nums[3]});
  }
  return {items, bad};
}
$('pastego').addEventListener('click', () => {
  const {items, bad} = parsePaste($('pastearea').value);
  const err = $('perr');
  if(!items.length){
    err.textContent = 'No rows parsed — expected: name, then 4 numbers per line.';
    return;
  }
  err.textContent = bad.length ? items.length + ' imported; ' + bad.length + ' line(s) skipped (couldn’t read 4 numbers).' : '';
  state.items = items;
  renderRows();
  if(!bad.length){
    $('pastebox').classList.remove('open');
    $('pastearea').value = '';
  }
  schedule(50);
});
for(const ex of EXAMPLES){
  const b = document.createElement('button');
  b.className = 'chip';
  b.textContent = ex.name;
  b.addEventListener('click', () => {
    state.items = ex.items.map(r => ({name:r[0], s:r.slice(1, 4), e:r[4]}));
    state.k = ex.k;
    $('kin').value = ex.k;
    renderRows();
    schedule(50);
  });
  $('chips').appendChild(b);
}

if(readHash()){ $('kin').value = state.k; $('ww').value = state.ww; $('sw').value = state.sw; renderOrderDiff(); }
else state.items = [
  {name:'', s:[5,5,5], e:5},
  {name:'', s:[5,5,5], e:5},
  {name:'', s:[5,5,5], e:5},
];
renderHead();
renderRows();
compute();
renderResults();
