import {text,parse,validateSession} from '../creative-kit/state.js?v=0.7.0';
import {make,design,validate} from './state.js?v=0.7.0';
import {validate as answersValidate} from '../answers/state.js?v=0.7.0';
import {validate as disagreementValidate} from '../disagreement/state.js?v=0.7.0';
const clone=x=>structuredClone(x);
export const validators={answers:answersValidate,disagreement:disagreementValidate};
export function migrate(kind,source){
  if(!validators[kind])throw Error('Choose work from Three Answers or Disagreement.');
  const original=clone(source);text(original.id);text(original.problem);validators[kind](original);
  const w=make(original.id,'blank');w.problem=original.problem;w.source={kind,workspace:clone(original)};
  if(kind==='answers'){
    w.entry='generate';w.view=original.phase==='compare'?'compare':'build';
    w.designs=Object.entries(original.answers).map(([key,a])=>({...design(`answer-${key}`,{a:'first',b:'refine',q:'different'}[key]),title:a.title,mechanism:a.mechanism,benefit:a.strength,cost:a.weakness,difference:a.difference,assessment:a.assessment,borrowed:a.borrowed.map(b=>({from:`answer-${b.from}`,title:original.answers[b.from].title,text:b.text,stale:b.stale})),stale:a.borrowed.some(b=>b.stale)}));
    w.criteria=original.criteria;w.test=original.test;w.learn=original.learn;w.selected=original.chosen?`answer-${original.chosen}`:null;
  }else{
    w.entry='reconcile';w.sides=clone(original.sides);
    w.designs=original.plans.map(p=>({...design(p.id,p.route),...Object.fromEntries(['title','mechanism','boundary','cost','test','learn','stale'].map(f=>[f,p[f]])),protects:clone(p.protects)}));w.selected=original.selected;
  }
  w.comparison=w.designs.slice(0,4).map(d=>d.id);return validate(w);
}
export function parseImport(raw){
  if(typeof raw!=='string'||raw.length>8000000)throw Error('Choose an export under 8 MB.');
  let file;try{file=JSON.parse(raw);}catch{throw Error('That file is not valid JSON.');}
  if(file.kind==='objections')return parse(raw,'objections',validate);
  if(!validators[file.kind])throw Error('Choose an Alternatives, Objections, Three Answers or Disagreement export.');
  return migrate(file.kind,parse(raw,file.kind,validators[file.kind]));
}
export function legacySession(kind,raw){if(!validators[kind])throw Error('Unknown source.');return validateSession(JSON.parse(raw),validators[kind]);}
