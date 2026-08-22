/* Fixed 16:9 Map plate. It is either complete at a projection-readable size or
   absent, so the export control can direct people to the exhaustive SVG. */
import {PALETTES, scheme} from '../assets/series.js';
import {esc} from '../assets/svg.js';
import {effectiveBoundaries, labelAnchors} from './zones.js';
import {layoutPlaced, measuredLines, sourceItems} from './layout.js';

const FONT = '-apple-system, BlinkMacSystemFont, Segoe UI, Roboto, sans-serif';
const DISPLAY = 'Helvetica, Arial, sans-serif';
const n = value => (Math.round(value * 100) / 100).toString();
const upper = value => String(value || '').toUpperCase();
const zoneInk = (zone,C) => zone.tone === 'bad' ? C.err : C.muted;
function colors(model,ctx){
  const hex=model.accent||(PALETTES[model.palette]?PALETTES[model.palette][ctx.dark?'dark':'light']:null);
  return hex?{...ctx.colors,...scheme(hex,!!ctx.dark)}:ctx.colors;
}
function marker(x,y,bad,C){return '<rect x="'+n(x-7)+'" y="'+n(y-7)+'" width="14" height="14" fill="'+(bad?C.err:C.ink)+'" transform="rotate(45 '+n(x)+' '+n(y)+')"/>';}
function block(text,font,width,measure){return measuredLines(text||'',font,width,measure);}

export function renderZoneAtlasPlate(model,resolved,ro,ctx={},diff=null){
  const measure=ctx.measure,C=colors(model,ctx),records=sourceItems(model,ro),flags=new Set(ro.flagged.map(f=>f.item.srcLine));
  const title=block(model.title||model.preset||'Map','700 44px '+DISPLAY,1170,measure);
  if(title.length>2||records.length>12)return null;
  for(const record of records)if(block(record.item.label,'650 18px '+FONT,470,measure).length>2)return null;
  const W=1920,H=1080,fx=100,metricsY=172+Math.max(0,title.length-1)*50,fy=Math.max(212,metricsY+32),fw=1160,fh=862-fy,mx=1334,mw=470,out=[];
  const px=value=>fx+value/100*fw,py=value=>fy+(1-value/100)*fh;
  out.push('<svg data-map-layout="zone-atlas-plate" xmlns="http://www.w3.org/2000/svg" width="1920" height="1080" viewBox="0 0 1920 1080" font-family="'+FONT+'">','<rect width="1920" height="1080" fill="'+C.bg+'"/>');
  title.forEach((line,index)=>out.push('<text data-title-line="'+(index+1)+'" x="100" y="'+(86+index*50)+'" font-family="'+DISPLAY+'" font-size="44" font-weight="700" fill="'+C.ink+'">'+esc(line)+'</text>'));
  out.push('<text x="100" y="'+metricsY+'" font-size="14" font-weight="600" letter-spacing="1.25" fill="'+C.muted+'">'+esc((ro.counts||[]).filter(Boolean).join(' · ').toUpperCase())+'</text>');
  out.push('<text x="1820" y="92" text-anchor="end" font-size="14" font-weight="600" letter-spacing="1.1" fill="'+C.muted+'">TWO-AXIS FIELD</text>');
  out.push('<rect x="'+fx+'" y="'+fy+'" width="'+fw+'" height="'+fh+'" fill="'+C.card+'" stroke="'+C.border+'"/>');
  for(const {from,to} of effectiveBoundaries(resolved))out.push('<line data-map-boundary="" x1="'+n(px(from[0]))+'" y1="'+n(py(from[1]))+'" x2="'+n(px(to[0]))+'" y2="'+n(py(to[1]))+'" stroke="'+C.border+'" stroke-width="1.25"/>');
  if(resolved.grid){for(let c=1;c<resolved.grid.cols;c++)out.push('<line x1="'+n(px(c*100/resolved.grid.cols))+'" y1="'+fy+'" x2="'+n(px(c*100/resolved.grid.cols))+'" y2="'+(fy+fh)+'" stroke="'+C.border+'"/>');for(let r=1;r<resolved.grid.rows;r++)out.push('<line x1="'+fx+'" y1="'+n(py(r*100/resolved.grid.rows))+'" x2="'+(fx+fw)+'" y2="'+n(py(r*100/resolved.grid.rows))+'" stroke="'+C.border+'"/>');}
  const anchors=labelAnchors(resolved),obstacles=[];
  for(const zone of resolved.zones){if(zone.kind==='unzoned'||zone.anonymous)continue;const at=anchors.get(zone.id);if(!at)continue;const zx=px(at[0]),zy=py(at[1]),label=upper(zone.name);out.push('<text x="'+n(zx)+'" y="'+n(zy)+'" text-anchor="middle" font-size="13" font-weight="600" letter-spacing="1.4" fill="'+zoneInk(zone,C)+'">'+esc(label)+'</text>');obstacles.push({x:zx-label.length*5,y:zy-16,w:label.length*10,h:21,fixed:true});}
  out.push('<text x="'+n(fx+fw/2)+'" y="'+(fy+fh+37)+'" text-anchor="middle" font-size="13" font-weight="600" letter-spacing="1.5" fill="'+C.muted+'">'+esc(upper(resolved.x.label))+'</text>','<text x="'+(fx-36)+'" y="'+n(fy+fh/2)+'" text-anchor="middle" transform="rotate(-90 '+(fx-36)+' '+n(fy+fh/2)+')" font-size="13" font-weight="600" letter-spacing="1.5" fill="'+C.muted+'">'+esc(upper(resolved.y.label))+'</text>');
  if(resolved.x.low){out.push('<text x="'+fx+'" y="'+(fy+fh+17)+'" font-size="12" fill="'+C.muted+'">'+esc(resolved.x.low)+'</text>','<text x="'+(fx+fw)+'" y="'+(fy+fh+17)+'" text-anchor="end" font-size="12" fill="'+C.muted+'">'+esc(resolved.x.high)+'</text>');}
  const plan=layoutPlaced(records.filter(r=>r.item.x!=null),{planeX:fx,planeY:fy,planeW:fw,planeH:fh,measure,font:'650 18px '+FONT,maxLabelW:330,zoneObstacles:obstacles});
  const newly = label => !!diff?.newLabels?.has(String(label).toLowerCase().replace(/\s+/g,' ').trim());
  if(diff) for(const ghost of diff.ghosts || []){
    const gx=px(ghost.from[0]),gy=py(ghost.from[1]),tx=px(ghost.to[0]),ty=py(ghost.to[1]);
    out.push('<line x1="'+n(gx)+'" y1="'+n(gy)+'" x2="'+n(tx)+'" y2="'+n(ty)+'" stroke="'+C.muted+'" stroke-width="1.25" stroke-dasharray="3 4"/><circle cx="'+n(gx)+'" cy="'+n(gy)+'" r="7" fill="none" stroke="'+C.muted+'" stroke-dasharray="2 2"/>');
  }
  if(plan.mode==='direct')for(const record of plan.records){const bad=flags.has(record.it.srcLine),tx=record.x+12,base=record.y+23;out.push(marker(record.cx,record.cy,bad,C));if(newly(record.it.label))out.push('<circle cx="'+n(record.cx)+'" cy="'+n(record.cy)+'" r="13" fill="none" stroke="'+C.ink+'" stroke-width="1.25"/><text x="'+n(record.cx+17)+'" y="'+n(record.cy-10)+'" font-size="10" font-weight="650" letter-spacing=".8" fill="'+C.muted+'">NEW</text>');record.lines.forEach((line,index)=>out.push('<text x="'+n(tx)+'" y="'+n(base+index*21)+'" font-size="18" font-weight="650" fill="'+(bad?C.err:C.ink)+'">'+esc(line)+'</text>'));}
  else for(const record of plan.records){out.push(marker(record.cx,record.cy,flags.has(record.item.srcLine),C));if(newly(record.item.label))out.push('<circle cx="'+n(record.cx)+'" cy="'+n(record.cy)+'" r="13" fill="none" stroke="'+C.ink+'" stroke-width="1.25"/><text x="'+n(record.cx+17)+'" y="'+n(record.cy-10)+'" font-size="10" font-weight="650" letter-spacing=".8" fill="'+C.muted+'">NEW</text>');out.push('<text x="'+n(record.cx+13)+'" y="'+n(record.cy+5)+'" font-size="12" font-weight="650" fill="'+C.muted+'">'+record.id+'</text>');}
  let y=fy+14;out.push('<line x1="'+(mx-18)+'" y1="'+(fy-2)+'" x2="'+(mx-18)+'" y2="'+(fy+40)+'" stroke="'+C.ink+'" stroke-width="3"/>','<text x="'+mx+'" y="'+y+'" font-size="13" font-weight="600" letter-spacing="1.5" fill="'+C.muted+'">DECISION MARGIN</text>');y+=38;
  const action=ro.zones.filter(e=>e.items.length||e.advice).slice().sort((a,b)=>Number(b.zone.tone==='bad')-Number(a.zone.tone==='bad')||b.items.length-a.items.length)[0];
  if(action){out.push('<text x="'+mx+'" y="'+y+'" font-size="20" font-weight="650" letter-spacing=".8" fill="'+zoneInk(action.zone,C)+'">'+esc(upper(action.zone.name)+' · '+action.items.length)+'</text>');y+=27;for(const line of block(action.advice||'No action rule attached to this zone.','400 14px '+FONT,mw,measure).slice(0,4)){out.push('<text x="'+mx+'" y="'+y+'" font-size="14" fill="'+C.muted+'">'+esc(line)+'</text>');y+=18;}y+=14;}
  if(diff){out.push('<text x="'+mx+'" y="'+y+'" font-size="13" font-weight="600" letter-spacing="1.35" fill="'+C.muted+'">'+esc(upper(diff.sinceLine))+'</text>');y+=24;
    if(diff.ghosts?.length){out.push('<text x="'+mx+'" y="'+y+'" font-size="13" font-weight="600" letter-spacing="1.35" fill="'+C.muted+'">MOVED · '+diff.ghosts.length+'</text>');y+=20;for(const ghost of diff.ghosts){const receipt=block(upper(ghost.label)+' · @ '+ghost.from.join(', ')+' TO '+ghost.to.join(', '),'400 12px '+FONT,mw,measure);for(const line of receipt){out.push('<text x="'+mx+'" y="'+y+'" font-size="12" fill="'+C.muted+'">'+esc(line)+'</text>');y+=16;}}}
    for(const dropped of diff.dropped){out.push('<text x="'+mx+'" y="'+y+'" font-size="13" fill="'+C.muted+'">WAS · '+esc(upper(dropped))+'</text>');y+=17;}y+=8;}
  const ledger=plan.mode==='keyed'?records:ro.unplaced.map(item=>records.find(r=>r.item===item));
  if(ledger.length){out.push('<text x="'+mx+'" y="'+y+'" font-size="13" font-weight="600" letter-spacing="1.4" fill="'+C.muted+'">'+(plan.mode==='keyed'?'FIELD INDEX · SOURCE ORDER':'UNPLACED · '+ledger.length)+'</text>');y+=26;for(const record of ledger){const item=record.item,bad=flags.has(item.srcLine),label=block(item.label,'650 17px '+FONT,mw-44,measure);out.push('<text x="'+mx+'" y="'+y+'" font-size="12" font-weight="650" letter-spacing=".6" fill="'+(bad?C.err:C.muted)+'">'+record.id+'</text>');label.forEach((line,index)=>out.push('<text x="'+(mx+42)+'" y="'+n(y+index*20)+'" font-size="17" font-weight="650" fill="'+(bad?C.err:C.ink)+'">'+esc(line)+'</text>'));y+=Math.max(27,label.length*20+8);}}
  if(ro.flagged.length){y+=7;out.push('<text x="'+mx+'" y="'+y+'" font-size="13" font-weight="600" letter-spacing="1.4" fill="'+C.err+'">TEST FIRST</text>');y+=23;for(const flag of ro.flagged){for(const line of block(flag.item.label+' — '+flag.msg,'400 13px '+FONT,mw,measure).slice(0,2)){out.push('<text x="'+mx+'" y="'+y+'" font-size="13" fill="'+C.err+'">'+esc(line)+'</text>');y+=17;}}}
  const verdict=block(ro.verdict||'','650 24px '+DISPLAY,1720,measure);if(verdict.length>2||y>920)return null;out.push('<line x1="100" y1="968" x2="1820" y2="968" stroke="'+C.border+'"/>','<text x="100" y="997" font-size="12" font-weight="600" letter-spacing="1.4" fill="'+C.muted+'">VERDICT</text>');verdict.forEach((line,index)=>out.push('<text x="100" y="'+(1030+index*25)+'" font-family="'+DISPLAY+'" font-size="24" font-weight="650" fill="'+C.ink+'">'+esc(line)+'</text>'));
  out.push('</svg>');return out.join('');
}
