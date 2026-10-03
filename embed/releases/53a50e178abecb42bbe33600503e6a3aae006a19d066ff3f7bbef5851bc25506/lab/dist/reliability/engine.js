export const LIMITS=Object.freeze({nodes:12,components:10});
const copy=value=>structuredClone(value);
export function example(which='bess'){
  const c=(id,label,p,x,y,inputs=[])=>({id,label,kind:'component',p,x,y,inputs});
  const g=(id,label,gate,x,y,inputs)=>({id,label,kind:'gate',gate,x,y,inputs});
  if(which==='service')return {name:'An online checkout',output:'checkout',nodes:[c('dns','Name service',.999,25,145),c('server-a','Service A',.98,235,40,['dns']),c('server-b','Service B',.98,235,260,['dns']),g('service','A service responds','OR',445,145,['server-a','server-b']),c('database','Database',.995,445,355),c('payment','Payment provider',.99,655,355),g('checkout','Checkout succeeds','AND',865,145,['service','database','payment'])]};
  return {name:'A battery responds',output:'response',nodes:[c('clock','Shared clock',.99,25,145),c('feed-a','Data feed A',.98,235,40,['clock']),c('feed-b','Data feed B',.97,235,260,['clock']),g('data','Usable data','OR',445,145,['feed-a','feed-b']),c('decision','Decision service',.99,655,145,['data']),c('command','Command channel',.985,865,145,['decision']),c('response','Battery response',.995,1075,145,['command'])]};
}
export function order(graph){
  const byId=new Map(graph.nodes.map(n=>[n.id,n]));const visiting=new Set(),visited=new Set(),sorted=[];
  function visit(id){if(visiting.has(id))throw Error('That connection would create a cycle.');if(visited.has(id))return;const n=byId.get(id);if(!n)throw Error('A dependency is missing.');visiting.add(id);for(const parent of n.inputs)visit(parent);visiting.delete(id);visited.add(id);sorted.push(n);}
  for(const n of graph.nodes)visit(n.id);return sorted;
}
export function validate(graph){
  if(!graph||!Array.isArray(graph.nodes)||!graph.nodes.length||graph.nodes.length>LIMITS.nodes)throw Error(`Use 1–${LIMITS.nodes} nodes.`);
  if(graph.nodes.filter(n=>n.kind==='component').length>LIMITS.components)throw Error(`At most ${LIMITS.components} independent components are supported.`);
  const ids=new Set();for(const n of graph.nodes){if(typeof n.id!=='string'||!n.id||ids.has(n.id))throw Error('Node IDs must be unique.');ids.add(n.id);if(typeof n.label!=='string'||!n.label.trim()||n.label.length>60)throw Error('Give each node a name of 1–60 characters.');if(!['component','gate'].includes(n.kind))throw Error('Unknown node type.');if(n.kind==='component'&&(!Number.isFinite(n.p)||n.p<0||n.p>1))throw Error('Availability must be between 0% and 100%.');if(n.kind==='gate'&&!['AND','OR'].includes(n.gate))throw Error('Choose ALL or ANY for a gate.');if(!Array.isArray(n.inputs)||new Set(n.inputs).size!==n.inputs.length)throw Error('Dependencies must be unique.');if(!Number.isFinite(n.x)||!Number.isFinite(n.y)||n.x<0||n.y<0)throw Error('Node positions must be valid.');}
  if(!ids.has(graph.output))throw Error('Choose an output node.');order(graph);return graph;
}
// Each component's own availability is an independent Boolean variable.
// A reused node is evaluated once, so paths sharing it are not independent.
export function evaluate(graph,upIds){const states={};for(const n of order(graph)){const inputs=n.inputs.map(id=>states[id]);states[n.id]=n.kind==='component'?upIds.has(n.id)&&inputs.every(Boolean):inputs.length>0&&(n.gate==='AND'?inputs.every(Boolean):inputs.some(Boolean));}return {states,success:states[graph.output]};}
export function availability(graph,failedIds=[]){
  validate(graph);const failed=new Set(failedIds);const components=graph.nodes.filter(n=>n.kind==='component');for(const id of failed)if(!components.some(n=>n.id===id))throw Error('Only a component can be held failed.');
  const free=components.filter(n=>!failed.has(n.id)),sorted=order(graph);let total=0;
  for(let mask=0;mask<2**free.length;mask++){let weight=1;const own={};for(let i=0;i<free.length;i++){const on=!!(mask&(1<<i));own[free[i].id]=on;weight*=on?free[i].p:1-free[i].p;}if(!weight)continue;const states={};for(const n of sorted){const ready=n.inputs.length&&(n.gate==='OR'?n.inputs.some(id=>states[id]):n.inputs.every(id=>states[id]));states[n.id]=n.kind==='component'?!!own[n.id]&&n.inputs.every(id=>states[id]):!!ready;}if(states[graph.output])total+=weight;}
  return Math.max(0,Math.min(1,total));
}
export function liveState(graph,failedIds=[]){return evaluate(graph,new Set(graph.nodes.filter(n=>n.kind==='component'&&!failedIds.includes(n.id)&&n.p>0).map(n=>n.id)));}
export function ancestors(graph,id=graph.output){const seen=new Set();const byId=new Map(graph.nodes.map(n=>[n.id,n]));function visit(key){if(seen.has(key))return;seen.add(key);for(const input of byId.get(key).inputs)visit(input);}visit(id);return seen;}
export function improvements(graph){const base=availability(graph);return graph.nodes.filter(n=>n.kind==='component').map(n=>{const trial=copy(graph);trial.nodes.find(x=>x.id===n.id).p=1;return {id:n.id,label:n.label,gain:Math.max(0,availability(trial)-base),availability:n.p};}).sort((a,b)=>b.gain-a.gain);}
export function connect(graph,source,target){const next=copy(graph),node=next.nodes.find(n=>n.id===target);if(!node||!next.nodes.some(n=>n.id===source))throw Error('Choose two existing nodes.');if(node.inputs.includes(source))throw Error('Those nodes are already connected.');node.inputs.push(source);return validate(next);}
export function disconnect(graph,source,target){const next=copy(graph),node=next.nodes.find(n=>n.id===target);if(!node||!node.inputs.includes(source))throw Error('That connection does not exist.');node.inputs=node.inputs.filter(id=>id!==source);return validate(next);}
export function updateNode(graph,id,patch){const next=copy(graph),node=next.nodes.find(n=>n.id===id);if(!node)throw Error('Choose an existing node.');for(const key of Object.keys(patch))if(!['label','p','gate','x','y'].includes(key))throw Error('Unknown node setting.');Object.assign(node,patch);return validate(next);}
function freshId(graph,prefix){let i=1;while(graph.nodes.some(n=>n.id===`${prefix}-${i}`))i++;return `${prefix}-${i}`;}
export function freePosition(graph,preferred={x:25,y:35}){const options=[];for(let col=0;col<8;col++)for(let row=0;row<5;row++){const x=25+col*210,y=35+row*185;if(!graph.nodes.some(n=>Math.abs(n.x-x)<190&&Math.abs(n.y-y)<178))options.push({x,y});}return options.sort((a,b)=>(a.x-preferred.x)**2+(a.y-preferred.y)**2-((b.x-preferred.x)**2+(b.y-preferred.y)**2))[0]||{x:Math.max(...graph.nodes.map(n=>n.x))+210,y:145};}
export function addNode(graph,kind='component'){const next=copy(graph),id=freshId(graph,kind),pos=freePosition(graph);next.nodes.push(kind==='component'?{id,kind,label:'New component',p:.99,inputs:[],...pos}:{id,kind:'gate',label:'New gate',gate:kind==='AND'?'AND':'OR',inputs:[],...pos});return {graph:validate(next),id};}
export function addAlternative(graph,id){
  const source=graph.nodes.find(n=>n.id===id);if(!source||source.kind!=='component')throw Error('Select a component to give it an alternative.');
  const next=copy(graph);const altId=freshId(next,'alternative'),gateId=freshId(next,'any');const altPos=freePosition(next,{x:source.x,y:source.y+185});
  next.nodes.push({...copy(source),id:altId,label:`${source.label.slice(0,44)} backup`,...altPos});const gatePos=freePosition(next,{x:source.x+210,y:source.y});
  for(const n of next.nodes)if(n.id!==altId)n.inputs=n.inputs.map(input=>input===id?gateId:input);
  next.nodes.push({id:gateId,label:`Either ${source.label.slice(0,40)}`,kind:'gate',gate:'OR',inputs:[id,altId],...gatePos});if(next.output===id)next.output=gateId;return {graph:validate(next),id:gateId,alternativeId:altId};
}
export function addCommonDependency(graph,targets){if(!Array.isArray(targets)||targets.length!==2||new Set(targets).size!==2||targets.some(id=>!graph.nodes.some(n=>n.id===id&&n.kind==='component')))throw Error('Choose two different components.');const next=copy(graph),id=freshId(next,'shared'),pos=freePosition(next);next.nodes.push({id,label:'Shared dependency',kind:'component',p:.99,inputs:[],...pos});for(const n of next.nodes)if(targets.includes(n.id))n.inputs.push(id);return {graph:validate(next),id};}
export function removeNode(graph,id){if(graph.output===id)throw Error('Choose another output before deleting this node.');const next=copy(graph);next.nodes=next.nodes.filter(n=>n.id!==id);for(const n of next.nodes)n.inputs=n.inputs.filter(input=>input!==id);return validate(next);}
export function setOutput(graph,id){return validate({...copy(graph),output:id});}
