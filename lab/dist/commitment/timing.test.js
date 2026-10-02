import test from 'node:test';
import assert from 'node:assert/strict';
import {DEFAULT_ASSUMPTIONS,SCENARIOS,policyAt,simulate} from './engine.js';
import {createStudy,validateStudy,interventionEvents,compareTiming,metricValue,timingMarkdown} from './timing.js';

const close=(a,b)=>assert.ok(Math.abs(a-b)<1e-8,`${a} != ${b}`);
test('timing changes only the selected lever and retains other future policy changes',()=>{
  const events=[{week:4,policy:{commitment:90,quality:35,recovery:6}},{week:12,policy:{commitment:80,quality:70,recovery:15}},{week:22,policy:{commitment:95,quality:50,recovery:10}}];
  const before=structuredClone(events),changed=interventionEvents(SCENARIOS.rush,events,'commitment',65,9);
  for(let week=1;week<=36;week++){
    const base=policyAt(SCENARIOS.rush,events,week),branch=policyAt(SCENARIOS.rush,changed,week);
    assert.equal(branch.commitment,week<9?base.commitment:65);
    assert.equal(branch.quality,base.quality);assert.equal(branch.recovery,base.recovery);
  }
  const a=simulate(SCENARIOS.rush,events),b=simulate(SCENARIOS.rush,changed);
  assert.deepEqual(a.history.slice(0,8),b.history.slice(0,8));
  assert.deepEqual(a.history.map(r=>r.demand),b.history.map(r=>r.demand));assert.deepEqual(events,before);
});
test('matched timing comparisons share history, remain independent, and equal starts produce equal outcomes',()=>{
  const study=createStudy(6),before=structuredClone(study),courses=compareTiming(SCENARIOS.rush,study,DEFAULT_ASSUMPTIONS);
  assert.equal(courses.length,3);assert.deepEqual(study,before);
  for(const c of courses)assert.deepEqual(c.state.history.slice(0,6),courses[0].state.history.slice(0,6));
  assert.notEqual(courses[1].state.history.at(-1).outstanding,courses[2].state.history.at(-1).outstanding);
  const equal=compareTiming(SCENARIOS.rush,{...study,b:study.a},DEFAULT_ASSUMPTIONS);assert.deepEqual(equal[1].state,equal[2].state);
  const noChange=compareTiming(SCENARIOS.rush,{...study,value:95},DEFAULT_ASSUMPTIONS);assert.deepEqual(noChange[0].state,noChange[1].state);assert.deepEqual(noChange[0].state,noChange[2].state);
  courses[1].events[0].policy.quality=0;assert.equal(courses[2].events[0].policy.quality,25);
});
test('the mechanism trace uses actual pressure and next-week capacity rather than current-week labels',()=>{
  const a={...DEFAULT_ASSUMPTIONS,repairCost:2.8},s=simulate(SCENARIOS.squeeze,[],36,a);
  for(let i=0;i<s.history.length;i++){
    const r=s.history[i],prev=s.history[i-1];
    const knownBefore=(prev?.known||0)+r.returned;
    close(r.pressure,(r.openAtStart+knownBefore*a.repairCost)/Math.max(1,r.capacity-r.reporting-r.recovery));
    close(r.capacity,12*(1-a.fatigueCapacityLoss*r.fatigueBefore));
    if(i<35)close(metricValue(r,'capacity',a),s.history[i+1].capacity);
    if(i>=2)close(r.returned,s.history[i-2].defects);
  }
});
test('challenging the fatigue link removes its capacity effect in every timing course without deleting fatigue',()=>{
  const study={...createStudy(),lever:'recovery',value:25,metric:'capacity'},a={...DEFAULT_ASSUMPTIONS,fatigueCapacityLoss:0};
  const courses=compareTiming(SCENARIOS.rush,study,a);
  for(const c of courses)for(const r of c.state.history)assert.equal(metricValue(r,'capacity',a),12);
  assert.ok(courses.some(c=>c.state.fatigue>0));
  assert.notEqual(courses[1].state.history.at(-1).usable,courses[2].state.history.at(-1).usable);
});
test('lower promise rates have an exposed opportunity cost, including under gentle demand',()=>{
  const courses=compareTiming(SCENARIOS.runway,{...createStudy(),value:60},DEFAULT_ASSUMPTIONS);
  const [reference,a]=courses.map(c=>c.state.history.at(-1));
  assert.ok(a.usable<reference.usable);assert.ok(a.cumulativeDeclined>reference.cumulativeDeclined);
});
test('portable timing settings retain frozen policies and export enough context to reproduce the comparison',()=>{
  const events=[{week:15,policy:{commitment:85,quality:90,recovery:15}}],study=createStudy(6,events);
  events[0].policy.quality=0;
  assert.equal(study.baseEvents[0].policy.quality,90);
  const restored=validateStudy(JSON.parse(JSON.stringify(study)));assert.deepEqual(restored,study);
  const out=timingMarkdown(SCENARIOS.rush,study,compareTiming(SCENARIOS.rush,study,DEFAULT_ASSUMPTIONS),DEFAULT_ASSUMPTIONS);
  assert.match(out,/week 7 in A and week 16 in B/);assert.match(out,/Week 15/);assert.match(out,/90/);assert.match(out,/Declined points/);
  for(const patch of [{a:6},{b:37},{value:101},{inspect:0},{metric:'invented'},{baseEvents:[{week:2,policy:{commitment:70}}]}])assert.throws(()=>validateStudy({...study,...patch}));
  assert.deepEqual(validateStudy(study),restored);
});
