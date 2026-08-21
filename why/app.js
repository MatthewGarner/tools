/* State, view toggle, refresh loop, saved trees, exports, boot. */
import {parse} from './parse.js';
import {project, whyVerdict, whyMetrics} from './project.js';
import {paintKicker, paintMetrics, paintVerdict, wireCopyVerdict} from '../assets/verdict.js';
import {renderCausalField} from './render-causal-field.js';
import {renderCausalPresentation} from './causal-presentation.js';
import {snapStore, wireSnapshots} from '../assets/snapshots.js';
import {whyDiff, whyDiffView} from './diff.js';
import {renderDeliveryLens} from './render-delivery-lens.js';
import {createEditor} from './editor.js';
import {insertAndSelect} from '../assets/editor-common.js';
import {readHashState, writeHashState} from '../assets/series.js';
import {autoloadExample, shouldPersist} from '../assets/mobile.js';
import {narrowWidth, watchNarrowBucket} from '../assets/narrow-width.js';
import {measure, isDark, themeColors, onThemeChange, renderWarningList, slugify, exampleChips} from '../assets/app-common.js';
import {wireExports} from '../assets/exports.js';
import {loadSaved, storeSaved, renderSavedChips} from '../assets/saved-items.js';
import {debounced, rafBatched} from '../assets/schedule.js';
import {initWorkspace, setActionsEnabled, mountTouchUndo} from '../assets/workspace.js';
import {mountMotion} from "../assets/motion.js";
import {REVEAL} from "./motion-spec.js";
import {attachEditInPlace} from '../assets/edit-in-place.js';
import {validators as eipValidators, applies as eipApplies, SOLUTION_STATUSES, ASSUMPTION_CYCLE, subtreeRange, childLineFor} from './edit-targets.js';
import {solutionMenu} from './app-menu.js';
import {STARTER} from './starter.js';

const $ = id => document.getElementById(id);
const paint = mountMotion($("preview"));
paintKicker($('kicker'), '08', 'One tree, two projections');
wireCopyVerdict($('verdict'));


const EXAMPLES = [
  {name: 'Reading retention', src:
`title: Q3 — 90-day retention
outcome: Improve 90-day retention

  Readers lose their place between sessions
    Readers don't open the app on a commute
      Reading reminders [testing]
        ? readers want a nudge mid-commute [testing]
        ? reading time is detectable [holds]
    Resume where you left off [delivering]
      ? abandoned books drive churn [holds]

  Choosing the next book is work
    Curated shelves [shipped]
    Book clubs [candidate]
      ? readers will invite friends

  Progress feels invisible
`},
  {name: 'Two outcomes', src:
`title: H2 product bets
outcome: Improve 90-day retention
  Readers lose their place between sessions
    Reading reminders [testing]
      ? users want interruptions
outcome: Grow referral revenue
  Sharing feels braggy
    Private progress cards [delivering]
      ? cards get shared [testing]
  No reason to invite others
`},
];

/* ---------- refresh loop ---------- */
let model = null, projection = null, view = 'ost';
let lastSvg = '', hashTimer = null;
let inspected = null;
function findNode(line, nodes = model ? model.outcomes : [], trail = []){
  for(const node of nodes){ const next=[...trail,node]; if(node.srcLine===line) return {node,trail:next}; const hit=findNode(line,node.children||[],next); if(hit) return hit; }
  return null;
}
function clearInspection({restore=false} = {}){ const origin=inspected&&inspected.origin; inspected=null; $('margin').hidden=true; $('margin').replaceChildren(); $('margin').parentElement.classList.remove('has-margin'); for(const el of $('preview').querySelectorAll('.is-inspected')) el.classList.remove('is-inspected'); if(restore&&origin&&origin.isConnected) origin.focus(); }
function inspectNode(line, origin){
  const hit=findNode(line); if(!hit) return; clearInspection(); inspected={line,origin};
  for(const el of $('preview').querySelectorAll('[data-line="'+line+'"]')) el.classList.add('is-inspected');
  const {node,trail}=hit, m=$('margin'),k=document.createElement('p'),h=document.createElement('h2'),dl=document.createElement('dl');k.className='margin-kicker';k.textContent='DECISION MARGIN';h.id='margin-title';m.setAttribute('aria-labelledby',h.id);h.tabIndex=-1;h.textContent=node.label;
  const route=trail.map(n=>n.label).join(' → '), children=(node.children||[]).reduce((a,n)=>(a[n.kind]=(a[n.kind]||0)+1,a),{}), support=node.kind==='solution'?(node.children||[]).filter(n=>n.kind==='assumption').map(n=>n.status).join(', ')||'No assumptions recorded':Object.entries(children).map(([k,n])=>n+' '+k+(n===1?'':'s')).join(' · ')||'No child claims';
  for(const [a,b] of [['Source','Line '+(line+1)],['Chain',route],['Kind',node.kind],['Status',node.status||'—'],[node.kind==='solution'?'Assumptions':'Connected claims',support],['Lens',view==='ost'?'Causal Tree':'Derived readiness — not a delivery plan']]){const dt=document.createElement('dt'),dd=document.createElement('dd');dt.textContent=a;dd.textContent=b;dl.append(dt,dd);}
  const actions=document.createElement('div'),edit=document.createElement('button'),close=document.createElement('button');actions.className='margin-actions';edit.className=close.className='btn';edit.textContent='Edit source';close.textContent='Close';edit.addEventListener('click',()=>{clearInspection();ws.setCollapsed(false);const l=editor.view.state.doc.line(line+1);editor.view.dispatch({selection:{anchor:l.from},scrollIntoView:true});editor.view.focus();});close.addEventListener('click',()=>clearInspection({restore:true}));actions.append(edit,close);m.replaceChildren(k,h,dl,actions);m.hidden=false;m.parentElement.classList.add('has-margin');h.focus();
}
const previewEl = $('preview');
function renderWidth(){ return narrowWidth(previewEl); }
function renderWarnings(){
  renderWarningList($('warns'), model ? model.warnings : []);
}
let snaps = null;   // wired below, after the editor exists
function currentDiff(){
  const cur = snaps && snaps.current();
  if(!cur || !model || !model.outcomes.length) return null;
  return whyDiffView(whyDiff(cur.model, model), cur.label);
}
/* Both projections receive the same live width. Exports omit it so their
   physical reading artefact remains wide, with its own presentation policy. */
function activeRender(intent = 'native', edit = false){
  const presentation = intent === 'presentation';
  const ctx = {colors: themeColors(), measure, slide: false, intent, dark: isDark(), edit,
    today: new Date().toISOString().slice(0, 10), width: edit ? renderWidth() : undefined};
  if(presentation && view === 'ost') return renderCausalPresentation(model, ctx, currentDiff());
  return view === 'ost' ? renderCausalField(model, projection, ctx, currentDiff()) : renderDeliveryLens(model, projection, ctx, currentDiff());
}
function doRefresh(){
  clearInspection();
  const text = editor.getText();
  model = parse(text);
  const pv = $('preview');
  if(!model.outcomes.length){
    projection = null;
    lastSvg = ''; paint.reset();
    pv.innerHTML = '<p class="placeholder">' + (text.trim()
      ? 'No tree yet — start with an outcome: line.'
      : 'Start typing — or load an example.') + '</p>';
  } else {
    projection = project(model);
    const svg = activeRender('live', true);
    paint(svg, REVEAL); lastSvg = svg;
  }
  renderWarnings();
  /* the header/verdict anatomy rides this same loop — both painters bail out
     when their strings are unchanged, so a keystroke that doesn't move a count
     costs nothing. The verdict is a projection of the SAME audits the Causal Tree
     draws, so the two views can't disagree either. */
  paintMetrics($('metrics'), model.outcomes.length ? (model.title || 'Untitled') : '', whyMetrics(model));
  const vd = whyVerdict(model, projection);
  paintVerdict($('verdict'), vd ? vd.line : '', vd ? vd.fig : '');
  setActionsEnabled(!!lastSvg);
  try{ if(shouldPersist()) localStorage.setItem('why-src', text); }catch(e){}
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
  const state = {t: editor.getText(), v: view};
  state.e = ws.collapsed() ? 0 : 1;
  if(shouldPersist()) writeHashState(state);
}
snaps = wireSnapshots({
  store: snapStore('why-snaps'),
  parse,
  getSrc: () => editor.getText(),
  makeLabel: () => new Date().toISOString().slice(0, 10) +
    (model && model.title ? ' — ' + model.title.slice(0, 30) : ''),
  els: {snap: $('snap'), sel: $('snapsel'), del: $('snapdel')},
  canSnap: () => model && model.outcomes.length,
  onChange(){ lastSvg = ''; paint.reset(); refresh(); },
});
const ws = initWorkspace({
  workspace: $('workspace'), tab: $('railtab'),
  preview: $('preview'), zoomHost: $('zoomctl'),
  onCollapseChange(){ clearTimeout(hashTimer); hashTimer = setTimeout(writeHash, 100); }, initialCollapsed:true,
  collapsedLabel:'Edit tree source', collapsedAriaLabel:'Edit tree source', expandedLabel:'Hide tree source',
});

/* ---------- view toggle ---------- */
function setView(v){
  clearInspection();
  view = v;
  syncViewToggle();
  lastSvg = ''; paint.reset();
  refresh();
}
function syncViewToggle(){
  $('viewost').classList.toggle('on', view === 'ost');
  $('viewmap').classList.toggle('on', view === 'map');
  $('viewost').setAttribute('aria-selected', String(view === 'ost'));
  $('viewmap').setAttribute('aria-selected', String(view === 'map'));
  $('viewnote').textContent = view === 'ost'
    ? 'Causal Tree — trace every solution to the customer opportunity and assumption it relies on.'
    : 'Delivery Lens — shows derived readiness, not delivery capacity or a decision plan.';
}
$('viewost').addEventListener('click', () => setView('ost'));
$('viewmap').addEventListener('click', () => setView('map'));
document.querySelector('.viewtoggle').addEventListener('keydown', e => {
  const keys=['ArrowLeft','ArrowRight','Home','End']; if(!keys.includes(e.key)) return;
  e.preventDefault(); const next=e.key==='ArrowLeft'||e.key==='Home' ? $('viewost') : $('viewmap'); next.focus(); next.click();
});
window.addEventListener('keydown', e => { if(e.key==='Escape' && !e.defaultPrevented && !document.activeElement.closest('.cm-editor')) clearInspection({restore:true}); });

const whyEip = attachEditInPlace($('preview'), {
  kinds: {
    status: {options: SOLUTION_STATUSES},
    astatus: {cycle: ASSUMPTION_CYCLE},
    label: {validate: eipValidators.label},
    title: {validate: eipValidators.label},   // map-view card titles are labels
    /* Outcomes and opportunities have no status field. Keep their menus honest:
       a menu row must either open a real target or make a real source change. */
    'cardmenu-outcome': {menu: [
      {label: 'Inspect…', action: true},
      {label: 'Rename…', opens: 'label'}, {label: '＋ Add opportunity', action: true},
      {label: 'Remove branch', action: true, danger: true},
    ]},
    'cardmenu-opportunity': {menu: [
      {label: 'Inspect…', action: true},
      {label: 'Rename…', opens: 'label'}, {label: '＋ Add solution', action: true},
      {label: 'Remove branch', action: true, danger: true},
    ]},
    /* dynamic: base Rename/Status/＋ Add rows plus one submenu row per
       assumption (status picker + danger remove), resolved fresh from the
       current model each time the menu opens — app-menu.js's solutionMenu. */
    'cardmenu-solution': {menu: (el) => solutionMenu(model, +el.dataset.line)},
    'cardmenu-assumption': {menu: [
      {label: 'Inspect…', action: true},
      {label: 'Rename…', opens: 'label'},
      {label: 'Claim state…', opens: 'astatus'},
      {label: 'Remove branch', action: true, danger: true},
    ]},
    removeassump: {cycle: ['×']},
  },
  onCommit(kind, lineNo, oldRaw, newValue, el){
    if(kind.startsWith('cardmenu')){
      if(newValue === '✖Inspect…'){ inspectNode(lineNo, el); return; }
      if(newValue.startsWith('✖＋ Add')){
        const r = childLineFor(editor.getText(), lineNo);
        if(!r) return;
        const inserted = insertAndSelect(editor, r.afterLine, r.newLine, r.select);
        const addedText = editor.getText();   // onCancel only rolls back if nothing else changed since
        whyEip.openAt({kind: 'label', line: inserted.srcLine}, {
          origin: el,
          // undo() (not a forward removeLine) pops the insert's own isolated group —
          // Escape leaves no extra "remove" entry for a stray Ctrl+Z to resurrect.
          onCancel(){ if(editor.getText() === addedText) editor.undo(); },
        });
      } else if(newValue === '✖Remove branch'){
        const rr = subtreeRange(editor.getText(), lineNo);
        if(rr) editor.removeLines(rr.from, rr.to);
      }
      return;
    }
    if(kind === 'removeassump'){
      if(!editor.getLine(lineNo).trim().startsWith('?')) return;
      const rr = subtreeRange(editor.getText(), lineNo);
      if(rr) editor.removeLines(rr.from, rr.to);
      return;
    }
    const apply = kind === 'status' || kind === 'astatus' ? eipApplies.status : eipApplies.label;
    const line = editor.getLine(lineNo);
    const newLine = apply(line, oldRaw, newValue);
    if(newLine !== line) editor.replaceLine(lineNo, newLine);
  },
});

/* ---------- example chips ---------- */
exampleChips($('chips'), EXAMPLES, ex => editor.setText(ex.src), {start: {src: STARTER}});

/* ---------- saved ---------- */
const SAVED_KEY = 'why-saved';
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
    if(!model || !model.outcomes.length) return;
    const list = loadSaved(SAVED_KEY);
    list.push({name: model.title ? model.title.slice(0, 28) : 'Tree ' + (list.length + 1), src: editor.getText()});
    storeSaved(SAVED_KEY, list);
    renderSaved();
  });
  row.appendChild(save);
}

/* ---------- exports (active view) ---------- */
function svgString(intent){
  if(!model || !model.outcomes.length || !projection) return null;
  return activeRender(intent);
}
function slug(){
  return slugify((model.title || 'why') + '-' + view);
}
wireExports({
  buttons: {dlsvg: $('dlsvg'), dlpng: $('dlpng'), copypng: $('copypng')},
  getSvg: () => svgString('native'),
  getCopy: () => svgString('presentation'),
  slug,
});

/* ---------- theme ---------- */
function rerender(){ lastSvg = ''; paint.reset(); refresh(); }
onThemeChange(rerender);

/* ---------- narrow-bucket resize: re-render only when the bucket flips ---------- */
watchNarrowBucket(previewEl, rerender);

/* ---------- boot ---------- */
(async function(){
  const hash = await readHashState();
  let text = hash && typeof hash.t === 'string' ? hash.t : '';
  if(hash && (hash.v === 'map' || hash.v === 'ost')) view = hash.v;
  if(hash && hash.e === 1) ws.setCollapsed(false);
  if(!text){
    try{ text = localStorage.getItem('why-src') || ''; }catch(e){}
  }
  renderSaved();
  syncViewToggle();
  if(text) editor.setText(text);
  else if(!autoloadExample(() => editor.setText(EXAMPLES[0].src))) refresh();
})();

/* try-it specimens: the syntax reference inserts into the editor (2026-08-02) */
import {wireSyntaxTry} from '../assets/syntax-try.js';
wireSyntaxTry(document.querySelector('details.syntax'), editor, ['title', 'palette', 'accent']);
