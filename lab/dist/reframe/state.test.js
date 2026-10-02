import test from 'node:test';
import assert from 'node:assert/strict';
import { activeSession, initialState, createSession, transition, normalizeState, parseSession, serializeSession, markdown, frameProgress } from './state.js';

test('editing and changing problems preserves the previous work through persistence', () => {
  const original = initialState();
  let state = transition(original, {type: 'edit-problem', field: 'problem', value: 'Why do handoffs keep failing?'}, '2026-10-01T10:00:00Z');
  const firstId = state.activeId;
  state = transition(state, {type: 'edit-frame', id: activeSession(state).frames[0].id, field: 'statement', value: 'Owners are unclear at the handoff.'});
  const editedSession = structuredClone(activeSession(state));
  state = transition(state, {type: 'new-session', example: 'bess', id: 'second'});
  state = normalizeState(JSON.parse(JSON.stringify(state)));
  assert.equal(state.sessions.length, 2);
  assert.deepEqual(state.sessions[0], editedSession);
  assert.equal(activeSession(state).problem, 'Our battery should capture more value.');
  state = transition(state, {type: 'switch-session', id: firstId});
  assert.deepEqual(activeSession(state), editedSession);
  assert.equal(activeSession(original).problem, 'We need better forecasts.');
});

test('a working draft copies chosen user writing and remains independent of its source', () => {
  let state = initialState();
  const [one, two] = activeSession(state).frames;
  state = transition(state, {type: 'select-frame', id: two.id});
  state = transition(state, {type: 'select-frame', id: one.id});
  state = transition(state, {type: 'build-plan'});
  const draft = activeSession(state).plan;
  assert.equal(draft.statement, `${one.statement}\n\n${two.statement}`);
  assert.equal(draft.nextMove, `${one.intervention}\n\n${two.intervention}`);
  assert.equal(draft.test, one.test, 'the first displayed chosen frame supplies a single starting test');
  assert.equal(activeSession(state).view, 'plan');
  state = transition(state, {type: 'edit-frame', id: one.id, field: 'statement', value: 'A revised source'});
  state = transition(state, {type: 'edit-plan', field: 'learn', value: 'If the rule does not change a decision, revisit the constraint.'});
  assert.equal(activeSession(state).plan.statement, draft.statement);
  assert.equal(activeSession(state).frames[0].statement, 'A revised source');
  assert.throws(() => transition(initialState(), {type: 'build-plan'}), /Choose at least one/);
});

test('export and re-import preserve multiline, Unicode, blank fields and selected frame identity', () => {
  let state = initialState();
  const frameId = activeSession(state).frames[2].id;
  state = transition(state, {type: 'edit-frame', id: frameId, field: 'statement', value: 'First line\n\n第二行 <script>alert(1)</script> & “quotes”'});
  state = transition(state, {type: 'edit-frame', id: frameId, field: 'hides', value: ''});
  state = transition(state, {type: 'select-frame', id: frameId});
  const before = structuredClone(activeSession(state));
  const imported = parseSession(serializeSession(before));
  assert.deepEqual(imported, before);
  state = transition(state, {type: 'import-session', session: imported, id: 'imported'});
  assert.equal(state.sessions.length, 2);
  assert.deepEqual(state.sessions[0], before);
  assert.equal(activeSession(state).frames[2].id, 'imported-f3');
  assert.deepEqual(activeSession(state).selected, ['imported-f3']);
  assert.equal(activeSession(state).frames[2].statement, before.frames[2].statement);
  assert.equal(activeSession(state).frames[2].hides, '');
  assert.deepEqual(normalizeState(JSON.parse(JSON.stringify(state))), state);
});

test('frame removal cannot leave orphaned selections, and limits preserve a comparable workspace', () => {
  let state = initialState();
  assert.throws(() => transition(state, {type: 'remove-frame', id: activeSession(state).frames[0].id}), /at least three/);
  state = transition(state, {type: 'add-frame', lens: 'time', id: 'extra'});
  state = transition(state, {type: 'select-frame', id: 'extra'});
  assert.deepEqual(activeSession(state).selected, ['extra']);
  state = transition(state, {type: 'remove-frame', id: 'extra'});
  assert.deepEqual(activeSession(state).selected, []);
  state = transition(state, {type: 'add-frame', lens: 'time', id: 'extra'});
  state = transition(state, {type: 'add-frame', lens: 'incentives', id: 'fifth'});
  assert.throws(() => transition(state, {type: 'add-frame', lens: 'value', id: 'sixth'}), /at most five/);
  assert.equal(activeSession(state).frames.length, 5);
  assert.equal(frameProgress(activeSession(state).frames[4]), 0);
});

test('invalid imported content is rejected before a session can be replaced', () => {
  const wrapper = JSON.parse(serializeSession(activeSession(initialState())));
  const invalid = [
    value => { value.session.frames[0].lens = '__proto__'; },
    value => { value.session.frames[0].id = value.session.frames[1].id; },
    value => { value.session.selected = ['does-not-exist']; },
    value => { value.session.frames[0].statement = null; },
    value => { value.session.plan.statement = 'x'.repeat(20001); },
    value => { value.version = 99; },
    value => { value.session.frames.pop(); },
  ];
  for (const mutate of invalid) { const value = structuredClone(wrapper); mutate(value); assert.throws(() => parseSession(JSON.stringify(value))); }
  assert.throws(() => parseSession('{'), /not valid JSON/);
  assert.throws(() => parseSession('null'), /exported from this workbench/);
  assert.throws(() => normalizeState({...initialState(), activeId: 'missing'}), /inconsistent/);
  assert.throws(() => transition(initialState(), {type: 'add-frame', lens: '__proto__', id: 'invalid'}), /valid, new frame/);
});

test('combining maximum-length frames fails safely instead of saving an unimportable draft', () => {
  let state = initialState();
  for (const item of activeSession(state).frames) {
    state = transition(state, {type: 'edit-frame', id: item.id, field: 'statement', value: 'long '.repeat(4000)});
    state = transition(state, {type: 'select-frame', id: item.id});
  }
  const before = structuredClone(state);
  assert.throws(() => transition(state, {type: 'build-plan'}), /combined draft is too long/);
  assert.deepEqual(state, before);
  assert.deepEqual(parseSession(serializeSession(activeSession(state))), activeSession(state));
});

test('Markdown includes all reasoning, unchosen alternatives, selection, and an editable test', () => {
  let state = initialState();
  const first = activeSession(state).frames[0];
  state = transition(state, {type: 'select-frame', id: first.id});
  state = transition(state, {type: 'build-plan'});
  state = transition(state, {type: 'edit-plan', field: 'learn', value: 'If it changes no choices, stop.'});
  const text = markdown(activeSession(state));
  assert.ok(text.includes('### 1. Decision · chosen'));
  assert.ok(text.includes('### 2. Constraint\n'));
  assert.ok(text.includes(activeSession(state).frames[2].hides));
  assert.ok(text.includes('If it changes no choices, stop.'));
  assert.ok(text.includes(first.test));
  const blank = createSession();
  assert.ok(markdown(blank).includes('_Not yet written._'));
});
