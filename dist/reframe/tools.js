import { LENSES, FRAME_FIELDS, PLAN_FIELDS, activeSession, sessionTitle } from './state.js?v=0.6.0';

const result = value => ({content: [{type: 'text', text: typeof value === 'string' ? value : JSON.stringify(value)}]});
const failure = message => ({...result(message), isError: true});
const plainObject = value => value !== null && typeof value === 'object' && !Array.isArray(value);

// The bridge uses the same edit path as the UI; no independent or hidden state.
export function createWorkbenchTools({read, edit}) {
  return [
    {
      name: 'read_reframing_workbench',
      description: 'Read the active problem, editable frames, chosen frames, test plan, and saved session titles from Reframing Workbench.',
      inputSchema: {type: 'object', properties: {}, additionalProperties: false},
      annotations: {readOnlyHint: true},
      execute: async (input = {}) => {
        try {
          if (!plainObject(input) || Object.keys(input).length) return failure('This read tool takes an empty object.');
          const state = await read();
          return result({session: activeSession(state), sessions: state.sessions.map(item => ({id: item.id, title: sessionTitle(item)})), lenses: Object.entries(LENSES).map(([id, lens]) => ({id, name: lens.name, question: lens.question}))});
        } catch { return failure('The workbench could not be read. Try again from the page.'); }
      }
    },
    {
      name: 'edit_reframing_workbench',
      description: 'Edit a field of the current problem, a frame, or the test plan. Uses local saving and the visible Undo button. Use a frame id from read_reframing_workbench. Frame fields: statement, whoWhen, assumption, reveals, hides, intervention, test. Plan fields: statement, nextMove, assumption, test, learn. Problem fields: problem, context.',
      inputSchema: {type: 'object', properties: {target: {type: 'string', enum: ['problem', 'frame', 'plan']}, field: {type: 'string'}, value: {type: 'string', maxLength: 20000}, frameId: {type: 'string'}}, required: ['target', 'field', 'value'], additionalProperties: false},
      execute: async input => {
        try {
          if (!plainObject(input) || Object.keys(input).some(key => !['target', 'field', 'value', 'frameId'].includes(key))) return failure('Supply only target, field, value, and (for a frame) frameId.');
          const {target, field, value, frameId} = input;
          const allowed = {problem: ['problem', 'context'], frame: FRAME_FIELDS, plan: PLAN_FIELDS};
          if (!Object.hasOwn(allowed, target) || !allowed[target].includes(field)) return failure('Unknown target or field. Read the workbench to inspect available fields.');
          if (typeof value !== 'string' || value.length > 20000) return failure('Value must be text, at most 20,000 characters.');
          const state = await read();
          if (target === 'frame' && (typeof frameId !== 'string' || !activeSession(state).frames.some(item => item.id === frameId))) return failure('Frame id does not match a frame in the active problem.');
          if (target !== 'frame' && frameId !== undefined) return failure('Only frame edits accept a frameId.');
          const action = {type: `edit-${target}`, field, value, ...(target === 'frame' ? {id: frameId} : {})};
          const changed = await edit(action);
          if (!changed) return failure('The edit was not applied. Check the page for details.');
          return result(activeSession(await read()));
        } catch { return failure('The edit could not be applied. Your previous work is preserved.'); }
      }
    }
  ];
}

export function registerWorkbenchTools(context, definitions) {
  if (typeof context?.registerTool !== 'function') return;
  for (const definition of definitions) {
    try { Promise.resolve(context.registerTool(definition)).catch(() => {}); }
    catch { /* The ordinary UI is complete when this experimental API is absent or incompatible. */ }
  }
}
