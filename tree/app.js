/* State, refresh loop, saved trees, exports, boot. */
import {parse} from './parse.js';
import {evaluate} from './engine.js';
import {render} from './render.js';
import {createEditor} from './editor.js';
import {insertAndSelect} from '../assets/editor-common.js';
import {readHashState, writeHashState} from '../assets/series.js';
import {autoloadExample, shouldPersist} from '../assets/mobile.js';
import {measure, isDark, themeColors, onThemeChange, renderWarningList, slugify} from '../assets/app-common.js';
import {wireExports} from '../assets/exports.js';
import {loadSaved, storeSaved, renderSavedChips} from '../assets/saved-items.js';
import {debounced, rafBatched} from '../assets/schedule.js';
import {initWorkspace, setActionsEnabled} from '../assets/workspace.js';
import {attachEditInPlace, cardMenu} from '../assets/edit-in-place.js';
import {validators, applies, subtreeRange, childLineFor} from './edit-targets.js';

const $ = id => document.getElementById(id);


const EXAMPLES = [
  {name: 'Bid or no bid', src:
`title: Bid for the Acme contract
currency: £

Bid decision
  Submit bid: -150k
    Outcome
      Win (p=0.3-0.45): 2M to 5M
      Lose (p=rest): 0
  No bid: 0`},
  {name: 'Build vs buy', src:
`title: Build vs buy the reporting module
currency: £

Approach
  Build in-house: -400k to -700k
    Delivery
      On time (p=0.5-0.7): 1.5M to 2.5M
      Late, still ships (p=rest): 800k to 1.2M
  Buy vendor product: -250k
    Fit
      Good fit (p=0.6-0.8): 1M to 1.6M
      Poor fit, heavy rework (p=rest): 200k to 600k
  Do nothing: 0`},
];

/* ---------- refresh loop ---------- */
let model = null, results = null, lastSvg = '', hashTimer = null;
function renderWarnings(){
  renderWarningList($('warns'), [...(model ? model.warnings : []), ...(results ? results.warnings : [])]);
}
function doRefresh(){
  const text = editor.getText();
  model = parse(text);
  const pv = $('preview');
  if(!model.root){
    results = null;
    lastSvg = '';
    pv.innerHTML = '<p class="placeholder">' + (text.trim()
      ? 'No tree yet — add an indented option or two.'
      : 'Start typing — or load an example.') + '</p>';
  } else {
    results = evaluate(model);
    const svg = render(model, results, {colors: themeColors(), measure, dark: isDark(), edit: true});
    if(svg !== lastSvg){ pv.innerHTML = svg; lastSvg = svg; }
  }
  renderWarnings();
  setActionsEnabled(!!lastSvg);
  try{ if(shouldPersist()) localStorage.setItem('tree-src', text); }catch(e){}
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
const ws = initWorkspace({
  workspace: $('workspace'), tab: $('railtab'),
  preview: $('preview'), zoomHost: $('zoomctl'),
  onCollapseChange(){ clearTimeout(hashTimer); hashTimer = setTimeout(writeHash, 100); },
});

attachEditInPlace($('preview'), {
  kinds: {
    prob: {validate: validators.prob},
    value: {validate: validators.value},
    label: {validate: validators.label},
    /* card menu supersedes the old node-<kind> add/remove-only popover with
       Rename/Edit value or probability/Add/Remove; opens:'value'/'prob' is a
       dead no-op on the (rare) node instance that doesn't carry that field —
       e.g. the root marker has no incoming edge so no label/value/prob tspan
       exists for it at all — same accepted no-op as why's fieldless rows. */
    'cardmenu-decision': cardMenu({field: {label: 'Edit value…', opens: 'value'}, add: 'option'}),
    'cardmenu-chance': cardMenu({field: {label: 'Edit probability…', opens: 'prob'}, add: 'outcome'}),
    'cardmenu-leaf': cardMenu({field: {label: 'Edit value…', opens: 'value'}, add: 'outcome', remove: 'Remove'}),
  },
  onCommit(kind, lineNo, oldRaw, newValue){
    if(kind.startsWith('cardmenu-')){
      if(newValue === '✖＋ Add option' || newValue === '✖＋ Add outcome'){
        const r = childLineFor(editor.getText(), lineNo);
        if(!r) return;
        insertAndSelect(editor, r.afterLine, r.newLine, r.select);
      } else if(newValue === '✖Remove branch' || newValue === '✖Remove'){
        if(lineNo < 0) return;   // implicit root has no line of its own
        const rr = subtreeRange(editor.getText(), lineNo);
        if(rr) editor.removeLines(rr.from, rr.to);
      }
      return;
    }
    const line = editor.getLine(lineNo);
    const newLine = applies[kind](line, oldRaw, newValue);
    if(newLine !== line) editor.replaceLine(lineNo, newLine);
  },
});

/* ---------- chips ---------- */
for(const ex of EXAMPLES){
  const b = document.createElement('button');
  b.className = 'chip';
  b.textContent = ex.name;
  b.addEventListener('click', () => editor.setText(ex.src));
  $('chips').appendChild(b);
}

/* ---------- saved trees ---------- */
const SAVED_KEY = 'tree-saved';
function renderSaved(){
  const row = $('savedrow');
  renderSavedChips(row, loadSaved(SAVED_KEY), {
    deleteLabel: m => 'Delete saved tree ' + m.name,
    onLoad: m => editor.setText(m.src),
    onDelete: (m, i) => {
      const l = loadSaved(SAVED_KEY); l.splice(i, 1); storeSaved(SAVED_KEY, l); renderSaved();
    },
  });
  const save = document.createElement('button');
  save.className = 'chip';
  save.textContent = '＋ Save current';
  save.addEventListener('click', () => {
    if(!model || !model.root) return;
    const list = loadSaved(SAVED_KEY);
    list.push({name: model.title ? model.title.slice(0, 28) : 'Tree ' + (list.length + 1), src: editor.getText()});
    storeSaved(SAVED_KEY, list);
    renderSaved();
  });
  row.appendChild(save);
}

/* ---------- exports ---------- */
function svgString(slide){
  if(!model || !model.root || !results) return null;
  return render(model, results, {colors: themeColors(), measure, slide, dark: isDark()});
}
function slug(){
  return slugify(model.title, 'decision-tree');
}
wireExports({
  buttons: {dlsvg: $('dlsvg'), dlpng: $('dlpng'), dlslide: $('dlslide'), copypng: $('copypng')},
  getSvg: () => svgString(),
  getSvgSlide: () => svgString(true),
  slug,
});

/* ---------- theme change ---------- */
function rerender(){ lastSvg = ''; refresh(); }
onThemeChange(rerender);

/* ---------- boot ---------- */
(function(){
  const hash = readHashState();
  let text = hash && typeof hash.t === 'string' ? hash.t : '';
  if(hash && hash.e === 0) ws.setCollapsed(true);
  if(!text){
    try{ text = localStorage.getItem('tree-src') || ''; }catch(e){}
  }
  renderSaved();
  if(text) editor.setText(text);
  else if(!autoloadExample(() => editor.setText(EXAMPLES[0].src))) refresh();
})();
