export const roles = ['Harbour team', 'Meadow team', 'Coordination desk'];
export const methods = ['Method A', 'Method B'];
export const initialState = {
  scenario:'paired', demand:3, deadline:4, duration:1, consultationDelay:1, approvalDuration:1,
  coupled:true, sharedMethod:1, needs:[0,1], deciders:[0,1], knowledge:[0,1], consequences:[0,1],
  consultLocal:[false,false], consultLink:[false,false], approval:[false,false], linkKnowledge:2, capacity:[1,1,1], fallback:0
};
export const scenarios = {
  paired:{label:'A joint release',description:'Two teams prefer different methods. Each pair of decisions must agree on one method to connect.', coupled:true,needs:[0,1],sharedMethod:1,demand:3,deadline:4},
  independent:{label:'Independent local requests',description:'Each team handles its own requests. Local fit matters; matching the other team adds no benefit.',coupled:false,needs:[0,1],sharedMethod:1,demand:3,deadline:3},
  common:{label:'A shared method fits both',description:'Both teams need the same method. Shared context and local knowledge can now agree.',coupled:true,needs:[1,1],sharedMethod:1,demand:2,deadline:6}
};
const fields = Object.keys(initialState);
function integer(value,min,max,label){if(!Number.isInteger(value)||value<min||value>max)throw Error(`${label} must be an integer from ${min} to ${max}.`);}
export function validate(state){
  if(!state||typeof state!=='object'||Array.isArray(state)||fields.some(k=>!Object.hasOwn(state,k))||Object.keys(state).some(k=>!fields.includes(k)))throw Error('Expected a complete authority model.');
  if(!Object.hasOwn(scenarios,state.scenario))throw Error('Unknown scenario.');
  for(const [key,min,max] of [['demand',1,6],['deadline',1,30],['duration',1,4],['consultationDelay',0,4],['approvalDuration',1,4],['linkKnowledge',0,2],['fallback',0,1],['sharedMethod',0,1]])integer(state[key],min,max,key);
  if(typeof state.coupled!=='boolean')throw Error('Coupling must be true or false.');
  for(const key of ['needs','deciders','knowledge','consequences','consultLocal','consultLink','approval','capacity']){
    if(!Array.isArray(state[key])||state[key].length!==(key==='capacity'?3:2))throw Error(`Invalid ${key}.`);
    for(const value of state[key])if(['consultLocal','consultLink','approval'].includes(key)){if(typeof value!=='boolean')throw Error(`Invalid ${key}.`);}else integer(value,key==='capacity'?1:0,key==='needs'?1:key==='capacity'?3:2,key);
  }
  return state;
}
export function loadScenario(state,id){if(!scenarios[id])throw Error('Unknown scenario.');const {label,description,...situation}=scenarios[id];return {...structuredClone(state),...situation,scenario:id};}
export function arrange(state,kind){const next=structuredClone(state);if(kind==='local'){next.deciders=[0,1];next.consultLocal=[false,false];next.consultLink=[false,false];next.approval=[false,false];}else if(kind==='central'){next.deciders=[2,2];next.consultLocal=[true,true];next.consultLink=[false,false];next.approval=[false,false];}else if(kind==='context'){next.deciders=[0,1];next.consultLocal=[true,true];next.consultLink=[true,true];next.approval=[false,false];}return next;}

// One time-ordered event queue owns decisions and approvals. Reserving all
// decision slots before approvals would let later arrivals jump earlier work.
export function project(state){
  validate(state);
  const slots=state.capacity.map(n=>Array(n).fill(0)),events=[],decisions=[];
  let serial=0;
  for(let pair=0;pair<state.demand;pair++)for(let team=0;team<2;team++){
    const decider=state.deciders[team],knowsLocal=state.knowledge[team]===decider||state.consultLocal[team],knowsLink=state.linkKnowledge===decider||state.consultLink[team];
    const localRequest=state.consultLocal[team]&&state.knowledge[team]!==decider;
    const linkRequest=state.consultLink[team]&&state.linkKnowledge!==decider;
    const ready=(localRequest||linkRequest)?state.consultationDelay:0;
    const method=state.coupled&&knowsLink?state.sharedMethod:knowsLocal?state.needs[team]:state.fallback;
    const reason=state.coupled&&knowsLink?'Shared context: use the agreed connection method.':knowsLocal?'Local context: use the method this team needs.':'Local and shared context absent: use the fallback.';
    const item={id:`${team?'M':'H'}${pair+1}`,team,pair,decider,knowsLocal,knowsLink,ready,method,reason,localRequest,linkRequest,consequence:state.consequences[team],steps:[]};
    decisions.push(item);events.push({ready,role:decider,duration:state.duration,kind:'decide',item,serial:serial++});
  }
  while(events.length){
    events.sort((a,b)=>a.ready-b.ready||a.serial-b.serial);
    const event=events.shift(),pool=slots[event.role],slot=pool.indexOf(Math.min(...pool)),start=Math.max(event.ready,pool[slot]),end=start+event.duration;
    pool[slot]=end;
    event.item.steps.push({kind:event.kind,role:event.role,ready:event.ready,start,end,wait:start-event.ready,slot});
    if(event.kind==='decide'&&state.approval[event.item.team]&&event.role!==2)events.push({ready:end,role:2,duration:state.approvalDuration,kind:'approve',item:event.item,serial:serial++});
    else event.item.end=end;
  }
  const pairs=Array.from({length:state.demand},(_,pair)=>{const items=decisions.filter(d=>d.pair===pair);return {pair,compatible:!state.coupled||items[0].method===items[1].method,items};});
  for(const d of decisions){d.localFit=d.method===state.needs[d.team];d.compatible=pairs[d.pair].compatible;d.onTime=d.end<=state.deadline;d.wait=d.steps.reduce((sum,s)=>sum+s.wait,0);}
  return {decisions,pairs,total:decisions.length,onTime:decisions.filter(d=>d.onTime).length,localFit:decisions.filter(d=>d.localFit).length,compatible:pairs.filter(p=>p.compatible).length,finish:Math.max(...decisions.map(d=>d.end)),wait:decisions.reduce((sum,d)=>sum+d.wait,0),consultations:decisions.reduce((sum,d)=>sum+Number(d.localRequest)+Number(d.linkRequest),0),burdens:roles.map((role,i)=>({role,late:decisions.filter(d=>d.consequence===i&&!d.onTime).length,misfit:decisions.filter(d=>d.consequence===i&&!d.localFit).length,disconnected:decisions.filter(d=>d.consequence===i&&!d.compatible).length}))};
}
export const policyKeys=['deciders','knowledge','consequences','consultLocal','consultLink','approval','linkKnowledge','capacity','fallback'];
export function compare(state,pinned){if(!pinned)return null;validate(pinned);const replay=structuredClone(state);for(const key of policyKeys)replay[key]=structuredClone(pinned[key]);return {state:replay,result:project(replay),situationChanged:['demand','deadline','duration','consultationDelay','approvalDuration','coupled','sharedMethod','needs'].some(k=>JSON.stringify(state[k])!==JSON.stringify(pinned[k]))};}
export function summary(state,result=project(state)){return `${result.onTime}/${result.total} decisions by tick ${state.deadline}; ${result.localFit}/${result.total} fit local needs; ${state.coupled?`${result.compatible}/${state.demand} connected pairs`:'requests are independent'}. All finish at tick ${result.finish}.`;}
export function describe(state,pinned){const r=project(state),c=compare(state,pinned);return `# Who can actually decide?\n\n${summary(state,r)}\n\n${roles.slice(0,2).map((role,i)=>`${role}: ${roles[state.knowledge[i]]} knows, ${roles[state.deciders[i]]} decides, ${roles[state.consequences[i]]} bears consequences.`).join('\n\n')}\n\n${r.decisions.map(d=>`${d.id}: ${methods[d.method]}; finishes ${d.end}; ${d.reason} ${d.steps.map(s=>`${roles[s.role]} ${s.kind} ${s.start}–${s.end}, queue ${s.wait}`).join('; ')}.`).join('\n\n')}${c?`\n\nPinned arrangement replayed on current situation: ${summary(state,c.result)}`:''}\n\nFictional deterministic queues. Capacity is concurrent decisions, not staffing. Consultation transfers accurate facts after a fixed delay; approvals add permission, never information. No learning, negotiation or trust is simulated.\n\nInspired by John Cutler, Exception, Presence, Delegation: https://cutlefish.substack.com/p/tbm-422-exception-presence-delegation\n`;}
