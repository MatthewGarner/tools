/* Simulation + verdict copy live in ./engine.js (pure, tested); this script owns the DOM. */
import {simulate, verdictCopy, flipAnalysis, flipCopy, orderDiff, orderDiffCopy, perRowKnife, sliderScale} from './engine.js';
import {readHashState, writeHashState, fmt} from '../assets/series.js';
import {captureFlip, applyFlip} from '../assets/motion.js';
import {EXAMPLES, DEFAULT_CRITERIA, DEFAULT_EFFORT} from './examples.js';
import {paintKicker, paintMetrics, paintVerdict, wireCopyVerdict} from '../assets/verdict.js';

/* ---------- state ---------- */
const $ = id => document.getElementById(id);
const state = {
  criteria: DEFAULT_CRITERIA.map(c => ({...c})),   // clone — weights are mutated on drag
  effort: {...DEFAULT_EFFORT},
  items: [],           // {name, s:[b1,b2,b3], e}
  k: 3,
  ww: 50,              // weight wobble: ±% as a 90% interval
  sw: 1,               // score wobble: ± points
};
let lastResult = null;
/* the verdict as PLAIN prose — the doc export quotes it, and must never inherit
   the display block's kicker or its marked-up figure */
let verdictText = '';
// True while a weight SLIDER is being dragged (pointer down). The live path (liveReweight,
// deterministic FLIP) runs on every input; the full MC resim — which rewrites the verdict
// lines that now sit ABOVE the phone strip — is deferred to release so the control and rows
// don't reflow under the thumb on a drag-and-hold. Typed/keyboard edits keep the safety commit.
let sliderDown = false;
const clampScore = value => Math.max(1, Math.min(10, value));
// toPrecision scrubs binary float tails (0.6000000000000001) off slider arithmetic
const clampWeight = value => Math.max(0, Number(value.toPrecision(12)));

/* examples + default weights live in ./examples.js (pure, invariant-tested) */

/* ---------- table rendering ---------- */
function renderHead(){
  const tr = $('headrow');
  tr.textContent = '';
  const th0 = document.createElement('th');
  th0.innerHTML = '<span class="lbl">Initiative</span>';
  tr.appendChild(th0);
  const headScale = sliderScale(state.criteria.map(x => x.w));   // 0 → 2× the largest weight (M3), nice step
  const wstrip = $('wstrip'); wstrip.textContent = '';   // phone weight surface (header is display:none on phones)
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
      s.className = 'wslider'; s.type = 'range'; s.min = '0'; s.max = String(headScale.max); s.step = String(headScale.step);
      s.value = c.w; s.setAttribute('aria-label', label); return s; };
    const sl = mkSlider(c.name + ' weight slider');
    // phone strip control (the header is display:none on phones)
    const srow = document.createElement('div'); srow.className = 'wsrow';
    const slab = document.createElement('span'); slab.className = 'wslabel'; slab.textContent = c.name || 'Criterion';
    const ssl = mkSlider((c.name || 'Criterion') + ' weight');
    const sval = document.createElement('span'); sval.className = 'wsval'; sval.textContent = fmt(c.w);
    srow.append(slab, ssl, sval); wstrip.appendChild(srow);
    // name edit updates BOTH labels; no resim (names don't affect the numeric result — batch 7)
    nm.addEventListener('input', () => { c.name = nm.value; slab.textContent = nm.value || 'Criterion';
      w.setAttribute('aria-label', nm.value + ' weight'); renderRows(); scheduleHashOnly(400); });
    // drag/type ANY control = live deterministic re-rank (FLIP); MC re-runs on commit (change).
    // NEVER write back to the control the user is typing in (C1: Chrome returns '' for '1.', so a
    // write-back stomps the keystroke). A debounced safety commit (I2) covers drag-back-to-start /
    // typed edits, where `change` may never fire.
    // Never recalibrate max/step here: mid-gesture the ceiling moves under the thumb
    // and (max = 2× largest) compounds exponentially — weights hit 1e13+ in the wild.
    // commit() recalibrates, so a full drag tops out at 2× per gesture by design.
    const setW = (val, src) => {
      if(!isFinite(val)) return;
      c.w = clampWeight(val);
      if(src !== w) w.value = c.w;
      if(src !== sl) sl.value = c.w;
      if(src !== ssl) ssl.value = c.w;
      sval.textContent = fmt(c.w);
      liveReweight();
      if(!sliderDown) schedule(600);   // pointer-drag defers the MC resim to release (no reflow under the thumb); typed/keyboard edits keep the safety
    };
    w.addEventListener('input', () => { if(w.value !== '') setW(parseFloat(w.value), w); });
    sl.addEventListener('input', () => setW(parseFloat(sl.value), sl));
    ssl.addEventListener('input', () => setW(parseFloat(ssl.value), ssl));
    // a slider drag: hold off the resim while the pointer is down, then commit on release —
    // pointerup is guaranteed even when the value ends where it began (drag-back-to-start),
    // where `change` never fires, so this also subsumes the I2 stuck-fade safety.
    [sl, ssl].forEach(el => {
      el.addEventListener('pointerdown', () => { sliderDown = true; });
      const release = () => { if(sliderDown){ sliderDown = false; schedule(0); } };
      el.addEventListener('pointerup', release);
      el.addEventListener('pointercancel', release);
    });
    const commit = () => {
      sliderDown = false;
      c.w = w.value === '' ? 0 : clampWeight(parseFloat(w.value));
      // recalibrate BOTH sliders to the new weights (max before value — value clamps to max)
      const scale = sliderScale(state.criteria.map(x => x.w));
      [sl, ssl].forEach(control => { control.max = String(scale.max); control.step = String(scale.step); });
      w.value = c.w; sl.value = c.w; ssl.value = c.w; sval.textContent = fmt(c.w);
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
  enm.addEventListener('input', () => { state.effort.name = enm.value; renderRows(); scheduleHashOnly(400); });   // name-only: no resim (see above)
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
      s.addEventListener('input', () => { if(s.value !== ''){ it.s[ci] = clampScore(parseFloat(s.value)); schedule(200); } });
      s.addEventListener('change', () => {
        it.s[ci] = s.value === '' ? it.s[ci] : clampScore(parseFloat(s.value));
        s.value = it.s[ci]; schedule(0);
      });
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
    e.addEventListener('input', () => { if(e.value !== ''){ it.e = clampScore(parseFloat(e.value)); schedule(200); } });
    e.addEventListener('change', () => {
      it.e = e.value === '' ? it.e : clampScore(parseFloat(e.value));
      e.value = it.e; schedule(0);
    });
    tde.appendChild(e);
    tr.appendChild(tde);
    const tdd = document.createElement('td');
    const del = document.createElement('button');
    del.className = 'del'; del.textContent = '×';
    del.setAttribute('aria-label', 'Remove ' + (it.name || 'initiative'));
    del.addEventListener('click', () => { state.items.splice(i, 1); syncCapacity(); renderRows(); schedule(50); });
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
  // mirrors engine.js's simulate(): finite-only membership (no >0 requirement), clamped
  // weight/score in the score itself — so live drag order can never disagree with the commit.
  const valid = it => it.s.every(v => isFinite(v)) && isFinite(it.e);
  const score = it => state.criteria.reduce((a, c, ci) => a + clampWeight(c.w || 0) * clampScore(it.s[ci]), 0) / clampScore(it.e);
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
    verdictText = '';
    paintVerdict($('verdict'), '', '');
    paintMetrics($('metrics'), '', []);
    return;
  }
  $('ph').style.display = 'none';
  $('results').style.display = 'block';
  $('results').classList.remove('pending');   // fresh MC — the readouts are current again
  const {stats, baseOrder, n, k} = R;

  const {headline, body, contested, fig} = verdictCopy(stats, k);
  verdictText = headline + body;
  paintVerdict($('verdict'), headline, fig);
  /* the display line is the headline alone; the reasoning and the tie list are
     supporting text, muted, below the block */
  $('subverdict').textContent = body.trim() + (contested.length
    ? ' Contested for the cut: ' + contested.map(s => s.name + ' (' + pctStr(s.ptop) + ')').join(' · ')
    : '');
  paintMetrics($('metrics'), '', [
    stats.length + (stats.length === 1 ? ' initiative' : ' initiatives'),
    state.criteria.length + (state.criteria.length === 1 ? ' benefit criterion' : ' benefit criteria'),
    'top ' + k + ' capacity',
  ]);

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
  lines.push(verdictText);
  const flipText = $('flipline').textContent;
  if(flipText){ lines.push(''); lines.push(flipText); }
  lines.push('');
  lines.push('_Weights perturbed ±' + state.ww + '%, scores ±' + state.sw + ', 4,000 simulations · [live table](' + location.href + ')_');
  const txt = lines.join('\n');
  try{
    await navigator.clipboard.writeText(txt);
    $('copydoc').textContent = 'Copied';
    setTimeout(() => { $('copydoc').textContent = 'Copy as markdown'; }, 1500);
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
async function readHash(){
  try{
    const s = await readHashState();
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
  syncCapacity();
  renderRows();
  $('rows').lastElementChild.querySelector('.iname').focus();
  schedule(50);
});
function syncCapacity(raw = state.k){
  const max = Math.max(1, state.items.length);
  state.k = Math.max(1, Math.min(max, parseInt(raw, 10) || 1));
  $('kin').max = String(max);
  $('kin').value = state.k;
}
$('kin').addEventListener('input', () => {
  syncCapacity($('kin').value);
  schedule(150);
});
$('ww').addEventListener('input', () => {
  state.ww = Math.max(0, Math.min(200, parseFloat($('ww').value) || 0));
  schedule(200);
});
$('sw').addEventListener('input', () => {
  state.sw = Math.max(0, Math.min(5, parseFloat($('sw').value) || 0));
  schedule(200);
});
for(const id of ['ww', 'sw']) $(id).addEventListener('change', () => { $(id).value = state[id]; });

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
  syncCapacity();
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
    syncCapacity(ex.k);
    renderRows();
    schedule(50);
  });
  $('chips').appendChild(b);
}

if(await readHash()){ syncCapacity(); $('ww').value = state.ww; $('sw').value = state.sw; renderOrderDiff(); }
else {
  // Open on a real, contested backlog (not 3 identical rows that never re-sort) so the
  // drag-weights mechanism is live and a knife-edge shows the moment you land. Matches
  // the first chip, and never writes the hash (readHash's absence is the trigger).
  const ex = EXAMPLES[0];
  state.items = ex.items.map(r => ({name: r[0], s: r.slice(1, 4), e: r[4]}));
  syncCapacity(ex.k);
}
paintKicker($('kicker'), '04', 'Ranking that survives its own uncertainty');
wireCopyVerdict($('verdict'));
renderHead();
renderRows();
compute();
renderResults();
