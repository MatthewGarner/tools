import {mountShell} from '../shared/shell.js';
import {attachCardDrag} from '../shared/drag.js';
import {escapeHtml as e, downloadText} from '../shared/utils.js';
import {KEY, TYPES, LANES, NOTE_FIELDS, TYPE_PROMPTS, initialState, active, selected, createHistory, change, undo, apply, validateState, serialize, parse, markdown} from './state.js';
mountShell({active: 'constraints'});
const root = document.querySelector('#app'), dialog = document.querySelector('#dialog');
let history = createHistory(initialState()), timer, toastTimer, dragDestroy, paused = false, recovery = null, saveMessage = 'Saved on this device';
try { const raw = localStorage.getItem(KEY); if (raw) {try {history = createHistory(validateState(JSON.parse(raw)));} catch {recovery = raw; paused = true; saveMessage = 'Saved data needs recovery';}} } catch {saveMessage = 'Saving unavailable · export a copy';}
const state = () => history.present, workspace = () => active(state());
const uid = () => crypto.randomUUID?.() || `c-${Date.now()}-${Math.random().toString(36).slice(2)}`;
const title = value => (value.problem.trim() || 'Untitled problem').replace(/\s+/g, ' ');
const short = (text, limit = 90) => text.length > limit ? `${text.slice(0, limit - 1)}…` : text;
function toast(message) {const el = document.querySelector('#toast'); el.textContent = message; el.hidden = false; clearTimeout(toastTimer); toastTimer = setTimeout(() => el.hidden = true, 4200);}
function announce(message) {document.querySelector('#live').textContent = message;}
function save(now = false) {
  clearTimeout(timer); if (paused) return;
  saveMessage = 'Saving…'; status();
  const run = () => {try {localStorage.setItem(KEY, JSON.stringify(state())); saveMessage = 'Saved on this device';} catch {saveMessage = 'Saving unavailable · export a copy';} status();};
  if (now) run(); else timer = setTimeout(run, 250);
}
function status() {const el = document.querySelector('#save'); if (el) el.textContent = saveMessage;}
function act(action, {repaint = true, group = null, checkpoint = true, focus = null} = {}) {
  const focused = document.activeElement, oldId = focused?.id, oldData = focused?.dataset?.action ? {...focused.dataset} : null;
  try {history = checkpoint ? change(history, action, group) : {...history, present: apply(state(), action), group: null}; save(); if (repaint) render();
    if (focus) requestAnimationFrame(() => document.getElementById(focus)?.focus());
    else if (repaint) (oldId ? document.getElementById(oldId) : oldData ? [...root.querySelectorAll('[data-action]')].find(el => ['action', 'id', 'lane'].every(key => el.dataset[key] === oldData[key])) : null)?.focus({preventScroll:true});
    return true;
  } catch (error) {toast(error.message); return false;}
}
function resize() {root.querySelectorAll('textarea').forEach(el => {el.style.height = 'auto'; el.style.height = `${Math.max(el.scrollHeight, 56)}px`;});}
function field(id, label, value, data, prompt = '', rows = 2) {return `<div class="field"><label for="${e(id)}">${label}</label>${prompt ? `<p id="${e(id)}-help">${e(prompt)}</p>` : ''}<textarea id="${e(id)}" rows="${rows}" maxlength="20000" ${data} ${prompt ? `aria-describedby="${e(id)}-help"` : ''}>${e(value)}</textarea></div>`;}
function cardMarkup(card) {
  const isSelected = workspace().selectedId === card.id;
  return `<article class="constraint-card ${isSelected ? 'selected' : ''}" data-drag-id="${e(card.id)}"><div class="card-top"><span class="type ${card.type}">${TYPES[card.type]}</span><button class="drag-handle" data-drag-handle data-action="move-menu" data-id="${e(card.id)}" aria-label="Move constraint: ${e(card.text || 'Unnamed constraint')}">⠿</button></div><button class="card-text" data-action="inspect" data-id="${e(card.id)}" aria-pressed="${isSelected}">${card.text.trim() ? e(card.text) : '<span class="muted">Name this constraint…</span>'}</button><div class="card-bottom"><button class="small-button" data-action="move-menu" data-id="${e(card.id)}">Move <span aria-hidden="true">↗</span></button>${card.notes[card.lastLane].restored ? '<span class="restored-tag">Returned to reality</span>' : card.lane !== 'current' ? '<span class="imaginary-tag">Imaginary move</span>' : ''}</div></article>`;
}
function notebook() {
  const card = selected(state());
  if (!card) return '<section class="notebook empty-note"><h2>Every experiment starts with a limit.</h2><p>Add a constraint, then try one imaginary move.</p><button class="button primary" data-action="add">+ Add a constraint</button></section>';
  const lane = card.lastLane, notes = card.notes[lane], hasExperiment = card.lane !== 'current' || NOTE_FIELDS.some(key => notes[key].trim()) || notes.restored;
  return `<section class="notebook" id="notebook" aria-labelledby="notebook-title"><header class="notebook-heading"><div><p class="eyebrow">THE EXPERIMENT NOTEBOOK</p><h2 id="notebook-title">${hasExperiment ? `${LANES[lane].name} the limit. Keep the useful idea.` : 'What is this constraint, really?'}</h2></div><button class="text-button danger" data-action="remove" data-id="${e(card.id)}">Remove card</button></header><div class="notebook-grid ${notes.restored ? 'transferred' : ''}"><div class="actual-panel"><span class="section-label">01 / BEFORE</span><h3>The actual constraint</h3>${field('actual-text', 'What currently holds', card.text, `data-edit="card" data-field="text" data-id="${e(card.id)}"`)}<div class="field"><label for="constraint-type">Kind of constraint</label><select id="constraint-type" data-edit="card" data-field="type" data-id="${e(card.id)}">${Object.entries(TYPES).map(([key, label]) => `<option value="${key}" ${key === card.type ? 'selected' : ''}>${label}</option>`).join('')}</select></div>${field('actual-basis', 'How do you know?', card.basis, `data-edit="card" data-field="basis" data-id="${e(card.id)}"`, 'A physical fact, agreement, policy, or just “how we do things”?')}<p class="actual-note">Moving this card does not change the actual constraint.</p></div>
    <div class="whatif-panel"><span class="section-label">02 / WHAT IF</span><h3>${hasExperiment ? `${LANES[lane].symbol} ${LANES[lane].name}` : 'Make an imaginary move'}</h3>${hasExperiment ? `<p class="lens-prompt">${LANES[lane].prompt}</p>${field('note-whatIf', 'The counterfactual', notes.whatIf, `data-edit="note" data-id="${e(card.id)}" data-lane="${lane}" data-field="whatIf"`, 'Write the imagined condition, not a recommendation.')}${field('note-possible', 'What becomes possible?', notes.possible, `data-edit="note" data-id="${e(card.id)}" data-lane="${lane}" data-field="possible"`, 'What new behaviour, design, or sequence does this reveal?', 3)}${notes.restored ? '<p class="return-status">✓ Actual constraint restored on the board</p>' : `<button class="button primary return-button" data-action="restore" data-id="${e(card.id)}">Bring it back to reality <span aria-hidden="true">→</span></button><p class="microcopy">Restore the card before extracting a feasible adaptation.</p>`}` : `<p class="lens-prompt">Drag the card into a lane, or choose a move.</p><div class="move-choices">${Object.entries(LANES).map(([key, item]) => `<button class="move-choice" data-action="move" data-id="${e(card.id)}" data-lane="${key}"><b>${item.symbol}</b><span><strong>${item.name}</strong><span>${item.short}</span></span></button>`).join('')}</div>`}</div>
    ${notes.restored ? `<div class="transfer-panel"><span class="section-label">03 / TRANSFER</span><h3>Keep the idea. Honour the limit.</h3><p class="transfer-prompt">${TYPE_PROMPTS[card.type]}</p>${field('note-adaptation', 'The real-world adaptation', notes.adaptation, `data-edit="note" data-id="${e(card.id)}" data-lane="${lane}" data-field="adaptation"`, 'What part survives when the actual constraint is back?')}${field('note-test', 'The smallest useful test', notes.test, `data-edit="note" data-id="${e(card.id)}" data-lane="${lane}" data-field="test"`, 'Who could try what, with which permission, and for how long?')}${field('note-evidence', 'What would change your mind?', notes.evidence, `data-edit="note" data-id="${e(card.id)}" data-lane="${lane}" data-field="evidence"`, 'Name an observation that would make you revise or stop.')}</div>` : ''}</div></section>`;
}
function render() {
  dragDestroy?.();
  const work = workspace();
  root.innerHTML = `<header class="page-top"><div><p class="eyebrow">SCAFFOLD 03 / CHANGE THE LIMIT</p><h1>Constraint playground</h1></div><div class="toolbar"><button class="button quiet" data-action="undo" ${history.past.length ? '' : 'disabled'}>↶ Undo</button><button class="button" data-action="workspaces">My problems <span>${state().workspaces.length}</span></button><button class="button" data-action="export">Export ↓</button></div></header>
  ${paused ? `<div class="notice">${recovery ? 'Saved work could not be opened. Download a recovery copy before replacing it.' : 'Another tab changed the saved work. Saving here is paused; export this version or explicitly keep it.'}<button class="text-button" data-action="${recovery ? 'recover' : 'resume'}">${recovery ? 'Download recovery copy' : 'Save this tab instead'}</button></div>` : ''}
  <section class="problem-bar"><div class="problem-meta"><label for="problem">The problem you are working on</label><span id="save" role="status">${e(saveMessage)}</span></div><textarea id="problem" data-edit="problem" rows="1" maxlength="20000" placeholder="How could we…?">${e(work.problem)}</textarea></section>
  <div class="board-intro"><p><strong>Move a limit. Notice what opens up.</strong> Drag a handle, or use Move.</p><span>Thought experiments · real limits remain</span></div>
  <section class="playground" aria-label="Constraint experiment board"><div class="reality-zone" data-drop-id="current"><div class="zone-title"><div><span class="section-label">BEFORE</span><h2>Current constraints</h2></div><button class="add-button" data-action="add" aria-label="Add a constraint" ${work.cards.length >= 12 ? 'disabled' : ''}>+</button></div><div class="current-cards">${work.cards.filter(card => card.lane === 'current').map(cardMarkup).join('') || '<p class="empty-zone">All cards are in imaginary experiments. Drag one back here to restore its real limit.</p>'}</div></div><div class="experiment-zone"><div class="experiment-title"><span class="section-label">WHAT IF</span><p>Change the condition, not the facts.</p></div>${Object.entries(LANES).map(([key, lane]) => `<section class="experiment-lane lane-${key}" data-drop-id="${key}" aria-label="${lane.name} experiment drop area"><div class="lane-title"><span class="lane-symbol">${lane.symbol}</span><div><h3>${lane.name}</h3><p>${lane.short}</p></div></div><div class="lane-cards">${work.cards.filter(card => card.lane === key).map(cardMarkup).join('') || `<div class="drop-instruction"><span aria-hidden="true">+</span> Drop a constraint here</div>`}</div></section>`).join('')}</div></section>
  ${notebook()}<footer class="local-footer"><p>Fictional examples. Your interpretations and tests, not generated answers.</p><p>Work stays in this browser. Export a copy to keep it.</p></footer>`;
  requestAnimationFrame(resize);
  dragDestroy = attachCardDrag({root, onDrop: ({itemId, dropId}) => move(itemId, dropId)});
}
function move(id, lane) {if (workspace().cards.find(card => card.id === id)?.lane === lane) return; if (act({type:'move', id, lane})) {const message = lane === 'current' ? 'Actual constraint restored. Extract a real-world adaptation below.' : `${LANES[lane].name} experiment opened. The real constraint is unchanged.`; toast(message); announce(message);}}
function open(content, label) {dialog.innerHTML = `<div class="dialog-top"><h2 id="dialog-title">${label}</h2><button class="close" data-action="close" aria-label="Close dialog">×</button></div>${content}`; dialog.setAttribute('aria-labelledby', 'dialog-title'); dialog.showModal();}
function openWorkspaces() {open(`<p class="dialog-description">New problems and examples keep your existing work.</p><div class="new-options"><button class="button primary" data-action="new" data-example="blank">+ My own problem</button><button class="button" data-action="new" data-example="reviews">Product review example</button><button class="button" data-action="new" data-example="battery">Battery example</button></div><div class="workspace-list">${[...state().workspaces].reverse().map(work => `<button data-action="switch" data-id="${e(work.id)}"><span><strong>${e(short(title(work)))}</strong><small>${work.cards.length} constraints</small></span><span>${work.id === state().activeId ? 'Open' : '→'}</span></button>`).join('')}</div><button class="text-button" data-action="import">Import an editable JSON session ↑</button>`, 'My problems');}
function openMove(id) {const card = workspace().cards.find(item => item.id === id); open(`<p class="moving-name">${e(card.text || 'Unnamed constraint')}</p><div class="move-choices">${[['current', {name:'Current constraints', symbol:'↩', short:'Restore the actual limit'}], ...Object.entries(LANES)].map(([key, lane]) => `<button class="move-choice" data-action="move" data-id="${e(id)}" data-lane="${key}" ${key === card.lane ? 'disabled' : ''}><b>${lane.symbol}</b><span><strong>${lane.name}</strong><span>${lane.short}</span></span></button>`).join('')}</div>`, 'Move this constraint');}
document.addEventListener('click', event => {
  const button = event.target.closest('[data-action]'); if (!button) return;
  const {action, id, lane, example} = button.dataset;
  if (action === 'undo') {history = undo(history); save(); render(); toast('Last change undone.');}
  else if (action === 'close') dialog.close();
  else if (action === 'workspaces') openWorkspaces();
  else if (action === 'new') {dialog.close(); act({type:'new', id:uid(), example}, {focus:'problem'}); toast('New problem opened. Previous work is in My problems.');}
  else if (action === 'switch') {dialog.close(); act({type:'switch', id}, {checkpoint:false});}
  else if (action === 'add') {const id = uid(); if (act({type:'add', id}, {focus:'actual-text'})) document.querySelector('#notebook')?.scrollIntoView({block:'start', behavior:'smooth'});}
  else if (action === 'inspect') {act({type:'select', id}, {checkpoint:false}); document.querySelector('#notebook')?.scrollIntoView({block:'start', behavior:'smooth'});}
  else if (action === 'remove') {if (act({type:'remove', id})) toast('Constraint and its notes removed. Undo restores them.');}
  else if (action === 'move-menu') openMove(id);
  else if (action === 'move') {dialog.close(); move(id,lane);}
  else if (action === 'restore') {move(id,'current'); requestAnimationFrame(() => document.getElementById('note-adaptation')?.focus());}
  else if (action === 'export') open(`<p class="dialog-description">Includes the real constraints, every experiment, and your tests.</p><div class="export-options"><button class="button primary" data-action="markdown">Download Markdown ↓</button><button class="button" data-action="json">Download editable JSON ↓</button></div><p class="microcopy">An export is portable. Local saving only applies to this browser and website address.</p>`, 'Export this playground');
  else if (action === 'markdown' || action === 'json') {downloadText(`constraint-playground.${action === 'json' ? 'json' : 'md'}`, action === 'json' ? serialize(workspace()) : markdown(workspace()), action === 'json' ? 'application/json' : 'text/markdown;charset=utf-8'); dialog.close(); toast('Playground downloaded.');}
  else if (action === 'import') document.querySelector('#file').click();
  else if (action === 'recover') {downloadText('constraint-recovery.json', recovery, 'application/json'); recovery = null; paused = false; save(); render();}
  else if (action === 'resume') {paused = false; save(); render();}
});
root.addEventListener('input', event => {
  const el = event.target; if (!(el instanceof HTMLTextAreaElement)) return;
  const {edit, id, field, lane} = el.dataset;
  const action = edit === 'problem' ? {type:'problem', value:el.value} : {type:edit, id, field, lane, value:el.value};
  if (act(action, {repaint:false, group:el.id})) {el.style.height = 'auto'; el.style.height = `${Math.max(el.scrollHeight,56)}px`; root.querySelector('[data-action="undo"]').disabled = false;
    if (edit === 'card' && field === 'text') {const card = [...root.querySelectorAll('[data-drag-id]')].find(card => card.dataset.dragId === id); if (card) {card.querySelector('.card-text').textContent = el.value || 'Name this constraint…'; card.querySelector('.drag-handle').setAttribute('aria-label', `Move constraint: ${el.value || 'Unnamed constraint'}`);}}
  }
});
root.addEventListener('change', event => {const el = event.target; if (el instanceof HTMLSelectElement) act({type:'card', id:el.dataset.id, field:el.dataset.field, value:el.value});});
root.addEventListener('focusout', () => {history.group = null;});
dialog.addEventListener('click', event => {if (event.target === dialog) {const box = dialog.getBoundingClientRect(); if (event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom) dialog.close();}});
document.querySelector('#file').addEventListener('change', async event => {const file = event.target.files?.[0]; if (!file) return; try {if (file.size > 16000000) throw new Error('Choose a JSON file under 16 MB.'); const imported = parse(await file.text()); dialog.close(); if (act({type:'import', id:uid(), workspace:imported})) toast('Playground imported. Existing work is preserved.');} catch(error) {toast(error.message);} event.target.value = '';});
window.addEventListener('pagehide', () => save(true));
window.addEventListener('storage', event => {if (event.key !== KEY || event.newValue === JSON.stringify(state())) return; clearTimeout(timer); paused = true; saveMessage = 'Local saving paused'; render();});
render(); if (!paused) save();
