/* State, refresh loop, edit-in-place, exports, boot. DOM lives here only. */
import {parse} from './parse.js';
import {simulate, verdict, simKey} from './engine.js';
import {render as renderSvg, toMarkdown} from './render.js';
import {createEditor} from './editor.js';
import {validators, editField} from './edit-targets.js';
import {readHashState, writeHashState} from '../../assets/series.js';
import {autoloadExample, shouldPersist} from '../../assets/mobile.js';
import {measure, isDark, themeColors, onThemeChange, renderWarningList, slugify} from '../../assets/app-common.js';
import {wireExports} from '../../assets/exports.js';
import {narrowWidth, watchNarrowBucket} from '../../assets/narrow-width.js';
import {initWorkspace, setActionsEnabled} from '../../assets/workspace.js';
import {attachEditInPlace} from '../../assets/edit-in-place.js';

const $ = id => document.getElementById(id);

const EXAMPLES = [
  {name: 'Wexcombe base case', src:
`title: Cycle budget — Wexcombe 100MW/2h
battery: 100MW / 200MWh
spread: 35..85               // £/MWh, day-to-day 90% range
charge: 15..45
second: 35..60%              // second cycle: % of the day's best
drift: -4..0 %/yr
rte: 86..90%
fade: 0.006..0.012 %/cycle
calendar: 1.0..1.8 %/yr
cycles: 6000 over 15yr
augment: 120..180 £/kWh
discount: 7..10%`},
  {name: 'Tight warranty', src:
`title: Rationed — same asset, half the budget
battery: 100MW / 200MWh
spread: 35..85
charge: 15..45
second: 35..60%
drift: -4..0 %/yr
rte: 86..90%
fade: 0.006..0.012 %/cycle
calendar: 1.0..1.8 %/yr
cycles: 3000 over 15yr       // the warranty becomes the price-setter
augment: 120..180 £/kWh`},
  {name: 'Optimistic OEM', src:
`title: The fade debate — datasheet vs your belief
battery: 100MW / 200MWh
spread: 35..85
charge: 15..45
drift: -4..0 %/yr
rte: 88..91%
fade: 0.003..0.004 %/cycle   // the datasheet, taken at its word
calendar: 0.8..1.0 %/yr
cycles: 6000 over 15yr
augment: 120..180 £/kWh`},
];

let model = null, out = null, lastSvg = '', lastText = '';
/* Memoisation: doRefresh re-parses on every keystroke/theme-flip/resize, but
   simulate() only needs to re-run when the sim-relevant fields actually
   change (simKey excludes title/accent/palette/battery.mw/etc). lastKey
   tracks the last model actually simulated; __cyclesSimCount is exposed on
   globalThis (module-set, CSP-fine) so tests can assert the memoisation. */
let lastKey = null;
globalThis.__cyclesSimCount = 0;
let rafId = 0, debTimer = null, hashTimer = null;

const stageEl = $('preview');
function renderWidth(){ return narrowWidth(stageEl); }
function ctx(slide, forExport = false){
  return {colors: themeColors(), measure, slide, dark: isDark(), width: forExport ? undefined : renderWidth()};
}
function activeRender(slide, edit = false, forExport = false){
  return renderSvg(model, out, ctx(slide, forExport), {edit});
}
function renderWarnings(){
  renderWarningList($('warns'), model ? model.warnings : []);
}
/* HTML mirror of the three verdict bands the SVG draws (threshold/second/
   augment) — one <p> per band that has one, so screen readers (via the
   container's aria-live) and sighted users both get the same quotable text. */
function renderVerdict(){
  const el = $('verdict');
  el.textContent = '';
  if(!out) return;
  for(const band of ['threshold', 'second', 'augment']){
    const v = verdict(band, out);
    if(!v) continue;
    const p = document.createElement('p');
    p.textContent = v;
    el.appendChild(p);
  }
}
/* Draws from current `model`/`out` — never re-parses or re-simulates. Called
   both after a real refresh and after a memoised (sim-skipped) one, so
   theme toggles and narrow-bucket flips still update the DOM. */
function render(){
  const pv = $('preview');
  if(!out){
    lastSvg = '';
    pv.innerHTML = '<p class="placeholder">' + (lastText.trim()
      ? 'Missing: ' + model.missing.join(', ') + ' — or load an example.'
      : 'Start typing — or load an example.') + '</p>';
  } else {
    const svg = activeRender(false, true);
    if(svg !== lastSvg){ pv.innerHTML = svg; lastSvg = svg; }
  }
  renderVerdict();
  renderWarnings();
  setActionsEnabled(!!out);
}
function persistAndScheduleHash(text){
  try{ if(shouldPersist()) localStorage.setItem('cycles-src', text); }catch(e){}
  clearTimeout(hashTimer);
  hashTimer = setTimeout(writeHash, 400);
}
function doRefresh(){
  const text = editor.getText();
  lastText = text;
  model = parse(text);
  const key = simKey(model);
  persistAndScheduleHash(text);                 // the existing localStorage + writeHash timer, always
  if(key === null){ out = null; lastKey = null; render(); return; }
  if(key === lastKey){ render(); return; }      // memoised: theme/rotation/no-op/MW-only/comment edit
  out = simulate(model, {seed: 1, n: 5000}); __cyclesSimCount++; lastKey = key;
  render();
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
function writeHash(){
  const state = {t: editor.getText()};
  if(ws.collapsed()) state.e = 0;
  if(shouldPersist()) writeHashState(state);
}
const ws = initWorkspace({
  workspace: $('workspace'), tab: $('railtab'),
  preview: $('preview'), zoomHost: $('zoomctl'),
  onCollapseChange(){ clearTimeout(hashTimer); hashTimer = setTimeout(writeHash, 100); },
});

/* edit-in-place: one numeric kind; the field rides on the element */
attachEditInPlace($('preview'), {
  kinds: {num: {validate: validators.num}},
  onCommit(kind, line, raw, value, el){
    const cur = editor.getLine(line);
    const next = editField(cur, el.dataset.field, value);
    if(next === cur) return;
    editor.replaceLine(line, next);   // dispatches through CodeMirror — undoable
  },
});

/* chips */
for(const ex of EXAMPLES){
  const b = document.createElement('button');
  b.className = 'chip';
  b.textContent = ex.name;
  b.addEventListener('click', () => editor.setText(ex.src));
  $('chips').appendChild(b);
}

/* ---------- exports ---------- */
function svgString(slide){
  return out ? activeRender(slide, false, true) : null;   // forExport: width undefined => canonical 1200/1280
}
function slug(){
  return slugify(model && model.title, 'cycles');
}
wireExports({
  buttons: {dlsvg: $('dlsvg'), dlpng: $('dlpng'), dlslide: $('dlslide'), copypng: $('copypng')},
  getSvg: () => svgString(false),
  getSvgSlide: () => svgString(true),
  slug,
});
/* copymd keeps its inline handler: on clipboard failure it falls back to a
   prompt() with the markdown so it's still copyable — wireExports has no
   equivalent fallback, so migrating would lose that behaviour. */
$('copymd').addEventListener('click', async () => {
  if(!out) return;
  const md = toMarkdown(model, out);
  try{ await navigator.clipboard.writeText(md); flash('copymd', 'Copied', 1500); }
  catch(e){ prompt('Copy this:', md); }
});
function flash(id, msg, ms){
  const b = $(id), was = b.textContent;
  b.textContent = msg;
  setTimeout(() => { b.textContent = was; }, ms);
}

/* ---------- theme ---------- */
function rerender(){ lastSvg = ''; refresh(); }
onThemeChange(rerender);

/* ---------- narrow-bucket resize: re-render only when the bucket flips ---------- */
watchNarrowBucket(stageEl, rerender);

/* ---------- boot ---------- */
(function(){
  const hash = readHashState();
  let text = hash && typeof hash.t === 'string' ? hash.t : '';
  if(hash && hash.e === 0) ws.setCollapsed(true);
  if(!text){
    try{ text = localStorage.getItem('cycles-src') || ''; }catch(e){}
  }
  if(text) editor.setText(text);
  else if(!autoloadExample(() => editor.setText(EXAMPLES[0].src))) refresh();
})();
