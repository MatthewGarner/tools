import {engine,clone,text,list,unique,record,object,mdField} from '../workshop-kit/state.js?v=0.21.0';
import {ancestry,blankAncestry,derivedFrom,sourceSnapshot,validateGraph,hasDescendants,ancestryMarkdown,assertPortable} from '../shared/ancestry.js?v=0.21.0';
export const LEVELS={step:{name:'Change a step',prompt:'What could you simplify, remove, or replace inside this step?'},handoff:{name:'Repair a handoff',prompt:'What agreement or transfer between people needs to change?'},delay:{name:'Change the timing',prompt:'What happens too early, too late, or after an avoidable wait?'},information:{name:'Change the information',prompt:'Who needs to see what before making this decision?'},rule:{name:'Change the rule',prompt:'What threshold, permission, or incentive produces this behaviour?'},goal:{name:'Change the goal',prompt:'What is being optimised, and what outcome should matter instead?'}};
const OLD_FIELDS=['title','change','why','tradeoff','test','evidence'];
const OPTION_FIELDS=[...OLD_FIELDS,'expected','competing','observe','changed','reason'];
const LINK_FIELDS=['mechanism','conditions','lag','alternative','observations'];
export const STATUS={untested:'Untested hypothesis',supporting:'Observations consistent with it',challenged:'Observations challenge it'};
export const TEST_DECISIONS={undecided:'Undecided',continue:'Continue',revise:'Revise',stop:'Stop'};
export const ATTEMPT_LIMIT=100;
const RESULT_FIELDS=['observations','interpretation','reason','nextCheck'];
export const newOption=(id,anchor,level)=>({id,anchor,level,linkId:null,...Object.fromEntries(OPTION_FIELDS.map(key=>[key,''])),review:false,checked:null,ancestry:blankAncestry()});
export const newLink=(id,from,to)=>({id,from,to,...Object.fromEntries(LINK_FIELDS.map(key=>[key,''])),status:'untested',review:false,checked:null,origin:'explicit'});
function createBase(id='first',example='example'){
  if(!['example','battery','blank'].includes(example))throw new Error('Unknown example.');
  const battery=example==='battery',blank=example==='blank';
  const steps=(blank?[['','']]:battery?[['A dispatch opportunity appears','The expected value is compared with the current operating plan.'],['Operating limits are checked','Availability and service commitments constrain the choice.'],['A decision waits for clarification','The owner of an exception is not always clear.'],['The opportunity passes','A slow decision can consume a short operating window.']]:[['A team requests a review','A question enters the queue, sometimes before the work is ready.'],['Specialists ask for missing context','Clarification happens after a review slot has been reserved.'],['The item waits for the weekly meeting','Even reversible choices use the same approval route.'],['The decision arrives too late','Work is delayed or proceeds without the useful feedback.']]).map(([name,mechanism],i)=>({id:`${id}-s${i+1}`,name,mechanism}));
  const options=[];
  if(!blank){const rows=battery?[['information',1,'Expose the binding limit','Show the binding limit beside the proposed dispatch.','The decision can address the actual constraint instead of revisiting every assumption.'],['handoff',2,'Name the exception owner','Give each exception a named decision owner and response window.','Ownership makes a clarification actionable before the opportunity expires.'],['goal',3,'Value timely decisions','Review decision latency alongside captured value.','This may reveal missed value caused by slow coordination.']]:[['step',0,'Make a question ready first','Require one decision question and the context needed to answer it.','Specialists can use the review slot to decide, rather than discover what is missing.'],['information',1,'Signal readiness before booking','Show whether the needed evidence is available before reserving a review slot.','Incomplete requests can be clarified before they consume scarce review time.'],['rule',2,'Use a lighter route for reversible choices','Allow a named owner to decide reversible, low-impact choices after a short objection window.','A proportionate approval rule removes unnecessary waiting without removing accountability.']];for(const [level,index,title,change,why]of rows)options.push({...newOption(`${id}-o${options.length+1}`,steps[index].id,level),title,change,why});}
  return{id,problem:blank?'':battery?'Why do useful battery dispatch decisions arrive too late?':'Why do product decisions keep arriving after they would have helped?',steps,options,selectedId:options[1]?.id||null,chosenId:null};
}

export function create(id='first',example='example'){
 const w=createBase(id,example);w.links=[];w.compareIds=[];w.decision='';w.attempts=[];
 if(example!=='blank'){
  const claims=example==='battery'?[
   ['A new opportunity triggers checks against current commitments.','Checks use current, available operating limits.','Before the operating window closes.','A stale forecast may be the real source of delay.'],
   ['An unresolved limit sends the choice to an exception owner.','Normal dispatch approval cannot resolve this exception.','During the remaining decision window.','A technical calculation may take time even with clear ownership.'],
   ['Waiting for clarification consumes the useful operating window.','The opportunity cannot be recovered at the same value later.','Until the opportunity expires.','Market conditions may have changed independently of the wait.']
  ]:[
   ['Booking before context is ready makes clarification happen inside the review slot.','Requests are accepted without a readiness check.','At the booked review.','The question itself may be difficult even with complete context.'],
   ['Missing context pushes the decision into another meeting cycle.','The decision needs approval and cannot be completed asynchronously.','Up to one meeting cycle.','Reviewer availability may create the same wait.'],
   ['Waiting for the meeting leaves too little time to act on the decision.','The work has a deadline before or shortly after the meeting.','Until the next meeting.','Late requests may leave too little time even with an immediate decision.']
  ];
  w.links=claims.map((row,i)=>({...newLink(`${id}-l${i+1}`,w.steps[i].id,w.steps[i+1].id),...Object.fromEntries(['mechanism','conditions','lag','alternative'].map((k,j)=>[k,row[j]]))}));
  w.options.forEach(o=>o.linkId=w.links[Math.min(w.steps.findIndex(s=>s.id===o.anchor),w.links.length-1)].id);
  w.compareIds=w.options.slice(0,3).map(o=>o.id);
 }
 return validate(w);
}
function checked(value){return value==null?null:derivedFrom([value]).parents[0];}
const stepName=(w,id)=>w.steps.find(s=>s.id===id)?.name||'Unnamed step';
export function linkTitle(w,l){return `${stepName(w,l.from)} → ${stepName(w,l.to)}`;}
export function linkSnapshot(w,l){
 const fields=[{label:'Problem',text:w.problem}];
 for(const [label,id] of [['Cause',l.from],['Effect',l.to]]){const s=w.steps.find(s=>s.id===id);fields.push({label,text:s.name},{label:label+' description',text:s.mechanism});}
 for(const k of ['mechanism','conditions','lag','alternative'])fields.push({label:k,text:l[k]});
 return sourceSnapshot(l.id,linkTitle(w,l).slice(0,20000),fields);
}
export function optionSnapshot(w,o){const l=w.links.find(l=>l.id===o.linkId);return sourceSnapshot(o.id,o.title,[
 {label:'Problem',text:w.problem},{label:'Intervention type',text:LEVELS[o.level].name},{label:'Attached step',text:stepName(w,o.anchor)},
 {label:'Step description',text:w.steps.find(s=>s.id===o.anchor).mechanism},
 ...(l?linkSnapshot(w,l).fields.map(f=>({label:'Relationship · '+f.label,text:f.text})):[{label:'Relationship',text:'Not attached'}]),
 ...OPTION_FIELDS.map(k=>({label:k,text:o[k]}))]);}
function same(a,b){return JSON.stringify(a)===JSON.stringify(b);}
function date(value,optional=false){
 if(optional&&value==='')return value;
 if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value))throw new Error('Choose a calendar date.');
 const parsed=new Date(value+'T00:00:00.000Z');
 if(!Number.isFinite(parsed.getTime())||parsed.toISOString().slice(0,10)!==value)throw new Error('Choose a valid calendar date.');
 return value;
}
function attempt(value){
 if(!object(value)||!object(value.source))throw new Error('A test attempt needs its original intervention.');
 const fields=list(value.source.fields,160,'source fields').map(f=>record(f,['label','text']));
 if(new Set(fields.map(f=>f.label)).size!==fields.length||!['Problem','Intervention type','Attached step','Step description',...OPTION_FIELDS].every(label=>fields.some(f=>f.label===label)))throw new Error('A test attempt needs its original expectations and context.');
 // Rebuild the flat record: live source references and ancestry never enter an attempt.
 const source=sourceSnapshot(text(value.source.id,true),text(value.source.title),fields);
 const startedOn=date(value.startedOn),reviewedOn=date(value.reviewedOn,true);
 if(!Object.hasOwn(TEST_DECISIONS,value.decision))throw new Error('Choose a valid test decision.');
 if(reviewedOn&&reviewedOn<startedOn)throw new Error('The review date cannot precede the test start.');
 const result=record(value,RESULT_FIELDS);
 if(reviewedOn){text(result.observations,true);text(result.reason,true);}
 else if(value.decision!=='undecided'||RESULT_FIELDS.some(k=>result[k]))throw new Error('A test result needs a review date.');
 return {id:text(value.id,true),startedOn,source,...result,decision:value.decision,reviewedOn};
}
export function attemptSourceStatus(w,a){const o=w.options.find(o=>o.id===a.source.id);return !o?'Intervention removed · original preserved':same(a.source,optionSnapshot(w,o))?'Original intervention unchanged':'Intervention changed since this test started';}
export function validate(value){
 if(!object(value))throw new Error('Invalid intervention workspace.');
 const steps=unique(list(value.steps,7,'steps').map(s=>({id:text(s.id,true),...record(s,['name','mechanism'])})));if(!steps.length)throw new Error('A mechanism needs a step.');
 // Earlier sequence arrows were not causal evidence. Migrate them as blank suggested links.
 const rawLinks=value.links===undefined?steps.slice(1).map((s,i)=>({...newLink(`sequence-${i+1}`,steps[i].id,s.id),origin:'sequence'})):value.links;
 const links=unique(list(rawLinks,18,'relationships').map(l=>{
  if(!object(l)||!steps.some(s=>s.id===l.from)||!steps.some(s=>s.id===l.to)||l.from===l.to||!Object.hasOwn(STATUS,l.status)||typeof l.review!=='boolean'||!['explicit','sequence'].includes(l.origin))throw new Error('A relationship needs two different existing steps.');
  return {id:text(l.id,true),from:l.from,to:l.to,...record(l,LINK_FIELDS),status:l.status,review:l.review,checked:checked(l.checked),origin:l.origin};
 }));
 if(new Set(links.map(l=>JSON.stringify([l.from,l.to]))).size!==links.length)throw new Error('This directed relationship already exists.');
 const options=unique(list(value.options,24,'interventions').map(o=>{
  if(!object(o)||!Object.hasOwn(LEVELS,o.level)||!steps.some(s=>s.id===o.anchor)||typeof o.review!=='boolean')throw new Error('An intervention has a missing mechanism.');
  if(o.linkId!=null&&!links.some(l=>l.id===o.linkId))throw new Error('An intervention has a missing relationship.');
  return {id:text(o.id,true),anchor:o.anchor,level:o.level,linkId:o.linkId??null,...record(o,OLD_FIELDS),...Object.fromEntries(OPTION_FIELDS.filter(k=>!OLD_FIELDS.includes(k)).map(k=>[k,text(o[k]??'')])),review:o.review,checked:checked(o.checked),ancestry:ancestry(o.ancestry)};
 }));validateGraph(options);
 for(const k of ['selectedId','chosenId'])if(value[k]!==null&&!options.some(o=>o.id===value[k]))throw new Error('Intervention selection is inconsistent.');
 const compareIds=list(value.compareIds??[],4,'comparison');if(new Set(compareIds).size!==compareIds.length||compareIds.some(id=>!options.some(o=>o.id===id)))throw new Error('Comparison references a missing intervention.');
 const attempts=unique(list(value.attempts===undefined?[]:value.attempts,ATTEMPT_LIMIT,'test attempts').map(attempt));
 const w={id:text(value.id,true),problem:text(value.problem),steps,links,options,selectedId:value.selectedId,chosenId:value.chosenId,compareIds:[...compareIds],decision:text(value.decision??''),attempts};
 for(const l of links)if(l.checked&&!same(l.checked,linkSnapshot(w,l)))l.review=true;
 for(const o of options)if(o.checked&&!same(o.checked,optionSnapshot(w,o)))o.review=true;
 assertPortable({kind:'thinking-lab-interventions',version:1,workspace:w});return w;
}
export function reduce(value,a){
 const w=validate(value),o=w.options.find(o=>o.id===a.id),s=w.steps.find(s=>s.id===a.id),l=w.links.find(l=>l.id===a.id);
 const reviewAll=()=>{w.links.forEach(l=>l.review=true);w.options.forEach(o=>o.review=true);};
 switch(a.type){
  case'problem':w.problem=text(a.value);reviewAll();break;
  case'decision':w.decision=text(a.value);break;
  case'step':if(!s||!['name','mechanism'].includes(a.field))throw new Error('Step not found.');s[a.field]=text(a.value);w.links.filter(l=>[l.from,l.to].includes(s.id)).forEach(l=>l.review=true);w.options.filter(o=>o.anchor===s.id||w.links.some(l=>l.id===o.linkId&&[l.from,l.to].includes(s.id))).forEach(o=>o.review=true);break;
  case'add-step':w.steps.push({id:text(a.id,true),name:'',mechanism:''});break;
  case'remove-step':if(!s)throw new Error('Step not found.');if(w.links.some(l=>[l.from,l.to].includes(s.id))||w.options.some(o=>o.anchor===s.id))throw new Error('Move attached interventions and remove this step’s relationships first.');w.steps=w.steps.filter(x=>x!==s);break;
  case'reorder-step':{const i=w.steps.findIndex(s=>s.id===a.id),j=i+a.direction;if(i<0||![-1,1].includes(a.direction)||j<0||j>=w.steps.length)throw new Error('This step cannot move further.');[w.steps[i],w.steps[j]]=[w.steps[j],w.steps[i]];break;}
  case'add-link':w.links.push(newLink(text(a.id,true),a.from,a.to));break;
  case'link':if(!l||!LINK_FIELDS.includes(a.field))throw new Error('Relationship field not found.');l[a.field]=text(a.value);if(a.field!=='observations'){l.review=true;w.options.filter(o=>o.linkId===l.id).forEach(o=>o.review=true);}break;
  case'link-status':if(!l||!Object.hasOwn(STATUS,a.value))throw new Error('Unknown observation status.');l.status=a.value;break;
  case'review-link':if(!l)throw new Error('Relationship not found.');l.review=false;l.checked=linkSnapshot(w,l);break;
  case'remove-link':if(!l)throw new Error('Relationship not found.');if(w.options.some(o=>o.linkId===l.id))throw new Error('Retarget attached interventions before removing this relationship.');w.links=w.links.filter(x=>x!==l);break;
  case'add-option':w.options.push({...newOption(text(a.id,true),a.anchor,a.level),linkId:a.linkId??null});w.selectedId=a.id;break;
  case'option':if(!o||!OPTION_FIELDS.includes(a.field))throw new Error('Intervention field not found.');o[a.field]=text(a.value);o.review=true;break;
  case'step-anchor':if(!o||!w.steps.some(s=>s.id===a.value))throw new Error('Step not found.');o.anchor=a.value;o.linkId=null;o.review=true;break;
  case'target':{if(!o)throw new Error('Intervention not found.');const target=w.links.find(l=>l.id===a.value);if(a.value&&!target)throw new Error('Relationship not found.');o.linkId=target?.id??null;if(target)o.anchor=target.from;o.review=true;break;}
  case'move-option':if(!o||!Object.hasOwn(LEVELS,a.level??a.value)||!w.steps.some(s=>s.id===a.anchor))throw new Error('Choose a valid step and type.');if(o.anchor!==a.anchor)o.linkId=null;o.level=a.level??a.value;o.anchor=a.anchor;o.review=true;w.selectedId=o.id;break;
  case'reviewed':if(!o)throw new Error('Intervention not found.');o.review=false;o.checked=optionSnapshot(w,o);break;
  case'branch':if(!o)throw new Error('Intervention not found.');w.options.push({...clone(o),id:text(a.newId,true),title:o.title?o.title.slice(0,19988)+' · variation':'New variation',changed:'',reason:'',review:true,checked:null,ancestry:derivedFrom([optionSnapshot(w,o)])});w.selectedId=a.newId;break;
  case'compare':if(!o)throw new Error('Intervention not found.');w.compareIds=w.compareIds.includes(o.id)?w.compareIds.filter(id=>id!==o.id):[...w.compareIds,o.id];break;
  case'select':if(!o)throw new Error('Intervention not found.');w.selectedId=o.id;break;
  case'choose':if(!o)throw new Error('Intervention not found.');w.chosenId=o.id;w.selectedId=o.id;break;
  case'start-attempt':if(!o||w.chosenId!==o.id)throw new Error('Choose an intervention for this test first.');w.attempts.push({id:text(a.newId,true),startedOn:date(a.startedOn),source:optionSnapshot(w,o),...Object.fromEntries(RESULT_FIELDS.map(k=>[k,''])),decision:'undecided',reviewedOn:''});break;
  case'review-attempt':{const current=w.attempts.find(t=>t.id===a.id);if(!current)throw new Error('Test attempt not found.');Object.assign(current,record(a,RESULT_FIELDS),{reviewedOn:date(a.reviewedOn),decision:a.decision});break;}
  case'remove-option':if(!o)throw new Error('Intervention not found.');if(hasDescendants(w.options,o.id))throw new Error('Keep this parent while its branches remain.');w.options=w.options.filter(x=>x!==o);w.compareIds=w.compareIds.filter(id=>id!==o.id);if(w.selectedId===o.id)w.selectedId=w.options[0]?.id??null;if(w.chosenId===o.id)w.chosenId=null;break;
  default:throw new Error('Unknown action.');
 }return validate(w);
}
export const model=engine({kind:'thinking-lab-interventions',create,validate,reduce});
export function markdown(value){const w=validate(value),parts=['# Intervention workbench','',w.problem,'','## Mechanism steps',''];w.steps.forEach(s=>parts.push(`### ${s.name||'Unnamed step'}`,'',s.mechanism,'',''));parts.push('## Causal hypotheses','');for(const l of w.links){parts.push(`### ${linkTitle(w,l)}`,'',STATUS[l.status],l.origin==='sequence'?'Suggested from earlier step order; not an established causal link.':'',l.review?'Context changed; review needed.':'',...LINK_FIELDS.map(k=>mdField(k,l[k])),l.checked?ancestryMarkdown(derivedFrom([l.checked])):'');}
 for(const o of w.options){parts.push(`## ${o.title||'Untitled intervention'}${w.chosenId===o.id?' · chosen for a test':''}`,'',`Type: ${LEVELS[o.level].name}`,'',`Relationship: ${o.linkId?linkTitle(w,w.links.find(l=>l.id===o.linkId)):'Not attached'}`,'',`Attached step: ${stepName(w,o.anchor)}`,w.compareIds.includes(o.id)?'Included in comparison.':'',o.review?'Review needed.':o.checked?'Context reviewed; hypothesis not proven.':'Not reviewed.',...OPTION_FIELDS.filter(k=>k!=='title').map(k=>mdField(k,o[k])),ancestryMarkdown(o.ancestry),o.checked?'Last reviewed context:\n'+ancestryMarkdown(derivedFrom([o.checked])):'');}parts.push(mdField('Decision and remaining uncertainty',w.decision));
 if(w.attempts.length)parts.push('## Test attempts','');
 for(const a of w.attempts){parts.push(`### ${a.startedOn} · ${a.source.title||'Untitled intervention'}`,'',`Attempt ID: ${a.id}`,`Source ID: ${a.source.id}`,attemptSourceStatus(w,a),'','#### Original test and causal expectation','',...a.source.fields.map(f=>mdField(f.label,f.text)),'#### Result and review','',a.reviewedOn?`Reviewed: ${a.reviewedOn}`:'Awaiting a result review',mdField('Actual observations',a.observations),mdField('Interpretation',a.interpretation),mdField('Decision',TEST_DECISIONS[a.decision]),mdField('Reason for decision',a.reason),mdField('Next check',a.nextCheck));}
 return parts.join('\n');}
