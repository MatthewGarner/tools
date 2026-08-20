/* State, refresh loop, snapshot slip-compare, edit-in-place, exports, boot. */
import {parse, STATUSES} from './parse.js';
import {render, toMarkdown, timelineVerdict} from './render.js';
import {timelineDiff, timelineDiffView} from './diff.js';
import {premortemHandoff} from './handoff.js';
import {toLink as premortemLink} from '../premortem/store.js';
import {createEditor} from './editor.js';
import {validators, editLabel, editDates, setStatus, setLane, editNote,
  addItemLine, addedItemTarget, removeItemLine} from './edit-targets.js';
import {readHashState, writeHashState} from '../assets/series.js';
import {handoffReturnHref} from '../assets/handoff.js';
import {paintKicker} from '../assets/verdict.js';
import {setVerdictText, verdictMenuRows, handleVerdictCommit, validVerdictInput} from '../assets/verdict-edit.js';
import {measure, isDark, themeColors, onThemeChange, renderWarningList, slugify, exampleChips} from '../assets/app-common.js';
import {narrowWidth, watchNarrowBucket} from '../assets/narrow-width.js';
import {wireExports} from '../assets/exports.js';
import {mountMotion} from '../assets/motion.js';
import {REVEAL} from './motion-spec.js';
import {debounced, rafBatched} from '../assets/schedule.js';
import {initWorkspace, setActionsEnabled, mountTouchUndo} from '../assets/workspace.js';
import {attachEditInPlace} from '../assets/edit-in-place.js';
import {snapStore, wireSnapshots} from '../assets/snapshots.js';
import {autoloadExample, shouldPersist} from '../assets/mobile.js';
import {STARTER} from './starter.js';

const $ = id => document.getElementById(id);
const todayDay = () => Math.floor(Date.now() / 86400000);
const todayISO = () => new Date().toISOString().slice(0, 10);

const EXAMPLES = [
  {name: 'App launch programme', src:
`title: Lantern 2.0 — the road to store day
App: Feature freeze 2026-08-14 .. 2026-08-28
App: Beta cut 2026-09 .. 2026-10
App: Store review passed 2026-10 .. 2026-11 [risk] // review times vary wildly
Marketing: Landing page live 2026-08-21 [done]
Marketing: Campaign start 2026-10 .. 2026-11
Compliance: Privacy audit signed 2026-09 .. 2026-12 // external firm, long tail
Launch day 2026-11 .. 2027-01`},
  {name: 'Office move', src:
`title: Office move
Lease signed 2026-06-20 [done]
Old lease expires 2027-02-28 [fixed] [lead: 6w]
Fit-out: Design approved 2026-07 .. 2026-08
Fit-out: Construction done 2026-09 .. 2026-12 // contractor's range, not ours
IT: Network installed 2026-11 .. 2027-01
IT: Desks and AV 2026-12 .. 2027-01
Move-in day 2027-01 .. 2027-02`},
];

let model = null, lastSvg = '', hashTimer = null;
let snaps = null;

function currentDiff(){
  const cur = snaps && snaps.current();
  if(!cur || !model || !model.items.length) return null;
  return timelineDiffView(timelineDiff(cur.model, model), cur.label);
}
function ctx(intent){
  return {colors: themeColors(), measure, intent, dark: isDark(), today: todayDay()};
}
function activeRender(intent, edit = false, width){
  return render(model, {...ctx(intent),...(width?{width}:{})}, currentDiff(), {edit,intent});
}
function renderWarnings(){
  renderWarningList($('warns'), model ? model.warnings : []);
}
function doRefresh(){
  const text = editor.getText();
  model = parse(text);
  const pv = $('preview');
  if(!model.items.length){
    lastSvg = '';
    pv.innerHTML = '<p class="placeholder">' + (text.trim()
      ? 'No milestones yet — write one like “Grid: Energisation 2027-02 .. 2027-06”.'
      : 'Start typing — or load an example.') + '</p>';
  } else {
    const width=narrowWidth(pv),intent=width<520?'live-narrow':'live-wide';
    const svg = activeRender(intent,true,width);
    paint(svg, REVEAL, {flipAttr: 'data-mskey', scale: ws.scale, onSwap: ws.applyZoom, mode: motionOverride});
    lastSvg = svg;
    motionOverride = undefined;
  }
  renderWarnings();
  setActionsEnabled(!!lastSvg);
  /* #93: the hop appears only when there is a merge to premortem (never a dead link) */
  $('topremortem').hidden = !(model && model.items.length && premortemHandoff(model, todayDay()));
  if(shouldPersist()){ try{ localStorage.setItem('timeline-src', text); }catch(e){} }
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
function writeHash(){
  if(!shouldPersist()) return;
  const state = {t: editor.getText()};
  if(ws.collapsed()) state.e = 0;
  writeHashState(state);
}
snaps = wireSnapshots({
  store: snapStore('timeline-snaps'),
  parse,
  getSrc: () => editor.getText(),
  makeLabel: () => todayISO() + (model && model.title ? ' — ' + model.title.slice(0, 30) : ''),
  els: {snap: $('snap'), sel: $('snapsel'), del: $('snapdel')},
  canSnap: () => model && model.items.length,
  onChange(){ lastSvg = ''; refresh(); },
});
const ws = initWorkspace({
  workspace: $('workspace'), tab: $('railtab'),
  preview: $('preview'), zoomHost: $('zoomctl'),
  initialReading: 'when-guarded',
  focusEditor: () => editor.view.focus(),
  onCollapseChange(){ clearTimeout(hashTimer); hashTimer = setTimeout(writeHash, 100); },
});
const paint = mountMotion($('preview'));   // reveal on load, zoom-scaled FLIP on edit
let motionOverride;                         // 'none' for theme/relayout re-renders

/* the phone card menu ("the card is the control"): Rename/Dates open the inline
   field target; Status/Lane are marked-picker submenus that commit directly (a
   coarse tap never blind-steps); Note opens the free-text anchor; Remove is a
   danger action. Resolved fresh from the current model each open (roadmap's
   itemMenu idiom), keyed on the tapped row's own srcLine. */
function milestoneMenu(m, srcLine){
  const it = m && m.items.find(i => i.srcLine === srcLine);
  const cur = (it && it.status) || '';
  const statusRow = {label: 'Status…', submenu: ['', ...STATUSES].map(st => ({
    label: st || 'none', on: cur === st,
    commit: {kind: 'status', line: srcLine, oldRaw: cur, value: st},
  }))};
  /* existing lanes are quick-picks; "New lane…" opens the setlane anchor's input
     so any name (existing or brand-new) can be typed — a lane exists once one
     item carries it. */
  const laneRow = {label: 'Lane…', submenu: [
    ...m.lanes.filter(Boolean).map(l => ({
      label: l, on: !!(it && it.lane === l),
      commit: {kind: 'setlane', line: srcLine, oldRaw: (it && it.lane) || '', value: l},
    })),
    {label: 'New lane…', opens: 'setlane'},
  ]};
  return [
    {label: 'Rename…', opens: 'label'},
    {label: 'Dates…', opens: 'dates'},
    statusRow,
    laneRow,
    {label: (it && it.note) ? 'Edit note…' : 'Add note…', opens: 'note'},
    {label: 'Remove milestone', action: true, danger: true},
  ];
}

const eip = attachEditInPlace($('preview'), {
  kinds: {
    label: {validate: validators.label},
    dates: {validate: validators.dates},
    /* the real state list (not the ['cycle'] sentinel): a FINE click still steps
       '' → done → risk → '' instantly (edit-in-place hands us the next value), a
       COARSE tap opens the marked picker — no silent status commit on any coarse
       pointer, wide or narrow (the Stage-0 [IMPORTANT] fix). */
    status: {cycle: ['', ...STATUSES]},
    setlane: {validate: validators.lane},
    note: {validate: validators.note},
    additem: {validate: validators.label},
    removeitem: {cycle: ['×']},
    cardmenu: {menu: (el) => milestoneMenu(model, +el.dataset.line)},
    verdict: {menu: () => verdictMenuRows(model && model.verdict)},
    verdictedit: {validate: validVerdictInput,
      placeholder: () => model ? timelineVerdict(model, todayDay()).line : ''},
  },
  onCommit(kind, lineNo, oldRaw, newValue, el){
    if(handleVerdictCommit(kind, newValue, {
      getText: () => editor.getText(), setText: t => editor.setText(t),
      configRe: /^(title|palette|accent|today|verdict)\s*:/i,
      getLine: () => model ? timelineVerdict(model, todayDay()).line : '',
    })) return;
    if(kind === 'additem'){
      const r = addItemLine(editor.getText(), todayISO(), el.dataset.lane || undefined);
      const label = newValue.replace(/^✖/, '').trim();
      const line = r.newLine.replace('New milestone', label || 'New milestone');
      /* The add input already collected the name in the artefact. One source
         insertion is the whole commit; once the normal render catches up,
         focus the exact fresh label without reopening an input or touching CM. */
      editor.insertLinesAfter(r.afterLine, [line]);
      eip.focusAt(addedItemTarget(r, label), {origin: el});
      return;
    }
    if(kind === 'removeitem' || newValue === '✖Remove milestone'){
      if(removeItemLine(editor.getText(), lineNo)) editor.removeLine(lineNo);
      return;
    }
    const line = editor.getLine(lineNo);
    const newLine = kind === 'status' ? setStatus(line, newValue)
      : kind === 'setlane' ? setLane(line, newValue)
      : kind === 'note' ? editNote(line, oldRaw, newValue)
      : kind === 'dates' ? editDates(line, oldRaw, newValue)
      : editLabel(line, oldRaw, newValue);
    if(newLine !== line) editor.replaceLine(lineNo, newLine);
  },
});

/* ---------- example chips ---------- */
exampleChips($('chips'), EXAMPLES, ex => editor.setText(ex.src), {start: {src: STARTER}});

/* ---------- exports ---------- */
function svgString(intent){
  return (model && model.items.length) ? activeRender(intent, false) : null;
}
function slug(){
  return slugify(model.title, 'timeline');
}
wireExports({
  buttons: {dlsvg: $('dlsvg'), dlpng: $('dlpng'), copypng: $('copypng')},
  getSvg: () => svgString('native'),
  getCopy: () => svgString('presentation'),
  slug,
});
/* copymd keeps its inline handler: on clipboard failure it falls back to a
   prompt() with the markdown so it's still copyable — wireExports has no
   equivalent fallback, so migrating would lose that behaviour. */
$('topremortem').addEventListener('click', async () => {
  const returnTo = await handoffReturnHref('/timeline/',
    {t:editor.getText(), ...(ws.collapsed() ? {e:0} : {})});
  if(!returnTo){
    $('handoffstatus').textContent = 'This plan is too large to send with a safe return link. Shorten it, then try again.';
    return;
  }
  const doc = premortemHandoff(model, todayDay(), returnTo);
  if(!doc) return;
  $('handoffstatus').textContent = '';
  const link = await premortemLink(doc);   // ignore re-clicks while encoding: same doc, same link
  if(link) location.href = '/premortem/' + link;
  else $('handoffstatus').textContent = 'This plan is too large to open in Premortem. Shorten the title, then try again.';
});
$('copymd').addEventListener('click', async () => {
  if(!model || !model.items.length) return;
  const md = toMarkdown(model, currentDiff(), location.href, todayDay());
  try{ await navigator.clipboard.writeText(md); flash('copymd', 'Copied', 1500); }
  catch(e){ prompt('Copy this:', md); }
});
function flash(id, msg, ms){
  const b = $(id), was = b.textContent;
  b.textContent = msg;
  setTimeout(() => { b.textContent = was; }, ms);
}

/* fingers open at 100% zoom — pan so the first upcoming milestone lands ~30% in
   (TODAY stays in view when it's close), not the empty left board. Falls back to
   the today line if there's no [data-next] marker (empty doc). */
let panned = false;
function panToToday(){
  if(panned || !matchMedia('(pointer: coarse)').matches) return;
  const pv = $('preview');
  const next = pv.querySelector('[data-next]');
  if(next){
    const m = /M([\d.]+)/.exec(next.getAttribute('d'));   // the P50 diamond's cx
    if(m){ pv.scrollLeft = Math.max(0, parseFloat(m[1]) - pv.clientWidth * 0.30); panned = true; return; }
  }
  const line = pv.querySelector('[data-today]');
  if(!line) return;
  const x = parseFloat(line.getAttribute('x1'));
  if(isFinite(x)){
    pv.scrollLeft = Math.max(0, x - pv.clientWidth * 0.25);
    panned = true;
  }
}
new MutationObserver(panToToday).observe($('preview'), {childList: true});

/* the instrument kicker — static, painted once (never in the refresh loop) */
paintKicker($('kicker'), '02', 'Milestones under uncertainty');

/* ---------- theme ---------- */
function rerender(){ motionOverride = 'none'; paint.reset(); lastSvg = ''; refresh(); }
onThemeChange(rerender);
/* narrow↔wide bucket flip: re-render with motion OFF — the diamonds would otherwise
   FLIP-glide (flipAttr:'data-mskey' on every paint) between board and stacked-row coordinates. */
watchNarrowBucket($('preview'), rerender);

/* ---------- boot ---------- */
(async function(){
  const hash = await readHashState();
  let text = hash && typeof hash.t === 'string' ? hash.t : '';
  if(hash && hash.e === 0) ws.setCollapsed(true);
  if(!text){
    try{ text = localStorage.getItem('timeline-src') || ''; }catch(e){}
  }
  if(text) editor.setText(text);
  else if(!autoloadExample(() => editor.setText(EXAMPLES[0].src))) refresh();
})();

/* try-it specimens: the syntax reference inserts into the editor (2026-08-02) */
import {wireSyntaxTry} from '../assets/syntax-try.js';
wireSyntaxTry(document.querySelector('details.syntax'), editor, ['title', 'palette', 'accent', 'today', 'verdict']);
