/* State, refresh loop, saved paths, exports, boot. */
import {parse, CONFIG_KEYS} from './parse.js';
import {project} from './project.js';
import {oversizedUrlWarning} from './evaluate.js';
import {treeProjection} from './tree.js';
import {treeLayout} from './layout-tree.js';
import {renderTree, renderOutline} from './render-tree.js';
import {renderPlans, renderPlansNarrow} from './render-plans.js';
import {decisionImpactProjection, overviewProjection} from './overview.js';
import {renderOverview, renderOverviewNarrow} from './render-overview.js';
import {renderDependencies, renderDependenciesNarrow} from './render-dependencies.js';
import {renderQuestionLens, renderQuestionLensNarrow} from './render-question-lens.js';
import {renderConditions, renderConditionsNarrow} from './render-conditions.js';
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
import {narrowWidth, watchNarrowBucket} from '../assets/narrow-width.js';
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
let model = null, projection = null, topology = null, overview = null, overviewImpact = null;
let lastSvg = '', hashTimer = null;
let urlStateOversized = false, hashAttempt = 0;
let selectedDecision = null;
let selectedOverviewDecision = null;
const expandedOverviewGroups = new Set();
let focusInspectorAfterRender = false;
let focusOverviewReceiptAfterRender = false;
let focusOverviewReturnAfterRender = false;
let focusFocusLensAfterRender = false;
let overviewMode = 'overview';
let overviewReceiptSheetOpen = false;
/* A receipt is useful after a person deliberately chooses a question. On a
   constrained desktop it must not be the thing that first obscures the brief. */
let overviewReceiptOverlayOpen = false;
let overviewReceiptReturnKey = null;
const overviewSheetBackground = new Map();

function isRoadmapStyle(style = model?.style){
  return style === 'brief' || style === 'question' || style === 'conditions' ||
    style === 'overview' || style === 'dependencies';
}

function canonicalRoadmapStyle(style = model?.style){
  if(style === 'overview') return 'brief';
  if(style === 'dependencies') return 'question';
  return style;
}

function setStyleInSource(style){
  const text = editor.getText();
  const next = String(style).toLowerCase();
  const lines = text.split('\n');
  const index = lines.findIndex(line => /^\s*style\s*:/i.test(line));
  if(index >= 0) lines[index] = `style: ${next}`;
  else lines.unshift(`style: ${next}`, '');
  editor.setText(lines.join('\n'));
}

function syncViewControls(){
  const style = canonicalRoadmapStyle();
  document.querySelectorAll('[data-paths-view]').forEach(button => {
    const active = button.dataset.pathsView === style;
    button.setAttribute('aria-pressed', String(active));
    button.classList.toggle('primary', active);
  });
}

function overviewSurfaceMetrics(){
  const host = $('overview-live');
  const surface = host.clientWidth ? host : preview;
  const width = surface.clientWidth || 0;
  const narrow = narrowWidth(surface) !== undefined;
  const receiptLayout = narrow ? 'sheet' : width >= 900 ? 'rail' : 'overlay';
  return {width, narrow, receiptLayout,
    previewWidth:receiptLayout === 'rail' ? Math.max(520, width - 366) : width,
    focusLayout:width >= 760 ? 'split' : 'stacked'};
}

function receiptMetricsForStyle(metrics = overviewSurfaceMetrics()){
  const style = canonicalRoadmapStyle();
  return style === 'question' || style === 'conditions'
    ? {...metrics, receiptLayout:'none', previewWidth:metrics.width}
    : metrics;
}

function overviewReceiptUsesSheet(metrics = overviewSurfaceMetrics()){
  return isRoadmapStyle() &&
    (metrics.narrow || matchMedia('(pointer: coarse)').matches);
}

/* aria-modal alone does not remove the roadmap/editor from a screen reader's
   virtual cursor. Isolate every sibling on the sheet's ancestry path, while
   preserving any state the page already owned so closing is lossless. */
function isolateOverviewSheet(host, active){
  if(active){
    if(overviewSheetBackground.size) return;
    let branch = host;
    while(branch?.parentElement){
      const parent = branch.parentElement;
      for(const sibling of parent.children){
        if(sibling === branch || !(sibling instanceof HTMLElement)) continue;
        overviewSheetBackground.set(sibling, {
          inert:sibling.inert,
          hadAriaHidden:sibling.hasAttribute('aria-hidden'),
          ariaHidden:sibling.getAttribute('aria-hidden'),
        });
        sibling.inert = true;
        sibling.setAttribute('aria-hidden', 'true');
      }
      branch = parent;
      if(parent === document.body) break;
    }
    return;
  }
  for(const [element, state] of overviewSheetBackground){
    element.inert = state.inert;
    if(state.hadAriaHidden) element.setAttribute('aria-hidden', state.ariaHidden);
    else element.removeAttribute('aria-hidden');
  }
  overviewSheetBackground.clear();
}

function setOverviewSheetState(host, active){
  document.body.classList.toggle('overview-sheet-open', active);
  if(active){
    host.dataset.sheet = 'true';
    host.setAttribute('role', 'dialog');
    host.setAttribute('aria-modal', 'true');
  } else {
    delete host.dataset.sheet;
    host.removeAttribute('role');
    host.removeAttribute('aria-modal');
  }
  isolateOverviewSheet(host, active);
}

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

function clearInspector(){
  const host = $('decision-inspector');
  host.hidden = true;
  host.replaceChildren();
}

function appendImpactList(host, entries, empty){
  if(!entries.length){
    host.appendChild(node('p', 'impact-empty', empty));
    return;
  }
  const list = node('ul', 'impact-list');
  for(const entry of entries){
    const item = node('li', '');
    item.appendChild(node('span', 'impact-copy', entry.sentence));
    list.appendChild(item);
  }
  host.appendChild(list);
}

function appendImpactSection(host, label, entries, empty = ''){
  if(!entries.length && !empty) return;
  const section = node('section', 'impact-section');
  section.appendChild(node('h3', '', label));
  appendImpactList(section, entries, empty);
  host.appendChild(section);
}

function renderOverviewReceipt(){
  const host = $('overview-receipt');
  const metrics = receiptMetricsForStyle();
  const sheet = overviewReceiptUsesSheet(metrics);
  const overlay = metrics.receiptLayout === 'overlay';
  const brief = canonicalRoadmapStyle() === 'brief';
  if(!sheet){
    overviewReceiptSheetOpen = false;
  }
  if(!brief || !isRoadmapStyle() || !overviewImpact || overviewMode === 'focus' ||
      (sheet && !overviewReceiptSheetOpen) || (overlay && !overviewReceiptOverlayOpen)){
    if(!isRoadmapStyle() || !overviewImpact){
      overviewReceiptSheetOpen = false;
      overviewReceiptReturnKey = null;
    }
    host.hidden = true;
    host.replaceChildren();
    setOverviewSheetState(host, false);
    return;
  }
  const impact = overviewImpact;
  const decision = impact.decision;
  const narrative = impact.narrative;
  host.hidden = false;
  host.replaceChildren();
  host.dataset.decisionKey = impact.key;
  host.dataset.layout = metrics.receiptLayout;
  setOverviewSheetState(host, sheet);

  const head = node('div', 'receipt-head');
  const identity = node('div', 'receipt-identity');
  identity.appendChild(node('p', 'inspector-kicker',
    canonicalRoadmapStyle() === 'question' ? 'Focused decision' : 'Selected decision'));
  const title = node('h2', '', decision.question || decision.name);
  title.id = 'overview-receipt-title';
  title.tabIndex = -1;
  identity.appendChild(title);
  identity.appendChild(node('p', 'receipt-state', impact.currentState.sentence));
  head.appendChild(identity);
  if(sheet || overlay){
    const close = node('button', 'receipt-close', 'Close');
    close.type = 'button';
    close.dataset.receiptClose = '';
    close.setAttribute('aria-label', `Close decision receipt for ${decision.question || decision.name}`);
    head.appendChild(close);
  }
  host.appendChild(head);

  const ledger = node('dl', 'receipt-ledger');
  for(const [label, value] of [
    ['Signal', decision.signal || 'Needs repair'],
    ['Latest reading', decision.reading || 'No reading recorded'],
    ['Owner', decision.owner || 'Needs repair'],
    ['Answer by', decision.answerBy || 'Needs repair'],
  ]){
    const row = node('div', 'receipt-fact');
    row.appendChild(node('dt', '', label));
    row.appendChild(node('dd', '', value));
    ledger.appendChild(row);
  }
  host.appendChild(ledger);

  appendImpactSection(host, 'Continues while unresolved', narrative.continues,
    'No continuing authored work is unchanged by this answer.');
  appendImpactSection(host, 'Changes directly with this answer', narrative.direct,
    'No simple-condition work changes directly.');
  appendImpactSection(host, 'Also needs …', narrative.alsoNeeds);
  appendImpactSection(host, 'Either … can unlock', narrative.eitherCanUnlock);
  appendImpactSection(host, 'May open / makes irrelevant',
    [...narrative.mayOpen, ...narrative.makesIrrelevant]);
  appendImpactSection(host, 'Completed history', narrative.completedHistory);
  appendImpactSection(host, 'Repair evidence', narrative.repairEvidence);

  let open = null;
  if(!sheet){
    open = node('button', 'btn receipt-focus', 'Open focus');
    open.type = 'button';
    open.dataset.openFocus = '';
    open.setAttribute('aria-label', `Open focus for ${decision.question || decision.name}`);
    host.appendChild(open);
  }
  if(focusOverviewReceiptAfterRender){
    focusOverviewReceiptAfterRender = false;
    title.focus({preventScroll:true});
  }
  if(focusOverviewReturnAfterRender){
    focusOverviewReturnAfterRender = false;
    open?.focus({preventScroll:true});
  }
}

function focusBranch(direction, branch){
  const column = node('section', 'focus-branch');
  column.dataset.direction = direction;
  column.appendChild(node('h3', '', `If answered ${direction}`));
  const note = node('p', 'focus-branch-note', 'Counterfactual — not today’s plan.');
  column.appendChild(note);

  const work = node('div', 'focus-kind');
  work.appendChild(node('h4', '', 'Work'));
  if(!branch.work.length) work.appendChild(node('p', 'impact-empty', 'No conditional work changes.'));
  else {
    const list = node('ul', 'impact-list focus-work');
    for(const entry of branch.work){
      const item = node('li', '');
      item.appendChild(node('span', 'impact-copy', entry.title));
      item.appendChild(node('span', 'impact-meta',
        `${entry.relation} · requires ${entry.requirement} · ${entry.sentence}`));
      list.appendChild(item);
    }
    work.appendChild(list);
  }
  column.appendChild(work);

  const decisions = node('div', 'focus-kind');
  decisions.appendChild(node('h4', '', 'Conditional decisions'));
  if(!branch.decisions.length) decisions.appendChild(node('p', 'impact-empty', 'No decision availability changes.'));
  else {
    const list = node('ul', 'impact-list focus-decisions');
    for(const entry of branch.decisions){
      const item = node('li', '');
      item.appendChild(node('span', 'impact-copy', entry.question));
      item.appendChild(node('span', 'impact-meta', `${entry.relation} · ${entry.sentence}`));
      list.appendChild(item);
    }
    decisions.appendChild(list);
  }
  column.appendChild(decisions);
  return column;
}

function renderFocusLens(){
  const host = $('focus-lens');
  if(!isRoadmapStyle() || overviewMode !== 'focus' || !overviewImpact){
    host.hidden = true;
    host.replaceChildren();
    return;
  }
  const impact = overviewImpact;
  const narrative = impact.narrative;
  host.hidden = false;
  host.replaceChildren();

  const head = node('div', 'focus-head');
  const identity = node('div', 'focus-identity');
  identity.appendChild(node('p', 'inspector-kicker', 'Decision focus'));
  const title = node('h2', '', impact.decision.question || impact.decision.name);
  title.id = 'focus-lens-title';
  title.tabIndex = -1;
  identity.appendChild(title);
  identity.appendChild(node('p', 'focus-state', impact.currentState.sentence));
  head.appendChild(identity);
  const back = node('button', 'btn focus-return',
    canonicalRoadmapStyle() === 'question' ? 'Return to question lens' : 'Return to brief');
  back.type = 'button';
  back.dataset.returnOverview = '';
  head.appendChild(back);
  host.appendChild(head);

  const relations = node('div', 'focus-relations');
  appendImpactSection(relations, 'Also needs …', narrative.alsoNeeds);
  appendImpactSection(relations, 'Either … can unlock', narrative.eitherCanUnlock);
  appendImpactSection(relations, 'May open / makes irrelevant',
    [...narrative.mayOpen, ...narrative.makesIrrelevant]);
  if(relations.childElementCount) host.appendChild(relations);

  const branches = node('div', 'focus-branches');
  branches.appendChild(focusBranch('yes', narrative.branches.yes));
  branches.appendChild(focusBranch('no', narrative.branches.no));
  host.appendChild(branches);

  const history = node('div', 'focus-evidence');
  appendImpactSection(history, 'Completed history', narrative.completedHistory);
  appendImpactSection(history, 'Repair evidence', narrative.repairEvidence);
  if(history.childElementCount) host.appendChild(history);
  if(focusFocusLensAfterRender){
    focusFocusLensAfterRender = false;
    title.focus({preventScroll:true});
  }
}

function renderOverviewSurface(overviewView, metrics = overviewSurfaceMetrics()){
  const live = $('overview-live');
  const focusActive = overviewView && overviewMode === 'focus' && !metrics.narrow && overviewImpact;
  if(overviewMode === 'focus' && !focusActive) overviewMode = 'overview';
  live.dataset.view = overviewView ? 'overview' : 'other';
  live.dataset.mode = focusActive ? 'focus' : 'overview';
  live.dataset.receiptLayout = overviewView ? metrics.receiptLayout : 'none';
  live.dataset.focusLayout = metrics.focusLayout;
  preview.hidden = !!focusActive;
  renderOverviewReceipt();
  renderFocusLens();
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
  const style = canonicalRoadmapStyle(model.style);
  projection = project(model, todayString);
  const plansView = model.style === 'plans';
  const treeView = model.style === 'tree';
  const briefView = style === 'brief';
  const questionView = style === 'question';
  const conditionsView = style === 'conditions';
  const roadmapView = briefView || questionView || conditionsView;
  topology = treeView ? treeProjection(projection) : null;
  overview = roadmapView ? overviewProjection(projection) : null;
  const retained = treeView ? resolveSelectedDecision(projection, selectedDecision) : null;
  selectedDecision = retained ? {key:retained.key, srcLine:retained.srcLine} : null;
  const retainedOverview = roadmapView
    ? resolveSelectedDecision({decisions:overview.decisions}, selectedOverviewDecision)
    : null;
  const overviewChoice = retainedOverview || overview?.initialSelection || null;
  selectedOverviewDecision = overviewChoice
    ? {key:overviewChoice.key, srcLine:overviewChoice.srcLine} : null;
  overviewImpact = roadmapView && selectedOverviewDecision
    ? decisionImpactProjection(model, projection, selectedOverviewDecision.key) : null;
  if(!roadmapView) overviewMode = 'overview';
  renderWarnings();
  const readout = verdict(projection);
  const counts = `${projection.decisions.length} ${projection.decisions.length === 1 ? 'question' : 'questions'}, ` +
    `${projection.items.length} ${projection.items.length === 1 ? 'item' : 'items'}`;
  const selectedStatus = overviewImpact
    ? ` Selected question: ${overviewImpact.decision.question || overviewImpact.decision.name}. ${overviewImpact.currentState.sentence}.`
    : '';
  $('summary').textContent = `${model.title || 'Untitled paths'}. ${counts}${readout?.line ? `. ${readout.line}` : ''}${selectedStatus}`;
  const surfaceMetrics = overviewSurfaceMetrics();
  /* A wide rail is part of the Brief composition. At laptop widths, begin with
     the roadmap fully visible; a decision click is the deliberate reveal. */
  if(briefView && surfaceMetrics.receiptLayout === 'overlay' &&
      overviewReceiptReturnKey == null && !focusOverviewReceiptAfterRender)
    overviewReceiptOverlayOpen = false;
  /* Question lens and Conditions include their own explanation in the artefact.
     Giving them Brief's external receipt would hide the very comparison/matrix
     they exist to show, especially in a constrained desktop stage. */
  const overviewMetrics = receiptMetricsForStyle(surfaceMetrics);
  const live = $('overview-live');
  live.dataset.receiptLayout = roadmapView ? overviewMetrics.receiptLayout : 'none';
  live.dataset.focusLayout = overviewMetrics.focusLayout;

  if(!model.items.length && !model.decisions.length){
    lastSvg = '';
    preview.innerHTML = `<p class="placeholder">${text.trim()
      ? 'No paths yet — add a decision or an item under a period.'
      : 'Start typing — or load an example.'}</p>`;
  } else {
    const width = roadmapView ? overviewMetrics.previewWidth : preview.clientWidth;
    const narrow = width > 0 && width < 520;
    /* A comparison or conditions audit has a real stacked composition between
       phone and full-stage width. Letting its 1120px export canvas merely pan
       here hides the question or columns a person came to inspect. */
    const stackedLens = (questionView || conditionsView) && width > 0 && width < 720;
    let svg;
    if(plansView){
      svg = narrow
        ? renderPlansNarrow(projection, context(model, {width}))
        : renderPlans(projection, context(model, {width:width || 1160}));
    } else if(treeView){
      const interactive = {interactive:true, selectedKey:selectedDecision?.key || null};
      svg = narrow
        ? renderOutline(topology, context(model, {width, ...interactive}))
        : renderTree(topology, treeLayout(topology, {width:width || 1160, measure}),
          context(model, interactive));
    } else if(questionView){
      const interactive = {interactive:true, selectedKey:selectedOverviewDecision?.key || null,
        impact:overviewImpact, showReceipt:false};
      svg = stackedLens
        ? renderQuestionLensNarrow(overview, context(model, {width, ...interactive}))
        : renderQuestionLens(overview, context(model, {width:width || 1160, ...interactive}));
    } else if(conditionsView){
      const interactive = {interactive:true, selectedKey:selectedOverviewDecision?.key || null,
        impact:overviewImpact, showReceipt:false};
      svg = stackedLens
        ? renderConditionsNarrow(overview, context(model, {width, ...interactive}))
        : renderConditions(overview, context(model, {width:width || 1160, ...interactive}));
    } else {
      const interactive = {interactive:true, selectedKey:selectedOverviewDecision?.key || null,
        expandedGroups:expandedOverviewGroups, impact:overviewImpact,
        showReceipt:false};
      svg = narrow
        ? renderOverviewNarrow(overview, context(model, {width, ...interactive}))
        : renderOverview(overview, context(model, {width:width || 1160, ...interactive}));
    }
    if(svg !== lastSvg){ preview.innerHTML = svg; lastSvg = svg; }
  }

  renderOverviewSurface(roadmapView, overviewMetrics);
  syncViewControls();
  if(treeView) renderInspector();
  else clearInspector();
  $('view-method').textContent = roadmapView && overviewMode === 'focus'
    ? 'Focus is a local counterfactual lens; exports remain the selected full roadmap.'
    : questionView
    ? 'Question lens compares what changes under each answer; exports keep the selected decision visible.'
    : conditionsView
    ? 'Conditions is the full decision-to-work logic audit; exports preserve the complete matrix.'
    : plansView
    ? 'The phone view groups work by possible plan; every export remains the wide matrix.'
    : treeView
      ? 'The phone view becomes an outline; every export remains the wide tree.'
      : 'Brief keeps the shared roadmap and parallel questions together; every export remains the full planning artefact.';

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
  if(isRoadmapStyle()){
    const resolved = resolveSelectedDecision({decisions:overview?.decisions || []}, choice);
    if(!resolved) return;
    selectedOverviewDecision = {key:resolved.key, srcLine:resolved.srcLine};
    overviewMode = 'overview';
    const sheet = overviewReceiptUsesSheet();
    overviewReceiptSheetOpen = sheet;
    overviewReceiptOverlayOpen = true;
    overviewReceiptReturnKey = sheet || overviewSurfaceMetrics().receiptLayout === 'overlay'
      ? resolved.key : null;
    focusOverviewReceiptAfterRender = focusInspector || sheet;
    lastSvg = '';
    refresh();
    return;
  }
  const resolved = resolveSelectedDecision(projection, choice);
  if(!resolved) return;
  selectedDecision = {key:resolved.key, srcLine:resolved.srcLine};
  focusInspectorAfterRender = focusInspector;
  lastSvg = '';
  refresh();
}

function toggleOverviewGroup(target){
  if(canonicalRoadmapStyle() !== 'brief') return false;
  const key = target.closest?.('[data-toggle-decision-group]')?.dataset.stateGroup;
  if(!key) return false;
  if(expandedOverviewGroups.has(key)) expandedOverviewGroups.delete(key);
  else expandedOverviewGroups.add(key);
  lastSvg = '';
  refresh();
  return true;
}

preview.addEventListener('click', event => {
  if(toggleOverviewGroup(event.target)){
    event.preventDefault();
    return;
  }
  const target = event.target.closest?.('[data-select-decision]');
  if(!target || !preview.contains(target)) return;
  event.preventDefault();
  chooseDecision(target, false);
});
preview.addEventListener('keydown', event => {
  if(event.key !== 'Enter' && event.key !== ' ' && event.key !== 'Spacebar') return;
  if(toggleOverviewGroup(event.target)){
    event.preventDefault();
    return;
  }
  const target = event.target.closest?.('[data-select-decision]');
  if(!target || !preview.contains(target)) return;
  event.preventDefault();
  chooseDecision(target, true);
});

$('overview-receipt').addEventListener('click', event => {
  if(event.target.closest?.('[data-receipt-close]')){
    closeOverviewReceiptSheet();
    return;
  }
  if(!event.target.closest?.('[data-open-focus]') || !overviewImpact || overviewSurfaceMetrics().narrow) return;
  overviewMode = 'focus';
  focusFocusLensAfterRender = true;
  refresh();
});

function selectedOverviewOpener(){
  return [...preview.querySelectorAll('[data-select-decision]')]
    .find(element => element.dataset.decisionKey === overviewReceiptReturnKey) || null;
}

function closeOverviewReceiptSheet(){
  const metrics = overviewSurfaceMetrics();
  const closingSheet = overviewReceiptSheetOpen;
  const closingOverlay = metrics.receiptLayout === 'overlay' && overviewReceiptOverlayOpen &&
    !$('overview-receipt').hidden;
  if(!closingSheet && !closingOverlay) return false;
  overviewReceiptReturnKey ||= overviewImpact?.key || null;
  if(closingSheet) overviewReceiptSheetOpen = false;
  if(closingOverlay) overviewReceiptOverlayOpen = false;
  focusOverviewReceiptAfterRender = false;
  renderOverviewReceipt();
  requestAnimationFrame(() => {
    selectedOverviewOpener()?.focus({preventScroll:true});
    overviewReceiptReturnKey = null;
  });
  return true;
}

$('overview-receipt').addEventListener('keydown', event => {
  if(event.key !== 'Tab' || !overviewReceiptSheetOpen) return;
  const focusable = [...event.currentTarget.querySelectorAll(
    'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), ' +
    'textarea:not([disabled]), [tabindex]:not([tabindex="-1"])')]
    .filter(element => !element.hidden && element.getClientRects().length);
  if(!focusable.length){
    event.preventDefault();
    return;
  }
  const current = focusable.indexOf(document.activeElement);
  const next = event.shiftKey
    ? (current <= 0 ? focusable.length - 1 : current - 1)
    : (current < 0 || current === focusable.length - 1 ? 0 : current + 1);
  event.preventDefault();
  focusable[next].focus();
});

$('focus-lens').addEventListener('click', event => {
  if(!event.target.closest?.('[data-return-overview]')) return;
  overviewMode = 'overview';
  focusOverviewReturnAfterRender = true;
  refresh();
});

document.addEventListener('keydown', event => {
  if(event.key !== 'Escape') return;
  if(closeOverviewReceiptSheet()){
    event.preventDefault();
    return;
  }
  if(overviewMode !== 'focus') return;
  event.preventDefault();
  overviewMode = 'overview';
  focusOverviewReturnAfterRender = true;
  refresh();
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
  const style = canonicalRoadmapStyle(model.style);
  if(style === 'brief') return renderOverview(overview,
    context(model, {width:1160, selectedKey:selectedOverviewDecision?.key || null,
      impact:overviewImpact}));
  if(style === 'question') return renderQuestionLens(overview,
    context(model, {width:1160, selectedKey:selectedOverviewDecision?.key || null,
      impact:overviewImpact}));
  if(style === 'conditions') return renderConditions(overview,
    context(model, {width:1160, selectedKey:selectedOverviewDecision?.key || null,
      impact:overviewImpact}));
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

document.querySelector('.paths-views').addEventListener('click', event => {
  const button = event.target.closest?.('[data-paths-view]');
  if(!button) return;
  event.preventDefault();
  setStyleInSource(button.dataset.pathsView);
});

function rerender(){ lastSvg = ''; refresh(); }
watchNarrowBucket(preview, rerender);
/* Overview has two more responsive boundaries than the shared narrow renderer:
   the counterfactual focus changes shape at 760px and the receipt moves into a
   rail at 900px. Observe the stable outer surface and include its effective
   preview width in the key, so crossing either boundary (or resizing within a
   layout) reprojects the SVG at the width it will actually occupy. Height-only
   ResizeObserver notifications are ignored by the unchanged key. */
let lastOverviewSurfaceKey = '';
new ResizeObserver(() => {
  const metrics = overviewSurfaceMetrics();
  const key = [metrics.receiptLayout, metrics.focusLayout,
    Math.round(metrics.previewWidth)].join(':');
  if(key === lastOverviewSurfaceKey) return;
  lastOverviewSurfaceKey = key;
  if(isRoadmapStyle()) rerender();
}).observe($('overview-live'), {box:'content-box'});
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
