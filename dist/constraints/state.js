import {validateAdaptations, applyAdaptation, remapAdaptations, adaptationsMarkdown} from './adaptations.js?v=0.13.0';
import {assertPortable} from '../shared/ancestry.js?v=0.13.0';
export const KEY = 'thinking-lab:constraints:v1';
export const TYPES = {physical: 'Physical', contract: 'Contract', organisation: 'Organisation', habit: 'Habit'};
export const LANES = {
  remove: {name: 'Remove', symbol: '−', prompt: 'Suppose this limit did not apply. What could you do?', short: 'Imagine it disappears'},
  reverse: {name: 'Reverse', symbol: '↔', prompt: 'Suppose the opposite were required. What changes?', short: 'Make the opposite true'},
  exaggerate: {name: 'Exaggerate', symbol: '×10', prompt: 'Make this limit ten times tighter. What would you invent?', short: 'Turn the limit up'}
};
export const NOTE_FIELDS = ['whatIf', 'possible', 'adaptation', 'test', 'evidence'];
export const TYPE_PROMPTS = {
  physical: 'The physical limit still holds. What smaller, feasible adaptation survives it?',
  contract: 'The agreement still applies. What could you test within it, or with explicit permission?',
  organisation: 'The current policy still applies. What could an owner authorise as a bounded trial?',
  habit: 'A habit may be changeable. What evidence would show that changing it is useful and safe?'
};
const clone = value => structuredClone(value);
export const blankNotes = () => ({...Object.fromEntries(NOTE_FIELDS.map(key => [key, ''])), restored: false});
export const newCard = (id, text = '', type = 'habit') => ({id, text, type, basis: '', lane: 'current', lastLane: 'remove', notes: Object.fromEntries(Object.keys(LANES).map(lane => [lane, blankNotes()]))});
export function createWorkspace(id = 'first', example = 'reviews') {
  const workspace = {id, problem: '', cards: [], selectedId: null, ...validateAdaptations({})};
  if (example === 'blank') {
    workspace.cards = [newCard(`${id}-c1`)]; workspace.selectedId = workspace.cards[0].id; return workspace;
  }
  if (example === 'battery') {
    workspace.problem = 'How could we make better use of a battery’s limited operating window?';
    workspace.cards = [newCard(`${id}-c1`, 'The battery has a fixed usable energy capacity.', 'physical'), newCard(`${id}-c2`, 'Part of the capacity is committed under a service contract.', 'contract'), newCard(`${id}-c3`, 'We review the operating plan once a day.', 'organisation'), newCard(`${id}-c4`, 'We judge each day mainly by captured revenue.', 'habit')];
    const card = workspace.cards[2]; card.lane = 'exaggerate'; card.lastLane = 'exaggerate';
    card.notes.exaggerate = {...blankNotes(), whatIf: 'Suppose we could review the plan only once a month.', possible: 'We would need explicit operating envelopes and clear conditions for an exception.', adaptation: 'Keep daily review, but make the limits and exception triggers visible before each shift.', test: 'Replay one historical week using written exception triggers. Ask which decisions would have been clearer.'};
    workspace.selectedId = card.id;
  } else if (example === 'reviews') {
    workspace.problem = 'How could useful product decisions happen sooner?';
    workspace.cards = [newCard(`${id}-c1`, 'Every decision needs a meeting with the full review group.', 'organisation'), newCard(`${id}-c2`, 'The review group meets once a week.', 'habit'), newCard(`${id}-c3`, 'Two specialists have only four review hours each week.', 'physical'), newCard(`${id}-c4`, 'The client must approve changes to the agreed scope.', 'contract')];
    const card = workspace.cards[0]; card.lane = 'reverse'; card.lastLane = 'reverse'; card.basis = 'The team’s current review policy; its purpose is shared accountability.';
    card.notes.reverse = {...blankNotes(), whatIf: 'Suppose decisions had to be made without gathering the whole group.', possible: 'A named owner could collect objections in writing, then decide by a deadline.', adaptation: 'Keep the group’s approval rights. Try written review for one reversible, low-impact choice.', test: 'Ask the review owner to authorise one written review this week. Compare elapsed time and unresolved objections.', evidence: 'If an important objection is missed, revise the review method before repeating it.'};
    workspace.selectedId = card.id;
  } else throw new Error('Unknown example.');
  return workspace;
}
export function initialState() { const workspace = createWorkspace(); return {version: 1, activeId: workspace.id, workspaces: [workspace]}; }
export const active = state => state.workspaces.find(workspace => workspace.id === state.activeId);
export const selected = state => active(state).cards.find(card => card.id === active(state).selectedId);
export function apply(state, action) {
  const next = clone(state), workspace = active(next);
  const card = action.id ? workspace.cards.find(item => item.id === action.id) : null;
  if (action.type.startsWith('adapt-')) {applyAdaptation(workspace, action); assertPortable(workspace,15999000); return next;}
  switch (action.type) {
    case 'problem': text(action.value); workspace.problem = action.value; break;
    case 'card':
      if (!card || !['text', 'basis', 'type'].includes(action.field)) throw new Error('Unknown constraint field.');
      if (action.field === 'type' && !Object.hasOwn(TYPES, action.value)) throw new Error('Unknown constraint type.');
      text(action.value); card[action.field] = action.value; break;
    case 'note':
      if (!card || !Object.hasOwn(LANES, action.lane) || !NOTE_FIELDS.includes(action.field)) throw new Error('Unknown experiment field.');
      text(action.value); card.notes[action.lane][action.field] = action.value; break;
    case 'select': if (!card) throw new Error('Constraint not found.'); workspace.selectedId = card.id; break;
    case 'move':
      if (!card || (action.lane !== 'current' && !Object.hasOwn(LANES, action.lane))) throw new Error('Unknown move.');
      if (action.lane === 'current') card.notes[card.lastLane].restored = card.lane !== 'current' || card.notes[card.lastLane].restored;
      else { card.lastLane = action.lane; card.notes[action.lane].restored = false; }
      card.lane = action.lane; workspace.selectedId = card.id; break;
    case 'add':
      if (workspace.cards.length >= 12) throw new Error('Keep at most 12 constraints in one playground.');
      if (typeof action.id !== 'string' || !action.id || workspace.cards.some(item => item.id === action.id)) throw new Error('A new constraint needs a unique id.');
      workspace.cards.push(newCard(action.id)); workspace.selectedId = action.id; break;
    case 'remove':
      if (!card) throw new Error('Constraint not found.');
      workspace.cards = workspace.cards.filter(item => item.id !== card.id);
      if (workspace.selectedId === card.id) workspace.selectedId = workspace.cards[0]?.id || null; break;
    case 'new':
      if (next.workspaces.length >= 100 || next.workspaces.some(item => item.id === action.id)) throw new Error('Cannot add another workspace.');
      next.workspaces.push(createWorkspace(action.id, action.example)); next.activeId = action.id; break;
    case 'switch':
      if (!next.workspaces.some(item => item.id === action.id)) throw new Error('Workspace not found.');
      next.activeId = action.id; break;
    case 'import': {
      if (next.workspaces.length >= 100 || next.workspaces.some(item => item.id === action.id)) throw new Error('Cannot add another workspace.');
      const imported = validateWorkspace(action.workspace), ids = new Map(imported.cards.map((item, index) => [item.id, `${action.id}-c${index + 1}`]));
      remapAdaptations(imported, ids, action.id);
      imported.id = action.id; imported.cards.forEach(item => {item.id = ids.get(item.id);}); imported.selectedId = imported.selectedId ? ids.get(imported.selectedId) : null;
      next.workspaces.push(imported); next.activeId = imported.id; break;
    }
    default: throw new Error('Unknown action.');
  }
  assertPortable(active(next),15999000);
  return next;
}
export function createHistory(state) { return {present: clone(state), past: [], group: null}; }
export function change(history, action, group = null) {
  const next = apply(history.present, action);
  return {present: next, past: group && group === history.group ? history.past : [...history.past, clone(history.present)].slice(-40), group};
}
export function undo(history) { return history.past.length ? {present: clone(history.past.at(-1)), past: history.past.slice(0, -1), group: null} : history; }
function object(value) { return value !== null && typeof value === 'object' && !Array.isArray(value); }
function text(value, required = false) { if (typeof value !== 'string' || value.length > 20000 || (required && !value.trim())) throw new Error('Text must be at most 20,000 characters.'); return value; }
export function validateWorkspace(value) {
  if (!object(value) || !Array.isArray(value.cards) || value.cards.length > 12) throw new Error('Invalid playground.');
  const cards = value.cards.map(card => {
    if (!object(card) || !Object.hasOwn(TYPES, card.type) || !['current', ...Object.keys(LANES)].includes(card.lane) || !Object.hasOwn(LANES, card.lastLane) || !object(card.notes)) throw new Error('Invalid constraint.');
    const notes = Object.fromEntries(Object.keys(LANES).map(lane => {
      if (!object(card.notes[lane]) || typeof card.notes[lane].restored !== 'boolean') throw new Error('Invalid experiment.');
      return [lane, {...Object.fromEntries(NOTE_FIELDS.map(key => [key, text(card.notes[lane][key])])), restored: card.notes[lane].restored}];
    }));
    return {id: text(card.id, true), text: text(card.text), type: card.type, basis: text(card.basis), lane: card.lane, lastLane: card.lastLane, notes};
  });
  if (new Set(cards.map(card => card.id)).size !== cards.length || (value.selectedId !== null && !cards.some(card => card.id === value.selectedId))) throw new Error('Constraint selection is inconsistent.');
  return {id: text(value.id, true), problem: text(value.problem), cards, selectedId: value.selectedId, ...validateAdaptations(value)};
}
export function validateState(value) {
  if (!object(value) || value.version !== 1 || !Array.isArray(value.workspaces) || !value.workspaces.length || value.workspaces.length > 100) throw new Error('Unknown saved format.');
  const workspaces = value.workspaces.map(validateWorkspace);
  if (new Set(workspaces.map(workspace => workspace.id)).size !== workspaces.length || !workspaces.some(workspace => workspace.id === value.activeId)) throw new Error('Invalid workspace list.');
  return {version: 1, activeId: value.activeId, workspaces};
}
export const serialize = workspace => JSON.stringify({kind: 'thinking-lab-constraints', version: 1, workspace: validateWorkspace(workspace)}, null, 2);
export function parse(raw) { let value; if (typeof raw !== 'string' || raw.length > 16000000) throw new Error('Choose an exported JSON file under 16 MB.'); try {value = JSON.parse(raw);} catch {throw new Error('This is not valid JSON.');} if (!object(value) || value.kind !== 'thinking-lab-constraints' || value.version !== 1) throw new Error('Choose a Constraint Playground export.'); return validateWorkspace(value.workspace); }
export function markdown(workspace) {
  const content = value => value.trim() || '_Not written._';
  const parts = ['# Constraint playground', '', content(workspace.problem), '', 'Counterfactuals are thought experiments, not permission to ignore a real constraint.', ''];
  for (const card of workspace.cards) {
    parts.push(`## ${content(card.text)}`, '', `Type: ${TYPES[card.type]}`, '', `Basis: ${content(card.basis)}`, '');
    for (const [lane, notes] of Object.entries(card.notes)) {
      if (!NOTE_FIELDS.some(key => notes[key].trim()) && lane !== card.lane) continue;
      parts.push(`### ${LANES[lane].name}${notes.restored ? ' · actual constraint restored' : ' · counterfactual'}`, '');
      for (const [key, label] of [['whatIf', 'What if'], ['possible', 'What becomes possible'], ['adaptation', 'Real-world adaptation'], ['test', 'Smallest test'], ['evidence', 'What would change my mind']]) parts.push(`**${label}**`, '', content(notes[key]), '');
    }
  }
  if (workspace.adaptations?.length) parts.push(adaptationsMarkdown(workspace));
  return parts.join('\n');
}
