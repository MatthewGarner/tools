import {canvas,text,e,wrap} from '../../../embed/definitions/_lab.js';
import {project,labels,layerNames,valueText,summary} from './model.js';
export function renderArticle(state,ctx={}){
 const r=project(state),svg=canvas('What survived the status update?',`${r.decision.choice.toUpperCase()} from the brief · ${r.full.choice.toUpperCase()} with all facts`,ctx,({w,c,top})=>{
  const cols=w<650?1:3,gap=24,cw=(w-48-(cols-1)*gap)/cols;let y=top,body='';
  for(let i=0;i<3;i++){
   const l=r.layers[i],x=24+(i%cols)*(cw+gap),chars=Math.max(20,Math.floor(cw/9));let yy=y;
   body+=text(x,yy,`${i+1}. ${layerNames[i]}`,{size:19,weight:700,width:chars});yy+=wrap(`${i+1}. ${layerNames[i]}`,chars).length*27;
   body+=text(x,yy,`${l.used}/${state.capacities[i]} attention units`,{size:15,color:c.muted,width:chars});yy+=36;
   body+=`<path d="M${x} ${yy-24} H${x+cw}" stroke="${e(c.accent)}" stroke-width="3"/>`;
   for(const id of l.carried){const value=`${labels[id]}: ${valueText(id,state.facts[id])}`;body+=text(x,yy,value,{size:17,width:chars});yy+=wrap(value,chars).length*25+13;}
   if(!l.carried.length){body+=text(x,yy,'No facts carried',{size:17,width:chars});yy+=38;}
   const lost=`Drops: ${l.dropped.map(id=>labels[id]).join(', ')||'none'}`;body+=text(x,yy+8,lost,{size:15,color:c.muted,width:chars});yy+=wrap(lost,chars).length*22+36;
   if(cols===1)y=yy+22;else if(i===2)y=top+Math.max(...r.layers.map(layer=>70+layer.carried.reduce((n,id)=>n+wrap(`${labels[id]}: ${valueText(id,state.facts[id])}`,chars).length*25+13,0)+wrap(`Drops: ${layer.dropped.map(id=>labels[id]).join(', ')||'none'}`,chars).length*22+65));
  }
  const chars=Math.floor((w-48)/9),retrieval=`Source retrieval: ${r.retrieved.map(id=>labels[id]).join(', ')||'none'} (${r.queryTime} ticks).`;
  for(const value of [retrieval,...r.decision.reasons,`Same rule with all facts: ${r.full.choice}. ${r.differs?'Information changes this decision.':'The decision survives this reporting chain.'}`]){body+=text(24,y,value,{size:17,width:chars});y+=wrap(value,chars).length*25+18;}
  const foot='Facts are selected whole, in priority order, while they fit. The full-information result is a comparison under this explicit rule, not ground truth.';
  body+=text(24,y,foot,{size:15,width:Math.floor((w-48)/8),color:c.muted});return {body,end:y+wrap(foot,Math.floor((w-48)/8)).length*22};
 });return {svg,summary:summary(state,r)};
}
