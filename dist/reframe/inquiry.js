import{make,validate,apply,question,FIELDS,TYPES}from'../questions/state.js?v=0.7.0';
import{validateSession,parse}from'../creative-kit/state.js?v=0.7.0';
export{TYPES,FIELDS};
const copy=v=>structuredClone(v);
export const QUESTION_STORAGE='thinking-lab:questions:v1';
export function blankInquiry(id='questions'){return{id,problem:'',items:[],selected:[],phase:'expand',links:[]};}
export function exampleInquiry(id,frames){const w=make(id);w.links=w.items.slice(0,3).map((q,i)=>({questionId:q.id,frameId:frames[i].id,relation:'opens'}));return w;}
export function normalizeInquiry(source,frames){
  const w=source?copy(source):blankInquiry();validate(w);
  if(!Array.isArray(w.links))w.links=[];
  if(w.links.length>140)throw Error('Too many question connections.');
  const seen=new Set();for(const link of w.links){if(!w.items.some(q=>q.id===link.questionId)||!frames.some(f=>f.id===link.frameId)||!['opens','challenges'].includes(link.relation))throw Error('A question connection is inconsistent.');const key=JSON.stringify([link.questionId,link.frameId]);if(seen.has(key))throw Error('Duplicate question connection.');seen.add(key);}
  return w;
}
export function changeInquiry(w,a,frames){
  const next=copy(w);
  if(a.type==='link'){
    next.links=next.links.filter(l=>!(l.questionId===a.questionId&&l.frameId===a.frameId));
    if(a.relation!=='none')next.links.push({questionId:a.questionId,frameId:a.frameId,relation:a.relation});
  }else if(a.type==='branch'){
    const parent=next.items.find(q=>q.id===a.parent);if(!parent)throw Error('Choose a source question.');
    if(!['expand','invert'].includes(a.relation))throw Error('Choose a question branch.');
    // A question need not contain a proposition that can be inverted. Preserve
    // its source and ask for a new question instead of manufacturing an opposite.
    next.items.push({...question(a.id,parent.type),parent:parent.id,relation:a.relation});next.phase='expand';
  }else{apply(next,a);if(a.type==='remove')next.links=next.links.filter(l=>l.questionId!==a.id);}
  return normalizeInquiry(next,frames);
}
export function remapInquiry(w,frameIds,prefix){
  const qids=new Map(w.items.map((q,i)=>[q.id,`${prefix}-q${i+1}`]));
  return{...copy(w),id:`${prefix}-questions`,items:w.items.map(q=>({...copy(q),id:qids.get(q.id),parent:q.parent?qids.get(q.parent):null})),selected:w.selected.map(id=>qids.get(id)),links:w.links.map(l=>({...l,questionId:qids.get(l.questionId),frameId:frameIds.get(l.frameId)}))};
}
export function readQuestionWorkspaces(raw){
  const data=validateSession(JSON.parse(raw),validate);return data.workspaces;
}
export function parseQuestions(raw){return parse(raw,'questions',validate);}
