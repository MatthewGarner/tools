import test from 'node:test';
import assert from 'node:assert/strict';
import {make,apply} from './state.js';
import {decisionNote} from './decision-note.js';

const edit=(w,collection,item,field,value)=>apply(w,{type:'edit',collection,item,field,value});
function chosen(){const w=make();apply(w,{type:'select',id:'d1'});return w;}

test('the note never chooses an alternative from the comparison alone',()=>{
  const w=make(),output=decisionNote(w);
  assert.match(output,/Unresolved — no alternative selected/);
  assert.match(output,/Hard constraint · Fits a five-minute rehearsal:\*\* Unknown · Not yet recorded/);
  assert.ok(!output.includes(w.designs[0].mechanism));
});

test('the selected alternative keeps rationale, costs and a separate unadopted test',()=>{
  const w=chosen();w.decision='Test voluntary uptake before requiring practice.';
  w.designs[0].cost='Attention is scarce. '.repeat(90)+'Do not omit this consequence.';
  apply(w,{type:'add-design',id:'other',method:'different'});
  edit(w,'designs','other','mechanism','Unselected mechanism that must stay out of the note.');
  const output=decisionNote(w);
  assert.ok(output.includes(w.decision));assert.ok(output.includes(w.designs[0].cost));
  assert.match(output,/Smallest useful test in the working plan:\*\* Not planned/);
  assert.ok(output.includes(w.designs[0].test));
  assert.match(output,/separate test draft/);
  assert.ok(!output.includes(w.designs[1].mechanism));
});

test('changed criteria preserve earlier judgments and reasons but explicitly request reassessment',()=>{
  const w=chosen();
  edit(w,'criterion-assessments','d1:time','judgement','meets');
  edit(w,'criterion-assessments','d1:time','reason','The rehearsed task took four minutes.');
  apply(w,{type:'record-assessment',id:'d1',criterionId:'time'});
  edit(w,'criterion-rows','time','label','Fits a two-minute rehearsal');
  w.designs[0].stale=true;w.designs[0].ancestry.parked=true;
  const before=structuredClone(w),output=decisionNote(w);
  assert.match(output,/Fits a two-minute rehearsal:\*\* Meets · Reassessment needed/);
  assert.match(output,/Previously reviewed criterion:\*\* Fits a five-minute rehearsal · Hard constraint/);
  assert.match(output,/The rehearsed task took four minutes/);
  assert.match(output,/Context or connections changed; review needed/);
  assert.match(output,/selected alternative is parked/);
  assert.deepEqual(w,before);
});

test('retired criteria and unrecorded judgments are not presented as current recorded assessments',()=>{
  const w=chosen();apply(w,{type:'retire-criterion',id:'understanding'});
  edit(w,'criterion-assessments','d1:time','judgement','meets');
  const output=decisionNote(w);
  assert.match(output,/Meets · Not yet recorded/);
  assert.match(output,/Unknown — no reason recorded/);
  assert.ok(!output.includes('Helps someone name the model’s limits'));
});
