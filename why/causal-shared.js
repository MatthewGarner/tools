import {PALETTES, scheme} from '../assets/series.js';

const STAGES = ['outcome', 'opportunity', 'solution', 'assumption'];
const measureFallback = text => String(text || '').length * 7;

export const causalDims = svg => ({
  width:+((svg.match(/\bwidth="([\d.]+)"/) || [, 1])[1]),
  height:+((svg.match(/\bheight="([\d.]+)"/) || [, 1])[1]),
});
export const svgInner = svg => svg.slice(svg.indexOf('>') + 1, svg.lastIndexOf('</svg>'));

export function causalColours(model, ctx){
  const accent = model.accent || (PALETTES[model.palette] && PALETTES[model.palette][ctx.dark ? 'dark' : 'light']);
  const source = accent ? {...ctx.colors, ...scheme(accent, !!ctx.dark)} : (ctx.colors || {});
  return {bg:source.bg || '#FBFBFA', card:source.card || '#FFFFFF', ink:source.ink || '#111111', muted:source.muted || '#6B6B68',
    border:source.border || '#D9D9D5', err:source.err || '#B3403A'};
}

/* Unlike prose wrapping, a rendered claim must contain every authored token. */
export function wrapCausal(text, font, maxW, measure = measureFallback){
  const width = value => measure(String(value), font);
  const parts = [];
  for(const word of String(text || '').trim().split(/\s+/).filter(Boolean)){
    if(width(word) <= maxW){ parts.push({text:word, continuation:false}); continue; }
    let piece = '', pieceIndex = 0;
    for(const char of Array.from(word)){
      if(piece && width(piece + char) > maxW){ parts.push({text:piece, continuation:pieceIndex++ > 0}); piece = char; }
      else piece += char;
    }
    if(piece) parts.push({text:piece, continuation:pieceIndex > 0});
  }
  const out = [];
  let line = '';
  for(const part of parts){
    const trial = line ? line + (part.continuation ? '' : ' ') + part.text : part.text;
    if(!line || width(trial) <= maxW) line = trial;
    else { out.push(line); line = part.text; }
  }
  if(line) out.push(line);
  return out;
}

export function causalNodes(model){
  const entries = [];
  const walk = (node, parent, outcome, trail, depth) => {
    const stage = STAGES.includes(node.kind) ? node.kind : 'opportunity';
    const entry = {node, parent, outcome:outcome || node, trail:[...trail, node], depth, stage};
    entries.push(entry);
    for(const child of node.children || []) walk(child, entry, outcome || node, entry.trail, depth + 1);
  };
  for(const outcome of model.outcomes || []) walk(outcome, null, outcome, [], 0);
  return entries;
}
