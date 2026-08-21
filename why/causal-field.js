/* Causal Field: one source-ordered discovery tree, projected for reading. */
import {esc, btnAttrs} from '../assets/svg.js';
import {PALETTES, scheme} from '../assets/series.js';

const STAGES = ['outcome', 'opportunity', 'solution', 'assumption'];
const STATE = {
  candidate:'CANDIDATE', testing:'TESTING', delivering:'DELIVERING', shipped:'SHIPPED', parked:'PARKED',
  untested:'UNTESTED', holds:'HOLDS', broken:'BROKEN',
};
const WIDE = [
  {stage:'outcome', x:44, w:214}, {stage:'opportunity', x:300, w:260},
  {stage:'solution', x:616, w:250}, {stage:'assumption', x:914, w:258},
];
const measureFallback = text => String(text || '').length * 7;

export const causalDims = svg => ({
  width:+((svg.match(/\bwidth="([\d.]+)"/) || [, 1])[1]),
  height:+((svg.match(/\bheight="([\d.]+)"/) || [, 1])[1]),
});
export const svgInner = svg => svg.slice(svg.indexOf('>') + 1, svg.lastIndexOf('</svg>'));

export function causalColours(model, ctx){
  const accent = model.accent || (PALETTES[model.palette] && PALETTES[model.palette][ctx.dark ? 'dark' : 'light']);
  const source = accent ? {...ctx.colors, ...scheme(accent, !!ctx.dark)} : (ctx.colors || {});
  return {bg:source.bg || '#FBFBFA', ink:source.ink || '#111111', muted:source.muted || '#6B6B68',
    border:source.border || '#D9D9D5', err:source.err || '#B3403A'};
}

/* `wrapText` deliberately keeps a long token whole for ordinary prose. Field
   labels are bounded physical artefacts: preserve every authored character,
   but continue an unbroken identifier on the next measured line. */
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

function state(entry){ return entry.stage === 'solution' || entry.stage === 'assumption' ? (STATE[entry.node.status] || 'UNTESTED') : ''; }
function warning(model, line){ const hit = (model.warnings || []).find(w => w.startsWith('line ' + (line + 1) + ':')); return hit && hit.replace(/^line \d+:\s*/, ''); }
function diffLabel(entry, diff){ return diff && diff.badge && diff.badge(entry.node) ? String(diff.badge(entry.node).label).toUpperCase() : ''; }
function trail(entry){ return entry.trail.slice(0, -1).map(node => node.label).join(' › '); }
function semanticName(entry){ return entry.stage + ' · ' + entry.trail.map(node => node.label).join(' › ') + (state(entry) ? ' · ' + state(entry) : ''); }
function menu(entry){ return ' data-edit="cardmenu-' + entry.stage + '" data-line="' + entry.node.srcLine + '" data-raw="" data-menu=""' + btnAttrs('More options: ' + semanticName(entry)); }
function rename(entry){ return ' data-edit="label" data-line="' + entry.node.srcLine + '" data-raw="' + esc(entry.node.label) + '"' + btnAttrs('Rename: ' + semanticName(entry)); }
function stateEdit(entry){ const kind = entry.stage === 'solution' ? 'status' : 'astatus'; return ' data-edit="' + kind + '" data-line="' + entry.node.srcLine + '" data-raw="' + esc(entry.node.status) + '"' + btnAttrs('Set ' + entry.stage + ' state: ' + semanticName(entry)); }

function layoutWide(model, ctx, diff, startY){
  const measure = ctx.measure || measureFallback, rows = causalNodes(model), compact = !!ctx.bare; let y = startY, lastOutcome = null;
  for(const entry of rows){
    if(lastOutcome && entry.stage === 'outcome') y += 28;
    lastOutcome = entry.outcome;
    const col = WIDE[STAGES.indexOf(entry.stage)], sameStageAncestors = entry.trail.slice(0, -1).filter(node => node.kind === entry.stage).length, indent = Math.min(sameStageAncestors, 3) * 11;
    entry.x = col.x + indent; entry.w = col.w - indent; entry.size = entry.stage === 'outcome' ? (compact ? 18 : 20) : entry.stage === 'assumption' ? (compact ? 12 : 13) : (compact ? 14 : 15); entry.leading = entry.stage === 'outcome' ? (compact ? 22 : 24) : entry.stage === 'assumption' ? (compact ? 15 : 17) : (compact ? 17 : 19);
    entry.lines = wrapCausal(entry.node.label, (entry.stage === 'outcome' ? '700 ' : '600 ') + entry.size + 'px sans-serif', entry.w, measure); entry.note = state(entry); entry.badge = diffLabel(entry, diff); entry.warn = warning(model, entry.node.srcLine); entry.warnLines = entry.warn ? wrapCausal('SOURCE WARNING · ' + entry.warn, '400 10px sans-serif', entry.w, measure) : [];
    entry.h = (compact ? 4 : 8) + entry.lines.length * entry.leading + (entry.note ? (compact ? 14 : 17) : 0) + (entry.badge ? 15 : 0) + entry.warnLines.length * 13 + (compact ? 4 : 7) + (ctx.edit && entry.note ? 24 : 0); entry.y = y; y += entry.h + (entry.stage === 'outcome' ? (compact ? 12 : 20) : (compact ? 7 : 12));
  }
  return {rows, end:y};
}

function wide(model, projection, ctx, diff, c){
  const measure = ctx.measure || measureFallback;
  const titleLines = ctx.bare ? [] : wrapCausal(model.title || 'Untitled discovery', '700 27px sans-serif', 940, measure);
  const kickerY = ctx.bare ? 0 : 48 + titleLines.length * 31;
  const narrative = !ctx.bare && diff ? wrapCausal(diff.narrative, '600 11px sans-serif', 1040, measure) : [];
  const stageY = ctx.bare ? 30 : kickerY + 30 + narrative.length * 14;
  const {rows, end} = layoutWide(model, ctx, diff, ctx.bare ? 54 : stageY + 34);
  const dropped = diff && diff.dropped && diff.dropped.length ? wrapCausal('DROPPED · ' + diff.dropped.join(' · '), '600 10px sans-serif', 1128, measure) : [];
  const H = Math.ceil(end + (dropped.length ? 12 + dropped.length * 14 : 0) + 20);
  const out = ['<svg xmlns="http://www.w3.org/2000/svg" data-causal-field="why" data-causal-layout="field" role="' + (ctx.edit ? 'group' : 'img') + '" aria-label="Causal Field" width="1216" height="' + H + '" viewBox="0 0 1216 ' + H + '" font-family="-apple-system, BlinkMacSystemFont, Segoe UI, sans-serif"><rect width="1216" height="' + H + '" fill="' + c.bg + '"/>'];
  if(!ctx.bare){
    let titleY = 48;
    for(const line of titleLines){ out.push('<text x="44" y="' + titleY + '" font-size="27" font-weight="700" fill="' + c.ink + '">' + esc(line) + '</text>'); titleY += 31; }
    out.push('<text x="1172" y="48" text-anchor="end" font-size="11" letter-spacing="1" fill="' + c.muted + '">' + esc(String(ctx.today || '')) + '</text><text x="44" y="' + kickerY + '" font-size="10" font-weight="700" letter-spacing="1.35" fill="' + c.muted + '">CAUSAL FIELD · DISCOVERY CLAIMS</text>');
    narrative.forEach((line, index) => out.push('<text data-causal-narrative-line="' + index + '" x="44" y="' + (kickerY + 21 + index * 14) + '" font-size="11" font-weight="600" fill="' + c.muted + '">' + esc(line) + '</text>'));
  }
  for(const col of WIDE) out.push('<text data-causal-stage="' + col.stage + '" x="' + col.x + '" y="' + stageY + '" font-size="10" font-weight="700" letter-spacing="1.4" fill="' + c.muted + '">' + col.stage.toUpperCase() + '</text><line x1="' + col.x + '" y1="' + (stageY + 11) + '" x2="' + (col.x + col.w) + '" y2="' + (stageY + 11) + '" stroke="' + c.border + '"/>');
  for(const entry of rows){ if(!entry.parent) continue; const parent = entry.parent, sourceStage = STAGES.indexOf(parent.stage), targetStage = STAGES.indexOf(entry.stage), sourceY = parent.y + Math.min(parent.h - 9, parent.h / 2 + 4), targetY = entry.y + 10;
    if(sourceStage === targetStage){ const gutter = WIDE[sourceStage].x - 12; out.push('<path data-causal-link="' + parent.node.srcLine + ':' + entry.node.srcLine + '" data-causal-link-mode="gutter" d="M' + (parent.x - 3) + ' ' + sourceY + ' H' + gutter + ' V' + targetY + ' H' + (entry.x - 3) + '" fill="none" stroke="' + c.border + '" aria-hidden="true"/>'); }
    else if(targetStage < sourceStage){ const gutter = 1190; out.push('<path data-causal-link="' + parent.node.srcLine + ':' + entry.node.srcLine + '" data-causal-link-mode="return" d="M' + (parent.x + parent.w + 3) + ' ' + sourceY + ' H' + gutter + ' V' + targetY + ' H' + (entry.x - 3) + '" fill="none" stroke="' + c.border + '" aria-hidden="true"/>'); }
    else { const x1 = parent.x + parent.w + 6, x2 = entry.x - 11, bend = x1 + Math.max(12, (x2 - x1) / 2); out.push('<path data-causal-link="' + parent.node.srcLine + ':' + entry.node.srcLine + '" d="M' + x1 + ' ' + sourceY + ' H' + bend + ' V' + targetY + ' H' + (entry.x - 3) + '" fill="none" stroke="' + c.border + '" aria-hidden="true"/>'); }
  }
  for(const entry of rows){ const node = entry.node, broken = entry.stage === 'assumption' && node.status === 'broken', stateWidth = entry.note ? 96 : 0, menuWidth = entry.note ? entry.w - stateWidth - 8 : entry.w, attrs = ' data-causal-node="' + node.srcLine + '" data-line="' + node.srcLine + '" data-causal-stage="' + entry.stage + '" data-causal-context="' + esc(trail(entry)) + '"' + (entry.parent ? ' data-causal-parent="' + entry.parent.node.srcLine + '"' : '') + (broken ? ' data-causal-claim="broken"' : ''); out.push('<g' + attrs + '>');
    if(ctx.edit) out.push('<rect' + menu(entry) + ' data-hit="" x="' + entry.x + '" y="' + entry.y + '" width="' + menuWidth + '" height="' + Math.max(44, entry.h) + '" fill="transparent" pointer-events="all"/>'); if(entry.stage === 'outcome') out.push('<line x1="' + entry.x + '" y1="' + entry.y + '" x2="' + (entry.x + entry.w) + '" y2="' + entry.y + '" stroke="' + c.ink + '" stroke-width="2"/>');
    let ty = entry.y + 8 + entry.size; entry.lines.forEach((line, index) => { out.push('<text' + (ctx.edit && index === 0 ? rename(entry) : ' pointer-events="none"') + ' x="' + entry.x + '" y="' + ty + '" font-size="' + entry.size + '" font-weight="' + (entry.stage === 'outcome' ? '700' : '600') + '" fill="' + c.ink + '">' + esc(line) + '</text>'); ty += entry.leading; });
    if(entry.note){ const stateX = entry.x + entry.w - stateWidth; if(ctx.edit) out.push('<rect' + stateEdit(entry) + ' data-hit="" x="' + stateX + '" y="' + (ty - 13) + '" width="' + stateWidth + '" height="44" fill="transparent" pointer-events="all"/>'); out.push('<text data-causal-state="' + esc(node.status) + '" pointer-events="none" x="' + (entry.x + entry.w) + '" y="' + ty + '" text-anchor="end" font-size="10" font-weight="700" letter-spacing="1.1" fill="' + (broken ? c.err : c.muted) + '">' + esc(entry.note) + '</text>'); ty += 17; }
    if(entry.badge){ out.push('<text data-causal-diff="' + esc(entry.badge.toLowerCase()) + '" pointer-events="none" x="' + entry.x + '" y="' + ty + '" font-size="9.5" font-weight="700" letter-spacing="1" fill="' + c.muted + '">' + esc(entry.badge) + '</text>'); ty += 15; } for(const line of entry.warnLines){ out.push('<text data-causal-diagnostic-line="' + node.srcLine + '" pointer-events="none" x="' + entry.x + '" y="' + ty + '" font-size="10" fill="' + c.muted + '">' + esc(line) + '</text>'); ty += 13; } out.push('</g>');
  }
  if(dropped.length){ let y = H - 20 - (dropped.length - 1) * 14; for(const line of dropped){ out.push('<text data-causal-dropped="" x="44" y="' + y + '" font-size="10" font-weight="600" fill="' + c.muted + '" text-decoration="line-through">' + esc(line) + '</text>'); y += 14; } }
  return out.join('') + '</svg>';
}

function narrow(model, projection, ctx, diff, c){
  const W = ctx.width || 390, pad = 22, measure = ctx.measure || measureFallback, rows = causalNodes(model), out = []; let y = 30;
  out.push('<svg xmlns="http://www.w3.org/2000/svg" data-causal-field="why" data-causal-layout="stack" role="' + (ctx.edit ? 'group' : 'img') + '" aria-label="Causal Field, source-order stack" width="' + W + '" height="HEIGHT" viewBox="0 0 ' + W + ' HEIGHT" font-family="-apple-system, BlinkMacSystemFont, Segoe UI, sans-serif"><rect width="' + W + '" height="HEIGHT" fill="' + c.bg + '"/>');
  for(const line of wrapCausal(model.title || 'Untitled discovery', '700 22px sans-serif', W - pad * 2, measure)){ out.push('<text x="' + pad + '" y="' + y + '" font-size="22" font-weight="700" fill="' + c.ink + '">' + esc(line) + '</text>'); y += 27; } out.push('<text x="' + pad + '" y="' + y + '" font-size="10" font-weight="700" letter-spacing="1.25" fill="' + c.muted + '">CAUSAL FIELD · SOURCE ORDER</text>'); y += 32;
  for(const entry of rows){
    const node = entry.node, x = pad + Math.min(entry.depth, 3) * 10, w = W - x - pad;
    const contextLines = entry.parent ? wrapCausal('PATH · ' + trail(entry), '600 9px sans-serif', w, measure) : [];
    const labelLines = wrapCausal(node.label, '600 15px sans-serif', w, measure), note = state(entry);
    const badge = diffLabel(entry, diff), warn = warning(model, node.srcLine);
    const warningLines = warn ? wrapCausal('SOURCE WARNING · ' + warn, '400 10px sans-serif', w, measure) : [];
    const contentHeight = 31 + contextLines.length * 12 + labelLines.length * 18;
    const menuHeight = note ? Math.max(44, contentHeight) : 0;
    const h = note
      ? menuHeight + 4 + 44 + (badge ? 15 : 0) + warningLines.length * 13 + 8
      : Math.max(44, 14 + contextLines.length * 12 + labelLines.length * 18 + (badge ? 15 : 0) + warningLines.length * 13 + 8);
    const broken = entry.stage === 'assumption' && node.status === 'broken';
    const attrs = ' data-causal-node="' + node.srcLine + '" data-line="' + node.srcLine + '" data-causal-stage="' + entry.stage + '" data-causal-context="' + esc(trail(entry)) + '"' +
      (entry.parent ? ' data-causal-parent="' + entry.parent.node.srcLine + '"' : '') + (broken ? ' data-causal-claim="broken"' : '');
    out.push('<g' + attrs + '>');
    if(ctx.edit) out.push('<rect' + menu(entry) + ' data-hit="" x="' + x + '" y="' + y + '" width="' + w + '" height="' + (note ? menuHeight : h) + '" fill="transparent" pointer-events="all"/>');
    out.push('<line x1="' + (x - 9) + '" y1="' + y + '" x2="' + (x - 9) + '" y2="' + (y + h) + '" stroke="' + (entry.stage === 'outcome' ? c.ink : c.border) + '" stroke-width="' + (entry.stage === 'outcome' ? 2 : 1) + '"/>');
    let ty = y + 10;
    out.push('<text pointer-events="none" x="' + x + '" y="' + ty + '" font-size="9" font-weight="700" letter-spacing="1.2" fill="' + c.muted + '">' + entry.stage.toUpperCase() + '</text>');
    ty += 13;
    if(contextLines.length) out.push('<g data-causal-breadcrumb="' + esc('PATH · ' + trail(entry)) + '" pointer-events="none">');
    for(const line of contextLines){ out.push('<text x="' + x + '" y="' + ty + '" font-size="9" font-weight="600" letter-spacing=".3" fill="' + c.muted + '">' + esc(line) + '</text>'); ty += 12; }
    if(contextLines.length) out.push('</g>');
    labelLines.forEach((line, index) => { out.push('<text' + (ctx.edit && index === 0 ? rename(entry) : ' pointer-events="none"') + ' x="' + x + '" y="' + ty + '" font-size="15" font-weight="600" fill="' + c.ink + '">' + esc(line) + '</text>'); ty += 18; });
    if(note){
      const stateY = y + menuHeight + 4;
      if(ctx.edit) out.push('<rect' + stateEdit(entry) + ' data-hit="" x="' + x + '" y="' + stateY + '" width="132" height="44" fill="transparent" pointer-events="all"/>');
      out.push('<text data-causal-state="' + esc(node.status) + '" pointer-events="none" x="' + x + '" y="' + (stateY + 28) + '" font-size="10" font-weight="700" letter-spacing="1" fill="' + (broken ? c.err : c.muted) + '">' + esc(note) + '</text>');
      ty = stateY + 44;
    }
    if(badge){ ty += 11; out.push('<text data-causal-diff="' + esc(badge.toLowerCase()) + '" pointer-events="none" x="' + x + '" y="' + ty + '" font-size="9" font-weight="700" fill="' + c.muted + '">' + esc(badge) + '</text>'); ty += 4; }
    for(const line of warningLines){ ty += 11; out.push('<text data-causal-diagnostic-line="' + node.srcLine + '" pointer-events="none" x="' + x + '" y="' + ty + '" font-size="10" fill="' + c.muted + '">' + esc(line) + '</text>'); ty += 2; }
    out.push('</g>'); y += h + 13;
  }
  const dropped = diff && diff.dropped && diff.dropped.length ? wrapCausal('DROPPED · ' + diff.dropped.join(' · '), '600 10px sans-serif', W - pad * 2, measure) : []; if(dropped.length){ y += 4; for(const line of dropped){ out.push('<text data-causal-dropped="" x="' + pad + '" y="' + y + '" font-size="10" font-weight="600" fill="' + c.muted + '" text-decoration="line-through">' + esc(line) + '</text>'); y += 14; } }
  return out.join('').replaceAll('HEIGHT', String(Math.ceil(y + 18))) + '</svg>';
}

export function renderCausalField(model, projection, ctx, diff = null){ const c = causalColours(model, ctx); return ctx.width && ctx.width < 520 ? narrow(model, projection, ctx, diff, c) : wide(model, projection, ctx, diff, c); }
