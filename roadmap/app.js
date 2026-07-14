/* State, refresh loop, snapshots, saved roadmaps, import, exports, drag, boot. */
import {onThemeChange, renderWarningList, measure, isDark, themeColors, slugify, exampleChips} from '../assets/app-common.js';
import {wireExports} from '../assets/exports.js';
import {wipBreach, renderDeck, effectiveStyle} from './render-deck.js';
import {loadSaved, storeSaved, renderSavedChips} from '../assets/saved-items.js';
import {debounced, rafBatched} from '../assets/schedule.js';
import {narrowWidth, watchNarrowBucket} from '../assets/narrow-width.js';
import {parse, STATUS_LABEL} from './parse.js';
import {snapStore, diffItems, wireSnapshots} from '../assets/snapshots.js';
import {render} from './render.js';
import {createEditor} from './editor.js';
import {moveItem} from './edit.js';
import {readHashState, writeHashState} from '../assets/series.js';
import {autoloadExample, shouldPersist} from '../assets/mobile.js';
import {initWorkspace, setActionsEnabled} from '../assets/workspace.js';
import {mountMotion} from "../assets/motion.js";
import {REVEAL} from "./motion-spec.js";
import {attachEditInPlace} from '../assets/edit-in-place.js';
import {validators as eipValidators, applies as eipApplies, STATUSES as EDIT_STATUSES, addItemLine, removeItemLine, moveHorizon, setStyle} from './edit-targets.js';

const $ = id => document.getElementById(id);
const paint = mountMotion($("preview"));

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
  /* the breach sentence is shared with the deck's verdict (render-deck.js) so the
     editor warning and the exported standfirst can never drift apart */
  const breach = wipBreach(m);
  if(breach) m.warnings.push(breach + ' (Raise or silence with wip: N / wip: off.)');
  renderWarningList(warns, m.warnings);
}
/* export-style picker: active chip reflects the RESOLVED style (a quarterly
   doc with no style: line still shows Grid active, not none) */
function syncStylePicker(m){
  const active = effectiveStyle(m);
  for(const b of $('stylepicker').querySelectorAll('[data-style]')){
    const on = b.dataset.style === active;
    b.classList.toggle('on', on);
    b.setAttribute('aria-pressed', String(on));   // a SR user hears which style will export
  }
}
function writeHash(){
  const state = {t: editor.getText()};
  if(ws.collapsed()) state.e = 0;
  if(shouldPersist()) writeHashState(state);
}
function doRefresh(){
  const text = editor.getText();
  model = parse(text);
  editor.setHorizons(model.horizons);
  renderWarnings(model);
  syncStylePicker(model);
  const pv = $('preview');
  if(!model.items.length){
    lastSvg = ''; paint.reset();
    pv.innerHTML = '<p class="placeholder">' + (text.trim()
      ? 'No items yet — add lines under a NOW / NEXT / LATER header.'
      : 'Start typing — or load an example.') + '</p>';
  } else {
    const svg = render(model, {colors: themeColors(), measure, diff: makeDiff(model), dark: isDark(), edit: true, width: renderWidth()});
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
  return [
    {label: 'Rename…', opens: 'title'},
    {label: 'Edit note…', opens: 'note'},      // dead when the item has no note (accepted)
    {label: 'Status…', opens: 'status'},        // dead when the item has no status
    {label: 'Move to…', submenu: moveRows},
    {label: 'Remove item', action: true, danger: true},
  ];
}

attachEditInPlace($('preview'), {
  kinds: {
    title: {validate: eipValidators.title},
    note: {validate: eipValidators.note},
    status: {options: EDIT_STATUSES},
    additem: {validate: eipValidators.title},
    cardmenu: {menu: (el) => itemMenu(model, +el.dataset.line)},
  },
  onCommit(kind, lineNo, oldRaw, newValue, el){
    if(kind === 'additem'){
      const {afterLine} = addItemLine(editor.getText(), el.dataset.lane || null, el.dataset.col);
      const lane = el.dataset.lane;
      editor.insertLinesAfter(afterLine, [lane ? lane + ': ' + newValue : newValue]);
      return;
    }
    if(kind === 'movehorizon'){
      const text = moveHorizon(editor.getText(), lineNo, newValue);
      if(text) editor.setText(text);   // one transaction → one undo step, same as drag
      return;
    }
    if(newValue === '✖Remove item'){
      if(removeItemLine(editor.getText(), lineNo)) editor.removeLine(lineNo);
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
const todayISO = () => new Date().toISOString().slice(0, 10);
function svgString(slide){
  if(!model || !model.items.length) return null;
  return render(model, {colors: themeColors(), measure, diff: makeDiff(model), slide, dark: isDark()});
}
/* dlslide and Copy PNG both go to the deck (render-deck.js) — a designed,
   16:9 export, not the raw chart scaled up. dlsvg/dlpng stay the raw chart. */
function deckSvgString(){
  if(!model || !model.items.length) return null;
  return renderDeck(model, {colors: themeColors(), measure, diff: makeDiff(model), dark: isDark(), today: todayISO()});
}
function slug(){
  return slugify(model.title, 'roadmap');
}
wireExports({
  buttons: {dlsvg: $('dlsvg'), dlpng: $('dlpng'), dlslide: $('dlslide'), copypng: $('copypng')},
  getSvg: () => svgString(),
  getSvgSlide: () => deckSvgString(),
  getCopy: () => deckSvgString(),
  slug,
});
/* clicking a chip COMMITS style: as a text edit (one transaction, one undo
   step, URL-coherent) — the doc stays the only source of truth, the normal
   refresh loop re-syncs the active chip */
$('stylepicker').addEventListener('click', e => {
  const b = e.target.closest('[data-style]');
  if(b) editor.setText(setStyle(editor.getText(), b.dataset.style));
});
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
const drag = {armed: null, active: false, ghost: null, hover: null, srcEl: null, dropline: null};
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
  return {el: cell, h: +h, lane, beforeLine: before};
}
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
  if(drag.srcEl) drag.srcEl.style.opacity = '';
  document.body.style.cursor = '';
  drag.armed = null; drag.active = false; drag.ghost = null; drag.srcEl = null;
}
/* (FLIP glide migrated to the shared motion.js applyFlip — keyed data-key=title,
   zoom-scale-aware; triggered via flipNext on a drop, see doRefresh.) */
$('preview').addEventListener('pointerdown', e => {
  if(!finePointer()) return;   // coarse pointers use the card menu's Move to… row
  const g = e.target.closest && e.target.closest('#preview svg g[data-line]');
  if(!g || e.button !== 0) return;
  const item = model && model.items.find(i => i.srcLine === +g.dataset.line);
  if(!item) return;
  e.preventDefault();   // no text selection while dragging
  drag.armed = {line: +g.dataset.line, title: item.title, x: e.clientX, y: e.clientY};
  drag.srcEl = g;
});
window.addEventListener('pointermove', e => {
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
  const cell = cellAt(e.clientX, e.clientY);
  if(cell){
    const accent = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim();
    cell.el.setAttribute('fill', /^#[0-9a-fA-F]{6}$/.test(accent) ? accent + '10' : 'transparent');
    drag.hover = cell;
    positionDropline(cell, drag.armed.line);
  }
});
window.addEventListener('pointerup', e => {
  if(!drag.armed) return;
  const wasActive = drag.active;
  const src = drag.armed.line;
  const cell = wasActive ? cellAt(e.clientX, e.clientY) : null;
  endDrag();
  if(wasActive) suppressClick = true;
  if(!wasActive || !cell || !model) return;
  const target = {h: cell.h, lane: cell.lane,
    beforeLine: cell.beforeLine === src ? null : cell.beforeLine};
  const r = moveItem(editor.getText(), model, src, target);
  if(!r) return;
  flipNext = true;   // the post-drop re-render captures + glides cards into place (shared FLIP)
  editor.setText(r.text);   // one transaction → one undo step
});
window.addEventListener('keydown', e => {
  if(e.key === 'Escape' && drag.armed) endDrag();
});
/* the browser can claim the gesture mid-drag (scroll/gesture) → clean up the
   ghost + dropline instead of stranding them until the next pointerup */
window.addEventListener('pointercancel', () => { if(drag.armed) endDrag(); });
$('preview').addEventListener('click', e => {
  if(suppressClick){ e.stopPropagation(); suppressClick = false; }
}, true);

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
