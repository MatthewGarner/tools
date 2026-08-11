/* State, refresh loop, saved paths, exports, boot. */
import {parse, CONFIG_KEYS} from './parse.js';
import {project} from './project.js';
import {oversizedUrlWarning} from './evaluate.js';
import {treeProjection} from './tree.js';
import {treeLayout} from './layout-tree.js';
import {renderTree, renderOutline} from './render-tree.js';
import {verdict} from './verdict.js';
import {auditableAnswerDraft, decisionEditSurface, resolveSelectedDecision} from './inspector.js';
import {clearAnswer, clearAnswerBy, clearWhen, kinds as inspectorKinds,
  setAnswerBy, setAnswerRaw, setAssumptionRaw, setOwner, setQuestion, setReading,
  setSignal, setWhen} from './edit-targets.js';
import {applyLineOps, makeEditor, StreamLanguage, tags as t} from '../assets/editor-common.js';
import {attachEditInPlace} from '../assets/edit-in-place.js';
import {debounced, rafBatched} from '../assets/schedule.js';
import {wireExports} from '../assets/exports.js';
import {measure, isDark, themeColors, onThemeChange, renderWarningList, slugify, exampleChips} from '../assets/app-common.js';
import {readHashState, writeHashState, PALETTES, scheme} from '../assets/series.js';
import {watchNarrowBucket} from '../assets/narrow-width.js';
import {loadSaved, storeSaved, renderSavedChips} from '../assets/saved-items.js';
import {autoloadExample, shouldPersist} from '../assets/mobile.js';
import {initWorkspace, setActionsEnabled, mountTouchUndo} from '../assets/workspace.js';
import {paintKicker} from '../assets/verdict.js';
import {wireSyntaxTry} from '../assets/syntax-try.js';

const $ = id => document.getElementById(id);
const preview = $('preview');

function localToday(){
  const now = new Date();
  const pad = value => String(value).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}
const todayString = localToday();

const lang = StreamLanguage.define({
  token(stream){
    if(stream.sol()){
      const line = stream.string.trim();
      if(line.startsWith('//')){ stream.skipToEnd(); return 'comment'; }
      if(/^(title|date|today|style|verdict|palette|accent)\s*:/i.test(line)){
        stream.match(/^\s*[a-z]+\s*:/i); return 'keyword';
      }
      if(/^decision\s+[a-z0-9-]+\s*:/i.test(line)){
        stream.match(/^\s*decision\s+[a-z0-9-]+\s*:/i); return 'heading';
      }
      if(/^\s{2}(question|signal|reading|owner|answer-by|when|assume|answer)\s*:/i.test(stream.string)){
        stream.match(/^\s*(question|signal|reading|owner|answer-by|when|assume|answer)\s*:/i);
        return 'meta';
      }
    }
    if(stream.match(/^\[(?:done|doing|risk|blocked)\]/i)) return 'atom';
    if(stream.match(/^\[(?:if|unless)\s+[^\]]+\]/i)) return 'meta';
    if(stream.match(/^\/\/.*$/)) return 'comment';
    stream.next();
    return null;
  },
  languageData: {commentTokens: {line: '//'}},
});
const createEditor = makeEditor({lang, indentBar:true, highlights:[
  {tag:t.heading, color:'var(--accent-ink)', fontWeight:'700'},
  {tag:t.atom, color:'var(--st-doing)', fontWeight:'600'},
  {tag:t.meta, color:'var(--muted)', fontWeight:'600'},
]});

const HABITAT = `title: Habitat

decision reminders:
  question: Do adaptive reminders improve week-four retention?
  signal: week-four retention in the reminder experiment
  reading: +6 percentage points
  owner: Core
  answer-by: 2026-07-24
  answer: yes 2026-07-22 -- experiment HBT-42

decision groups:
  question: Will people invite three friends without prompting?
  signal: invites per active user
  reading: 2.4 invites per active user
  owner: Growth
  answer-by: 2026-09-15

decision pricing:
  question: Will coaches accept a revenue share?
  signal: accepted offers in the coach pilot
  reading: 3 of 10 accepted
  owner: Marketplace
  answer-by: 2026-08-01
  assume: no 2026-08-02

NOW
  Core: Streak repair [done]
  Core: Adaptive reminder rollout [doing] [if reminders]
  Growth: Friend invite prompt [risk] [if groups]

NEXT
  Platform: Group moderation [blocked] [if groups and not pricing]
  Marketplace: Fixed-fee coach pilot [if not pricing]

LATER
  Core: Weekly digest [unless reminders]
  Growth: Group challenges [if groups]`;

const EXAMPLES = [{name:'Habitat', src:HABITAT}];
let model = null, projection = null, topology = null, lastSvg = '', hashTimer = null;
let urlStateOversized = false, hashAttempt = 0;
let selectedDecision = null;
let focusInspectorAfterRender = false;

function colorsFor(current){
  const colors = themeColors();
  const accent = current?.accent || PALETTES[current?.palette]?.[isDark() ? 'dark' : 'light'];
  return accent ? {...colors, ...scheme(accent, isDark())} : colors;
}

function context(current, extra = {}){
  return {colors:colorsFor(current), measure, dark:isDark(), today:projection?.today || todayString,
    projection, ...extra};
}

function renderWarnings(){
  const warnings = projection ? [...projection.warnings] : [];
  if(urlStateOversized) warnings.push(oversizedUrlWarning());
  renderWarningList($('warns'), warnings.map(warning => warning.message || String(warning)));
}

function node(tag, className, text){
  const element = document.createElement(tag);
  if(className) element.className = className;
  if(text !== undefined) element.textContent = text;
  return element;
}

function editableValue(view, field){
  const row = node('div', 'inspector-field ' + (field.className || ''));
  row.appendChild(node('span', 'inspector-label', field.label));
  const button = node('button', 'inspector-value', field.raw || field.fallback);
  button.type = 'button';
  button.dataset.edit = field.kind;
  button.dataset.line = String(view.srcLine);
  button.dataset.raw = field.raw;
  button.setAttribute('aria-label', 'Edit ' + field.label.toLowerCase());
  if(!field.raw) button.classList.add('empty');
  row.appendChild(button);
  return row;
}

function renderInspector(){
  const host = $('decision-inspector');
  const resolved = resolveSelectedDecision(projection, selectedDecision);
  if(!resolved){
    selectedDecision = null;
    host.hidden = true;
    host.replaceChildren();
    return;
  }
  selectedDecision = {key:resolved.key, srcLine:resolved.srcLine};
  const selectedQuestion = topology?.questions?.find(question => question.key === resolved.key);
  const surface = decisionEditSurface(selectedQuestion);
  if(!surface){
    selectedDecision = null;
    host.hidden = true;
    host.replaceChildren();
    return;
  }
  const {view, fields} = surface;
  const editField = kind => fields.find(field => field.kind === kind);
  host.hidden = false;
  host.replaceChildren();

  const head = node('div', 'inspector-head');
  const identity = node('div', 'inspector-identity');
  identity.appendChild(node('p', 'inspector-kicker', 'Decision receipt'));
  const title = node('h2', '', view.name);
  title.id = 'decision-inspector-title';
  title.tabIndex = -1;
  identity.appendChild(title);
  head.appendChild(identity);
  const close = node('button', 'inspector-close', 'Close');
  close.type = 'button';
  close.dataset.inspectorClose = '';
  close.setAttribute('aria-label', 'Close decision inspector');
  head.appendChild(close);
  host.appendChild(head);

  host.appendChild(editableValue(view, editField('question')));

  const flags = node('div', 'inspector-flags');
  for(const flag of [view.availability, view.testability]){
    const chip = node('span', 'inspector-flag', flag.label);
    chip.dataset.state = flag.kind;
    flags.appendChild(chip);
  }
  host.appendChild(flags);

  const ledger = node('div', 'inspector-ledger');
  for(const kind of ['signal', 'reading', 'owner', 'answer-by', 'assume', 'when'])
    ledger.appendChild(editableValue(view, editField(kind)));
  host.appendChild(ledger);

  const arms = node('section', 'inspector-arms');
  arms.setAttribute('aria-label', 'Affected work by answer');
  for(const [direction, label] of [['yes', 'If so'], ['no', 'If not']]){
    const arm = node('div', 'inspector-arm');
    arm.appendChild(node('h3', '', label));
    const items = view.arms[direction];
    if(!items.length) arm.appendChild(node('p', 'inspector-arm-empty',
      'No work depends on this answer.'));
    else {
      const list = node('ul', 'inspector-work');
      for(const item of items){
        const entry = node('li', '');
        entry.appendChild(node('span', 'inspector-work-title', item.title));
        entry.appendChild(node('span', 'inspector-work-meta',
          [item.status ? item.status.toUpperCase() : '', item.treatment].filter(Boolean).join(' · ')));
        list.appendChild(entry);
      }
      arm.appendChild(list);
    }
    arms.appendChild(arm);
  }
  host.appendChild(arms);

  const answer = node('div', 'inspector-answer');
  answer.appendChild(editableValue(view, editField('answer')));
  const controls = node('div', 'inspector-answer-actions');
  controls.appendChild(node('p', 'inspector-answer-help', view.answerActionsEnabled
    ? 'Choose a direction, then confirm its date and receipt.'
    : 'This answer is source history; it is not active here.'));
  for(const direction of ['yes', 'no']){
    const button = node('button', 'btn', 'Answer ' + direction);
    button.type = 'button';
    button.dataset.answerDirection = direction;
    button.setAttribute('aria-pressed', String(resolved.answer?.direction === direction));
    button.disabled = !view.answerActionsEnabled;
    controls.appendChild(button);
  }
  const clear = node('button', 'btn', view.answerActionsEnabled ? 'Clear answer' : 'Clear held answer');
  clear.type = 'button';
  clear.dataset.clearAnswer = '';
  clear.disabled = !resolved.answers?.length;
  controls.appendChild(clear);
  answer.appendChild(controls);
  if(view.answerNotice) answer.appendChild(node('p', 'inspector-answer-notice', view.answerNotice));
  host.appendChild(answer);
  if(focusInspectorAfterRender){
    focusInspectorAfterRender = false;
    title.focus({preventScroll:false});
  }
}

async function writeHash(){
  if(!shouldPersist()) return;
  const attempt = ++hashAttempt;
  const ok = await writeHashState({t:editor.getText(), ...(ws.collapsed() ? {e:0} : {})});
  if(attempt !== hashAttempt) return;
  const oversized = !ok;
  if(oversized !== urlStateOversized){
    urlStateOversized = oversized;
    renderWarnings();
  }
}

function doRefresh(){
  const text = editor.getText();
  model = parse(text);
  projection = project(model, todayString);
  topology = treeProjection(projection);
  const retained = resolveSelectedDecision(projection, selectedDecision);
  selectedDecision = retained ? {key:retained.key, srcLine:retained.srcLine} : null;
  renderWarnings();
  const readout = verdict(projection);
  const counts = `${projection.decisions.length} ${projection.decisions.length === 1 ? 'question' : 'questions'}, ` +
    `${projection.items.length} ${projection.items.length === 1 ? 'item' : 'items'}`;
  $('summary').textContent = `${model.title || 'Untitled paths'}. ${counts}${readout?.line ? `. ${readout.line}` : ''}`;

  if(!model.items.length && !model.decisions.length){
    lastSvg = '';
    preview.innerHTML = `<p class="placeholder">${text.trim()
      ? 'No paths yet — add a decision or an item under a period.'
      : 'Start typing — or load an example.'}</p>`;
  } else {
    const width = preview.clientWidth;
    const narrow = width > 0 && width < 520;
    const interactive = {interactive:true, selectedKey:selectedDecision?.key || null};
    const svg = narrow
      ? renderOutline(topology, context(model, {width, ...interactive}))
      : renderTree(topology, treeLayout(topology, {width:width || 1160, measure}),
        context(model, interactive));
    if(svg !== lastSvg){ preview.innerHTML = svg; lastSvg = svg; }
  }

  renderInspector();

  setActionsEnabled(!!lastSvg);
  try{ if(shouldPersist()) localStorage.setItem('paths-src', text); }catch(_){ }
  clearTimeout(hashTimer);
  hashTimer = setTimeout(writeHash, 400);
}
const refresh = rafBatched(doRefresh);

const editor = createEditor({
  parent:$('cmhost'),
  doc:'',
  onChange:debounced(refresh, 120),
});

function decisionOps(kind, line, value){
  const text = editor.getText();
  if(kind === 'question') return setQuestion(text, line, value);
  if(kind === 'signal') return setSignal(text, line, value);
  if(kind === 'reading') return setReading(text, line, value);
  if(kind === 'owner') return setOwner(text, line, value);
  if(kind === 'answer-by') return value ? setAnswerBy(text, line, value) : clearAnswerBy(text, line);
  if(kind === 'assume') return setAssumptionRaw(text, line, value);
  if(kind === 'when') return value ? setWhen(text, line, value) : clearWhen(text, line);
  if(kind === 'answer') return setAnswerRaw(text, line, value);
  return null;
}

attachEditInPlace($('decision-inspector'), {
  kinds:inspectorKinds,
  onCommit(kind, line, _raw, value){
    const ops = decisionOps(kind, line, value);
    if(ops?.length) applyLineOps(editor, ops);
  },
});

function chooseDecision(target, focusInspector = false){
  const choice = {key:target.dataset.decisionKey, srcLine:Number(target.dataset.line)};
  const resolved = resolveSelectedDecision(projection, choice);
  if(!resolved) return;
  selectedDecision = {key:resolved.key, srcLine:resolved.srcLine};
  focusInspectorAfterRender = focusInspector;
  lastSvg = '';
  refresh();
}

preview.addEventListener('click', event => {
  const target = event.target.closest?.('[data-select-decision]');
  if(!target || !preview.contains(target)) return;
  event.preventDefault();
  chooseDecision(target, false);
});
preview.addEventListener('keydown', event => {
  if(event.key !== 'Enter' && event.key !== ' ' && event.key !== 'Spacebar') return;
  const target = event.target.closest?.('[data-select-decision]');
  if(!target || !preview.contains(target)) return;
  event.preventDefault();
  chooseDecision(target, true);
});

$('decision-inspector').addEventListener('click', event => {
  if(event.target.closest?.('[data-inspector-close]')){
    selectedDecision = null;
    lastSvg = '';
    refresh();
    return;
  }
  const direction = event.target.closest?.('[data-answer-direction]')?.dataset.answerDirection;
  const clear = event.target.closest?.('[data-clear-answer]');
  if(!direction && !clear) return;
  const resolved = resolveSelectedDecision(projection, selectedDecision);
  if(!resolved) return;
  if(direction){
    const target = $('decision-inspector').querySelector('[data-edit="answer"]');
    if(!target) return;
    target.click();
    const input = document.querySelector('.eip-input');
    if(!input) return;
    input.value = auditableAnswerDraft(resolved, direction, projection?.today || todayString);
    input.setAttribute('aria-label', 'Confirm ' + direction + ' answer date and receipt');
    input.placeholder = 'Add a receipt, or remove “--” to keep the dated answer';
    input.setSelectionRange(input.value.length, input.value.length);
    return;
  }
  const ops = clearAnswer(editor.getText(), resolved.srcLine);
  if(ops?.length) applyLineOps(editor, ops);
});
mountTouchUndo(document.querySelector('.stage .actions'), editor);
const ws = initWorkspace({
  workspace:$('workspace'), tab:$('railtab'), preview, zoomHost:$('zoomctl'),
  onCollapseChange(){ clearTimeout(hashTimer); hashTimer = setTimeout(writeHash, 100); },
});

exampleChips($('chips'), EXAMPLES, example => editor.setText(example.src));

const SAVED_KEY = 'paths-saved';
function renderSaved(){
  const row = $('savedrow');
  renderSavedChips(row, loadSaved(SAVED_KEY), {
    deleteLabel:item => 'Delete saved paths ' + item.name,
    onLoad:item => editor.setText(item.src),
    onDelete:(_item, index) => {
      const list = loadSaved(SAVED_KEY);
      list.splice(index, 1);
      storeSaved(SAVED_KEY, list);
      renderSaved();
    },
  });
  const save = document.createElement('button');
  save.className = 'chip';
  save.textContent = '＋ Save current';
  save.addEventListener('click', () => {
    if(!model || (!model.items.length && !model.decisions.length)) return;
    const list = loadSaved(SAVED_KEY);
    list.push({name:(model.title || `Paths ${list.length + 1}`).slice(0, 28), src:editor.getText()});
    storeSaved(SAVED_KEY, list);
    renderSaved();
  });
  row.appendChild(save);
}

function wideSvg(){
  if(!model || !topology || (!model.items.length && !model.decisions.length)) return null;
  const layout = treeLayout(topology, {width:1160, measure});
  return renderTree(topology, layout, context(model));
}
wireExports({
  buttons:{copypng:$('copypng'), dlpng:$('dlpng'), dlsvg:$('dlsvg')},
  getSvg:wideSvg,
  slug:() => slugify(model?.title, 'paths'),
});

paintKicker($('kicker'), '16', 'The questions inside the plan');
wireSyntaxTry(document.querySelector('details.syntax'), editor, CONFIG_KEYS);

function rerender(){ lastSvg = ''; refresh(); }
watchNarrowBucket(preview, rerender);
onThemeChange(rerender);

(async function boot(){
  const hash = await readHashState();
  let text = hash && typeof hash.t === 'string' ? hash.t : '';
  if(hash && hash.e === 0) ws.setCollapsed(true);
  if(!text){
    try{ text = localStorage.getItem('paths-src') || ''; }catch(_){ }
  }
  renderSaved();
  if(text) editor.setText(text);
  else if(!autoloadExample(() => editor.setText(HABITAT))) refresh();
})();

export {HABITAT};
