import {captureConcept,uid} from './model.js?v=0.16.0';
import {sourceSnapshot,derivedFrom,hasDescendants} from '../shared/ancestry.js?v=0.16.0';
import {sourceDetails,familyMap,parentChoices} from '../shared/ancestry-ui.js?v=0.16.0';
import {escapeHtml as e} from '../shared/utils.js?v=0.16.0';
export function snapshot(w,c){
 const fields=[{label:'Problem at creation',text:w.problem},...['mechanism','useful','assumption','experiment','fit','changed','reason'].map(f=>({label:f,text:c[f]})),...c.ingredients.flatMap(i=>[{label:'Original dimension',text:i.dimension},{label:'Original ingredient',text:i.label}]),...w.dimensions.flatMap(d=>[{label:'Mapped dimension',text:d.name},{label:'Placement',text:d.options.find(o=>o.id===c.placement[d.id])?.label??'Unplaced'}])];
 if(c.origin)fields.push(...c.origin.ingredients.flatMap(i=>[{label:'Gap dimension at capture',text:i.dimension},{label:'Gap ingredient at capture',text:i.label}]),{label:'Gap reading at capture',text:c.origin.verdict},{label:'Gap reasoning at capture',text:c.origin.reason});
 return sourceSnapshot(c.id,c.title,fields);
}
export function derive(w,parents,id=uid()){
 if(!Array.isArray(parents)||parents.length<1||parents.length>2||new Set(parents).size!==parents.length)throw Error('Choose one parent to branch or two different parents to combine.');
 const sources=parents.map(id=>w.concepts.find(c=>c.id===id));if(sources.some(c=>!c))throw Error('Choose existing concepts.');
 const c=parents.length===1?structuredClone(sources[0]):{...captureConcept(w),ingredients:[],placement:{},title:'A combination to develop'};
 c.id=id;c.createdAt=new Date().toISOString();if(parents.length===1)c.title+=' · variation';c.ancestry=derivedFrom(sources.map(c=>snapshot(w,c)));c.changed='';c.reason='';w.concepts.push(c);w.activeConceptId=c.id;return c;
}
export function ancestryTools(w){return w.concepts.length?`<div class="ancestry-toolbar"><button class="btn" data-lineage-action="trace">Trace branches</button><button class="btn" data-lineage-action="combine" ${w.concepts.length<2?'disabled':''}>Combine two concepts</button></div>`:'';}
export function ancestryEditor(c){return `${c.ancestry.parents.length?`<div class="writing-grid branch-reason"><label>What changes from the parent?<textarea data-field="changed" maxlength="20000" placeholder="Name the ingredient or mechanism you want to change.">${e(c.changed)}</textarea></label><label>Why make that change?<textarea data-field="reason" maxlength="20000" placeholder="What possibility does this open, or assumption does it challenge?">${e(c.reason)}</textarea></label></div>${sourceDetails(c.ancestry)}`:''}<div class="ancestry-toolbar"><button class="btn" data-lineage-action="branch" data-id="${e(c.id)}">Branch this concept</button><button class="btn quiet" data-lineage-action="park" data-id="${e(c.id)}">${c.ancestry.parked?'Revive':'Park'} concept</button></div>`;}
export function wireAncestry({app,dialog,current,change,openDialog,render,toast}){
 const develop=()=>{document.querySelector('.concept-editor')?.scrollIntoView({behavior:'smooth',block:'start'});document.querySelector('#concept-title')?.focus({preventScroll:true});};
 // The dialog restores its opener on close; opening a selected/new concept must
 // happen after that event so keyboard focus reaches the actual working field.
 const closeAndDevelop=()=>{dialog.addEventListener('close',()=>{render();develop();},{once:true});dialog.close();};
 document.addEventListener('click',event=>{const b=event.target.closest('[data-lineage-action]');if(!b||b.disabled)return;const id=b.dataset.id,w=current();try{
  if(b.dataset.lineageAction==='branch'){change(w=>derive(w,[id]));develop();}
  else if(b.dataset.lineageAction==='park'){change(w=>{const c=w.concepts.find(c=>c.id===id);c.ancestry.parked=!c.ancestry.parked;});toast('Status saved. Parked concepts stay in the collection and its history.');}
  else if(b.dataset.lineageAction==='develop'){w.activeConceptId=id;closeAndDevelop();}
  else if(b.dataset.lineageAction==='trace')openDialog(`<h2>How the concepts developed</h2>${familyMap(w.concepts,{attribute:'data-lineage-action'})}<div class="actions"><button class="btn" data-action="close">Done</button></div>`);
  else if(b.dataset.lineageAction==='combine'){
   openDialog(`<h2>Combine two concepts</h2><form id="combine-form">${parentChoices(w.concepts)}<p class="combine-error" role="status"></p><div class="actions"><button class="btn primary" type="submit">Create combined concept</button><button type="button" class="btn" data-action="close">Cancel</button></div></form>`);
   dialog.querySelector('form').onsubmit=event=>{event.preventDefault();const f=event.currentTarget;try{change(w=>derive(w,[f.elements['parent-a'].value,f.elements['parent-b'].value]));closeAndDevelop();}catch(error){f.querySelector('.combine-error').textContent=error.message;}};
  }
 }catch(error){toast(error.message);}});
}
