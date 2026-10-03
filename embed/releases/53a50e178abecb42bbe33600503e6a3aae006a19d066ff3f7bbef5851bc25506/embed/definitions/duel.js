import {nextPair,loops} from '../../duel/engine.js';
import {renderOrder} from '../../duel/render.js';
import {base,object,text,int,array,esc,htmlStyle} from './classic-shared.js';
const record=object({a:int(0,9),b:int(0,9),w:int(0,9)});
function pick(s,side){const pair=s.finished?null:nextPair(s.items.length,s.duels);if(!pair||s.duels.length>=45)return structuredClone(s);return {...structuredClone(s),duels:[...s.duels.map(d=>({...d})),{a:pair[0],b:pair[1],w:pair[side]}],finished:false};}
export const definition=base('duel','Duel','Make pairwise priorities and inspect the resulting order.',
 {q:'Which improvement should we ship first?',items:['Resume reading','Shared shelves','Offline books','Reading reminders'],duels:[],finished:false},object({q:text(180,1),items:array(text(100,1),3,10),duels:array(record,0,45),finished:{type:'boolean'}}),
 {first:{type:'action',label:'Choose contender 1',action:'first'},second:{type:'action',label:'Choose contender 2',action:'second'},undo:{type:'action',label:'Undo last choice',action:'undo'}},
 {order:{title:'Pairwise order',description:'Current pair and the native implied order after local choices.',controls:['first','second','undo'],render(s){const pair=s.finished?null:nextPair(s.items.length,s.duels),ls=loops(s.items.length,s.duels);return {html:htmlStyle+'<style>.embed-classic .orow{display:grid;grid-template-columns:2em 1fr;gap:4px;padding:12px;border-bottom:1px solid var(--border)}.embed-classic .statepill,.embed-classic .oscore{font-size:13px;color:var(--muted)}.embed-classic ol{padding:0;list-style:none}</style><section class="embed-classic"><p>'+esc(s.q)+'</p><p>'+(pair?'1: <strong>'+esc(s.items[pair[0]])+'</strong><br>2: <strong>'+esc(s.items[pair[1]])+'</strong>':'No further comparisons in this session.')+'</p>'+renderOrder(s)+'<p>'+ls.length+' preference loop'+(ls.length===1?'':'s')+'.</p></section>',summary:'Illustrative pairwise priorities: '+s.duels.length+' choices among '+s.items.length+' contenders; '+ls.length+' preference loops. The current order reflects these choices, not an objective score.'};}}},
 s=>{if(new Set(s.items).size!==s.items.length)throw new Error('Contender names must be distinct.');for(const d of s.duels)if(d.a>=s.items.length||d.b>=s.items.length||d.a===d.b||![d.a,d.b].includes(d.w))throw new Error('Invalid pairwise choice.');});
definition.actions={first:s=>pick(s,0),second:s=>pick(s,1),undo:s=>({...structuredClone(s),duels:s.duels.slice(0,-1).map(d=>({...d})),finished:false})};

definition.views['order'].defaultControls=['first', 'second', 'undo'];
