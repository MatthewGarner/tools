import {TASKS,DEMANDS,simulate} from './model.js';
import {columns} from '../../../embed/definitions/_lab.js';
export function render(s,ctx={}){const r=simulate(s);const summary=`${r.served.length} of ${DEMANDS[s.demand].wanted.length} needed services delivered; ${r.spent} of ${s.budget} effort used. ${r.reachable.length} further services reachable.`;
return{svg:columns('Making worthwhile work possible',summary+'\n'+DEMANDS[s.demand].name,[
{label:'Work in order',items:r.trace.map((t,i)=>({title:`${i+1}. ${t.name}`,detail:`${t.status} · ${t.cost} effort. ${t.reason}`}))},
{label:'Enabling conditions',items:r.landscape.filter(t=>t.kind==='enabler').map(t=>({title:t.name,detail:`${t.status} · needs ${t.needs.map(id=>TASKS.find(x=>x.id===id).name).join(' + ')||'no prerequisite'}`}))},
{label:'Possible services',items:r.landscape.filter(t=>t.kind==='delivery').map(t=>({title:t.name,detail:`${t.status}${t.wanted?' · needed now':''} · ${t.cost} effort${t.missing.length?' · needs '+t.missing.map(id=>TASKS.find(x=>x.id===id).name).join(' + '):''}`}))}
],ctx,'Tasks are indivisible. Blocked or unaffordable tasks are skipped without spending effort. Reachable does not mean affordable. These are distinct needs, not value or ROI.'),summary};}
