/* Boot, mode routing, compose/solo mode, exports. */
import {parse} from './parse.js';
import {sessionStats, markdownSummary, verdict} from './engine.js';
import {renderForm} from './render-form.js';
import {addQuestionLine, removeQuestionLine} from './edit-targets.js';
import {renderOverlay} from './render-overlay.js';
import {createRelay, randomHex, sha256hex} from './relay-client.js';
import {wireExports} from '../assets/exports.js';
import {readHashState, writeHashState, mulberry32} from '../assets/series.js';
import {measure, themeColors, onThemeChange, renderWarningList} from '../assets/app-common.js';
import {debounced, rafBatched} from '../assets/schedule.js';
import {initWorkspace} from '../assets/workspace.js';
import {autoloadExample, shouldPersist} from '../assets/mobile.js';

const $ = id => document.getElementById(id);
const ctx = () => ({colors: themeColors(), measure});
const encodeState = obj => btoa(unescape(encodeURIComponent(JSON.stringify(obj))));
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

async function initCompose(hash){
  let model = null, view = 'reveal', lastOut = '', hashTimer = null;

  /* participants never see the editor — only compose mode pays for CodeMirror */
  const {createEditor, insertAndSelect} = await import('./editor.js');
  const editor = createEditor({
    parent: $('cmhost'),
    doc: '',
    onChange: debounced(() => refresh(), 120),
  });
  /* add/remove questions from the form preview — text edits through the editor, undoable */
  $('preview').addEventListener('click', e => {
    const del = e.target.closest && e.target.closest('.qdel');
    if(del){
      const line = +del.dataset.line;
      if(removeQuestionLine(editor.getText(), line)) editor.removeLine(line);
      return;
    }
    if(e.target.closest && e.target.closest('.addq')){
      const {afterLine, newLine} = addQuestionLine(editor.getText());
      insertAndSelect(editor, afterLine, newLine, 'New question');
    }
  });

  const ws = initWorkspace({
    workspace: $('workspace'), tab: $('railtab'),
    preview: $('preview'), zoomHost: $('zoomctl'),
    onCollapseChange(){ clearTimeout(hashTimer); hashTimer = setTimeout(writeHash, 100); },
  });

  function writeHash(){
    if(!shouldPersist()) return;
    const state = {t: editor.getText()};
    if(ws.collapsed()) state.e = 0;
    writeHashState(state);
  }
  function renderWarnings(){
    renderWarningList($('warns'), model ? model.warnings : []);
  }
  function doRefresh(){
    const text = editor.getText();
    model = parse(text);
    const pv = $('preview');
    let out, head = '';
    if(!model.questions.length){
      out = '<p class="placeholder">' + (text.trim()
        ? 'No questions yet — write one like “Weeks to migrate billing :: range weeks”.'
        : 'Start typing — or load an example.') + '</p>';
    } else if(view === 'form'){
      out = '<div class="formpreview">' + renderForm(model, {editable: true}) + '</div>';
    } else {
      const stats = sessionStats(model, sampleResponses(model));
      out = renderOverlay(model, stats, ctx());
      head = verdict(stats);
    }
    if(out !== lastOut){ pv.innerHTML = out; lastOut = out; }
    $('revealhead').textContent = head;
    renderWarnings();
    $('startbtn').disabled = !model.questions.length;
    if(shouldPersist()){ try{ localStorage.setItem('gauge-src', text); }catch(e){} }
    clearTimeout(hashTimer);
    hashTimer = setTimeout(writeHash, 400);
  }
  const refresh = rafBatched(doRefresh);

  /* view toggle */
  function setView(v){
    view = v;
    $('viewform').classList.toggle('on', v === 'form');
    $('viewreveal').classList.toggle('on', v === 'reveal');
    lastOut = '';
    refresh();
  }
  $('viewform').addEventListener('click', () => setView('form'));
  $('viewreveal').addEventListener('click', () => setView('reveal'));
  wireFormEvents($('preview'));

  /* examples */
  for(const ex of EXAMPLES){
    const b = document.createElement('button');
    b.className = 'chip';
    b.textContent = ex.name;
    b.addEventListener('click', () => editor.setText(ex.src));
    $('chips').appendChild(b);
  }

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
    writeHashState({t: editor.getText(), id, key});
    location.reload();   // boot re-routes into console mode
  });

  /* theme */
  function rerender(){ lastOut = ''; refresh(); }
  onThemeChange(rerender);

  /* boot */
  let text = hash && typeof hash.t === 'string' ? hash.t : '';
  if(hash && hash.e === 0) ws.setCollapsed(true);
  if(!text){ try{ text = localStorage.getItem('gauge-src') || ''; }catch(e){} }
  if(text) editor.setText(text);
  else if(!autoloadExample(() => editor.setText(EXAMPLES[0].src))) refresh();
}

/* ---------- mode routing ---------- */
(async function boot(){
  const hash = readHashState();
  const mode = hash && hash.id ? (hash.key ? 'console' : 'participant') : 'compose';
  document.body.dataset.mode = mode;
  $('compose').hidden = mode !== 'compose';
  $('participant').hidden = mode !== 'participant';
  $('console').hidden = mode !== 'console';
  if(mode === 'compose') return initCompose(hash);
  const {initConsole, initParticipant} = await import('./session.js');
  const deps = {model: parse(hash.t || ''), text: hash.t || '', relay, ctx, $, encodeState, wireFormEvents};
  if(mode === 'console') initConsole({...deps, id: hash.id, key: hash.key});
  else initParticipant({...deps, id: hash.id});
})();
