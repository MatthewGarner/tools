/* Density-aware Tree renderer. Geometry comes entirely from layoutTree(); edit
   affordances are overlays and therefore cannot change live/native bounds. */
import {PALETTES, scheme, fmt} from '../assets/series.js';
import {esc, btnAttrs, wrapText} from '../assets/svg.js';
import {svgVerdict, svgMetrics} from '../assets/verdict-svg.js';
import {layoutTree, TREE_GEOM} from './layout.js';
import {decisionComparisonProjection} from './comparison.js';

const SANS = '-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif';
const SERIF = '"Helvetica Neue",Helvetica,"Segoe UI",Roboto,sans-serif';
export const NARROW = 520;
const T = {pad:32, bottom:24};
const e = s => esc(String(s));
const n2 = n => Math.round(n * 100) / 100;

function clippedLines(text, font, width, measure, maxLines){
  const full=wrapText(text,font,width,measure),lines=full.slice(0,maxLines),clipped=full.length>maxLines;
  if(clipped&&lines.length){
    let last=lines[lines.length-1];
    while(last.length>1&&measure(last+'…',font)>width) last=last.slice(0,-1);
    lines[lines.length-1]=last.replace(/[\s,.;:]+$/,'')+'…';
  }
  return {lines,clipped};
}

function intent(ctx){
  if(ctx.intent) return ctx.intent;
  if(ctx.width && ctx.width < NARROW) return 'live-narrow';
  return ctx.slide ? 'presentation' : (ctx.edit ? 'live-wide' : 'native');
}
function colors(model, ctx){
  const hex = model.accent || (PALETTES[model.palette] && PALETTES[model.palette][ctx.dark ? 'dark' : 'light']);
  return hex ? {...ctx.colors, ...scheme(hex, !!ctx.dark)} : ctx.colors;
}
function values(model){
  const cur = model.currency || '£';
  const money = v => (v < 0 ? '−' : '') + cur + fmt(Math.abs(v));
  return {
    money,
    range: v => !v ? '' : v.lo === v.hi ? money(v.lo) : money(v.lo) + ' … ' + money(v.hi),
    prob: p => p == null ? '' : p === 'rest' ? 'rest' : p.lo === p.hi ? 'p=' + p.lo : 'p=' + p.lo + '–' + p.hi,
  };
}
function counts(root){
  let nodes = 0, leaves = 0;
  (function walk(x){ nodes++; if(!x.children.length) leaves++; else x.children.forEach(walk); })(root);
  const opts = root.kind === 'decision' ? root.children.length : 0;
  return [opts ? opts + (opts === 1 ? ' option' : ' options') : '', leaves + (leaves === 1 ? ' outcome' : ' outcomes'), nodes + ' nodes'].filter(Boolean);
}
function topLines(root){
  const out = new Map();
  root.children.forEach(option => (function walk(node){ out.set(node, option.srcLine); node.children.forEach(walk); })(option));
  return out;
}
function status(node, root, policy, results){
  if(node === root) return 'DECISION';
  if(node.p !== null && node.p !== undefined){
    const effective = results.effectiveProbability?.get(node);
    const authoredZero = node.p !== 'rest' && node.p.lo === 0 && node.p.hi === 0;
    if(effective === 0 || (effective === undefined && authoredZero)) return 'EXCLUDED · ZERO PROBABILITY';
    return 'POSSIBLE OUTCOME';
  }
  if(policy.has(node)) return node.kind === 'leaf' ? 'CHOSEN OUTCOME' : 'ON POLICY';
  return node.kind === 'leaf' ? 'OUTCOME' : 'ALTERNATIVE';
}
function field(kind, node, raw, text, label, edit, hot = false){
  return '<tspan' + (edit ? ' data-edit="' + kind + '" data-line="' + node.srcLine + '" data-raw="' + e(raw || '') + '"' +
    btnAttrs(label) + (hot ? ' data-hot=""' : '') : '') + '>' + e(text) + '</tspan>';
}
function menu(node, x, y, C, root){
  const kind = node === root ? 'cardmenu-root-' + (node.implicit ? 'decision' : node.kind) : 'cardmenu-' + node.kind;
  const pRaw = node.pRaw || (node.p === 'rest' ? 'rest' : '');
  return '<g data-edit="' + kind + '" data-line="' + (node.implicit ? -1 : node.srcLine) + '" data-raw=""' +
    ' data-label-raw="' + e(node.label || '') + '" data-value-raw="' + e(node.valueRaw || '') +
    '" data-prob-raw="' + e(pRaw) + '" data-menu=""' +
    btnAttrs('More options: ' + (node.label || 'node')) + '><text x="' + x + '" y="' + (y + 4) +
    '" text-anchor="middle" font-size="13" font-weight="700" fill="' + C.muted + '">⋯</text>' +
    '<rect data-hit="" x="' + (x - 22) + '" y="' + (y - 22) + '" width="44" height="44" fill="' + C.bg + '" fill-opacity="0" pointer-events="all"/></g>';
}
function marker(node, x, y, C, active){
  const c = active ? C.accent : C.muted;
  if(node.kind === 'decision') return '<rect x="' + (x - 7) + '" y="' + (y - 7) + '" width="14" height="14" rx="2" fill="' + C.card + '" stroke="' + c + '" stroke-width="1.5"/>';
  if(node.kind === 'chance') return '<circle cx="' + x + '" cy="' + y + '" r="7" fill="' + C.card + '" stroke="' + c + '" stroke-width="1.5"/>';
  return '<line x1="' + x + '" y1="' + (y - 7) + '" x2="' + x + '" y2="' + (y + 7) + '" stroke="' + c + '" stroke-width="1.5"/>';
}

function head(model, results, ctx, C, W, verdictParts, presentation = false){
  const pad = presentation ? 72 : T.pad, titleSize = presentation ? 38 : 22;
  const lines = model.title ? wrapText(model.title, '700 ' + titleSize + 'px ' + SERIF, W - pad * 2 - 150, ctx.measure) : [];
  const out = [];
  let y = pad;
  lines.slice(0, 2).forEach(line => { out.push('<text x="' + pad + '" y="' + y + '" font-family=\'' + SERIF + '\' font-size="' + titleSize + '" font-weight="700" fill="' + C.ink + '">' + e(line) + '</text>'); y += titleSize * 1.18; });
  if(!lines.length) y = presentation ? 54 : 20;
  out.push('<text x="' + (W - pad) + '" y="' + pad + '" text-anchor="end" font-size="' + (presentation ? 18 : 11) + '" fill="' + C.muted + '">' + new Date().toISOString().slice(0, 10) + '</text>');
  const metricsY = y + (presentation ? 12 : 1);
  out.push(svgMetrics({x:pad, y:metricsY, model:'', counts:counts(model.root), ink:C.ink, muted:C.muted, font:SANS, scale:presentation ? 1.7 : 1}));
  const vy = metricsY + (presentation ? 54 : 18), vp = verdictParts(model, results);
  if(!vp.line) return {svg:out.join(''), h:vy + 10};
  const block = svgVerdict({x:pad, y:vy, width:W-pad*2, line:vp.line, fig:vp.fig, ink:C.ink, muted:C.muted,
    brandText:C.brandText || C.ink, font:SANS, measure:ctx.measure, size:presentation ? 28 : 24,
    scale:presentation ? 1.3 : 1, edit:ctx.edit ? {raw:model.verdict ?? ''} : undefined});
  const authored = model.verdict != null && String(model.verdict).trim() !== '';
  const rec = results.policy.get(model.root), st = results.stats.get(model.root), v = values(model);
  let ev = '';
  if(!authored && rec && st && model.root.kind === 'decision'){
    let msg = 'P10 ' + v.money(st.p10) + ' · P90 ' + v.money(st.p90);
    const recMean = results.stats.get(rec)?.mean;
    const rival = model.root.children.filter(x => x !== rec && results.stats.has(x)).reduce((best, option) => {
      if(!best) return option;
      return Math.abs(results.stats.get(option).mean - recMean) <
        Math.abs(results.stats.get(best).mean - recMean) ? option : best;
    }, null);
    const h = rival && (results.headToHead || []).find(x =>
      (x.aNode === rec && x.bNode === rival) || (x.aNode === rival && x.bNode === rec) ||
      (!x.aNode && ((x.a === rec.label && x.b === rival.label) || (x.a === rival.label && x.b === rec.label))));
    if(h){
      const recIsA = h.aNode ? h.aNode === rec : h.a === rec.label;
      const share = recIsA ? h.aShare : 1-h.aShare;
      msg += ' · beats ' + rival.label + ' in ' + Math.round(share*100) + '% of simulations';
    }
    ev = '<text x="' + pad + '" y="' + (vy + block.height + 3) + '" font-size="' + (presentation ? 18 : 11.5) + '" fill="' + C.muted + '">' + e(msg) + '</text>';
  }
  out.push((ctx.edit ? '<g data-verdict="">' : '') + block.svg + ev + (ctx.edit ? '</g>' : ''));
  return {svg:out.join(''), h:vy + block.height + (ev ? (presentation ? 38 : 21) : 18)};
}

function card(item, model, results, ctx, C, layout, v, tops){
  const node=item.node, x=item.x, y=item.y, active=layout.policy.has(node), hot=ctx.hot || new Set();
  const out=['<g data-tree-node="'+node.srcLine+'" data-policy-state="'+(active?'recommended':'alternative')+'"'+(ctx.edit&&tops.has(node)?' data-opt="'+tops.get(node)+'"':'')+'>'];
  out.push('<rect x="'+x+'" y="'+y+'" width="'+item.w+'" height="'+item.h+'" fill="'+C.card+'" stroke="'+(active?C.accent:C.border)+'"/>');
  out.push('<line x1="'+x+'" y1="'+y+'" x2="'+x+'" y2="'+(y+item.h)+'" stroke="'+(active?C.accent:C.muted)+'" stroke-width="3"/>');
  out.push(marker(node,x,y+22,C,active));
  let ty=y+23;
  item.lines.forEach((line,i)=>{ out.push('<text x="'+(x+15)+'" y="'+ty+'" font-size="13" font-weight="650" fill="'+C.ink+'">'+field('label',node,node.label,line,'Edit label: '+node.label,ctx.edit&&!node.implicit&&i===0)+'</text>'); ty+=17; });
  ty+=3;
  if(node.p!=null){ const text=v.prob(node.p), h=ctx.edit&&hot.has('prob:'+node.srcLine); out.push('<text x="'+(x+15)+'" y="'+ty+'" font-size="10.5" fill="'+C.muted+'">'+field('prob',node,node.pRaw||(node.p==='rest'?'rest':''),text,'Edit probability: '+node.label,ctx.edit,h)+'</text>'); if(h) out.push('<line x1="'+(x+15)+'" y1="'+(ty+2)+'" x2="'+(x+75)+'" y2="'+(ty+2)+'" stroke="'+C.accent+'" stroke-dasharray="1.5,2"/>'); ty+=14; }
  if(node.value){ const text=v.range(node.value), h=ctx.edit&&hot.has('value:'+node.srcLine); out.push('<text x="'+(x+15)+'" y="'+ty+'" font-size="10.5" fill="'+C.muted+'">'+field('value',node,node.valueRaw||'',text,'Edit payoff: '+node.label,ctx.edit,h)+'</text>'); if(h) out.push('<line x1="'+(x+15)+'" y1="'+(ty+2)+'" x2="'+(x+105)+'" y2="'+(ty+2)+'" stroke="'+C.accent+'" stroke-dasharray="1.5,2"/>'); ty+=14; }
  const st=results.stats.get(node); if(st) out.push('<text x="'+(x+15)+'" y="'+ty+'" font-size="11.5" font-weight="650" fill="'+(active?C.ink:C.muted)+'"'+(ctx.edit?' data-mc=""':'')+'>'+(active?'EXPECTED ':'ALTERNATIVE · EV ')+e(v.money(st.mean))+'<tspan fill="'+C.muted+'" font-size="10"> · '+e(v.money(st.p10)+' … '+v.money(st.p90))+'</tspan></text>');
  if(ctx.edit) out.push(menu(node,x+item.w-18,y+item.h-18,C,model.root));
  out.push('</g>'); return out.join('');
}

function flips(results,v,C,x,y,w,measure){
  if(!results.flips?.length) return {svg:'',h:0};
  const out=['<text x="'+x+'" y="'+y+'" font-size="10" font-weight="650" letter-spacing="1.2" fill="'+C.muted+'">WHAT WOULD FLIP THIS</text>']; let cy=y+24;
  results.flips.forEach(f=>{ const msg=f.kind==='prob'?'flips if p('+f.label+') '+f.direction+' '+f.threshold.toFixed(2):f.label+' matters: the recommendation changes within its '+v.range({lo:f.lo,hi:f.hi})+' range'; wrapText('– '+msg,'11px '+SANS,w,measure).forEach(line=>{out.push('<text x="'+(x+8)+'" y="'+cy+'" font-size="11" fill="'+C.muted+'">'+e(line)+'</text>');cy+=18;}); });
  return {svg:out.join(''),h:cy-y};
}

function register(layout,model,results,ctx,C,v,x,y){
  const W=layout.width,pX=x+W*.48,valX=x+W*.60,evX=x+W*.75,statusX=x+W-18;
  const out=['<g data-options-register=""><line x1="'+x+'" y1="'+y+'" x2="'+(x+W)+'" y2="'+y+'" stroke="'+C.border+'"/>','<text x="'+x+'" y="'+(y+22)+'" font-size="10" font-weight="650" letter-spacing="1.5" fill="'+C.muted+'">OPTIONS REGISTER · FULL MODEL</text>','<text x="'+pX+'" y="'+(y+22)+'" font-size="9" fill="'+C.muted+'">PROBABILITY</text><text x="'+valX+'" y="'+(y+22)+'" font-size="9" fill="'+C.muted+'">PAYOFF</text><text x="'+evX+'" y="'+(y+22)+'" font-size="9" fill="'+C.muted+'">EXPECTED VALUE</text><text x="'+statusX+'" y="'+(y+22)+'" text-anchor="end" font-size="9" fill="'+C.muted+'">POLICY STATUS</text>'];
  layout.rows.forEach(row=>{ const ry=y+row.y, mirror=layout.branch.items.some(i=>i.node===row.node), editable=ctx.edit&&!mirror&&!row.node.implicit; out.push('<g data-register-row="'+row.node.srcLine+'"'+(mirror?' data-mirror=""':'')+'><line x1="'+x+'" y1="'+(ry+row.h)+'" x2="'+(x+W)+'" y2="'+(ry+row.h)+'" stroke="'+C.border+'"/><text x="'+x+'" y="'+(ry+18)+'" font-size="9" font-weight="700" fill="'+C.accent+'">'+row.id+'</text>'); let py=ry+18; row.pathLines.forEach((line,i)=>{out.push('<text x="'+(x+36)+'" y="'+py+'" font-size="11.5" fill="'+C.ink+'">'+field('label',row.node,row.node.label,line,'Edit label: '+row.node.label,editable&&i===row.pathLines.length-1)+'</text>');py+=15;}); const mid=ry+row.h/2+4; if(row.node.p!=null) out.push('<text x="'+pX+'" y="'+mid+'" font-size="10.5" fill="'+C.ink+'">'+field('prob',row.node,row.node.pRaw||(row.node.p==='rest'?'rest':''),v.prob(row.node.p),'Edit probability: '+row.node.label,editable)+'</text>'); if(row.node.value) out.push('<text x="'+valX+'" y="'+mid+'" font-size="10.5" fill="'+C.ink+'">'+field('value',row.node,row.node.valueRaw||'',v.range(row.node.value),'Edit payoff: '+row.node.label,editable)+'</text>'); const st=results.stats.get(row.node); if(st) out.push('<text x="'+evX+'" y="'+mid+'" font-size="10.5" font-weight="650" fill="'+C.ink+'">'+e(v.money(st.mean))+'</text>'); out.push('<text x="'+statusX+'" y="'+mid+'" text-anchor="end" font-size="9.5" font-weight="650" fill="'+(layout.policy.has(row.node)?C.accent:C.muted)+'">'+status(row.node,model.root,layout.policy,results)+'</text>'); if(editable) out.push(menu(row.node,x+W-140,mid-4,C,model.root)); out.push('</g>'); }); out.push('</g>'); return out.join('');
}

function wide(model,results,ctx,C,layout,verdictParts){
  const v=values(model), W=Math.ceil(Math.max(760,layout.width+T.pad*2)), h=head(model,results,ctx,C,W,verdictParts), ox=T.pad,oy=h.h+(layout.mode==='continuation'?48:0), bottom=oy+layout.height, f=flips(results,v,C,T.pad,bottom+34,W-T.pad*2,ctx.measure), H=Math.ceil(bottom+(f.h?54+f.h:20)+T.bottom);
  const out=['<svg xmlns="http://www.w3.org/2000/svg" width="'+W+'" height="'+H+'" viewBox="0 0 '+W+' '+H+'" font-family=\''+SANS+'\'><rect width="'+W+'" height="'+H+'" fill="'+C.bg+'"/>',h.svg],tops=topLines(model.root);
  layout.branch.edges.forEach(k=>{const x1=ox+k.from.x+k.from.w,y1=oy+k.from.y+k.from.h/2,x2=ox+k.to.x,y2=oy+k.to.y+k.to.h/2,b=Math.min(42,(x2-x1)*.42),active=layout.policy.has(k.from.node)&&layout.policy.has(k.to.node);out.push('<path data-tree-edge="" d="M '+n2(x1)+' '+n2(y1)+' C '+n2(x1+b)+' '+n2(y1)+', '+n2(x2-b)+' '+n2(y2)+', '+n2(x2)+' '+n2(y2)+'" fill="none" stroke="'+(active?C.accent:C.border)+'" stroke-width="'+(active?2.5:1.25)+'"/>');});
  layout.branch.items.forEach(i=>out.push(card({...i,x:ox+i.x,y:oy+i.y},model,results,ctx,C,layout,v,tops)));
  if(layout.mode==='continuation') out.push(register(layout,model,results,ctx,C,v,T.pad,oy+layout.branch.height+TREE_GEOM.registerGap));
  out.push(f.svg,'</svg>'); return out.join('');
}

function narrow(model,results,ctx,C,layout,verdictParts){
  const v=values(model),W=Math.ceil(layout.width),h=head(model,results,ctx,C,W,verdictParts),x0=TREE_GEOM.narrowPad,rec=model.root.kind==='decision'?results.policy.get(model.root):null,lead=rec?48:0,start=h.h+lead+4,f=flips(results,v,C,x0,start+layout.height+32,W-x0*2,ctx.measure),H=Math.ceil(start+layout.height+(f.h?54+f.h:26)+T.bottom),tops=topLines(model.root);
  const out=['<svg xmlns="http://www.w3.org/2000/svg" width="'+W+'" height="'+H+'" viewBox="0 0 '+W+' '+H+'" font-family=\''+SANS+'\'><rect width="'+W+'" height="'+H+'" fill="'+C.bg+'"/>',h.svg]; if(rec) out.push('<rect x="'+x0+'" y="'+h.h+'" width="'+(W-x0*2)+'" height="38" fill="none" stroke="'+C.accent+'"/><text x="'+(x0+12)+'" y="'+(h.h+15)+'" font-size="9" font-weight="650" letter-spacing="1.4" fill="'+C.accent+'">RECOMMENDED PATH</text><text x="'+(x0+12)+'" y="'+(h.h+30)+'" font-size="12" font-weight="650" fill="'+C.ink+'">'+e(rec.label)+'</text>');
  layout.rows.forEach(row=>{const x=x0+row.x,y=start+row.y,node=row.node,inlineEdit=ctx.edit&&!ctx.coarse,pathState=row.onPolicy?status(node,model.root,layout.policy,results):'ALTERNATIVE PATH · '+status(node,model.root,layout.policy,results);out.push('<g data-memo-row="'+node.srcLine+'" data-policy-state="'+(row.onPolicy?'recommended':'alternative')+'"'+(row.indentCapped?' data-indent-capped=""':'')+(ctx.coarse&&ctx.edit?' data-menu-only=""':'')+(ctx.edit&&tops.has(node)?' data-opt="'+tops.get(node)+'"':'')+'><rect x="'+x+'" y="'+y+'" width="'+row.w+'" height="'+row.h+'" fill="'+C.card+'" stroke="'+(row.onPolicy?C.accent:C.border)+'"'+(!row.onPolicy?' stroke-dasharray="4,3"':'')+'/><line x1="'+x+'" y1="'+y+'" x2="'+x+'" y2="'+(y+row.h)+'" stroke="'+(row.onPolicy?C.accent:C.muted)+'" stroke-width="3"/><text x="'+(x+14)+'" y="'+(y+18)+'" font-size="9" font-weight="650" fill="'+C.muted+'">'+e(row.id+' · '+pathState)+'</text>');let ty=y+42;if(row.ancestryLines.length){out.push('<g data-ancestry="'+e(row.ancestry)+'" aria-label="Continues from '+e(row.ancestry)+'">');row.ancestryLines.forEach(line=>{out.push('<text x="'+(x+14)+'" y="'+ty+'" font-size="9.5" font-weight="550" fill="'+C.muted+'">'+e(line)+'</text>');ty+=14;});out.push('</g>');ty+=4;}row.labelLines.forEach((line,i)=>{out.push('<text x="'+(x+14)+'" y="'+ty+'" font-size="14" font-weight="650" fill="'+C.ink+'">'+field('label',node,node.label,line,'Edit label: '+node.label,inlineEdit&&!node.implicit&&i===0)+'</text>');ty+=19;});if(node.p!=null){const hot=inlineEdit&&ctx.hot?.has('prob:'+node.srcLine);out.push('<text x="'+(x+14)+'" y="'+ty+'" font-size="11" fill="'+C.muted+'">'+field('prob',node,node.pRaw||(node.p==='rest'?'rest':''),v.prob(node.p),'Edit probability: '+node.label,inlineEdit,hot)+'</text>');ty+=16;}if(node.value)out.push('<text x="'+(x+14)+'" y="'+ty+'" font-size="11" fill="'+C.muted+'">'+field('value',node,node.valueRaw||'',v.range(node.value),'Edit payoff: '+node.label,inlineEdit,inlineEdit&&ctx.hot?.has('value:'+node.srcLine))+'</text>');const st=results.stats.get(node);if(st)out.push('<text x="'+(x+row.w-14)+'" y="'+(y+row.h-14)+'" text-anchor="end" font-size="11.5" font-weight="650" fill="'+C.ink+'"'+(ctx.edit?' data-mc=""':'')+'>EV '+e(v.money(st.mean))+'</text>');if(ctx.edit)out.push(menu(node,x+row.w-22,y+22,C,model.root));out.push('</g>');});out.push(f.svg,'</svg>');return out.join('');
}

function presentation(model,results,ctx,C,layout,verdictParts){
  const W=1920,H=1080,v=values(model),rawVerdict=verdictParts(model,results),verdictLimit=180;
  const verdictAbbreviated=rawVerdict.line.length>verdictLimit;
  const boundedVerdict=verdictAbbreviated
    ? {line:rawVerdict.line.slice(0,verdictLimit-1).replace(/[\s,.;:]+$/,'')+'…',fig:''}
    : rawVerdict;
  const h=head(model,results,ctx,C,W,()=>boundedVerdict,true);
  const comparison=decisionComparisonProjection(model,results),all=comparison.options;
  const sectionY=h.h+18,flip=comparison.closestFlip,seam=comparison.modelDisagreement;
  const start=h.h+((flip||seam)?88:68),footerY=1014,gap=12;
  const desiredCols=all.length<=1?1:all.length<=10?2:3;
  const comparisonWidth=(W-144-(desiredCols-1)*24)/desiredCols;
  const hasTwoLineTitle=all.some(option=>wrapText(option.label,'650 18px '+SANS,
    comparisonWidth-(option.recommended?170:62),ctx.measure).length>1);
  const minCardH=hasTwoLineTitle?136:120;
  const rowsFit=Math.max(1,Math.min(5,Math.floor((footerY-start+gap)/(minCardH+gap))));
  const capacity=desiredCols*rowsFit;
  let shown=all.slice(0,capacity);
  if(all.length>capacity&&comparison.recommendation&&!shown.some(option=>option.recommended)){
    shown=[...shown.slice(0,-1),all.find(option=>option.recommended)].sort((a,b)=>
      model.root.children.indexOf(a.node)-model.root.children.indexOf(b.node));
  }
  const cols=Math.min(desiredCols,Math.max(1,shown.length)),rows=Math.max(1,Math.ceil(shown.length/cols));
  const colGap=24,colW=(W-144-(cols-1)*colGap)/cols;
  const rowH=Math.max(minCardH,Math.min(148,Math.floor((footerY-start-(rows-1)*gap)/rows)));
  const out=['<svg xmlns="http://www.w3.org/2000/svg" width="1920" height="1080" viewBox="0 0 1920 1080" font-family=\''+SANS+'\'><rect width="1920" height="1080" fill="'+C.bg+'"/>',h.svg,
    '<text x="72" y="'+sectionY+'" font-size="14" font-weight="650" letter-spacing="2" fill="'+C.muted+'">DECISION COMPARISON</text>'];
  if(all.length<2){
    const kind=all.length===1?'only one root option':model.root?.kind==='chance'?'chance model':'single outcome';
    out.push('<rect x="72" y="'+(start+12)+'" width="1776" height="170" fill="'+C.card+'" stroke="'+C.border+'"/>',
      '<text x="96" y="'+(start+58)+'" font-size="15" font-weight="650" letter-spacing="1.6" fill="'+C.muted+'">NO ROOT DECISION TO COMPARE</text>',
      '<text x="96" y="'+(start+96)+'" font-size="26" font-weight="650" fill="'+C.ink+'">This has '+kind+'; there is no alternative to compare.</text>',
      '<text x="96" y="'+(start+132)+'" font-size="17" fill="'+C.muted+'">Use Native SVG for the complete model.</text>',
      '<line x1="72" y1="'+footerY+'" x2="1848" y2="'+footerY+'" stroke="'+C.border+'"/>',
      '<text x="72" y="1045" font-size="15" font-weight="650" letter-spacing="1.1" fill="'+C.muted+'">COMPARISON UNAVAILABLE · Native SVG remains exhaustive</text></svg>');
    return out.join('');
  }
  let sensitivityAbbreviated=false;
  if(seam){
    const left=clippedLines('On midpoints, '+comparison.midpointRecommendation.label+' edges ahead',
      '650 16px '+SANS,820,ctx.measure,1);
    const right=clippedLines('Across full ranges, Monte Carlo recommends '+comparison.recommendation.label,
      '650 13px '+SANS,820,ctx.measure,1);
    sensitivityAbbreviated=left.clipped||right.clipped;
    out.push('<g data-sensitivity-column="left"><text x="72" y="'+(sectionY+28)+'" font-size="16" font-weight="650" fill="'+C.ink+'">MIDPOINT SENSITIVITY · '+e(left.lines[0])+'</text></g>',
      '<g data-sensitivity-column="right"><text x="1848" y="'+(sectionY+28)+'" text-anchor="end" font-size="13" font-weight="650" fill="'+C.muted+'">'+e(right.lines[0])+'</text></g>');
  }else if(flip){
    const threshold=flip.kind==='prob'?'p='+n2(flip.threshold):v.money(flip.threshold);
    const authored=flip.kind==='prob'
      ? 'p='+n2(flip.authored.lo)+(flip.authored.lo===flip.authored.hi?'':'–'+n2(flip.authored.hi))
      : v.range(flip.authored);
    const rangeState=flip.insideAuthoredRange?'WITHIN AUTHORED 90% RANGE':'OUTSIDE AUTHORED 90% RANGE';
    const left=clippedLines('CLOSEST DECISION FLIP · '+flip.label+' '+(flip.kind==='prob'?'probability':'payoff')+' at '+threshold,
      '650 16px '+SANS,820,ctx.measure,1);
    const right=clippedLines(rangeState+' · AUTHORED '+authored,'650 13px '+SANS,820,ctx.measure,1);
    sensitivityAbbreviated=left.clipped||right.clipped;
    out.push('<g data-sensitivity-column="left"><text x="72" y="'+(sectionY+28)+'" font-size="16" font-weight="650" fill="'+C.ink+'">MIDPOINT SENSITIVITY · '+e(left.lines[0])+'</text></g>',
      '<g data-sensitivity-column="right"><text x="1848" y="'+(sectionY+28)+'" text-anchor="end" font-size="13" font-weight="650" fill="'+(flip.insideAuthoredRange?C.accent:C.muted)+'">'+e(right.lines[0])+'</text></g>');
  }else{
    out.push('<text x="72" y="'+(sectionY+28)+'" font-size="16" fill="'+C.muted+'">CLOSEST DECISION FLIP · No threshold found in the explored input ranges</text>');
  }
  let titlesAbbreviated=false;
  shown.forEach((option,i)=>{
    const col=i%cols,row=Math.floor(i/cols),x=72+col*(colW+colGap),y=start+row*(rowH+gap);
    const titleFit=clippedLines(option.label,'650 18px '+SANS,colW-(option.recommended?170:62),ctx.measure,2);
    const title=titleFit.lines; titlesAbbreviated ||= titleFit.clipped;
    const st=option.stats,mean=st?v.money(st.mean):'—',interval=st?v.money(st.p10)+' … '+v.money(st.p90):'—';
    const win=option.recommended?'REFERENCE':option.winRateVsRecommendation===null?'—':Math.round(option.winRateVsRecommendation*100)+'%';
    const chance=option.chanceInputs.length
      ? option.chanceInputs[0].label+' · '+option.chanceInputs[0].authored+(option.chanceInputs.length>1?' · +'+(option.chanceInputs.length-1)+' more':'')
      : 'None';
    const chanceLines=wrapText(chance,'12px '+SANS,colW-32,ctx.measure);
    const chanceLine=(chanceLines[0]||'')+(chanceLines.length>1?'…':'');
    out.push('<g data-comparison-option="'+option.node.srcLine+'"><rect x="'+x+'" y="'+y+'" width="'+colW+'" height="'+rowH+'" fill="'+C.card+'" stroke="'+(option.recommended?C.accent:C.border)+'" stroke-width="'+(option.recommended?2:1)+'"/>',
      '<line x1="'+x+'" y1="'+y+'" x2="'+x+'" y2="'+(y+rowH)+'" stroke="'+(option.recommended?C.accent:C.muted)+'" stroke-width="4"/>',
      '<text x="'+(x+16)+'" y="'+(y+20)+'" font-size="10" font-weight="650" letter-spacing="1.2" fill="'+C.muted+'">OPTION '+String(model.root.children.indexOf(option.node)+1).padStart(2,'0')+'</text>');
    if(option.recommended) out.push('<text x="'+(x+colW-16)+'" y="'+(y+20)+'" text-anchor="end" font-size="10" font-weight="700" letter-spacing="1.1" fill="'+C.accent+'">RECOMMENDED</text>');
    title.forEach((line,j)=>out.push('<text x="'+(x+16)+'" y="'+(y+43+j*20)+'" font-size="18" font-weight="650" fill="'+C.ink+'">'+e(line)+'</text>'));
    const metricsY=y+(title.length>1?78:61),m1=x+16,m2=x+colW*.34,m3=x+colW*.69;
    out.push('<text x="'+m1+'" y="'+metricsY+'" font-size="9" font-weight="650" letter-spacing="1" fill="'+C.muted+'">MEAN EV</text>',
      '<text x="'+m2+'" y="'+metricsY+'" font-size="9" font-weight="650" letter-spacing="1" fill="'+C.muted+'">P10–P90</text>',
      '<text x="'+m3+'" y="'+metricsY+'" font-size="9" font-weight="650" letter-spacing=".7" fill="'+C.muted+'">WIN RATE VS RECOMMENDATION</text>',
      '<text x="'+m1+'" y="'+(metricsY+17)+'" font-size="14" font-weight="650" fill="'+C.ink+'">'+e(mean)+'</text>',
      '<text x="'+m2+'" y="'+(metricsY+17)+'" font-size="14" font-weight="650" fill="'+C.ink+'">'+e(interval)+'</text>',
      '<text x="'+m3+'" y="'+(metricsY+17)+'" font-size="14" font-weight="650" fill="'+C.ink+'">'+e(win)+'</text>',
      '<text x="'+(x+16)+'" y="'+(y+rowH-29)+'" font-size="9" font-weight="650" letter-spacing="1" fill="'+C.muted+'">CHANCE INPUTS</text>',
      '<text x="'+(x+16)+'" y="'+(y+rowH-12)+'" font-size="12" fill="'+C.muted+'">'+e(chanceLine)+'</text></g>');
  });
  const complete=shown.length===all.length,provenancePartial=shown.some(option=>option.chanceInputs.length>1);
  const foot=(complete?'COMPLETE':'PARTIAL')+' ROOT COMPARISON · '+shown.length+' OF '+all.length+' OPTIONS'+
    (provenancePartial?' · CHANCE INPUTS ABBREVIATED':'')+(titlesAbbreviated?' · OPTION TITLES ABBREVIATED':'')+
    (sensitivityAbbreviated?' · SENSITIVITY LABELS ABBREVIATED':'')+
    (verdictAbbreviated?' · VERDICT ABBREVIATED FOR SLIDE · Native SVG keeps the full authored verdict':'')+
    (!verdictAbbreviated?' · Native SVG contains '+(complete?'the exhaustive branch model':'all options and branches'):'');
  out.push('<line x1="72" y1="'+footerY+'" x2="1848" y2="'+footerY+'" stroke="'+C.border+'"/><text x="72" y="1045" font-size="15" font-weight="650" letter-spacing="1.1" fill="'+C.muted+'">'+e(foot)+'</text></svg>');
  return out.join('');
}

export function renderDensity(model,results,ctx,verdictParts){
  const i=intent(ctx);
  if(i==='native'||i==='presentation') ctx={...ctx,edit:false,hot:new Set()};
  const C=colors(model,ctx),layout=layoutTree(model,results,{measure:ctx.measure,intent:i,width:ctx.width||(i==='live-narrow'?480:undefined)});
  if(i==='presentation')return presentation(model,results,ctx,C,layout,verdictParts);
  if(i==='live-narrow')return narrow(model,results,ctx,C,layout,verdictParts);
  return wide(model,results,ctx,C,layout,verdictParts);
}
