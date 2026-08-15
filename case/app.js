/* State, refresh loop, edit-in-place, exports, boot. The binder layer:
   kicker reads CASE FILE — {status}, never an instrument number. */
import {parse} from './parse.js';
import {render, toMarkdown, caseReadout, NARROW} from './render.js';
import {planningRole, projectPlanningContexts} from './planning-context.js';
import {createEditor} from './editor.js';
import {validators, editLabel, editNote, setQuestion, setStatus} from './edit-targets.js';
import {readHashState, writeHashState} from '../assets/series.js';
import {applyLineOps} from '../assets/editor-common.js';
import {measure, themeColors, onThemeChange, renderWarningList, exampleChips} from '../assets/app-common.js';
import {wireExports} from '../assets/exports.js';
import {debounced, rafBatched} from '../assets/schedule.js';
import {initWorkspace, setActionsEnabled, mountTouchUndo} from '../assets/workspace.js';
import {mountMotion} from '../assets/motion.js';
import {attachEditInPlace} from '../assets/edit-in-place.js';
import {verdictMenuRows, handleVerdictCommit, validVerdictInput} from '../assets/verdict-edit.js';
import {autoloadExample, shouldPersist} from '../assets/mobile.js';
import {wireSyntaxTry} from '../assets/syntax-try.js';
import {STARTER} from './starter.js';

const $ = id => document.getElementById(id);
const paint = mountMotion($('preview'));
const REVEAL = {draw: 'line', hold: 'rect'};   // hairlines draw, pills and tags fade in
const todayISO = () => new Date().toISOString().slice(0, 10);
const CONFIG_RE = /^(title|question|status|verdict|palette|accent)\s*:/i;
/* the case cap is generous — a case EMBEDS member URLs, so it runs bigger than
   any single tool's doc; oversize is a LOUD warning below, never a silent drop */
const CASE_MAX = 24000;

const EXAMPLES = [
  {name: 'Wexcombe augmentation', src:
`title: Wexcombe augmentation
question: Augment in 2029, or run the fleet down?
status: open

Money: Augment NPV model -> /fermi/#eyJ2IjoxfQ // the £ case either way
Money: Board options -> /tree/#eyJ2IjoxfQ // priced routes, incl. do-nothing
Decision: Outcome plan -> /paths/#eyJ2IjoxfQ // every decision and outcome remains visible
Delivery: Timing forecast -> /timeline/#eyJ2IjoxfQ // P50–P90 dates
Risk: Premortem register -> /premortem/#eyJ2IjoxfQ // the failure modes, scored`},
  {name: 'Lantern 2.0 launch', src:
`title: Lantern 2.0 launch
question: Ship in March, or hold for the recommendations engine?
status: decided
verdict: We ship March — the recommendations engine rides the 2nd release

Money: Revenue model -> /fermi/#eyJ2IjoxfQ
Decision: Outcome plan -> /paths/#eyJ2IjoxfQ // all outcomes, including holding launch
Delivery: Chosen-outcome roadmap -> /roadmap/#z:TY5BawJBDEb_Spi7sF2hlBFBEW_FQim0h7mMO1FT1mRIslop_nfZw4L39773_QcPMTh5jxHeMzsqQ8GeLqg3qCq_2DkJJy7ZMULbtK-z5m320ibeZyOLULOfDFKY7KPK1U9QsCMjYUthAZntiooFqlJHfFze0FbTVjNfQDYbzlhGeai2ZFk9l3Yf34k3ohjhE0cQqhiNv-BAf4l325-vCViXXJ0uCIpn4oIKKn0vg4f7Aw // one exact outcome; receipt shown below
Delivery: Launch forecast -> /timeline/#eyJ2IjoxfQ // P50–P90 merge-risk dates
Risk: Launch premortem -> /premortem/#eyJ2IjoxfQ`},
];

let model = null, lastSvg = '', hashTimer = null, sizeBucket = 'wide', oversize = false;
let planningRevision = 0, planningPending = false;

const ctx = () => ({colors: themeColors(), measure, today: todayISO(),
  width: sizeBucket === 'narrow' ? $('preview').clientWidth : undefined});

function activeRender(forExport){
  return render(model, ctx(), forExport ? {} : {edit: true, live: true});
}
function paintKickerLine(){
  $('kicker').textContent = 'CASE FILE — ' + (model ? model.status.toUpperCase() : 'OPEN');
}
function renderWarnings(){
  const list = model ? [...model.warnings] : [];
  if(oversize) list.push('this case is too large for a link — the URL was NOT updated; trim exhibits or notes');
  renderWarningList($('warns'), list);
}
function paintPreview(text){
  const pv = $('preview');
  if(!text.trim()){
    lastSvg = ''; paint.reset();
    pv.innerHTML = '<p class="placeholder">Paste a tool’s URL as “Label -&gt; url” — or load the example.</p>';
  } else {
    const svg = activeRender(false);
    paint(svg, REVEAL); lastSvg = svg;
  }
  paintKickerLine();
  renderWarnings();
  setActionsEnabled(!!lastSvg && !planningPending);
}
function doRefresh(){
  const text = editor.getText();
  const revision = ++planningRevision;
  const parsed = parse(text);
  planningPending = parsed.exhibits.length > 0;
  model = {...parsed, exhibits:parsed.exhibits.map(exhibit =>
    ({...exhibit, planning:planningRole(exhibit.url)}))};
  paintPreview(text);

  /* URL-carried Roadmap text may be compressed, so basis recognition is
     async. The generic Roadmap claim paints immediately; a complete valid
     basis upgrades it to a projection receipt. A later edit always wins. */
  projectPlanningContexts(parsed.exhibits).then(contexts => {
    if(revision !== planningRevision || editor.getText() !== text) return;
    planningPending = false;
    if(contexts.some(context => context && context.basis))
      model = {...model, exhibits:model.exhibits.map((exhibit, i) =>
        ({...exhibit, planning:contexts[i]}))};
    paintPreview(text);
  }).catch(() => {
    if(revision !== planningRevision || editor.getText() !== text) return;
    planningPending = false;
    paintPreview(text);
  });

  if(shouldPersist()){ try{ localStorage.setItem('case-src', text); }catch(e){} }
  clearTimeout(hashTimer);
  hashTimer = setTimeout(writeHash, 400);
}
const refresh = rafBatched(doRefresh);
const editor = createEditor({
  parent: $('cmhost'),
  doc: '',
  onChange: debounced(refresh, 120),
});
mountTouchUndo(document.querySelector('.stage .actions'), editor);

async function writeHash(){
  if(!shouldPersist()) return;
  const state = {t: editor.getText()};
  if(ws.collapsed()) state.e = 0;
  const ok = await writeHashState(state, CASE_MAX);
  if(ok === oversize){ oversize = !ok; renderWarnings(); }
}

const ws = initWorkspace({
  workspace: $('workspace'), tab: $('railtab'),
  preview: $('preview'), zoomHost: $('zoomctl'),
  onCollapseChange(){ clearTimeout(hashTimer); hashTimer = setTimeout(writeHash, 100); },
});

/* narrow-bucket resize: re-render only when the bucket flips (cycles' pattern) */
const ro = new ResizeObserver(() => {
  const w = $('preview').clientWidth;
  const bucket = (w && w < NARROW) ? 'narrow' : 'wide';
  if(bucket === sizeBucket) return;
  sizeBucket = bucket;
  lastSvg = ''; paint.reset();
  refresh();
});
ro.observe($('preview'), {box: 'content-box'});

/* ---------- edit-in-place ---------- */
attachEditInPlace($('preview'), {
  kinds: {
    label: {validate: validators.label},
    note: {validate: validators.note},
    question: {validate: validators.question},
    status: {options: ['open', 'decided', 'parked']},
    verdict: {menu: () => verdictMenuRows(model && model.verdict)},
    verdictedit: {validate: validVerdictInput,
      placeholder: () => model ? caseReadout({...model, verdict: null}).line : ''},
  },
  onCommit(kind, lineNo, oldRaw, newValue){
    if(handleVerdictCommit(kind, newValue, {
      getText: () => editor.getText(), setText: t => editor.setText(t),
      configRe: CONFIG_RE,
      getLine: () => model ? caseReadout({...model, verdict: null}).line : '',
    })) return;
    if(kind === 'question'){
      editor.setText(setQuestion(editor.getText(), newValue));
      return;
    }
    if(kind === 'status'){
      editor.setText(setStatus(editor.getText(), newValue));
      return;
    }
    const lines = editor.getText().split('\n');
    const line = lines[lineNo] ?? '';
    const next = kind === 'label' ? editLabel(line, oldRaw, newValue) : editNote(line, oldRaw, newValue);
    if(next !== line) applyLineOps(editor, [{line: lineNo, text: next}]);
  },
});

/* ---------- exports ---------- */
wireExports({
  buttons: {dlsvg: $('dlsvg'), dlpng: $('dlpng'), copypng: $('copypng'), copymd: $('copymd')},
  getSvg: () => model ? activeRender(true) : null,
  getMarkdown: () => model ? toMarkdown(model, location.href) : '',
  slug: () => 'case-' + (model && model.title ? model.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 40) : 'file'),
});

onThemeChange(() => { lastSvg = ''; paint.reset(); refresh(); });

/* ---------- example chips ---------- */
exampleChips($('chips'), EXAMPLES, ex => editor.setText(ex.src), {start: {src: STARTER}});

wireSyntaxTry(document.querySelector('details.syntax'), editor,
  ['title', 'question', 'status', 'verdict', 'palette', 'accent']);

/* ---------- boot: hash > localStorage > example ---------- */
(async function boot(){
  const hash = await readHashState();
  let text = hash && typeof hash.t === 'string' ? hash.t : '';
  if(hash && hash.e === 0) ws.setCollapsed(true);
  if(!text){
    try{ text = localStorage.getItem('case-src') || ''; }catch(e){}
  }
  if(text) editor.setText(text);
  else if(!autoloadExample(() => editor.setText(EXAMPLES[0].src))) refresh();
})();
