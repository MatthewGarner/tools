/* Pure text rewrites for /gauge compose-mode editing. No DOM.
   Text stays the source of truth: every affordance in the form preview
   (add/remove a question, rename it, change its type, edit the unit, and
   rename/add/remove a chip option) is exactly one undoable text change.

   Line rewrites take a single source line, verify it parses as a question,
   preserve leading indent, and return the new line or null (a no-op / guard
   fail). null means "don't dispatch". */
import {parse} from './parse.js';

export const QUESTION_TEMPLATE = 'New question :: prob';

/* Type -> the kind tail a fresh question of that type needs. →range gets a
   placeholder unit (tap the pill to fix — matches parse's "add a unit" nudge);
   →chips gets the 2-option minimum. */
const TAIL = {prob: 'prob', range: 'range units', chips: 'chips Option A | Option B'};

/* Where a new question line goes: after the last question, else after the
   config block, else at the end of the doc. Returns a 0-based line index and
   the new line (type defaults to prob; range/chips get starter tails). */
export function addQuestionLine(text, type = 'prob'){
  const newLine = 'New question :: ' + (TAIL[type] || TAIL.prob);
  const model = parse(text);
  if(model.questions.length){
    return {afterLine: model.questions[model.questions.length - 1].srcLine, newLine};
  }
  const lines = text.split(/\r?\n/);
  let lastConfig = -1;
  for(let i = 0; i < lines.length; i++){
    if(/^(title|names|palette|accent)\s*:/i.test(lines[i].trim())) lastConfig = i;
  }
  return {afterLine: lastConfig >= 0 ? lastConfig : lines.length - 1, newLine};
}

/* Only lines that parse as questions may be removed. */
export function removeQuestionLine(text, srcLine){
  return parse(text).questions.some(q => q.srcLine === srcLine);
}

/* ---- single-line helpers ---- */

/* Split a line into {indent, text, tail} where tail is everything after "::".
   Returns null unless the line parses as exactly one question. */
function splitQuestion(line){
  const model = parse(line);
  if(model.questions.length !== 1) return null;
  const indent = (line.match(/^\s*/) || [''])[0];
  const m = line.match(/^\s*(.*?)\s*::\s*(.+)$/);
  if(!m) return null;
  return {indent, text: m[1].trim(), tail: m[2].trim(), q: model.questions[0]};
}

const rebuild = (indent, text, tail) => indent + text + ' :: ' + tail;

/* A question's text must not itself parse as anything else: no "::" (would add
   a second one), no leading "//" (a comment), and no "title:/names:/..." head
   (silently converts the question to a config line — the trap). */
function validText(text){
  const t = text.trim();
  if(!t) return false;
  if(t.includes('::')) return false;
  if(t.startsWith('//')) return false;
  if(/^(title|names|palette|accent)\s*:/i.test(t)) return false;
  return true;
}

/* Rename: replace the text before "::", keep the kind tail verbatim. */
export function renameQuestion(line, newText){
  const parts = splitQuestion(line);
  if(!parts) return null;
  if(!validText(newText)) return null;
  return rebuild(parts.indent, newText.trim(), parts.tail);
}

/* Change the question's type, supplying/stripping the tail sensibly. No-op
   (null) when the type is unchanged. */
export function setType(line, type){
  const parts = splitQuestion(line);
  if(!parts) return null;
  if(!TAIL[type]) return null;
  if(parts.q.type === type) return null;
  return rebuild(parts.indent, parts.text, TAIL[type]);
}

/* Set the unit on a range question. Rejects empty units and non-range lines. */
export function setUnit(line, unit){
  const parts = splitQuestion(line);
  if(!parts || parts.q.type !== 'range') return null;
  const u = unit.trim();
  if(!u || u.includes('::')) return null;
  return rebuild(parts.indent, parts.text, 'range ' + u);
}

/* ---- chip options: read/rewrite the "chips A | B | C" tail ---- */
function chipOptions(parts){
  return parts.q.type === 'chips' ? parts.q.options.slice() : null;
}
function withOptions(parts, options){
  return rebuild(parts.indent, parts.text, 'chips ' + options.join(' | '));
}

export function renameOption(line, i, label){
  const parts = splitQuestion(line);
  const opts = parts && chipOptions(parts);
  if(!opts || i < 0 || i >= opts.length) return null;
  const l = label.trim();
  if(!l || l.includes('|') || l.includes('::')) return null;
  opts[i] = l;
  return withOptions(parts, opts);
}

export function addOption(line){
  const parts = splitQuestion(line);
  const opts = parts && chipOptions(parts);
  if(!opts || opts.length >= 8) return null;
  opts.push('Option ' + String.fromCharCode(65 + opts.length));   // next free letter
  return withOptions(parts, opts);
}

export function removeOption(line, i){
  const parts = splitQuestion(line);
  const opts = parts && chipOptions(parts);
  if(!opts || i < 0 || i >= opts.length || opts.length <= 2) return null;
  opts.splice(i, 1);
  return withOptions(parts, opts);
}
