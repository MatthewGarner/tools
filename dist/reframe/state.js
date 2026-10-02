import{blankInquiry,exampleInquiry,normalizeInquiry,changeInquiry,remapInquiry}from'./inquiry.js?v=0.8.0';
export const STORAGE_KEY = 'thinking-lab:reframe:v1';
export const VERSION = 1;
export const MAX_FRAMES = 5;
export const MIN_FRAMES = 3;
export const MAX_IMPORT_BYTES = 8000000;
export const FRAME_FIELDS = ['statement', 'whoWhen', 'assumption', 'reveals', 'hides', 'intervention', 'test'];
export const PLAN_FIELDS = ['statement', 'nextMove', 'assumption', 'test', 'learn'];

export const LENSES = {
  decision: { name: 'Decision', short: 'A choice to make', question: 'What decision would a better answer actually change?', statement: 'We need to decide…', whoWhen: 'Who makes the decision, and by when?', assumption: 'What are you assuming would change the choice?', reveals: 'Which choices and trade-offs become visible?', hides: 'What falls outside this decision?', intervention: 'What decision rule, threshold, or option could you change?', test: 'Try the rule on one real or recent decision. What would you learn?' },
  constraints: { name: 'Constraint', short: 'A limit to move', question: 'What is preventing progress, even if everything else improves?', statement: 'We cannot make progress because…', whoWhen: 'Who encounters this limit, and at what point?', assumption: 'Why do you think this is the binding constraint?', reveals: 'Which limit or dependency becomes visible?', hides: 'What will still be difficult if this limit goes away?', intervention: 'What could you remove, relax, or route around?', test: 'Temporarily remove one limit. Does the result change?' },
  information: { name: 'Information', short: 'A gap to close', question: 'What is unknown, and would knowing it change what you do?', statement: 'We do not know enough about…', whoWhen: 'Who needs which information, and when is it useful?', assumption: 'What are you assuming more information will enable?', reveals: 'Which uncertainty is worth resolving?', hides: 'What cannot be fixed by knowing more?', intervention: 'What observation or feedback would reduce the useful uncertainty?', test: 'What is the cheapest observation that could change your mind?' },
  coordination: { name: 'Coordination', short: 'A handoff to repair', question: 'Where do individually reasonable actions fail to work together?', statement: 'We are not aligned on…', whoWhen: 'Whose work depends on whose, and at which handoff?', assumption: 'Are people trying to achieve the same outcome?', reveals: 'Which dependencies, owners, or expectations become visible?', hides: 'Which individual limits might you miss?', intervention: 'What agreement, signal, or handoff could you change?', test: 'Try the new agreement for one cycle. What friction disappears?' },
  incentives: { name: 'Incentives', short: 'A reward to question', question: 'What does the current setup make it sensible for people to do?', statement: 'The current rewards encourage…', whoWhen: 'Whose behaviour makes sense locally but hurts the whole?', assumption: 'Are people responding to rewards, or facing another limit?', reveals: 'Which rewards, penalties, and measures become visible?', hides: 'What might persist even if incentives change?', intervention: 'What reward, measure, or responsibility could you change?', test: 'Change one signal for a small group. What behaviour changes?' },
  error: { name: 'Cost of error', short: 'An asymmetry to expose', question: 'Which kind of wrong is expensive, and which is recoverable?', statement: 'The costly mistake would be…', whoWhen: 'Who bears the cost, and when does it become hard to reverse?', assumption: 'What are you assuming about the probability and cost of each error?', reveals: 'Which downside, asymmetry, or reversibility becomes visible?', hides: 'Which opportunities might excessive caution exclude?', intervention: 'What guardrail, buffer, or reversible step could help?', test: 'Stress-test one plausible mistake. Where does the harm begin?' },
  time: { name: 'Time', short: 'A sequence to change', question: 'Is this a problem of timing, delay, or acting in the wrong order?', statement: 'We are acting too early, too late, or before…', whoWhen: 'Whose clock matters, and what window is closing?', assumption: 'What are you assuming about what becomes clearer with time?', reveals: 'Which sequence, lag, or deadline becomes visible?', hides: 'Which structural issue might waiting disguise?', intervention: 'What could you do earlier, delay, or split into stages?', test: 'Change the timing of one step. What becomes easier or possible?' },
  value: { name: 'Value', short: 'An outcome to clarify', question: 'Whose outcome is this meant to improve, and what counts as better?', statement: 'The outcome that matters is…', whoWhen: 'Who benefits, in what situation?', assumption: 'Why do you think this outcome matters to them?', reveals: 'Which user need or measure of success becomes visible?', hides: 'Whose needs or longer-term effects might be missed?', intervention: 'What simpler change could improve that outcome?', test: 'Try one small change with one person. Did their outcome improve?' }
};

const copy = value => structuredClone(value);
const blankOrigin = () => null;
const blankPlan = () => Object.fromEntries(PLAN_FIELDS.map(key => [key, '']));
export const blankFrame = (lens, id) => ({ id, lens, origin: blankOrigin(), ...Object.fromEntries(FRAME_FIELDS.map(key => [key, ''])) });
const frame = (lens, id, values) => ({...blankFrame(lens, id), ...values});

const EXAMPLES = {
  forecasts: {
    problem: 'We need better forecasts.',
    context: 'A team is spending more time refining demand forecasts, but its weekly staffing decisions are not improving. A fictional example to edit.',
    frames: [
      ['decision', { statement: 'We need a staffing rule that works even when demand is uncertain.', whoWhen: 'The operations lead, before the weekly rota is locked.', assumption: 'Forecast accuracy only matters when it changes the staffing choice.', reveals: 'Decision thresholds and the options we can act on.', hides: 'Longer-term causes of forecast error.', intervention: 'Set a base rota, then define when to add flexible cover.', test: 'Replay the last four weeks using a simple staffing rule. Compare understaffing and unused hours.' }],
      ['constraints', { statement: 'We cannot change staffing after the rota is locked.', whoWhen: 'Shift managers, when demand changes after Monday.', assumption: 'Our inability to respond is more costly than the forecast error.', reveals: 'Lead times, flexibility, and the cost of changing a plan.', hides: 'Some demand changes may still be impossible to cover.', intervention: 'Create a small pool of shifts that can move with 24 hours’ notice.', test: 'Offer two voluntary flexible shifts next week. Track filled gaps, cost, and disruption.' }],
      ['information', { statement: 'The demand signal reaches the people setting the rota too late.', whoWhen: 'The operations lead, before the Monday planning meeting.', assumption: 'Recent bookings are a useful signal and are not already being used.', reveals: 'Data freshness and the path from observation to action.', hides: 'Better information cannot create spare capacity.', intervention: 'Put current bookings and their uncertainty next to the staffing choice.', test: 'Show the live booking signal at one planning meeting. Record whether any staffing choice changes.' }]
    ]
  },
  bess: {
    problem: 'Our battery should capture more value.',
    context: 'A fictional battery energy storage system (BESS). A team is reviewing dispatch performance; these are thinking examples, not trading or operating guidance.',
    frames: [
      ['decision', { statement: 'We need to decide when keeping energy in reserve is worth more than dispatching now.', whoWhen: 'The dispatch team, at each scheduling decision.', assumption: 'Foregone future value is a meaningful part of today’s dispatch choice.', reveals: 'Opportunity cost, reserve thresholds, and competing uses.', hides: 'Physical availability and operating limits.', intervention: 'Make the reserve threshold and the reason for it explicit.', test: 'Replay one historical day under two reserve rules. Compare the trade-offs using the same known inputs.' }],
      ['constraints', { statement: 'The usable operating window limits the opportunities we can take.', whoWhen: 'Operations and scheduling, before offers are made.', assumption: 'A physical or contractual limit is binding more often than the price view.', reveals: 'Availability, energy limits, and constraints on dispatch.', hides: 'Whether apparently attractive opportunities were predictable.', intervention: 'Label each missed opportunity with the actual binding limit.', test: 'Review ten missed opportunities. Count which were prevented by a limit and which by a choice.' }],
      ['error', { statement: 'The cost of being wrong is asymmetric across dispatch choices.', whoWhen: 'The team setting risk limits, before committing capacity.', assumption: 'Some small revenue gains expose us to disproportionately costly errors.', reveals: 'Downside exposure, recovery time, and reversible decisions.', hides: 'Routine improvements and upside outside the chosen scenarios.', intervention: 'Compare revenue alongside the cost and reversibility of a plausible error.', test: 'Walk through one adverse scenario with operations. Identify the first decision that makes recovery difficult.' }]
    ]
  }
};

export function createSession(example = 'blank', id = 'session-1', now = new Date().toISOString()) {
  if (example !== 'blank' && !Object.hasOwn(EXAMPLES, example)) throw new Error('Choose a known example or a blank problem.');
  const source = example === 'blank' ? null : EXAMPLES[example];
  const session = { id, createdAt: now, updatedAt: now, problem: source?.problem || '', context: source?.context || '',
    frames: source ? source.frames.map(([lens, values], i) => frame(lens, `${id}-f${i + 1}`, values)) : ['decision', 'constraints', 'information'].map((lens, i) => blankFrame(lens, `${id}-f${i + 1}`)),
    selected: [], plan: blankPlan(), view: 'questions', inquiry:blankInquiry(`${id}-questions`), sources:[] };
  if(source)session.inquiry=exampleInquiry(`${id}-questions`,session.frames);
  if(example==='bess'){session.inquiry.items=session.inquiry.items.slice(0,3).map((q,i)=>({...q,question:LENSES[session.frames[i].lens].question,unlocks:session.frames[i].intervention}));session.inquiry.selected=['q1'];}
  return session;
}
export function initialState() { const session = createSession('forecasts'); return {version: VERSION, activeId: session.id, sessions: [session]}; }
export function activeSession(state) { return state.sessions.find(session => session.id === state.activeId); }

export function transition(state, action, now = new Date().toISOString()) {
  const next = copy(state);
  const session = activeSession(next);
  if (!session) throw new Error('No active session.');
  switch (action.type) {
    case 'inquiry':
      session.inquiry=changeInquiry(session.inquiry,action.action,session.frames);break;
    case 'branch-frame': {
      if(session.frames.length>=MAX_FRAMES)throw Error('Keep at most five frames so they stay comparable.');
      const parent=session.frames.find(f=>f.id===action.parent);
      if(!parent||typeof action.id!=='string'||!action.id||session.frames.some(f=>f.id===action.id))throw Error('Choose an existing frame and a new branch.');
      const {origin,...snapshot}=copy(parent);session.frames.push({...copy(parent),id:action.id,origin:{kind:'frame',sourceId:parent.id,snapshot}});
      break;
    }
    case 'frame-from-question': {
      if(session.frames.length>=MAX_FRAMES)throw Error('Five frames are already in play. Connect the question to an existing frame or remove one first.');
      const q=session.inquiry.items.find(q=>q.id===action.questionId);if(!q)throw Error('Choose a question.');
      if(typeof action.id!=='string'||!action.id||session.frames.some(f=>f.id===action.id))throw Error('Choose a new frame identifier.');
      const lens={fact:'information',cause:'constraints',value:'value',design:'decision'}[q.type];
      session.frames.push({...blankFrame(lens,action.id),statement:q.answer,intervention:q.ideas,origin:{kind:'question',sourceId:q.id,snapshot:copy(q)}});
      session.inquiry=changeInquiry(session.inquiry,{type:'link',questionId:q.id,frameId:action.id,relation:'opens'},session.frames);
      session.view='frames';break;
    }
    case 'edit-problem':
      if (!['problem', 'context'].includes(action.field) || typeof action.value !== 'string') throw new Error('Unknown problem field.');
      session[action.field] = action.value; break;
    case 'edit-frame': {
      const target = session.frames.find(item => item.id === action.id);
      if (!target || !FRAME_FIELDS.includes(action.field) || typeof action.value !== 'string') throw new Error('Unknown frame field.');
      target[action.field] = action.value; break;
    }
    case 'add-frame':
      if (session.frames.length >= MAX_FRAMES) throw new Error('Keep at most five frames so they stay comparable.');
      if (!Object.hasOwn(LENSES, action.lens) || typeof action.id !== 'string' || !action.id || session.frames.some(item => item.id === action.id)) throw new Error('Choose a valid, new frame.');
      session.frames.push(blankFrame(action.lens, action.id)); break;
    case 'remove-frame':
      if (session.frames.length <= MIN_FRAMES) throw new Error('Keep at least three frames in play.');
      if (!session.frames.some(item => item.id === action.id)) throw new Error('Frame not found.');
      session.frames = session.frames.filter(item => item.id !== action.id);
      session.selected = session.selected.filter(id => id !== action.id);
      session.inquiry.links=session.inquiry.links.filter(l=>l.frameId!==action.id);break;
    case 'select-frame':
      if (!session.frames.some(item => item.id === action.id)) throw new Error('Frame not found.');
      session.selected = session.selected.includes(action.id) ? session.selected.filter(id => id !== action.id) : [...session.selected, action.id]; break;
    case 'edit-plan':
      if (!PLAN_FIELDS.includes(action.field) || typeof action.value !== 'string') throw new Error('Unknown plan field.');
      session.plan[action.field] = action.value; break;
    case 'build-plan': {
      const chosen = session.frames.filter(item => session.selected.includes(item.id));
      if (!chosen.length) throw new Error('Choose at least one frame to carry forward.');
      session.plan = { statement: chosen.map(item => item.statement).filter(Boolean).join('\n\n'), nextMove: chosen.map(item => item.intervention).filter(Boolean).join('\n\n'), assumption: chosen.map(item => item.assumption).filter(Boolean).join('\n\n'), test: chosen[0].test, learn: '' };
      if (Object.values(session.plan).some(value => value.length > 20000)) throw new Error('The combined draft is too long. Shorten the selected frames, or carry fewer forward.');
      session.view = 'plan'; break;
    }
    case 'view':
      if (!['questions', 'frames', 'compare', 'plan'].includes(action.value)) throw new Error('Unknown view.');
      session.view = action.value; return next;
    case 'new-session': {
      if (next.sessions.length >= 100) throw new Error('This workspace holds 100 problems. Export your work before starting a new browser workspace.');
      if (next.sessions.some(item => item.id === action.id)) throw new Error('Session already exists.');
      const added = createSession(action.example, action.id, now); next.sessions.push(added); next.activeId = added.id; return next;
    }
    case 'switch-session':
      if (!next.sessions.some(item => item.id === action.id)) throw new Error('Session not found.');
      next.activeId = action.id; return next;
    case 'import-questions': {
      if(next.sessions.length>=100)throw Error('This workspace holds 100 problems. Export before adding another.');
      if(next.sessions.some(s=>s.id===action.id))throw Error('Session already exists.');
      const added=createSession('blank',action.id,now);added.problem=action.workspace.problem;added.inquiry=normalizeInquiry({...copy(action.workspace),links:[]},added.frames);
      added.sources=[{kind:'questions',workspaceId:action.workspace.id,title:action.workspace.problem}];
      next.sessions.push(normalizeSession(added));next.activeId=added.id;return next;
    }
    case 'import-session': {
      if (next.sessions.length >= 100) throw new Error('This workspace holds 100 problems. Export your work before starting a new browser workspace.');
      const added = normalizeSession(action.session);
      if (next.sessions.some(item => item.id === action.id)) throw new Error('Session already exists.');
      const ids = new Map(added.frames.map((item, i) => [item.id, `${action.id}-f${i + 1}`]));
      const qids=new Map(added.inquiry.items.map((q,i)=>[q.id,`${action.id}-q${i+1}`]));
      added.inquiry=remapInquiry(added.inquiry,ids,action.id);
      for(const f of added.frames)if(f.origin)f.origin.sourceId=(f.origin.kind==='frame'?ids:qids).get(f.origin.sourceId)||f.origin.sourceId;
      added.id = action.id; added.frames.forEach(item => { item.id = ids.get(item.id); });
      added.selected = added.selected.map(id => ids.get(id)); added.updatedAt = now;
      next.sessions.push(added); next.activeId = added.id; return next;
    }
    default: throw new Error('Unknown action.');
  }
  session.inquiry=normalizeInquiry(session.inquiry,session.frames);
  session.updatedAt = now;
  return next;
}

function plainObject(value) { return value !== null && typeof value === 'object' && !Array.isArray(value); }
function textValue(value, label, required = false) {
  if (typeof value !== 'string' || value.length > 20000 || (required && !value.trim())) throw new Error(`${label} must be text${required ? ' and cannot be empty' : ''} (up to 20,000 characters).`);
  return value;
}
function normalizeOrigin(value){
  if(value===undefined||value===null)return null;
  if(!plainObject(value)||!['frame','question'].includes(value.kind)||!plainObject(value.snapshot))throw Error('Invalid branch source.');
  const snapshot=copy(value.snapshot);for(const [key,v]of Object.entries(snapshot)){if(v!==null&&typeof v!=='string')throw Error('Invalid source snapshot.');if(typeof v==='string')textValue(v,key);}
  return{kind:value.kind,sourceId:textValue(value.sourceId,'Branch source',true),snapshot};
}
export function normalizeSession(source) {
  if (!plainObject(source)) throw new Error('The file does not contain a session.');
  const id = textValue(source.id, 'Session id', true);
  if (!Array.isArray(source.frames) || source.frames.length < MIN_FRAMES || source.frames.length > MAX_FRAMES) throw new Error('A session needs three to five frames.');
  const frames = source.frames.map(item => {
    if (!plainObject(item) || !Object.hasOwn(LENSES, item.lens)) throw new Error('A frame has an unknown lens.');
    return { id: textValue(item.id, 'Frame id', true), lens: item.lens, origin: normalizeOrigin(item.origin), ...Object.fromEntries(FRAME_FIELDS.map(key => [key, textValue(item[key], key)])) };
  });
  if (new Set(frames.map(item => item.id)).size !== frames.length) throw new Error('Frame ids must be unique.');
  const ids = new Set(frames.map(item => item.id));
  if (!Array.isArray(source.selected) || source.selected.some(value => typeof value !== 'string' || !ids.has(value)) || new Set(source.selected).size !== source.selected.length) throw new Error('The chosen frames do not match this session.');
  if (!plainObject(source.plan)) throw new Error('The session is missing its test plan.');
  const inquiry=normalizeInquiry(source.inquiry,frames);
  const sources=source.sources===undefined?[]:copy(source.sources);
  if(!Array.isArray(sources)||sources.length>28)throw Error('Invalid source records.');
  for(const origin of sources){if(!plainObject(origin)||origin.kind!=='questions')throw Error('Invalid source record.');textValue(origin.workspaceId,'Source workspace',true);textValue(origin.title,'Source title');}
  return { inquiry,sources,id, createdAt: textValue(source.createdAt, 'Created date'), updatedAt: textValue(source.updatedAt, 'Updated date'), problem: textValue(source.problem, 'Problem'), context: textValue(source.context, 'Context'), frames, selected: [...source.selected], plan: Object.fromEntries(PLAN_FIELDS.map(key => [key, textValue(source.plan[key], key)])), view: ['questions', 'frames', 'compare', 'plan'].includes(source.view) ? source.view : 'frames' };
}
export function normalizeState(source) {
  if (!plainObject(source) || source.version !== VERSION || !Array.isArray(source.sessions) || !source.sessions.length || source.sessions.length > 100) throw new Error('This saved work has an unsupported format.');
  const sessions = source.sessions.map(normalizeSession);
  if (new Set(sessions.map(item => item.id)).size !== sessions.length || !sessions.some(item => item.id === source.activeId)) throw new Error('The saved session list is inconsistent.');
  return {version: VERSION, activeId: source.activeId, sessions};
}
export function serializeSession(session) { return JSON.stringify({kind: 'thinking-lab-reframe', version: VERSION, session: normalizeSession(session)}, null, 2); }
export function parseSession(raw) {
  if (typeof raw !== 'string' || raw.length > MAX_IMPORT_BYTES) throw new Error('Choose a Reframing JSON file smaller than 8 MB.');
  let data;
  try { data = JSON.parse(raw); } catch { throw new Error('This is not valid JSON. Choose a file exported from this workbench.'); }
  if (!plainObject(data) || data.kind !== 'thinking-lab-reframe' || data.version !== VERSION) throw new Error('Choose a JSON session exported from this workbench.');
  return normalizeSession(data.session);
}

export function frameProgress(item) { return FRAME_FIELDS.filter(key => item[key].trim()).length; }
export function sessionTitle(session) { return session.problem.trim().replace(/\s+/g, ' ') || 'Untitled problem'; }
export function markdown(session) {
  const content = value => value.trim() || '_Not yet written._';
  const field = (title, value) => `**${title}**\n\n${content(value)}\n`;
  const lines = ['# Reframing workbench', '', field('Starting problem', session.problem)];
  if (session.context.trim()) lines.push(field('Context', session.context));
  if(session.sources?.length)lines.push('Imported from: '+session.sources.map(s=>`${s.kind} / ${s.title}`).join('; '),'');
  if(session.inquiry?.items.length){lines.push('## Questions and connections','');for(const q of session.inquiry.items){lines.push(`### ${q.question||'Unwritten question'}`,`${q.type} · ${q.status}${session.inquiry.selected.includes(q.id)?' · selected':''}`,q.parent?`Branched from: ${session.inquiry.items.find(p=>p.id===q.parent)?.question||q.parent} (${q.relation})`:'Original question',field('Decision this could change',q.unlocks),field('Provisional answer',q.answer),field('Evidence',q.evidence),field('Possible approaches',q.ideas));for(const link of session.inquiry.links.filter(l=>l.questionId===q.id)){const f=session.frames.find(f=>f.id===link.frameId);lines.push(`${link.relation}: ${f?.statement||LENSES[f?.lens]?.name||link.frameId}`,'');}}}
  lines.push('## Alternative frames\n');
  for (const [index, item] of session.frames.entries()) {
    if(item.origin)lines.push(`Source ${item.origin.kind}: ${item.origin.snapshot.question||item.origin.snapshot.statement||item.origin.sourceId}`,'');
    lines.push(`### ${index + 1}. ${LENSES[item.lens].name}${session.selected.includes(item.id) ? ' · chosen' : ''}\n`, field('Problem statement', item.statement), field('Who and when', item.whoWhen), field('Assumption', item.assumption), field('Reveals', item.reveals), field('Hides', item.hides), field('Different next move', item.intervention), field('Smallest test', item.test));
  }
  lines.push('## Working frame & test\n', field('Working frame', session.plan.statement), field('Next move', session.plan.nextMove), field('Assumption to test', session.plan.assumption), field('Smallest test', session.plan.test), field('What would change my mind', session.plan.learn), '---\nWritten using Thinking Lab. Frames are hypotheses, not findings.');
  return lines.join('\n');
}
