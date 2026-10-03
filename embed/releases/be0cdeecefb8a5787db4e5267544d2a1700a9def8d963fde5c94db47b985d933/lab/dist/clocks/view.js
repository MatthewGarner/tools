import {LANES,SCENARIOS,scheduled,simulate,needAt,format} from './model.js';
import {canvas,text,e,wrap} from '../../../embed/definitions/_lab.js';
export function render(s,ctx={}){const r=simulate(s),summary=`${r.matches} actions match the need, ${r.outdated} use an outdated need, ${r.unused} delivery slots unused. ${r.attentionUsed} of ${s.attention} attention used.`;
const svg=canvas('The organisation’s clocks',summary+'\n'+SCENARIOS[s.scenario].detail,ctx,({w,c,top})=>{
let body='',y=top;const weeks=w<650?4:2,days=28/weeks,cw=(w-48)/days;
for(let block=0;block<weeks;block++){
body+=text(24,y,`Days ${block*days+1}–${(block+1)*days}`,{size:18,weight:700,width:35});y+=30;
for(let day=block*days+1;day<=(block+1)*days;day++){const x=24+(day-block*days-1)*cw;body+=text(x+3,y,`${day}`,{size:14,color:c.muted})+text(x+3,y+24,needAt(s,day),{size:16,weight:700});}
y+=52;
for(const lane of LANES){body+=text(24,y,lane.name,{size:16,weight:600,width:35});y+=24;for(let day=block*days+1;day<=(block+1)*days;day++){const x=24+(day-block*days-1)*cw,t=r.trace.find(t=>t.day===day&&t.lane===lane.id);body+=`<path d="M${x} ${y+12} H${x+cw}" stroke="${e(c.line)}"/>`;if(scheduled(s.clocks[lane.id]).includes(day)){body+=`<rect x="${x+3}" y="${y-3}" width="${cw-6}" height="28" fill="${e(c.paper)}" stroke="${e(c.accent)}"/>`+text(x+cw/2-5,y+17,t.status==='skipped'?'×':t.status==='waiting'?'–':lane.id==='delivery'?(t.status==='matched'?'✓':'!'):'●',{size:18,color:c.accent});}}y+=43;}y+=18;}
for(const line of [`Mean evidence age at action: ${format(r.averageAge)} days. × skipped review · – waiting · ✓ matches · ! outdated.`,'Same-day order: discovery → review → funding → delivery. A/B are fictional changing needs. Counts are action slots, not value.']){body+=text(24,y,line,{size:16,width:Math.floor((w-48)/8),color:c.muted});y+=wrap(line,Math.floor((w-48)/8)).length*23+12;}return{body,end:y};});return{svg,summary};}
