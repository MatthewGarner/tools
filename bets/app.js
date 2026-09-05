/* State, refresh loop, saved portfolios, exports, boot, snapshot compare
   (2026-07-12 — the deferred Task 5b): an editor -> board -> exports loop
   with edit-in-place + the coarse-pointer card menu. */
import {parse} from './parse.js';
import {simulate, markdown} from './engine.js';
import {renderBoard} from './render.js';
import {renderQuadrant} from './render-quadrant.js';
import {renderBetsPresentation} from './render-presentation.js';
import {betsDiff, betsDiffView, comparisonSafety} from './diff.js';
import {createEditor} from './editor.js';
import {kinds, rewriteStake, rewriteOdds, rewritePayoff, rewriteKill,
  renameBet, removeBet, addBetLine, addGroupLine,
  addedBetTarget, addedGroupTarget, addedKillTarget} from './edit-targets.js';
import {readHashState, writeHashState} from '../assets/series.js';
import {measure, isDark, themeColors, onThemeChange, renderWarningList, slugify, exampleChips} from '../assets/app-common.js';
import {wireExports} from '../assets/exports.js';
import {debounced, rafBatched} from '../assets/schedule.js';
import {initWorkspace, setActionsEnabled, mountTouchUndo} from '../assets/workspace.js';
import {mountMotion} from "../assets/motion.js";
import {REVEAL} from "./motion-spec.js";
import {attachEditInPlace} from '../assets/edit-in-place.js';
import {applyLineOps} from '../assets/editor-common.js';
import {narrowWidth, watchNarrowBucket} from '../assets/narrow-width.js';
import {autoloadExample, shouldPersist} from '../assets/mobile.js';
import {loadSaved, storeSaved, renderSavedChips} from '../assets/saved-items.js';
import {snapStore, wireSnapshots} from '../assets/snapshots.js';
import {paintKicker, paintMetrics, paintVerdict, wireCopyVerdict} from '../assets/verdict.js';
import {STARTER} from './starter.js';

const $ = id => document.getElementById(id);
const paint = mountMotion($("preview"));

/* ---------- examples ---------- */
const EXAMPLES = [
  {name: 'Lantern portfolio', src:
`title: Lantern — Q3 bet portfolio
unit: £k

Growth bets
  Referral flow v2: stake 80, odds 40-60%, payoff 300-500
    kill: Signups per referral stay under 0.3 by 2026-09-15
  Paid acquisition push: stake 220, odds 15-25%, payoff 150-300
    kill: CAC exceeds £40 for two consecutive months

Platform bets
  Sync engine rewrite: stake 150, odds 90-98%, payoff 180-260
  Publisher storefront pilot: stake 60, odds 15-25%, payoff 250-450
    kill: Fewer than 20 publishers onboarded by 2026-10-01
  E-reader sync: stake 60, odds 30-40%, payoff 150-280
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
let view = 'board';   // 'board' | 'quadrant'; persisted with the source URL state
let flipMode;         // 'none' to suppress the quadrant FLIP on a resize/view-flip re-render
const hasBets = m => !!m && m.groups.some(g => g.bets.length);
const nBets = m => m.groups.reduce((t, g) => t + g.bets.length, 0);
const isCoarsePointer = () => !!(window.matchMedia && window.matchMedia('(pointer: coarse)').matches);
/* Keep snapshot simulation memoised without putting state in renderers. */
const prevSimCache = new WeakMap();
function currentCompare(){
  const cur = snaps && snaps.current();
  if(!cur || !hasBets(model)) return null;
  if(!comparisonSafety(cur.model, model).safe) return null;
  if(!prevSimCache.has(cur.model)) prevSimCache.set(cur.model, simulate(cur.model));
  const diffView = betsDiffView(betsDiff(cur.model, model), cur.label);
  return {...diffView, prevSim: prevSimCache.get(cur.model), previousUnit: cur.model.unit};
}
function findBet(m, srcLine){
  if(!m) return null;
  for(const g of m.groups) for(const b of g.bets) if(b.srcLine === srcLine) return b;
  return null;
}
/* Comparison is a live Board lens only; exported SVGs stay current-only. */
function activeRender(intent = 'live'){
  const c = {colors: themeColors(), measure, intent, dark: isDark()};
  if(intent === 'live'){
    c.width = narrowWidth($('preview')); c.edit = true;
    c.coarse = isCoarsePointer();
  }
  if(intent === 'live' && view === 'board'){
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
    lastSvg = ''; paint.reset();
    pv.innerHTML = '<p class="placeholder">' + (text.trim()
      ? 'No bets yet — add one under a group heading, e.g. “Search revamp: stake 120, odds 30-50%, payoff 400-900”.'
      : 'Start typing — or load an example.') + '</p>';
    paintVerdict($('verdict'), '', '');
    paintMetrics($('metrics'), '', []);
  } else {
    sim = simulate(model);
    const svg = activeRender('live');
    // quadrant dots glide to new positions as you tune a bet (data-key=bet name);
    // board view has no data-key marks so FLIP is a no-op there.
    paint(svg, REVEAL, {flipAttr: 'data-key', scale: ws.scale, onSwap: ws.applyZoom, mode: flipMode});
    lastSvg = svg; flipMode = undefined;
    paintVerdict($('verdict'), '', '');
    // The board owns the portfolio reading; avoid a second summary above it.
    paintMetrics($('metrics'), '', []);
  }
  const warnings = model.warnings.slice();
  const selectedSnapshot = snaps && snaps.current();
  if(selectedSnapshot){
    const safety = comparisonSafety(selectedSnapshot.model, model);
    if(!safety.safe) warnings.push({line: safety.line, msg: safety.warning});
  }
  renderWarningList($('warns'), warnings);
  setActionsEnabled(!!lastSvg);
  try{ if(shouldPersist()) localStorage.setItem('bets-src', text); }catch(e){}
  clearTimeout(hashTimer);
  // Suppressed autoload never gets a deferred URL write.
  if(shouldPersist()) hashTimer = setTimeout(writeHash, 400);
}
const refresh = rafBatched(doRefresh);
const editor = createEditor({
  parent: $('cmhost'),
  doc: '',
  onChange: debounced(refresh, 120),
});
mountTouchUndo(document.querySelector('.stage .actions'), editor);   // phones have no ⌘Z (Rule 2)
function writeHash(){
  const state = {t: editor.getText()};
  if(view !== 'board') state.v = view;
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
  onChange(){ flipMode = 'none'; lastSvg = ''; paint.reset(); refresh(); },
});
const ws = initWorkspace({
  workspace: $('workspace'), tab: $('railtab'),
  preview: $('preview'), zoomHost: $('zoomctl'),
  /* Reader is a temporary presentation state. Returning to source is an editing
     action, so place the caret back in the actual CodeMirror surface. */
  focusEditor: () => editor.view.focus(),
  onCollapseChange(){ clearTimeout(hashTimer); hashTimer = setTimeout(writeHash, 100); },
});

/* narrow-bucket resize: re-render only when the bucket actually flips —
   activeRender() re-measures clientWidth itself, this just knows WHEN to */
watchNarrowBucket($('preview'), () => { flipMode = 'none'; lastSvg = ''; paint.reset(); refresh(); });   // resize → new layout, don't glide

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
  flipMode = 'none'; lastSvg = ''; paint.reset();   // board<->quadrant: different layout, no glide
  refresh();
});

/* Source-line rewrites; coarse rows resolve through their full-row menu. */
function openOrAddKill(lineNo, origin){
  const bet = findBet(model, lineNo);
  if(!bet) return;
  if(bet.kill){
    const raw = bet.kill.text + (bet.kill.by ? ' by ' + bet.kill.by : '');
    const coarse = isCoarsePointer();
    eip.openAt(coarse ? {kind: 'cardmenu', line: lineNo} : {kind: 'kill', line: bet.kill.srcLine, data: {raw}},
      {origin, ...(coarse ? {openAs: {kind: 'kill', raw}} : {})});
    return;
  }
  const idx = lineNo - 1;   // 0-based index of the bet's own line
  const lines = editor.getText().split(/\r?\n/);
  const betLine = lines[idx] || '';
  const indent = (betLine.match(/^ */) || [''])[0].length;
  const killIndent = ' '.repeat(indent + 2);
  editor.insertLinesAfter(idx, [killIndent + 'kill: reason']);
  const addedText = editor.getText();   // onCancel only rolls back if nothing else changed since
  const coarse = isCoarsePointer();
  const target = coarse ? {kind: 'cardmenu', line: lineNo} : addedKillTarget(lineNo);
  // undo() (not a forward removeLine) pops the insert's own isolated group —
  // Escape leaves no extra "remove" entry for a stray Ctrl+Z to resurrect.
  const cancel = () => { if(editor.getText() === addedText) editor.undo(); };
  /* Default-insert is deliberately different from bet/group pre-entry: the
     fresh kill line must exist before it has a rendered field. Escape removes
     that exact untouched default; a missed target rolls it back and returns
     focus to the still-existing bet card instead of ever falling into CM. */
  eip.openAt(target, {
    origin,
    ...(coarse ? {openAs: {kind: 'kill', raw: 'reason'}} : {}),
    onCancel: cancel,
    onMiss(){
      cancel();
      eip.focusAt({kind: 'cardmenu', line: lineNo});
    },
  });
}
/* the per-bet card menu, built fresh from the current model (same idiom as
   timeline's milestoneMenu): Rename + the three value rows route to sibling
   targets on the same data-line; kill (dynamic label) and Remove are actions. */
function betMenu(m, srcLine){
  const bet = findBet(m, srcLine);
  return [
    {label: 'Rename…', opens: 'name'},
    {label: 'Edit stake…', opens: 'stake'},
    {label: 'Edit odds…', opens: 'odds'},
    {label: 'Edit payoff…', opens: 'payoff'},
    {label: (bet && bet.kill) ? 'Edit kill criterion…' : 'Add kill criterion…', action: true},
    {label: 'Remove bet', action: true, danger: true},
  ];
}
const REWRITE = {stake: rewriteStake, odds: rewriteOdds, payoff: rewritePayoff, kill: rewriteKill, name: renameBet};
const eip = attachEditInPlace($('preview'), {
  kinds: {
    ...kinds,
    cardmenu: {menu: el => betMenu(model, +el.dataset.line)},
  },
  onCommit(kind, lineNo, oldRaw, newValue, el){
    if(kind === 'cardmenu'){
      if(newValue === '✖Edit kill criterion…' || newValue === '✖Add kill criterion…') openOrAddKill(lineNo, el);
      else if(newValue === '✖Remove bet'){
        const ops = removeBet(editor.getText(), lineNo);
        if(ops) applyLineOps(editor, ops);
      }
      return;
    }
    if(kind === 'addbet' || kind === 'addgroup'){
      const r = kind === 'addbet' ? addBetLine(editor.getText(), lineNo) : addGroupLine(editor.getText());
      if(!r) return;
      const typed = newValue.replace(/^✖/, '').trim();
      const placeholder = kind === 'addbet' ? 'New bet' : 'New group';
      const name = typed || placeholder;
      editor.insertLinesAfter(r.afterLine, [typed ? r.newLine.replace(placeholder, typed) : r.newLine]);
      /* Coarse Board editing is deliberately menu-first. A newly inserted
         bet therefore returns focus to its one 44px row control; a fine
         pointer still lands on the exact rename field for immediate typing. */
      const target = kind === 'addbet'
        ? (isCoarsePointer() ? {kind: 'cardmenu', line: r.afterLine + 2} : addedBetTarget(r, name))
        : addedGroupTarget(r);
      eip.focusAt(target, {origin: el});
      return;
    }
    const rewrite = REWRITE[kind];
    if(!rewrite) return;
    /* A coarse card menu carries a Bet line, while kill is authored on its
       child. Resolve that factual child only at the rewrite boundary. */
    const kill = kind === 'kill' && el?.dataset.edit === 'cardmenu' && findBet(model, lineNo)?.kill;
    if(kind === 'kill' && el?.dataset.edit === 'cardmenu' && !kill) return;
    const ops = rewrite(editor.getText(), kill ? kill.srcLine : lineNo,
      kill ? kill.text + (kill.by ? ' by ' + kill.by : '') : oldRaw, newValue);
    if(ops) applyLineOps(editor, ops);
  },
});

/* ---------- example chips ---------- */
exampleChips($('chips'), EXAMPLES, ex => editor.setText(ex.src), {start: {src: STARTER}});

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
function nativeSvgString(){
  return (hasBets(model) && sim) ? activeRender('native') : null;
}
function presentationSvgString(){
  if(!hasBets(model) || !sim) return null;
  const svg = renderBetsPresentation(model, sim, {colors: themeColors(), measure, intent: 'presentation'});
  /* A refusal is deliberate Copy-PNG unavailability, never a rasterised
     apology. The exhaustive native SVG remains the truthful handoff. */
  return /data-bets-(?:title|density)-refusal=""/.test(svg) ? null : svg;
}
function slug(){
  return slugify(model && model.title, 'bets');
}
wireExports({
  buttons: {dlsvg: $('dlsvg'), dlpng: $('dlpng'), copypng: $('copypng'), copymd: $('copymd')},
  getSvg: nativeSvgString,
  getCopy: presentationSvgString,
  getMarkdown: () => (hasBets(model) && sim)
    ? markdown(model, sim, location.href, {comparison: currentCompare()})
    : null,
  slug,
});

/* ---------- theme ---------- */
onThemeChange(() => { lastSvg = ''; paint.reset(); refresh(); });

/* ---------- boot: hash > localStorage > example ---------- */
paintKicker($('kicker'), '03', 'Initiatives priced as wagers');
wireCopyVerdict($('verdict'));
(async function(){
  const hash = await readHashState();
  let text = hash && typeof hash.t === 'string' ? hash.t : '';
  if(hash && (hash.v === 'board' || hash.v === 'quadrant')) view = hash.v;
  if(hash && hash.e === 0) ws.setCollapsed(true);
  if(!text){
    try{ text = localStorage.getItem('bets-src') || ''; }catch(e){}
  }
  renderSaved();
  syncViewToggle();
  if(text) editor.setText(text);
  else if(!autoloadExample(() => editor.setText(EXAMPLES[0].src))) refresh();
})();

/* try-it specimens: the syntax reference inserts into the editor (2026-08-02) */
import {wireSyntaxTry} from '../assets/syntax-try.js';
wireSyntaxTry(document.querySelector('details.syntax'), editor, ['title', 'unit']);
