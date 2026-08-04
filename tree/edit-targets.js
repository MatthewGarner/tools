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

/* A node's own probability is only meaningful when its PARENT is chance-kind —
   parse.js's finalise() assigns p (an authored range, 'rest', or a defaulted
   0 with a warning attached) to EVERY child of a chance node, and leaves it
   null for every other node (a decision or leaf parent has no probabilistic
   children, so nothing to assign). cardmenu-chance's "Edit probability…"
   field row is offered only when this is true — editing a p that doesn't
   exist has nothing honest to anchor to. */
export function hasIncomingProb(node){
  return !!node && node.p != null;
}

/* Mirrors parse.js's OWN value-detection exactly (the single check at
   "value = text after the final colon, if it parses as money"): a body's
   last colon is the value separator ONLY when what follows it parses as
   money — not "the last colon", full stop. validators.label permits colons
   inside a label ("Note: sub label", a bare "Branch A:"), so naively
   splitting on lastIndexOf(':') corrupts those into "Note (p=0.4): sub
   label" or a doubled "Branch A:: 5k". Returns the index of the real value
   colon, or -1 when the body carries no value component at all — the whole
   body is the label, colon(s) and all, same as parse.js would read it. */
function valueColon(body){
  const i = body.lastIndexOf(':');
  if(i < 0) return -1;
  const tail = body.slice(i + 1).trim();
  return tail && parseMoney(tail) ? i : -1;
}

export const applies = {
  /* Replace an existing "(p=...)" annotation. A node that DOES carry a real
     incoming p (hasIncomingProb above) can still have no textual annotation
     on its line — the "no p= among probabilistic siblings — given p=0"
     default in parse.js sets node.p without ever writing "(p=...)" into the
     source. Insert one instead of a no-op replace, anchored exactly where
     parse.js would find the value split (valueColon above) — never a bare
     lastIndexOf(':'), which mistakes a colon-bearing LABEL for one (the line
     has no "(p=...)" at this point, so it's already body-shaped and safe to
     hand straight to valueColon). No value component at all ⇒ append at the
     line's end. */
  prob(line, _oldRaw, newRaw){
    const v = newRaw.trim();
    if(/\(p=[^)]*\)/i.test(line)) return line.replace(/\(p=[^)]*\)/i, '(p=' + v + ')');
    const at = valueColon(line);
    if(at < 0) return line.replace(/\s+$/, '') + ' (p=' + v + ')';
    return line.slice(0, at).replace(/\s+$/, '') + ' (p=' + v + ')' + line.slice(at);
  },
  /* Replace the tail value component. The DSL permits a trailing money amount
     on ANY node line (decision and chance nodes, not just leaves), so a node
     with none yet (oldRaw '') is a legitimate target, not a foreign state —
     append "': value'" rather than splicing at the index lastIndexOf('')
     would return (line.length — a bare concatenation with no separator,
     corrupting the line: "Branch A5k" instead of "Branch A: 5k"). oldRaw ''
     also covers the line already ending in a BARE colon (parse.js's own
     tail-must-parse-as-money rule means "Branch A:" carries no value either
     — that dangling colon IS the separator waiting for its value): appending
     a second ": value" after it would double up into "Branch A:: 5k", so
     that case gets a plain " value" instead. */
  value(line, oldRaw, newRaw){
    const v = newRaw.trim();
    if(oldRaw){
      const i = line.lastIndexOf(oldRaw);
      if(i < 0) return line;
      return line.slice(0, i) + v + line.slice(i + oldRaw.length);
    }
    const trimmed = line.replace(/\s+$/, '');
    return /:$/.test(trimmed) ? trimmed + ' ' + v : trimmed + ': ' + v;
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
