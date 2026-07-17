/* Pure line rewrites for edit-in-place on the tree diagram. No DOM.
   Each apply() replaces exactly one component of one source line. */
import {parse, parseMoney} from './parse.js';
import {shiftRange, formatRange} from './format.js';

export const validators = {
  prob(v){
    const s = v.trim();
    if(/^rest$/i.test(s)) return true;
    const r = parseMoney(s);
    return r !== null && r.lo >= 0 && r.hi <= 1;
  },
  value(v){ return parseMoney(v.trim()) !== null; },
  label(v){
    const s = v.trim();
    return s.length > 0 && !/[[\]\n]/.test(s) && !s.startsWith('?');
  },
};

/* ---- add/remove branches (S1 shared mechanics) ---- */

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

function findNode(node, srcLine){
  if(!node.implicit && node.srcLine === srcLine) return node;
  for(const c of node.children){
    const f = findNode(c, srcLine);
    if(f) return f;
  }
  return null;
}

/* The line a "＋ Add option / outcome" popover action inserts: sensible child
   for the node's kind, at child indent, after the node's whole subtree.
   `select` is the placeholder the editor highlights for immediate rename. */
export function childLineFor(text, srcLine){
  const lines = text.split(/\r?\n/);
  if(srcLine < 0){   /* implicit root: a new top-level option */
    let last = lines.length - 1;
    while(last > 0 && !lines[last].trim()) last--;
    return {afterLine: last, newLine: 'New option: 0', select: 'New option'};
  }
  const model = parse(text);
  if(!model.root) return null;
  const node = findNode(model.root, srcLine);
  if(!node) return null;
  const indent = ' '.repeat(lineIndent(lines[srcLine]) + 2);
  let newLine, select;
  if(node.kind === 'decision'){
    newLine = indent + 'New option: 0'; select = 'New option';
  } else {   /* chance — or a leaf growing its first outcome */
    const hasRest = node.children.some(c => c.p === 'rest' || c.pRaw === 'rest');
    newLine = indent + 'New outcome (p=' + (hasRest ? '0.1' : 'rest') + '): 0';
    select = 'New outcome';
  }
  return {afterLine: subtreeRange(text, srcLine).to, newLine, select};
}

export const applies = {
  prob(line, _oldRaw, newRaw){
    return line.replace(/\(p=[^)]*\)/i, '(p=' + newRaw.trim() + ')');
  },
  value(line, oldRaw, newRaw){
    const i = line.lastIndexOf(oldRaw);
    if(i < 0) return line;
    return line.slice(0, i) + newRaw.trim() + line.slice(i + oldRaw.length);
  },
  label(line, oldRaw, newRaw){
    const start = line.search(/\S/);
    if(start < 0 || !line.slice(start).startsWith(oldRaw)) return line;
    return line.slice(0, start) + newRaw.trim() + line.slice(start + oldRaw.length);
  },
};

/* The priced-insistence slider's release-commit (B3, C2): translate the field's stated interval
   to the new midpoint x, WIDTH PRESERVED (shiftRange), format it back to DSL text, and splice it
   into the line via the existing applies.prob/applies.value (same regex/index-of splice either
   edit-in-place path already uses — one rewrite, one commit, undoable). `node` is the parsed node
   the line currently belongs to (its own p/value + pRaw/valueRaw); returns the line unchanged if
   the field isn't a real range (missing, or 'rest' — never hot, so never reachable via the slider,
   but a defensive no-op here rather than a throw). */
export function applyExplore(line, node, x, isProb){
  const range = isProb ? node.p : node.value;
  if(!range || range === 'rest') return line;
  const oldRaw = isProb ? (node.pRaw || '') : (node.valueRaw || '');
  const text = formatRange(shiftRange(range, x, isProb), isProb);
  return isProb ? applies.prob(line, oldRaw, text) : applies.value(line, oldRaw, text);
}
