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

/* a line is code + optional trailing comment; rewrites act on the code and
   re-attach the comment (a ghost drag once wrote "@ 0.6" AFTER the comment,
   invisible to the parser — the dot snapped back) */
function splitComment(line){
  const i = line.indexOf('//');
  return i === -1 ? [line, ''] : [line.slice(0, i).replace(/\s+$/, ''), '   ' + line.slice(i)];
}

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
  const [code, comment] = splitComment(lines[srcLine]);
  const at = code.match(/^(\s*)(.*?)(\s*@\s*.+)?$/);
  const declText = at[1] + value + (at[3] || '') + comment;
  return [{line: srcLine, text: declText}, ...edgeRewrites(lines, raw, value)];
}

export function renameAnchor(text, srcLine, raw, value){
  const lines = linesOf(text);
  return [{line: srcLine, text: 'anchor: ' + value}, ...edgeRewrites(lines, raw, value)];
}

function setPosition(text, srcLine, pos){
  const lines = linesOf(text);
  const [code, comment] = splitComment(lines[srcLine]);
  const m = code.match(/^(\s*)(.*?)(\s*@\s*.+)?$/);
  return [{line: srcLine, text: m[1] + m[2] + ' @ ' + pos + comment}];
}

export function cycleStage(text, srcLine, value){
  return setPosition(text, srcLine, value);
}

export function dragRewrite(text, srcLine, newX){
  const x = Math.min(1, Math.max(0, newX));
  const r = Math.round(x * 100) / 100;
  return setPosition(text, srcLine, String(r));
}
