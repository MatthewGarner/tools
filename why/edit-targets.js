/* Pure line rewrites for edit-in-place on the /why diagram. No DOM. */
import {parse} from './parse.js';

/* single source in parse.js; the assumption cycle order is that status list */
export {SOLUTION_STATUSES, ASSUMPTION_STATUSES as ASSUMPTION_CYCLE} from './parse.js';

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
    return s.length > 0 && !/[[\]\r\n]/.test(s) && !s.startsWith('?') && !/^outcome\s*:/i.test(s);
  },
};

/* parse.js expands tabs to two spaces before recording node.label. Keep the
   rewriter on the original source so a native rename still edits exactly one
   authored line, rather than becoming a falsely acknowledged no-op. */
function normalisedSourceSpan(line, label){
  const raw = String(line);
  let normalised = '';
  const offsets = [];
  for(let index = 0; index < raw.length; index++){
    if(raw[index] === '\t') { normalised += '  '; offsets.push(index, index); }
    else { normalised += raw[index]; offsets.push(index); }
  }
  /* The parser removes exactly the first [status] tag before it derives the
     label. A status word can be the same text as the label, so never search
     into that tag. Then skip the two syntactic prefixes which parse.js removes
     from the label itself. */
  const tag = normalised.match(/\[[^\]]+\]/);
  const labelLimit = tag?.index ?? normalised.length;
  let searchStart = 0;
  while(searchStart < labelLimit && /\s/.test(normalised[searchStart])) searchStart++;
  if(normalised[searchStart] === '?') {
    searchStart++;
    while(searchStart < labelLimit && /\s/.test(normalised[searchStart])) searchStart++;
  }
  const outcome = normalised.slice(searchStart, labelLimit).match(/^outcome\s*:\s*/i);
  if(outcome) searchStart += outcome[0].length;
  const start = normalised.indexOf(label, searchStart);
  if(start < 0 || start + label.length > labelLimit) return null;
  const end = start + label.length;
  return {start: offsets[start], end: end < offsets.length ? offsets[end] : raw.length};
}

export const applies = {
  /* replace the [status] tag, or append one if the line has none (untested default) */
  status(line, _oldRaw, newRaw){
    if(/\[[^\]]+\]/.test(line)) return line.replace(/\[[^\]]+\]/, '[' + newRaw + ']');
    return line.replace(/\s*$/, '') + ' [' + newRaw + ']';
  },
  label(line, oldRaw, newRaw){
    const span = normalisedSourceSpan(line, oldRaw);
    if(!span) return line;
    return line.slice(0, span.start) + newRaw.trim() + line.slice(span.end);
  },
};
