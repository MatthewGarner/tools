/* Simulation + verdict copy live in ./engine.js (pure, tested); this script owns the DOM. */
import {simulate, verdictCopy, flipAnalysis, flipCopy, orderDiff, orderDiffCopy} from './engine.js';

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
  state.criteria.forEach((c, ci) => {
    const th = document.createElement('th');
    const nm = document.createElement('input');
    nm.className = 'cname'; nm.value = c.name;
    nm.setAttribute('aria-label', 'Criterion ' + (ci+1) + ' name');
    nm.addEventListener('input', () => { c.name = nm.value; schedule(400); });
    const wrow = document.createElement('div');
    wrow.className = 'wrow';
    const wl = document.createElement('span'); wl.textContent = 'w';
    const w = document.createElement('input');
    w.className = 'weight'; w.type = 'number'; w.min = '0'; w.step = '0.5'; w.value = c.w;
    w.setAttribute('aria-label', c.name + ' weight');
    w.addEventListener('input', () => { c.w = parseFloat(w.value) || 0; schedule(200); });
    wrow.append(wl, w);
    th.append(nm, wrow);
    tr.appendChild(th);
  });
  const the = document.createElement('th');
  the.className = 'effcol';
  const enm = document.createElement('input');
  enm.className = 'cname'; enm.value = state.effort.name;
  enm.setAttribute('aria-label', 'Effort criterion name');
  enm.addEventListener('input', () => { state.effort.name = enm.value; schedule(400); });
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
    const nm = document.createElement('input');
    nm.className = 'iname'; nm.value = it.name; nm.placeholder = 'Initiative name';
    nm.title = it.name;
    nm.setAttribute('aria-label', 'Initiative ' + (i+1) + ' name');
    nm.addEventListener('input', () => { it.name = nm.value; nm.title = nm.value; schedule(400); });
    tdn.appendChild(nm);
    tr.appendChild(tdn);
    state.criteria.forEach((c, ci) => {
      const td = document.createElement('td');
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
  baseOrder.forEach((idx, pos) => {
    const s = stats.find(x => x.i === idx);
    const row = document.createElement('div');
    row.className = 'rrow';
    const p = document.createElement('div'); p.className = 'pos'; p.textContent = pos + 1;
    const nm = document.createElement('div'); nm.className = 'nm';
    nm.textContent = s.name; nm.title = s.name;
    const bar = document.createElement('div');
    bar.className = 'rankbar';
    bar.style.gridTemplateColumns = 'repeat(' + n + ',1fr)';
    bar.setAttribute('role', 'img');
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
  const enc = btoa(unescape(encodeURIComponent(JSON.stringify(s))));
  history.replaceState(null, '', '#' + enc);
}
function readHash(){
  try{
    if(!location.hash || location.hash.length < 2) return false;
    const s = JSON.parse(decodeURIComponent(escape(atob(location.hash.slice(1)))));
    if(!Array.isArray(s.c) || !Array.isArray(s.i)) return false;
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
