/* Pure Wardley layout. Authored evolution x is immutable: density changes
   card treatment and vertical allocation only. */
import {wrapText} from '../assets/svg.js';

const ROW_GAP = 92;
const CARD_GAP = 12;
const AXIS_CLEAR = 74;
const SANS = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif";
const fallbackMeasure = text => String(text).length * 7;

function optionsOf(options){
  /* Backwards-compatible geometry form for old embeds while every production
     caller uses {measure,intent,geom}. */
  if(options && ('w' in options || 'pad' in options) && !options.geom && !options.measure && !options.intent)
    return {measure:fallbackMeasure,intent:'native',geom:options};
  return {measure:options?.measure || fallbackMeasure,intent:options?.intent || 'native',
    geom:options?.geom || {w:1200,pad:56,rowGap:ROW_GAP}};
}
function overlaps(a,b){
  return a.cardX < b.cardX+b.cardW+CARD_GAP && a.cardX+a.cardW+CARD_GAP > b.cardX;
}
function sourceCmp(a,b){ return a.srcLine-b.srcLine || a.name.localeCompare(b.name); }

export function layoutMap(model, options = {}){
  const {measure,intent,geom}=optionsOf(options),w=geom.w||1200,pad=geom.pad??56,rowGap=geom.rowGap||ROW_GAP;
  const px=x=>pad+x*(w-2*pad);
  const names=new Map(),anchorKeys=new Set(model.anchors.map(a=>a.name.toLowerCase()));
  model.anchors.forEach(a=>names.set(a.name.toLowerCase(),a.name));
  model.components.forEach((c,k)=>names.set(k,c.name));

  const out=new Map([...names.keys()].map(k=>[k,[]]));
  model.edges.forEach(edge=>out.get(edge.from)?.push(edge));
  const colour=new Map(),dropped=new Set();
  function dfs(key){
    colour.set(key,1);
    for(const edge of out.get(key)||[]){
      const state=colour.get(edge.to)||0;
      if(state===1)dropped.add(edge); else if(state===0)dfs(edge.to);
    }
    colour.set(key,2);
  }
  for(const key of names.keys())if(!colour.get(key))dfs(key);
  const activeEdges=model.edges.filter(e=>!dropped.has(e));

  const depth=new Map();
  function depthOf(key){
    if(depth.has(key))return depth.get(key);
    if(anchorKeys.has(key)){depth.set(key,0);return 0;}
    const parents=activeEdges.filter(e=>e.to===key);
    const value=parents.length?1+Math.max(...parents.map(e=>anchorKeys.has(e.from)?0:depthOf(e.from))):1;
    depth.set(key,value);return value;
  }
  for(const key of names.keys())depthOf(key);
  const touched=new Set();model.edges.forEach(e=>{touched.add(e.from);touched.add(e.to);});
  const orphanKeys=[...model.components.keys()].filter(k=>!touched.has(k));
  const maxDepth=Math.max(0,...depth.values()),orphanRow=orphanKeys.length?maxDepth+1:null;
  orphanKeys.forEach(k=>depth.set(k,orphanRow));

  const orderedComponents=[...model.components.values()].sort(sourceCmp);
  const ids=new Map(orderedComponents.map((component,index)=>[component.name.toLowerCase(),'W'+String(index+1).padStart(2,'0')]));
  const density=orderedComponents.length<=10?'direct':orderedComponents.length<=16?'hybrid':'keyed';

  const nodes=new Map();
  for(const [key,component] of model.components){
    const id=ids.get(key),rawW=measure(component.name,'600 13px '+SANS)+26;
    const fullLines=wrapText(component.name,'600 13px '+SANS,184,measure);
    const useKey=density==='keyed'||fullLines.length>2||(density==='hybrid'&&rawW>156);
    const maxText=useKey?42:184;
    const lines=useKey?[id]:fullLines.slice(0,2);
    const cardW=useKey?46:Math.max(82,Math.min(210,Math.max(...lines.map(line=>measure(line,'600 13px '+SANS)))+26));
    const cardH=useKey?28:(lines.length>1?46:28);
    const authoredPx=component.x===null?pad+84:px(component.x);
    const cardX=Math.max(4,Math.min(w-cardW-4,authoredPx-cardW/2));
    nodes.set(key,{name:component.name,id,x:component.x,stage:component.stage,ghost:component.ghost,
      anchor:false,srcLine:component.srcLine,row:depth.get(key),px:authoredPx,y:0,
      cardX,cardW,cardH,lines,useKey,leaderX:cardX+cardW/2});
  }
  for(const anchor of model.anchors){
    const key=anchor.name.toLowerCase(),kids=activeEdges.filter(e=>e.from===key).map(e=>nodes.get(e.to)).filter(Boolean);
    const authoredPx=kids.length?kids.reduce((sum,node)=>sum+node.px,0)/kids.length:w/2;
    const lines=wrapText(anchor.name,'600 13px '+SANS,220,measure).slice(0,2);
    const cardW=Math.max(100,Math.min(246,Math.max(...lines.map(line=>measure(line,'600 13px '+SANS)))+26));
    nodes.set(key,{name:anchor.name,id:'A'+String(model.anchors.indexOf(anchor)+1).padStart(2,'0'),x:null,
      stage:null,ghost:false,anchor:true,srcLine:anchor.srcLine,row:0,px:authoredPx,y:0,
      cardX:Math.max(4,Math.min(w-cardW-4,authoredPx-cardW/2)),cardW,cardH:lines.length>1?46:28,
      lines,useKey:false,leaderX:authoredPx});
  }

  /* Allocate collision levels inside each dependency row, then let each row's
     real occupied height determine where the next begins. */
  const rowGroups=new Map();
  for(const node of nodes.values()){const list=rowGroups.get(node.row)||[];list.push(node);rowGroups.set(node.row,list);}
  let base=34;
  for(const row of [...rowGroups.keys()].sort((a,b)=>a-b)){
    const list=rowGroups.get(row).sort((a,b)=>a.px-b.px||sourceCmp(a,b)),levels=[];
    for(const node of list){
      let level=0;
      while((levels[level]||[]).some(other=>overlaps(node,other)))level++;
      (levels[level]||(levels[level]=[])).push(node);node.level=level;
    }
    const levelH=levels.map(level=>Math.max(...level.map(node=>node.cardH)));
    const offsets=[];let cursor=0;
    levelH.forEach(height=>{offsets.push(cursor);cursor+=height+CARD_GAP;});
    list.forEach(node=>{node.y=base+offsets[node.level]+node.cardH/2;});
    base+=Math.max(rowGap,cursor+26);
  }
  const axisY=base+22,planeH=axisY+AXIS_CLEAR;

  const links=model.edges.map(edge=>{
    const from=nodes.get(edge.from),to=nodes.get(edge.to),isDropped=dropped.has(edge);
    const y1=from.y+from.cardH/2,y2=to.y-to.cardH/2,bend=Math.min(54,Math.max(18,(y2-y1)/2));
    return {x1:from.px,y1:from.y,x2:to.px,y2:to.y,from:edge.from,to:edge.to,dropped:isDropped,
      fromNode:from,toNode:to,path:'M '+from.px+' '+y1+' C '+from.px+' '+(y1+bend)+', '+to.px+' '+(y2-bend)+', '+to.px+' '+y2};
  });

  const needs=new Map();activeEdges.forEach(edge=>needs.set(edge.to,(needs.get(edge.to)||0)+1));

  /* Deepest dependency spine, then in-degree, then source order. */
  const deepest=[...nodes.entries()].filter(([,node])=>!node.anchor)
    .sort((a,b)=>(depth.get(b[0])-depth.get(a[0]))||((needs.get(b[0])||0)-(needs.get(a[0])||0))||sourceCmp(a[1],b[1]))[0];
  const spine=[];
  if(deepest){
    let key=deepest[0];
    while(key){
      spine.unshift(nodes.get(key));
      const parents=activeEdges.filter(edge=>edge.to===key).map(edge=>edge.from);
      key=parents.sort((a,b)=>(depth.get(b)-depth.get(a))||((needs.get(b)||0)-(needs.get(a)||0))||
        sourceCmp(nodes.get(a),nodes.get(b)))[0];
    }
  }

  const keyEntries=orderedComponents.map(component=>{
    const node=nodes.get(component.name.toLowerCase());
    return {id:node.id,name:node.name,x:node.x,stage:node.stage,ghost:node.ghost,srcLine:node.srcLine,
      lines:wrapText(node.name,'600 12px '+SANS,380,measure)};
  });
  const loopCallouts=[...dropped].map((edge,index)=>{
    const link=links.find(item=>item.from===edge.from&&item.to===edge.to);
    return {id:'L'+String(index+1).padStart(2,'0'),from:names.get(edge.from),to:names.get(edge.to),
      x:(link.x1+link.x2)/2,y:(link.y1+link.y2)/2};
  });

  return {nodes:[...nodes.values()],links,rows:(orphanRow??maxDepth)+1,h:planeH,axisY,w,pad,intent,density,
    needs,droppedEdges:[...dropped].map(edge=>({from:names.get(edge.from),to:names.get(edge.to)})),
    loopCallouts,keyEntries:keyEntries.filter(entry=>nodes.get(entry.name.toLowerCase()).useKey),
    allKeyEntries:keyEntries,spine,orphans:orphanKeys.map(key=>names.get(key))};
}
