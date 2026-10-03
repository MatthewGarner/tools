export const TASKS = [
  {id:'report',name:'Answer requests manually',kind:'delivery',needs:[],result:'A manual answer service'},
  {id:'data',name:'Make records usable',kind:'enabler',needs:[],result:'Reliable records'},
  {id:'permission',name:'Agree access permission',kind:'enabler',needs:[],result:'Permission to offer self service'},
  {id:'connection',name:'Connect the records',kind:'enabler',needs:['data'],result:'A reusable connection'},
  {id:'export',name:'Offer a data export',kind:'delivery',needs:['data'],result:'A downloadable export'},
  {id:'self',name:'Offer self service',kind:'delivery',needs:['permission','connection'],result:'A self service route'},
  {id:'alerts',name:'Send change alerts',kind:'delivery',needs:['connection'],result:'A change alert service'},
];
export const DEMANDS = {
  current:{name:'Requests stay familiar',detail:'People still need manual answers and a downloadable export.',wanted:['report','export']},
  future:{name:'Demand shifts to self service',detail:'People now need self service and change alerts. The old request types stop.',wanted:['self','alerts']},
  mixed:{name:'Both needs continue',detail:'Manual answers, exports, self service and alerts are all still needed.',wanted:['report','export','self','alerts']},
};
export const INITIAL = {version:1,demand:'current',budget:12,costs:{report:2,data:3,permission:2,connection:2,export:3,self:3,alerts:2},plan:['report','data','export']};
export const PLANS = {direct:['report','data','export'],enable:['data','permission','connection','self','alerts'],empty:[]};
const IDs=TASKS.map(t=>t.id),own=(x,keys)=>x&&typeof x==='object'&&!Array.isArray(x)&&Object.keys(x).length===keys.length&&keys.every(k=>Object.hasOwn(x,k));
export function validate(s){
  if(!own(s,['version','demand','budget','costs','plan'])||s.version!==1||!Object.hasOwn(DEMANDS,s.demand))throw Error('Expected a version 1 possibilities experiment and a known demand.');
  if(!Number.isInteger(s.budget)||s.budget<1||s.budget>30)throw Error('Effort budget must be a whole number from 1 to 30.');
  if(!own(s.costs,IDs)||IDs.some(id=>!Number.isInteger(s.costs[id])||s.costs[id]<1||s.costs[id]>10))throw Error('Every task needs an effort estimate from 1 to 10.');
  if(!Array.isArray(s.plan)||s.plan.length>IDs.length||new Set(s.plan).size!==s.plan.length||s.plan.some(id=>!IDs.includes(id)))throw Error('The plan must contain each known task at most once.');
  return s;
}
export function simulate(s){
  validate(s); const done=new Set(),trace=[];let spent=0;
  for(const id of s.plan){const task=TASKS.find(t=>t.id===id),missing=task.needs.filter(x=>!done.has(x)),cost=s.costs[id];let status='completed',reason;
    if(missing.length){status='blocked';reason='Needs '+missing.map(x=>TASKS.find(t=>t.id===x).name.toLowerCase()).join(' and ')+'.';}
    else if(spent+cost>s.budget){status='over-budget';reason=`Needs ${cost} effort; ${s.budget-spent} remains.`;}
    else{spent+=cost;done.add(id);reason=task.result+'.';}
    trace.push({id,name:task.name,kind:task.kind,status,cost,spent,reason});
  }
  const demand=DEMANDS[s.demand],delivered=TASKS.filter(t=>t.kind==='delivery'&&done.has(t.id)),served=delivered.filter(t=>demand.wanted.includes(t.id)),unmet=TASKS.filter(t=>demand.wanted.includes(t.id)&&!done.has(t.id));
  const reachable=TASKS.filter(t=>t.kind==='delivery'&&!done.has(t.id)&&t.needs.every(id=>done.has(id)));
  const landscape=TASKS.map(t=>({...t,cost:s.costs[t.id],wanted:demand.wanted.includes(t.id),missing:t.needs.filter(id=>!done.has(id)),status:done.has(t.id)?'completed':t.needs.every(id=>done.has(id))?'reachable':'locked'}));
  return{spent,remaining:s.budget-spent,trace,landscape,delivered,served,unmet,reachable,enabled:landscape.filter(t=>t.kind==='enabler'&&t.status==='completed')};
}
// A pinned plan is the intervention. Budget, task estimates and demand are the
// common external situation, so a demand change never compares different worlds.
export function compare(s,pinned){return pinned?simulate({...s,plan:[...pinned.plan]}):null;}
export function moveTask(s,id,index){if(!IDs.includes(id))throw Error('Unknown task.');const next=structuredClone(s);next.plan=next.plan.filter(x=>x!==id);next.plan.splice(Math.max(0,Math.min(next.plan.length,index)),0,id);return validate(next);}
export function describe(s,pinned){const r=simulate(s),b=compare(s,pinned);return `# Making worthwhile work possible\n\n${DEMANDS[s.demand].name}: ${DEMANDS[s.demand].detail}\n\nBudget: ${s.budget} effort. Used: ${r.spent}. Needed services delivered: ${r.served.length} of ${DEMANDS[s.demand].wanted.length}.\n\n${r.trace.map((t,i)=>`${i+1}. ${t.name} — ${t.status}; ${t.cost} effort. ${t.reason}`).join('\n')||'No work planned.'}\n\nStill needed: ${r.unmet.map(t=>t.name).join(', ')||'none'}.\nReachable next: ${r.reachable.map(t=>t.name).join(', ')||'none'}.${b?`\n\nPinned plan, same demand, budget and estimates: ${b.served.length} needed services delivered; ${b.spent} effort used.`:''}\n\nEstimates: ${TASKS.map(t=>`${t.name}: ${s.costs[t.id]}`).join('; ')}.\n\nPrerequisites: ${TASKS.map(t=>`${t.name} needs ${t.needs.map(id=>TASKS.find(x=>x.id===id).name).join(' + ')||'nothing else'}`).join('; ')}.\n\nTasks are indivisible and run once in order. A blocked or unaffordable task is skipped without spending effort; it is not retried. Service counts are distinct needs, not value or ROI. Prerequisites are fictional explicit assumptions; no expiry, uncertainty or parallel work is simulated.\n\nInspired by John Cutler, Can Do vs. Should Do: https://cutlefish.substack.com/p/tbm-1652-can-do-vs-should-do`;}
