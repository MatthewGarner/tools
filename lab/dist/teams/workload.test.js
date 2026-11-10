import test from 'node:test';
import assert from 'node:assert/strict';
import {SCENARIOS,DEFAULT_LAYOUT,DEFAULT_ASSUMPTIONS,TEAM_NAMES,createWorkload,simulate} from './engine.js';
import {workloadFromPreset,validateWorkload,generateWorkload,moveStage} from './workload.js';
import {ARRANGEMENTS,validateDesign,extensions,portable,validatePortable,activeWorkload} from './library.js';
import {DEFAULT_RELATIONSHIPS} from './relationships.js';
const close=(a,b)=>assert.ok(Math.abs(a-b)<1e-7,`${a} != ${b}`);
const session=()=>({layout:{...DEFAULT_LAYOUT},names:{...TEAM_NAMES},scenario:'rush',assumptions:{...DEFAULT_ASSUMPTIONS},day:10,trace:'work-01',baseline:{layout:{...DEFAULT_LAYOUT},names:{...TEAM_NAMES}},workloads:[],designs:[]});
test('opening any built-in workload for editing preserves the exact seeded jobs',()=>{
  for(const id of Object.keys(SCENARIOS))assert.deepEqual(generateWorkload(workloadFromPreset(id)),createWorkload(id));
  assert.deepEqual(extensions({}),{workloads:[],designs:[],relationships:DEFAULT_RELATIONSHIPS});
});
test('custom workloads preserve accounting and repeated serial capabilities across all arrangements',()=>{
  const config=validateWorkload({...workloadFromPreset('battery'),id:'workload-custom',count:18,span:8,flows:[{id:'review',label:'Field review',short:'Review',share:100,stages:[{capability:'field',effort:.5},{capability:'controls',effort:1.2},{capability:'field',effort:.3},{capability:'test',effort:.8}]}]});
  const original=structuredClone(config);let jobs;
  for(const p of Object.values(ARRANGEMENTS)){
    const r=simulate({scenario:config,layout:p.layout});
    if(jobs)assert.deepEqual(r.workload,jobs);else jobs=r.workload;
    for(const frame of r.history){
      assert.equal(frame.arrived,frame.completed+frame.unfinished);
      close(frame.effortUsed,frame.baseEffortUsed+frame.handoffEffortUsed);
      assert.ok(frame.effortUsed<=frame.capacityAvailable+1e-7);
      for(const j of frame.jobs){
        close(j.processingTime+j.queueTime+j.transferTime,Math.max(0,(j.completedAt??frame.day)-j.arrival));
        const source=r.workload.find(x=>x.id===j.id),future=source.stages.slice(j.stageIndex+1).reduce((n,s)=>n+s.effort,0);
        close(j.baseEffortUsed+(j.completedAt!==null?0:j.remaining-j.handoffRemaining+future),source.stages.reduce((n,s)=>n+s.effort,0));
      }
    }
  }
  assert.deepEqual(config,original);
});
test('pace, work mix and route effort are exposed inputs, and bounded samples all arrive within the horizon',()=>{
  const base=workloadFromPreset('rush'),spread=generateWorkload(base),batch=generateWorkload({...base,span:0});
  assert.ok(batch.every(j=>j.arrival===0));assert.notDeepEqual(spread.map(j=>j.arrival),batch.map(j=>j.arrival));
  assert.deepEqual(batch.map(j=>j.stages),spread.map(j=>j.stages));
  const one={...base,count:60,span:28,flows:base.flows.map((f,i)=>({...f,share:i===1?100:0}))};
  const jobs=generateWorkload(one);assert.ok(jobs.every(j=>j.type==='battery'&&j.arrival<=28));
  const doubled={...one,flows:one.flows.map(f=>({...f,stages:f.stages.map(s=>({...s,effort:s.effort*2}))}))};
  const heavier=generateWorkload(doubled);jobs.forEach((j,i)=>j.stages.forEach((s,k)=>close(heavier[i].stages[k].effort,s.effort*2)));
});
test('moving a route stage changes sequence without losing effort or mutating other flows, including incomplete drafts',()=>{
  const original=workloadFromPreset(),copy=structuredClone(original);
  const changed=moveStage(original,'feature',2,0);
  assert.deepEqual(changed.flows[0].stages.map(s=>s.capability),['software','product','design','test']);
  assert.deepEqual(changed.flows[1],original.flows[1]);assert.deepEqual(original,copy);
  assert.equal(moveStage({...original,name:''},'feature',0,1).name,'');
  assert.throws(()=>moveStage(original,'feature',0,40));
});
test('named arrangements freeze membership while shared workload changes replay them on matched jobs',()=>{
  const raw={id:'arrangement-one',title:'Candidate',layout:{...DEFAULT_LAYOUT},names:{...TEAM_NAMES}},d=validateDesign(raw);
  raw.layout.test='a';raw.names.a='Changed';assert.equal(d.layout.test,'c');assert.equal(d.names.a,'Explore');
  const lighter=simulate({layout:d.layout,scenario:'quiet'}),heavier=simulate({layout:d.layout,scenario:'rush'});
  assert.notEqual(lighter.final.completed,heavier.final.completed);assert.deepEqual(d.layout,DEFAULT_LAYOUT);
});
test('portable experiments retain multiple workloads, arrangements, baseline and trace; invalid imports are rejected',()=>{
  const s=session();s.workloads=[workloadFromPreset('battery'),workloadFromPreset('quiet')];s.scenario=s.workloads[0].id;
  s.designs=[validateDesign({id:'arrangement-one',title:'Field → test',layout:ARRANGEMENTS.battery.layout,names:ARRANGEMENTS.battery.names})];
  const result=portable(s),restored=validatePortable(JSON.parse(JSON.stringify(result)));
  // Earlier saves acquire only the explicit default maps; existing memberships,
  // workloads and the delivery engine's outputs retain their original meaning.
  assert.deepEqual(restored,{...s,relationships:DEFAULT_RELATIONSHIPS,baseline:{...s.baseline,relationships:DEFAULT_RELATIONSHIPS}});
  assert.deepEqual(simulate({layout:s.layout,scenario:activeWorkload(s)}).final,simulate({layout:restored.layout,scenario:activeWorkload(restored)}).final);
  for(const patch of [{scenario:'missing'},{day:10.1},{trace:'work-99'},{layout:{product:'a'}},{designs:[...s.designs,...s.designs]},{workloads:[{...s.workloads[0],id:'rush'}]}])assert.throws(()=>validatePortable({...result,session:{...s,...patch}}));
  assert.throws(()=>validateWorkload({...s.workloads[0],count:61}));assert.throws(()=>validateWorkload({...s.workloads[0],flows:s.workloads[0].flows.map(f=>({...f,share:0}))}));
  assert.throws(()=>validateDesign({...s.designs[0],id:'current'}));assert.deepEqual(result.session,s);
});
