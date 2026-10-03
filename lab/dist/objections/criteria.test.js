import test from 'node:test';
import assert from 'node:assert/strict';
import {make,validate,apply,design,markdown,parentSnapshot} from './state.js';
import {MAX_CRITERIA,assessmentFor,needsReassessment,assessmentStatus} from './criteria.js';
import {parseImport} from './import.js';
import {history,transition,undo,portable} from '../creative-kit/state.js';

const config={make,validate,apply};
const start=w=>history({version:1,activeId:w.id,workspaces:[w]});
const work=h=>h.present.workspaces.find(w=>w.id===h.present.activeId);
const edit=(w,collection,item,field,value)=>apply(w,{type:'edit',collection,item,field,value});
function prepared(){
  const w=make('comparison','blank');apply(w,{type:'add-design',id:'a',method:'first'});apply(w,{type:'add-design',id:'b',method:'different'});
  apply(w,{type:'add-criterion',id:'time'});edit(w,'criterion-rows','time','label','Can be tried within one week');edit(w,'criterion-rows','time','kind','constraint');
  w.criteria='Keep existing comparison notes';w.designs[0].assessment='Earlier prose assessment';w.decision='A provisional decision';return validate(w);
}
function record(w,designId='a',judgement='meets',reason='One owner can try it in a day.'){
  edit(w,'criterion-assessments',`${designId}:time`,'judgement',judgement);edit(w,'criterion-assessments',`${designId}:time`,'reason',reason);
  apply(w,{type:'record-assessment',id:designId,criterionId:'time'});return assessmentFor(w.designs.find(d=>d.id===designId),'time');
}

test('previous schema-2 exports retain free-text criteria and assessments without inventing structured judgements',()=>{
  const old=prepared();delete old.criteriaRows;old.designs.forEach(d=>delete d.assessments);const bytes=JSON.stringify(old);
  const restored=parseImport(JSON.stringify({kind:'objections',version:1,workspace:old}));
  assert.deepEqual(restored.criteriaRows,[]);assert.ok(restored.designs.every(d=>d.assessments.length===0));
  assert.equal(restored.criteria,old.criteria);assert.equal(restored.designs[0].assessment,old.designs[0].assessment);assert.equal(JSON.stringify(old),bytes);
});

test('unknowns stay explicit; recording a judgement needs a reason and never chooses an alternative',()=>{
  const w=prepared(),row=w.criteriaRows[0];assert.equal(assessmentFor(w.designs[0],'time'),null);assert.equal(assessmentStatus(row,null),'Not yet recorded');
  let h=start(w);h=transition(h,{type:'edit',collection:'criterion-assessments',item:'a:time',field:'judgement',value:'meets'},config);
  const before=structuredClone(h.present);assert.throws(()=>transition(h,{type:'record-assessment',id:'a',criterionId:'time'},config),/reason/);assert.deepEqual(h.present,before);
  const a=record(w);assert.equal(a.judgement,'meets');assert.equal(needsReassessment(row,a),false);assert.equal(assessmentStatus(row,a),'Recorded judgement');
  const b=record(w,'b','unknown','');assert.equal(b.judgement,'unknown');assert.equal(assessmentStatus(row,b),'Recorded judgement');
  assert.equal(w.selected,null);assert.equal(w.decision,'A provisional decision');assert.equal(w.criteria,'Keep existing comparison notes');assert.equal(w.designs[0].assessment,'Earlier prose assessment');
});

test('criterion wording and type changes preserve earlier judgements but require explicit reassessment',()=>{
  const w=prepared(),a=record(w),original=structuredClone(a.reviewed),row=w.criteriaRows[0];
  edit(w,'criterion-rows','time','label','Can be tried within one morning');assert.equal(needsReassessment(row,a),true);assert.deepEqual(a.reviewed,original);assert.equal(a.judgement,'meets');assert.equal(a.reason,'One owner can try it in a day.');
  apply(w,{type:'review',id:'a'});assert.equal(needsReassessment(row,a),true,'reviewing borrowed context cannot clear criterion reassessment');
  edit(w,'criterion-rows','time','label',original.label);assert.equal(needsReassessment(row,a),true,'returning the wording does not silently confirm an edited assessment');
  apply(w,{type:'record-assessment',id:'a',criterionId:'time'});assert.equal(needsReassessment(row,a),false);
  edit(w,'criterion-rows','time','kind','preference');assert.equal(needsReassessment(row,a),true);assert.equal(a.reviewed.kind,'constraint');
  apply(w,{type:'record-assessment',id:'a',criterionId:'time'});assert.equal(a.reviewed.kind,'preference');assert.equal(needsReassessment(row,a),false);
});

test('imported changed wording cannot hide a stale judgement behind a false review flag',()=>{
  const w=prepared();record(w);w.criteriaRows[0].label='A different condition';
  const restored=parseImport(portable(w,'objections',validate)),a=assessmentFor(restored.designs[0],'time');assert.equal(a.needsReview,false);assert.equal(needsReassessment(restored.criteriaRows[0],a),true);
  assert.match(markdown(restored),/Reassessment needed/);assert.match(markdown(restored),/Last reviewed: Can be tried within one week/);
});

test('changing the alternative or assessment writing requests reassessment, but renaming does not',()=>{
  const w=prepared(),a=record(w),row=w.criteriaRows[0];edit(w,'designs','a','title','A clearer name');assert.equal(needsReassessment(row,a),false);
  edit(w,'designs','a','mechanism','A different implementation');assert.equal(needsReassessment(row,a),true);assert.equal(a.judgement,'meets');
  apply(w,{type:'record-assessment',id:'a',criterionId:'time'});edit(w,'criterion-assessments','a:time','reason','A revised explanation');assert.equal(needsReassessment(row,a),true);assert.equal(a.reviewed.label,row.label);
});

test('branches preserve assessments and frozen criteria, while combinations start unknown with both parent records',()=>{
  const w=prepared();record(w);record(w,'b','misses','Needs a two-week setup.');
  apply(w,{type:'branch',id:'child',parent:'a'});validate(w);const child=w.designs.find(d=>d.id==='child'),source=structuredClone(child.ancestry),original=structuredClone(child.origin.snapshot);
  assert.equal(assessmentFor(child,'time').judgement,'meets');assert.equal(needsReassessment(w.criteriaRows[0],assessmentFor(child,'time')),true);
  assert.ok(source.parents[0].fields.some(f=>f.text==='Can be tried within one week'));assert.ok(source.parents[0].fields.some(f=>f.text==='One owner can try it in a day.'));
  apply(w,{type:'combine',id:'combined',parents:['a','b']});const combined=w.designs.find(d=>d.id==='combined');assert.deepEqual(combined.assessments,[]);assert.equal(combined.ancestry.parents.length,2);
  assert.ok(combined.ancestry.parents[1].fields.some(f=>f.text==='Needs a two-week setup.'));
  edit(w,'criterion-rows','time','label','A new criterion');edit(w,'criterion-assessments','a:time','reason','Parent reasoning changed');
  assert.deepEqual(child.ancestry,source);assert.deepEqual(child.origin.snapshot,original);
  assert.deepEqual(parseImport(portable(w,'objections',validate)),w);assert.match(markdown(w),/A new criterion/);assert.match(markdown(w),/One owner can try it in a day/);
});

test('retiring preserves assessments and exports; undo restores visibility and only unused criteria can be removed',()=>{
  const w=prepared();record(w);let h=start(w);const before=structuredClone(h.present);
  assert.throws(()=>transition(h,{type:'remove-criterion',id:'time'},config),/Retire/);assert.deepEqual(h.present,before);
  h=transition(h,{type:'retire-criterion',id:'time'},config);assert.equal(work(h).criteriaRows[0].active,false);assert.equal(work(h).designs[0].assessments[0].reason,w.designs[0].assessments[0].reason);assert.match(markdown(work(h)),/Hard constraint · retired/);
  assert.deepEqual(undo(h).present,before);h=transition(h,{type:'retire-criterion',id:'time'},config);assert.equal(work(h).criteriaRows[0].active,true);
  h=transition(h,{type:'add-criterion',id:'unused'},config);h=transition(h,{type:'remove-criterion',id:'unused'},config);assert.equal(work(h).criteriaRows.length,1);
});

test('criterion typing and assessment typing use grouped Undo without losing the previous recorded basis',()=>{
  const w=prepared();record(w);let h=start(w);const before=structuredClone(h.present);
  for(const value of ['C','Changed criterion'])h=transition(h,{type:'edit',collection:'criterion-rows',item:'time',field:'label',value},config,'criterion-label');
  assert.equal(h.past.length,1);assert.deepEqual(undo(h).present,before);
  h=transition(h,{type:'edit',collection:'criterion-assessments',item:'a:time',field:'reason',value:'A revised reason'},config,'criterion-reason');
  const prior=structuredClone(h.present);h=transition(h,{type:'record-assessment',id:'a',criterionId:'time'},config);assert.deepEqual(undo(h).present,prior);assert.equal(work(h).designs[0].assessments[0].reviewed.label,'Changed criterion');
});

test('malformed criteria and assessment imports fail before replacing saved work',()=>{
  const w=prepared();record(w);const bytes=portable(w,'objections',validate),h=start(w),before=structuredClone(h.present);
  const mutations=[
    w=>w.criteriaRows=null,
    w=>w.criteriaRows.push(structuredClone(w.criteriaRows[0])),
    w=>w.criteriaRows[0].kind='score',
    w=>w.criteriaRows[0].active='false',
    w=>w.designs[0].assessments=null,
    w=>w.designs[0].assessments.push(structuredClone(w.designs[0].assessments[0])),
    w=>w.designs[0].assessments[0].criterionId='missing',
    w=>w.designs[0].assessments[0].judgement='winner',
    w=>w.designs[0].assessments[0].reviewed={label:'old',kind:'score'},
    w=>w.designs[0].assessments[0].needsReview='false',
    w=>w.designs[0].assessments[0].reason='',
  ];
  for(const mutate of mutations){const broken=JSON.parse(bytes).workspace;mutate(broken);assert.throws(()=>parseImport(JSON.stringify({kind:'objections',version:1,workspace:broken})));assert.throws(()=>transition(h,{type:'import',id:'bad',workspace:broken},config));assert.deepEqual(h.present,before);}
});

test('a full source snapshot keeps all criterion wording and reasons within the shared flat ancestry limit',()=>{
  const w=prepared();for(let i=1;i<MAX_CRITERIA;i++)apply(w,{type:'add-criterion',id:'c'+i});
  const long='Long criterion '.repeat(1300),reason='Reason 💡 '.repeat(1800);
  for(const row of w.criteriaRows){edit(w,'criterion-rows',row.id,'label',long);edit(w,'criterion-assessments',`a:${row.id}`,'reason',reason);apply(w,{type:'record-assessment',id:'a',criterionId:row.id});}
  for(let i=w.designs.length;i<32;i++)w.designs.push(design('d'+i,'first'));
  w.concerns=Array.from({length:12},(_,i)=>({id:'concern'+i,objection:'Objection',concern:'Concern',evidence:'Evidence'}));
  const source=w.designs[0];source.concerns=w.concerns.map(c=>c.id);source.protects=['a','b'];source.borrowed=w.designs.slice(1).map(d=>({from:d.id,title:d.title,text:'Borrowed benefit',stale:false}));validate(w);
  const snapshot=parentSnapshot(w,source);assert.ok(snapshot.fields.length<=160);assert.equal(snapshot.fields.filter(f=>f.text===long).length,MAX_CRITERIA*2);assert.equal(snapshot.fields.filter(f=>f.text===reason).length,MAX_CRITERIA);
  assert.throws(()=>transition(start(w),{type:'add-criterion',id:'overflow'},config),/at most 12/);assert.deepEqual(parseImport(portable(w,'objections',validate)),w);
});
