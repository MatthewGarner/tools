import {test} from 'node:test';
import assert from 'node:assert/strict';
import {PHASES, canAdvance, advance, back, votePool, castVote} from '../wizard.js';
import {newEntry, serialise, deserialise} from '../register.js';

const scored = (t) => ({...newEntry(t), p: [10, 20], impact: [1, 2]});

test('phases advance forward and back across all 8', () => {
  let doc = {phase: 'FRAME', title: 'T', question: 'Q', entries: [scored('r')], people: 5};
  const seen = ['FRAME'];
  while(doc.phase !== 'REGISTER'){ doc = advance(doc); seen.push(doc.phase); }
  assert.deepEqual(seen, PHASES);
  let b = doc;
  while(b.phase !== 'FRAME') b = back(b);
  assert.equal(b.phase, 'FRAME');
  assert.equal(back({phase: 'FRAME'}).phase, 'FRAME');   // no-op
  assert.equal(advance({phase: 'REGISTER'}).phase, 'REGISTER');   // terminal
});

test('gating: FRAME needs title+question; COLLECT an entry; SCORE a scored entry', () => {
  assert.equal(canAdvance({phase: 'FRAME', title: '', question: ''}).ok, false);
  assert.ok(canAdvance({phase: 'FRAME', title: '', question: ''}).why);
  assert.equal(canAdvance({phase: 'FRAME', title: 'T', question: 'Q'}).ok, true);
  assert.equal(canAdvance({phase: 'COLLECT', entries: []}).ok, false);
  assert.equal(canAdvance({phase: 'COLLECT', entries: [newEntry('r')]}).ok, true);
  assert.equal(canAdvance({phase: 'SCORE', entries: [newEntry('r')]}).ok, false);          // unscored
  assert.equal(canAdvance({phase: 'SCORE', entries: [scored('r')]}).ok, true);
});

test('advance respects gating (blocked → same phase)', () => {
  assert.equal(advance({phase: 'FRAME', title: '', question: ''}).phase, 'FRAME');
});

test('votePool = people × 3; castVote clamps to the pool and never below 0', () => {
  let doc = {phase: 'VOTE', people: 4, entries: [{...newEntry('r'), actions: [{text: 'a', owner: '', done: false, votes: 0}]}]};
  assert.equal(votePool(doc), 12);
  const id = doc.entries[0].id;
  for(let i = 0; i < 15; i++) doc = castVote(doc, id, 0, 1);
  const total = doc.entries.reduce((s, e) => s + e.actions.reduce((t, a) => t + (a.votes || 0), 0), 0);
  assert.equal(total, 12);
  doc = castVote(doc, id, 0, -1);
  assert.equal(doc.entries[0].actions[0].votes, 11);
});

test('reload-resume: serialise round-trip keeps the phase + timer endsAt', () => {
  const doc = {v: 1, id: 'x', phase: 'WRITE', endsAt: 1234567890, title: 'T', question: 'Q', entries: []};
  const round = deserialise(serialise(doc));
  assert.equal(round.phase, 'WRITE');
  assert.equal(round.endsAt, 1234567890);
});

test('gates count risks only — a board-only doc cannot advance COLLECT or SCORE', () => {
  const boardOnly = [{...newEntry('assume'), kind: 'assumption', p: [50, 70]},
                     {...newEntry('a fact'), kind: 'fact'}];
  assert.equal(canAdvance({phase: 'COLLECT', entries: boardOnly}).ok, false);
  assert.equal(canAdvance({phase: 'SCORE', entries: boardOnly}).ok, false);
  // a real risk in the mix flips both gates
  const withRisk = [...boardOnly, {...newEntry('real risk'), p: [10, 20], impact: [1, 2]}];
  assert.equal(canAdvance({phase: 'COLLECT', entries: withRisk}).ok, true);
  assert.equal(canAdvance({phase: 'SCORE', entries: withRisk}).ok, true);
});
test('castVote pool counts risk actions only, not board items', () => {
  // a stray assumption carrying actions (only reachable via an imported doc) must not eat the pool
  let doc = {phase: 'VOTE', people: 1, entries: [
    {...newEntry('r'), actions: [{text: 'a', votes: 0}]},
    {...newEntry('x'), kind: 'assumption', actions: [{text: 'b', votes: 2}]}]};
  const id = doc.entries[0].id;
  for(let i = 0; i < 5; i++) doc = castVote(doc, id, 0, 1);   // pool = 3
  assert.equal(doc.entries[0].actions[0].votes, 3);           // capped by risk-only used count, not blocked by the assumption's 2
});
