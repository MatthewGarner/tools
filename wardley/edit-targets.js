/* Pure text rewrites for /wardley edit-in-place + drag. No DOM.
   Every function returns [{line, text}] replacements the app dispatches
   through CodeMirror (undoable, text stays the source of truth). */
import {STAGES, parse} from './parse.js';

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

/* every edge line where `raw` appears as a segment, rewritten with `value`.
   Comment-aware: split the comment off FIRST — "A -> B // note" used to feed
   "B // note" as a segment, so renames silently skipped commented edges. */
function edgeRewrites(lines, raw, value){
  const k = raw.trim().toLowerCase();
  const out = [];
  lines.forEach((line, i) => {
    const [code, comment] = splitComment(line);
    if(!code.includes('->')) return;
    const segs = code.split('->').map(s => s.trim());
    if(!segs.some(s => s.toLowerCase() === k)) return;
    const indent = code.match(/^\s*/)[0];
    out.push({line: i, text: indent +
      segs.map(s => s.toLowerCase() === k ? value : s).join(' -> ') + comment});
  });
  return out;
}

export function renameComponent(text, srcLine, raw, value){
  const lines = linesOf(text);
  const edits = edgeRewrites(lines, raw, value);
  /* an edge-created ghost's srcLine IS an edge line — edgeRewrites already owns
     it; a separate declaration op on the same line would be a duplicate that
     applyLineOps rejects (mirrors removeComponent's guard) */
  if(!lines[srcLine].includes('->')){
    const [code, comment] = splitComment(lines[srcLine]);
    const at = code.match(/^(\s*)(.*?)(\s*@\s*.+)?$/);
    edits.unshift({line: srcLine, text: at[1] + value + (at[3] || '') + comment});
  }
  return edits;
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

const CONFIG_LINE = /^(title|palette|accent)\s*:/i;   // anchor: is a declaration, not config

/* new components land after the last declaration BEFORE the edge block —
   edge-auto-created ghosts carry the EDGE's srcLine and never count */
export function addComponent(text, name, stage){
  const model = parse(text);
  const firstEdge = model.edges.length ? model.edges[0].srcLine : Infinity;
  const edgeLines = new Set(model.edges.map(e => e.srcLine));
  const candidates = [];
  for(const c of model.components.values())
    if(!edgeLines.has(c.srcLine) && c.srcLine < firstEdge) candidates.push(c.srcLine);
  for(const a of model.anchors)
    if(a.srcLine >= 0 && a.srcLine < firstEdge) candidates.push(a.srcLine);
  const newLine = stage ? name + ' @ ' + stage : name;
  if(candidates.length)
    return {afterLine: Math.max(...candidates), newLine, select: name};
  const lines = linesOf(text);
  let last = -1;
  for(let i = 0; i < lines.length; i++){
    const t = lines[i].trim();
    if(!t || t.startsWith('//')) continue;
    if(CONFIG_LINE.test(t)) last = i;
    else break;
  }
  return {afterLine: Math.max(0, last), newLine, select: name};
}

/* ops [{line, text|null}] (null = delete) for applyLineOps: drop the
   declaration, splice the name out of every edge chain that mentions it.
   The declaration delete fires ONLY when the srcLine isn't itself an edge
   line — an edge-created ghost's srcLine IS one, and the splice pass owns
   it (a duplicate op would make applyLineOps throw). */
export function removeComponent(text, srcLine, name){
  const lines = linesOf(text);
  const k = name.trim().toLowerCase();
  const ops = [];
  if(!lines[srcLine].includes('->')) ops.push({line: srcLine, text: null});
  const seen = new Set();
  for(const e of parse(text).edges){
    if(seen.has(e.srcLine)) continue;
    seen.add(e.srcLine);
    const [code, comment] = splitComment(lines[e.srcLine]);
    const segs = code.split('->').map(s => s.trim());
    if(!segs.some(s => s.toLowerCase() === k)) continue;
    const kept = segs.filter(s => s.toLowerCase() !== k)
      .filter((s, i, a) => i === 0 || s.toLowerCase() !== a[i - 1].toLowerCase());
    if(kept.length < 2){ ops.push({line: e.srcLine, text: null}); continue; }
    const indent = code.match(/^\s*/)[0];
    ops.push({line: e.srcLine, text: indent + kept.join(' -> ') + comment});
  }
  return ops;
}
