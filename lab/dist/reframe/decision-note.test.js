import test from 'node:test';
import assert from 'node:assert/strict';
import {createSession} from './state.js';
import {decisionNote} from './decision-note.js';

test('a source selection never silently supplies the independent working interpretation or test',()=>{
  const s=createSession('forecasts');s.selected=[s.frames[0].id];
  const before=structuredClone(s),output=decisionNote(s);
  assert.match(output,/Working interpretation:\*\* Unresolved/);
  assert.match(output,/Smallest useful test:\*\* Not planned/);
  assert.ok(output.includes(s.frames[0].statement));
  assert.ok(output.includes(s.frames[0].hides));
  assert.ok(!output.includes(s.frames[0].test));
  assert.ok(!output.includes(s.frames[1].statement));
  assert.deepEqual(s,before);
});

test('the authored working plan and full selected trade-offs survive without the workspace dump',()=>{
  const s=createSession('forecasts');s.selected=[s.frames[1].id];
  s.plan={statement:'Treat the rota as a reversible commitment.',nextMove:'Ask for one voluntary shift.',assumption:'One shift will be enough.',test:'Try it on Friday.',learn:'Stop if the volunteer cannot make plans.'};
  s.frames[1].hides='A long, meaningful limit. '.repeat(120)+'Keep the final exception.';
  const output=decisionNote(s);
  for(const value of Object.values(s.plan))assert.ok(output.includes(value));
  assert.ok(output.includes(s.frames[1].hides));
  assert.ok(!output.includes(s.frames[0].statement));
});

test('an empty session labels unresolved choices and unknown assumptions',()=>{
  const output=decisionNote(createSession('blank'));
  assert.match(output,/Question not written/);
  assert.match(output,/Unresolved — no next move/);
  assert.match(output,/Unknown — no assumption/);
  assert.match(output,/Source frames:\*\* None selected/);
});
