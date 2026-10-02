import {validate as validateTerritory,markdown as territoryMarkdown} from '../territory/state.js?v=0.8.0';
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
  const w={id:uid(),schema:2,title:p.name,problem:p.problem,dimensions:p.axes.map(([name,...options])=>{const opts=options.map(label=>({id:uid(),label}));return{id:uid(),name,options:opts,selectedId:opts[0].id,locked:false};}),concepts:[],activeConceptId:null,history:[],mixCount:0,view:'generate',source:null};
  w.map=defaultMap(w);return w;
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
export function defaultMap(w){const row=w.dimensions[0],column=w.dimensions[Math.min(3,w.dimensions.length-1)];return{rowId:row.id,columnId:column.id,row:row.selectedId,column:column.selectedId,notes:{}};}
export function captureConcept(w){return{id:uid(),ingredients:ingredients(w),title:'',mechanism:'',useful:'',assumption:'',experiment:'',createdAt:new Date().toISOString(),placement:Object.fromEntries(w.dimensions.map(d=>[d.id,d.selectedId])),fit:'',fitNeedsReview:false,origin:null};}
const fields=['title','mechanism','useful','assumption','experiment','fit'];
const text=(v,max=20000)=>{if(typeof v!=='string'||v.length>max)throw Error(`Text must be at most ${max.toLocaleString()} characters.`);return v;};
const list=(v,max)=>{if(!Array.isArray(v)||v.length>max)throw Error(`Keep at most ${max} items.`);return v;};
const object=v=>{if(!v||typeof v!=='object'||Array.isArray(v))throw Error('Missing workspace information.');return v;};
const safeId=v=>typeof v==='string'&&/^[-_a-zA-Z0-9]{1,100}$/.test(v)&&!['__proto__','constructor','prototype'].includes(v);
const choice=(v,values)=>{if(!values.includes(v))throw Error('Unknown choice.');return v;};
function snapshot(value){list(value,8).forEach(i=>{text(i.dimension);text(i.label);});}

function upgrade(raw){
 // Older Mixer captures have labels, not coordinate IDs. Only exact, unique
 // matches may acquire a location; renamed or ambiguous ingredients stay unplaced.
 object(raw);const ids=new Set();
 const id=v=>{const n=safeId(v)&&!ids.has(v)?v:uid();ids.add(n);return n;};
 const dimensions=list(raw.dimensions,8).map(d=>{object(d);const options=list(d.options,12).map(o=>({id:id(o.id),label:text(o.label)}));return{id:id(d.id),name:text(d.name),options,selectedId:options.find((o,i)=>d.options[i].id===d.selectedId)?.id??options[0]?.id,locked:!!d.locked};});
 const concepts=list(raw.concepts??[],100).map(c=>{
  object(c);snapshot(c.ingredients);const placement={};
  for(const d of dimensions){const matches=c.ingredients.filter(i=>i.dimension===d.name),sameNames=dimensions.filter(x=>x.name===d.name);const options=matches.length===1?d.options.filter(o=>o.label===matches[0].label):[];if(sameNames.length===1&&options.length===1)placement[d.id]=options[0].id;}
  return{id:id(c.id),ingredients:structuredClone(c.ingredients),title:text(c.title??''),mechanism:text(c.mechanism??''),useful:text(c.useful??''),assumption:text(c.assumption??''),experiment:text(c.experiment??''),createdAt:text(c.createdAt??'',40),placement,fit:'',fitNeedsReview:false,origin:null};
 });
 const w={id:id(raw.id),schema:2,title:text(raw.title??'Imported workspace'),problem:text(raw.problem??''),dimensions,concepts,activeConceptId:concepts.find((c,i)=>raw.concepts[i].id===raw.activeConceptId)?.id??concepts[0]?.id??null,history:[],mixCount:Number.isFinite(raw.mixCount)?Math.max(0,raw.mixCount):0,view:'generate',source:null};
 if(dimensions.length<2)throw Error('A workspace needs 2–8 dimensions.');w.map=defaultMap(w);return w;
}

export function validateWorkspace(raw){
 object(raw);if(raw.schema!==undefined&&raw.schema!==2)throw Error('Unknown workspace format.');
 const w=raw.schema===2?structuredClone(raw):upgrade(raw),ids=new Set();
 const id=v=>{if(!safeId(v)||ids.has(v))throw Error('Items need unique, safe identifiers.');ids.add(v);};
 id(w.id);text(w.title);text(w.problem);choice(w.view,['generate','map']);
 list(w.dimensions,8);if(w.dimensions.length<2)throw Error('A workspace needs 2–8 dimensions.');
 for(const d of w.dimensions){id(d.id);text(d.name);list(d.options,12);if(!d.options.length)throw Error('Keep at least one option per dimension.');d.options.forEach(o=>{id(o.id);text(o.label);});choice(d.selectedId,d.options.map(o=>o.id));if(typeof d.locked!=='boolean')throw Error('Invalid ingredient lock.');}
 const dimension=v=>{const d=w.dimensions.find(d=>d.id===v);if(!d)throw Error('A map dimension is missing.');return d;};
 const coordinate=x=>{object(x);choice(x.optionId,dimension(x.dimensionId).options.map(o=>o.id));};
 list(w.concepts,100);for(const c of w.concepts){id(c.id);snapshot(c.ingredients);fields.forEach(f=>text(c[f]));text(c.createdAt,40);if(typeof c.fitNeedsReview!=='boolean')throw Error('Invalid fit status.');object(c.placement);for(const [dimensionId,optionId]of Object.entries(c.placement)){const d=dimension(dimensionId);if(optionId!==null)choice(optionId,d.options.map(o=>o.id));}if(c.origin!==null){object(c.origin);choice(c.origin.kind,['gap']);snapshot(c.origin.ingredients);choice(c.origin.verdict,['open','try','reason']);text(c.origin.reason);}}
 choice(w.activeConceptId,[null,...w.concepts.map(c=>c.id)]);object(w.map);const r=dimension(w.map.rowId),c=dimension(w.map.columnId);if(r.id===c.id)throw Error('Choose two different map dimensions.');choice(w.map.row,r.options.map(o=>o.id));choice(w.map.column,c.options.map(o=>o.id));object(w.map.notes);
 if(Object.keys(w.map.notes).length>4032)throw Error('Too many gap notes.');
 for(const [key,g]of Object.entries(w.map.notes)){object(g);list(g.coordinates,2);if(g.coordinates.length!==2||g.coordinates[0].dimensionId===g.coordinates[1].dimensionId)throw Error('A gap needs two dimensions.');g.coordinates.forEach(coordinate);if(key!==g.coordinates.map(x=>`${x.dimensionId}:${x.optionId}`).sort().join('|'))throw Error('Gap coordinates do not match.');choice(g.verdict,['open','try','reason']);text(g.reason);}
 list(w.history,200).forEach(h=>text(h,1000));if(!Number.isFinite(w.mixCount)||w.mixCount<0)throw Error('Invalid mix count.');
 if(w.source!==null){object(w.source);choice(w.source.kind,['territory']);text(w.source.workspace?.id);text(w.source.workspace?.problem);validateTerritory(w.source.workspace);}
 return w;
}

export function markdown(w){
 const labels=items=>items.map(i=>`- **${i.dimension}:** ${i.label}`).join('\n');
 const coords=c=>Object.entries(c.placement).map(([dId,oId])=>{const d=w.dimensions.find(d=>d.id===dId);return{dimension:d.name,label:d.options.find(o=>o.id===oId)?.label??'Unplaced'};});
 const gapLabels=g=>g.coordinates.map(c=>{const d=w.dimensions.find(d=>d.id===c.dimensionId);return{dimension:d.name,label:d.options.find(o=>o.id===c.optionId).label};});
 const status={open:'Unexamined',try:'Possibly overlooked',reason:'Empty for a reason'};
 return [`# ${w.title||'Possibility space'}`,w.problem||'(Problem not written yet)','## Current combination',labels(ingredients(w)),'## Possibility space',w.dimensions.map(d=>`- **${d.name}:** ${d.options.map(o=>o.label).join(' · ')}`).join('\n'),...w.concepts.flatMap((c,i)=>[`## ${i+1}. ${c.title||'Untitled concept'}`,'### Original ingredients',labels(c.ingredients)||'No original classification.',...fields.slice(1,5).map(f=>`**${{mechanism:'How it works',useful:'Why it could help',assumption:'Assumption to challenge',experiment:'Smallest experiment'}[f]}:** ${c[f]||'—'}`),'### Current map placement',labels(coords(c))||'Unplaced',`**Fit:** ${c.fit||'—'}${c.fitNeedsReview?' (Needs review after classification changed.)':''}`,...(c.origin?[`### Gap that prompted this concept`,labels(c.origin.ingredients),status[c.origin.verdict],c.origin.reason||'No reason recorded at capture.']:[])]),'## Examined spaces',...Object.values(w.map.notes).flatMap(g=>[labels(gapLabels(g)),status[g.verdict],g.reason||'—']),...(w.source?['## Original Territory workspace · unchanged source',territoryMarkdown(w.source.workspace)]:[]),'---','Created in Thinking Lab · Possibility mixer. Counts describe combinations and coverage, not opportunity quality.'].join('\n\n')+'\n';
}
