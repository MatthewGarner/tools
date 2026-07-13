/* State, refresh loop, saved portfolios, exports, boot, snapshot compare
   (2026-07-12 — the deferred Task 5b): an editor -> board -> exports loop
   with edit-in-place + the coarse-pointer card menu. */
import {parse} from './parse.js';
import {simulate, verdictCopy, markdown} from './engine.js';
import {renderBoard} from './render.js';
import {renderQuadrant} from './render-quadrant.js';
import {betsDiff, betsDiffView} from './diff.js';
import {createEditor} from './editor.js';
import {kinds, rewriteStake, rewriteOdds, rewritePayoff, rewriteKill} from './edit-targets.js';
import {readHashState, writeHashState} from '../assets/series.js';
import {measure, isDark, themeColors, onThemeChange, renderWarningList, slugify} from '../assets/app-common.js';
import {wireExports} from '../assets/exports.js';
import {posterSvg} from '../assets/poster.js';
import {debounced, rafBatched} from '../assets/schedule.js';
import {initWorkspace, setActionsEnabled} from '../assets/workspace.js';
import {attachEditInPlace} from '../assets/edit-in-place.js';
import {applyLineOps, insertAndSelect} from '../assets/editor-common.js';
import {narrowWidth, watchNarrowBucket} from '../assets/narrow-width.js';
import {autoloadExample, shouldPersist} from '../assets/mobile.js';
import {loadSaved, storeSaved, renderSavedChips} from '../assets/saved-items.js';
import {snapStore, wireSnapshots} from '../assets/snapshots.js';

const $ = id => document.getElementById(id);

/* ---------- examples ---------- */
const EXAMPLES = [
  {name: 'Habitat portfolio', src:
`title: Habitat — Q3 bet portfolio
unit: £k

Growth bets
  Referral flow v2: stake 80, odds 40-60%, payoff 300-500
    kill: Signups per referral stay under 0.3 by 2026-09-15
  Paid acquisition push: stake 220, odds 15-25%, payoff 150-300
    kill: CAC exceeds £40 for two consecutive months

Platform bets
  Sync engine rewrite: stake 150, odds 90-98%, payoff 180-260
  Coach marketplace pilot: stake 60, odds 15-25%, payoff 250-450
    kill: Fewer than 20 coaches onboarded by 2026-10-01
  Wearables integration: stake 60, odds 30-40%, payoff 150-280
    kill: No retail partner signed by 2026-11-01`},
  {name: 'Quick gut check', src:
`title: Quick gut check
unit: £k

Bets
  Ship the redesign: stake 60, odds 55-70%, payoff 150-260
    kill: Conversion drops for two weeks straight
  Delay to Q4: stake 15, odds 80-95%, payoff 20-40`},
];

/* ---------- refresh loop ---------- */
let model = null, sim = null, lastSvg = '', hashTimer = null;
let snaps = null;   // wired below, after the editor exists
let view = 'board';   // transient app state (not persisted): 'board' | 'quadrant'
const hasBets = m => !!m && m.groups.some(g => g.bets.length);
/* the snapshot's own 4,000-run simulate() is memoised per parsed snapshot
   model (wireSnapshots already caches the PARSE, keyed by idx|length|label,
   and returns the same model object while that snapshot stays selected) — a
   Monte Carlo pass is too costly to redo on every keystroke unmemoised, and
   render.js must stay a pure function of its own inputs (no resimulating
   there — see render.js's file header). */
const prevSimCache = new WeakMap();
function currentCompare(){
  const cur = snaps && snaps.current();
  if(!cur || !hasBets(model)) return null;
  if(!prevSimCache.has(cur.model)) prevSimCache.set(cur.model, simulate(cur.model));
  const diffView = betsDiffView(betsDiff(cur.model, model), cur.label);
  return {...diffView, prevSim: prevSimCache.get(cur.model)};
}
function findBet(m, srcLine){
  if(!m) return null;
  for(const g of m.groups) for(const b of g.bets) if(b.srcLine === srcLine) return b;
  return null;
}
function auditCounts(s){
  const counts = {kill: 0, certainty: 0, loses: 0};
  for(const rec of s.bets.values()){
    if(rec.audits.includes('NO KILL CRITERION')) counts.kill++;
    if(rec.audits.includes('ODDS IMPLY CERTAINTY')) counts.certainty++;
    if(rec.audits.includes('LOSES AT P50')) counts.loses++;
  }
  return counts;
}
/* width-aware: the live preview re-lays-out below 520px (narrowWidth's
   built-in threshold, shared by both views); exports always render the wide
   artefact by omitting width entirely. Compare is preview-only AND
   board-only — the quadrant is a portfolio-shape lens, not a diff, so it
   never receives ctx.compare even when a snapshot is selected; exports stay
   the plain view (board or quadrant) whatever snapshot is selected, so a
   shared/exported slide never carries stray "was …" annotations from the
   author's own review session. */
function activeRender(forExport){
  const c = {colors: themeColors(), measure};
  if(!forExport) c.width = narrowWidth($('preview'));
  if(!forExport && view === 'board'){
    const compare = currentCompare();
    if(compare) c.compare = compare;
  }
  return view === 'quadrant' ? renderQuadrant(model, sim, c) : renderBoard(model, sim, c);
}
function doRefresh(){
  const text = editor.getText();
  model = parse(text);
  const pv = $('preview');
  if(!hasBets(model)){
    sim = null;
    lastSvg = '';
    pv.innerHTML = '<p class="placeholder">' + (text.trim()
      ? 'No bets yet — add one under a group heading, e.g. “Search revamp: stake 120, odds 30-50%, payoff 400-900”.'
      : 'Start typing — or load an example.') + '</p>';
    $('verdict').textContent = '';
  } else {
    sim = simulate(model);
    const svg = activeRender(false);
    if(svg !== lastSvg){ pv.innerHTML = svg; lastSvg = svg; }
    $('verdict').textContent = verdictCopy(sim.portfolio, auditCounts(sim));
  }
  renderWarningList($('warns'), model.warnings);
  setActionsEnabled(!!lastSvg);
  try{ if(shouldPersist()) localStorage.setItem('bets-src', text); }catch(e){}
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
  const state = {t: editor.getText()};
  if(ws.collapsed()) state.e = 0;
  if(shouldPersist()) writeHashState(state);
}
snaps = wireSnapshots({
  store: snapStore('bets-snaps'),
  parse,
  getSrc: () => editor.getText(),
  makeLabel: () => new Date().toISOString().slice(0, 10) +
    (model && model.title ? ' — ' + model.title.slice(0, 30) : ''),
  els: {snap: $('snap'), sel: $('snapsel'), del: $('snapdel')},
  canSnap: () => hasBets(model),
  onChange(){ lastSvg = ''; refresh(); },
});
const ws = initWorkspace({
  workspace: $('workspace'), tab: $('railtab'),
  preview: $('preview'), zoomHost: $('zoomctl'),
  onCollapseChange(){ clearTimeout(hashTimer); hashTimer = setTimeout(writeHash, 100); },
});

/* narrow-bucket resize: re-render only when the bucket actually flips —
   activeRender() re-measures clientWidth itself, this just knows WHEN to */
watchNarrowBucket($('preview'), () => { lastSvg = ''; refresh(); });

/* ---------- view toggle: Board (the ledger) <-> Quadrant (the risk-return
   scatter, read-only). A button group, aria-pressed (not a tablist) — mirrors
   premortem's viewtoggle. Switching resets the memo so a view flip always
   repaints, even though the two renderers usually already disagree. */
function syncViewToggle(){
  for(const b of $('viewtoggle').querySelectorAll('[data-view]')){
    const on = b.dataset.view === view;
    b.classList.toggle('on', on);
    b.setAttribute('aria-pressed', String(on));
  }
}
$('viewtoggle').addEventListener('click', e => {
  const b = e.target.closest('[data-view]');
  if(!b || b.dataset.view === view) return;
  view = b.dataset.view;
  syncViewToggle();
  lastSvg = '';
  refresh();
});

/* ---------- edit-in-place: direct cells + the coarse-pointer card menu ----------
   stake/odds/payoff/kill are the imported plain-input kinds; `cardmenu` is
   this app's own addition — the per-row `data-menu` target render.js already
   emits opens a 4-row popover. Three rows (`opens: 'stake'|'odds'|'payoff'`)
   reuse attachEditInPlace's built-in "open a sibling field sharing this
   data-line" lookup for free, because those three cells share the ROW's own
   data-line (the bet's srcLine). The kill row can't use that trick: the kill
   CHILD line has its OWN srcLine (a few lines below the bet), so it's wired
   as a plain action — re-open the existing kill field via a synthetic click
   if one exists, else insert a fresh `kill:` child line under the bet. */
function openOrAddKill(lineNo){
  const bet = findBet(model, lineNo);
  if(!bet) return;
  if(bet.kill){
    const t = $('preview').querySelector('[data-line="' + bet.kill.srcLine + '"][data-edit="kill"]');
    if(t) t.dispatchEvent(new MouseEvent('click', {bubbles: true, cancelable: true}));
    return;
  }
  const idx = lineNo - 1;   // 0-based index of the bet's own line
  const lines = editor.getText().split(/\r?\n/);
  const betLine = lines[idx] || '';
  const indent = (betLine.match(/^ */) || [''])[0].length;
  const killIndent = ' '.repeat(indent + 2);
  insertAndSelect(editor, idx, killIndent + 'kill: reason', 'reason',
    {focus: matchMedia('(pointer: fine)').matches});
}
const REWRITE = {stake: rewriteStake, odds: rewriteOdds, payoff: rewritePayoff, kill: rewriteKill};
attachEditInPlace($('preview'), {
  kinds: {
    ...kinds,
    cardmenu: {menu: [
      {label: 'Edit stake…', opens: 'stake'},
      {label: 'Edit odds…', opens: 'odds'},
      {label: 'Edit payoff…', opens: 'payoff'},
      {label: 'Kill criterion…', action: true},
    ]},
  },
  onCommit(kind, lineNo, oldRaw, newValue){
    if(kind === 'cardmenu'){
      if(newValue === '✖Kill criterion…') openOrAddKill(lineNo);
      return;
    }
    const rewrite = REWRITE[kind];
    if(!rewrite) return;
    const ops = rewrite(editor.getText(), lineNo, oldRaw, newValue);
    if(ops) applyLineOps(editor, ops);
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

/* ---------- saved portfolios ---------- */
const SAVED_KEY = 'bets-saved';
function renderSaved(){
  const row = $('savedrow');
  renderSavedChips(row, loadSaved(SAVED_KEY), {
    deleteLabel: m => 'Delete saved portfolio ' + m.name,
    onLoad: m => editor.setText(m.src),
    onDelete: (m, i) => {
      const l = loadSaved(SAVED_KEY); l.splice(i, 1); storeSaved(SAVED_KEY, l); renderSaved();
    },
  });
  const save = document.createElement('button');
  save.className = 'chip';
  save.textContent = '＋ Save current';
  save.addEventListener('click', () => {
    if(!hasBets(model)) return;
    const list = loadSaved(SAVED_KEY);
    list.push({name: model.title ? model.title.slice(0, 28) : 'Portfolio ' + (list.length + 1), src: editor.getText()});
    storeSaved(SAVED_KEY, list);
    renderSaved();
  });
  row.appendChild(save);
}

/* ---------- exports (always the wide artefact, whatever the screen) ---------- */
function svgString(){
  return (hasBets(model) && sim) ? activeRender(true) : null;
}
const isoToday = () => new Date().toISOString().slice(0, 10);
function posterData(){
  const counts = auditCounts(sim);
  const p = sim.portfolio;
  const kills = counts.kill || 0;
  return {
    verdict: verdictCopy(p, counts),
    name: model.title || 'Bets board',
    metrics: [
      'net EV ' + (p.p50 >= 0 ? '+' : '') + Math.round(p.p50),
      'P(loses) ' + Math.round(p.pLoss * 100) + '%',
      kills ? kills + (kills === 1 ? ' bet unfoldable' : ' bets unfoldable') : null,
    ].filter(Boolean),
  };
}
function posterString(){
  if(!(hasBets(model) && sim)) return null;
  return posterSvg({chart: activeRender(true), ...posterData(), date: isoToday(),
    accent: themeColors().accent, colors: themeColors(), measure});
}
function slug(){
  return slugify(model && model.title, 'bets');
}
wireExports({
  buttons: {dlsvg: $('dlsvg'), dlpng: $('dlpng'), dlposter: $('dlposter'), copypng: $('copypng'), copymd: $('copymd')},
  /* SVG / PNG / Copy PNG = the clean wide board (deck-ready as-is); the Poster
     button wraps it in the shared poster frame (hero verdict + footer). */
  getSvg: svgString,
  getPoster: posterString,
  getMarkdown: () => (hasBets(model) && sim) ? markdown(model, sim, location.href) : null,
  slug,
});

/* ---------- theme ---------- */
onThemeChange(() => { lastSvg = ''; refresh(); });

/* ---------- boot: hash > localStorage > example ---------- */
(function(){
  const hash = readHashState();
  let text = hash && typeof hash.t === 'string' ? hash.t : '';
  if(hash && hash.e === 0) ws.setCollapsed(true);
  if(!text){
    try{ text = localStorage.getItem('bets-src') || ''; }catch(e){}
  }
  renderSaved();
  if(text) editor.setText(text);
  else if(!autoloadExample(() => editor.setText(EXAMPLES[0].src))) refresh();
})();
