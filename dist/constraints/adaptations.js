import {ancestry, derivedFrom, sourceSnapshot, validateGraph, hasDescendants, ancestryMarkdown} from '../shared/ancestry.js?v=0.20.0';
export const FIT = {unresolved:'Unresolved', fits:'Works within the limit', change:'Needs a change or permission'};
export const ADAPT_FIELDS = ['title','mechanism','kept','leftBehind','changed','reason','permission','test','evidence'];
export const LABELS = {title:'Name', mechanism:'How it would work', kept:'Useful principle kept', leftBehind:'Imaginary condition left behind', changed:'What changes in this branch', reason:'Why try this variation', permission:'Who needs to agree, and to what?', test:'Smallest useful test', evidence:'Observation that would change your mind'};
const clone = x => structuredClone(x);
const text = x => {if(typeof x !== 'string' || x.length > 20000) throw Error('Adaptation text must be at most 20,000 characters.');return x;};
const id = x => {text(x);if(!x.trim())throw Error('Missing adaptation identifier.');return x;};
const constraint = c => {if(!c||!['physical','contract','organisation','habit'].includes(c.type))throw Error('Invalid source constraint.');return {text:text(c.text),type:c.type,basis:text(c.basis)};};
const equal = (a,b) => ['text','type','basis'].every(k=>a[k]===b[k]);
const check = c => ({cardId:c.id,original:constraint(c),reviewed:constraint(c),status:'unresolved',explanation:''});
export function validateAdaptations(work) {
 const list = work.adaptations ?? [];
 if(!Array.isArray(list)||list.length>24)throw Error('Keep at most 24 adaptations in one playground.');
 const adaptations=list.map(a=>{
  if(!a||!Array.isArray(a.checks)||a.checks.length>18)throw Error('Invalid constraint checks.');
  const checks=a.checks.map(c=>{if(!c||!Object.hasOwn(FIT,c.status))throw Error('Invalid fit judgement.');return {cardId:id(c.cardId),original:constraint(c.original),reviewed:constraint(c.reviewed),status:c.status,explanation:text(c.explanation)};});
  if(new Set(checks.map(c=>c.cardId)).size!==checks.length)throw Error('Duplicate constraint checks.');
  return {id:id(a.id),...Object.fromEntries(ADAPT_FIELDS.map(k=>[k,text(a[k])])),ancestry:ancestry(a.ancestry),checks};
 });
 validateGraph(adaptations);
 const selectedAdaptationId=work.selectedAdaptationId??null, chosenId=work.chosenId??null, compareIds=work.compareIds??[];
 if(!Array.isArray(compareIds)||compareIds.length>4||new Set(compareIds).size!==compareIds.length)throw Error('Compare up to four different adaptations.');
 const found=x=>adaptations.some(a=>a.id===x), live=x=>adaptations.some(a=>a.id===x&&!a.ancestry.parked);
 if((selectedAdaptationId!==null&&!found(selectedAdaptationId))||(chosenId!==null&&!live(chosenId))||compareIds.some(x=>!live(x)))throw Error('Adaptation selection is inconsistent.');
 return {adaptations,selectedAdaptationId,chosenId,compareIds,decision:text(work.decision??'')};
}
export function fitSummary(work,a) {
 const missing=work.cards.filter(c=>!a.checks.some(x=>x.cardId===c.id));
 const changed=a.checks.filter(c=>{const current=work.cards.find(x=>x.id===c.cardId);return current&&!equal(c.reviewed,current);});
 return {missing,changed,unresolved:a.checks.filter(c=>c.status==='unresolved').length,needsChange:a.checks.filter(c=>c.status==='change').length,unexplained:a.checks.filter(c=>!c.explanation.trim()).length,removed:a.checks.filter(c=>!work.cards.some(x=>x.id===c.cardId)).length};
}
export const checkChanged=(work,c)=>{const current=work.cards.find(x=>x.id===c.cardId);return !!current&&!equal(c.reviewed,current);};
export function adaptationSnapshot(work,a) {
 return sourceSnapshot(a.id,a.title||'Untitled adaptation',[
  {label:'Problem',text:work.problem},...ADAPT_FIELDS.filter(k=>k!=='title').map(k=>({label:LABELS[k],text:a[k]})),
  // Keep fields separate: concatenating valid 20,000-character notes can
  // exceed the shared snapshot field limit and make branching fail.
  ...a.checks.flatMap(c=>[{label:'Original constraint',text:c.original.text},{label:'Original kind',text:c.original.type},{label:'Original basis',text:c.original.basis},{label:'Last reviewed constraint',text:c.reviewed.text},{label:'Reviewed kind',text:c.reviewed.type},{label:'Reviewed basis',text:c.reviewed.basis},{label:'Fit judgement',text:FIT[c.status]},{label:'Fit reasoning',text:c.explanation}])
 ]);
}
export function applyAdaptation(work,action) {
 const a=work.adaptations.find(a=>a.id===action.id);
 const requireA=()=>{if(!a)throw Error('Adaptation not found.');};
 switch(action.type){
  case 'adapt-create': {
   if(work.adaptations.length>=24||work.adaptations.some(a=>a.id===action.newId))throw Error('Use a unique adaptation, up to 24 per problem.');id(action.newId);
   const card=work.cards.find(c=>c.id===action.cardId),lane=action.lane,notes=card?.notes[lane];
   if(!notes?.restored||card.lane!=='current')throw Error('Restore the actual constraint before making an adaptation.');
   const source=sourceSnapshot('experiment-'+action.newId,card.text||'Constraint experiment',[
    {label:'Problem',text:work.problem},{label:'Actual constraint',text:card.text},{label:'Kind',text:card.type},{label:'Basis',text:card.basis},{label:'Imaginary move',text:lane},
    ...Object.entries(notes).filter(([k])=>k!=='restored').map(([k,v])=>({label:k,text:v}))
   ]);
   const next={id:action.newId,...Object.fromEntries(ADAPT_FIELDS.map(k=>[k,''])),title:'Adaptation '+(work.adaptations.length+1),mechanism:notes.adaptation,test:notes.test,evidence:notes.evidence,ancestry:derivedFrom([source]),checks:work.cards.map(check)};
   work.adaptations.push(next);work.selectedAdaptationId=next.id;if(work.compareIds.length<4)work.compareIds.push(next.id);break;
  }
  case 'adapt-branch': {
   requireA();id(action.newId);if(work.adaptations.length>=24||work.adaptations.some(a=>a.id===action.newId))throw Error('Use a unique adaptation, up to 24 per problem.');
   const next={...clone(a),id:action.newId,title:'Variation: '+a.title.slice(0,19989),changed:'',reason:'',ancestry:derivedFrom([adaptationSnapshot(work,a)])};text(next.title);
   work.adaptations.push(next);work.selectedAdaptationId=next.id;if(work.compareIds.length<4)work.compareIds.push(next.id);break;
  }
  case 'adapt-edit':requireA();if(!ADAPT_FIELDS.includes(action.field))throw Error('Unknown adaptation field.');a[action.field]=text(action.value);break;
  case 'adapt-select':requireA();work.selectedAdaptationId=a.id;break;
  case 'adapt-compare':requireA();if(work.compareIds.includes(a.id))work.compareIds=work.compareIds.filter(x=>x!==a.id);else{if(a.ancestry.parked||work.compareIds.length>=4)throw Error('Compare up to four active adaptations.');work.compareIds.push(a.id);}break;
  case 'adapt-choose':requireA();if(a.ancestry.parked)throw Error('Revive this adaptation before choosing its test.');work.chosenId=work.chosenId===a.id?null:a.id;break;
  case 'adapt-park':requireA();a.ancestry.parked=!a.ancestry.parked;if(a.ancestry.parked){work.compareIds=work.compareIds.filter(x=>x!==a.id);if(work.chosenId===a.id)work.chosenId=null;}break;
  case 'adapt-remove':requireA();if(hasDescendants(work.adaptations,a.id))throw Error('This adaptation has branches. Park it to retain their history.');work.adaptations=work.adaptations.filter(x=>x.id!==a.id);work.compareIds=work.compareIds.filter(x=>x!==a.id);if(work.chosenId===a.id)work.chosenId=null;if(work.selectedAdaptationId===a.id)work.selectedAdaptationId=work.adaptations[0]?.id??null;break;
  case 'adapt-decision':work.decision=text(action.value);break;
  case 'adapt-sync':requireA();for(const c of work.cards)if(!a.checks.some(x=>x.cardId===c.id))a.checks.push(check(c));if(a.checks.length>18)throw Error('Keep at most 18 current and earlier constraint checks per adaptation.');break;
  case 'adapt-check': {
   requireA();const c=a.checks.find(c=>c.cardId===action.cardId);if(!c)throw Error('Constraint check not found.');
   if(action.field==='status'){if(!Object.hasOwn(FIT,action.value))throw Error('Unknown fit judgement.');c.status=action.value;}
   else if(action.field==='explanation')c.explanation=text(action.value);else throw Error('Unknown check field.');break;
  }
  case 'adapt-review': {
   requireA();const c=a.checks.find(c=>c.cardId===action.cardId),current=work.cards.find(c=>c.id===action.cardId);if(!c||!current)throw Error('Current constraint not found.');
   c.reviewed=constraint(current);c.status='unresolved';// Changed wording invalidates the old verdict; retain the explanation for revision.
   break;
  }
  default:throw Error('Unknown adaptation action.');
 }
 validateGraph(work.adaptations);
}
export function remapAdaptations(work,cardIds,prefix){
 const ids=new Map(work.adaptations.map((a,i)=>[a.id,`${prefix}-a${i+1}`]));
 for(const a of work.adaptations){a.id=ids.get(a.id);for(const p of a.ancestry.parents)if(ids.has(p.id))p.id=ids.get(p.id);for(const c of a.checks)if(cardIds.has(c.cardId))c.cardId=cardIds.get(c.cardId);}
 work.selectedAdaptationId=ids.get(work.selectedAdaptationId)??null;work.chosenId=ids.get(work.chosenId)??null;work.compareIds=work.compareIds.map(x=>ids.get(x));
}
export function adaptationsMarkdown(work){
 const lines=['## Practical adaptations','',work.decision?`Decision: ${work.decision}`:'Decision not recorded.',''];
 for(const a of work.adaptations){lines.push(`### ${a.title||'Untitled adaptation'}${a.id===work.chosenId?' · chosen test':''}`,a.ancestry.parked?'Parked':'Active','');
  for(const k of ADAPT_FIELDS.filter(k=>k!=='title'))lines.push(`**${LABELS[k]}**`,a[k]||'_Not written._','');
  const f=fitSummary(work,a);lines.push(`Fit review: ${f.unresolved} unresolved; ${f.needsChange} need change/permission; ${f.unexplained} without reasoning; ${f.changed.length} changed constraints; ${f.missing.length} new constraints unchecked. These are recorded judgements, not verified feasibility.`,'');
  for(const c of a.checks){const current=work.cards.find(x=>x.id===c.cardId);lines.push(`**Constraint: ${c.original.text||'Unnamed'}**`,`Original: ${c.original.type} · ${c.original.basis}`,`Reviewed against: ${c.reviewed.text} · ${c.reviewed.type} · ${c.reviewed.basis}`,`Current: ${current?current.text+' · '+current.type+' · '+current.basis:'Removed from board; source retained.'}`,`Judgement: ${FIT[c.status]}`,c.explanation||'_Reasoning not written._','');}
  lines.push(ancestryMarkdown(a.ancestry),'');
 }
 return lines.join('\n\n');
}
