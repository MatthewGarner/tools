/* Pure decision-field rewrites for /paths edit-in-place. No DOM.
   Every mutator returns CodeMirror-ready [{line, text}] operations:
   `line` is a zero-based source line, `text: null` deletes, and a `text`
   containing "\n" inserts without replacing the whole document. `null` means
   the request was unsafe (invalid value, stale line, or a heading that is not
   a real parsed decision); `[]` is a safe no-op, used when clearing a field
   that is already absent.

   Decision identity is its parsed, zero-based heading srcLine. Field lines are
   never trusted as identity: a render can be stale after another edit, while
   the decision heading remains the one stable target the inspector owns. */
import {DECISION_FIELDS, isValidDate, parse, parseCondition} from './parse.js';

const FIELD_ORDER = new Map(DECISION_FIELDS.map((field, index) => [field, index]));
const FIELD = /^([a-z-]+)\s*:\s*(.*)$/i;
const CONFIG = /^(title|date|today|style|verdict|palette|accent)\s*:/i;
const DIRECTIONS = new Set(['yes', 'no']);

const cleanLine = value => {
  const text = String(value ?? '').trim();
  return !/[\r\n]/.test(text) && !/(^|\s)\/\//.test(text) ? text : null;
};

function splitComment(line){
  const match = /(\s+\/\/.*)$/.exec(line);
  if(!match) return {code:line.replace(/\s+$/, ''), comment:''};
  return {code:line.slice(0, match.index).replace(/\s+$/, ''), comment:match[1]};
}

function findDecision(text, srcLine){
  if(!Number.isInteger(srcLine) || srcLine < 0) return null;
  return parse(text).decisions.find(decision => decision.srcLine === srcLine) || null;
}

/* Scan exactly as long as parse.js keeps the target decision block open.
   Blank/comment lines and zero-indent config lines do not close it; another
   heading or an indented non-field does. Unknown indented fields also keep the
   block open, matching the parser's warning-and-continue recovery. */
function decisionBlock(text, srcLine){
  const decision = findDecision(text, srcLine);
  if(!decision) return null;
  const lines = String(text ?? '').replace(/\r/g, '').split('\n');
  const fields = [];
  for(let line = srcLine + 1; line < lines.length; line++){
    const normal = lines[line].replace(/^([ \t]*)/, prefix => prefix.replace(/\t/g, '  '));
    const indent = /^ */.exec(normal)[0].length;
    const content = normal.trim().replace(/(^|\s)\/\/.*$/, '').trim();
    if(!content) continue;
    if(indent === 0){
      if(CONFIG.test(content)) continue;
      break;
    }
    const match = FIELD.exec(content);
    if(!match) break;
    const key = match[1].toLowerCase();
    if(FIELD_ORDER.has(key)) fields.push({key, line});
  }
  return {decision, fields, lines};
}

function applyOps(text, ops){
  const lines = String(text ?? '').replace(/\r/g, '').split('\n');
  for(const op of [...ops].sort((a, b) => b.line - a.line)){
    if(op.text === null) lines.splice(op.line, 1);
    else lines.splice(op.line, 1, ...String(op.text).split('\n'));
  }
  return lines.join('\n');
}

/* The stage view switch is a source edit, just like every other interaction in
   the rendered tool. Return one CodeMirror-ready operation so Tree / Possible
   Plans is undoable and URL-coherent without creating a second UI state. */
export function setStyle(text, value){
  const style = String(value || '').toLowerCase();
  if(style !== 'tree' && style !== 'plans') return null;
  const lines = String(text ?? '').replace(/\r/g, '').split('\n');
  let winner = -1;
  for(let line = 0; line < lines.length; line++) if(/^style\s*:/i.test(lines[line])) winner = line;
  if(winner >= 0) return [{line:winner, text:`style: ${style}`}];
  if(!String(text ?? '').trim()) return [{line:0, text:`style: ${style}`}];

  let at = lines.length;
  for(let line = 0; line < lines.length; line++){
    const content = lines[line].trim();
    if(!content || content.startsWith('//') || CONFIG.test(content)) continue;
    at = line;
    break;
  }
  if(at === 0) return [{line:0, text:`style: ${style}\n${lines[0]}`}];
  const previous = at - 1;
  return [{line:previous, text:`${lines[previous]}\nstyle: ${style}`}];
}

function rewriteLine(line, value){
  const {code, comment} = splitComment(line);
  const match = /^(\s*[a-z-]+\s*:\s*).*$/i.exec(code);
  return match[1] + value + comment;
}

function insertField(block, key, value){
  const wanted = FIELD_ORDER.get(key);
  const later = block.fields.find(field => FIELD_ORDER.get(field.key) > wanted);
  const newLine = '  ' + key + ': ' + value;
  if(later) return [{line:later.line, text:newLine + '\n' + block.lines[later.line]}];
  const earlier = [...block.fields].reverse().find(field => FIELD_ORDER.get(field.key) < wanted);
  if(earlier) return [{line:earlier.line, text:block.lines[earlier.line] + '\n' + newLine}];
  return [{line:block.decision.srcLine,
    text:block.lines[block.decision.srcLine] + '\n' + newLine}];
}

function fieldOps(text, srcLine, key, value){
  const block = decisionBlock(text, srcLine);
  if(!block) return null;
  const hits = block.fields.filter(field => field.key === key);
  if(!value) return hits.map(hit => ({line:hit.line, text:null}));
  if(!hits.length) return insertField(block, key, value);
  return [
    {line:hits[0].line, text:rewriteLine(block.lines[hits[0].line], value)},
    ...hits.slice(1).map(hit => ({line:hit.line, text:null})),
  ];
}

function verified(text, srcLine, ops, predicate){
  if(ops === null) return null;
  const decision = parse(applyOps(text, ops)).decisions.find(item => item.srcLine === srcLine);
  return decision && predicate(decision) ? ops : null;
}

function setTextField(text, srcLine, key, value){
  const clean = cleanLine(value);
  if(clean === null) return null;
  const ops = fieldOps(text, srcLine, key, clean);
  return verified(text, srcLine, ops, decision => decision[key] === (clean || null));
}

function clearField(text, srcLine, key, predicate){
  const ops = fieldOps(text, srcLine, key, '');
  return verified(text, srcLine, ops, predicate);
}

export const setQuestion = (text, srcLine, value) => setTextField(text, srcLine, 'question', value);
export const clearQuestion = (text, srcLine) => clearField(text, srcLine, 'question', d => !d.question);
export const setSignal = (text, srcLine, value) => setTextField(text, srcLine, 'signal', value);
export const clearSignal = (text, srcLine) => clearField(text, srcLine, 'signal', d => !d.signal);
export const setReading = (text, srcLine, value) => setTextField(text, srcLine, 'reading', value);
export const clearReading = (text, srcLine) => clearField(text, srcLine, 'reading', d => !d.reading);
export const setLearn = (text, srcLine, value) => setTextField(text, srcLine, 'learn', value);
export const clearLearn = (text, srcLine) => clearField(text, srcLine, 'learn', d => !d.learn);
export const setEnough = (text, srcLine, value) => setTextField(text, srcLine, 'enough', value);
export const clearEnough = (text, srcLine) => clearField(text, srcLine, 'enough', d => !d.enough);
export const setOwner = (text, srcLine, value) => setTextField(text, srcLine, 'owner', value);
export const clearOwner = (text, srcLine) => clearField(text, srcLine, 'owner', d => !d.owner);

export function setAnswerBy(text, srcLine, value){
  const date = cleanLine(value);
  if(date === null || !isValidDate(date)) return null;
  const ops = fieldOps(text, srcLine, 'answer-by', date);
  return verified(text, srcLine, ops, decision => decision.answerBy === date);
}
export const clearAnswerBy = (text, srcLine) =>
  clearField(text, srcLine, 'answer-by', decision => !decision.answerBy);

export function setWhen(text, srcLine, value){
  const condition = cleanLine(value);
  if(condition === null || !condition || !parseCondition(condition).valid) return null;
  const ops = fieldOps(text, srcLine, 'when', condition);
  return verified(text, srcLine, ops,
    decision => decision.when?.source === condition);
}
export const clearWhen = (text, srcLine) =>
  clearField(text, srcLine, 'when', decision => !decision.when);

export function setAssumption(text, srcLine, direction, date){
  const dir = String(direction ?? '').trim().toLowerCase();
  const day = cleanLine(date);
  if(!DIRECTIONS.has(dir) || day === null || !isValidDate(day)) return null;
  const value = dir + ' ' + day;
  const ops = fieldOps(text, srcLine, 'assume', value);
  return verified(text, srcLine, ops, decision =>
    decision.assumption?.direction === dir && decision.assumption?.date === day);
}
export const clearAssumption = (text, srcLine) =>
  clearField(text, srcLine, 'assume', decision => !decision.assumption);

export function setAssumptionRaw(text, srcLine, value){
  const clean = cleanLine(value);
  if(clean === null || !clean) return clean === '' ? clearAssumption(text, srcLine) : null;
  const match = /^(yes|no)\s+(\S+)$/i.exec(clean);
  return match ? setAssumption(text, srcLine, match[1], match[2]) : null;
}

function safeToken(value){
  const clean = cleanLine(value);
  return clean !== null && !/\s/.test(clean) ? clean : null;
}

/* Omitted options preserve the first valid answer's safe receipt metadata;
   passing null or "" explicitly clears that component. This lets a yes/no
   choice retain its audit receipt while still making every removal explicit. */
export function setAnswer(text, srcLine, direction, options = {}){
  const block = decisionBlock(text, srcLine);
  if(!block) return null;
  const dir = String(direction ?? '').trim().toLowerCase();
  if(!DIRECTIONS.has(dir) || !options || typeof options !== 'object') return null;
  const old = block.decision.answers.find(answer => answer.valid) || {};
  const pick = (key, fallback = '') => Object.prototype.hasOwnProperty.call(options, key)
    ? options[key] : (old[key] || fallback);
  const date = pick('date');
  if(date && (!cleanLine(date) || !isValidDate(String(date)))) return null;
  const target = pick('target');
  const actual = pick('actual');
  if(target && safeToken(target) === null) return null;
  if(actual && safeToken(actual) === null) return null;
  const receipt = pick('receipt');
  const cleanReceipt = cleanLine(receipt);
  if(cleanReceipt === null) return null;
  const parts = [dir];
  if(date) parts.push(String(date));
  if(target) parts.push('target: ' + target);
  if(actual) parts.push('actual: ' + actual);
  let value = parts.join(' ');
  if(cleanReceipt) value += ' -- ' + cleanReceipt;
  const ops = fieldOps(text, srcLine, 'answer', value);
  return verified(text, srcLine, ops, decision =>
    decision.answer?.direction === dir && decision.answers.length === 1 &&
    decision.answer.date === (date || null) && decision.answer.target === (target || null) &&
    decision.answer.actual === (actual || null) && decision.answer.receipt === cleanReceipt);
}
export const clearAnswer = (text, srcLine) =>
  clearField(text, srcLine, 'answer', decision => !decision.answer && !decision.answers.length);

function answerParts(value){
  const clean = cleanLine(value);
  if(clean === null || !clean) return null;
  const match = /^(yes|no)(?:\s+(\d{4}-\d{2}-\d{2}))?(?:\s+target:\s*(\S+))?(?:\s+actual:\s*(\S+))?(?:\s+--\s+(.+))?$/i.exec(clean);
  if(!match || (match[2] && !isValidDate(match[2])) ||
      (match[3] && safeToken(match[3]) === null) ||
      (match[4] && safeToken(match[4]) === null)) return null;
  return {direction:match[1], date:match[2] || null, target:match[3] || null,
    actual:match[4] || null, receipt:match[5] || null};
}

/* Raw counterparts are the direct attachEditInPlace commit path. Empty input
   is an explicit clear; non-empty input is parsed here, then routed through
   the same structured, parse-verified setter used by yes/no menu actions. */
export function setAnswerRaw(text, srcLine, value){
  const clean = cleanLine(value);
  if(clean === null) return null;
  if(!clean) return clearAnswer(text, srcLine);
  const parts = answerParts(clean);
  return parts ? setAnswer(text, srcLine, parts.direction, parts) : null;
}

const optionalLine = value => cleanLine(value) !== null;
const dateOrEmpty = value => {
  const clean = cleanLine(value);
  return clean !== null && (!clean || isValidDate(clean));
};
const whenOrEmpty = value => {
  const clean = cleanLine(value);
  return clean !== null && (!clean || parseCondition(clean).valid);
};
const assumptionOrEmpty = value => {
  const clean = cleanLine(value);
  if(clean === null || !clean) return clean !== null;
  const match = /^(yes|no)\s+(\S+)$/i.exec(clean);
  return !!match && isValidDate(match[2]);
};
const answerOrEmpty = value => {
  const clean = cleanLine(value);
  return clean !== null && (!clean || !!answerParts(clean));
};

export const validators = {
  question: optionalLine,
  signal: optionalLine,
  reading: optionalLine,
  learn: optionalLine,
  enough: optionalLine,
  owner: optionalLine,
  'answer-by': dateOrEmpty,
  when: whenOrEmpty,
  assume: assumptionOrEmpty,
  answer: answerOrEmpty,
};

export const kinds = {
  question: {validate:validators.question, placeholder:'What must be true?'},
  signal: {validate:validators.signal, placeholder:'What evidence answers it?'},
  reading: {validate:validators.reading, placeholder:'Current reading'},
  learn: {validate:validators.learn, placeholder:'Next deliberate learning move'},
  enough: {validate:validators.enough, placeholder:'What evidence is enough to decide?'},
  owner: {validate:validators.owner, placeholder:'Owner'},
  'answer-by': {validate:validators['answer-by'], placeholder:'YYYY-MM-DD'},
  when: {validate:validators.when, placeholder:'groups and not pricing'},
  assume: {validate:validators.assume, placeholder:'yes YYYY-MM-DD'},
  answer: {validate:validators.answer, placeholder:'yes YYYY-MM-DD -- receipt'},
};
