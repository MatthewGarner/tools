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
     applyLineOps rejects. Check the CODE part only: a declaration whose comment
     mentions an arrow ("Foo @ custom // v1->v2") is still a declaration. */
  const [code, comment] = splitComment(lines[srcLine]);
  if(!code.includes('->')){
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

/* ---- edges (the Needs… toggle): an edge is a PAIR inside a possibly-longer
   chain line, never a line of its own by construction. ---- */

/* Add "from -> to" as a fresh line after the last non-blank line. A new 2-node
   line is the unambiguous form (splicing into an existing chain would change
   OTHER edges); appending also always lands after the config block. Returns
   {afterLine, newLine} for insertLinesAfter, or null (no-op) when: either end
   is blank/unknown/self, the pair already exists anywhere (a duplicate edge
   draws twice and double-counts in the metrics + needs tallies), or the line
   would not round-trip (an anchor may legally be NAMED "a -> b" — written into
   an edge line it shatters into different edges). */
export function addEdge(text, fromName, toName){
  const from = String(fromName || '').trim(), to = String(toName || '').trim();
  const fk = from.toLowerCase(), tk = to.toLowerCase();
  if(!fk || !tk || fk === tk) return null;
  const model = parse(text);
  const known = k => model.components.has(k) || model.anchors.some(a => a.name.toLowerCase() === k);
  if(!known(fk) || !known(tk)) return null;
  if(model.edges.some(e => e.from === fk && e.to === tk)) return null;
  const newLine = from + ' -> ' + to;
  if(!parse(text + '\n' + newLine).edges.some(e => e.from === fk && e.to === tk)) return null;
  const lines = linesOf(text);
  let last = 0;
  for(let i = 0; i < lines.length; i++) if(lines[i].trim()) last = i;
  return {afterLine: last, newLine};
}

/* Remove every occurrence of the pair from -> to. The pair may sit mid-chain:
   split the chain at each match into up-to-two fragments per cut, drop 1-node
   fragments (a bare name would re-declare a ghost), keep every OTHER edge on
   the line. Ops for applyLineOps: {line, text} rewrites (a middle split emits
   a two-line text — still ONE change, one undo) or {line, text: null} deletes
   when nothing chain-shaped survives (comment goes with the line, the
   removeComponent precedent). Empty segments are filtered the way parse() does,
   so "A ->  -> B" matches the (A,B) edge the parser actually sees. No-op on
   self/blank/absent pairs; reverse direction is its own edge, never touched. */
export function removeEdge(text, fromName, toName){
  const from = String(fromName || '').trim().toLowerCase();
  const to = String(toName || '').trim().toLowerCase();
  if(!from || !to || from === to) return [];
  const ops = [];
  linesOf(text).forEach((line, i) => {
    const [code, comment] = splitComment(line);
    if(!code.includes('->')) return;
    const names = code.split('->').map(s => s.trim()).filter(Boolean);
    if(names.length < 2) return;
    const frags = [[names[0]]];
    let cut = false;
    for(let j = 1; j < names.length; j++){
      if(names[j - 1].toLowerCase() === from && names[j].toLowerCase() === to){
        frags.push([names[j]]);
        cut = true;
      } else frags[frags.length - 1].push(names[j]);
    }
    if(!cut) return;
    const kept = frags.filter(f => f.length >= 2);
    if(!kept.length){ ops.push({line: i, text: null}); return; }
    const indent = code.match(/^\s*/)[0];
    ops.push({line: i, text: kept.map(f => indent + f.join(' -> ')).join('\n') + comment});
  });
  return ops;
}

/* ops [{line, text|null}] (null = delete) for applyLineOps: drop the
   declaration, splice the name out of every edge chain that mentions it.
   The declaration delete fires ONLY when the srcLine's CODE isn't itself an
   edge line — an edge-created ghost's srcLine IS one, and the splice pass owns
   it (a duplicate op would make applyLineOps throw). Check the code part only:
   a declaration whose comment mentions an arrow is still a declaration. */
export function removeComponent(text, srcLine, name){
  const lines = linesOf(text);
  const k = name.trim().toLowerCase();
  const ops = [];
  if(!splitComment(lines[srcLine])[0].includes('->')) ops.push({line: srcLine, text: null});
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
