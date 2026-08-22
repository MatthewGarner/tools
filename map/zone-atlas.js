/* The Map's Swiss field. The plane carries the placement claim; the factual
   margin says what deserves attention. It deliberately does not invent a
   status palette, owners, deadlines, or an operational workflow. */
import {PALETTES, scheme} from '../assets/series.js';
import {esc, editTarget, btnAttrs} from '../assets/svg.js';
import {paintOrder, labelAnchors} from './zones.js';
import {svgMetrics, svgVerdict} from '../assets/verdict-svg.js';
import {layoutPlaced, measuredLines, sourceItems} from './layout.js';

const FONT = '-apple-system, BlinkMacSystemFont, Segoe UI, Roboto, sans-serif';
const DISPLAY = 'Helvetica, Arial, sans-serif';
const n = value => (Math.round(value * 100) / 100).toString();
const upper = value => String(value || '').toUpperCase();
const lines = (value, font, width, measure) => measuredLines(value || '', font, width, measure);

function palette(model, ctx){
  const hex = model.accent || (PALETTES[model.palette] ? PALETTES[model.palette][ctx.dark ? 'dark' : 'light'] : null);
  return hex ? {...ctx.colors, ...scheme(hex, !!ctx.dark)} : ctx.colors;
}
function flagSet(ro){ return new Set(ro.flagged.map(flag => flag.item.srcLine)); }
function marker(x, y, bad, C, r = 4){
  return '<rect x="' + n(x-r) + '" y="' + n(y-r) + '" width="' + n(2*r) + '" height="' + n(2*r) +
    '" fill="' + (bad ? C.err : C.ink) + '" transform="rotate(45 ' + n(x) + ' ' + n(y) + ')"/>';
}
function zoneInk(zone, C){ return zone.tone === 'bad' ? C.err : C.muted; }
function cardOpen(item, edit){
  const firstField = item.fields[0];
  return '<g data-edit="cardmenu" data-line="' + item.srcLine + '"' + btnAttrs('More options: ' + item.label) +
    (firstField ? ' data-field-raw="' + esc(firstField.val) + '" data-key="' + esc(firstField.key) + '"' : '') +
    (edit ? ' data-menu=""' : '') + '>';
}

function directMenuOverlap(records){
  for(let i=0;i<records.length;i++) for(let j=i+1;j<records.length;j++){
    const a=records[i], b=records[j];
    const ax=a.x, ay=a.y+a.h/2-Math.max(44,a.h)/2, aw=a.w+16, ah=Math.max(44,a.h);
    const bx=b.x, by=b.y+b.h/2-Math.max(44,b.h)/2, bw=b.w+16, bh=Math.max(44,b.h);
    if(Math.min(ax+aw,bx+bw)>Math.max(ax,bx) && Math.min(ay+ah,by+bh)>Math.max(ay,by)) return true;
  }
  return false;
}

function drawPlane(out, model, resolved, C, x, y, w, h, edit){
  const px = value => x + value / 100 * w;
  const py = value => y + (1-value/100) * h;
  out.push('<rect data-plane="1" data-map-field="coordinates" x="' + n(x) + '" y="' + n(y) + '" width="' + n(w) + '" height="' + n(h) + '" fill="' + C.card + '" stroke="' + C.border + '"/>');
  /* A Map needs its zones legible. The geometry is a hairline, not a coloured
     panel; red belongs solely to the test-first / flagged semantic. */
  for(const {pts} of paintOrder(resolved)){
    const d = pts.map(([a,b], index) => (index ? 'L' : 'M') + n(px(a)) + ' ' + n(py(b))).join('') + 'Z';
    out.push('<path d="' + d + '" fill="none" stroke="' + C.border + '" stroke-width="1" opacity=".72"/>');
  }
  if(resolved.grid){
    for(let col=1; col<resolved.grid.cols; col++) out.push('<line x1="' + n(px(col*100/resolved.grid.cols)) + '" y1="' + y + '" x2="' + n(px(col*100/resolved.grid.cols)) + '" y2="' + n(y+h) + '" stroke="' + C.border + '"/>');
    for(let row=1; row<resolved.grid.rows; row++) out.push('<line x1="' + x + '" y1="' + n(py(row*100/resolved.grid.rows)) + '" x2="' + n(x+w) + '" y2="' + n(py(row*100/resolved.grid.rows)) + '" stroke="' + C.border + '"/>');
  }
  const anchors = labelAnchors(resolved), obstacles = [];
  for(const zone of resolved.zones){
    if(zone.kind === 'unzoned' || zone.anonymous) continue;
    const at = anchors.get(zone.id); if(!at) continue;
    const zx = px(at[0]), zy = py(at[1]), label = upper(zone.name);
    const visible = '<text x="' + n(zx) + '" y="' + n(zy) + '" text-anchor="middle" font-size="9.5" font-weight="600" letter-spacing="1.15" fill="' + zoneInk(zone,C) + '">' + esc(label) + '</text>';
    if(zone.kind === 'cell' || (zone.kind === 'rule' && zone.srcLine != null)){
      const ref = zone.kind === 'cell' ? 'c:' + zone.col + ',' + zone.row : 'r:' + zone.name;
      out.push(editTarget(visible, {x:zx-22,y:zy-22,w:44,h:44,bg:C.bg}, {kind:'zonename',line:zone.srcLine ?? -1,raw:zone.name,extra:'data-zone="' + esc(ref) + '"',label:'Rename zone: '+zone.name}));
    } else out.push(visible);
    obstacles.push({x:zx-label.length*3.7,y:zy-12,w:label.length*7.4,h:16,fixed:true});
  }
  const ax = resolved.x, ay = resolved.y, cx = x+w/2, cy = y+h/2;
  const atext = ' font-size="10" font-weight="600" letter-spacing="1.80" fill="' + C.muted + '"';
  out.push(editTarget('<text x="'+n(cx)+'" y="'+n(y+h+30)+'" text-anchor="middle"'+atext+'>'+esc(upper(ax.label))+'</text>', {x:cx-22,y:y+h+8,w:44,h:44,bg:C.bg}, {kind:'axis',line:ax.srcLine ?? -1,raw:ax.label,extra:'data-axis="x"',label:'Edit x-axis label: '+ax.label}));
  out.push(editTarget('<text x="'+n(x-28)+'" y="'+n(cy)+'" text-anchor="middle" transform="rotate(-90 '+n(x-28)+' '+n(cy)+')"'+atext+'>'+esc(upper(ay.label))+'</text>', {x:Math.max(0,x-50),y:cy-22,w:44,h:44,bg:C.bg}, {kind:'axis',line:ay.srcLine ?? -1,raw:ay.label,extra:'data-axis="y"',label:'Edit y-axis label: '+ay.label}));
  if(ax.low){
    out.push('<text x="'+x+'" y="'+n(y+h+13)+'" font-size="9.5" fill="'+C.muted+'">'+esc(ax.low)+'</text>');
    out.push('<text x="'+n(x+w)+'" y="'+n(y+h+13)+'" text-anchor="end" font-size="9.5" fill="'+C.muted+'">'+esc(ax.high)+'</text>');
  }
  if(ay.low){
    out.push('<text x="'+n(x-9)+'" y="'+n(y+h-2)+'" text-anchor="end" font-size="9.5" fill="'+C.muted+'">'+esc(ay.low)+'</text>');
    out.push('<text x="'+n(x-9)+'" y="'+n(y+9)+'" text-anchor="end" font-size="9.5" fill="'+C.muted+'">'+esc(ay.high)+'</text>');
  }
  return {px,py,obstacles};
}

function drawPlaced(out, plan, flags, C, edit, diff){
  const newly = label => !!diff?.newLabels?.has(String(label).toLowerCase().replace(/\s+/g, ' ').trim());
  if(plan.mode === 'keyed') for(const record of plan.records){
    out.push(marker(record.cx,record.cy,flags.has(record.item.srcLine),C));
    if(newly(record.item.label)) out.push('<circle cx="'+n(record.cx)+'" cy="'+n(record.cy)+'" r="8" fill="none" stroke="'+C.ink+'" stroke-width="1"/><text x="'+n(record.cx+11)+'" y="'+n(record.cy-7)+'" font-size="8" font-weight="650" letter-spacing=".7" fill="'+C.muted+'">NEW</text>');
    out.push('<text pointer-events="none" x="'+n(record.cx+9)+'" y="'+n(record.cy+4)+'" font-size="9" font-weight="650" fill="'+C.muted+'">'+record.id+'</text>');
    continue;
  }
  if(plan.mode === 'keyed') return;
  for(const record of plan.records){
    const middle = record.y + record.h/2;
    const hitH = Math.max(44,record.h);
    out.push(cardOpen(record.it,edit).replace('>', ' data-display-id="'+record.id+'" data-geometry="'+[record.cx,record.cy,record.x,record.y,record.w,record.h].map(n).join(',')+'">'));
    out.push('<rect data-hit="" x="'+n(record.x)+'" y="'+n(middle-hitH/2)+'" width="'+n(record.w+16)+'" height="'+n(hitH)+'" fill="'+C.card+'" fill-opacity="0"/>');
    if(Math.hypot(record.cx-(record.x+record.w/2),record.cy-middle)>18) out.push('<line x1="'+n(record.cx)+'" y1="'+n(record.cy)+'" x2="'+n(record.x+record.w/2)+'" y2="'+n(middle)+'" stroke="'+C.border+'"/>');
    out.push(marker(record.cx,record.cy,flags.has(record.it.srcLine),C));
    if(newly(record.it.label)) out.push('<circle cx="'+n(record.cx)+'" cy="'+n(record.cy)+'" r="8" fill="none" stroke="'+C.ink+'" stroke-width="1"/><text x="'+n(record.cx+11)+'" y="'+n(record.cy-7)+'" font-size="8" font-weight="650" letter-spacing=".7" fill="'+C.muted+'">NEW</text>');
    const tx=record.x+8, base=record.y+16, bad=flags.has(record.it.srcLine);
    out.push('<text data-edit="label" data-line="'+record.it.srcLine+'" data-raw="'+esc(record.it.label)+'" x="'+n(tx)+'" y="'+n(base)+'" font-size="12" font-weight="650" fill="'+(bad?C.err:C.ink)+'"'+btnAttrs('Rename: '+record.it.label)+'>'+esc(record.lines[0])+'</text>');
    record.lines.slice(1).forEach((line,index)=>out.push('<text pointer-events="none" x="'+n(tx)+'" y="'+n(base+(index+1)*14)+'" font-size="12" font-weight="650" fill="'+(bad?C.err:C.ink)+'">'+esc(line)+'</text>'));
    out.push('</g>');
  }
}

function priority(ro){
  return ro.zones.filter(entry=>entry.items.length||entry.advice).slice().sort((a,b)=>Number(b.zone.tone==='bad')-Number(a.zone.tone==='bad')||b.items.length-a.items.length)[0] || null;
}

function drawMargin(out, model, ro, C, x, y, w, measure, edit, plan, diff){
  let cy=y;
  const text=(value,size=11,fill=C.ink,weight='',tracking='')=>out.push('<text x="'+n(x)+'" y="'+n(cy)+'" font-size="'+size+'"'+(weight?' font-weight="'+weight+'"':'')+(tracking?' letter-spacing="'+tracking+'"':'')+' fill="'+fill+'">'+esc(value)+'</text>');
  out.push('<line x1="'+n(x-14)+'" y1="'+n(y-2)+'" x2="'+n(x-14)+'" y2="'+n(y+34)+'" stroke="'+C.ink+'" stroke-width="2"/>');
  text('DECISION MARGIN',9.5,C.muted,'600','1.25'); cy+=25;
  const action=priority(ro);
  if(action){
    text(upper(action.zone.name)+' · '+action.items.length,13,zoneInk(action.zone,C),'650','.85'); cy+=18;
    for(const line of lines(action.advice||'No action rule attached to this zone.','400 10px '+FONT,w,measure).slice(0,4)){ text(line,10,C.muted); cy+=13; }
    cy+=12;
  }
  if(ro.flagged.length){
    cy+=5;
    for(const flag of ro.flagged){ for(const line of lines(flag.item.label+' — '+flag.msg,'400 10px '+FONT,w,measure).slice(0,3)){text(line,10,C.err);cy+=13;} cy+=4; }
    cy+=7;
  }
  if(plan.mode==='keyed'){
    text('FIELD INDEX · SOURCE ORDER',9.5,C.muted,'600','1.25'); cy+=18;
    for(const record of plan.records){
      const item=record.item,label=lines(item.label,'600 10.5px '+FONT,w-34,measure),bad=ro.flagged.some(f=>f.item.srcLine===item.srcLine),rowH=Math.max(44,label.length*13+14);
      out.push(cardOpen(item,edit).replace('>', ' data-display-id="'+record.id+'">'));
      if(edit) out.push('<rect data-hit="" x="'+n(x-4)+'" y="'+n(cy-16)+'" width="'+n(w+4)+'" height="'+rowH+'" fill="'+C.card+'" fill-opacity="0"/>');
      out.push('<text pointer-events="none" x="'+n(x)+'" y="'+n(cy)+'" font-size="9.5" font-weight="650" letter-spacing=".5" fill="'+(bad?C.err:C.muted)+'">'+record.id+'</text>');
      label.forEach((line,index)=>out.push('<text data-edit="label" data-line="'+item.srcLine+'" data-raw="'+esc(item.label)+'" x="'+n(x+32)+'" y="'+n(cy+index*13)+'" font-size="10.5" font-weight="600" fill="'+(bad?C.err:C.ink)+'"'+(index?' pointer-events="none"':btnAttrs('Rename: '+item.label))+'>'+esc(line)+'</text>'));
      out.push('</g>'); cy+=rowH;
    }
    cy+=10;
  }
  if(ro.unplaced.length){
    text('UNPLACED · '+ro.unplaced.length,9.5,C.muted,'600','1.25'); cy+=18;
    for(const item of ro.unplaced){
      const label=lines(item.label,'600 10.5px '+FONT,w-16,measure),firstField=item.fields[0],rowH=Math.max(edit?44:22,label.length*13+9);
      out.push('<g data-line="'+item.srcLine+'" data-tray="1"'+(edit?' data-edit="cardmenu"'+btnAttrs('More options: '+item.label)+(firstField?' data-field-raw="'+esc(firstField.val)+'" data-key="'+esc(firstField.key)+'"':'')+' data-menu=""':'')+'>');
      if(edit) out.push('<rect data-hit="" x="'+n(x-4)+'" y="'+n(cy-13)+'" width="'+n(w+4)+'" height="'+rowH+'" fill="'+C.card+'" fill-opacity="0"/>');
      out.push('<line x1="'+n(x)+'" y1="'+n(cy-8)+'" x2="'+n(x+8)+'" y2="'+n(cy-8)+'" stroke="'+C.muted+'"/>');
      out.push('<text data-edit="label" data-line="'+item.srcLine+'" data-raw="'+esc(item.label)+'" x="'+n(x+14)+'" y="'+n(cy)+'" font-size="10.5" font-weight="600" fill="'+C.ink+'"'+btnAttrs('Rename: '+item.label)+'>'+esc(label[0])+'</text>');
      label.slice(1).forEach((line,index)=>out.push('<text pointer-events="none" x="'+n(x+14)+'" y="'+n(cy+(index+1)*13)+'" font-size="10.5" font-weight="600" fill="'+C.ink+'">'+esc(line)+'</text>'));
      out.push('</g>'); cy+=rowH;
    }
    cy+=8;
  }
  if(diff){
    text(diff.sinceLine,9.5,C.muted,'600','1.25');cy+=17;
    if(diff.dropped.length){ text('DROPPED SINCE '+upper(diff.since),9.5,C.muted,'600','1.1');cy+=15; }
    for(const dropped of diff.dropped){
      out.push('<text x="'+n(x)+'" y="'+n(cy)+'" font-size="10" fill="'+C.muted+'" text-decoration="line-through">WAS · '+esc(dropped)+'</text>');
      cy+=13;
    }
    cy+=7;
  }
  if(edit){
    out.push(editTarget('<text class="quiet-add" x="'+n(x)+'" y="'+n(cy+12)+'" font-size="10.5" font-weight="600" fill="'+C.muted+'">＋ Add item</text>', {x:x-8,y:cy-12,w:112,h:44,bg:C.bg}, {kind:'additem',line:-1,raw:'',label:'Add item'}));
    cy+=38;
  }
  return cy;
}

function narrow(model,resolved,ro,ctx,C,diff){
  const W=390,p=18,measure=ctx.measure,edit=!!ctx.edit,out=[],title=lines(model.title||model.preset||'Map','700 22px '+DISPLAY,W-p*2,measure);
  let y=32;
  out.push('<svg data-map-layout="zone-atlas-phone" data-narrow="" xmlns="http://www.w3.org/2000/svg" width="390" height="1" viewBox="0 0 390 1" font-family="'+FONT+'">','<rect width="390" height="1" fill="'+C.bg+'"/>');
  title.forEach((line,index)=>out.push('<text data-title-line="'+(index+1)+'" x="'+p+'" y="'+n(y+index*25)+'" font-family="'+DISPLAY+'" font-size="22" font-weight="700" fill="'+C.ink+'">'+esc(line)+'</text>'));
  y+=title.length*25+16;
  out.push('<text x="'+p+'" y="'+y+'" font-size="9.5" font-weight="600" letter-spacing="1.2" fill="'+C.muted+'">SOURCE ORDER · PLACEMENT AUDIT</text>'); y+=21;
  out.push('<text x="'+p+'" y="'+y+'" font-size="9" font-weight="600" letter-spacing=".8" fill="'+C.muted+'">X · '+esc(upper(resolved.x.label))+' — '+esc(upper(resolved.x.low||'LOW'))+' TO '+esc(upper(resolved.x.high||'HIGH'))+'</text>'); y+=14;
  out.push('<text x="'+p+'" y="'+y+'" font-size="9" font-weight="600" letter-spacing=".8" fill="'+C.muted+'">Y · '+esc(upper(resolved.y.label))+' — '+esc(upper(resolved.y.low||'LOW'))+' TO '+esc(upper(resolved.y.high||'HIGH'))+'</text>'); y+=14;
  const px=p,py=y,pw=W-p*2,ph=128;
  out.push('<rect data-plane="1" data-position-hit="" x="'+px+'" y="'+py+'" width="'+pw+'" height="'+ph+'" fill="'+C.card+'" stroke="'+C.border+'"/>');
  if(resolved.grid){for(let col=1;col<resolved.grid.cols;col++)out.push('<line x1="'+n(px+pw*col/resolved.grid.cols)+'" y1="'+py+'" x2="'+n(px+pw*col/resolved.grid.cols)+'" y2="'+n(py+ph)+'" stroke="'+C.border+'"/>');for(let row=1;row<resolved.grid.rows;row++)out.push('<line x1="'+px+'" y1="'+n(py+ph*row/resolved.grid.rows)+'" x2="'+n(px+pw)+'" y2="'+n(py+ph*row/resolved.grid.rows)+'" stroke="'+C.border+'"/>');}
  const flags=flagSet(ro); for(const record of sourceItems(model,ro))if(record.item.x!=null)out.push(marker(px+record.item.x/100*pw,py+(1-record.item.y/100)*ph,flags.has(record.item.srcLine),C,3));
  y=py+ph+26;
  for(const record of sourceItems(model,ro)){
    const item=record.item,bad=flags.has(item.srcLine),label=lines(item.label,'650 13px '+FONT,232,measure),rowH=Math.max(66,48+label.length*15),entry=item.x==null?null:ro.zones.find(z=>z.items.some(value=>value.srcLine===item.srcLine)),firstField=item.fields[0];
    out.push('<g data-line="'+item.srcLine+'"'+(item.x==null?' data-tray="1"':'')+' data-edit="cardmenu"'+btnAttrs('More options: '+item.label)+(firstField?' data-field-raw="'+esc(firstField.val)+'" data-key="'+esc(firstField.key)+'"':'')+(edit?' data-menu=""':'')+'>');
    if(edit)out.push('<rect data-hit="" x="'+(W-p-44)+'" y="'+n(y-22)+'" width="44" height="44" fill="'+C.card+'" fill-opacity="0"/>');
    out.push('<line x1="'+p+'" y1="'+n(y+rowH-22)+'" x2="'+(W-p)+'" y2="'+n(y+rowH-22)+'" stroke="'+C.border+'"/>',marker(p+7,y-7,bad,C,3),'<text x="'+(p+20)+'" y="'+y+'" font-size="9" font-weight="600" letter-spacing=".7" fill="'+C.muted+'">'+record.id+'</text>');
    out.push('<g data-edit="label" data-line="'+item.srcLine+'" data-raw="'+esc(item.label)+'"'+btnAttrs('Rename: '+item.label)+' data-title-hit="">');
    label.forEach((line,index)=>out.push('<text pointer-events="none" x="'+(p+54)+'" y="'+n(y+index*15)+'" font-size="13" font-weight="650" fill="'+(bad?C.err:C.ink)+'">'+esc(line)+'</text>'));
    out.push('<rect data-title-hit="" x="'+(p+48)+'" y="'+n(y-21)+'" width="250" height="'+Math.max(44,label.length*15+15)+'" fill="'+C.card+'" fill-opacity="0"/></g>');
    const fact=item.x==null?'UNPLACED':'@ '+item.x+', '+item.y+(entry?' · '+upper(entry.zone.name):'');
    out.push('<text pointer-events="none" x="'+(p+54)+'" y="'+n(y+label.length*15+9)+'" font-size="9.5" font-weight="600" letter-spacing=".45" fill="'+(bad?C.err:C.muted)+'">'+esc(fact)+(bad && !/TEST FIRST/.test(fact)?' · TEST FIRST':'')+'</text><text pointer-events="none" x="'+(W-p)+'" y="'+y+'" text-anchor="end" font-size="16" fill="'+C.muted+'">⋯</text></g>');
    y+=rowH;
  }
  if(edit){out.push(editTarget('<text class="quiet-add" x="'+p+'" y="'+n(y+10)+'" font-size="11" font-weight="600" fill="'+C.muted+'">＋ Add item</text>',{x:p-8,y:y-22,w:112,h:44,bg:C.bg},{kind:'additem',line:-1,raw:'',label:'Add item'}));y+=42;}
  if(ro.verdict){out.push('<line x1="'+p+'" y1="'+n(y+4)+'" x2="'+(W-p)+'" y2="'+n(y+4)+'" stroke="'+C.border+'"/>');y+=26;out.push('<text x="'+p+'" y="'+y+'" font-size="9.5" font-weight="600" letter-spacing="1.2" fill="'+C.muted+'">VERDICT</text>');y+=18;for(const line of lines(ro.verdict,'650 15px '+DISPLAY,W-p*2,measure)){out.push('<text x="'+p+'" y="'+y+'" font-family="'+DISPLAY+'" font-size="15" font-weight="650" fill="'+C.ink+'">'+esc(line)+'</text>');y+=19;}}
  const H=Math.ceil(y+24);out[0]='<svg data-map-layout="zone-atlas-phone" data-narrow="" xmlns="http://www.w3.org/2000/svg" width="390" height="'+H+'" viewBox="0 0 390 '+H+'" font-family="'+FONT+'">';out[1]='<rect width="390" height="'+H+'" fill="'+C.bg+'"/>';out.push('</svg>');return out.join('');
}

export function renderZoneAtlas(model,resolved,ro,ctx,diff=null){
  const C=palette(model,ctx); if(ctx.width&&ctx.width<520)return narrow(model,resolved,ro,ctx,C,diff);
  const out=[],measure=ctx.measure,edit=!!ctx.edit,p=30,planeX=72,planeY=model.title?78:28,planeW=820,planeH=540,marginX=920,marginW=284,W=1234;
  const title=model.title?lines(model.title,'700 24px '+DISPLAY,1174,measure):[];
  const y=title.length?78+Math.max(0,title.length-1)*27:28;
  const geom=drawPlane(out,model,resolved,C,planeX,y,planeW,planeH,edit),flags=flagSet(ro),records=sourceItems(model,ro);
  if(diff)for(const ghost of diff.ghosts){const gx=geom.px(ghost.from[0]),gy=geom.py(ghost.from[1]),tx=geom.px(ghost.to[0]),ty=geom.py(ghost.to[1]);out.push('<line x1="'+n(gx)+'" y1="'+n(gy)+'" x2="'+n(tx)+'" y2="'+n(ty)+'" stroke="'+C.muted+'" stroke-width="1" stroke-dasharray="3 4"/><circle cx="'+n(gx)+'" cy="'+n(gy)+'" r="4" fill="none" stroke="'+C.muted+'" stroke-dasharray="2 2"/>');}
  const planArgs={planeX,planeY:y,planeW,planeH,measure,font:'650 12px '+FONT,maxLabelW:184,zoneObstacles:geom.obstacles,interactionHeight:44};
  let plan=layoutPlaced(records,planArgs);
  /* When 44px menus would collide, the factual source index is the only honest
     disambiguation: do not quietly make the editable targets smaller. */
  if(plan.mode==='direct' && directMenuOverlap(plan.records)) plan=layoutPlaced(records,{...planArgs,forceKeyed:true});
  drawPlaced(out,plan,flags,C,edit,diff);
  const marginEnd=drawMargin(out,model,ro,C,marginX,y+14,marginW,measure,edit,plan,diff),verdictY=Math.max(y+planeH+72,marginEnd+24);let end=verdictY+12;
  if(ro.verdict){const block=svgVerdict({x:p,y:verdictY,width:W-p*2,line:ro.verdict,fig:ro.verdictFig,ink:C.ink,muted:C.muted,brandText:C.brandText||C.ink,font:DISPLAY,measure,size:24,scale:1,edit:edit?{raw:model.verdict??''}:undefined});out.push(block.svg);end=verdictY+block.height+24;}
  const H=Math.ceil(end),slideScale=ctx.slide?1.35:1,physicalW=Math.round(W*slideScale),physicalH=Math.round(H*slideScale),start=['<svg data-map-layout="zone-atlas" xmlns="http://www.w3.org/2000/svg" width="'+physicalW+'" height="'+physicalH+'" viewBox="0 0 '+W+' '+H+'" font-family="'+FONT+'">','<rect width="'+W+'" height="'+H+'" fill="'+C.bg+'"/>'];
  title.forEach((line,index)=>start.push('<text data-title-line="'+(index+1)+'" x="'+p+'" y="'+(36+index*27)+'" font-family="'+DISPLAY+'" font-size="24" font-weight="700" fill="'+C.ink+'">'+esc(line)+'</text>'));
  if(title.length&&model.items.length)start.push(svgMetrics({x:p,y:55+Math.max(0,title.length-1)*27,model:'',counts:ro.counts||[],ink:C.ink,muted:C.muted,font:FONT,scale:1}));
  return start.concat(out,['</svg>']).join('');
}
