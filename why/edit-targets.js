/* Pure line rewrites for edit-in-place on the /why diagram. No DOM. */
import {parse} from './parse.js';

export const SOLUTION_STATUSES = ['candidate', 'testing', 'delivering', 'shipped', 'parked'];
export const ASSUMPTION_CYCLE = ['untested', 'testing', 'holds', 'broken'];

/* ---- add/remove nodes (S1 shared mechanics) ---- */

const lineIndent = raw => raw.replace(/\t/g, '  ').match(/^ */)[0].length;

/* A node's source lines: itself plus every deeper-indented line below it.
   Blank/comment lines inside the subtree ride along; trailing ones do not. */
export function subtreeRange(text, srcLine){
  const lines = text.split(/\r?\n/);
  if(srcLine < 0 || srcLine >= lines.length) return null;
  const t = lines[srcLine].trim();
  if(!t || t.startsWith('//')) return null;
  const base = lineIndent(lines[srcLine]);
  let to = srcLine;
  for(let i = srcLine + 1; i < lines.length; i++){
    const s = lines[i].trim();
    if(!s || s.startsWith('//')) continue;
    if(lineIndent(lines[i]) <= base) break;
    to = i;
  }
  return {from: srcLine, to};
}

const CHILD_FOR = {
  outcome:     {tail: 'New opportunity', select: 'New opportunity'},
  opportunity: {tail: 'New solution [candidate]', select: 'New solution'},
  solution:    {tail: '? New assumption', select: 'New assumption'},
};

/* The line a card's "＋ Add …" action inserts: the natural child for the
   card's kind, at child indent, after the card's whole subtree. `select` is
   the placeholder the editor highlights for immediate rename. */
export function childLineFor(text, srcLine){
  const model = parse(text);
  let node = null;
  (function find(n){ if(n.srcLine === srcLine) node = n; n.children.forEach(find); })(
    {srcLine: -1, children: model.outcomes});
  if(!node) return null;
  const spec = CHILD_FOR[node.kind];
  if(!spec) return null;
  const indent = ' '.repeat(lineIndent(text.split(/\r?\n/)[srcLine]) + 2);
  return {afterLine: subtreeRange(text, srcLine).to, newLine: indent + spec.tail, select: spec.select};
}

export const validators = {
  label(v){
    const s = v.trim();
    return s.length > 0 && !/[[\]\n]/.test(s) && !s.startsWith('?') && !/^outcome\s*:/i.test(s);
  },
};

export const applies = {
  /* replace the [status] tag, or append one if the line has none (untested default) */
  status(line, _oldRaw, newRaw){
    if(/\[[^\]]+\]/.test(line)) return line.replace(/\[[^\]]+\]/, '[' + newRaw + ']');
    return line.replace(/\s*$/, '') + ' [' + newRaw + ']';
  },
  label(line, oldRaw, newRaw){
    const i = line.indexOf(oldRaw);
    if(i < 0) return line;
    return line.slice(0, i) + newRaw.trim() + line.slice(i + oldRaw.length);
  },
};
