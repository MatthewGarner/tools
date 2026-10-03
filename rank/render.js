/* Shared pure result-row renderer; native table and article use identical ranks. */
import {esc} from '../assets/svg.js';
export const pctStr = p => p > .995 ? '>99%' : p < .005 ? '<1%' : Math.round(p*100)+'%';
export function rankResultRows(result, knife=[]){
  const {stats,baseOrder,n,k}=result;
  return baseOrder.map((idx,pos)=>{
    const s=stats.find(x=>x.i===idx);
    return `<div class="rrow${knife[s.i]?' knife':''}" data-item-idx="${s.i}"><div class="pos">${pos+1}</div><div class="nm"><span class="nmtext" title="${esc(s.name)}">${esc(s.name)}</span><span class="knifepill" title="This rank flips under a ±10% nudge of a single weight" aria-label="knife-edge: rank flips under a ±10% weight nudge">knife-edge</span></div><div class="rankbar" style="grid-template-columns:repeat(${n},1fr)" role="img" data-med="${s.med+1}" data-p10="${s.p10+1}" data-p90="${s.p90+1}" aria-label="${esc(s.name)}: median rank ${s.med+1}, 90% range ${s.p10+1} to ${s.p90+1}">${Array.from({length:n},(_,r)=>`<div class="cell${r>=s.p10&&r<=s.p90?' in':''}${r===s.med?' med':''}" title="Rank ${r+1}"></div>`).join('')}</div><div class="ptop">top-${k} <b>${esc(pctStr(s.ptop))}</b></div></div>`;
  }).join('');
}
