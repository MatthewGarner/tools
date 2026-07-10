/* Pure text rewrites for /wardley edit-in-place + drag. No DOM.
   Every function returns [{line, text}] replacements the app dispatches
   through CodeMirror (undoable, text stays the source of truth). */
import {STAGES} from './parse.js';

export const kinds = {
  name:   {validate: v => !!v.trim() && !v.includes('->') && !v.includes('@') && !v.trim().includes(':')},
  anchor: {validate: v => !!v.trim() && !v.includes('->') && !v.includes('@') && !v.trim().includes(':')},
  stage:  {cycle: STAGES.map(s => s.name)},
};

const linesOf = text => text.split(/\r?\n/);

/* every edge line where `raw` appears as a segment, rewritten with `value` */
function edgeRewrites(lines, raw, value){
  const k = raw.trim().toLowerCase();
  const out = [];
  lines.forEach((line, i) => {
    if(!line.includes('->')) return;
    const segs = line.split('->').map(s => s.trim());
    if(!segs.some(s => s.toLowerCase() === k)) return;
    const indent = line.match(/^\s*/)[0];
    out.push({line: i, text: indent + segs.map(s => s.toLowerCase() === k ? value : s).join(' -> ')});
  });
  return out;
}

export function renameComponent(text, srcLine, raw, value){
  const lines = linesOf(text);
  const decl = lines[srcLine];
  const at = decl.match(/^(\s*)(.*?)(\s*@\s*.+)?$/);
  const declText = at[1] + value + (at[3] || '');
  return [{line: srcLine, text: declText}, ...edgeRewrites(lines, raw, value)];
}

export function renameAnchor(text, srcLine, raw, value){
  const lines = linesOf(text);
  return [{line: srcLine, text: 'anchor: ' + value}, ...edgeRewrites(lines, raw, value)];
}

function setPosition(text, srcLine, pos){
  const lines = linesOf(text);
  const m = lines[srcLine].match(/^(\s*)(.*?)(\s*@\s*.+)?$/);
  return [{line: srcLine, text: m[1] + m[2] + ' @ ' + pos}];
}

export function cycleStage(text, srcLine, value){
  return setPosition(text, srcLine, value);
}

export function dragRewrite(text, srcLine, newX){
  const x = Math.min(1, Math.max(0, newX));
  const r = Math.round(x * 100) / 100;
  return setPosition(text, srcLine, String(r));
}
