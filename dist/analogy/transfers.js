import {ancestry, blankAncestry, sourceSnapshot, derivedFrom, validateGraph, hasDescendants, ancestryMarkdown} from '../shared/ancestry.js?v=0.15.0';
export const JUDGEMENTS = {unchecked:'Not checked',fits:'Holds',partial:'Partly holds',breaks:'Breaks here'};
export const REVIEW_TEXT = ['note','targetRelation','condition','failure'];
export const TREATMENTS = {undecided:'Still deciding',keep:'Keep the relationship',redesign:'Redesign it',omit:'Leave it out'};
export const OPTION_FIELDS = ['title','mechanism','adaptation','boundary','test','learn','changed','reason'];
export const OPTION_LABELS = {title:'Name this adaptation',mechanism:'Working principle to keep',adaptation:'What changes in this situation',boundary:'Limits and remaining mismatches',test:'Smallest useful test',learn:'Observation that would change your mind',changed:'What changes in this branch',reason:'Why try this variation'};
const clone=x=>structuredClone(x), fits=['unchecked','fits','partial','breaks'];
const text=x=>{if(typeof x!=='string'||x.length>20000)throw Error('Text must be at most 20,000 characters.');return x;};
const id=x=>{text(x);if(!x.trim())throw Error('Missing adaptation identifier.');return x;};
const role=(w,sourceId)=>w.targets.find(t=>t.id===w.mappings.find(m=>m.sourceId===sourceId)?.targetId);
const label=r=>r?.label||'Unmatched';
export function analysisFields(w){
 const fields=[{label:'Target situation',text:w.problem},{label:'Source name',text:w.source.name},{label:'Source mechanism',text:w.source.principle}];
 for(const [i,s] of w.source.roles.entries()){const t=role(w,s.id),m=w.mappings.find(m=>m.sourceId===s.id);fields.push(...[['Source role',s.label],['Source function',s.job],['Target role',t?.label??''],['Target function',t?.job??''],['Mapping reason',m?.reason??'']].map(([k,text])=>({label:`Role ${i+1} · ${k}`,text})));}
 for(const [i,t] of w.targets.filter(t=>!w.mappings.some(m=>m.targetId===t.id)).entries())fields.push({label:`Unmatched target ${i+1}`,text:t.label},{label:`Unmatched function ${i+1}`,text:t.job});
 for(const [i,l] of w.source.links.entries()){const r=w.reviews[l.id];fields.push(...[['From source role',label(w.source.roles.find(s=>s.id===l.from))],['To source role',label(w.source.roles.find(s=>s.id===l.to))],['Source relationship',l.label],['Target relationship',r.targetRelation],['Fit judgement',r.fit+(r.stale?' · needs review':'')],['Earlier reasoning',r.note],['Required condition',r.condition],['Failure point',r.failure]].map(([k,text])=>({label:`Link ${i+1} · ${k}`,text})));}
 return fields;
}
export function captureAnalysis(w,newId){return sourceSnapshot('analysis-'+newId,w.source.name||'Source analysis',analysisFields(w));}
export const analysisChanged=(w,a)=>JSON.stringify(analysisFields(w))!==JSON.stringify(a.basis.fields);
export function captureRelationships(w){return w.source.links.map(l=>{const r=w.reviews[l.id];return {id:l.id,sourceFrom:label(w.source.roles.find(s=>s.id===l.from)),sourceTo:label(w.source.roles.find(s=>s.id===l.to)),sourceRelation:l.label,targetFrom:label(role(w,l.from)),targetTo:label(role(w,l.to)),targetRelation:r.targetRelation,fit:r.fit,stale:r.stale,note:r.note,condition:r.condition,failure:r.failure,treatment:'undecided',rewrite:'',reason:''};});}
const REL_TEXT=['sourceFrom','sourceTo','sourceRelation','targetFrom','targetTo','targetRelation','note','condition','failure','rewrite','reason'];
export function validateTransfers(value){
 const options=value.options??[];if(!Array.isArray(options)||options.length>16)throw Error('Keep at most 16 adaptations in one workshop.');
 const clean=options.map(a=>{if(!a||!Array.isArray(a.relationships)||a.relationships.length>10)throw Error('Invalid adaptation relationships.');
  const relationships=a.relationships.map(r=>{if(!r||!fits.includes(r.fit)||typeof r.stale!=='boolean'||!Object.hasOwn(TREATMENTS,r.treatment))throw Error('Invalid relationship response.');return {id:id(r.id),...Object.fromEntries(REL_TEXT.map(k=>[k,text(r[k])])),fit:r.fit,stale:r.stale,treatment:r.treatment};});
  if(new Set(relationships.map(r=>r.id)).size!==relationships.length)throw Error('Duplicate adaptation relationships.');
  const basis=ancestry({version:1,parents:[a.basis],parked:false}).parents[0];
  return {id:id(a.id),...Object.fromEntries(OPTION_FIELDS.map(k=>[k,text(a[k])])),basis,relationships,ancestry:ancestry(a.ancestry)};
 });validateGraph(clean);
 const selectedOptionId=value.selectedOptionId??null, chosenOptionId=value.chosenOptionId??null, compareOptions=value.compareOptions??[];
 if(!Array.isArray(compareOptions)||compareOptions.length>4||new Set(compareOptions).size!==compareOptions.length)throw Error('Compare up to four distinct adaptations.');
 const found=x=>clean.some(a=>a.id===x),live=x=>clean.some(a=>a.id===x&&!a.ancestry.parked);
 if((selectedOptionId!==null&&!found(selectedOptionId))||(chosenOptionId!==null&&!live(chosenOptionId))||compareOptions.some(x=>!live(x)))throw Error('Adaptation selection is inconsistent.');
 return {options:clean,selectedOptionId,chosenOptionId,compareOptions,decision:text(value.decision??'')};
}
export function optionSnapshot(a){
 // Separate source/user fields preserve full-length writing. Keep ancestry flat.
 const fields=OPTION_FIELDS.filter(k=>k!=='title').map(k=>({label:OPTION_LABELS[k],text:a[k]}));
 fields.push({label:'Borrowed source',text:a.basis.title});
 for(const [i,r] of a.relationships.entries())fields.push(...[['Source relationship',r.sourceRelation],['Target relationship',r.targetRelation],['Required condition',r.condition],['Failure point',r.failure],['Treatment',TREATMENTS[r.treatment]],['Adapted interaction',r.rewrite],['Reason',r.reason]].map(([k,text])=>({label:`Link ${i+1} · ${k}`,text})));
 return sourceSnapshot(a.id,a.title||'Untitled adaptation',fields);
}
export function responseSummary(a){return `${a.relationships.filter(r=>r.treatment==='undecided').length} undecided · ${a.relationships.filter(r=>r.treatment==='redesign').length} redesigned · ${a.relationships.filter(r=>!r.reason.trim()).length} without reasoning`;}
export function applyTransfer(w,action){
 const a=w.options.find(a=>a.id===action.id);const requireA=()=>{if(!a)throw Error('Adaptation not found.');};
 const insert=next=>{id(next.id);if(w.options.length>=16||w.options.some(a=>a.id===next.id))throw Error('Use a unique adaptation, up to 16 per workshop.');w.options.push(next);w.selectedOptionId=next.id;if(w.compareOptions.length<4)w.compareOptions.push(next.id);};
 switch(action.type){
  case 'option-capture':insert({id:action.newId,...Object.fromEntries(OPTION_FIELDS.map(k=>[k,''])),title:'Adaptation '+(w.options.length+1),...clone(w.plan),basis:captureAnalysis(w,action.newId),relationships:captureRelationships(w),ancestry:blankAncestry()});break;
  case 'option-branch':case 'option-recast':requireA();insert({...clone(a),id:action.newId,title:'Variation: '+a.title.slice(0,19989),changed:'',reason:'',...(action.type==='option-recast'?{basis:captureAnalysis(w,action.newId),relationships:captureRelationships(w)}:{}),ancestry:derivedFrom([optionSnapshot(a)])});break;
  case 'option-edit':requireA();if(!OPTION_FIELDS.includes(action.field))throw Error('Unknown adaptation field.');a[action.field]=text(action.value);break;
  case 'option-response': {requireA();const r=a.relationships.find(r=>r.id===action.linkId);if(!r)throw Error('Relationship response not found.');if(action.field==='treatment'){if(!Object.hasOwn(TREATMENTS,action.value))throw Error('Unknown relationship treatment.');r.treatment=action.value;}else if(['rewrite','reason'].includes(action.field))r[action.field]=text(action.value);else throw Error('Unknown relationship response.');break;}
  case 'option-select':requireA();w.selectedOptionId=a.id;break;
  case 'option-compare':requireA();if(w.compareOptions.includes(a.id))w.compareOptions=w.compareOptions.filter(x=>x!==a.id);else{if(a.ancestry.parked||w.compareOptions.length>=4)throw Error('Compare up to four active adaptations.');w.compareOptions.push(a.id);}break;
  case 'option-choose':requireA();if(a.ancestry.parked)throw Error('Revive this adaptation before choosing its test.');w.chosenOptionId=w.chosenOptionId===a.id?null:a.id;break;
  case 'option-park':requireA();a.ancestry.parked=!a.ancestry.parked;if(a.ancestry.parked){w.compareOptions=w.compareOptions.filter(x=>x!==a.id);if(w.chosenOptionId===a.id)w.chosenOptionId=null;}break;
  case 'option-remove':requireA();if(hasDescendants(w.options,a.id))throw Error('This adaptation has branches. Park it to keep their history.');w.options=w.options.filter(x=>x.id!==a.id);w.compareOptions=w.compareOptions.filter(x=>x!==a.id);if(w.chosenOptionId===a.id)w.chosenOptionId=null;if(w.selectedOptionId===a.id)w.selectedOptionId=w.options[0]?.id??null;break;
  case 'option-decision':w.decision=text(action.value);break;
  default:throw Error('Unknown adaptation action.');
 }validateGraph(w.options);
}
export function remapTransfers(w,prefix){
 const ids=new Map(w.options.map((a,i)=>[a.id,`${prefix}-a${i+1}`]));
 for(const a of w.options){a.id=ids.get(a.id);for(const p of a.ancestry.parents)if(ids.has(p.id))p.id=ids.get(p.id);}
 // Relationship IDs belong to each frozen source analysis, not the live graph.
 w.selectedOptionId=ids.get(w.selectedOptionId)??null;w.chosenOptionId=ids.get(w.chosenOptionId)??null;w.compareOptions=w.compareOptions.map(x=>ids.get(x));
}
export function transfersMarkdown(w){
 const p=['## Alternative adaptations',w.decision?`Decision: ${w.decision}`:'Decision not recorded.'];
 for(const a of w.options){p.push(`### ${a.title||'Untitled adaptation'}${w.chosenOptionId===a.id?' · chosen test':''}`,a.ancestry.parked?'Parked':'Active');for(const k of OPTION_FIELDS.filter(k=>k!=='title'))p.push(`**${OPTION_LABELS[k]}**`,a[k]||'_Not written._');
  p.push(`Borrowed from: ${a.basis.title}`,analysisChanged(w,a)?'Uses a different or earlier analysis; original source retained.':'Uses the current analysis.',responseSummary(a));
  for(const r of a.relationships)p.push(`#### ${r.sourceFrom} → ${r.sourceTo}`,`Source interaction: ${r.sourceRelation}`,`Target roles: ${r.targetFrom} → ${r.targetTo}`,`Target interaction: ${r.targetRelation}`,`Judgement: ${JUDGEMENTS[r.fit]}${r.stale?' · needs review':''}`,`Earlier reasoning: ${r.note}`,`Required condition: ${r.condition}`,`Failure point: ${r.failure}`,`Treatment: ${TREATMENTS[r.treatment]}`,`Adapted interaction: ${r.rewrite}`,`Why: ${r.reason}`);
  p.push(ancestryMarkdown(derivedFrom([a.basis])),ancestryMarkdown(a.ancestry));
 }return p.join('\n\n');
}
