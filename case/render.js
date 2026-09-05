/* Measured Chapter reading surfaces. Selection is a lens; edits belong to source. */
import {esc, wrapText} from '../assets/svg.js';
import {chapterColors} from '../roadmap/chapter-colors.js';
import {project} from './review-model.js';

const e=v=>esc(String(v??''));
const fallback=(s,f)=>String(s).length*(Number(f.match(/([\d.]+)px/)?.[1])||16)*.51;
export function reviewTypography(model){return {body:'DM Sans',display:/^(dm-sans|DM Sans)$/.test(model.font)?'DM Sans':'Instrument Serif',weight:/^(dm-sans|DM Sans)$/.test(model.font)?600:400};}
export function reviewColors(model,ctx={}){return chapterColors({...model,accent:model.accent||(!model.palette?'#526F65':null)},ctx);}
export function renderReview(input,ctx={},opts={}){
  const m=project(input),W=Math.max(280,ctx.width||960),phone=W<600,P=phone?16:28,I=W-P*2;
  const c=reviewColors(m,ctx),t=reviewTypography(m),measure=ctx.measure||fallback,parts=[];
  const line=(y,x=P,w=I)=>parts.push(`<line x1="${x}" y1="${y}" x2="${x+w}" y2="${y}" stroke="${c.border}"/>`);
  const block=(value,x,y,w,size=16,{color=c.ink,display=false,weight=400,tracking=0}={})=>{
    if(!value)return y;
    const family=display?t.display:t.body,fw=display?t.weight:weight;
    const rows=wrapText(String(value),`${fw} ${size}px "${family}"`,Math.max(20,w),measure),step=Math.ceil(size*1.28);
    rows.forEach((s,i)=>parts.push(`<text x="${x}" y="${y+size+i*step}" font-family="${family}" font-weight="${fw}" font-size="${size}" fill="${color}"${tracking?` letter-spacing="${tracking}"`:''}>${e(s)}</text>`));
    return y+rows.length*step;
  };
  const micro=(v,x,y,w=I)=>block(v,x,y,w,11,{color:c.accent,weight:600,tracking:1.4});
  const hit=(kind,id,label,y,h)=>{
    if(!opts.live)return;
    parts.push(`<g role="button" tabindex="0" data-kind="${e(kind)}" data-id="${e(id)}" aria-label="Inspect ${e(label)}" aria-pressed="${opts.selected===kind+':'+id}"><rect x="${P}" y="${y}" width="${I}" height="${Math.max(44,h)}" fill="transparent" class="case-hit"/></g>`);
  };
  let y=24;
  y=micro((m.title||'Case')+' / '+({brief:'DECISION REVIEW',compare:'ALTERNATIVES',review:'REVIEW RECORD'}[m.view]||'DECISION REVIEW'),P,y)+22;
  const headline=m.view==='compare'?(m.question||'Weigh the alternatives'):m.view==='review'?'How the decision changed':m.headline||m.title||'Make the decision clear.';
  y=block(headline,P,y,I,phone?40:W<800?48:64,{display:true})+22;
  if(m.question&&m.view!=='compare'&&m.question!==headline)y=block(m.question,P,y,I,17,{color:c.muted})+24;
  if(!m.headline&&m.verdict&&m.verdict!=='off')y=block(m.verdict,P,y,I,20)+24;
  if(m.decision||m.unresolved){
    const start=y;y+=16;
    const insert=parts.length;
    const decision=[m.decision,m.date].filter(Boolean).join(' · ');
    const fits=!phone&&measure(decision,'600 16px "DM Sans"')+measure(m.unresolved||'','400 15px "DM Sans"')+68<I;
    y=block(decision,P+16,y,I-32,16,{weight:600});
    if(m.unresolved)y=fits?Math.max(y,block(m.unresolved,P+40+measure(decision,'600 16px "DM Sans"'),start+16,I-measure(decision,'600 16px "DM Sans"')-56,15,{color:c.muted})):block(m.unresolved,P+16,y+8,I-32,15,{color:c.muted});
    y+=16;parts.splice(insert,0,`<rect x="${P}" y="${start}" width="${I}" height="${y-start}" fill="${c.band}"/>`);y+=30;
  }
  if(m.view==='compare'){
    if(!m.options.length)y=block('Add the alternatives you are considering. Describe the trade-offs in your own terms.',P,y,I,18,{color:c.muted})+24;
    else if(phone){
      for(const o of m.options){const start=y;line(y);y=block(o.label,P,y+18,I,30,{display:true})+12;
        for(const [label,key] of [['Expected value / outcome','value'],['What must be true','requires'],['Main downside','downside'],['What changes the choice','reconsider']])if(o[key]){y=micro(label.toUpperCase(),P,y)+6;y=block(o[key],P,y,I,16)+18;}
        hit('option',o.id,o.label,start,y-start);y+=12;
      }
    }else{
      // Pair-sized groups keep six or more alternatives readable without narrowing type.
      for(let offset=0;offset<m.options.length;offset+=3){
        const options=m.options.slice(offset,offset+3),labelW=145,gap=22,cw=(I-labelW-gap)/options.length;
        let high=y;
        options.forEach((o,i)=>{const x=P+labelW+gap+i*cw;high=Math.max(high,block(o.label,x,y,cw-20,30,{display:true,color:opts.selected==='option:'+o.id?c.accent:c.ink}));});
        y=high+22;line(y);
        for(const [label,key] of [['Expected value / outcome','value'],['What must be true','requires'],['Main downside','downside'],['What changes the choice','reconsider']]){
          if(!options.some(o=>o[key]))continue;
          const start=y;y+=20;high=block(label,P,y,labelW,14,{color:c.muted});
          options.forEach((o,i)=>{high=Math.max(high,block(o[key]||'Not stated',P+labelW+gap+i*cw,y,cw-20,key==='value'?22:16,{weight:key==='value'?600:400,color:o[key]?c.ink:c.muted}));});
          y=high+22;line(y);
          if(opts.live)options.forEach((o,i)=>parts.push(`<g role="button" tabindex="0" data-kind="option" data-id="${e(o.id)}" aria-label="Inspect ${e(o.label)}: ${e(label)}"><rect x="${P+labelW+gap+i*cw}" y="${start}" width="${cw}" height="${y-start}" fill="transparent" class="case-hit"/></g>`));
        }y+=40;
      }
    }
  }else if(m.view==='review'){
    if(!m.reviews.length)y=block('Record a review when evidence, assumptions or the choice changes. Earlier decisions and captured references stay on record.',P,y,I,18,{color:c.muted})+24;
    for(const r of m.reviews){const start=y;line(y);y+=22;const margin=phone?0:126;
      if(phone)y=micro(r.date||'UNDATED',P,y)+12;else micro(r.date||'UNDATED',P,y,110);
      y=block(r.label,P+margin,y,I-margin,34,{display:true})+16;
      for(const [label,key] of [['Changed','change'],['Implication','implication'],['Decision','decision']])if(r[key]){y=micro(label.toUpperCase(),P+margin,y,I-margin)+7;y=block(r[key],P+margin,y,I-margin,17)+18;}
      if(r.previous||r.url)y=block('Captured references available',P+margin,y,I-margin,14,{color:c.accent})+16;
      hit('review',r.id,r.label,start,y-start);y+=16;
    }
  }else{
    if(m.claims.length){y=micro('REASONS & BASIS',P,y)+14;line(y);}
    for(const claim of m.claims){
      const start=y,selected=opts.selected==='claim:'+claim.id,insert=parts.length;y+=17;
      const qWidth=phone?0:Math.min(245,I*.29),mainW=I-(qWidth?qWidth+30:0);
      y=micro([claim.basis||'basis not stated',claim.reference?.tool||claim.tool||claim.lane].filter(Boolean).join(' / ').toUpperCase(),P+12,y,mainW-24)+8;
      y=block(claim.label,P+12,y,mainW-24,phone?29:32,{display:true})+10;
      if(claim.detail)y=block(claim.detail,P+12,y,mainW-24,16)+8;
      const qualification=[claim.qualification,claim.captureQualification].filter(Boolean).join(' ');
      if(qWidth){const x=P+I-qWidth;y=Math.max(y,block(qualification,x,start+38,qWidth-12,15,{color:c.muted})+16);}
      else if(qualification)y=block(qualification,P+12,y+8,I-24,15,{color:c.muted})+8;
      if(claim.planningContext||claim.reference?.planningContext||claim.planning){
        const p=claim.planningContext||claim.reference?.planningContext||claim.planning;y=block(`${p.role} · ${p.scope}`,P+12,y+8,I-24,13,{color:c.accent})+5;
        if(p.basis){y=block(`From Paths: ${p.basis.source}`,P+12,y,I-24,13,{color:c.muted})+5;
          for(const [label,entries] of [['Known',p.basis.known],['Assumed',p.basis.assumed]])if(entries?.length)y=block(label+': '+entries.map(a=>`${a.key}=${a.direction} @ ${a.date}`).join(', '),P+12,y,I-24,13,{color:c.muted})+4;}
      }
      y+=17;if(selected)parts.splice(insert,0,`<rect x="${P}" y="${start}" width="${I}" height="${y-start}" fill="${c.tint}"/>`);
      hit('claim',claim.id,claim.label,start,y-start);line(y);
    }
    if(!m.claims.length)y=block('Start with a reason, an assumption, or a captured tool model. Keep the choice and its basis together.',P,y,I,18,{color:c.muted})+24;
    if(m.options.length){y+=28;y=micro('ALTERNATIVES',P,y)+15;
      const cols=phone?1:Math.min(m.options.length,3),cw=I/cols;
      for(let offset=0;offset<m.options.length;offset+=cols){let bottom=y;
        m.options.slice(offset,offset+cols).forEach((o,i)=>{const x=P+i*cw;let yy=block(o.label,x,y,cw-20,17);yy=block(o.value,x,yy+7,cw-20,16,{color:c.accent,weight:500});bottom=Math.max(bottom,yy);
          if(opts.live)parts.push(`<g role="button" tabindex="0" data-kind="option" data-id="${e(o.id)}" aria-label="Inspect ${e(o.label)}"><rect x="${x}" y="${y-6}" width="${cw-12}" height="${Math.max(52,yy-y+16)}" fill="transparent" class="case-hit"/></g>`);
        });y=bottom+26;
      }
    }
  }
  if(m.constraints){y+=12;line(y);y=micro('NON-NEGOTIABLE',P,y+20)+10;y=block(m.constraints,P,y,I,17)+24;}
  const H=Math.ceil(y+24);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="${e(m.title||'Case review')}" font-family="DM Sans"><rect width="${W}" height="${H}" fill="${c.bg}"/>${parts.join('')}</svg>`;
}

export const render = renderReview;
export const NARROW = 520;
export const renderNarrow = (model,ctx={},opts={}) => renderReview(model,{...ctx,width:ctx.width||390},opts);
