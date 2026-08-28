/* DOM shell for the premortem wizard. Engine/store/renderers are pure; this owns
   the DOM, the phase machine wiring, localStorage autosave, the WRITE timer, undo,
   and import-from-link. The doc is the single state; every mutation autosaves. */
import {newEntry, mergeEntries, markdown, exposure, promote, promoteOpportunity, isRisk, isOpportunity, modeOf, isScoreable,
  isCompleteRange, exampleDoc} from './register.js';
import {makeStore, toLink, fromLink} from './store.js';
import {PHASES, canAdvance, advance, back, castVote, phaseLabel} from './wizard.js';
import {renderPhase} from './render-wizard.js';
import {renderBoard} from './render-board.js';
import {debounced} from '../assets/schedule.js';
import {paintKicker, paintMetrics} from '../assets/verdict.js';
import {validHandoffMeta, withoutHandoffMeta} from '../assets/handoff.js';
import {esc} from '../assets/svg.js';

const $ = id => document.getElementById(id);
const store = makeStore();
const WRITE_SECS = 120;
const DELETE_UNDO_MS = 10000;

let doc = null, undoStack = [], reached = new Set(), timer = 0, transientImport = false;
let view = 'wizard', promotingId = null, promotionNote = '';   // transient UI state (not persisted)
let pendingDeletion = null;
const deletionTimers = new Map();   // doc id -> timer handle; one purge timer per tomb, so a second delete's arm can never cancel a first tomb's own expiry
const saveNow = () => { if(doc && !transientImport) store.save(doc); };
const save = debounced(saveNow, 300);

function newDoc(mode = 'risk'){
  return {v: 1, id: (globalThis.crypto?.randomUUID?.() ?? 'd' + Date.now()),
    mode, title: '', question: '', unit: '£k', people: 5, phase: 'FRAME', entries: []};
}
function snapshot(){ undoStack.push(structuredClone(doc)); if(undoStack.length > 20) undoStack.shift(); }
function mutate(fn, paint = {}){ snapshot(); fn(); saveNow(); render(paint); }
const entry = id => doc.entries.find(e => e.id === id);

/* ---------- render ---------- */
function render(paint = {}){
  const home = !doc;
  paintKicker($('kicker'), '10', doc && modeOf(doc) === 'success' ? 'Success made deliberately' : 'Failure named in advance');
  $('home').hidden = !home;
  $('workspace').hidden = home;
  $('importstrip').hidden = home || !transientImport;
  if(transientImport){
    const meta = validHandoffMeta(doc?.x, {from: 'timeline', kind: 'risk-register'});
    $('importsource').textContent = meta ? 'From ' + (meta.label || 'Timeline') : 'From a shared link';
    $('returntosource').hidden = !meta?.returnTo;
    if(meta?.returnTo) $('returntosource').href = meta.returnTo;
  }
  if(timer){ clearInterval(timer); timer = 0; }
  if(home){ paintMetrics($('metrics'), '', []); renderHome(); finishPaint(paint); return; }
  paintMetrics($('metrics'), doc.title || 'Untitled premortem', metricCounts(doc));
  $('workspace').dataset.view = view;   // per-view widths key off #workspace[data-view]
  renderToggle();
  $('boardview').hidden = view !== 'board';
  $('wizardview').hidden = view === 'board';
  $('undo').disabled = undoStack.length === 0;
  /* ONE red primary per surface (6b): while the wizard's Next → is on screen it
     is the primary; ＋ New premortem takes the red back on board/register views
     and once the wizard reaches the register. */
  $('newbtn').classList.toggle('primary', view !== 'wizard' || doc.phase === 'REGISTER');
  if(view === 'board'){
    $('boardpanel').innerHTML = renderBoard(doc, new Date(), promotingId);
    finishPaint(paint); return;
  }
  // "register" view reuses the wizard's phasepanel (and its action listeners) with
  // the rail + nav hidden — it renders the register WITHOUT touching doc.phase, so
  // the wizard keeps its position and the Wizard tab always restores it.
  const reg = view === 'register';
  $('phaserail').hidden = reg;
  $('navbar').hidden = reg;
  if(reg){ $('phasepanel').innerHTML = (promotionNote ? '<p class="promotion-seam">' + promotionNote + '</p>' : '') +
    renderPhase({...doc, phase: 'REGISTER'}, new Date()); finishPaint(paint); return; }
  reached.add(doc.phase);
  renderRail();
  $('phasepanel').innerHTML = renderPhase(doc, new Date());
  const gate = canAdvance(doc);
  $('next').hidden = doc.phase === 'REGISTER';
  $('next').disabled = !gate.ok;
  $('gatewhy').textContent = gateText(gate);
  $('back').disabled = doc.phase === 'FRAME';
  if(doc.phase === 'WRITE') startTimer();
  finishPaint(paint);
}
function finishPaint({focus = '', phaseFocus = false, announce = ''} = {}){
  const phaseTarget = $('phasepanel').querySelector('h2, .reghead');
  if(phaseTarget) phaseTarget.tabIndex = -1;
  requestAnimationFrame(() => {
    const target = phaseFocus ? phaseTarget : (focus ? document.querySelector(focus) : null);
    if(target){
      if(!target.matches('button, input, select, textarea, a[href], [tabindex]')) target.tabIndex = -1;
      target.focus();
    }
    const msg = announce || (phaseFocus && doc ? phaseLabel(doc, doc.phase) + ' step' : '');
    if(msg){ $('announcer').textContent = ''; requestAnimationFrame(() => { $('announcer').textContent = msg; }); }
  });
}
/* The metrics row over the workspace: the register's real shape, counted off the
   doc on every render. Deliberately cheap — no Monte Carlo — so it rides the
   existing render without adding a second exposure() pass. */
function metricCounts(d){
  const entries = d.entries || [];
  if(modeOf(d) === 'success'){
    const opportunities = entries.filter(isOpportunity);
    const essential = opportunities.filter(e => e.essential).length;
    const board = entries.length - opportunities.length;
    return [opportunities.length + ' opportunit' + (opportunities.length === 1 ? 'y' : 'ies'),
      essential + ' must make true', board ? board + ' on the board' : ''];
  }
  const risks = entries.filter(isRisk);
  const scored = risks.filter(isScoreable).length;
  const board = entries.length - risks.length;
  return [risks.length + ' risk' + (risks.length === 1 ? '' : 's'),
    scored + ' EV-ranked',
    board ? board + ' on the board' : ''];
}
/* The three faces onto one doc (a button group, aria-pressed). None mutate
   doc.phase — the register view just shows the register; the wizard keeps its
   own terminal REGISTER phase reachable through the flow. */
function renderToggle(){
  const seg = (k, label) => '<button class="vtseg' + (view === k ? ' on' : '') +
    '" data-view="' + k + '" data-capabilities="views.workshop views.board views.register" aria-pressed="' + (view === k) + '">' + label + '</button>';
  const register = modeOf(doc) === 'success' ? 'Success register' : 'Risk register';
  $('viewtoggle').innerHTML = seg('wizard', 'Run workshop') + seg('board', 'Working board') + seg('register', register);
}
function renderRail(){
  const cur = PHASES.indexOf(doc.phase);
  $('phaserail').innerHTML = PHASES.map((p, i) => {
    const cls = p === doc.phase ? 'current' : (i < cur || reached.has(p)) ? 'done' : '';
    const reachable = i <= cur || reached.has(p);
    return '<li class="' + cls + '"><button type="button" data-goto="' + p + '"' +
      (p === doc.phase ? ' aria-current="step"' : '') + (reachable ? '' : ' disabled=""') + '>' + phaseLabel(doc, p) + '</button></li>';
  }).join('');
}
function renderHome(){
  const list = store.list().sort((a, b) => b.saved - a.saved);
  $('savedlist').innerHTML = list.length ? list.map(m => {
    const preParade = m.mode === 'success';
    const n = preParade ? (m.opportunities ?? m.entries) : (m.risks ?? m.entries);
    const title = m.title ? m.title : 'Untitled premortem';
    return '<div class="savedrow" data-id="' + escHtml(m.id) + '"><button type="button" class="stitle" data-open="' + escHtml(m.id) + '">' +
    escHtml(title) + '</button>' +
    '<span class="smeta">' + n + ' ' + (preParade ? 'opportunit' + (n === 1 ? 'y' : 'ies') : 'risk' + (n === 1 ? '' : 's')) + (preParade ? ' · pre-parade' : '') + '</span>' +
    '<button class="sdel" data-del="' + escHtml(m.id) + '" aria-label="Delete ' + escHtml(title) + '">×</button></div>'; }).join('')
    : '<p class="savedempty">No registers yet — start a premortem below.</p>';
  renderDeletionFeedback();
}
function renderDeletionFeedback(){
  $('homefeedback').hidden = !pendingDeletion;
  $('homefeedbacktext').textContent = pendingDeletion ? '“' + pendingDeletion.title + '” deleted.' : '';
}
/* Arms (or re-arms, e.g. on boot) ONE tomb's own purge timer, keyed by its doc
   id — independent of every other pending tomb, so a second delete's arm can
   never cancel a first tomb's expiry (the single-slot bug this batch fixes).
   The visible "X deleted" banner still shows only the most-recently-armed
   tomb (pendingDeletion stays a single slot); every tomb purges correctly on
   its own schedule regardless of which one is currently shown. */
function armDeletion(tomb){
  const id = tomb.doc.id;
  const existing = deletionTimers.get(id);
  if(existing) clearTimeout(existing);
  const left = DELETE_UNDO_MS - (Date.now() - tomb.deleted);
  const expire = () => {
    store.purgeTrash(id);
    deletionTimers.delete(id);
    if(pendingDeletion && pendingDeletion.doc.id === id){ pendingDeletion = null; renderDeletionFeedback(); }
  };
  if(left <= 0){ expire(); return; }
  pendingDeletion = {...tomb, title: tomb.doc.title || 'Untitled premortem'};
  deletionTimers.set(id, setTimeout(expire, left));
}
function armAllPendingTombstones(){ for(const tomb of store.trashedAll()) armDeletion(tomb); }
const escHtml = s => String(s).replace(/[&<>"]/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;'}[c]));

/* ---------- WRITE timer ---------- */
function startTimer(){
  const el = $('phasepanel').querySelector('.countdown');
  if(!el) return;
  if(!doc.endsAt){ doc.endsAt = Date.now() + WRITE_SECS * 1000; save(); }
  const tick = () => {
    const left = Math.max(0, Math.round((doc.endsAt - Date.now()) / 1000));
    el.textContent = Math.floor(left / 60) + ':' + String(left % 60).padStart(2, '0');
    if(left <= 0 && timer){ clearInterval(timer); timer = 0; el.textContent = 'time'; }
  };
  tick();
  timer = setInterval(tick, 1000);
}

/* ---------- nav ---------- */
$('next').addEventListener('click', () => { if(canAdvance(doc).ok) mutate(() => { doc = advance(doc); }, {phaseFocus: true}); });
$('back').addEventListener('click', () => mutate(() => { doc = back(doc); }, {phaseFocus: true}));
$('undo').addEventListener('click', undo);
function undo(){
  if(!undoStack.length) return;
  doc = undoStack.pop(); saveNow();
  render({focus: '#undo', announce: 'Undo.'});
}
document.addEventListener('keydown', e => {
  const editing = e.target instanceof Element && e.target.closest('input, textarea, select, [contenteditable="true"]');
  if(!e.defaultPrevented && !editing && !e.shiftKey && !e.altKey &&
    (e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z' && doc && undoStack.length){
    e.preventDefault(); undo();
  }
});
$('phaserail').addEventListener('click', e => {
  const b = e.target.closest('[data-goto]');
  if(!b || b.disabled || b.dataset.goto === doc.phase) return;
  mutate(() => { doc = {...doc, phase: b.dataset.goto}; }, {phaseFocus: true});
});
$('phaserail').addEventListener('keydown', e => {
  if(!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) return;
  const enabled = [...$('phaserail').querySelectorAll('button:not(:disabled)')];
  const i = enabled.indexOf(e.target); if(i < 0) return;
  e.preventDefault();
  const next = e.key === 'Home' ? enabled[0] : e.key === 'End' ? enabled.at(-1) :
    enabled[Math.max(0, Math.min(enabled.length - 1, i + (e.key === 'ArrowRight' ? 1 : -1)))];
  next?.focus();
});
$('viewtoggle').addEventListener('click', e => {
  const b = e.target.closest('[data-view]'); if(!b) return;
  promotingId = null; view = b.dataset.view;
  render({focus: '[data-view="' + view + '"]', announce: b.textContent.trim() + ' view'});
});

/* ---------- board (Facts / Assumptions / Beliefs) ---------- */
const boardPanel = $('boardpanel');
boardPanel.addEventListener('input', e => {
  const d = e.target.dataset;
  if(d.conf){ setRange(entry(d.id), 'p', d.conf, e.target.value); save(); }   // confidence-it-holds → e.p (flips on promote)
});
boardPanel.addEventListener('keydown', e => {
  if(e.key === 'Escape' && promotingId){
    const id = promotingId;
    e.preventDefault();
    promotingId = null;
    render({focus: '[data-promote="' + id + '"]', announce: 'Promotion cancelled.'});
    return;
  }
  if(e.target.dataset.addKind && e.key === 'Enter'){
    const v = e.target.value.trim(), kind = e.target.dataset.addKind;
    if(v) mutate(() => { doc.entries.push(newEntry(v, {kind})); });
    requestAnimationFrame(() => boardPanel.querySelector('[data-add-kind="' + kind + '"]')?.focus());
  }
});
boardPanel.addEventListener('click', e => {
  const d = e.target.dataset;
  if(d.boarddel){
    const en = entry(d.boarddel), kind = en?.kind, label = en?.text || 'Item';
    mutate(() => { doc.entries = doc.entries.filter(x => x.id !== d.boarddel); },
      {focus: kind ? '[data-add-kind="' + kind + '"]' : '', announce: label + ' deleted. Undo available.'});
  }
  else if(d.promote){ promotingId = d.promote; render();
    requestAnimationFrame(() => boardPanel.querySelector(modeOf(doc) === 'success' ? '[data-promoteok]' : '[data-promoteimpact="lo"]')?.focus()); }
  else if(d.promotecancel){ promotingId = null; render({focus: '[data-promote]'}); }
  else if(d.promoteok){ confirmPromote(d.promoteok); }
});
function confirmPromote(id){
  if(modeOf(doc) === 'success'){
    promotingId = null; view = 'register';
    promotionNote = 'Working board → success register · ' + esc(entry(id).text) + ' was promoted.';
    mutate(() => { doc.entries = doc.entries.map(x => x.id === id ? promoteOpportunity(x) : x); },
      {phaseFocus: true, announce: 'Opportunity added to success register'});
    return;
  }
  const wrap = boardPanel.querySelector('.bcard.promoting[data-id="' + id + '"]');
  if(!wrap) return;
  const num = sel => { const v = wrap.querySelector(sel)?.value; return v === '' || v == null ? null : +v; };
  const p = [num('[data-promotep="lo"]'), num('[data-promotep="hi"]')];
  const impact = [num('[data-promoteimpact="lo"]'), num('[data-promoteimpact="hi"]')];
  if(!isCompleteRange(p, 0, 100) || !isCompleteRange(impact, 0)){
    wrap.querySelector('.pfhint').textContent =
      'Give complete low–high ranges: likelihood from 0–100%, impact at least 0, with low no higher than high.';
    return;
  }
  promotingId = null; view = 'register';                            // land on the register so they see it arrive
  promotionNote = 'Working board → risk register · ' + esc(entry(id).text) + ' was promoted.';
  mutate(() => { doc.entries = doc.entries.map(x => x.id === id ? promote(x, p, impact) : x); },
    {phaseFocus: true, announce: 'Risk added to register'});
}

/* ---------- home ---------- */
$('newbtn').addEventListener('click', () => {
  transientImport = false; doc = newDoc('risk'); undoStack = []; reached = new Set(); view = 'wizard'; promotingId = null; saveNow();
  render({focus: '[data-field="title"]', announce: 'New premortem'});
});
$('newparade').addEventListener('click', () => {
  doc = newDoc('success'); undoStack = []; reached = new Set(); view = 'wizard'; promotingId = null; saveNow();
  render({focus: '[data-field="title"]', announce: 'New pre-parade'});
});
$('homebtn').addEventListener('click', () => {
  saveNow(); transientImport = false; doc = null; undoStack = []; promotingId = null; render({focus: '#home h2', announce: 'Your registers'});
});
$('saveimport').addEventListener('click', () => {
  if(!doc || !transientImport) return;
  try{
    const saved = withoutHandoffMeta(doc);   // provenance governs only the transient import, never a normal saved/link state
    store.save(saved);
    doc = saved;
    transientImport = false;
    render({focus: '#homebtn', announce: (doc.title || 'Untitled premortem') + ' saved as a new register'});
  }catch(e){
    finishPaint({focus: '#saveimport', announce: 'Could not save this register. The imported draft is still open.'});
  }
});
$('returnfromimport').addEventListener('click', () => {
  if(!transientImport) return;
  transientImport = false; doc = null; undoStack = []; reached = new Set(); promotingId = null;
  render({focus: '#home h2', announce: 'Returned to your registers. Imported draft was not saved.'});
});
$('savedlist').addEventListener('click', e => {
  const open = e.target.closest('[data-open]'), del = e.target.closest('[data-del]');
  if(open){
    const loaded = store.load(open.dataset.open); if(!loaded) return;
    transientImport = false; doc = loaded; undoStack = []; reached = new Set([doc.phase]); view = 'wizard'; promotingId = null;
    render({phaseFocus: true, announce: (doc.title || 'Untitled premortem') + ' opened'});
  } else if(del){
    const tomb = store.trash(del.dataset.del); if(!tomb) return;
    armDeletion(tomb); renderHome();
    finishPaint({focus: '#restoredeleted', announce: pendingDeletion.title + ' deleted. Undo available.'});
  }
});
$('restoredeleted').addEventListener('click', () => {
  if(!pendingDeletion) return;
  const title = pendingDeletion.title, tid = pendingDeletion.doc.id;
  const restored = store.restoreTrash(tid);   // by id — precise even if another tomb is also pending
  const t = deletionTimers.get(tid);
  if(t) clearTimeout(t);
  deletionTimers.delete(tid);
  pendingDeletion = null;
  renderHome();
  finishPaint({focus: restored ? '[data-open="' + restored.id + '"]' : '[data-open]', announce: title + ' restored'});
});

/* ---------- phase interactions ---------- */
$('phasepanel').addEventListener('input', e => {
  const t = e.target, d = t.dataset;
  if(d.field === 'title'){ doc.title = t.value; save(); refreshGate(); }
  else if(d.field === 'question'){ doc.question = t.value; save(); refreshGate(); }
  else if(d.field === 'unit'){ doc.unit = t.value; save(); }
  else if(d.field === 'people'){ doc.people = Math.max(1, +t.value || 1); save(); updatePool(); }
  else if(d.p){ setRange(entry(d.id), 'p', d.p, t.value); save(); refreshGate(); }
  else if(d.impact){ setRange(entry(d.id), 'impact', d.impact, t.value); save(); refreshGate(); }
  else if(d.action){ const en = entry(d.id); if(en && en.actions[d.ai]) { en.actions[d.ai][d.action] = t.value; save(); } }
});
function setRange(en, key, side, val){
  if(!en) return;
  const cur = en[key] || [null, null];
  const parsed = val === '' ? null : Number(val);
  const v = Number.isFinite(parsed) ? parsed : null;
  const next = side === 'lo' ? [v, cur[1]] : [cur[0], v];
  en[key] = (next[0] == null && next[1] == null) ? null : next;
}
/* don't scold the FRAME form before the user has started typing (both fields
   empty = untouched); once they've named one, the guidance is helpful */
function gateText(g){
  if(g.ok) return '';
  if(doc.phase === 'FRAME' && !doc.title?.trim() && !doc.question?.trim()) return '';
  return g.why;
}
function refreshGate(){ const g = canAdvance(doc); $('next').disabled = !g.ok; $('gatewhy').textContent = gateText(g); }
function updatePool(){ if(doc.phase === 'VOTE') render({focus: '[data-field="people"]'}); }

$('phasepanel').addEventListener('keydown', e => {
  if(e.target.dataset.add === 'entry' && e.key === 'Enter'){
    const v = e.target.value.trim();
    if(v) mutate(() => { doc.entries.push(newEntry(v, {kind: modeOf(doc) === 'success' ? 'opportunity' : 'risk'})); });
    requestAnimationFrame(() => $('phasepanel').querySelector('[data-add="entry"]')?.focus());
  }
});
$('phasepanel').addEventListener('change', e => {
  const d = e.target.dataset;
  if(d.essential !== undefined){
    mutate(() => { const en = entry(d.essential); if(en) en.essential = e.target.checked; },
      {focus: '[data-essential="' + d.essential + '"]'});
  } else if(d.cluster !== undefined){
    let val = e.target.value;
    if(val === '__new'){ val = (prompt('New cluster name') || '').trim(); if(!val){ render(); return; } }
    mutate(() => { const en = entry(d.cluster); if(en) en.cluster = val || null; },
      {focus: '[data-cluster="' + d.cluster + '"]'});
  } else if(d.merge !== undefined && e.target.value){
    const dst = e.target.value;   // the src row (d.merge) is gone after the merge — land on the survivor
    mutate(() => { doc.entries = mergeEntries(doc.entries, d.merge, dst); },
      {focus: '[data-cluster="' + dst + '"]'});
  }
});
$('phasepanel').addEventListener('click', e => {
  const t = e.target, d = t.dataset;
  if(t.dataset.tag){
    mutate(() => { const en = entry(d.id); if(en) en.tag = en.tag === d.tag ? null : d.tag; },
      {focus: '[data-tag="' + d.tag + '"][data-id="' + d.id + '"]'});
  }
  else if(d.del){
    const label = entry(d.del)?.text || (modeOf(doc) === 'success' ? 'Opportunity' : 'Risk');
    mutate(() => { doc.entries = doc.entries.filter(x => x.id !== d.del); },
      {focus: '[data-add="entry"]', announce: label + ' deleted.'});
  }
  else if(d.actadd){
    const idx = entry(d.actadd)?.actions.length ?? 0;   // where the pushed action will land
    mutate(() => { entry(d.actadd)?.actions.push({text: '', owner: '', done: false, votes: 0}); },
      {focus: '[data-action="text"][data-id="' + d.actadd + '"][data-ai="' + idx + '"]'});
  }
  else if(d.actdel){
    const label = entry(d.actdel)?.actions[+d.ai]?.text || 'Action';
    mutate(() => { const en = entry(d.actdel); if(en) en.actions.splice(+d.ai, 1); },
      {focus: '[data-actadd="' + d.actdel + '"]', announce: label + ' removed.'});
  }
  else if(d.vote){
    // needs the post-vote count for a truthful announce (castVote clamps at the pool),
    // which the mutate() paint-options shorthand can't see — so its steps are inlined here.
    const dir = +d.vote;
    snapshot();
    doc = castVote(doc, d.id, +d.ai, dir);
    saveNow();
    const votes = entry(d.id)?.actions[+d.ai]?.votes ?? 0;
    render({focus: '[data-vote="' + d.vote + '"][data-id="' + d.id + '"][data-ai="' + d.ai + '"]',
      announce: votes + (votes === 1 ? ' vote.' : ' votes.')});
  }
  else if(d.act === 'skiptimer'){
    if(timer){ clearInterval(timer); timer = 0; }
    mutate(() => { doc = advance(doc); }, {phaseFocus: true});
  }
  else if(d.act === 'copylink'){ copyLink(); }
  else if(d.act === 'copydoc'){ copyDoc(); }
  else if(d.act === 'reviewall'){ if(confirm('Mark every ' + (modeOf(doc) === 'success' ? 'opportunity' : 'risk') + ' reviewed today?')) mutate(() => {
    const now = new Date().toISOString(); doc.entries.forEach(en => { en.lastReviewed = now; }); },
    {focus: '[data-act="reviewall"]', announce: 'All ' + (modeOf(doc) === 'success' ? 'opportunities' : 'risks') + ' marked reviewed.'}); }
});
async function copyLink(){
  const link = await toLink(withoutHandoffMeta(doc));
  const url = location.origin + location.pathname + (link || '');
  if(!link){ alert('This register is too large for a link — use "Copy as markdown" instead.'); return; }
  try{ await navigator.clipboard.writeText(url); toast('Link copied'); }catch(e){ prompt('Copy this link:', url); }
}
async function copyDoc(){
  const md = markdown(doc, exposure(doc.entries.filter(isRisk)), new Date());
  try{ await navigator.clipboard.writeText(md); toast('Copied for a doc'); }catch(e){ prompt('Copy this:', md); }
}
function toast(msg){
  const b = $('phasepanel').querySelector('[data-act="copylink"]');
  if(!b) return; const was = b.textContent; b.textContent = msg; setTimeout(() => { b.textContent = was; }, 1500);
}

/* ---------- boot ---------- */
(async function boot(){
/* board re-renders wholesale, so the chip is delegated, not wired per paint */
$('boardpanel').addEventListener('click', e => {
  const b = e.target.closest && e.target.closest('.vcopy');
  if(!b) return;
  const blk = b.previousElementSibling;
  const line = ((blk && blk.querySelector('.vline')) ? blk.querySelector('.vline').textContent : '').trim();
  if(!line) return;
  const done = () => { b.textContent = 'Copied'; setTimeout(() => { b.textContent = 'Copy'; }, 1500); };
  if(navigator.clipboard && navigator.clipboard.writeText)
    navigator.clipboard.writeText(line).then(done, () => prompt('Copy this:', line));
  else prompt('Copy this:', line);
});
  // re-arm every pending tomb's own purge timer FIRST, unconditionally — the
  // imported-via-link path below returns early (it lands straight on the
  // imported doc, not the home screen), and used to skip this entirely,
  // leaving any pending tomb's timer never (re-)started for this page load.
  armAllPendingTombstones();
  if(location.hash.length > 1){
    const imported = await fromLink(location.hash);
    history.replaceState(null, '', location.pathname);
    if(imported){
      transientImport = true; doc = imported; reached = new Set([doc.phase || 'REGISTER']);
      if(!doc.phase) doc.phase = 'REGISTER';
      render(); return;
    }
  }
  const list = store.list();
  if(list.length || pendingDeletion){ doc = null; render(); }
  else { doc = exampleDoc(); saveNow(); render(); }   // greet with a populated register, not a blank form
})();
