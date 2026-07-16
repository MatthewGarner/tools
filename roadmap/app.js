/* State, refresh loop, snapshots, saved roadmaps, import, exports, drag, boot. */
import {onThemeChange, renderWarningList, measure, isDark, themeColors, slugify, exampleChips} from '../assets/app-common.js';
import {wireExports} from '../assets/exports.js';
import {renderDeck, effectiveStyle} from './render-deck.js';
import {renderRegisterLive} from './render-register.js';
import {renderBoardLive} from './render-board.js';
import {renderFocusLive, focusHeroIndex} from './render-focus.js';
import {loadSaved, storeSaved, renderSavedChips} from '../assets/saved-items.js';
import {debounced, rafBatched} from '../assets/schedule.js';
import {narrowWidth, watchNarrowBucket} from '../assets/narrow-width.js';
import {parse, STATUS_LABEL, wipBreaches} from './parse.js';
import {snapStore, diffItems, wireSnapshots} from '../assets/snapshots.js';
import {render} from './render.js';
import {createEditor} from './editor.js';
import {moveItem} from './edit.js';
import {readHashState, writeHashState} from '../assets/series.js';
import {autoloadExample, shouldPersist} from '../assets/mobile.js';
import {initWorkspace, setActionsEnabled, mountTouchUndo} from '../assets/workspace.js';
import {mountMotion} from "../assets/motion.js";
import {REVEAL} from "./motion-spec.js";
import {attachEditInPlace} from '../assets/edit-in-place.js';
import {validators as eipValidators, applies as eipApplies, STATUSES as EDIT_STATUSES, addItemLine, removeItemLine, moveHorizon, setStyle, setHeadline, setFocus, setSpan, setSpanStart, setLane, addNote, addStatus, ensureHorizonHeader, CONFIG_KEYS} from './edit-targets.js';

const $ = id => document.getElementById(id);
const paint = mountMotion($("preview"));

/* ---------- examples ---------- */
const EXAMPLES = [
  {name:'Habit app roadmap', src:
`title: Habitat — Product Roadmap
headline: Retention first — everything in Now defends the streak
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
wip: 3

Q3 2026
Infra: Sync engine rewrite [doing] x2
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

/* ---------- snapshots + diff (shared core in assets/snapshots.js) ---------- */
let snaps = null;   // wired below, after the editor exists
const flatHorizon = m => m.items.map(it => ({title: it.title, state: String(m.horizons[it.h] ?? '?')}));
function makeDiff(model){
  const cur = snaps && snaps.current();
  if(!cur) return null;
  const d = diffItems(flatHorizon(cur.model), flatHorizon(model),
    {key: e => e.title, state: e => e.state});
  const added = new Set(d.added.map(e => diffItems.norm(e.title)));
  const badge = it => {
    const k = diffItems.norm(it.title);
    if(added.has(k)) return {kind: 'new', label: 'New'};
    const mv = d.moved.get(k);
    return mv ? {kind: 'moved', label: 'was ' + mv.from} : null;
  };
  return {badge, dropped: d.dropped.map(e => e.title), since: cur.label, any: d.any};
}

/* ---------- refresh loop ---------- */
let model = null, lastSvg = '', hashTimer = null;
let flipNext = false;   // set on a drop so the next render FLIP-glides cards (shared FLIP)
const previewEl = $('preview');
function renderWidth(){ return narrowWidth(previewEl); }
function renderWarnings(m){
  const warns = $('warns');
  warns.textContent = '';
  const breaches = wipBreaches(m);
  for(const breach of breaches) m.warnings.push(breach);
  if(breaches.length) m.warnings.push('(Raise or silence with wip: N / wip: off.)');
  renderWarningList(warns, m.warnings);
}
/* export-style picker: active chip reflects the RESOLVED (export) style via
   effectiveStyle — a quarterly doc with no style: line shows Grid active, not
   none. DELIBERATE SEAM (2026-07-15, Matt's call): on a plain now/next/later doc
   effectiveStyle resolves to 'board', so the Board chip lights even though the
   live PREVIEW is the chart (live compositions render only on an EXPLICIT
   model.style — see doRefresh). The chip is honest about what Deck PNG exports;
   clicking it writes style:board and opts the preview into the live board. */
function syncStylePicker(m){
  const active = effectiveStyle(m);
  for(const b of $('stylepicker').querySelectorAll('[data-style]')){
    const on = b.dataset.style === active;
    b.classList.toggle('on', on);
    b.setAttribute('aria-pressed', String(on));   // a SR user hears which style will export
  }
}
/* The headline field mirrors the doc's `headline:` line. Not while the author is
   typing IN it — a round-trip through parse would fight their cursor — so it
   syncs only when it isn't focused. */
function syncHeadline(m){
  const el = $('headline');
  if(document.activeElement !== el && el.value !== m.headline) el.value = m.headline;
}
function writeHash(){
  const state = {t: editor.getText()};
  if(ws.collapsed()) state.e = 0;
  if(shouldPersist()) writeHashState(state);
}
const todayISO = () => new Date().toISOString().slice(0, 10);
function doRefresh(){
  const text = editor.getText();
  model = parse(text);
  editor.setHorizons(model.horizons);
  renderWarnings(model);
  syncStylePicker(model);
  syncHeadline(model);
  const pv = $('preview');
  if(!model.items.length){
    lastSvg = ''; paint.reset();
    pv.innerHTML = '<p class="placeholder">' + (text.trim()
      ? 'No items yet — add lines under a NOW / NEXT / LATER header.'
      : 'Start typing — or load an example.') + '</p>';
  } else {
    const w = renderWidth();                       // number only <520, else undefined
    const narrow = !!w && w < 520;
    /* a live composition previews only when its style is EXPLICITLY set. A plain
       now/next/later doc resolves to effectiveStyle 'board' for EXPORT, but its
       live preview stays the chart — the classic working surface — and board-live
       appears only when the author (or the picker) writes style:board. inBandView
       below must stay in lockstep with these arms. */
    const liveCtx = {colors: themeColors(), measure, diff: makeDiff(model), dark: isDark(), edit: true, today: todayISO()};
    const svg = narrow ? render(model, {...liveCtx, width: w})
      : model.style === 'register' ? renderRegisterLive(model, liveCtx)
      : model.style === 'board' ? renderBoardLive(model, liveCtx)
      : model.style === 'focus' ? renderFocusLive(model, liveCtx)
      : render(model, {...liveCtx, width: w});
    if(svg !== lastSvg){
      // drop-reorder / date edits glide cards to their new home (shared FLIP,
      // keyed data-key=title, zoom-scale-aware). Gated to drops via flipNext.
      paint(svg, REVEAL, {flipAttr: flipNext ? 'data-key' : undefined, scale: ws.scale, onSwap: ws.applyZoom});
      lastSvg = svg;
      flipNext = false;
    }
  }
  setActionsEnabled(!!lastSvg);
  try{ if(shouldPersist()) localStorage.setItem('roadmap-src', text); }catch(e){}
  clearTimeout(hashTimer);
  hashTimer = setTimeout(writeHash, 400);
}
const refresh = rafBatched(doRefresh);

const editor = createEditor({
  parent: $('cmhost'),
  doc: '',
  onChange: debounced(refresh, 120),
});
mountTouchUndo(document.querySelector('.stage .actions'), editor);   // phones have no ⌘Z (Rule 2)
const ws = initWorkspace({
  workspace: $('workspace'), tab: $('railtab'),
  preview: $('preview'), zoomHost: $('zoomctl'),
  onCollapseChange(){ clearTimeout(hashTimer); hashTimer = setTimeout(writeHash, 100); },
});

/* Card menu rows: the static base plus a dynamic "Move to…" submenu listing
   the model's horizons (current one marked `on`) — the phone-friendly
   replacement for dragging a card to another column. Resolved fresh from the
   current model each time the menu opens (same idiom as why's solutionMenu),
   keyed off the clicked card's own srcLine. */
function itemMenu(m, srcLine){
  const item = m && m.items.find(i => i.srcLine === srcLine);
  const moveRows = item ? m.horizons.map(h => ({
    label: h, on: m.horizons[item.h] === h,
    commit: {kind: 'movehorizon', line: srcLine, oldRaw: m.horizons[item.h], value: h},
  })) : [];
  /* the coarse-pointer half of the edge drag: pick the column this item runs UNTIL.
     Same submenu machinery as "Move to…" — no new interaction to learn or maintain.
     Only on-board ends are offerable; an off-board span (x6 on a 4-column board) can
     be shortened here but not lengthened past the board — that needs the DSL. Only on
     a time axis, and only when there is more than one column to choose from: on a
     now/next/later doc (m.timeAxis is false) the row must not appear at all. */
  /* An item that runs PAST the board has no row to mark: its true end is not on this
     list. Marking the last visible column `on` would be a lie — and, because an `on`
     row is still clickable, tapping the row the menu itself calls "current" would
     commit that column as the end and silently shorten the work (x6 -> x4 on a
     4-column board). So off-board items get no mark, and every row is a real change.
     Uses the PAINTED span for the mark, which is only ever the true end when the item
     fits the board. */
  const untilRows = (item && m.timeAxis)
    ? m.horizons.slice(item.h).map((hName, k) => ({
        label: hName,
        on: !item.spanEnd && k === Math.max(1, item.span || 1) - 1,
        commit: {kind: 'setspan', line: srcLine, oldRaw: '', value: String(k + 1)},
      }))
    : [];
  /* Focus hero vs rail (Matt's "clean rail + Status submenu" call, Task 5): the
     HERO card carries the full set of inline edit targets (title/note/status/lane,
     paintFocusHeroCard), same as a register/board card. The RAIL row is a clean
     ranked index (paintFocusRailRow) — title only, no inline status/lane/note
     targets — so a rail item's "Status…" can't `opens:'status'` (there is no
     target to find) and Lane…/Edit note… rows would be permanently dead. Instead
     the rail gets a Status… SUBMENU of the four statuses that commits directly,
     the same commit-row machinery the card-menu programme already ships (e.g.
     "Move to…" below). Clearing a rail item's status is out of scope for v1 —
     promote it to the hero, whose inline status editor clears. */
  const focusRail = m && m.style === 'focus' && item && item.h !== focusHeroIndex(m);
  const statusRow = focusRail
    ? {label: 'Status…', submenu: EDIT_STATUSES.map(st => ({
        label: STATUS_LABEL[st] || st, on: item && item.status === st,
        commit: {kind: 'status', line: srcLine, oldRaw: (item && item.status) || '', value: st},
      }))}                                          // rail: a submenu, no inline target
    : {label: 'Status…', opens: 'status'};          // hero/register/board: the inline target
  const rows = focusRail
    ? [{label: 'Rename…', opens: 'title'}, statusRow]                                     // clean rail
    : [{label: 'Rename…', opens: 'title'}, {label: 'Edit note…', opens: 'note'}, statusRow];
  /* Register + board + focus-HERO only: the lane cell/tag (data-edit="lane") is
     reachable by a direct tap on a fine pointer, but coarse pointers (iPad ≥520px)
     reroute every in-card field tap to this menu instead — without a row here, the
     lane field would be unreachable on those devices. The chart carries no
     data-edit="lane" target at all (no lane column), so an `opens` row there would
     resolve to nothing — same reason the rail (no lane target either) is excluded. */
  if(m && (m.style === 'register' || m.style === 'board' || (m.style === 'focus' && !focusRail)))
    rows.push({label: 'Lane…', opens: 'lane'});
  rows.push({label: 'Move to…', submenu: moveRows});
  if(untilRows.length > 1) rows.push({label: 'Runs until…', submenu: untilRows});
  rows.push({label: 'Remove item', action: true, danger: true});
  return rows;
}

attachEditInPlace($('preview'), {
  kinds: {
    title: {validate: eipValidators.title},
    note: {validate: eipValidators.note},
    status: {options: EDIT_STATUSES},
    lane: {validate: (v) => { const s = v.trim(); return !CONFIG_KEYS.test(s) && !/[\n[\]]/.test(v) && !s.startsWith('//') && !v.includes(': '); }},
    additem: {validate: eipValidators.title},
    cardmenu: {menu: (el) => itemMenu(model, +el.dataset.line)},
  },
  onCommit(kind, lineNo, oldRaw, newValue, el){
    if(kind === 'additem'){
      let text = editor.getText();
      /* register + board + focus only: their horizon groups are synthesised even
         when the source has no header line for them (the common default Now/Next/
         Later case where only NOW is ever written) — addItemLine can't find a line
         to anchor after, and misfiles the new item into whatever section happens to
         sit last in the file. Give the target horizon a real header first;
         ensureHorizonHeader is a no-op when the line already exists, and appending
         at the end never shifts any other item's srcLine. */
      if(model && (model.style === 'register' || model.style === 'board' || model.style === 'focus')){
        const hIdx = model.horizons.findIndex(h => h.toLowerCase() === String(el.dataset.col).toLowerCase());
        if(hIdx >= 0) text = ensureHorizonHeader(text, model, hIdx);
      }
      const {afterLine} = addItemLine(text, el.dataset.lane || null, el.dataset.col);
      const lane = el.dataset.lane;
      const lines = text.split(/\r?\n/);
      lines.splice(afterLine + 1, 0, lane ? lane + ': ' + newValue : newValue);
      editor.setText(lines.join('\n'));   // one transaction → one undo step, even when a header was inserted too
      return;
    }
    if(kind === 'movehorizon'){
      const text = moveHorizon(editor.getText(), lineNo, newValue);
      if(text) editor.setText(text);   // one transaction → one undo step, same as drag
      return;
    }
    if(kind === 'setspan'){
      /* picking the end an item already has is not an edit — committing it anyway
         would push an empty transaction onto the undo stack */
      const cur = editor.getText(), next = setSpan(cur, lineNo, +newValue);
      if(next !== cur) editor.setText(next);
      return;
    }
    if(newValue === '✖Remove item'){
      if(removeItemLine(editor.getText(), lineNo)) editor.removeLine(lineNo);
      return;
    }
    if(kind === 'lane'){
      const next = setLane(editor.getText(), lineNo, newValue);
      if(next !== editor.getText()) editor.setText(next);
      return;
    }
    if(kind === 'note' && !oldRaw){                 // adding a note where there was none
      const next = addNote(editor.getText(), lineNo, newValue);
      if(next !== editor.getText()) editor.setText(next);
      return;
    }
    if(kind === 'status' && !oldRaw){               // setting a status where there was none
      const next = addStatus(editor.getText(), lineNo, newValue);
      if(next !== editor.getText()) editor.setText(next);
      return;
    }
    const line = editor.getLine(lineNo);
    const newLine = eipApplies[kind](line, oldRaw, newValue);
    if(newLine !== line) editor.replaceLine(lineNo, newLine);
  },
});

/* ---------- example + import chips ---------- */
exampleChips($('chips'), EXAMPLES, ex => editor.setText(ex.src));
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
/* Download SVG/PNG = the current STYLE's plain, content-sized artefact (WYSIWYG),
   independent of the preview: on a phone the preview falls back to the chart stack
   but a register doc still exports the register table. Deck PNG / Copy PNG stay the
   16:9 deck (renderDeck already picks by style). */
function plainStyleSvg(){
  if(!model || !model.items.length) return null;
  const base = {colors: themeColors(), measure, diff: makeDiff(model), dark: isDark()};
  /* WYSIWYG: Download matches the PREVIEW — explicit style only, so a plain doc
     downloads the chart (not board-live), exactly as it renders. */
  if(model.style === 'register') return renderRegisterLive(model, {...base, today: todayISO()});   // edit omitted → edit:false, no markup
  if(model.style === 'board') return renderBoardLive(model, {...base, today: todayISO()});          // edit omitted → edit:false, no markup
  if(model.style === 'focus') return renderFocusLive(model, {...base, today: todayISO()});          // edit omitted → edit:false, no markup
  return render(model, base);                                                                        // plain / grid → the chart
}
/* dlslide and Copy PNG both go to the deck (render-deck.js) — a designed,
   16:9 export, not the raw chart scaled up. dlsvg/dlpng stay the plain style artefact. */
function deckSvgString(){
  if(!model || !model.items.length) return null;
  return renderDeck(model, {colors: themeColors(), measure, diff: makeDiff(model), dark: isDark(), today: todayISO()});
}
function slug(){
  return slugify(model.title, 'roadmap');
}
wireExports({
  buttons: {dlsvg: $('dlsvg'), dlpng: $('dlpng'), dlslide: $('dlslide'), copypng: $('copypng')},
  getSvg: () => plainStyleSvg(),
  getSvgSlide: () => deckSvgString(),
  getCopy: () => deckSvgString(),
  slug,
});
/* clicking a chip COMMITS style: as a text edit (one transaction, one undo
   step, URL-coherent) — the doc stays the only source of truth, the normal
   refresh loop re-syncs the active chip */
$('stylepicker').addEventListener('click', e => {
  const b = e.target.closest('[data-style]');
  // setText fires the editor's 120ms typing debounce; a chip is a single-shot edit,
  // so refresh() immediately (rafBatched → next frame) — the switch feels instant,
  // not ~150ms behind a bets-style toggle (audit 2026-07-16). The debounced pass
  // still fires and coalesces (same doc ⇒ memoised render, no flash).
  if(b){ editor.setText(setStyle(editor.getText(), b.dataset.style)); refresh(); }
});
/* the headline field is the same act as typing `headline:` — one debounced text
   edit into the doc, so it undoes, persists and travels in the URL like the rest.
   editor.setText replaces the WHOLE doc, so a commit still pending when the user
   clicks into the editor would remap their selection and teleport the cursor —
   and a commit still pending when they hit Download would export the old deck.
   Committing on blur closes both: whatever fires the debounce afterwards finds
   the text already correct and the guard below makes it a no-op. */
function commitHeadlineNow(){
  const cur = editor.getText();
  const next = setHeadline(cur, $('headline').value);
  if(next !== cur) editor.setText(next);
}
const commitHeadline = debounced(commitHeadlineNow, 400);
$('headline').addEventListener('input', commitHeadline);
$('headline').addEventListener('blur', commitHeadlineNow);
$('headline').addEventListener('keydown', e => { if(e.key === 'Enter') commitHeadlineNow(); });
/* copymd keeps its inline handler: label is 'Copy as markdown' / 'Copied', not
   wireExports' literal 'Copy for doc' revert — migrating would change the label. */
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

/* ---------- snapshot wiring (shared) ---------- */
snaps = wireSnapshots({
  store: snapStore('roadmap-snaps'),
  parse,
  getSrc: () => editor.getText(),
  makeLabel: () => new Date().toISOString().slice(0, 10) +
    (model && model.title ? ' \u2014 ' + model.title.slice(0, 30) : ''),
  els: {snap: $('snap'), sel: $('snapsel'), del: $('snapdel')},
  canSnap: () => model && model.items.length,
  onChange(){ lastSvg = ''; paint.reset(); refresh(); },
});

/* ---------- saved roadmaps ---------- */
const SAVED_KEY = 'roadmap-saved';
function renderSaved(){
  const row = $('savedrow');
  renderSavedChips(row, loadSaved(SAVED_KEY), {
    deleteLabel: m => 'Delete saved roadmap ' + m.name,
    onLoad: m => editor.setText(m.src),
    onDelete: (m, i) => {
      const l = loadSaved(SAVED_KEY); l.splice(i, 1); storeSaved(SAVED_KEY, l); renderSaved();
    },
  });
  const save = document.createElement('button');
  save.className = 'chip';
  save.textContent = '＋ Save current';
  save.addEventListener('click', () => {
    if(!model || !model.items.length) return;
    const list = loadSaved(SAVED_KEY);
    list.push({name: model.title ? model.title.slice(0, 28) : 'Roadmap ' + (list.length + 1), src: editor.getText()});
    storeSaved(SAVED_KEY, list);
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

/* ---------- drag-and-drop: a drop is a text edit ---------- */
let suppressClick = false;   // a completed drag must not open the card menu
const drag = {armed: null, active: false, ghost: null, hover: null, srcEl: null, dropline: null,
  edge: null, edgeChip: null};   // edge = the span edit gesture (left/right handle); its own mode
/* drag is a fine-pointer affordance only: on a coarse (touch) device it fights
   the narrow stack's vertical swipe-to-scroll (no auto-scroll, no drop-zone
   feedback that reads on a finger) — "Move to…" in the card menu is the phone
   path instead. Checked live (not cached) so a hybrid device's primary-pointer
   query stays current across the page's lifetime. */
const finePointer = () => matchMedia('(pointer: fine)').matches;
function cellAt(cx, cy){
  let cell = null, before = null;
  for(const el of document.elementsFromPoint(cx, cy)){
    if(before === null && el.matches && el.matches('#preview svg g[data-line]')){
      before = +el.dataset.line;
    }
    if(el.matches && el.matches('#preview svg rect[data-cell]')){ cell = el; break; }
  }
  if(!cell) return null;
  const [h, lane] = cell.dataset.cell.split('|');
  /* a spanning card paints over columns it does not START in, so the g[data-line]
     found here may belong to another cell entirely — moveItem trusts beforeLine
     blindly, and would misfile the drop into the span's start column */
  if(before !== null){
    const b = model && model.items.find(i => i.srcLine === before);
    if(!b || b.h !== +h || b.lane !== lane) before = null;
  }
  return {el: cell, h: +h, lane, beforeLine: before};
}
/* register: the drop target is a horizon BAND; the item keeps its own lane.
   The band is painted UNDER its rows (A2), so it's found by digging the
   elementsFromPoint stack — same idiom as cellAt, not "on top" like a normal
   hit target. */
function hbandAt(cx, cy){
  for(const el of document.elementsFromPoint(cx, cy))
    if(el.matches && el.matches('#preview svg rect[data-hdrop]')) return +el.dataset.hdrop;
  return null;
}
/* the horizon-band drag serves the live band-compositions (register + board +
   focus) and only when EXPLICITLY selected — a plain doc renders the chart, whose
   drag is the lane×horizon cell path (cellAt), not the band path. Lockstep with
   doRefresh (focus drags rail↔hero via its own data-hdrop bands, same mechanism). */
const inBandView = () => model && (model.style === 'register' || model.style === 'board' || model.style === 'focus');
function clearHover(){
  if(drag.hover){
    drag.hover.el.setAttribute('fill', 'transparent');
    drag.hover = null;
  }
  if(drag.dropline){ drag.dropline.remove(); drag.dropline = null; }
}
/* where the card would land: above the before-card, or under the cell's last card */
function positionDropline(cell, srcLine){
  const pv = $('preview');
  const pvRect = pv.getBoundingClientRect();
  let anchor = null, above = true;
  if(cell.beforeLine !== null && cell.beforeLine !== srcLine){
    anchor = pv.querySelector('g[data-line="' + cell.beforeLine + '"]');
  } else if(model){
    const cellLines = model.items
      .filter(i => i.h === cell.h && i.lane === cell.lane && i.srcLine !== srcLine)
      .map(i => i.srcLine);
    if(cellLines.length){
      anchor = pv.querySelector('g[data-line="' + Math.max(...cellLines) + '"]');
      above = false;
    }
  }
  const ref = anchor ? anchor.getBoundingClientRect() : cell.el.getBoundingClientRect();
  const yEdge = anchor ? (above ? ref.top - 5 : ref.bottom + 3) : ref.top + 6;
  const line = document.createElement('div');
  line.className = 'dropline';
  line.style.left = (ref.left - pvRect.left + pv.scrollLeft) + 'px';
  line.style.top = (yEdge - pvRect.top + pv.scrollTop) + 'px';
  line.style.width = ref.width + 'px';
  pv.appendChild(line);
  drag.dropline = line;
}
function endDrag(){
  clearHover();
  if(drag.ghost) drag.ghost.remove();
  if(drag.edgeChip) drag.edgeChip.remove();
  if(drag.srcEl) drag.srcEl.style.opacity = '';
  document.body.style.cursor = '';
  drag.armed = null; drag.active = false; drag.ghost = null; drag.srcEl = null;
  drag.edge = null; drag.edgeChip = null;   // a cancelled edge must not leave the mode armed
}
/* (FLIP glide migrated to the shared motion.js applyFlip — keyed data-key=title,
   zoom-scale-aware; triggered via flipNext on a drop, see doRefresh.) */
$('preview').addEventListener('pointerdown', e => {
  if(!finePointer()) return;   // coarse pointers use the card menu's Move to… / Runs until… rows
  if(e.button !== 0) return;
  /* a pointerup lost outside the window (drag off-screen, alt-tab mid-gesture) can
     leave a mode armed; starting a new gesture always begins from a clean slate */
  endDrag();
  /* the edge gesture, checked FIRST: the handle rects are siblings painted AFTER
     (never children of) the card's own <g>, so this can never be confused with
     the card-body drag below. No ghost, no dropline — an edge is not a card move. */
  const edgeEl = e.target.closest && e.target.closest('[data-span-edge]');
  if(edgeEl){
    e.preventDefault();
    drag.edge = {side: edgeEl.dataset.spanEdge, line: +edgeEl.dataset.line};
    document.body.style.cursor = 'col-resize';
    return;
  }
  const g = e.target.closest && e.target.closest('#preview svg g[data-line]');
  if(!g) return;
  const item = model && model.items.find(i => i.srcLine === +g.dataset.line);
  if(!item) return;
  e.preventDefault();   // no text selection while dragging
  drag.armed = {line: +g.dataset.line, title: item.title, x: e.clientX, y: e.clientY};
  drag.srcEl = g;
});
window.addEventListener('pointermove', e => {
  if(drag.edge){
    /* no re-render during the gesture — cards must not jump under the cursor.
       Highlight the target column band (the same hover mechanism the card drag
       uses) and float a live range chip; the edit commits once, on release, and
       the shipped FLIP glides the result into place afterwards. */
    clearHover();
    const cell = cellAt(e.clientX, e.clientY);
    const it = model && model.items.find(i => i.srcLine === drag.edge.line);
    if(cell){
      const accent = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim();
      cell.el.setAttribute('fill', /^#[0-9a-fA-F]{6}$/.test(accent) ? accent + '10' : 'transparent');
      drag.hover = cell;
    }
    if(!drag.edgeChip){
      const chip = document.createElement('div');
      chip.className = 'spanchip';
      document.body.appendChild(chip);
      drag.edgeChip = chip;
    }
    if(it && cell){
      const span = Math.max(1, cell.h - it.h + 1);
      drag.edgeChip.textContent = drag.edge.side === 'r'
        ? it.title + ' → ' + span + ' col' + (span === 1 ? '' : 's')
        : it.title + ' from ' + model.horizons[cell.h];
    }
    drag.edgeChip.style.left = (e.clientX + 12) + 'px';
    drag.edgeChip.style.top = (e.clientY + 14) + 'px';
    return;
  }
  if(!drag.armed) return;
  if(!drag.active){
    if(Math.hypot(e.clientX - drag.armed.x, e.clientY - drag.armed.y) < 4) return;
    drag.active = true;
    const ghost = document.createElement('div');
    ghost.className = 'dragghost';
    ghost.textContent = drag.armed.title;
    document.body.appendChild(ghost);
    drag.ghost = ghost;
    drag.srcEl.style.opacity = '0.3';
    document.body.style.cursor = 'grabbing';
  }
  drag.ghost.style.left = (e.clientX + 12) + 'px';
  drag.ghost.style.top = (e.clientY + 14) + 'px';
  clearHover();
  if(inBandView()){
    /* register/board: no drop-line (there's no lane/order to preview — the row
       keeps its own lane and lands at the end of the target horizon), just the
       band highlight. */
    const h = hbandAt(e.clientX, e.clientY);
    if(h !== null){
      const band = document.querySelector('#preview svg rect[data-hdrop="' + h + '"]');
      const accent = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim();
      band.setAttribute('fill', /^#[0-9a-fA-F]{6}$/.test(accent) ? accent + '10' : 'transparent');
      drag.hover = {el: band, h, lane: null};
    }
  } else {
    const cell = cellAt(e.clientX, e.clientY);
    if(cell){
      const accent = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim();
      cell.el.setAttribute('fill', /^#[0-9a-fA-F]{6}$/.test(accent) ? accent + '10' : 'transparent');
      drag.hover = cell;
      positionDropline(cell, drag.armed.line);
    }
  }
});
window.addEventListener('pointerup', e => {
  if(drag.edge){
    const edge = drag.edge;
    const cell = cellAt(e.clientX, e.clientY);
    endDrag();
    suppressClick = true;
    if(!cell || !model) return;
    const it = model.items.find(i => i.srcLine === edge.line);
    const targetH = cell ? cell.h : null;
    if(it && targetH !== null){
      const next = edge.side === 'r'
        ? setSpan(editor.getText(), it.srcLine, targetH - it.h + 1)   // setSpan clamps at 1
        : setSpanStart(editor.getText(), it.srcLine, targetH, model);
      if(next !== editor.getText()){ flipNext = true; editor.setText(next); }
    }
    return;
  }
  if(!drag.armed) return;
  const wasActive = drag.active;
  const src = drag.armed.line;
  const it = model && model.items.find(i => i.srcLine === src);
  let target = null;
  if(wasActive && inBandView() && it){
    const h = hbandAt(e.clientX, e.clientY);
    if(h !== null && h !== it.h) target = {h, lane: it.lane, beforeLine: null};   // keep the row's own lane
  } else if(wasActive){
    const cell = cellAt(e.clientX, e.clientY);
    if(cell) target = {h: cell.h, lane: cell.lane, beforeLine: cell.beforeLine === src ? null : cell.beforeLine};
  }
  endDrag();
  if(wasActive) suppressClick = true;
  if(!target || !model) return;
  if(inBandView()){
    /* the target horizon may have no header line yet (a synthesised empty
       group in the default Now/Next/Later doc) — moveItem needs one to
       anchor on; re-parse because the header may be new, but existing
       srcLines are unshifted (ensureHorizonHeader appends at the END), so
       `src` stays valid. */
    const t = ensureHorizonHeader(editor.getText(), model, target.h);
    const m2 = parse(t);
    const r = moveItem(t, m2, src, target);
    if(!r) return;
    flipNext = true;
    editor.setText(r.text);
    return;
  }
  const r = moveItem(editor.getText(), model, src, target);
  if(!r) return;
  flipNext = true;   // the post-drop re-render captures + glides cards into place (shared FLIP)
  editor.setText(r.text);   // one transaction → one undo step
});
window.addEventListener('keydown', e => {
  if(e.key === 'Escape' && (drag.armed || drag.edge)) endDrag();
});
/* the browser can claim the gesture mid-drag (scroll/gesture) → clean up the
   ghost + dropline instead of stranding them until the next pointerup */
window.addEventListener('pointercancel', () => { if(drag.armed || drag.edge) endDrag(); });
$('preview').addEventListener('click', e => {
  if(suppressClick){ e.stopPropagation(); suppressClick = false; }
}, true);

/* the focus lens: a rail header (data-lens="<horizon>") commits focus:<horizon> —
   a plain click, not edit-in-place, so it needs its own handler + keyboard mirror
   (eip's Enter/Space shell only fires for [data-edit], and the header carries
   neither [data-edit] nor sits inside a [data-menu] cardmenu group, so there is no
   collision with either). The capture-phase suppressClick handler above still
   guards a drag-ended click — it stops the event before it ever reaches this
   bubble-phase listener, same as it already does for edit-in-place. */
function commitLens(name){
  const cur = editor.getText(), next = setFocus(cur, name);
  if(next !== cur) editor.setText(next);   // guard: naming the current hero is a no-op
}
$('preview').addEventListener('click', e => {
  const lens = e.target.closest && e.target.closest('[data-lens]');
  if(lens){ e.preventDefault(); commitLens(lens.dataset.lens); }
}, false);
$('preview').addEventListener('keydown', e => {
  if(e.key !== 'Enter' && e.key !== ' ') return;
  const lens = e.target.closest && e.target.closest('[data-lens]');
  if(lens){ e.preventDefault(); commitLens(lens.dataset.lens); }
});

/* ---------- theme change → re-render ---------- */
function rerender(){ lastSvg = ''; paint.reset(); refresh(); }
onThemeChange(rerender);

/* ---------- narrow-bucket resize: re-render only when the bucket flips ---------- */
watchNarrowBucket(previewEl, rerender);

/* ---------- boot: hash > localStorage > empty ---------- */
(function(){
  let text = '';
  const state = readHashState();
  if(state && typeof state.t === 'string'){
    text = state.t;
    if(state.e === 0) ws.setCollapsed(true);
  } else if(location.hash && location.hash.length > 1){
    /* legacy links: hash is the raw base64 source text */
    try{ text = decodeURIComponent(escape(atob(location.hash.slice(1)))); }catch(e){}
  }
  if(!text){
    try{ text = localStorage.getItem('roadmap-src') || ''; }catch(e){}
  }
  snaps.refresh();
  renderSaved();
  if(text) editor.setText(text);
  else if(!autoloadExample(() => editor.setText(EXAMPLES[0].src))) refresh();
})();
