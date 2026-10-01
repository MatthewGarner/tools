export const PRESETS = {
  battery: {name:'A better battery decision',problem:'Help someone make a better decision about a battery, without giving them another dashboard.',axes:[['For whom?','A trader','An asset manager','A site operator','A product team'],['At what moment?','Before making a commitment','When a forecast changes','After a surprising outcome','During a handover'],['What material?','A missed opportunity','A constraint','A disagreement','An uncertain forecast'],['Through what mechanism?','A rehearsal','A side-by-side comparison','A reversible experiment','A shared story'],['With what twist?','Only five minutes','Without a single score','Show what is missing','Let two people disagree']]},
  teams:{name:'Make a team think differently',problem:'Help a team notice something important about how it works.',axes:[['For whom?','A new team member','A product trio','A leadership team','Two dependent teams'],['At what moment?','Before saying yes','When work gets stuck','After a difficult week','When priorities change'],['What material?','An unspoken assumption','A queue of work','A promise','A near miss'],['Through what mechanism?','A role reversal','A playable model','An anonymous comparison','A future retrospective'],['With what twist?','No numerical scores','No meeting needed','Make the delay visible','Start from a counterexample']]},
  curiosity:{name:'An unfamiliar way to explore',problem:'Make a small interactive thing that helps someone see an everyday phenomenon differently.',axes:[['For whom?','A curious beginner','Two people who disagree','A patient observer','Your future self'],['What world?','A city','An ecosystem','A market','A household'],['What pattern?','A feedback loop','A hidden dependency','A threshold','A trade-off over time'],['Through what mechanism?','A tiny simulation','A map you can rearrange','A prediction game','A collection of counterexamples'],['With what twist?','Change only one rule','Reveal information slowly','Start at the end','Use an unexpected scale']]},
  blank:{name:'My own possibility space',problem:'',axes:[['Who?','Person A','Person B','Person C'],['When?','Before','During','After'],['With what?','A constraint','A question','A disagreement'],['How?','Compare','Rehearse','Rearrange']]}
};
let counter=0;
export const uid=()=>globalThis.crypto?.randomUUID?.() ?? `id-${Date.now()}-${++counter}`;
export function createWorkspace(preset='battery') {
  const p=PRESETS[preset]??PRESETS.blank;
  return {id:uid(),title:p.name,problem:p.problem,dimensions:p.axes.map(([name,...options])=>{const opts=options.map(label=>({id:uid(),label}));return{id:uid(),name,options:opts,selectedId:opts[0].id,locked:false};}),concepts:[],activeConceptId:null,history:[],mixCount:0};
}
export const ingredients=w=>w.dimensions.map(d=>({dimension:d.name,label:d.options.find(o=>o.id===d.selectedId)?.label??''}));
export const combinationKey=w=>w.dimensions.map(d=>d.selectedId).join('|');
export const combinationCount=(w,unlocked=false)=>w.dimensions.reduce((n,d)=>n*(unlocked&&d.locked?1:d.options.length),1);
export function mixWorkspace(workspace,random=Math.random) {
  const w=structuredClone(workspace),current=combinationKey(w),seen=new Set(w.history);
  const mutable=w.dimensions.filter(d=>!d.locked&&d.options.length>1);
  if(!mutable.length)return {workspace:w,changed:false,exhausted:true};
  let best;
  for(let attempt=0;attempt<60;attempt++){
    const candidate=structuredClone(w);
    for(const d of candidate.dimensions)if(!d.locked)d.selectedId=d.options[Math.min(d.options.length-1,Math.max(0,Math.floor(random()*d.options.length)))].id;
    const key=combinationKey(candidate);
    if(key!==current){best=candidate;if(!seen.has(key))break;}
  }
  // An adversarial/repeated random value must not make a usable mixer look stuck.
  if(!best){best=structuredClone(w);const d=best.dimensions.find(d=>d.id===mutable[0].id);d.selectedId=d.options[(d.options.findIndex(o=>o.id===d.selectedId)+1)%d.options.length].id;}
  const nextKey=combinationKey(best);best.history=[...new Set([...w.history,current,nextKey])].slice(-200);best.mixCount=w.mixCount+1;
  return {workspace:best,changed:true,exhausted:seen.has(nextKey)};
}
export function captureConcept(w){return{id:uid(),ingredients:ingredients(w),title:'',mechanism:'',useful:'',assumption:'',experiment:'',createdAt:new Date().toISOString()};}
export function markdown(w){
 const list=arr=>arr.map(i=>`- **${i.dimension}:** ${i.label}`).join('\n');
 return `# ${w.title||'Possibility space'}\n\n${w.problem||'(Problem not written yet)'}\n\n## Current combination\n\n${list(ingredients(w))}\n\n## Possibility space\n\n${w.dimensions.map(d=>`- **${d.name}:** ${d.options.map(o=>o.label).join(' · ')}`).join('\n')}\n\n${w.concepts.length?w.concepts.map((c,i)=>`## ${i+1}. ${c.title||'Untitled concept'}\n\n${list(c.ingredients)}\n\n**How it works:** ${c.mechanism||'—'}\n\n**Why it could help:** ${c.useful||'—'}\n\n**Assumption to challenge:** ${c.assumption||'—'}\n\n**Smallest experiment:** ${c.experiment||'—'}`).join('\n\n'):'No concepts developed yet.'}\n\n---\nCreated in Thinking Lab · Possibility mixer. Combinations are prompts for judgment, not recommendations.\n`;
}
export function validateWorkspace(raw){
 const text=(v,max=12000)=>typeof v==='string'?v.slice(0,max):'';
 if(!raw||!Array.isArray(raw.dimensions)||raw.dimensions.length<2||raw.dimensions.length>8)throw new Error('A workspace needs 2–8 dimensions.');
 const ids=new Set();
 const id=v=>{const result=typeof v==='string'&&v.length<100&&!ids.has(v)?v:uid();ids.add(result);return result;};
 const dimensions=raw.dimensions.map(d=>{
   if(!d||!Array.isArray(d.options)||d.options.length<1||d.options.length>12)throw new Error('Each dimension needs 1–12 options.');
   const options=d.options.map(o=>({id:id(o?.id),label:text(o?.label,120)||'Untitled option'}));
   return{id:id(d.id),name:text(d.name,80)||'Untitled dimension',options,selectedId:options.some(o=>o.id===d.selectedId)?d.selectedId:options[0].id,locked:!!d.locked};
 });
 const concepts=(Array.isArray(raw.concepts)?raw.concepts:[]).slice(0,100).filter(c=>c&&Array.isArray(c.ingredients)).map(c=>({id:id(c.id),ingredients:c.ingredients.slice(0,8).map(i=>({dimension:text(i?.dimension,80),label:text(i?.label,120)})),title:text(c.title,160),mechanism:text(c.mechanism),useful:text(c.useful),assumption:text(c.assumption),experiment:text(c.experiment),createdAt:text(c.createdAt,40)}));
 return{id:id(raw.id),title:text(raw.title,160)||'Imported workspace',problem:text(raw.problem),dimensions,concepts,activeConceptId:concepts.some(c=>c.id===raw.activeConceptId)?raw.activeConceptId:concepts[0]?.id??null,history:[],mixCount:Number.isFinite(raw.mixCount)?Math.max(0,raw.mixCount):0};
}
