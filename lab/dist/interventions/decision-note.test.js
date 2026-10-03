import test from 'node:test';
import assert from 'node:assert/strict';
import {create,reduce} from './state.js';
import {decisionNote} from './decision-note.js';

function start(){
  let w=create(),id=w.options[0].id;
  for(const [field,value] of Object.entries({expected:'Clarifications finish before the slot.',competing:'The queue may simply have fewer requests.',observe:'Compare similar requests from the same week.',test:'Try readiness prompts for one week.'}))w=reduce(w,{type:'option',id,field,value});
  w=reduce(w,{type:'choose',id});
  return reduce(w,{type:'start-attempt',id,newId:'attempt-one',startedOn:'2026-10-01'});
}

test('a historical result keeps its original expectation and causal context after source edits and removal',()=>{
  let w=start();const original=structuredClone(w.attempts[0].source),id=original.id;
  w=reduce(w,{type:'review-attempt',id:'attempt-one',reviewedOn:'2026-10-02',observations:'Two slots finished without clarification.',interpretation:'This is consistent with the hypothesis; volume also fell.',decision:'revise',reason:'Match request volume before comparing.',nextCheck:'Review five similar requests next Friday.'});
  w=reduce(w,{type:'option',id,field:'expected',value:'A new expectation after the result.'});
  w=reduce(w,{type:'remove-option',id});
  w=reduce(w,{type:'problem',value:'A new current question.'});
  const before=structuredClone(w),output=decisionNote(w);
  assert.match(output,/Intervention removed · original preserved/);
  assert.match(output,/Question when this test started/);
  assert.match(output,/Expected observations:\*\* Clarifications finish before the slot/);
  assert.match(output,/Actual observations:\*\* Two slots finished without clarification/);
  assert.match(output,/Authored interpretation:\*\* This is consistent with the hypothesis; volume also fell/);
  assert.match(output,/Decision after this test:\*\* Revise/);
  assert.match(output,/Next check:\*\* Review five similar requests next Friday/);
  assert.ok(output.includes(original.fields.find(f=>f.label==='Relationship · alternative').text));
  assert.ok(!output.includes('A new expectation after the result.'));
  assert.deepEqual(w,before);
});

test('latest test uses start date with later recorded ties and does not carry results from an older attempt',()=>{
  let w=start(),id=w.chosenId;
  w=reduce(w,{type:'option',id,field:'expected',value:'Newest expected observation.'});
  w=reduce(w,{type:'start-attempt',id,newId:'newer',startedOn:'2026-10-03'});
  w=reduce(w,{type:'option',id,field:'expected',value:'Backdated expectation.'});
  w=reduce(w,{type:'start-attempt',id,newId:'backdated',startedOn:'2026-09-30'});
  let output=decisionNote(w);
  assert.match(output,/Latest test started · 2026-10-03/);
  assert.ok(output.includes('Newest expected observation.'));assert.ok(!output.includes('Backdated expectation.'));
  assert.match(output,/Awaiting a result review/);assert.match(output,/Unknown — no result recorded/);
  w=reduce(w,{type:'start-attempt',id,newId:'tie',startedOn:'2026-10-03'});
  output=decisionNote(w);assert.ok(output.includes('Backdated expectation.'));
});

test('viewing an intervention is not choosing it or starting a test',()=>{
  const w=create(),output=decisionNote(w);
  assert.ok(w.selectedId);assert.match(output,/Unresolved — no intervention chosen/);
  assert.match(output,/No dated test started/);
  assert.ok(!output.includes(w.options[1].why));
});

test('a chosen plan reports unknowns and context review without manufacturing a result',()=>{
  let w=create(),id=w.options[0].id;
  w=reduce(w,{type:'choose',id});
  w=reduce(w,{type:'option',id,field:'why',value:'A long rationale. '.repeat(100)+'Keep the final condition.'});
  const output=decisionNote(w);
  assert.match(output,/Context:\*\* Changed; review needed/);
  assert.match(output,/Expected observations:\*\* Unknown — no expectation recorded/);
  assert.ok(output.includes(w.options[0].why));
  assert.ok(!output.includes('Actual observations:'));
});
