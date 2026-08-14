/* /paths DSL -> parsed model. Pure; no DOM and no clock. */

import {
  BASIS_KINDS, CARRY_FORWARD_KINDS, CLOSE_OUT_FIELDS, CLOSE_OUT_FIELD_PROPERTIES,
  REVIEW_FIELDS, REVIEW_FIELD_PROPERTIES, REVIEW_RELATIONS,
  RETIREMENT_FIELDS, RETIREMENT_FIELD_PROPERTIES,
} from './learning-closeout.js';

export const CONFIG_KEYS = ['title', 'date', 'today', 'style', 'verdict', 'palette', 'accent'];
export const DECISION_FIELDS = [
  'question', 'signal', 'reading', 'learn', 'enough', 'owner', 'answer-by', 'when', 'assume', 'answer',
];
export const STATUSES = ['done', 'doing', 'risk', 'blocked'];

const CONFIG = new Set(CONFIG_KEYS);
const FIELDS = new Set(DECISION_FIELDS);
const STATUS = new Set(STATUSES);
const CLOSE_OUT_FIELD_SET = new Set(CLOSE_OUT_FIELDS);
const BASIS_KIND_SET = new Set(BASIS_KINDS);
const CARRY_FORWARD_KIND_SET = new Set(CARRY_FORWARD_KINDS);
const REVIEW_FIELD_SET = new Set(REVIEW_FIELDS);
const REVIEW_RELATION_SET = new Set(REVIEW_RELATIONS);
const RETIREMENT_FIELD_SET = new Set(RETIREMENT_FIELDS);

const quote = value => `"${value}"`;

export function isValidDate(value){
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value || '');
  if(!m) return false;
  const year = Number(m[1]), month = Number(m[2]), day = Number(m[3]);
  if(month < 1 || month > 12 || day < 1) return false;
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return day <= days[month - 1];
}

function near(a, b){
  a = a.toLowerCase(); b = b.toLowerCase();
  if(a === b) return true;
  const [shorter, longer] = a.length <= b.length ? [a, b] : [b, a];
  if(longer.length - shorter.length > 1) return false;
  if(shorter.length === longer.length){
    let differences = 0;
    for(let i = 0; i < shorter.length; i++) differences += shorter[i] !== longer[i];
    return differences <= 1;
  }
  let i = 0, j = 0, skipped = false;
  while(i < shorter.length && j < longer.length){
    if(shorter[i] === longer[j]){ i++; j++; }
    else if(!skipped){ skipped = true; j++; }
    else return false;
  }
  return true;
}

function makeWarning(phase, code, line, subject, message){
  return {phase, code, line, subject, message};
}

function warningSink(model){
  const seen = new Set();
  return (phase, code, line, subject, message) => {
    const key = `${code}\0${line ?? ''}\0${subject ?? ''}`;
    if(seen.has(key)) return;
    seen.add(key);
    model.warnings.push(makeWarning(phase, code, line, subject, message));
  };
}

function invalidCondition(source, reason){
  return {type:'condition', operator:null, terms:[], source, valid:false, error:reason};
}

export function parseCondition(source){
  const raw = String(source || '').trim();
  const words = raw.split(/\s+/).filter(Boolean);
  if(!words.length) return invalidCondition(raw, 'malformed');
  const operators = words.filter(w => /^(and|or)$/i.test(w)).map(w => w.toLowerCase());
  if(new Set(operators).size > 1) return invalidCondition(raw, 'mixed');
  const operator = operators[0] || 'single';
  const terms = [];
  let i = 0, expectTerm = true;
  while(i < words.length){
    if(!expectTerm) return invalidCondition(raw, 'malformed');
    let negated = false;
    if(words[i].toLowerCase() === 'not'){ negated = true; i++; }
    const name = words[i];
    if(!name || !/^[a-z0-9-]+$/i.test(name) || /^(and|or|not)$/i.test(name))
      return invalidCondition(raw, 'malformed');
    const key = name.toLowerCase();
    /* A decision can only determine one arm for an item. Keeping repeated
       terms (especially `a and not a`) valid left the evaluator and tree with
       different answers about which arm owned it, so the item could vanish.
       Recover through the existing visible condition-error path instead. */
    if(terms.some(term => term.key === key)) return invalidCondition(raw, 'repeated');
    terms.push({type:'term', name, key, negated});
    i++;
    if(i === words.length) break;
    if(words[i].toLowerCase() !== operator || operator === 'single')
      return invalidCondition(raw, 'malformed');
    i++;
    if(i === words.length) return invalidCondition(raw, 'malformed');
  }
  return {type:'condition', operator, terms, source:raw, valid:true, error:null};
}

function conditionWarning(add, line, shown, condition){
  const token = `[${shown}]`;
  if(condition.error === 'mixed'){
    add('parse', 'mixed-condition', line, shown,
      `line ${line}: condition ${quote(token)} mixes "and" and "or" — use one operator, or split this into two items; item labelled "Condition needs fixing"`);
  } else {
    add('parse', 'malformed-condition', line, shown,
      `line ${line}: condition ${quote(token)} cannot be read — use "[if groups]" or "[if not groups]"; item labelled "Condition needs fixing"`);
  }
}

function parseAnswer(raw, decision, line, add){
  const receiptSplit = raw.split(/\s+--\s+/, 2);
  const head = receiptSplit[0].trim();
  const receipt = receiptSplit.length > 1 ? receiptSplit[1].trim() : '';
  const direction = /^(yes|no)\b/i.exec(head);
  if(!direction){
    add('parse', 'invalid-answer-value', line, decision.key,
      `line ${line}: answer ${quote(raw)} is not valid — use "yes" or "no"; answer ignored`);
    return {direction:null, date:null, target:null, actual:null, receipt, raw, srcLine:line - 1, valid:false};
  }
  const answer = {direction:direction[1].toLowerCase(), date:null, target:null, actual:null,
    receipt, raw, srcLine:line - 1, valid:true};
  const rest = head.slice(direction[0].length).trim();
  const date = /(?:^|\s)(\S*\d\S*)(?=\s|$)/.exec(rest);
  if(date && !/^(?:target|actual):/i.test(date[1])){
    if(isValidDate(date[1])) answer.date = date[1];
    else {
      add('parse', 'invalid-answer-date', line, decision.key,
        `line ${line}: answer date ${quote(date[1])} is not valid — use YYYY-MM-DD; answer date ignored`);
    }
  }
  const target = /(?:^|\s)target:\s*(\S+)/i.exec(rest);
  const actual = /(?:^|\s)actual:\s*(\S+)/i.exec(rest);
  if(target) answer.target = target[1];
  if(actual) answer.actual = actual[1];
  return answer;
}

function parseAssumption(raw, decision, line, add){
  const m = /^(yes|no)\s+(\S+)\s*$/i.exec(raw);
  if(!m || !isValidDate(m[2])){
    const date = m ? m[2] : (raw.trim().split(/\s+/)[1] || raw.trim());
    add('parse', 'invalid-assumption-date', line, decision.key,
      `line ${line}: assumption date ${quote(date)} is not valid — use YYYY-MM-DD; assumption ignored`);
    return null;
  }
  return {direction:m[1].toLowerCase(), date:m[2], srcLine:line - 1, raw};
}

function newCloseOut(srcLine){
  return {srcLine, basisKind:null, carryForward:null, decisionUse:null, claim:null, scope:null,
    reviewBy:null, reconsiderIf:null, nextCheck:null, fieldLines:{}, reviews:[], retirements:[]};
}

function newReview(srcLine){
  return {srcLine, priorClaim:null, priorScope:null, newObservation:null, newScope:null, relation:null,
    reviewedOn:null, fieldLines:{}};
}

function newRetirement(srcLine){
  return {srcLine, reason:null, retiredOn:null, fieldLines:{}};
}

function parseCloseOutField(content, line, decision, add){
  const field = /^([a-z-]+)\s*:\s*(.*)$/i.exec(content);
  if(!field){
    add('parse', 'malformed-close-out-field', line, decision.key,
      `line ${line}: ${quote(content)} cannot be read as a close-out field — use "field: value"; line ignored`);
    return;
  }
  const key = field[1].toLowerCase(), value = field[2].trim(), closeOut = decision.closeOut;
  if(key === 'currency'){
    add('parse', 'unsupported-close-out-currency', line, `${decision.key}:currency`,
      `line ${line}: close-out currency ${quote(value)} is derived, not authored — use "review-by:", append an inside-scope "review:" or append a "retirement:" event; field ignored`);
    return;
  }
  if(!CLOSE_OUT_FIELD_SET.has(key)){
    add('parse', 'unknown-close-out-field', line, `${decision.key}:${key}`,
      `line ${line}: unknown close-out field ${quote(key + ':')} — field ignored; use basis-kind / carry-forward / decision-use / claim / scope / review-by / reconsider-if / next-check`);
    return;
  }
  if(Object.prototype.hasOwnProperty.call(closeOut.fieldLines, key)){
    add('parse', 'duplicate-close-out-field', line, `${decision.key}:${key}`,
      `line ${line}: second ${quote(key + ':')} close-out field ignored — the value on line ${closeOut.fieldLines[key]} is kept; keep one ${quote(key + ':')} field`);
    return;
  }
  closeOut.fieldLines[key] = line;
  const property = CLOSE_OUT_FIELD_PROPERTIES[key];
  if(key === 'basis-kind'){
    const normalized = value.toLowerCase();
    if(BASIS_KIND_SET.has(normalized)) closeOut.basisKind = normalized;
    else add('parse', 'invalid-close-out-basis-kind', line, decision.key,
      `line ${line}: basis-kind ${quote(value)} is not valid — use observation / experiment / judgement / calculation / synthesis; basis ignored`);
  } else if(key === 'carry-forward'){
    const normalized = value.toLowerCase();
    if(CARRY_FORWARD_KIND_SET.has(normalized)) closeOut.carryForward = normalized;
    else add('parse', 'invalid-close-out-carry-forward', line, decision.key,
      `line ${line}: carry-forward ${quote(value)} is not valid — use operating-claim / scoped-finding / no-carry-forward; declaration ignored`);
  } else if(key === 'review-by'){
    if(isValidDate(value)) closeOut.reviewBy = value;
    else add('parse', 'invalid-close-out-review-date', line, decision.key,
      `line ${line}: review-by ${quote(value)} is not a valid date — use YYYY-MM-DD; review date ignored`);
  } else closeOut[property] = value;
}

function parseEventField(content, line, decision, event, kind, add){
  const field = /^([a-z-]+)\s*:\s*(.*)$/i.exec(content);
  const fields = kind === 'review' ? REVIEW_FIELD_SET : RETIREMENT_FIELD_SET;
  const properties = kind === 'review' ? REVIEW_FIELD_PROPERTIES : RETIREMENT_FIELD_PROPERTIES;
  if(!field){
    add('parse', `malformed-close-out-${kind}-field`, line, decision.key,
      `line ${line}: ${quote(content)} cannot be read as a ${kind} field — use "field: value"; line ignored`);
    return;
  }
  const key = field[1].toLowerCase(), value = field[2].trim();
  if(!fields.has(key)){
    const allowed = kind === 'review'
      ? 'prior-claim / prior-scope / new-observation / new-scope / relation / reviewed-on'
      : 'reason / retired-on';
    add('parse', `unknown-close-out-${kind}-field`, line, `${decision.key}:${key}`,
      `line ${line}: unknown ${kind} field ${quote(key + ':')} — field ignored; use ${allowed}`);
    return;
  }
  if(Object.prototype.hasOwnProperty.call(event.fieldLines, key)){
    add('parse', `duplicate-close-out-${kind}-field`, line, `${decision.key}:${event.srcLine}:${key}`,
      `line ${line}: second ${quote(key + ':')} ${kind} field ignored — the value on line ${event.fieldLines[key]} is kept`);
    return;
  }
  event.fieldLines[key] = line;
  const property = properties[key];
  if(key === 'relation'){
    const normalized = value.toLowerCase();
    if(REVIEW_RELATION_SET.has(normalized)) event.relation = normalized;
    else add('parse', 'invalid-close-out-review-relation', line, decision.key,
      `line ${line}: relation ${quote(value)} is not valid — use inside-scope or outside-scope; relation ignored`);
  } else if(key === 'reviewed-on' || key === 'retired-on'){
    if(isValidDate(value)) event[property] = value;
    else add('parse', `invalid-close-out-${kind}-date`, line, decision.key,
      `line ${line}: ${key} ${quote(value)} is not a valid date — use YYYY-MM-DD; date ignored`);
  } else event[property] = value;
}

function addCondition(raw, line, add, kind){
  const condition = parseCondition(raw);
  condition.srcLine = line - 1;
  condition.kind = kind;
  if(!condition.valid) conditionWarning(add, line, `if ${raw}`, condition);
  return condition;
}

function parseItem(raw, line, period, model, add, warnUnmatched = true){
  let text = raw.trim();
  let status = null, statusToken = null, condition = null, conditionShown = null;
  text = text.replace(/\[([^\]]*)\]/g, (_, tagRaw) => {
    const tag = tagRaw.trim();
    const lower = tag.toLowerCase();
    if(STATUS.has(lower)){
      if(status){
        add('parse', 'duplicate-status', line, `${status}:${lower}`,
          `line ${line}: both "[${statusToken}]" and "[${tag}]" are present — "[${tag}]" is used because it appears last; keep one status`);
      }
      status = lower; statusToken = tag;
      return '';
    }
    let m = /^if\s+(.+)$/i.exec(tag);
    let kind = 'if';
    if(!m){ m = /^unless\s+(.+)$/i.exec(tag); kind = 'unless'; }
    if(m){
      const source = kind === 'unless' ? `not ${m[1].trim()}` : m[1].trim();
      const parsed = parseCondition(source);
      parsed.srcLine = line - 1; parsed.kind = kind; parsed.original = tag;
      if(condition){
        add('parse', 'duplicate-condition', line, tag,
          `line ${line}: second condition "[${tag}]" ignored — "[${conditionShown}]" appears first; keep one condition`);
      } else {
        condition = parsed; conditionShown = tag;
        if(!parsed.valid) conditionWarning(add, line, tag, parsed);
      }
      return '';
    }
    add('parse', 'unknown-item-tag', line, tag,
      `line ${line}: unknown tag "[${tag}]" — tag ignored; use done / doing / risk / blocked`);
    return '';
  }).trim();

  let note = '', url = null;
  const noteAt = text.search(/\s--\s+/);
  const urlAt = text.search(/\s->\s+/);
  if(noteAt >= 0){
    const start = noteAt + text.slice(noteAt).match(/^\s*--\s+/)[0].length;
    const end = urlAt > noteAt ? urlAt : text.length;
    note = text.slice(start, end).trim();
  }
  if(urlAt >= 0) url = text.slice(urlAt).replace(/^\s*->\s+/, '').trim().split(/\s+/)[0] || null;
  const metadataAt = [noteAt, urlAt].filter(n => n >= 0).sort((a, b) => a - b)[0];
  if(metadataAt !== undefined) text = text.slice(0, metadataAt).trim();

  const lane = /^([^:]+):\s+(.+)$/.exec(text);
  let laneName = '', title = text;
  if(lane){ laneName = lane[1].trim(); title = lane[2].trim(); }
  else if(warnUnmatched){
    add('parse', 'unmatched-line', line, raw.trim(),
      `line ${line}: ${quote(raw.trim())} cannot be read as a setting, decision or period — kept as an item in ${quote(period.name)}; use "Lane: Title" for an item`);
  }
  const item = {identity:line - 1, lane:laneName, title, note, url, status, condition,
    period:period.name, periodIndex:model.periods.indexOf(period), srcLine:line - 1, raw:raw.trim()};
  period.items.push(item); model.items.push(item);
  return item;
}

function implicitPeriod(model){
  let period = model.periods.find(p => p.implicit);
  if(!period){
    period = {name:'Now', srcLine:null, implicit:true, items:[]};
    model.periods.unshift(period);
  }
  return period;
}

function build(model, add){
  const byName = {};
  for(const decision of model.decisions){
    if(byName[decision.key]){
      decision.ignored = true;
      const first = byName[decision.key];
      add('build', 'duplicate-decision', decision.srcLine + 1, decision.key,
        `line ${decision.srcLine + 1}: decision ${quote(decision.name)} is already declared on line ${first.srcLine + 1} — second declaration ignored; keep one declaration`);
    } else byName[decision.key] = decision;
  }
  model.decisions = model.decisions.filter(d => !d.ignored);
  model.decisionByName = byName;

  for(const decision of model.decisions){
    const line = decision.srcLine + 1;
    if(!decision.question) add('build', 'missing-question', line, decision.key,
      `line ${line}: decision ${quote(decision.name)} has no question — add "question:" below its heading`);
    if(!decision.signal) add('build', 'missing-signal', line, decision.key,
      `line ${line}: decision ${quote(decision.name)} has no signal — add "signal:" to say what would answer it`);
    if(!decision.owner) add('build', 'missing-owner', line, decision.key,
      `line ${line}: decision ${quote(decision.name)} has no owner — add "owner:" to say who will answer it`);
    if(!decision.answerBy) add('build', 'missing-due-date', line, decision.key,
      `line ${line}: decision ${quote(decision.name)} has no due date — add "answer-by:"`);
  }

  const uses = new Map(model.decisions.map(d => [d.key, []]));
  const validate = (condition, owner, kind) => {
    if(!condition || !condition.valid) return;
    for(const term of condition.terms){
      const target = byName[term.key];
      if(!target){
        condition.valid = false; condition.error = 'unknown';
        const suggestion = model.decisions.find(d => near(term.name, d.name));
        const line = condition.srcLine + 1;
        if(kind === 'item'){
          add('build', 'unknown-item-decision', line, term.key,
            `line ${line}: no decision named ${quote(term.name)}${suggestion ? ` — did you mean ${quote(suggestion.name)}?` : ''} Item labelled "Condition needs fixing"`);
        } else {
          add('build', 'unknown-when-decision', line, `${owner.key}:${term.key}`,
            `line ${line}: no decision named ${quote(term.name)} — ${quote(owner.name)} is labelled "Condition needs fixing"; correct the name`);
        }
        continue;
      }
      uses.get(term.key).push({owner, kind});
      if(kind === 'item' && target.srcLine > condition.srcLine){
        const line = condition.srcLine + 1;
        add('build', 'decision-after-use', line, `${owner.identity}:${term.key}`,
          `line ${line}: ${quote(term.name)} is used before its declaration on line ${target.srcLine + 1} — move the decision above this item`);
      }
    }
  };
  for(const decision of model.decisions) validate(decision.when, decision, 'when');
  for(const item of model.items) validate(item.condition, item, 'item');

  const visiting = [], finished = new Set(), warnedCycles = new Set();
  function visit(decision){
    if(finished.has(decision.key) || !decision.when?.valid) return;
    const at = visiting.findIndex(d => d.key === decision.key);
    if(at >= 0){
      const cycle = visiting.slice(at);
      for(const member of cycle) member.cycle = true;
      const ordered = [...cycle].sort((a, b) => a.srcLine - b.srcLine);
      const subject = ordered.map(d => d.key).join(':');
      if(!warnedCycles.has(subject)){
        warnedCycles.add(subject);
        const lines = ordered.map(d => d.srcLine + 1).join(' and ');
        const names = ordered.map(d => quote(d.name)).join(' and ');
        add('build', 'when-cycle', ordered[0].srcLine + 1, subject,
          `lines ${lines}: ${names} depend on each other — neither question can open; remove one "when:" dependency`);
      }
      return;
    }
    visiting.push(decision);
    for(const term of decision.when.terms){
      const child = byName[term.key];
      if(child) visit(child);
    }
    visiting.pop(); finished.add(decision.key);
  }
  for(const decision of model.decisions) visit(decision);

  for(const decision of model.decisions){
    if(!(uses.get(decision.key) || []).length){
      const line = decision.srcLine + 1;
      add('build', 'unused-decision', line, decision.key,
        `line ${line}: nothing depends on decision ${quote(decision.name)} — use it in an item condition or remove it`);
    }
  }
}

export function parse(text){
  const model = {title:'', dateStr:null, today:null, style:'brief', verdict:null,
    palette:'ocean', accent:null, decisions:[], decisionByName:{}, periods:[], items:[], warnings:[]};
  const add = warningSink(model);
  const lines = String(text ?? '').replace(/\r/g, '').split('\n');
  let block = null;
  const periods = new Map();

  for(let index = 0; index < lines.length; index++){
    const lineNo = index + 1;
    let physical = lines[index];
    if(!physical.trim() || /^\s*\/\//.test(physical)) continue;
    const tabIndent = /^(?: *\t)+/.test(physical) || /^\t/.test(physical);
    if(tabIndent){
      add('parse', 'tab-indent', lineNo, 'indent',
        `line ${lineNo}: tab used for indentation — read as 2 spaces; replace it with 2 spaces`);
      physical = physical.replace(/^[ \t]+/, prefix => prefix.replace(/\t/g, '  '));
    }
    let indent = /^ */.exec(physical)[0].length;
    if(indent === 1 || indent === 3){
      add('parse', 'odd-indent', lineNo, 'indent',
        `line ${lineNo}: item is indented by ${indent} spaces — read as 2 spaces; use 2 spaces`);
      indent = 2;
    } else if(indent >= 4 && block?.type === 'decision'){
      add('parse', 'odd-indent', lineNo, 'indent',
        `line ${lineNo}: decision field is indented by ${indent} spaces — read as 2 spaces; use 2 spaces`);
      indent = 2;
    } else if(indent >= 5 && indent !== 6 &&
      (block?.type === 'close-out-review' || block?.type === 'close-out-retirement')){
      add('parse', 'odd-indent', lineNo, 'indent',
        `line ${lineNo}: ${block.type === 'close-out-review' ? 'review' : 'retirement'} field is indented by ${indent} spaces — read as 6 spaces; use 6 spaces`);
      indent = 6;
    } else if(indent > 4 && block?.type === 'close-out'){
      add('parse', 'odd-indent', lineNo, 'indent',
        `line ${lineNo}: close-out field is indented by ${indent} spaces — read as 4 spaces; use 4 spaces`);
      indent = 4;
    }
    let content = physical.trim();
    content = content.replace(/(^|\s)\/\/.*$/, '').trim();
    if(!content) continue;

    const config = /^(title|date|today|style|verdict|palette|accent)\s*:\s*(.*)$/i.exec(content);
    if(config && (indent === 0 || block?.type === 'period')){
      const key = config[1].toLowerCase(), value = config[2].trim();
      if(block?.type === 'period'){
        add('parse', 'setting-in-item-position', lineNo, key,
          `line ${lineNo}: ${quote(content)} read as the ${key} setting, not an item in a lane called ${quote(config[1])} — move settings above the first period, or rename the lane`);
      }
      if(key === 'title') model.title = value;
      else if(key === 'date'){
        if(/^off$/i.test(value)) model.dateStr = 'off';
        else if(isValidDate(value)) model.dateStr = value;
        else add('parse', 'invalid-date', lineNo, 'date',
          `line ${lineNo}: date ${quote(value)} is not valid — use YYYY-MM-DD or "off"; date ignored`);
      } else if(key === 'today'){
        if(isValidDate(value)) model.today = value;
        else add('parse', 'invalid-today', lineNo, 'today',
          `line ${lineNo}: today ${quote(value)} is not a valid date — use YYYY-MM-DD; date ignored`);
      } else if(key === 'style'){
        const style = value.toLowerCase();
        if(style === 'brief' || style === 'question' || style === 'conditions' || style === 'agenda' ||
          style === 'overview' || style === 'dependencies' || style === 'tree' || style === 'plans') model.style = style;
        else {
          model.style = 'brief';
          add('parse', 'invalid-style', lineNo, 'style',
            `line ${lineNo}: style ${quote(value)} is not valid — use "brief", "question", "conditions", "agenda", "tree" or "plans"; style read as "brief"`);
        }
      }
      else if(key === 'verdict') model.verdict = value;
      else if(key === 'palette') model.palette = value;
      else if(key === 'accent'){
        if(/^#[0-9a-f]{6}$/i.test(value)) model.accent = value;
        else add('parse', 'invalid-accent', lineNo, 'accent',
          `line ${lineNo}: accent ${quote(value)} is not a valid 6-digit hex colour — accent ignored`);
      }
      continue;
    }

    if(indent === 0){
      const header = /^decision\s+([a-z0-9-]+):$/i.exec(content);
      if(header){
        const decision = {name:header[1], key:header[1].toLowerCase(), srcLine:index,
          question:null, signal:null, reading:null, learn:null, enough:null, owner:null, answerBy:null,
          when:null, assumption:null, answer:null, answers:[], closeOut:null, fieldLines:{}, cycle:false};
        model.decisions.push(decision); block = {type:'decision', decision};
        continue;
      }
      if(/^decision/i.test(content)){
        const period = block?.type === 'period' ? block.period : (model.periods.at(-1) || implicitPeriod(model));
        if(/:$/.test(content)){
          add('parse', 'invalid-decision-heading', lineNo, content,
            `line ${lineNo}: ${quote(content)} is not a valid decision heading — use one word with letters, numbers or hyphens, such as "decision coach-pricing:"`);
          parseItem(content, lineNo, period, model, add, false);
          block = {type:'period', period};
        } else {
          add('parse', 'invalid-period-heading', lineNo, content,
            `line ${lineNo}: ${quote(content)} cannot be used as a period heading — kept as an item in ${quote(period.name)}; use a heading that does not begin with "decision"`);
          parseItem(content, lineNo, period, model, add, false);
          block = {type:'period', period};
        }
        continue;
      }
      const name = content.replace(/:$/, '').trim();
      const key = name.toLowerCase();
      const priorPeriod = periods.get(key) || model.periods.find(p => p.name.toLowerCase() === key);
      if(priorPeriod){
        const period = priorPeriod;
        add('parse', 'duplicate-period', lineNo, key,
          `line ${lineNo}: period ${quote(name)} already appears on line ${period.srcLine == null ? lineNo : period.srcLine + 1} — items below continue in the existing ${quote(period.name)} period; keep one heading`);
        block = {type:'period', period};
      } else {
        const period = {name, srcLine:index, implicit:false, items:[]};
        periods.set(key, period); model.periods.push(period); block = {type:'period', period};
      }
      continue;
    }

    const activeDecision = block?.type === 'decision' || block?.type === 'close-out' ||
      block?.type === 'close-out-review' || block?.type === 'close-out-retirement'
      ? block.decision : null;
    if(activeDecision){
      const closeOutHeading = /^close-out\s*:\s*(.*)$/i.exec(content);
      if(indent === 2 && closeOutHeading){
        const value = closeOutHeading[1].trim();
        if(value){
          add('parse', 'invalid-close-out-heading', lineNo, activeDecision.key,
            `line ${lineNo}: "close-out:" opens a nested receipt and cannot have a value — ${quote(value)} ignored; put fields on lines indented by 4 spaces`);
        }
        if(activeDecision.closeOut){
          add('parse', 'duplicate-close-out', lineNo, activeDecision.key,
            `line ${lineNo}: decision ${quote(activeDecision.name)} already has a close-out on line ${activeDecision.closeOut.srcLine + 1} — first receipt kept; keep one "close-out:" block`);
        } else activeDecision.closeOut = newCloseOut(index);
        block = {type:'close-out', decision:activeDecision};
        continue;
      }
      const eventKind = block.type === 'close-out-review' ? 'review'
        : block.type === 'close-out-retirement' ? 'retirement' : null;
      if(eventKind && indent >= 6){
        parseEventField(content, lineNo, activeDecision, block.event, eventKind, add);
        continue;
      }
      if(eventKind && indent === 4){
        const child = /^([a-z-]+)\s*:/i.exec(content)?.[1]?.toLowerCase();
        const childFields = eventKind === 'review' ? REVIEW_FIELD_SET : RETIREMENT_FIELD_SET;
        if(child && childFields.has(child)){
          add('parse', `close-out-${eventKind}-field-indent`, lineNo,
            `${activeDecision.key}:${block.event.srcLine}:${child}`,
            `line ${lineNo}: ${eventKind} field ${quote(child + ':')} is indented by 4 spaces — read inside "${eventKind}:"; use 6 spaces`);
          parseEventField(content, lineNo, activeDecision, block.event, eventKind, add);
          continue;
        }
      }
      const eventHeading = indent === 4 ? /^(review|retirement)\s*:\s*(.*)$/i.exec(content) : null;
      if(eventHeading){
        const kind = eventHeading[1].toLowerCase(), value = eventHeading[2].trim();
        if(value) add('parse', `invalid-close-out-${kind}-heading`, lineNo, activeDecision.key,
          `line ${lineNo}: "${kind}:" opens an append-only event and cannot have a value — ${quote(value)} ignored; put fields on lines indented by 6 spaces`);
        const event = kind === 'review' ? newReview(index) : newRetirement(index);
        if(kind === 'review') activeDecision.closeOut.reviews.push(event);
        else activeDecision.closeOut.retirements.push(event);
        block = {type:`close-out-${kind}`, decision:activeDecision, event};
        continue;
      }
      if((block.type === 'close-out' || eventKind) && indent === 4){
        parseCloseOutField(content, lineNo, activeDecision, add);
        block = {type:'close-out', decision:activeDecision};
        continue;
      }
      if((block.type === 'close-out' || eventKind) && indent === 2){
        const nested = /^([a-z-]+)\s*:/i.exec(content)?.[1]?.toLowerCase();
        if(nested && (CLOSE_OUT_FIELD_SET.has(nested) || nested === 'currency')){
          add('parse', 'close-out-field-indent', lineNo, `${activeDecision.key}:${nested}`,
            `line ${lineNo}: close-out field ${quote(nested + ':')} is indented by 2 spaces — read inside "close-out:"; use 4 spaces`);
          parseCloseOutField(content, lineNo, activeDecision, add);
          continue;
        }
      }
      const field = /^([a-z-]+)\s*:\s*(.*)$/i.exec(content);
      if(field){
        const key = field[1].toLowerCase(), value = field[2].trim(), decision = activeDecision;
        if(!FIELDS.has(key)){
          add('parse', 'unknown-decision-field', lineNo, key,
            `line ${lineNo}: unknown decision field ${quote(key + ':')} — field ignored; use question / signal / reading / learn / enough / owner / answer-by / when / assume / answer`);
          continue;
        }
        if(key === 'answer'){
          const answer = parseAnswer(value, decision, lineNo, add);
          decision.answers.push(answer);
          const valid = decision.answers.filter(a => a.direction);
          const directions = new Set(valid.map(a => a.direction));
          if(valid.length > 1){
            const first = valid[0];
            if(directions.size > 1){
              decision.answer = null;
              add('parse', 'conflicting-answers', lineNo, decision.key,
                `line ${lineNo}: decision ${quote(decision.name)} has both "Answer: yes" and "Answer: no" — no answer is used; keep one answer`);
            } else {
              decision.answer = first;
              add('parse', 'repeated-answer', lineNo, decision.key,
                `line ${lineNo}: decision ${quote(decision.name)} has a second "Answer: ${answer.direction}" — the answer on line ${first.srcLine + 1} is kept; keep one answer`);
            }
          } else decision.answer = answer.direction ? answer : null;
          continue;
        }
        if(Object.prototype.hasOwnProperty.call(decision.fieldLines, key)){
          const firstLine = decision.fieldLines[key];
          add('parse', 'duplicate-decision-field', lineNo, `${decision.key}:${key}`,
            `line ${lineNo}: second ${quote(key + ':')} field ignored — the value on line ${firstLine} is kept; keep one ${quote(key + ':')} field`);
          continue;
        }
        decision.fieldLines[key] = lineNo;
        if(key === 'question' || key === 'signal' || key === 'reading' || key === 'learn' ||
           key === 'enough' || key === 'owner') decision[key] = value;
        else if(key === 'answer-by'){
          if(isValidDate(value)) decision.answerBy = value;
          else add('parse', 'invalid-due-date', lineNo, decision.key,
            `line ${lineNo}: answer-by ${quote(value)} is not a valid date — use YYYY-MM-DD; due date ignored`);
        } else if(key === 'when') decision.when = addCondition(value, lineNo, add, 'when');
        else if(key === 'assume') decision.assumption = parseAssumption(value, decision, lineNo, add);
        continue;
      }
    }

    let period;
    if(block?.type === 'period') period = block.period;
    else {
      period = implicitPeriod(model);
      add('parse', 'item-before-period', lineNo, content,
        `line ${lineNo}: ${quote(content)} appears before any period — kept in the first period, "Now"; add a period heading above it`);
      block = {type:'period', period};
    }
    parseItem(content, lineNo, period, model, add);
  }

  build(model, add);
  return model;
}
