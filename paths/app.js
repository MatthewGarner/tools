/* State, refresh loop, saved paths, exports, boot. */
import {parse, CONFIG_KEYS} from './parse.js';
import {project} from './project.js';
import {oversizedUrlWarning} from './evaluate.js';
import {treeProjection} from './tree.js';
import {treeLayout} from './layout-tree.js';
import {renderTree, renderOutline} from './render-tree.js';
import {renderPlans, renderPlansNarrow} from './render-plans.js';
import {buildRoadmapProjection, deliveryAssignment, inspectRoadmapProjection,
  projectionAcceptance, roadmapProjectionChoices} from './handoff-roadmap.js';
import {verdict} from './verdict.js';
import {auditableAnswerDraft, decisionEditSurface, resolveSelectedDecision} from './inspector.js';
import {clearAnswer, clearAnswerBy, clearWhen, kinds as inspectorKinds,
  setAnswerBy, setAnswerRaw, setAssumptionRaw, setOwner, setQuestion, setReading,
  setSignal, setStyle, setWhen} from './edit-targets.js';
import {applyLineOps, makeEditor, StreamLanguage, tags as t} from '../assets/editor-common.js';
import {attachEditInPlace} from '../assets/edit-in-place.js';
import {debounced, rafBatched} from '../assets/schedule.js';
import {wireExports} from '../assets/exports.js';
import {measure, isDark, themeColors, onThemeChange, renderWarningList, slugify, exampleChips} from '../assets/app-common.js';
import {encodeHash, readHashState, writeHashState, PALETTES, scheme} from '../assets/series.js';
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
let projectionSource = null, projectionRevision = 0;
let selectedProjectionKey = null, selectedProjectionAnswers = null, selectedProjectionFingerprint = null;
let acceptedProjectionAssumptions = new Set(), projectionPanelMessage = '';
let projectionChoiceCacheModel = null, projectionChoiceCache = [], projectionChoiceProblem = '';

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

function resetProjectionChoice(){
  selectedProjectionKey = null;
  selectedProjectionAnswers = null;
  selectedProjectionFingerprint = null;
  acceptedProjectionAssumptions = new Set();
  projectionPanelMessage = '';
}

function answerName(key){
  return model?.decisionByName?.[key]?.name || key;
}

function answerLabel(key, direction){
  return `${answerName(key)} — ${direction === 'yes' ? 'Yes' : 'No'}`;
}

function projectionChoices(){
  if(projectionChoiceCacheModel === model) return projectionChoiceCache;
  const rows = [];
  const planRefs = new Map();
  projectionChoiceProblem = '';
  for(const [planIndex, plan] of (projection?.worlds?.plans || []).entries()){
    for(const assignment of plan.assignments || []){
      const answers = deliveryAssignment(model, assignment.answers);
      if(!answers) continue;
      const inspected = inspectRoadmapProjection(model, todayString, answers);
      if(!inspected.ok) continue;
      if(!planRefs.has(inspected.fingerprint)) planRefs.set(inspected.fingerprint, new Set());
      planRefs.get(inspected.fingerprint).add(planIndex + 1);
    }
  }
  const choices = roadmapProjectionChoices(model, todayString);
  if(!choices.ok){
    projectionChoiceProblem = choices.reason;
  } else for(const [outcomeIndex, assignment] of choices.choices.entries()){
    const answers = assignment.answers;
    const key = assignment.assignmentKey;
    const inspected = assignment.inspected;
    const exactBasis = inspected.ok
      ? [...inspected.receipt.known, ...inspected.receipt.assumed]
      : Object.entries(answers).map(([decisionKey, direction]) => ({key:decisionKey, direction}));
    const parts = exactBasis.map(entry => answerLabel(entry.key, entry.direction));
    const refs = [...(planRefs.get(inspected.fingerprint) || [])];
    const planReference = refs.length === 1 ? `Possible plan ${refs[0]}`
      : refs.length ? `Possible plans ${refs.join(', ')}` : 'Delivery-only outcome';
    rows.push({key, answers:{...answers}, inspected,
      reference:`${planReference} · Exact outcome ${outcomeIndex + 1}`,
      label:parts.length ? parts.join(' · ') : 'Current answered world'});
  }
  projectionChoiceCacheModel = model;
  projectionChoiceCache = rows;
  return projectionChoiceCache;
}

function receiptReason(entry){
  if(entry.reason?.kind === 'moot'){
    const host = entry.reason.host || entry.reason.hostKey || 'an earlier decision';
    const direction = entry.reason.direction ? ` was answered ${entry.reason.direction}` : ' made it unnecessary';
    return `Did not arise because ${host}${direction}.`;
  }
  if(entry.reason?.kind === 'dormant'){
    const hosts = (entry.reason.waitingFor || []).map(answerName);
    return hosts.length ? `Not open in this world; it waits for ${hosts.join(', ')}.` : 'Not open in this world.';
  }
  return 'Not active in this world.';
}

function receiptList(title, className, entries, empty, renderer){
  const section = node('section', `projection-ledger ${className}`);
  section.appendChild(node('h4', '', title));
  if(!entries.length){
    section.appendChild(node('p', 'projection-ledger-empty', empty));
    return section;
  }
  const list = node('ul', 'projection-ledger-list');
  for(const entry of entries) list.appendChild(renderer(entry));
  section.appendChild(list);
  return section;
}

function renderProjectionPanel(){
  const host = $('roadmap-projection');
  if(model?.style !== 'plans'){
    host.hidden = true;
    host.replaceChildren();
    return;
  }
  host.hidden = false;
  host.replaceChildren();

  const head = node('header', 'projection-head');
  const headCopy = node('div', '');
  headCopy.appendChild(node('p', 'projection-kicker', 'Delivery projection'));
  const title = node('h2', '', 'Choose one exact outcome');
  title.id = 'roadmap-projection-title';
  title.tabIndex = -1;
  headCopy.appendChild(title);
  headCopy.appendChild(node('p', 'projection-intro',
    'Possible Plans groups matching work shapes. A Roadmap needs one exact set of answers.'));
  head.appendChild(headCopy);
  host.appendChild(head);

  const body = node('div', 'projection-body');
  const choicesHost = node('fieldset', 'projection-choices');
  choicesHost.appendChild(node('legend', '', 'Exact outcomes'));
  const choices = projectionChoices();
  if(!choices.length){
    choicesHost.appendChild(node('p', 'projection-empty',
      projectionChoiceProblem || 'No exact outcome is available from the current Paths source.'));
  } else {
    for(const choice of choices){
      const label = node('label', 'projection-choice');
      label.dataset.available = String(choice.inspected.ok);
      const radio = node('input', '');
      radio.type = 'radio';
      radio.name = 'roadmap-projection-world';
      radio.value = choice.key;
      radio.checked = choice.key === selectedProjectionKey;
      radio.disabled = !choice.inspected.ok;
      label.appendChild(radio);
      const copy = node('span', 'projection-choice-copy');
      copy.appendChild(node('span', 'projection-choice-reference', choice.reference));
      copy.appendChild(node('span', 'projection-choice-line', choice.label));
      copy.appendChild(node('span', 'projection-choice-state', choice.inspected.ok
        ? 'Ready to confirm'
        : `Unavailable — ${choice.inspected.reason}`));
      label.appendChild(copy);
      choicesHost.appendChild(label);
    }
  }
  choicesHost.appendChild(node('p', 'projection-scope',
    'Select one ready outcome. Only decisions that affect delivery appear here; unrelated questions stay in Paths.'));
  body.appendChild(choicesHost);

  const selected = choices.find(choice => choice.key === selectedProjectionKey && choice.inspected.ok);
  if(!selected) body.classList.add('is-unselected');
  if(selected){
    const receipt = selected.inspected.receipt;
    const confirmation = node('section', 'projection-confirmation');
    confirmation.setAttribute('aria-labelledby', 'projection-confirmation-title');
    confirmation.setAttribute('aria-live', 'polite');
    const confirmationTitle = node('h3', '', 'Confirm this delivery basis');
    confirmationTitle.id = 'projection-confirmation-title';
    confirmationTitle.tabIndex = -1;
    confirmation.appendChild(confirmationTitle);

    confirmation.appendChild(receiptList('Known from Paths', 'known', receipt.known,
      'No active answer is already recorded in Paths.', entry => {
        const item = node('li', '');
        item.appendChild(node('strong', '', answerLabel(entry.key, entry.direction)));
        item.appendChild(node('span', '', `Answered ${entry.date}`));
        return item;
      }));

    confirmation.appendChild(receiptList('Assumed for this delivery projection', 'assumed', receipt.assumed,
      'No assumptions are needed for this outcome.', entry => {
        const item = node('li', '');
        const label = node('label', 'projection-assumption');
        const checkbox = node('input', '');
        checkbox.type = 'checkbox';
        checkbox.value = entry.key;
        checkbox.checked = acceptedProjectionAssumptions.has(entry.key);
        const wording = node('span', '');
        wording.appendChild(node('strong', '', answerLabel(entry.key, entry.direction)));
        wording.appendChild(node('span', '', `Treat as true on ${entry.date} for this projection`));
        label.appendChild(checkbox);
        label.appendChild(wording);
        item.appendChild(label);
        return item;
      }));

    confirmation.appendChild(receiptList('Not part', 'omitted', receipt.omitted,
      'Every relevant decision is active in this outcome.', entry => {
        const item = node('li', '');
        item.appendChild(node('strong', '', entry.name));
        item.appendChild(node('span', '', receiptReason(entry)));
        return item;
      }));

    const foot = node('div', 'projection-foot');
    foot.appendChild(node('p', 'projection-separation',
      'This creates a new Roadmap. It does not answer or alter Paths.'));
    if(projectionPanelMessage){
      const message = node('p', 'projection-message', projectionPanelMessage);
      message.setAttribute('role', 'status');
      foot.appendChild(message);
    }
    const allAccepted = receipt.assumed.every(entry => acceptedProjectionAssumptions.has(entry.key));
    const create = node('button', 'btn primary projection-create', 'Create Roadmap with this basis');
    create.type = 'button';
    create.dataset.createRoadmap = '';
    create.disabled = !allAccepted;
    foot.appendChild(create);
    confirmation.appendChild(foot);
    body.appendChild(confirmation);
  } else if(projectionPanelMessage){
    const message = node('p', 'projection-message', projectionPanelMessage);
    message.setAttribute('role', 'status');
    choicesHost.appendChild(message);
  }
  host.appendChild(body);
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
  if(text !== projectionSource){
    projectionSource = text;
    projectionRevision++;
    resetProjectionChoice();
  }
  model = parse(text);
  projection = project(model, todayString);
  const plansView = model.style === 'plans';
  topology = plansView ? null : treeProjection(projection);
  const retained = plansView ? null : resolveSelectedDecision(projection, selectedDecision);
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
    let svg;
    if(plansView){
      svg = narrow
        ? renderPlansNarrow(projection, context(model, {width}))
        : renderPlans(projection, context(model, {width:width || 1160}));
    } else {
      const interactive = {interactive:true, selectedKey:selectedDecision?.key || null};
      svg = narrow
        ? renderOutline(topology, context(model, {width, ...interactive}))
        : renderTree(topology, treeLayout(topology, {width:width || 1160, measure}),
          context(model, interactive));
    }
    if(svg !== lastSvg){ preview.innerHTML = svg; lastSvg = svg; }
  }

  if(plansView){
    selectedDecision = null;
    $('decision-inspector').hidden = true;
    $('decision-inspector').replaceChildren();
  } else renderInspector();
  renderProjectionPanel();
  for(const button of $('paths-view-switch').querySelectorAll('[data-paths-view]')){
    const active = button.dataset.pathsView === model.style;
    button.classList.toggle('on', active);
    button.setAttribute('aria-pressed', String(active));
  }
  const projectionJump = $('paths-projection-jump');
  projectionJump.hidden = !plansView;
  if(plansView){
    const ready = projectionChoices().filter(choice => choice.inspected.ok).length;
    projectionJump.replaceChildren(
      document.createTextNode(`Choose exact outcome · ${ready} ready `),
      node('span', '', '↓'));
    projectionJump.lastElementChild.setAttribute('aria-hidden', 'true');
  }
  $('view-method').textContent = plansView
    ? 'The phone view groups work by possible plan; every export remains the wide matrix.'
    : 'The phone view becomes an outline; every export remains the wide tree.';

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

$('paths-view-switch').addEventListener('click', event => {
  const button = event.target.closest?.('[data-paths-view]');
  if(!button || button.dataset.pathsView === model?.style) return;
  const ops = setStyle(editor.getText(), button.dataset.pathsView);
  if(!ops?.length) return;
  applyLineOps(editor, ops);
  refresh();
});

$('paths-projection-jump').addEventListener('click', () => {
  const panel = $('roadmap-projection');
  const target = panel.querySelector('.projection-choice[data-available="true"] input') ||
    panel.querySelector('#roadmap-projection-title');
  target?.focus({preventScroll:true});
  panel.scrollIntoView({block:'start', behavior:matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth'});
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

$('roadmap-projection').addEventListener('change', event => {
  const radio = event.target.closest?.('input[name="roadmap-projection-world"]');
  if(radio){
    const choice = projectionChoices().find(row => row.key === radio.value && row.inspected.ok);
    if(!choice) return;
    selectedProjectionKey = choice.key;
    selectedProjectionAnswers = choice.answers;
    selectedProjectionFingerprint = choice.inspected.fingerprint;
    acceptedProjectionAssumptions = new Set();
    projectionPanelMessage = '';
    renderProjectionPanel();
    /* Rendering the receipt replaces the radio itself. Restore focus to that
       radio, rather than jumping to a focusless heading: Arrow keys must still
       compare the exact outcomes as one radio group. The polite receipt region
       announces the newly revealed basis. */
    queueMicrotask(() => $('roadmap-projection').querySelector(
      `input[name="roadmap-projection-world"][value="${CSS.escape(choice.key)}"]`)?.focus());
    return;
  }
  const checkbox = event.target.closest?.('.projection-assumption input[type="checkbox"]');
  if(!checkbox) return;
  if(checkbox.checked) acceptedProjectionAssumptions.add(checkbox.value);
  else acceptedProjectionAssumptions.delete(checkbox.value);
  projectionPanelMessage = '';
  const chosen = projectionChoices().find(row => row.key === selectedProjectionKey && row.inspected.ok);
  const complete = chosen?.inspected.receipt.assumed.every(entry => acceptedProjectionAssumptions.has(entry.key));
  const create = $('roadmap-projection').querySelector('[data-create-roadmap]');
  if(create) create.disabled = !complete;
});

$('roadmap-projection').addEventListener('click', async event => {
  const create = event.target.closest?.('[data-create-roadmap]');
  if(!create || create.disabled || !selectedProjectionAnswers) return;
  const source = editor.getText();
  const revision = projectionRevision;
  const answers = {...selectedProjectionAnswers};
  /* onChange is debounced for 120ms; Create must never rely on the last painted
     model. Parse and validate the editor's current bytes synchronously here. */
  const latestModel = parse(source);
  const inspected = inspectRoadmapProjection(latestModel, todayString, answers);
  if(!inspected.ok || inspected.assignmentKey !== selectedProjectionKey ||
     inspected.fingerprint !== selectedProjectionFingerprint){
    const staleMessage = inspected.ok
      ? 'Paths changed. Choose the exact outcome again.'
      : inspected.reason;
    resetProjectionChoice();
    projectionPanelMessage = staleMessage;
    renderProjectionPanel();
    return;
  }
  if(!inspected.receipt.assumed.every(entry => acceptedProjectionAssumptions.has(entry.key))) return;
  const confirmation = inspected.receipt.assumed.length ? projectionAcceptance(inspected) : null;
  const built = buildRoadmapProjection(latestModel, todayString, answers, confirmation);
  if(!built.ok){
    projectionPanelMessage = built.reason;
    renderProjectionPanel();
    return;
  }
  create.disabled = true;
  create.textContent = 'Creating…';
  try{
    const hash = await encodeHash({t:built.text});
    if(revision !== projectionRevision || source !== editor.getText() ||
       inspected.fingerprint !== selectedProjectionFingerprint){
      resetProjectionChoice();
      projectionPanelMessage = 'Paths changed while the Roadmap was being prepared. Choose the outcome again.';
      renderProjectionPanel();
      return;
    }
    if(hash.length >= 6000){
      projectionPanelMessage = 'This projection is too large for a shareable Roadmap URL. Shorten the Paths title, periods or included work.';
      renderProjectionPanel();
      return;
    }
    location.href = '/roadmap/#' + hash;
  } finally {
    if(document.contains(create)){
      create.disabled = false;
      create.textContent = 'Create Roadmap with this basis';
    }
  }
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
  if(!model || (!model.items.length && !model.decisions.length)) return null;
  if(model.style === 'plans') return renderPlans(projection, context(model, {width:1160}));
  if(!topology) return null;
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
