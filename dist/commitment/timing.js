import {BASE_CAPACITY,HORIZON,normalizePolicy,policyAt,schedulePolicy,simulate} from './engine.js?v=0.11.0';

export const LEVERS=Object.freeze({
  commitment:{label:'Promise rate',min:40,max:100,step:5,value:70,description:'Accept this share of incoming demand. Declined work never becomes output.',chain:['accepted','pressure','shortcuts','repairEffort']},
  quality:{label:'Protect quality',min:0,max:100,step:5,value:85,description:'Resist pressure-driven shortcuts. More effort per delivery can reduce immediate throughput.',chain:['shortcuts','defects','returned','repairEffort']},
  recovery:{label:'Reserve recovery',min:0,max:25,step:1,value:18,description:'Protect a share of capacity and limit overtime. Both reduce work possible now.',chain:['recovery','overtime','fatigue','capacity']},
});
export const MECHANISMS=Object.freeze({
  accepted:{label:'New promises',unit:'points / week',text:'Demand × promise rate. Reducing new promises does not cancel the backlog; increasing them need not create delivery capacity.'},
  pressure:{label:'Delivery pressure',unit:'work / normal effort',text:'Open promises plus returned repair work, divided by normal effort after reporting and recovery. Pressure above 1 can add overtime and shortcuts.'},
  shortcuts:{label:'Shortcuts',unit:'effort avoided per delivery (%)',scale:38,text:'Pressure above 1 increases shortcuts, moderated by quality protection. Shortcuts reduce effort per delivery and increase defect rate. No pressure means no shortcut benefit to remove.'},
  defects:{label:'New defects',unit:'defective points / week',text:'Reported delivery × defect rate. The rate combines ordinary defects, shortcuts and fatigue. Quality protection does not eliminate all defects.'},
  returned:{label:'Defects return',unit:'points / week',text:'Exactly the defects created two weeks earlier become visible now. Better quality cannot erase defects already in transit.'},
  repairEffort:{label:'Repair effort',unit:'effort points / week',text:'Returned defects get first claim on available effort. Each repaired point costs the shared repair-cost assumption. More required repairs can displace new delivery, but actual repair effort is capacity-limited.'},
  recovery:{label:'Protected recovery',unit:'effort points / week',text:'Capacity × recovery percentage. This time cannot deliver or repair work this week. Protected recovery and idle time help fatigue fall.'},
  overtime:{label:'Overtime',unit:'effort points / week',text:'Unmet effort need can add up to 3 overtime points, scaled down by recovery protection. At 25% recovery, overtime is off. Overtime also adds fatigue.'},
  fatigue:{label:'Ending fatigue',unit:'illustrative index / 100',scale:100,text:'Utilisation, overtime and overdue promises add fatigue; recovery and idle effort reduce it. The combined effect can reverse the apparent benefit of protecting more recovery.'},
  capacity:{label:'Next week’s capacity',unit:'effort points / week',text:'Twelve nominal points, reduced by this week’s ending fatigue and the shared fatigue assumption. At zero fatigue effect this link disappears; recovery still uses time.'},
  usable:{label:'Usable output',unit:'cumulative points',text:'Reported delivery minus all outstanding defects, including hidden ones. Compare declined demand alongside output; the model does not assign that demand a strategic or financial value.'},
});

function validateEvents(events){
  if(!Array.isArray(events)||events.length>HORIZON)throw Error('Invalid reference policies.');
  if(events.some(e=>!e||!Number.isInteger(e.week)||e.week<1||e.week>HORIZON||!e.policy||Object.keys(LEVERS).some(k=>!Number.isFinite(e.policy[k])||e.policy[k]<LEVERS[k].min||e.policy[k]>LEVERS[k].max)))throw Error('Invalid reference policy.');
  return events.reduce((out,e)=>schedulePolicy(out,e.week,e.policy),[]);
}
export function validateStudy(raw){
  if(!raw||!Number.isInteger(raw.anchor)||raw.anchor<0||raw.anchor>=HORIZON||!Object.hasOwn(LEVERS,raw.lever))throw Error('Invalid timing study.');
  const lever=LEVERS[raw.lever];
  if(!Number.isFinite(raw.value)||raw.value<lever.min||raw.value>lever.max)throw Error('Intervention is outside the lever range.');
  if(![raw.a,raw.b].every(w=>Number.isInteger(w)&&w>raw.anchor&&w<=HORIZON))throw Error('Both starts must follow the shared history.');
  if(!Number.isInteger(raw.inspect)||raw.inspect<1||raw.inspect>HORIZON||!Object.hasOwn(MECHANISMS,raw.metric))throw Error('Invalid inspection week or measure.');
  return {anchor:raw.anchor,baseEvents:validateEvents(raw.baseEvents),lever:raw.lever,value:raw.value,a:raw.a,b:raw.b,inspect:raw.inspect,metric:raw.metric};
}
export function createStudy(week=6,events=[]){
  const anchor=Math.max(0,Math.min(HORIZON-1,week));
  return validateStudy({anchor,baseEvents:events,lever:'commitment',value:70,a:anchor+1,b:Math.min(HORIZON,anchor+10),inspect:Math.min(HORIZON,anchor+3),metric:'usable'});
}
// Override only one lever, including in already scheduled policies. Other levers
// keep their exact dated changes; the reference and historical prefix are untouched.
export function interventionEvents(scenario,baseEvents,lever,value,start){
  const definition=LEVERS[lever];
  if(!definition||!Number.isFinite(value)||value<definition.min||value>definition.max||!Number.isInteger(start)||start<1||start>HORIZON)throw Error('Invalid intervention.');
  const events=validateEvents(baseEvents);
  const next=events.map(e=>e.week>=start?{week:e.week,policy:{...e.policy,[lever]:value}}:e);
  return schedulePolicy(next,start,{...policyAt(scenario,events,start),[lever]:value});
}
export function compareTiming(scenario,raw,assumptions){
  const study=validateStudy(raw);
  const eventSets=[study.baseEvents,interventionEvents(scenario,study.baseEvents,study.lever,study.value,study.a),interventionEvents(scenario,study.baseEvents,study.lever,study.value,study.b)];
  return eventSets.map((events,i)=>({id:['reference','a','b'][i],label:['Reference',`A · start W${study.a}`,`B · start W${study.b}`][i],events,state:simulate(scenario,events,HORIZON,assumptions)}));
}
export function metricValue(row,key,assumptions){
  // Ending fatigue determines the following week's capacity, including the
  // implied week-37 capacity. Do not relabel current-week capacity as this effect.
  return key==='capacity'?BASE_CAPACITY*(1-assumptions.fatigueCapacityLoss*row.fatigue):row[key]*(MECHANISMS[key]?.scale||1);
}
export function timingMarkdown(scenario,study,courses,assumptions){
  const format=n=>Number(n.toFixed(2));
  const policyText=raw=>{const p=normalizePolicy(raw);return `${p.commitment}% promises, ${p.quality}% quality protection, ${p.recovery}% recovery`;};
  const fields=['usable','outstanding','cumulativeDeclined','repairWork'];
  return ['## Intervention timing study','',`Shared history through week ${study.anchor}. ${LEVERS[study.lever].label}: ${study.value}% from week ${study.a} in A and week ${study.b} in B, continuing through week 36. All other levers follow the reference schedule. Same demand seed ${scenario.seed} and shared assumptions. These are hypothetical continuations, not observed results.`,'','Reference policy schedule:',`- Initially: ${policyText(scenario.policy)}`,...study.baseEvents.map(e=>`- Week ${e.week}: ${policyText(e.policy)}`),'','| Course | Usable points | Open promises | Declined points | Repair effort owed |','| --- | ---: | ---: | ---: | ---: |',...courses.map(c=>`| ${c.label} | ${fields.map(f=>format(c.state.history.at(-1)[f])).join(' | ')} |`),'',`### ${MECHANISMS[study.metric].label} at week ${study.inspect}`,'',MECHANISMS[study.metric].text,'',...courses.map(c=>`- ${c.label}: ${format(metricValue(c.state.history[study.inspect-1],study.metric,assumptions))} ${MECHANISMS[study.metric].unit}.`),'','Causal detail comes from the model equations; differences combine feedbacks and are not a decomposition into isolated causal contributions.',''].join('\n');
}
