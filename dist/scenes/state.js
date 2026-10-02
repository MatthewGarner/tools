import {text,list,identifiers,choice} from '../creative-kit/state.js?v=0.18.0';
import {MOMENT_FIELDS,IDEA_FIELDS,FITS} from './definitions.js?v=0.18.0';
import {upgrade,upgradeIdea,validateVariants,applyVariant,currentScene,reviewSnapshot,variantsMarkdown} from './variants.js?v=0.18.0';
import {hasDescendants} from '../shared/ancestry.js?v=0.18.0';
export {MOMENT_FIELDS,IDEA_FIELDS};
export const moment=id=>({id,title:'New moment',actor:'',trigger:'',knows:'',unknown:'',can:'',stakes:''});
export const idea=(id,momentId=null)=>upgradeIdea({id,momentId,title:'New intervention',action:'',assumption:'',test:'',stale:false});
export function make(id='first',example='example'){
 const w={id,problem:example==='blank'?'':'A trader loses a live feed before committing a battery.',moments:[moment('m1')],ideas:[],selectedId:'m1'};
 if(example!=='blank'){
 w.moments=[{id:'m1',title:'The signal disappears',actor:'Trader',trigger:'A live price feed stops updating.',knows:'The last value and its timestamp.',unknown:'Whether the market changed or the feed is late.',can:'Wait, consult another source, or escalate.',stakes:'Acting on stale information; missing a useful window.'},{id:'m2',title:'A choice is due',actor:'Trader and operations engineer',trigger:'The decision window is about to close.',knows:'State of charge, existing commitments and feed age.',unknown:'The next price and how long the outage will last.',can:'Keep headroom, use a bounded fallback, or decline.',stakes:'An attractive choice may use capacity needed later.'},{id:'m3',title:'The feed returns',actor:'Operations engineer',trigger:'New observations arrive.',knows:'What actually happened during the gap.',unknown:'Whether the fallback will work next time.',can:'Compare the action with the agreed envelope.',stakes:'Learning can become blame if the uncertainty is forgotten.'}];
 w.ideas=[{id:'i1',momentId:'m1',title:'Make age impossible to miss',action:'Show how long the value has been unchanged beside the decision.',assumption:'Feed age changes whether the trader trusts the signal.',test:'Replay three outage scenes with and without an age indicator.',stale:false},{id:'i2',momentId:null,title:'Rehearse the fallback',action:'Try the decision envelope before a real outage.',assumption:'Practice makes a bounded response available under pressure.',test:'Run a five-minute rehearsal and observe where people hesitate.',stale:false}];}
 return upgrade(w);
}
function validateScene(w){list(w.moments,8);list(w.ideas,24);if(!w.moments.length)throw Error('Keep at least one moment.');identifiers(w.moments);identifiers(w.ideas);w.moments.forEach(m=>MOMENT_FIELDS.forEach(f=>text(m[f])));if(!w.moments.some(m=>m.id===w.selectedId))throw Error('Select an existing moment.');for(const i of w.ideas){IDEA_FIELDS.forEach(f=>text(i[f]));if(i.momentId!==null&&!w.moments.some(m=>m.id===i.momentId))throw Error('Intervention points to a missing moment.');if(typeof i.stale!=='boolean')throw Error('Invalid review state.');}return w;}
export function validate(w){upgrade(w);validateScene(w);validateVariants(w,validateScene);return w;}
export function apply(w,a){
 upgrade(w);
 if(a.type.startsWith('scene-')){applyVariant(w,a);return;}
 if(a.type==='edit'&&a.collection==='scene'){choice(a.field,['title','changed','reason']);w.scene[a.field]=text(a.value);}
 else if(a.type==='edit'&&a.collection==='decision')w.decision=text(a.value);
 else if(a.type==='edit'){const coll=choice(a.collection,['moments','ideas']),item=w[coll].find(i=>i.id===a.item);if(!item)throw Error('Item is missing.');choice(a.field,coll==='moments'?MOMENT_FIELDS:[...IDEA_FIELDS,'fit','fitReason','fitNeeds','changed','reason']);if(a.field==='fit')choice(a.value,Object.keys(FITS));item[a.field]=text(a.value);if(coll==='ideas'&&['action','assumption','fit'].includes(a.field))item.stale=true;if(coll==='moments')w.ideas.filter(i=>i.momentId===item.id).forEach(i=>i.stale=true);}
 else if(a.type==='select'){if(!w.moments.some(m=>m.id===a.id))throw Error('Moment is missing.');w.selectedId=a.id;}
 else if(a.type==='add-moment'){w.moments.push(moment(a.id));w.selectedId=a.id;}
 else if(a.type==='add-idea'){w.ideas.push(idea(a.id,a.momentId||null));if(w.compareIdeaIds.length<4)w.compareIdeaIds.push(a.id);}
 else if(a.type==='move-idea'){const i=w.ideas.find(i=>i.id===a.id);if(!i)throw Error('Intervention is missing.');if(a.momentId!==null&&!w.moments.some(m=>m.id===a.momentId))throw Error('Moment is missing.');if(i.momentId!==a.momentId)i.stale=true;i.momentId=a.momentId;}
 else if(a.type==='reorder'){const from=w.moments.findIndex(m=>m.id===a.id),to=w.moments.findIndex(m=>m.id===a.before);if(from<0||to<0)throw Error('Moment is missing.');if(from!==to){const [m]=w.moments.splice(from,1);w.moments.splice(to,0,m);w.ideas.forEach(i=>i.stale=true);}}
 else if(a.type==='remove-moment'){if(w.moments.length===1)throw Error('Keep one moment.');w.moments=w.moments.filter(m=>m.id!==a.id);w.ideas.filter(i=>i.momentId===a.id).forEach(i=>{i.momentId=null;i.stale=true;});if(w.selectedId===a.id)w.selectedId=w.moments[0].id;}
 else if(a.type==='remove-idea'){if(hasDescendants(w.ideas,a.id))throw Error('This intervention has branches. Keep it while they depend on it.');w.ideas=w.ideas.filter(i=>i.id!==a.id);const exists=w.variants.some(s=>s.ideas.some(i=>i.id===a.id));if(!exists)w.compareIdeaIds=w.compareIdeaIds.filter(id=>id!==a.id);if(w.chosenTest?.sceneId===w.scene.id&&w.chosenTest?.ideaId===a.id)w.chosenTest=null;}
 else if(a.type==='review'){const i=w.ideas.find(i=>i.id===a.id);if(!i)throw Error('Intervention is missing.');if(i.momentId===null)throw Error('Place the intervention in a moment before reviewing.');i.stale=false;i.checkedAgainst=reviewSnapshot(w,currentScene(w),i);}
 else throw Error('Unknown scene action.');
}
function sceneMarkdown(w){const out=['# Scene-first invention','',w.problem,''];for(const [index,m]of w.moments.entries()){out.push(`## ${index+1}. ${m.title}`,'',...MOMENT_FIELDS.slice(1).flatMap(f=>[`**${f}**`,m[f]||'_Not written._','']));for(const i of w.ideas.filter(i=>i.momentId===m.id))out.push(`### ${i.title}${i.stale?' · revisit after scene change':''}`,'',...IDEA_FIELDS.slice(1).flatMap(f=>[`**${f}**`,i[f]||'_Not written._','']));}out.push('## Not placed in the scene','');w.ideas.filter(i=>i.momentId===null).forEach(i=>out.push(`### ${i.title}`,'',...IDEA_FIELDS.slice(1).flatMap(f=>[`**${f}**`,i[f], ''])));return out.join('\n');}

export function markdown(w){return sceneMarkdown(w)+'\n\n'+variantsMarkdown(w,sceneMarkdown);}
