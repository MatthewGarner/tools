/* URL-local Proxy Hunt shell: source -> parse -> project -> render. */
import {parse} from './parse.js';
import {project} from './project.js';
import {fullHuntProjection} from './export-projection.js';
import {renderHunt, renderHuntNarrow, renderHuntReceipt} from './render-hunt.js';
import {createEditor} from './editor.js';
import {EXAMPLES} from './example.js';
import {readHashState, writeHashState} from '../assets/series.js';
import {download, isDark, measure, pngRasterPlan, slugify, svgToCanvas, themeColors,
  onThemeChange, renderWarningList, exampleChips} from '../assets/app-common.js';
import {wireExports} from '../assets/exports.js';
import {debounced, rafBatched} from '../assets/schedule.js';
import {initWorkspace, setActionsEnabled, mountTouchUndo} from '../assets/workspace.js';
import {narrowWidth, watchNarrowBucket} from '../assets/narrow-width.js';
import {autoloadExample, shouldPersist} from '../assets/mobile.js';
import {loadSaved, storeSaved, renderSavedChips} from '../assets/saved-items.js';
import {paintKicker, paintMetrics, paintVerdict, wireCopyVerdict} from '../assets/verdict.js';
import {attachEditInPlace} from '../assets/edit-in-place.js';
import {verdictMenuRows, handleVerdictCommit, validVerdictInput} from '../assets/verdict-edit.js';
import {wireSyntaxTry} from '../assets/syntax-try.js';
import {STARTER} from './starter.js';

const $ = id => document.getElementById(id);
paintKicker($('kicker'), '17', 'Test the measure, not the story');
wireCopyVerdict($('verdict'));

let model = null, hunt = null, selectedTheoryId = null, lastSvg = '', hashTimer = null;
const preview = $('preview');
const CAUSAL_LIMIT = 'The mechanism is an authored hypothesis, not proof of causal effect.';
const CONFIG_RE = /^(title|date|outcome|proxy|action|mode|optimisation-pressure|trade-off|decision-rule|verdict|palette|accent)\s*:/i;

function theoryCount(){ return hunt?.failureTheories?.length || 0; }
function readyCount(){ return (hunt?.failureTheories || []).filter(theory => theory.status === 'ready').length; }
function liveSvg(){
  if(!hunt) return '';
  const ctx = {colors:themeColors(), dark:isDark(), measure, interactive:true};
  const width = narrowWidth(preview);
  return width ? renderHuntNarrow(hunt, {...ctx, width}) : renderHunt(hunt, ctx);
}
function fullSvg(){
  if(!model || !hunt) return null;
  /* Static full exports are invariant to the transient live selection. */
  return renderHunt(fullHuntProjection(model),
    {colors:themeColors(), dark:isDark(), measure, interactive:false});
}
function receiptSvg(){
  if(!hunt?.selectedReceipt) return null;
  return renderHuntReceipt(hunt, {colors:themeColors(), dark:isDark(), measure});
}
function writeHash(){
  if(!shouldPersist()) return;
  const state = {t:editor.getText()};
  if(selectedTheoryId) state.s = selectedTheoryId;
  if(ws.collapsed()) state.e = 0;
  writeHashState(state);
}
function scheduleHash(delay = 400){ clearTimeout(hashTimer); hashTimer = setTimeout(writeHash, delay); }

function renderChrome(){
  if(!hunt){
    paintMetrics($('metrics'), '', []);
    paintVerdict($('verdict'), '', '');
    paintAuthorVerdict();
    $('causalnote').textContent = '';
    $('viewreceipt').disabled = true;
    return;
  }
  const pattern = hunt.reportedPattern
    ? (hunt.reportedPattern.complete ? 'author-reported pattern' : 'reported pattern incomplete')
    : 'no reported pattern';
  paintMetrics($('metrics'), hunt.title || 'Untitled hunt', [
    `${theoryCount()} of 3 failure theories`,
    `${readyCount()} fully stated`,
    hunt.target.mode || 'mode missing',
    pattern,
  ]);
  paintVerdict($('verdict'), hunt.verdict?.line || '', '');
  const toolKicker = $('verdict').querySelector('.vkick');
  if(toolKicker) toolKicker.textContent = 'Review state · tool-derived';
  paintAuthorVerdict();
  $('causalnote').textContent = `Causal limit — ${hunt.selectedReceipt?.causalLimitation || hunt.verdict?.limit || CAUSAL_LIMIT}`;
  $('selectionnote').textContent = hunt.selectedReceipt
    ? `Selected theory: ${hunt.selectedReceipt.id}`
    : 'Select a failure theory to inspect its scoped receipt.';
  $('viewreceipt').disabled = !hunt.selectedReceipt;
}

/* This is deliberately a second surface: an authored note can travel with a
   shared hunt, but cannot repaint or suppress the computed review state. */
function paintAuthorVerdict(){
  const raw = model?.verdict;
  const authored = hunt?.authoredVerdict || null;
  const statement = $('authorverdict');
  const add = $('authorverdictadd');
  const boundary = $('authorverdictboundary');
  for(const target of [statement, add]){
    target.dataset.raw = raw == null ? '' : String(raw);
    target.dataset.verdicteditRaw = raw == null ? '' : String(raw);
  }
  if(authored){
    paintVerdict(statement, authored.line, authored.fig);
    const kicker = statement.querySelector('.vkick');
    if(kicker) kicker.textContent = 'Author-stated verdict · hunt-level';
    statement.hidden = false;
    add.hidden = true;
    boundary.hidden = false;
    return;
  }
  statement.hidden = true;
  boundary.hidden = true;
  add.hidden = false;
  add.textContent = raw != null && (!String(raw).trim() || String(raw).trim().toLowerCase() === 'off')
    ? 'Author-stated verdict: off'
    : 'Add author-stated verdict';
}

function doRefresh(){
  const text = editor.getText();
  model = parse(text);
  const projected = project(model, selectedTheoryId);
  const renderable = Boolean(model.outcome || model.proxy || model.action || model.failureTheories.length);
  if(!renderable){
    hunt = null; selectedTheoryId = null; lastSvg = '';
    preview.innerHTML = `<p class="placeholder">${text.trim()
      ? 'No hunt yet — name an outcome, proxy and action.'
      : 'Start typing — or load an example.'}</p>`;
  } else {
    hunt = projected;
    selectedTheoryId = projected.selectedTheoryId;
    lastSvg = liveSvg();
    preview.innerHTML = lastSvg;
    ws.applyZoom();
  }
  renderChrome();
  renderWarningList($('warns'), model.warnings || []);
  setActionsEnabled(Boolean(lastSvg));
  $('receiptpng').disabled = !hunt?.selectedReceipt;
  $('receiptsvg').disabled = !hunt?.selectedReceipt;
  try{ if(shouldPersist()) localStorage.setItem('proxy-src', text); }catch(_){ }
  scheduleHash();
}
const refresh = rafBatched(doRefresh);
const editor = createEditor({parent:$('cmhost'), doc:'', onChange:debounced(refresh, 120)});
mountTouchUndo(document.querySelector('.stage .actions'), editor);
const ws = initWorkspace({
  workspace:$('workspace'), tab:$('railtab'), preview, zoomHost:$('zoomctl'),
  initialReading:'when-guarded',
  focusEditor:() => editor.view.focus(),
  onCollapseChange(){ scheduleHash(100); },
});

attachEditInPlace(document.querySelector('.stage'), {
  kinds: {
    verdict: {menu: () => verdictMenuRows(model && model.verdict)},
    verdictedit: {validate: validVerdictInput,
      placeholder: () => hunt?.verdict?.line || ''},
  },
  onCommit(kind, _line, _raw, newValue){
    handleVerdictCommit(kind, newValue, {
      getText: () => editor.getText(),
      setText: text => editor.setText(text),
      configRe: CONFIG_RE,
      getLine: () => hunt?.authoredVerdict?.line || hunt?.verdict?.line || '',
    });
  },
});

function focusReceipt(){
  const receipt = preview.querySelector('[data-kind="selected-theory-receipt"]');
  if(!receipt) return;
  receipt.focus({preventScroll:true});
  receipt.scrollIntoView({block:'nearest', inline:'nearest'});
}
function selectTheory(id, {focusReceiptAfter = false} = {}){
  if(!model || !model.failureTheories.some(theory => theory.id === id)) return;
  selectedTheoryId = id;
  hunt = project(model, id);
  lastSvg = liveSvg();
  preview.innerHTML = lastSvg;
  ws.applyZoom();
  renderChrome();
  if(focusReceiptAfter) queueMicrotask(focusReceipt);
  scheduleHash(50);
}
preview.addEventListener('click', event => {
  const target = event.target.closest?.('[data-select-theory]');
  const card = target?.closest?.('[data-theory-id]') || target;
  if(card?.dataset.theoryId) selectTheory(card.dataset.theoryId, {focusReceiptAfter:true});
});
preview.addEventListener('keydown', event => {
  if(event.key !== 'Enter' && event.key !== ' ') return;
  const target = event.target.closest?.('[data-select-theory]');
  const card = target?.closest?.('[data-theory-id]') || target;
  if(!card?.dataset.theoryId) return;
  event.preventDefault();
  selectTheory(card.dataset.theoryId, {focusReceiptAfter:true});
});
$('viewreceipt').addEventListener('click', focusReceipt);

watchNarrowBucket(preview, () => { if(hunt){ lastSvg = liveSvg(); preview.innerHTML = lastSvg; ws.applyZoom(); } });
onThemeChange(() => { if(hunt){ lastSvg = liveSvg(); preview.innerHTML = lastSvg; ws.applyZoom(); } });

exampleChips($('chips'), EXAMPLES, example => { selectedTheoryId = null; editor.setText(example.src); }, {start: {src: STARTER}});
const SAVED_KEY = 'proxy-saved';
function renderSaved(){
  const host = $('savedrow');
  renderSavedChips(host, loadSaved(SAVED_KEY), {
    deleteLabel:item => `Delete saved hunt ${item.name}`,
    onLoad:item => { selectedTheoryId = item.selectedTheoryId || null; editor.setText(item.src); },
    onDelete:(_item, index) => {
      const list = loadSaved(SAVED_KEY); list.splice(index, 1); storeSaved(SAVED_KEY, list); renderSaved();
    },
  });
  const save = document.createElement('button');
  save.className = 'chip'; save.type = 'button'; save.textContent = '＋ Save current';
  save.addEventListener('click', () => {
    if(!hunt) return;
    const list = loadSaved(SAVED_KEY);
    list.push({name:(hunt.title || `Hunt ${list.length + 1}`).slice(0, 32), src:editor.getText(), selectedTheoryId});
    storeSaved(SAVED_KEY, list); renderSaved();
  });
  host.appendChild(save);
}

wireExports({
  buttons:{copypng:$('copypng'), dlpng:$('dlpng'), dlsvg:$('dlsvg')},
  getSvg:fullSvg,
  slug:() => slugify(`${hunt?.title || 'proxy-hunt'}-full-hunt`, 'proxy-hunt'),
});

function flash(button, message, original){
  button.textContent = message;
  setTimeout(() => { button.textContent = original; }, 2000);
}
$('receiptsvg').addEventListener('click', () => {
  const svg = receiptSvg(); if(!svg) return;
  download(`${slugify(hunt.title || 'proxy-hunt', 'proxy-hunt')}-${slugify(selectedTheoryId, 'theory')}-receipt.svg`,
    new Blob([svg], {type:'image/svg+xml'}));
});
$('receiptpng').addEventListener('click', () => {
  const svg = receiptSvg(); if(!svg) return;
  const button = $('receiptpng'), original = 'Receipt PNG', plan = pngRasterPlan(svg);
  if(!plan.ok){ flash(button, 'Receipt too large — use SVG', original); return; }
  svgToCanvas(svg, canvas => canvas.toBlob(blob => {
    if(!blob){ flash(button, 'PNG unavailable — use SVG', original); return; }
    download(`${slugify(hunt.title || 'proxy-hunt', 'proxy-hunt')}-${slugify(selectedTheoryId, 'theory')}-receipt.png`, blob);
  }, 'image/png'), () => flash(button, 'PNG unavailable — use SVG', original));
});

renderSaved();
wireSyntaxTry(document.querySelector('details.syntax'), editor,
  ['title', 'date', 'outcome', 'proxy', 'action', 'mode', 'optimisation-pressure', 'trade-off', 'decision-rule',
    'verdict', 'palette', 'accent']);

(async function boot(){
  const hash = await readHashState();
  let text = hash && typeof hash.t === 'string' ? hash.t : '';
  if(hash && typeof hash.s === 'string') selectedTheoryId = hash.s;
  if(hash && hash.e === 0) ws.setCollapsed(true);
  if(!text){ try{ text = localStorage.getItem('proxy-src') || ''; }catch(_){ } }
  if(text) editor.setText(text);
  else autoloadExample(() => editor.setText(EXAMPLES[0].src));
})();
