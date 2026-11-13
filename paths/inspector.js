/* Pure view data for the selected-decision inspector. The browser module owns
   DOM construction; this module owns selection continuity and display words so
   they can be tested without importing app.js or inventing projection shapes. */

export function resolveSelectedDecision(projected, selected){
  if(!projected || !selected) return null;
  const decisions = Array.isArray(projected.decisions) ? projected.decisions : [];
  const key = String(selected.key || '').toLowerCase();
  const exact = decisions.find(decision => decision.key === key &&
    decision.srcLine === selected.srcLine);
  return exact || decisions.find(decision => decision.key === key) || null;
}

function availability(decision){
  if(decision.availability === 'moot') return {kind:'moot', label:'No longer applies'};
  if(decision.availability === 'dormant') return {kind:'dormant', label:'Not open yet'};
  return {kind:'active', label:'Available now'};
}

function testability(decision){
  const missing = [];
  if(!decision.signal) missing.push('signal');
  if(!decision.owner) missing.push('owner');
  if(!decision.answerBy) missing.push('answer-by');
  const labels = {signal:'signal', owner:'owner', 'answer-by':'due date'};
  return missing.length
    ? {kind:'untestable', label:'Needs ' + missing.map(field => labels[field]).join(' + '), missing}
    : {kind:'testable', label:'Testable', missing:[]};
}

const sentence = value => {
  const text = String(value || '');
  return text ? text[0].toUpperCase() + text.slice(1) : text;
};

/* The item's state is the evaluator's. The evidence only words the reason: an item can be
   included because its question never arose (an [unless child] fallback when child's host
   was answered no), and must not read as "Not needed" for that (PA-3). */
function treatment(item){
  const evidence = item?.displayEvidence;
  if(evidence?.kind === 'condition-error') return 'Condition needs fixing';
  if(evidence?.kind === 'completed') return 'Completed';
  const following = () => evidence?.kind === 'assumption'
    ? (evidence.direction === 'no' ? 'Following an assumed no' : 'Following an assumed yes')
    : 'Following an assumption';
  const setAside = () => evidence?.kind === 'set-aside'
    ? (evidence.direction === 'no' ? 'Set aside on an assumed no' : 'Set aside on an assumed yes')
    : 'Set aside on an assumption';
  switch(item?.itemState){
    case 'in-plan': return 'Included';
    case 'not-needed': return 'Not needed';
    case 'limbo': return following();
    case 'set-aside': return setAside();
    case 'waiting': return 'Waiting';
    default: break;
  }
  if(evidence?.kind === 'assumption') return following();
  if(evidence?.kind === 'set-aside') return setAside();
  if(evidence?.kind === 'pending-answer') return 'Waiting';
  if(evidence?.kind === 'host-exclusion') return 'Not needed';
  return 'Included';
}

/* the stated reason when the item's condition was settled by a question that never arose */
function neverAroseReason(item){
  const member = (item?.conditionResult?.evidence || []).find(entry => entry.reason && entry.decision);
  if(!member) return '';
  const host = member.reason.host || member.reason.hostKey || 'its host';
  const who = sentence(member.decision.name || member.decision.key);
  return item.itemState === 'in-plan'
    ? `${who} never arose (${sentence(host)} = ${member.reason.direction})`
    : `${who} no longer applies after ${sentence(host)} = ${member.reason.direction}`;
}

function affected(item){
  const reason = item?.displayEvidence?.kind === 'host-exclusion' ? neverAroseReason(item) : '';
  return {title:item.title, status:item.status || '', treatment:treatment(item), ...(reason ? {reason} : {})};
}

function arms(question){
  const yes = [...(question.arms?.yes || [])];
  const no = [...(question.arms?.no || [])];
  if(question.chosenSide === 'yes') yes.push(...(question.continuation || []));
  if(question.chosenSide === 'no') no.push(...(question.continuation || []));
  if(question.stump?.side === 'yes') yes.push(...(question.stump.items || []));
  if(question.stump?.side === 'no') no.push(...(question.stump.items || []));
  return {yes:yes.map(affected), no:no.map(affected)};
}

function answerNotice(decision, answer){
  if(!answer) return '';
  if(decision.availability === 'dormant')
    return 'Answer kept, but not used until this question opens.';
  if(decision.availability === 'moot'){
    /* the host's actual answer, as the evaluator recorded it, not an assumed "no" */
    const why = decision.mootReason ? `${decision.mootReason.host} was ${decision.mootReason.direction}`
      : 'its opening condition was not met';
    return `Answer kept, but not used because ${why}; this question did not apply.`;
  }
  return '';
}

export function auditableAnswerDraft(decision, direction, today){
  if(!decision || !/^(yes|no)$/.test(direction || '')) return '';
  const old = decision.answer || decision.answers?.find(answer => answer.valid) || null;
  const parts = [direction, old?.date || today].filter(Boolean);
  if(old?.target) parts.push('target: ' + old.target);
  if(old?.actual) parts.push('actual: ' + old.actual);
  return parts.join(' ') + (old?.receipt ? ' -- ' + old.receipt : ' -- ');
}

/* Takes the selected topology question, not a raw parsed/evaluated decision.
   This pins the inspector's arms and state to the same projection the tree drew. */
export function decisionInspectorData(question){
  const decision = question?.decision;
  if(!decision) return null;
  const authoredAnswer = decision.answer || decision.answers?.find(answer => answer.valid) ||
    decision.answers?.[0] || null;
  return {
    key:decision.key,
    name:decision.name,
    srcLine:decision.srcLine,
    question:decision.question || '',
    signal:decision.signal || '',
    reading:decision.reading || '',
    learn:decision.learn || '',
    enough:decision.enough || '',
    owner:decision.owner || '',
    answerBy:decision.answerBy || '',
    answer:authoredAnswer?.raw || '',
    assumption:decision.assumption?.raw || '',
    when:decision.when?.source || '',
    availability:availability(decision),
    testability:testability(decision),
    answerNotice:answerNotice(decision, authoredAnswer),
    answerActionsEnabled:decision.availability === 'active',
    arms:arms(question),
  };
}

const EDIT_FIELDS = [
  {kind:'question', key:'question', label:'Question', fallback:'Add the question', className:'question-field'},
  {kind:'signal', key:'signal', label:'Signal', fallback:'Add evidence'},
  {kind:'reading', key:'reading', label:'Reading', fallback:'Add latest reading'},
  {kind:'learn', key:'learn', label:'Learning move', fallback:'Add the deliberate learning move'},
  {kind:'enough', key:'enough', label:'Enough to decide', fallback:'Add the evidence standard'},
  {kind:'owner', key:'owner', label:'Owner', fallback:'Add owner'},
  {kind:'answer-by', key:'answerBy', label:'Answer by', fallback:'Add due date'},
  {kind:'assume', key:'assumption', label:'Assumption', fallback:'No assumption'},
  {kind:'when', key:'when', label:'Opens when', fallback:'Always available'},
  {kind:'answer', key:'answer', label:'Answer / receipt', fallback:'Not answered — add a dated receipt'},
];

/* Single source for the app's ten editable inspector fields and the phone
   meta-test. It can only exist after a real topology question is selected. */
export function decisionEditSurface(question){
  const view = decisionInspectorData(question);
  if(!view) return null;
  return {view, fields:EDIT_FIELDS.map(field => ({...field, raw:view[field.key] || ''}))};
}

const html = value => String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;')
  .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');

/* Minimal safe markup for the renderer-discovery meta-test. The live app builds
   DOM nodes from these exact fields; this serialisation exists only so the
   standing regex-based phone floor can inspect the same selected surface. */
export function inspectorEditSurfaceMarkup(question){
  const surface = decisionEditSurface(question);
  if(!surface) return '';
  return surface.fields.map(field => '<button data-edit="' + html(field.kind) +
    '" data-line="' + surface.view.srcLine + '" data-raw="' + html(field.raw) + '"></button>').join('');
}
