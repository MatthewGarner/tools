/* Boot, mode routing, compose/solo mode, exports. */
import {parse} from './parse.js';
import {resolveVerdict} from '../assets/verdict.js';   // the composer headline is a verdict mirror too
import {sessionStats, markdownSummary, verdict} from './engine.js';
import {renderForm} from './render-form.js';
import {addQuestionLine, removeQuestionLine, renameQuestion, setType, setUnit,
  renameOption, addOption, removeOption, addedQuestionTarget} from './edit-targets.js';
import {attachEditInPlace} from '../assets/edit-in-place.js';
import {verdictMenuRows, handleVerdictCommit, validVerdictInput} from '../assets/verdict-edit.js';
import {renderOverlay} from './render-overlay.js';
import {createRelay, randomHex, sha256hex} from './relay-client.js';
import {wireExports} from '../assets/exports.js';
import {readHashState, writeHashState, mulberry32} from '../assets/series.js';
import {measure, themeColors, onThemeChange, renderWarningList, exampleChips} from '../assets/app-common.js';
import {debounced, rafBatched} from '../assets/schedule.js';
import {narrowWidth, watchNarrowBucket} from '../assets/narrow-width.js';
import {initWorkspace, mountTouchUndo} from '../assets/workspace.js';
import {mountMotion} from "../assets/motion.js";
import {REVEAL} from "./motion-spec.js";
import {autoloadExample, shouldPersist} from '../assets/mobile.js';
import {paintKicker, paintMetrics} from '../assets/verdict.js';
import {loadSaved, storeSaved} from '../assets/saved-items.js';
import {renderSavedDisclosure, savedSelectionAfterDelete} from '../assets/handoff-ui.js';
import {gaugeImport} from './import-state.js';
import {targetHashState} from '../assets/handoff.js';
import {esc} from '../assets/svg.js';

const $ = id => document.getElementById(id);
const paint = mountMotion($("preview"));
const ctx = () => ({colors: themeColors(), measure});
const relay = createRelay();

const EXAMPLES = [
  {name: 'Q3 commitment review', src:
`title: Q3 commitment review
names: off

We ship the referral loop by end of Q3 :: prob
Weeks to migrate billing :: range weeks
Active teams at end of quarter :: range teams`},
  {name: 'App launch readiness', src:
`title: App launch readiness
names: on

Launch slips past November :: prob
Support tickets in week one :: range tickets
Daily actives a month after launch :: range users
Beta cohort renews :: prob`},
  {name: 'Confidence auction', src:
`title: Feature bets
Pick the Q3 bet :: chips Streak overhaul | Social feed | Onboarding polish
How confident are we in the estimate? :: prob`},
  {name: 'What does “likely” mean?', src:
`title: What does “likely” mean here?
names: off

// Everyone answers with the probability they hear in each word.
// Reveal the spread, then open a Delphi round 2 — the pooled
// medians become the team's shared translation table.
“Likely” :: prob
“Unlikely” :: prob
“Almost certain” :: prob
“A real possibility” :: prob`},
];

/* Deterministic sample responses for the solo "Sample reveal" (seeded, spec §Session flow). */
export function sampleResponses(model){
  const rand = mulberry32(20260704);
  const NAMES = ['Ana', 'Ben', 'Chika', 'Dev', 'Elle', 'Fin', 'Gus', 'Hana'];
  const shapes = model.questions.map(q => q.type === 'prob'
    ? {split: rand() < 0.4, a: 15 + rand() * 25, b: 60 + rand() * 30}
    : {base: Math.pow(10, 1 + Math.floor(rand() * 2)) * (0.5 + rand()),
       outlier: rand() < 0.5 ? Math.floor(rand() * 8) : -1});   // half the range questions agree
  return NAMES.map((name, p) => {
    const values = model.questions.map((q, qi) => {
      const s = shapes[qi];
      if(q.type === 'prob'){
        const c = s.split ? (p % 2 ? s.a : s.b) : (s.a + s.b) / 2;
        return Math.max(2, Math.min(98, Math.round(c + (rand() - 0.5) * 18)));
      }
      const mid = s.base * (p === s.outlier ? 2.6 : 0.9 + rand() * 0.2);
      const half = mid * (0.25 + rand() * 0.3);   // wide enough that non-outlier rooms overlap
      const r1 = v => Math.round(v * 10) / 10;
      return [r1(mid - half), r1(mid + half)];
    });
    return model.names ? {values, name} : {values};
  });
}

/* Slider <-> output sync for any live form under `root` (compose preview + participant). */
export function wireFormEvents(root){
  root.addEventListener('input', e => {
    const el = e.target;
    if(el.matches && el.matches('input[data-part="prob"]')){
      el.dataset.touched = '1';
      el.style.setProperty('--fill', el.value + '%');
      el.parentElement.querySelector('.probout').textContent = el.value + '%';
    }
  });
}

/* Compose-stage metrics, read straight off the parsed model so they move with the
   editor: how many questions, of which kinds, and whether answers carry names. */
const TYPE_WORD = {prob: 'probability', range: 'quantity', chips: 'confidence auction'};
const sampleReceipt = stats => '<details class="receipt-disclosure"><summary>Reading receipt · ' +
  stats.length + ' questions</summary><section class="result-receipt" data-result-receipt aria-label="Sample reading receipt"><ol>' +
  stats.map(s => '<li><strong>' + esc(s.question.text) + '</strong><span>' + s.n + ' response' +
    (s.n === 1 ? '' : 's') + ' · ' + esc(s.headline) + '</span></li>').join('') +
  '</ol></section></details>';
function composeCounts(model){
  const qs = model.questions, by = new Map();
  for(const q of qs) by.set(q.type, (by.get(q.type) || 0) + 1);
  return [qs.length + ' question' + (qs.length === 1 ? '' : 's'),
    [...by].map(([t, n]) => n + ' ' + (TYPE_WORD[t] || t)).join(' · '),
    model.names ? 'Named answers' : 'Anonymous'];
}

async function initCompose(hash){
  const inbound = gaugeImport(hash);
  let transient = !!inbound, activeSaved = null;
  let model = null, view = 'reveal', lastOut = '', hashTimer = null;

  /* participants never see the editor — only compose mode pays for CodeMirror */
  const {createEditor} = await import('./editor.js');
  const editor = createEditor({
    parent: $('cmhost'),
    doc: '',
    onChange: debounced(() => refresh(), 120),
  });
  mountTouchUndo(document.querySelector('.stage .actions'), editor);   // phones have no ⌘Z (Rule 2)
  /* try-it specimens: wired here because gauge's editor is composer-lazy */
  wireSyntaxTry(document.querySelector('details.syntax'), editor, ['title', 'names', 'palette', 'accent', 'verdict']);

  /* Phone-first question authoring: every edit affordance on the compose form
     preview is an undoable TEXT rewrite (gauge/edit-targets.js) dispatched
     through CodeMirror. Text stays the single source of truth; config keys stay
     editor-only. The shared handler is surface-agnostic — these targets are HTML
     spans, not SVG. A line rewrite that returns null (guard fail / no-op) is not
     dispatched. removeq/rmopt are ['×'] cycles (coarse → danger confirm); addopt
     is a one-tap ['add'] capsule; addq/qtype are pickers (nothing on a bare tap).
     ＋ Add question's picker chooses the new question's type. */
  const announceEdit = text => { $('editstatus').textContent = text; };
  const focusFreshAdd = () => {
    requestAnimationFrame(() => {
      const add = $('preview').querySelector('[data-edit="addq"]');
      if(add?.isConnected) add.focus({preventScroll: true});
      else $('viewform').focus({preventScroll: true});
    });
  };
  const addqMenu = ['prob', 'range', 'chips'].map(t => ({
    label: t === 'prob' ? 'Probability' : t === 'range' ? 'Range' : 'Chips',
    commit: {kind: 'addq', line: -1, oldRaw: '', value: t},
  }));
  let pendingQuestionAdd = null;
  const insertQuestion = add => {
    const source = editor.view.state.doc.line(add.afterLine + 1);
    editor.view.dispatch({changes: {from: source.to, to: source.to, insert: '\n' + add.newLine},
      userEvent: 'input.complete'});
  };
  const replaceFreshQuestion = (line, text) => {
    const source = editor.view.state.doc.line(line + 1);
    editor.view.dispatch({changes: {from: source.from, to: source.to, insert: text},
      userEvent: 'input.complete'});
  };
  const composeEip = attachEditInPlace($('preview'), {
    kinds: {
      qtext:   {validate: v => renameQuestion('X :: prob', v) != null},
      qtype:   {options: ['prob', 'range', 'chips']},
      unit:    {validate: v => v.trim() !== '' && !v.includes('::')},
      opt:     {validate: v => v.trim() !== '' && !v.includes('|') && !v.includes('::')},
      removeq: {cycle: ['×']},
      rmopt:   {cycle: ['×']},
      addopt:  {cycle: ['add']},   // one-tap add (coarse tap does NOT open a picker)
      addq:    {menu: addqMenu},
      verdict: {menu: () => verdictMenuRows(model && model.verdict)},
      verdictedit: {validate: validVerdictInput,
        placeholder: () => model ? resolveVerdict(model.verdict,
          {line: verdict(sessionStats(model, sampleResponses(model))), fig: ''}).line : ''},
    },
    onCommit(kind, line, raw, value, el){
      if(handleVerdictCommit(kind, value, {
        getText: () => editor.getText(), setText: t => editor.setText(t),
        configRe: /^(title|names|palette|accent|verdict)\s*:/i,
        getLine: () => model ? resolveVerdict(model.verdict,
          {line: verdict(sessionStats(model, sampleResponses(model))), fig: ''}).line : '',
      })) return;
      if(kind === 'addq'){
        // a second add activation while the first's popover hasn't resolved yet
        // would silently close that first input (attachEditInPlace allows only
        // one open target) and orphan its pendingQuestionAdd tracking — no-op instead.
        if(pendingQuestionAdd){ announceEdit('Still adding the last question — finish or cancel it first.'); return; }
        const add = addQuestionLine(editor.getText(), value);
        if(!add) return;
        const freshLine = add.afterLine + 1;
        insertQuestion(add);
        const addedText = editor.getText();   // onCancel only rolls back if nothing else changed since
        pendingQuestionAdd = {line: freshLine, newLine: add.newLine};
        void composeEip.openAt(addedQuestionTarget(add), {
          origin: el,
          onCancel(){
            // only safe to roll back if the doc is EXACTLY as the add left it — anything else
            // (an edit elsewhere) and we leave the document alone. Rolling back via undo()
            // (not a forward removeLine dispatch) keeps history clean too: Escape leaves no
            // extra "remove" entry for a stray Ctrl+Z to un-remove — undo() pops the add's
            // own isolated group (insertLinesAfter/'input.complete' tag it as such).
            const removed = editor.getText() === addedText;
            if(removed) editor.undo();
            pendingQuestionAdd = null;
            announceEdit(removed ? 'Question creation cancelled.' : 'Question kept — document changed.');
            setTimeout(focusFreshAdd, 140);
          },
          onMiss(){ pendingQuestionAdd = null; announceEdit('Question added. Its in-place editor could not be opened.'); focusFreshAdd(); },
          timeout: 1200,
        });
        return;
      }
      if(kind === 'removeq'){
        if(removeQuestionLine(editor.getText(), line)) editor.removeLine(line);
        return;
      }
      const cur = editor.getLine(line);
      let next = null;
      if(kind === 'qtext')  next = renameQuestion(cur, value);
      else if(kind === 'qtype') next = setType(cur, value);
      else if(kind === 'unit')  next = setUnit(cur, value);
      else if(kind === 'opt')   next = renameOption(cur, +el.dataset.opt, value);
      else if(kind === 'rmopt') next = removeOption(cur, +el.dataset.opt);
      else if(kind === 'addopt') next = addOption(cur);
      if(next != null && next !== cur){
        if(kind === 'qtext' && pendingQuestionAdd?.line === line){
          replaceFreshQuestion(line, next);     // don't merge the naming edit into the add history event
          pendingQuestionAdd = null;
        } else editor.replaceLine(line, next);
      }
    },
  });

  const ws = initWorkspace({
    workspace: $('workspace'), tab: $('railtab'),
    preview: $('preview'), zoomHost: $('zoomctl'),
    initialCollapsed: true, collapsedLabel: 'Edit questions', collapsedAriaLabel: 'Edit questions', expandedLabel: 'Hide questions',
    onCollapseChange(){ clearTimeout(hashTimer); hashTimer = setTimeout(writeHash, 100); },
  });

  function writeHash(){
    if(!shouldPersist()) return;
    const state = {t: editor.getText()};
    if(ws.collapsed()) state.e = 0;
    writeHashState(targetHashState(state, transient ? inbound.meta : null));
  }
  function renderWarnings(){
    renderWarningList($('warns'), model ? model.warnings : []);
  }
  function doRefresh(){
    const text = editor.getText();
    model = parse(text);
    const pv = $('preview');
    let out;
    if(!model.questions.length){
      out = '<p class="placeholder">' + (text.trim()
        ? 'No questions yet — write one like “Weeks to migrate billing :: range weeks”.'
        : 'Start typing — or load an example.') + '</p>';
    } else if(view === 'form'){
      out = '<div class="formpreview">' + renderForm(model, {editable: true}) + '</div>';
    } else {
      const stats = sessionStats(model, sampleResponses(model));
      // the PREVIEW carries the narrow width (<520 ⇒ phone relayout); exports never do
      out = renderOverlay(model, stats, ctx(), {width: narrowWidth(pv), edit: true}) + sampleReceipt(stats);
    }
    paint(out, REVEAL); lastOut = out;
    $('revealhead').textContent = '';
    paintMetrics($('metrics'), model.questions.length ? (model.title || 'Gauge session') : '',
      model.questions.length ? composeCounts(model) : []);
    renderWarnings();
    $('startbtn').disabled = !model.questions.length;
    if(!transient && shouldPersist()){
      if(activeSaved === null){
        try{ localStorage.setItem('gauge-src', text); $('saveerror').textContent = ''; }
        catch(e){ $('saveerror').textContent = 'Could not remember this draft in this browser.'; }
      }
      if(activeSaved !== null){
        const list = loadSaved('gauge-saved');
        if(list[activeSaved]){
          list[activeSaved].src = text;
          $('saveerror').textContent = storeSaved('gauge-saved', list) ? '' : 'Could not update this saved question set.';
        }
      }
    }
    clearTimeout(hashTimer);
    hashTimer = setTimeout(writeHash, 400);
  }
  const refresh = rafBatched(doRefresh);

  /* view toggle */
  function setView(v){
    view = v;
    $('viewform').classList.toggle('on', v === 'form');
    $('viewreveal').classList.toggle('on', v === 'reveal');
    $('viewform').setAttribute('aria-pressed', String(v === 'form'));
    $('viewreveal').setAttribute('aria-pressed', String(v === 'reveal'));
    lastOut = '';
    refresh();
  }
  $('viewform').addEventListener('click', () => setView('form'));
  $('viewreveal').addEventListener('click', () => setView('reveal'));
  wireFormEvents($('preview'));

  /* examples */
  exampleChips($('chips'), EXAMPLES, ex => editor.setText(ex.src));

  function leaveImport(text){
    transient = false;
    $('handoffstrip').hidden = true;
    history.replaceState(null, '', location.pathname);
    editor.setText(text || '');
  }
  function renderSaved(){
    renderSavedDisclosure($('savedrow'), loadSaved('gauge-saved'), {
      activeIndex: activeSaved, noun: 'question set',
      onLoad: (m, i) => { activeSaved = i; leaveImport(m.src); },
      onDelete: (m, i) => {
        if(!confirm('Delete saved question set “' + m.name + '”? This cannot be undone.')) return;
        const list = loadSaved('gauge-saved'); list.splice(i, 1);
        if(!storeSaved('gauge-saved', list)){ $('saveerror').textContent = 'Could not delete this saved question set.'; return; }
        const next = savedSelectionAfterDelete(activeSaved, i);
        if(next.restoreCurrent){
          let current = ''; try{ current = localStorage.getItem('gauge-src') || ''; }catch(e){}
          activeSaved = null; leaveImport(current);
        }else activeSaved = next.activeIndex;
        $('saveerror').textContent = ''; renderSaved();
      },
      onSave: () => {
      if(transient){ saveIncoming(); return; }
      const text = editor.getText(); if(!parse(text).questions.length) return;
      const list = loadSaved('gauge-saved');
      list.push({name: (parse(text).title || 'Question set ' + (list.length + 1)).slice(0, 28), src: text});
      if(!storeSaved('gauge-saved', list)){ $('saveerror').textContent = 'Could not save this question set.'; return; }
      activeSaved = list.length - 1; $('saveerror').textContent = ''; renderSaved();
      },
    });
  }
  renderSaved();
  function saveIncoming(){
    if(!transient) return;
    const text = editor.getText(), list = loadSaved('gauge-saved');
    const name = (parse(text).title || 'Imported question set').slice(0, 28);
    if(!storeSaved('gauge-saved', [...list, {name, src: text}])){
      $('saveerror').textContent = 'Could not save this draft in this browser.'; return;
    }
    activeSaved = list.length;
    $('saveerror').textContent = '';
    leaveImport(text); renderSaved();
  }
  $('saveimport').addEventListener('click', saveIncoming);
  $('returncurrent').addEventListener('click', () => {
    let text = ''; try{ text = localStorage.getItem('gauge-src') || ''; }catch(e){}
    activeSaved = null; leaveImport(text);
  });

  /* exports (sample reveal) */
  const svgString = () => (model && model.questions.length)
    ? renderOverlay(model, sessionStats(model, sampleResponses(model)), ctx()) : null;
  const slug = () => ((model && model.title) || 'gauge').toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  wireExports({
    buttons: {dlsvg: $('dlsvg'), dlpng: $('dlpng'), copypng: $('copypng'), copymd: $('copymd')},
    getSvg: svgString,
    getMarkdown: () => (model && model.questions.length)
      ? markdownSummary(model, sessionStats(model, sampleResponses(model))) : null,
    slug,
  });

  /* start session */
  $('startbtn').addEventListener('click', async () => {
    if(!model || !model.questions.length) return;
    const btn = $('startbtn');
    btn.disabled = true;
    btn.textContent = 'Starting…';
    const id = randomHex(16), key = randomHex(16);
    const r = await relay.create(id, await sha256hex(key), model.names);
    if(!r.ok){
      btn.disabled = false;
      btn.textContent = 'Start session';
      $('starterr').textContent = (r.status === 429
        ? 'The relay is rate-limiting session creation — wait a minute and try again.'
        : "Couldn't reach the relay — no session was created. Solo preview still works; check your connection and try again.");
      $('starterr').hidden = false;
      return;
    }
    await writeHashState({t: editor.getText(), id, key});   // the reload must not beat the async write
    location.reload();   // boot re-routes into console mode
  });

  /* theme + narrow/wide bucket flips re-render through the same loop */
  function rerender(){ lastOut = ''; refresh(); }
  onThemeChange(rerender);
  watchNarrowBucket($('preview'), rerender);

  /* boot */
  const invalidImport = hash && Object.prototype.hasOwnProperty.call(hash, 'x') && !inbound;
  let text = inbound ? inbound.text : (!invalidImport && hash && typeof hash.t === 'string' ? hash.t : '');
  if(inbound){
    $('handofftitle').textContent = 'Draft from Map' + (inbound.meta.label ? ' · ' + inbound.meta.label : '');
    if(inbound.meta.returnTo){
      $('returnsource').href = inbound.meta.returnTo;
      $('returnsource').hidden = false;
    }
    $('handoffstrip').hidden = false;
  }
  if(hash && hash.e === 0) ws.setCollapsed(true);
  if(!text){ try{ text = localStorage.getItem('gauge-src') || ''; }catch(e){} }
  if(text) editor.setText(text);
  else if(!autoloadExample(() => editor.setText(EXAMPLES[0].src))) refresh();
}

/* ---------- mode routing ---------- */
(async function boot(){
  paintKicker($('kicker'), '12', "The room's honest odds");
  const hash = await readHashState();
  const mode = hash && hash.id ? (hash.key ? 'console' : 'participant') : 'compose';
  document.body.dataset.mode = mode;
  $('compose').hidden = mode !== 'compose';
  $('participant').hidden = mode !== 'participant';
  $('console').hidden = mode !== 'console';
  if(mode === 'compose') return initCompose(hash);
  const {initConsole, initParticipant} = await import('./session.js');
  const deps = {model: parse(hash.t || ''), text: hash.t || '', relay, ctx, $, wireFormEvents};
  if(mode === 'console') initConsole({...deps, id: hash.id, key: hash.key});
  else initParticipant({...deps, id: hash.id});
})();

import {wireSyntaxTry} from '../assets/syntax-try.js';
