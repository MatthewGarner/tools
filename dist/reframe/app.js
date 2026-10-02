import { mountShell } from '../shared/shell.js?v=0.3.0';
import { escapeHtml as esc, downloadText } from '../shared/utils.js';
import { STORAGE_KEY, LENSES, PLAN_FIELDS, MAX_FRAMES, MIN_FRAMES, MAX_IMPORT_BYTES, initialState, activeSession, transition, normalizeState, serializeSession, parseSession, markdown, frameProgress, sessionTitle } from './state.js';
import { createWorkbenchTools, registerWorkbenchTools } from './tools.js';

mountShell({active: 'reframe', label: 'MODEL 03', title: 'Reframing workbench'});
const root = document.querySelector('#workbench');
let state = initialState();
let recoveryRaw = null;
let storageIssue = '';
let storagePaused = false;
let saveMessage = 'Saved on this device';
let saveTimer;
let toastTimer;
let editingKey = null;
const history = [];
try {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (raw) { try { state = normalizeState(JSON.parse(raw)); } catch { recoveryRaw = raw; storagePaused = true; storageIssue = 'Saved work could not be opened. Download a recovery copy before replacing it.'; } }
} catch { storageIssue = 'This browser is blocking local saving. Export your work before closing this page.'; }
const uid = () => globalThis.crypto?.randomUUID?.() || `r-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
const icon = (name) => ({ arrow: '↗', plus: '+', close: '×', check: '✓', back: '↶', download: '↓' }[name] || '');
const nameOf = item => LENSES[item.lens].name;
const shortTitle = session => { const title = sessionTitle(session); return title.length > 70 ? `${title.slice(0, 67)}…` : title; };
const fieldId = (id, key) => `${id}-${key}`;

function announce(message) { document.querySelector('#announcer').textContent = message; }
function toast(message) {
  const element = document.querySelector('#toast');
  element.textContent = message; element.hidden = false;
  clearTimeout(toastTimer); toastTimer = setTimeout(() => { element.hidden = true; }, 4500);
}
function checkpoint() { history.push(structuredClone(state)); if (history.length > 40) history.shift(); }
function save(immediate = false) {
  clearTimeout(saveTimer);
  const updateStatus = () => { const status = document.querySelector('#save-status'); if (status) { status.textContent = saveMessage; status.classList.toggle('save-error', Boolean(storageIssue)); } };
  if (storagePaused) { saveMessage = 'Local saving paused'; updateStatus(); return; }
  saveMessage = 'Saving…'; updateStatus();
  const run = () => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); storageIssue = ''; saveMessage = 'Saved on this device'; }
    catch { storageIssue = 'Local saving is unavailable or full. Export your work before closing this page.'; saveMessage = 'Not saved · export a copy'; announce(storageIssue); }
    updateStatus();
  };
  if (immediate) run(); else saveTimer = setTimeout(run, 250);
}
function act(action, {repaint = true, undo = true, focus = null} = {}) {
  try {
    const previousFocus = document.activeElement;
    const focusData = previousFocus?.dataset?.action ? {...previousFocus.dataset} : null;
    const previousId = previousFocus?.id;
    const next = transition(state, action);
    if (undo) checkpoint();
    state = next; editingKey = null; save();
    if (repaint) render();
    if (focus) requestAnimationFrame(() => document.getElementById(focus)?.focus());
    else if (repaint) {
      const restored = previousId ? document.getElementById(previousId) : focusData ? [...root.querySelectorAll('[data-action]')].find(element => ['action', 'id', 'view', 'key'].every(key => element.dataset[key] === focusData[key])) : null;
      restored?.focus({preventScroll: true});
    }
    return true;
  } catch (error) { toast(error.message); return false; }
}
function undo() {
  if (!history.length) return;
  state = history.pop(); editingKey = null; save(); render(); toast('Last edit undone.');
}
function sizeTextareas() {
  root.querySelectorAll('textarea').forEach(element => { element.style.height = 'auto'; element.style.height = `${Math.max(element.scrollHeight, Number(element.dataset.minHeight) || 58)}px`; });
}
function textarea({id, label, value, prompt = '', group, key, frameId = '', rows = 2, className = ''}) {
  return `<div class="field ${className}"><label for="${esc(id)}">${label}</label>${prompt ? `<p class="field-prompt" id="${esc(id)}-hint">${esc(prompt)}</p>` : ''}<textarea id="${esc(id)}" rows="${rows}" maxlength="20000" data-group="${group}" data-key="${key}" ${frameId ? `data-frame="${esc(frameId)}"` : ''} ${prompt ? `aria-describedby="${esc(id)}-hint"` : ''} spellcheck="true">${esc(value)}</textarea></div>`;
}
function chooseButton(item, session, small = false) {
  const chosen = session.selected.includes(item.id);
  return `<button class="choose-button ${chosen ? 'is-chosen' : ''} ${small ? 'compact' : ''}" data-action="choose" data-id="${esc(item.id)}" aria-pressed="${chosen}"><span aria-hidden="true">${chosen ? icon('check') : '+'}</span> ${chosen ? 'Chosen for the test' : 'Carry this forward'}<span class="sr-only">: ${nameOf(item)} frame</span></button>`;
}
function frameCard(item, index, session) {
  const lens = LENSES[item.lens];
  const count = frameProgress(item);
  return `<article class="frame-card lens-${item.lens} ${session.selected.includes(item.id) ? 'chosen' : ''}" aria-labelledby="${esc(item.id)}-title">
    <header class="frame-heading"><div><span class="frame-number">FRAME ${String(index + 1).padStart(2, '0')}</span><h3 id="${esc(item.id)}-title">${lens.name}</h3></div><div class="frame-tools"><span class="progress" id="${esc(item.id)}-progress" title="${count} of 7 fields written">${count}/7</span>${session.frames.length > MIN_FRAMES ? `<button class="icon-button" data-action="remove-frame" data-id="${esc(item.id)}" aria-label="Remove ${lens.name} frame">×</button>` : ''}</div></header>
    <p class="lens-question">${lens.question}</p>
    ${textarea({id: fieldId(item.id, 'statement'), label: 'See the problem as…', value: item.statement, prompt: lens.statement, group: 'frame', frameId: item.id, key: 'statement', rows: 3, className: 'statement-field'})}
    <div class="move-fields">
    ${textarea({id: fieldId(item.id, 'intervention'), label: 'A different next move', value: item.intervention, prompt: lens.intervention, group: 'frame', frameId: item.id, key: 'intervention', rows: 3})}
    ${textarea({id: fieldId(item.id, 'test'), label: 'The smallest test', value: item.test, prompt: lens.test, group: 'frame', frameId: item.id, key: 'test', rows: 3})}
    </div>
    <details class="frame-details"><summary>Assumptions & blind spots <span aria-hidden="true">+</span></summary><div class="detail-fields">
    ${textarea({id: fieldId(item.id, 'whoWhen'), label: 'Who, and when?', value: item.whoWhen, prompt: lens.whoWhen, group: 'frame', frameId: item.id, key: 'whoWhen'})}
    ${textarea({id: fieldId(item.id, 'assumption'), label: 'The assumption', value: item.assumption, prompt: lens.assumption, group: 'frame', frameId: item.id, key: 'assumption'})}
    ${textarea({id: fieldId(item.id, 'reveals'), label: 'What this reveals', value: item.reveals, prompt: lens.reveals, group: 'frame', frameId: item.id, key: 'reveals'})}
    ${textarea({id: fieldId(item.id, 'hides'), label: 'What this hides', value: item.hides, prompt: lens.hides, group: 'frame', frameId: item.id, key: 'hides'})}
    </div></details>
    <footer class="frame-footer">${chooseButton(item, session)}</footer>
  </article>`;
}
function framesView(session) {
  return `<section aria-labelledby="frames-title" class="view-panel"><div class="section-top"><div><h2 id="frames-title">Change the question. Change the move.</h2><p>Write competing interpretations. A useful frame makes a different action possible.</p></div><button class="button secondary" data-action="open-lenses" ${session.frames.length >= MAX_FRAMES ? 'disabled' : ''}><span aria-hidden="true">+</span> Add a lens <span class="button-count">${session.frames.length}/${MAX_FRAMES}</span></button></div>
    ${session.frames.length > 3 ? '<p class="scroll-hint">Scroll across to see all frames <span aria-hidden="true">→</span></p>' : ''}
    <div class="frames-track" ${session.frames.length > 3 ? 'tabindex="0" aria-label="Frames; scroll horizontally to see all"' : ''}><div class="frames-grid ${session.frames.length > 3 ? 'many-frames' : ''}">${session.frames.map((item, i) => frameCard(item, i, session)).join('')}</div></div>
    <div class="view-footer"><p><span class="small-dot" aria-hidden="true"></span> These are hypotheses to test, not explanations to believe.</p><button class="button primary" data-action="view" data-view="compare">Compare next moves <span aria-hidden="true">→</span></button></div>
  </section>`;
}
const compareFields = [['statement', 'The question becomes'], ['intervention', 'So the next move is'], ['test', 'Try it cheaply'], ['assumption', 'This depends on'], ['reveals', 'It brings into view'], ['hides', 'It leaves out'], ['whoWhen', 'Who, and when']];
function compareView(session) {
  return `<section aria-labelledby="compare-title" class="view-panel"><div class="section-top"><div><h2 id="compare-title">Which difference is worth acting on?</h2><p>If every frame leads to the same move, push the framing further.</p></div><button class="button secondary" data-action="view" data-view="frames">Edit frames</button></div>
    <div class="comparison-track"><div class="comparison-grid" style="--frame-count:${session.frames.length}">${session.frames.map((item, i) => `<article class="comparison-card ${session.selected.includes(item.id) ? 'chosen' : ''}"><header><span class="frame-number">FRAME ${String(i + 1).padStart(2, '0')}</span><h3>${nameOf(item)}</h3></header>${compareFields.map(([key, label]) => `<div class="comparison-cell ${['intervention', 'test'].includes(key) ? 'action-cell' : ''}"><h4>${label}</h4><p class="${item[key].trim() ? '' : 'unwritten'}">${item[key].trim() ? esc(item[key]) : 'Not yet written'}</p>${!item[key].trim() ? `<button class="text-button" data-action="edit-field" data-id="${esc(item.id)}" data-key="${key}">Write this <span aria-hidden="true">↗</span></button>` : ''}</div>`).join('')}<footer>${chooseButton(item, session)}</footer></article>`).join('')}</div></div>
    <div class="selection-bar"><div><strong>${session.selected.length ? `${session.selected.length} ${session.selected.length === 1 ? 'frame' : 'frames'} chosen` : 'Choose a frame to take into the world'}</strong><p>Keep more than one if the combination changes what you will do.</p></div><button class="button primary" data-action="build-plan" ${session.selected.length ? '' : 'disabled'}>Build a working frame <span aria-hidden="true">→</span></button></div>
  </section>`;
}
function planView(session) {
  const chosen = session.frames.filter(item => session.selected.includes(item.id));
  const hasPlan = PLAN_FIELDS.some(key => session.plan[key].trim());
  return `<section aria-labelledby="plan-title" class="view-panel plan-view"><div class="section-top"><div><h2 id="plan-title">A working frame, not a final answer.</h2><p>Keep the useful parts. Make the next step small enough to learn from.</p></div><button class="button secondary" data-action="open-export">Export work <span aria-hidden="true">↓</span></button></div>
    <div class="plan-layout"><aside class="plan-source"><span class="eyebrow">CARRIED FORWARD</span>${chosen.length ? chosen.map(item => `<div class="source-frame"><span class="source-name">${nameOf(item)}</span><p>${item.statement.trim() ? esc(item.statement) : '<em>Statement not written yet</em>'}</p></div>`).join('') : '<p class="muted">Choose a frame in Compare, or write a working frame from scratch.</p>'}<button class="text-button" data-action="view" data-view="compare">Change the selection <span aria-hidden="true">←</span></button>${chosen.length ? `<button class="button secondary full-width" data-action="build-plan">${hasPlan ? 'Copy selected frames again' : 'Copy selected frames'}</button><p class="microcopy">Copies your words into the draft. You shape the combination.${hasPlan ? ' Replaces the draft below; Undo restores it.' : ''}</p>` : ''}<div class="plan-nudge"><strong>A test earns its place if it can change your mind.</strong><p>Look for an observation, a clear decision after it, and a limit on the effort.</p></div></aside>
    <div class="plan-editor">
    ${textarea({id: 'plan-statement', label: 'The problem I will work on', value: session.plan.statement, prompt: 'Combine the useful parts into one problem you can act on.', group: 'plan', key: 'statement', rows: 3, className: 'working-statement'})}
    ${textarea({id: 'plan-nextMove', label: 'My next move', value: session.plan.nextMove, prompt: 'What will you do differently because of this frame?', group: 'plan', key: 'nextMove', rows: 3})}
    ${textarea({id: 'plan-assumption', label: 'The assumption I need to test', value: session.plan.assumption, prompt: 'Name the belief that would most change the next move if it were wrong.', group: 'plan', key: 'assumption', rows: 3})}
    <div class="test-block"><span class="eyebrow">FROM A FRAME TO EVIDENCE</span>
    ${textarea({id: 'plan-test', label: 'The smallest test I will run', value: session.plan.test, prompt: 'Make it specific: who does what, by when, with what limit on effort?', group: 'plan', key: 'test', rows: 3})}
    ${textarea({id: 'plan-learn', label: 'What would change my mind?', value: session.plan.learn, prompt: 'If I observe ___, I will ___. What would make you stop, revise, or continue?', group: 'plan', key: 'learn', rows: 3})}
    </div><p class="draft-note">This is an editable copy. Changes to the source frames do not overwrite your draft.</p></div></div>
  </section>`;
}
function render() {
  const session = activeSession(state);
  root.innerHTML = `<div class="workbench-top"><div><p class="eyebrow">SCAFFOLD 01 <span aria-hidden="true">/</span> REFRAME THE QUESTION</p><h1>Reframing workbench</h1></div><div class="workspace-actions"><button class="button quiet" data-action="undo" ${history.length ? '' : 'disabled'}><span aria-hidden="true">↶</span> Undo</button><button class="button secondary" data-action="open-sessions">My problems <span class="button-count">${state.sessions.length}</span></button><button class="button secondary" data-action="open-export">Export <span aria-hidden="true">↓</span></button></div></div>
    ${storageIssue ? `<div class="notice" role="status">${esc(storageIssue)}${recoveryRaw ? ' <button class="text-button" data-action="recover">Download recovery copy</button>' : ''}${storagePaused && !recoveryRaw ? ' <button class="text-button" data-action="resume-save">Save this tab instead</button>' : ''}</div>` : ''}
    <section class="problem-section" aria-labelledby="problem-heading"><div class="problem-label"><label id="problem-heading" for="problem">The problem, in your words</label><span class="saved-status ${storageIssue ? 'save-error' : ''}" id="save-status" role="status">${storagePaused ? 'Local saving paused' : storageIssue ? 'Not saved · export a copy' : saveMessage}</span></div><textarea id="problem" class="problem-input" aria-describedby="problem-help" rows="1" maxlength="20000" data-group="problem" data-key="problem" placeholder="We need… / We keep… / We cannot…">${esc(session.problem)}</textarea><div class="problem-bottom"><p id="problem-help">Start with the way you say it now. You can change it as you go.</p><button class="text-button" data-action="new-session">Start my own problem <span aria-hidden="true">↗</span></button></div><details class="context-details"><summary>Add context <span>${session.context.trim() ? 'Written' : 'Optional'}</span></summary>${textarea({id: 'context', label: 'What someone else would need to know', value: session.context, group: 'problem', key: 'context', rows: 2})}</details></section>
    <nav class="view-nav" aria-label="Workbench steps">${[['frames', '01', 'Try different frames'], ['compare', '02', 'Compare next moves'], ['plan', '03', 'Choose a small test']].map(([view, number, label]) => `<button data-action="view" data-view="${view}" ${session.view === view ? 'aria-current="step"' : ''}><span class="step-number">${number}</span><span>${label}</span>${view === 'plan' && session.selected.length ? `<span class="selection-count">${session.selected.length}</span>` : ''}</button>`).join('')}</nav>
    ${session.view === 'frames' ? framesView(session) : session.view === 'compare' ? compareView(session) : planView(session)}
    <div class="workbench-foot"><p>Guided prompts, your reasoning. No generated answers.</p><p>Your work stays in this browser. Export a copy to keep or move it.</p></div>`;
  requestAnimationFrame(sizeTextareas);
}

function openDialog(id, content) {
  const dialog = document.getElementById(id); dialog.innerHTML = content; dialog.showModal();
}
const dialogHeading = (id, eyebrow, title, description = '') => `<div class="dialog-heading"><div><p class="eyebrow">${eyebrow}</p><h2 id="${id}">${title}</h2>${description ? `<p>${description}</p>` : ''}</div><button class="icon-button" data-action="close-dialog" aria-label="Close dialog">×</button></div>`;
function openLenses() {
  const session = activeSession(state);
  openDialog('lens-dialog', `${dialogHeading('lens-title', 'TRY ANOTHER ANGLE', 'What could this be a problem of?', 'Add a blank frame with questions to guide your thinking.')}<div class="lens-options">${Object.entries(LENSES).map(([key, lens]) => `<button class="lens-option" data-action="add-lens" data-lens="${key}"><span class="lens-option-top"><strong>${lens.name}</strong><span>${session.frames.some(item => item.lens === key) ? 'In use · add another' : '+'}</span></span><span class="lens-short">${lens.short}</span><span class="lens-description">${lens.question}</span></button>`).join('')}</div>`);
}
function openSessions() {
  openDialog('sessions-dialog', `${dialogHeading('sessions-title', 'YOUR WORKSPACE', 'My problems', 'Starting something new keeps your existing work here.')}<div class="new-session-options"><button class="button primary" data-action="new-session">+ Start a blank problem</button><button class="button secondary" data-action="load-example" data-example="forecasts">Forecasting example</button><button class="button secondary" data-action="load-example" data-example="bess">Battery example</button></div><div class="sessions-list">${[...state.sessions].reverse().map(session => `<button class="session-row ${session.id === state.activeId ? 'active' : ''}" data-action="switch-session" data-id="${esc(session.id)}"><span><strong>${esc(shortTitle(session))}</strong><span class="session-meta">${session.frames.length} frames · ${session.selected.length} chosen</span></span><span>${session.id === state.activeId ? 'Open' : '→'}</span></button>`).join('')}</div><button class="text-button import-button" data-action="import">Import a saved JSON session <span aria-hidden="true">↑</span></button>`);
}
function openExport() {
  openDialog('export-dialog', `${dialogHeading('export-title', 'TAKE YOUR THINKING WITH YOU', 'Export this problem', 'Includes all frames, your selection, and the working test.')}<div class="export-options"><button class="export-option" data-action="export-markdown"><span class="export-symbol">MD</span><span><strong>Download Markdown</strong><span>A readable note for your notes app or a colleague.</span></span><span aria-hidden="true">↓</span></button><button class="export-option" data-action="export-json"><span class="export-symbol">{ }</span><span><strong>Download editable session</strong><span>A JSON file you can import here later.</span></span><span aria-hidden="true">↓</span></button><button class="export-option" data-action="copy-markdown"><span class="export-symbol">↗</span><span><strong>Copy as Markdown</strong><span>Put the complete note on your clipboard.</span></span></button></div><p class="microcopy">Local saving is specific to this browser and website address. An export gives you a portable copy.</p>`);
}
function closeDialogs() { document.querySelectorAll('dialog[open]').forEach(dialog => dialog.close()); }
function filename(extension) { return `reframing-${sessionTitle(activeSession(state)).toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 60).replace(/-$/, '') || 'problem'}.${extension}`; }

document.addEventListener('click', async event => {
  const button = event.target.closest('[data-action]'); if (!button) return;
  const action = button.dataset.action;
  if (action === 'undo') undo();
  else if (action === 'view') { act({type: 'view', value: button.dataset.view}, {undo: false}); announce(`Opened ${button.dataset.view === 'frames' ? 'frames' : button.dataset.view === 'compare' ? 'comparison' : 'test plan'}.`); }
  else if (action === 'open-lenses') openLenses();
  else if (action === 'open-sessions') openSessions();
  else if (action === 'open-export') openExport();
  else if (action === 'close-dialog') button.closest('dialog').close();
  else if (action === 'add-lens') { const id = uid(); closeDialogs(); if (act({type: 'add-frame', lens: button.dataset.lens, id}, {focus: fieldId(id, 'statement')})) { toast(`${LENSES[button.dataset.lens].name} frame added. Your words go here.`); document.getElementById(fieldId(id, 'statement'))?.scrollIntoView({block: 'center', inline: 'center', behavior: 'smooth'}); } }
  else if (action === 'remove-frame') { const item = activeSession(state).frames.find(frame => frame.id === button.dataset.id); if (act({type: 'remove-frame', id: button.dataset.id})) toast(`${nameOf(item)} frame removed. Undo restores it.`); }
  else if (action === 'choose') { act({type: 'select-frame', id: button.dataset.id}); announce(`${activeSession(state).selected.length} frames chosen.`); }
  else if (action === 'build-plan') { if (act({type: 'build-plan'}, {focus: 'plan-statement'})) toast('Your selected words are copied into a working draft. Edit the combination.'); }
  else if (action === 'new-session' || action === 'load-example') { closeDialogs(); if (act({type: 'new-session', example: action === 'load-example' ? button.dataset.example : 'blank', id: uid()}, {focus: 'problem'})) toast('New problem opened. Previous work is in My problems.'); }
  else if (action === 'switch-session') { closeDialogs(); act({type: 'switch-session', id: button.dataset.id}, {undo: false}); toast('Saved problem opened.'); }
  else if (action === 'edit-field') { act({type: 'view', value: 'frames'}, {undo: false}); const field = document.getElementById(fieldId(button.dataset.id, button.dataset.key)); if (field) { const details = field.closest('details'); if (details) details.open = true; sizeTextareas(); field.focus(); field.scrollIntoView({block: 'center', behavior: 'smooth'}); } }
  else if (action === 'export-markdown') { downloadText(filename('md'), markdown(activeSession(state)), 'text/markdown;charset=utf-8'); toast('Markdown downloaded.'); closeDialogs(); }
  else if (action === 'export-json') { downloadText(filename('json'), serializeSession(activeSession(state)), 'application/json'); toast('Editable session downloaded.'); closeDialogs(); }
  else if (action === 'copy-markdown') { try { await navigator.clipboard.writeText(markdown(activeSession(state))); toast('Complete note copied.'); closeDialogs(); } catch { toast('Clipboard access is unavailable. Download Markdown instead.'); } }
  else if (action === 'import') { document.getElementById('import-file').click(); }
  else if (action === 'recover') { downloadText('reframing-recovery.json', recoveryRaw, 'application/json'); recoveryRaw = null; storagePaused = false; storageIssue = ''; save(); render(); toast('Recovery copy downloaded. Local saving has resumed.'); }
  else if (action === 'resume-save') { storagePaused = false; storageIssue = ''; save(); render(); toast('This tab is now the saved version.'); }
});

root.addEventListener('input', event => {
  const element = event.target; if (!(element instanceof HTMLTextAreaElement)) return;
  const key = element.id;
  if (editingKey !== key) { checkpoint(); editingKey = key; }
  const group = element.dataset.group;
  const action = group === 'frame' ? {type: 'edit-frame', id: element.dataset.frame, field: element.dataset.key, value: element.value} : {type: group === 'plan' ? 'edit-plan' : 'edit-problem', field: element.dataset.key, value: element.value};
  state = transition(state, action);
  element.style.height = 'auto'; element.style.height = `${Math.max(element.scrollHeight, 58)}px`;
  if (group === 'frame') { const item = activeSession(state).frames.find(item => item.id === element.dataset.frame); const progress = document.getElementById(`${item.id}-progress`); if (progress) { progress.textContent = `${frameProgress(item)}/7`; progress.title = `${frameProgress(item)} of 7 fields written`; } }
  const undoButton = root.querySelector('[data-action="undo"]'); if (undoButton) undoButton.disabled = false;
  save();
});
root.addEventListener('focusout', event => { if (event.target instanceof HTMLTextAreaElement) editingKey = null; });
root.addEventListener('toggle', event => { if (event.target instanceof HTMLDetailsElement && event.target.open) requestAnimationFrame(sizeTextareas); }, true);
document.querySelectorAll('dialog').forEach(dialog => {
  dialog.addEventListener('click', event => { if (event.target === dialog) { const box = dialog.getBoundingClientRect(); if (event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom) dialog.close(); } });
});
document.getElementById('import-file').addEventListener('change', async event => {
  const file = event.target.files?.[0]; if (!file) return;
  try {
    if (file.size > MAX_IMPORT_BYTES) throw new Error('Choose a Reframing JSON file smaller than 5 MB.');
    const session = parseSession(await file.text()); closeDialogs();
    if (act({type: 'import-session', session, id: uid()})) toast('Session imported. Your existing problems are still saved.');
  } catch (error) { toast(error.message); }
  event.target.value = '';
});
window.addEventListener('pagehide', () => save(true));
window.addEventListener('storage', event => {
  if (event.key !== STORAGE_KEY || event.newValue === JSON.stringify(state)) return;
  clearTimeout(saveTimer); storagePaused = true;
  storageIssue = 'Another tab changed the saved work. This tab is kept open, with local saving paused. Export it, or choose which tab to save.';
  render();
});
render();
if (!recoveryRaw) save();

registerWorkbenchTools(document.modelContext || navigator.modelContext, createWorkbenchTools({read: () => state, edit: action => act(action)}));
