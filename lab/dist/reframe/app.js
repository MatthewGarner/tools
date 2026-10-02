import {sourceDetails} from '../shared/ancestry-ui.js?v=0.21.0';
import { mountShell } from '../shared/shell.js?v=0.21.0';
import { escapeHtml as esc, downloadText } from '../shared/utils.js?v=0.21.0';
import { ancestryOfFrame, STORAGE_KEY, LENSES, PLAN_FIELDS, MAX_FRAMES, MIN_FRAMES, MAX_IMPORT_BYTES, initialState, activeSession, transition, normalizeState, serializeSession, parseSession, markdown, frameProgress, sessionTitle } from './state.js?v=0.21.0';
import {attachCardDrag} from '../shared/drag.js?v=0.21.0';
import {TYPES,QUESTION_STORAGE,readQuestionWorkspaces,parseQuestions} from './inquiry.js?v=0.21.0';
import { createWorkbenchTools, registerWorkbenchTools } from './tools.js?v=0.21.0';

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
  root.querySelectorAll('textarea').forEach(element => { element.style.height = 'auto'; element.style.height = `${Math.min(420,Math.max(element.scrollHeight, Number(element.dataset.minHeight) || 58))}px`; });
}
function textarea({id, label, value, prompt = '', group, key, frameId = '', rows = 2, className = ''}) {
  return `<div class="field ${className}"><label for="${esc(id)}">${label}</label>${prompt ? `<p class="field-prompt" id="${esc(id)}-hint">${esc(prompt)}</p>` : ''}<textarea id="${esc(id)}" rows="${rows}" maxlength="20000" data-group="${group}" data-key="${key}" ${frameId ? `data-frame="${esc(frameId)}"` : ''} ${prompt ? `aria-describedby="${esc(id)}-hint"` : ''} spellcheck="true">${esc(value)}</textarea></div>`;
}
function chooseButton(item, session, small = false) {
  const chosen = session.selected.includes(item.id);
  return `<button class="choose-button ${chosen ? 'is-chosen' : ''} ${small ? 'compact' : ''}" data-action="choose" data-id="${esc(item.id)}" aria-pressed="${chosen}"><span aria-hidden="true">${chosen ? icon('check') : '+'}</span> ${chosen ? 'Chosen for the test' : 'Carry this forward'}<span class="sr-only">: ${nameOf(item)} frame</span></button>`;
}
let destroyInquiryDrag=()=>{},legacyQuestions=[];
const questionLabel=q=>q.question.trim()||'An unwritten question';
function inquiryView(session){
  const w=session.inquiry,items=w.phase==='develop'?w.items.filter(q=>w.selected.includes(q.id)):w.items;
  return `<section class="view-panel"><div class="section-top"><div><h2>Which question changes your next move?</h2><p>Connect a question to the frame it opens or challenges. Drag its handle, or use Connect.</p></div><div class="inquiry-actions"><button class="button secondary" data-action="bring-questions">Bring existing Questions work</button><button class="button primary" data-action="question-add" ${w.items.length>=28?'disabled':''}>+ Question</button></div></div><div class="inquiry-filter"><button class="button" data-action="question-phase" data-phase="expand" aria-pressed="${w.phase==='expand'}">All questions · ${w.items.length}</button><button class="button" data-action="question-phase" data-phase="develop" aria-pressed="${w.phase==='develop'}">Explore selected · ${w.selected.length}</button></div><div class="inquiry-board"><div class="inquiry-cards">${items.length?items.map(q=>`<article class="inquiry-card" data-drag-id="${esc(q.id)}"><div class="inquiry-card-head"><span>${esc(TYPES[q.type])}${q.parent?' · branch':''}</span><button class="button drag-handle" data-drag-handle data-action="question-connect" data-id="${esc(q.id)}" aria-label="Connect ${esc(questionLabel(q))}">⠿</button></div><h3>${esc(questionLabel(q))}</h3><p>${esc(q.unlocks||'What decision could answering this change?')}</p>${q.parent?`<p class="source-note">From: ${esc(questionLabel(w.items.find(p=>p.id===q.parent)))}</p>`:''}<div class="question-links">${w.links.filter(l=>l.questionId===q.id).map(l=>`<span>${l.relation} · ${esc(nameOf(session.frames.find(f=>f.id===l.frameId)))}</span>`).join('')}</div><div class="inquiry-actions"><button class="text-button" data-action="question-edit" data-id="${esc(q.id)}">Develop</button><button class="text-button" data-action="question-connect" data-id="${esc(q.id)}">Connect</button><button class="text-button" data-action="question-select" data-id="${esc(q.id)}" aria-pressed="${w.selected.includes(q.id)}">${w.selected.includes(q.id)?'✓ Selected':'Select to explore'}</button></div></article>`).join(''):'<p class="inquiry-empty">Start with a question whose answer could change what you do. Your frames remain on the right.</p>'}</div><aside class="inquiry-frames" aria-label="Connect questions to frames">${session.frames.map(f=>`<section class="frame-target" data-drop-id="${esc(f.id)}"><span class="eyebrow">${esc(nameOf(f))} FRAME</span><h3>${esc(f.statement||LENSES[f.lens].question)}</h3><p>${f.intervention?`Next move: ${esc(f.intervention)}`:'What different action could this interpretation make possible?'}</p><p class="connection-count">${w.links.filter(l=>l.frameId===f.id).length} connected questions</p><button class="text-button" data-action="edit-field" data-id="${esc(f.id)}" data-key="statement">Develop this frame →</button></section>`).join('')}</aside></div><div class="view-footer"><p>Connecting a question records your hypothesis; evidence must establish whether the frame holds.</p><button class="button primary" data-action="view" data-view="frames">Develop the frames →</button></div></section>`;
}
function sourceQuestions(session,frame){
 const links=session.inquiry.links.filter(l=>l.frameId===frame.id);
 return links.length?`<div class="frame-question-links">${links.map(l=>{const q=session.inquiry.items.find(q=>q.id===l.questionId);return `<button class="text-button" data-action="question-edit" data-id="${esc(q.id)}">${l.relation}: ${esc(questionLabel(q))}</button>`;}).join('')}</div>`:'';
}
function openQuestion(id){
  const session=activeSession(state),q=session.inquiry.items.find(q=>q.id===id);if(!q)return;
  const parent=q.parent?session.inquiry.items.find(p=>p.id===q.parent):null;
  openDialog('inquiry-dialog',`${dialogHeading('inquiry-title','A QUESTION THAT OPENS A CHOICE','Develop this question')}<div class="inquiry-editor">${parent?`<p class="source-note">Source: ${esc(questionLabel(parent))}</p><p>${q.relation==='invert'?'Name the premise you want to challenge, then ask what would change if it were wrong.':'What smaller or different question would help answer the source?'}</p>`:''}<div class="inquiry-selects"><label>Lens<select data-question-select="type" data-id="${esc(q.id)}">${Object.entries(TYPES).map(([k,l])=>`<option value="${k}" ${q.type===k?'selected':''}>${l}</option>`).join('')}</select></label><label>Answer status<select data-question-select="status" data-id="${esc(q.id)}">${[['open','Unanswered'],['hypothesis','Working hypothesis'],['supported','Supported by evidence I recorded']].map(([k,l])=>`<option value="${k}" ${q.status===k?'selected':''}>${l}</option>`).join('')}</select></label></div>${textarea({id:`q-${q.id}-question`,label:'The question',value:q.question,group:'question',frameId:q.id,key:'question'})}${textarea({id:`q-${q.id}-unlocks`,label:'What decision or action could its answer change?',value:q.unlocks,group:'question',frameId:q.id,key:'unlocks'})}<details class="inquiry-detail"><summary>Answer, evidence and possible approaches</summary>${[['answer','Provisional answer'],['evidence','Evidence and what remains uncertain'],['ideas','Possible approaches']].map(([key,label])=>textarea({id:`q-${q.id}-${key}`,label,value:q[key],group:'question',frameId:q.id,key})).join('')}</details><div class="inquiry-actions"><button class="button" data-action="question-branch" data-id="${esc(q.id)}" data-relation="expand">Ask a smaller question</button><button class="button" data-action="question-branch" data-id="${esc(q.id)}" data-relation="invert">Challenge a premise</button><button class="button" data-action="question-new-frame" data-id="${esc(q.id)}">Open a new frame</button><button class="text-button" data-action="question-remove" data-id="${esc(q.id)}">Remove question</button><button class="button primary" data-action="close-dialog">Done</button></div></div>`);
  sizeQuestionFields();
}
function sizeQuestionFields(){document.querySelectorAll('#inquiry-dialog textarea').forEach(el=>{el.style.height='auto';el.style.height=Math.min(420,Math.max(80,el.scrollHeight+2))+'px';});}
function openConnections(id){const s=activeSession(state),q=s.inquiry.items.find(q=>q.id===id);if(!q)return;openDialog('inquiry-dialog',`${dialogHeading('inquiry-title','CONNECT A QUESTION','What does this question do?',questionLabel(q))}<div class="question-connections">${s.frames.map(f=>{const l=s.inquiry.links.find(l=>l.questionId===q.id&&l.frameId===f.id);return `<label><strong>${esc(nameOf(f))}</strong><p>${esc(f.statement||LENSES[f.lens].question)}</p><select data-question-link data-question="${esc(q.id)}" data-frame="${esc(f.id)}"><option value="none">No connection</option><option value="opens" ${l?.relation==='opens'?'selected':''}>Opens this frame</option><option value="challenges" ${l?.relation==='challenges'?'selected':''}>Challenges this frame</option></select></label>`;}).join('')}</div><button class="button primary" data-action="close-dialog">Done</button>`);}
function bringQuestions(){
  let error='';try{const raw=localStorage.getItem(QUESTION_STORAGE);legacyQuestions=raw?readQuestionWorkspaces(raw):[];}catch{legacyQuestions=[];error='The earlier saved workspace could not be read. It remains untouched. Open Questions to recover it, or import a valid export.';}
  openDialog('inquiry-dialog',`${dialogHeading('inquiry-title','KEEP YOUR EXISTING THINKING','Bring Questions into Reframing','Each import becomes a new problem. The original Questions workspace remains unchanged.')}<p>${error?esc(error):legacyQuestions.length?'Choose a saved workspace to copy.':'No Questions work is saved at this browser address. You can import a Questions JSON export.'}</p><div class="sessions-list">${legacyQuestions.map((w,i)=>`<button class="session-row" data-action="copy-questions" data-index="${i}"><strong>${esc(w.problem||'Untitled questions')}</strong><span>${w.items.length} questions →</span></button>`).join('')}</div><button class="button" data-action="import">Import Questions or Reframing JSON</button>`);
}
function openFrameEditor(id,key='statement'){const field=document.getElementById(fieldId(id,key));if(!field)return;for(let p=field.parentElement;p;p=p.parentElement)if(p instanceof HTMLDetailsElement)p.open=true;sizeTextareas();field.focus();field.scrollIntoView({block:'center',inline:'center',behavior:'instant'});}

function frameCard(item, index, session) {
  const lens = LENSES[item.lens];
  const count = frameProgress(item);
  return `<article class="frame-card lens-${item.lens} ${session.selected.includes(item.id) ? 'chosen' : ''}" aria-labelledby="${esc(item.id)}-title">
    <header class="frame-heading"><div><span class="frame-number">FRAME ${String(index + 1).padStart(2, '0')}</span><h3 id="${esc(item.id)}-title">${lens.name}</h3></div><div class="frame-tools"><span class="progress" id="${esc(item.id)}-progress" title="${count} of 7 fields written">${count}/7</span>${session.frames.length > MIN_FRAMES ? `<button class="icon-button" data-action="remove-frame" data-id="${esc(item.id)}" aria-label="Remove ${lens.name} frame">×</button>` : ''}</div></header>
    <p class="lens-question">${lens.question}</p>
    <p class="frame-summary">${esc(item.statement||'An interpretation to develop')}</p><p class="frame-move-preview"><strong>Next move:</strong> ${esc(item.intervention||'What would you do differently?')}</p>${sourceQuestions(session,item)}<details class="frame-editor" id="editor-${esc(item.id)}"><summary>Edit this frame</summary>
    ${textarea({id: fieldId(item.id, 'statement'), label: 'See the problem as…', value: item.statement, prompt: lens.statement, group: 'frame', frameId: item.id, key: 'statement', rows: 3, className: 'statement-field'})}
    ${item.origin?'<div class="branch-context">'+textarea({id:fieldId(item.id,'branchReason'),label:'Why branch this interpretation?',value:item.branchReason,prompt:'What does changing this interpretation let you notice or try?',group:'frame',frameId:item.id,key:'branchReason'})+sourceDetails(ancestryOfFrame(item))+'</div>':''}
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
    </details><footer class="frame-footer">${chooseButton(item, session)}<button class="text-button branch-frame" data-action="branch-frame" data-id="${esc(item.id)}" ${session.frames.length>=MAX_FRAMES?'disabled':''}>Branch this interpretation</button></footer>
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
  const openIds=[...root.querySelectorAll('details[open][id]')].map(el=>el.id);destroyInquiryDrag();
  const session = activeSession(state);
  root.innerHTML = `<div class="workbench-top"><div><p class="eyebrow">SCAFFOLD 01 <span aria-hidden="true">/</span> REFRAME THE QUESTION</p><h1>Reframing workbench</h1></div><div class="workspace-actions"><button class="button quiet" data-action="undo" ${history.length ? '' : 'disabled'}><span aria-hidden="true">↶</span> Undo</button><button class="button secondary" data-action="open-sessions">My problems <span class="button-count">${state.sessions.length}</span></button><button class="button secondary" data-action="open-export">Export <span aria-hidden="true">↓</span></button></div></div>
    ${storageIssue ? `<div class="notice" role="status">${esc(storageIssue)}${recoveryRaw ? ' <button class="text-button" data-action="recover">Download recovery copy</button>' : ''}${storagePaused && !recoveryRaw ? ' <button class="text-button" data-action="resume-save">Save this tab instead</button>' : ''}</div>` : ''}
    <section class="problem-section" aria-labelledby="problem-heading"><div class="problem-label"><label id="problem-heading" for="problem">The problem, in your words</label><span class="saved-status ${storageIssue ? 'save-error' : ''}" id="save-status" role="status">${storagePaused ? 'Local saving paused' : storageIssue ? 'Not saved · export a copy' : saveMessage}</span></div><textarea id="problem" class="problem-input" aria-describedby="problem-help" rows="1" maxlength="20000" data-group="problem" data-key="problem" placeholder="We need… / We keep… / We cannot…">${esc(session.problem)}</textarea><div class="problem-bottom"><p id="problem-help">Start with the way you say it now. You can change it as you go.</p><button class="text-button" data-action="new-session">Start my own problem <span aria-hidden="true">↗</span></button></div><details class="context-details"><summary>Add context <span>${session.context.trim() ? 'Written' : 'Optional'}</span></summary>${textarea({id: 'context', label: 'What someone else would need to know', value: session.context, group: 'problem', key: 'context', rows: 2})}</details></section>
    <nav class="view-nav" aria-label="Workbench steps">${[['questions','01','Questions & connections'], ['frames', '02', 'Develop frames'], ['compare', '03', 'Compare moves'], ['plan', '04', 'Choose a test']].map(([view, number, label]) => `<button data-action="view" data-view="${view}" ${session.view === view ? 'aria-current="step"' : ''}><span class="step-number">${number}</span><span>${label}</span>${view === 'plan' && session.selected.length ? `<span class="selection-count">${session.selected.length}</span>` : ''}</button>`).join('')}</nav>
    ${session.view === 'questions' ? inquiryView(session) : session.view === 'frames' ? framesView(session) : session.view === 'compare' ? compareView(session) : planView(session)}
    <div class="workbench-foot"><p>Guided prompts, your reasoning. No generated answers.</p><p>Your work stays in this browser. Export a copy to keep or move it.</p></div>`;
  for(const id of openIds){const d=document.getElementById(id);if(d)d.open=true;}
  destroyInquiryDrag=attachCardDrag({root,onDrop:({itemId,dropId})=>{if(act({type:'inquiry',action:{type:'link',questionId:itemId,frameId:dropId,relation:'opens'}}))toast('Question connected. Use Connect to mark it as a challenge instead.');}});
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
  openDialog('export-dialog', `${dialogHeading('export-title', 'TAKE YOUR THINKING WITH YOU', 'Export this problem', 'Includes all questions, connections, frames, source snapshots and the working test.')}<div class="export-options"><button class="export-option" data-action="export-markdown"><span class="export-symbol">MD</span><span><strong>Download Markdown</strong><span>A readable note for your notes app or a colleague.</span></span><span aria-hidden="true">↓</span></button><button class="export-option" data-action="export-json"><span class="export-symbol">{ }</span><span><strong>Download editable session</strong><span>A JSON file you can import here later.</span></span><span aria-hidden="true">↓</span></button><button class="export-option" data-action="copy-markdown"><span class="export-symbol">↗</span><span><strong>Copy as Markdown</strong><span>Put the complete note on your clipboard.</span></span></button></div><p class="microcopy">Local saving is specific to this browser and website address. An export gives you a portable copy.</p>`);
}
function closeDialogs() { document.querySelectorAll('dialog[open]').forEach(dialog => dialog.close()); }
function filename(extension) { return `reframing-${sessionTitle(activeSession(state)).toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 60).replace(/-$/, '') || 'problem'}.${extension}`; }

document.addEventListener('click', async event => {
  const button = event.target.closest('[data-action]'); if (!button) return;
  const action = button.dataset.action;
  if (action === 'undo') undo();
  else if (action === 'view') { act({type: 'view', value: button.dataset.view}, {undo: false}); announce(`Opened ${button.dataset.view === 'frames' ? 'frames' : button.dataset.view === 'compare' ? 'comparison' : 'test plan'}.`); }
  else if(action==='question-add'){const id=uid();if(act({type:'inquiry',action:{type:'add',id}})){if(activeSession(state).inquiry.phase!=='expand')act({type:'inquiry',action:{type:'phase',phase:'expand'}},{undo:false});openQuestion(id);}}
  else if(action==='question-edit')openQuestion(button.dataset.id);
  else if(action==='question-connect')openConnections(button.dataset.id);
  else if(action==='question-select')act({type:'inquiry',action:{type:'select',id:button.dataset.id}});
  else if(action==='question-phase')act({type:'inquiry',action:{type:'phase',phase:button.dataset.phase}},{undo:false});
  else if(action==='question-branch'){const id=uid();if(act({type:'inquiry',action:{type:'branch',id,parent:button.dataset.id,relation:button.dataset.relation}},{repaint:false})){closeDialogs();openQuestion(id);}}
  else if(action==='question-remove'){if(act({type:'inquiry',action:{type:'remove',id:button.dataset.id}})){closeDialogs();toast('Question removed. Undo restores it.');}}
  else if(action==='question-new-frame'){const id=uid();if(act({type:'frame-from-question',id,questionId:button.dataset.id})){closeDialogs();openFrameEditor(id);}}
  else if(action==='branch-frame'){const id=uid();if(act({type:'branch-frame',id,parent:button.dataset.id}))openFrameEditor(id);}
  else if(action==='bring-questions')bringQuestions();
  else if(action==='copy-questions'){const w=legacyQuestions[Number(button.dataset.index)];if(w&&act({type:'import-questions',workspace:w,id:uid()})){closeDialogs();toast('Questions copied into a new problem. The original workspace is unchanged.');}}
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
  else if (action === 'edit-field') {act({type:'view',value:'frames'},{undo:false});openFrameEditor(button.dataset.id,button.dataset.key);}
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
  element.style.height = 'auto'; element.style.height = `${Math.min(420,Math.max(element.scrollHeight,58))}px`;
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
    if (file.size > MAX_IMPORT_BYTES) throw new Error('Choose a Reframing JSON file smaller than 8 MB.');
    const raw=await file.text();const isQuestions=JSON.parse(raw)?.kind==='questions';
    const content=isQuestions?parseQuestions(raw):parseSession(raw);closeDialogs();
    if(act(isQuestions?{type:'import-questions',workspace:content,id:uid()}:{type:'import-session',session:content,id:uid()}))toast('Imported as a new problem. Your existing work is still saved.');
  } catch (error) { toast(error.message); }
  event.target.value = '';
});
const inquiryDialog=document.getElementById('inquiry-dialog');
inquiryDialog.addEventListener('input',event=>{const el=event.target;if(el.dataset.group!=='question')return;try{if(editingKey!==el.id){checkpoint();editingKey=el.id;}state=transition(state,{type:'inquiry',action:{type:'edit',item:el.dataset.frame,field:el.dataset.key,value:el.value}});save();sizeQuestionFields();}catch(error){toast(error.message);}});
inquiryDialog.addEventListener('change',event=>{const el=event.target;if(el.dataset.questionSelect)act({type:'inquiry',action:{type:'edit',item:el.dataset.id,field:el.dataset.questionSelect,value:el.value}},{repaint:false});if(el.hasAttribute('data-question-link'))act({type:'inquiry',action:{type:'link',questionId:el.dataset.question,frameId:el.dataset.frame,relation:el.value}},{repaint:false});});
inquiryDialog.addEventListener('focusout',()=>{editingKey=null;});
inquiryDialog.addEventListener('close',()=>{render();});
inquiryDialog.addEventListener('toggle',()=>requestAnimationFrame(sizeQuestionFields),true);
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
