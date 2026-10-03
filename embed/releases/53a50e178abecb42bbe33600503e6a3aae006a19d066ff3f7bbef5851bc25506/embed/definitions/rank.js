import {simulate,verdictCopy,perRowKnife} from '../../rank/engine.js';
import {rankResultRows} from '../../rank/render.js';
import {EXAMPLES,DEFAULT_CRITERIA,DEFAULT_EFFORT} from '../../rank/examples.js';
import {base,object,text,num,int,array,tuple,range,esc,htmlStyle} from './classic-shared.js';
const native = s => ({criteria:s.c.map(([name,w])=>({name,w})),effort:{name:s.e[0],w:s.e[1]},items:s.i.map(r=>({name:r[0],s:r.slice(1,-1),e:r.at(-1)})),k:s.k,ww:s.w,sw:s.s});
export const definition = base('rank','Rank','See which priorities survive uncertainty in scores and weights.',
  {c:DEFAULT_CRITERIA.map(c=>[c.name,c.w]),e:[DEFAULT_EFFORT.name,DEFAULT_EFFORT.w],i:EXAMPLES[0].items,k:3,w:50,s:1},
  object({c:array(tuple([text(80,1),num(0,20)]),3,3),e:tuple([text(80,1),num(0,20)]),i:array(tuple([text(100,1),num(1,10),num(1,10),num(1,10),num(1,10)]),3,12),k:int(1,12),w:num(0,200),s:num(0,5)}),
  {value:range('First criterion weight',['c',0,1],0,10,.5),time:range('Second criterion weight',['c',1,1],0,10,.5),risk:range('Third criterion weight',['c',2,1],0,10,.5),wobble:range('Weight uncertainty, ±%',['w'],0,200,5),scores:range('Score uncertainty, ±points',['s'],0,5,.5)},
  {ranking:{title:'Priority stability',description:'Native ranked rows with 90% rank intervals and top-k inclusion.',controls:['value','time','risk','wobble','scores'],render(s){
    const model=native(s),r=simulate(model),v=verdictCopy(r.stats,r.k),summary=v.headline+' '+v.body.trim()+' Illustrative uncertainty in stated scores and weights.';
    return {summary,html:htmlStyle+`<style>.rank-article .rrow{display:grid;grid-template-columns:24px 1fr;gap:8px;padding:14px 0;border-bottom:1px solid var(--border)}.rank-article .rankbar{display:grid;gap:2px;height:20px;grid-column:2}.rank-article .cell{background:var(--border)}.rank-article .cell.in{background:var(--muted)}.rank-article .cell.med{background:var(--accent)}.rank-article .ptop{grid-column:2}.rank-article .knifepill{display:none;font-size:12px;margin-left:8px}.rank-article .knife .knifepill{display:inline}</style><section class="embed-classic rank-article"><h2>${esc(v.headline)}</h2><p class="note">Bars show median and 90% rank range across 4,000 simulations.</p>${rankResultRows(r,perRowKnife(model))}<p class="note">${esc(v.body)}</p></section>`};
  }}},s=>{if(s.k>s.i.length)throw Error('Capacity cannot exceed the number of initiatives.');if(s.c.some(r=>typeof r[0]!=='string'||typeof r[1]!=='number')||s.i.some(r=>typeof r[0]!=='string'||r.slice(1).some(x=>typeof x!=='number'))||typeof s.e[0]!=='string'||typeof s.e[1]!=='number')throw Error('Invalid named score/weight row.');});

definition.views['ranking'].defaultControls=['value', 'wobble'];
