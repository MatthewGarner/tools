/* Exact Paths world -> fresh Roadmap delivery projection.
   This module deliberately has two stages. inspectRoadmapProjection() exposes
   the decision receipt but cannot emit a Roadmap; buildRoadmapProjection()
   emits text only after the caller accepts every active unwritten answer.
   Roadmap's parser stays out of the runtime graph: target-parser round trips
   belong in this module's tests. */

import {evaluate} from './evaluate.js';
import {isValidDate} from './parse.js';
import {enumeratePlans} from './plans.js';

const ROADMAP_CONFIG_KEYS = [
  'title', 'date', 'headline', 'story', 'horizons', 'wip', 'fade', 'palette',
  'accent', 'style', 'focus', 'verdict', 'group', 'basis',
];
const ROADMAP_CONFIG = new Set(ROADMAP_CONFIG_KEYS);
const ROADMAP_PALETTES = new Set(['ocean', 'slate', 'ember', 'plum']);
const STATUSES = new Set(['done', 'doing', 'risk', 'blocked']);
const DIRECTIONS = new Set(['yes', 'no']);
const MAX_BASIS_SOURCE = 80;
const MAX_BASIS_KEY = 32;
const MAX_BASIS_ENTRIES = 8;

const refusal = (code, reason, extra = {}) => ({ok:false, code, reason, ...extra});
const clean = value => typeof value === 'string' && value === value.trim() && value.length > 0;
const record = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const syntaxDelimiter = value => /[\r\n\t\[\]]|(?:^|\s)\/\/|\s--\s|\s->\s/.test(value);

function normalizedAnswers(answers){
  if(!record(answers)) return null;
  const out = {};
  for(const [rawKey, direction] of Object.entries(answers)){
    const key = String(rawKey).toLowerCase();
    /* These maps come from Paths' own world enumerator, not free text. Keep
       directions canonical so a stale or foreign representation cannot be
       accepted merely because it looks similar. */
    if(!/^[a-z0-9-]+$/.test(key) || !DIRECTIONS.has(direction) ||
       Object.prototype.hasOwnProperty.call(out, key)) return null;
    out[key] = direction;
  }
  return out;
}

export function assignmentKey(answers){
  const normalized = normalizedAnswers(answers);
  if(!normalized) return null;
  return Object.keys(normalized).sort().map(key => `${key}=${normalized[key]}`).join('&');
}

function sourceLabel(model){
  const source = model.title === '' ? 'Paths decision plan' : model.title;
  if(!clean(source) || source.length > MAX_BASIS_SOURCE || /[";\r\n\t]|\/\//.test(source)) return null;
  return source;
}

function safePeriod(name){
  if(!clean(name) || syntaxDelimiter(name) || name.includes(',') || /:$/.test(name) || /^decision\b/i.test(name))
    return false;
  return !new RegExp(`^(?:${ROADMAP_CONFIG_KEYS.join('|')})\\s*:`, 'i').test(name);
}

function safeLane(value){
  if(value === '') return true;
  if(!clean(value) || syntaxDelimiter(value) || value.includes(':')) return false;
  return !ROADMAP_CONFIG.has(value.toLowerCase());
}

function safeTitle(value, hasLane, periods){
  if(!clean(value) || syntaxDelimiter(value) || /\s+x\d+\s*$/i.test(value)) return false;
  return hasLane || (!value.includes(':') && !periods.some(period => period.name.toLowerCase() === value.toLowerCase()));
}

function safeNote(value){
  return value === '' || (clean(value) && !syntaxDelimiter(value));
}

function safeUrl(value){
  return value == null || (typeof value === 'string' && /^https?:\/\/[^\s\[\]]+$/i.test(value));
}

function relevantDecisions(model){
  /* This is intentionally a delivery closure, not Possible Plans' whole-doc
     enumeration. An unused question must not prevent an otherwise exact and
     explicitly-bounded delivery projection. */
  const keys = new Set();
  const visit = key => {
    if(keys.has(key)) return;
    keys.add(key);
    for(const term of model.decisionByName[key]?.when?.terms || []) visit(term.key);
  };
  for(const item of model.items) for(const term of item.condition?.terms || []) visit(term.key);
  return model.decisions.filter(decision => keys.has(decision.key));
}

/* Turn a full Possible Plans matrix member into the exact delivery-closure
   assignment understood by this handoff. The matrix includes unrelated open
   questions for comparison; those must never make a delivery world stale. */
export function deliveryAssignment(model, answers){
  const normalized = normalizedAnswers(answers);
  if(!normalized || !record(model) || !record(model.decisionByName)) return null;
  const keys = new Set(relevantDecisions(model).map(decision => decision.key));
  return Object.fromEntries(Object.entries(normalized).filter(([key]) => keys.has(key)));
}

function deliveryEnumeration(model, date, relevant){
  /* Parsed models are ordinarily replaced on each edit, but pure callers and
     tests may mutate one in place. Do not cache this semantic gate by object
     identity: a newly authored answer must immediately change world membership.
     The delivery closure is capped at six questions, so recomputation is tiny. */
  const scoped = {...model, decisions:relevant,
    decisionByName:Object.fromEntries(relevant.map(decision => [decision.key, decision]))};
  return enumeratePlans(scoped, date);
}

/* Enumerate the exact worlds that can change delivery, not the whole Paths
   comparison matrix. This is the UI's source of candidates: seven unrelated
   questions may legitimately make Possible Plans refuse while a two-question
   delivery closure remains exact and projectable. */
export function roadmapProjectionWorlds(model, injectedDate){
  const date = model?.today || injectedDate;
  if(!isValidDate(date)) return refusal('invalid-projection-date', 'Choose a real ISO projection date.');
  const source = sourceLabel(model || {});
  const structure = safeStructure(model, source);
  if(!structure.ok) return structure;
  if(model.items.some(item => item.condition?.terms.some(term => !model.decisionByName[term.key])))
    return refusal('invalid-item-condition', 'A delivery-item condition refers to a decision that does not exist.');
  const relevant = relevantDecisions(model);
  if(!relevant.length) return refusal('no-relevant-decisions', 'No delivery item depends on a Paths decision.');
  const enumeration = deliveryEnumeration(model, date, relevant);
  if(enumeration.worlds?.refused)
    return refusal('enumeration-refused', enumeration.worlds.reason || 'Paths cannot enumerate an exact delivery basis.');
  const assignments = [], seen = new Set();
  for(const plan of enumeration.worlds?.plans || []) for(const assignment of plan.assignments || []){
    const answers = {...assignment.answers};
    const key = assignmentKey(answers);
    if(key == null || seen.has(key)) continue;
    seen.add(key); assignments.push({answers, assignmentKey:key});
  }
  return {ok:true, date, assignments};
}

function validConditionShape(condition){
  if(condition == null) return true;
  if(!record(condition) || typeof condition.valid !== 'boolean' || !Array.isArray(condition.terms)) return false;
  if(!condition.valid) return condition.terms.length === 0;
  if(!['single', 'and', 'or'].includes(condition.operator) || !condition.terms.length) return false;
  if(condition.operator === 'single' && condition.terms.length !== 1) return false;
  return condition.terms.every(term => record(term) && typeof term.key === 'string' &&
    /^[a-z0-9-]+$/i.test(term.key) && typeof term.negated === 'boolean') &&
    new Set(condition.terms.map(term => term.key)).size === condition.terms.length;
}

function hasWhenCycle(decisions){
  const visiting = new Set(), finished = new Set();
  const visit = decision => {
    if(!record(decision) || typeof decision.key !== 'string') return true;
    if(finished.has(decision.key)) return false;
    if(visiting.has(decision.key)) return true;
    visiting.add(decision.key);
    for(const term of decision.when?.terms || []) if(visit(decisions[term.key])) return true;
    visiting.delete(decision.key); finished.add(decision.key);
    return false;
  };
  return Object.values(decisions).some(visit);
}

function safeStructure(model, source){
  if(!record(model) || !Array.isArray(model.periods) || !Array.isArray(model.items) ||
     !Array.isArray(model.decisions) || !record(model.decisionByName))
    return refusal('invalid-source-model', 'Paths source is not a complete parsed model.');
  if(source == null)
    return refusal('unsafe-source-title', `The Paths title cannot fit Roadmap's visible projection basis.`);
  if(model.periods.length < 2 || model.periods.length > 8)
    return refusal('unsupported-period-count', 'A Roadmap projection needs between 2 and 8 Paths periods.');
  if(!model.periods.every(period => record(period) && safePeriod(period.name)))
    return refusal('unsafe-period', 'A Paths period name cannot be represented exactly in Roadmap.');
  if(new Set(model.periods.map(period => period.name.toLowerCase())).size !== model.periods.length)
    return refusal('duplicate-period', 'Paths period names must be unique for a Roadmap projection.');
  if(!ROADMAP_PALETTES.has(model.palette))
    return refusal('unsupported-palette', 'The Paths palette is not available in Roadmap.');
  if(model.accent != null && !/^#[0-9a-f]{6}$/i.test(model.accent))
    return refusal('unsafe-accent', 'The Paths accent cannot be represented exactly in Roadmap.');

  const decisionKeys = new Set(model.decisions.map(decision => decision?.key));
  if(decisionKeys.size !== model.decisions.length || Object.keys(model.decisionByName).length !== decisionKeys.size ||
     !model.decisions.every(decision => record(decision) && typeof decision.key === 'string' &&
       model.decisionByName[decision.key] === decision && validConditionShape(decision.when)) ||
     Object.keys(model.decisionByName).some(key => !decisionKeys.has(key)) || hasWhenCycle(model.decisionByName))
    return refusal('invalid-source-model', 'Paths decisions are not a complete parsed model.');

  let lastPeriod = -1;
  for(const item of model.items){
    if(!record(item) || !Number.isInteger(item.periodIndex) || item.periodIndex < 0 ||
       item.periodIndex >= model.periods.length || item.period !== model.periods[item.periodIndex].name)
      return refusal('invalid-item-period', 'A Paths item is not attached to a representable period.');
    if(item.periodIndex < lastPeriod)
      return refusal('nonmonotonic-period-order', 'Paths revisits an earlier period, so Roadmap cannot preserve both horizon and occurrence order.');
    if(!validConditionShape(item.condition))
      return refusal('invalid-source-model', 'A Paths item condition is not a complete parsed condition.');
    lastPeriod = item.periodIndex;
  }
  return {ok:true};
}

function safeIncludedItems(items, periods){
  for(const item of items){
    if(!safeLane(item.lane) || !safeTitle(item.title, item.lane !== '', periods) ||
       !safeNote(item.note || '') || !safeUrl(item.url))
      return refusal('unsafe-item-text', `Included Paths item ${JSON.stringify(item.title || '')} cannot be represented exactly in Roadmap.`);
    if(item.status != null && !STATUSES.has(item.status))
      return refusal('unsupported-status', `Included Paths item ${JSON.stringify(item.title)} has a status Roadmap cannot represent.`);
  }
  return {ok:true};
}

function acceptedExactly(confirmation, inspected){
  const {assumed} = inspected.receipt;
  if(assumed.length === 0 && confirmation == null) return true;
  if(!record(confirmation) || confirmation.assignmentKey !== inspected.assignmentKey ||
     confirmation.date !== inspected.receipt.date || !Array.isArray(confirmation.assumed)) return false;
  const accepted = confirmation.assumed;
  const map = {};
  for(const entry of accepted){
    if(!record(entry) || typeof entry.key !== 'string' || !/^[a-z0-9-]+$/i.test(entry.key) ||
       !DIRECTIONS.has(entry.direction)) return false;
    const key = entry.key.toLowerCase();
    if(Object.prototype.hasOwnProperty.call(map, key)) return false;
    map[key] = entry.direction;
  }
  if(Object.keys(map).length !== assumed.length) return false;
  return assumed.every(entry => map[entry.key.toLowerCase()] === entry.direction);
}

/* A confirmation is bound to the exact basis and projection date. A caller
   cannot carry an acceptance from one today/world into another. */
export function projectionAcceptance(inspected){
  if(!inspected?.ok) return null;
  return {assignmentKey:inspected.assignmentKey, date:inspected.receipt.date, fingerprint:inspected.fingerprint,
    assumed:inspected.receipt.assumed.map(({key, direction}) => ({key, direction}))};
}

function itemLine(item){
  let line = '  ' + (item.lane ? `${item.lane}: ` : '') + item.title;
  if(item.status) line += ` [${item.status}]`;
  if(item.note) line += ` -- ${item.note}`;
  if(item.url) line += ` -> ${item.url}`;
  return line;
}

function projectionText(model, candidate){
  const {source, date, receipt, includedItems} = candidate;
  const clauses = [`paths "${source}"`];
  if(receipt.known.length) clauses.push('answered ' + receipt.known.map(entry =>
    `${entry.key}=${entry.direction}@${entry.date}`).join(', '));
  if(receipt.assumed.length) clauses.push('assumed ' + receipt.assumed.map(entry =>
    `${entry.key}=${entry.direction}@${entry.date}`).join(', '));

  const lines = [
    `title: ${source} — delivery projection`,
    `date: ${date}`,
    'wip: off',
    `basis: ${clauses.join('; ')}`,
    `horizons: ${model.periods.map(period => period.name).join(', ')}`,
    `palette: ${model.palette}`,
  ];
  if(model.accent) lines.push(`accent: ${model.accent}`);
  lines.push('');

  /* Roadmap horizons are the board's spatial order. Emit even empty horizons
     in that order; filtering a world must never pull Later ahead of Now. */
  for(let index = 0; index < model.periods.length; index++){
    lines.push(model.periods[index].name);
    for(const item of includedItems) if(item.periodIndex === index) lines.push(itemLine(item));
  }
  return lines.join('\n');
}

function candidateFingerprint(candidate){
  return projectionText(candidate.model, candidate);
}

/* Returns a receipt and candidate data, never Roadmap text. This is the safe
   API for a selector/confirmation UI. */
export function inspectRoadmapProjection(model, injectedDate, answers){
  const date = model?.today || injectedDate;
  if(!isValidDate(date)) return refusal('invalid-projection-date', 'Choose a real ISO projection date.');
  const source = sourceLabel(model || {});
  const structure = safeStructure(model, source);
  if(!structure.ok) return structure;

  const selectedKey = assignmentKey(answers);
  const selectedAnswers = normalizedAnswers(answers);
  if(selectedKey == null || !selectedAnswers)
    return refusal('invalid-assignment', 'Choose one exact Paths answer assignment.');
  if(model.items.some(item => item.condition?.terms.some(term => !model.decisionByName[term.key])))
    return refusal('invalid-item-condition', 'A delivery-item condition refers to a decision that does not exist.');
  const relevant = relevantDecisions(model);
  if(!relevant.length)
    return refusal('no-relevant-decisions', 'No delivery item depends on a Paths decision.');
  /* Membership is checked against the same delivery-scoped enumeration the
     stage selector displays. Unrelated document questions cannot make an exact
     delivery world stale, and a caller still cannot fabricate an answer map. */
  const worlds = roadmapProjectionWorlds(model, date);
  if(!worlds.ok) return worlds;
  if(!new Set(worlds.assignments.map(entry => entry.assignmentKey)).has(selectedKey))
    return refusal('stale-assignment', 'That exact answer assignment is no longer a current Paths world.');
  if(relevant.some(decision => decision.when && !decision.when.valid))
    return refusal('invalid-decision-condition', 'Fix every relevant decision dependency before creating a Roadmap projection.');
  if(relevant.some(decision => decision.cycle ||
     decision.when?.terms?.some(term => !model.decisionByName[term.key])))
    return refusal('invalid-decision-condition', 'A relevant decision dependency cannot be resolved exactly.');

  const relevantKeys = new Set(relevant.map(decision => decision.key));
  if(Object.keys(selectedAnswers).some(key => {
    const sourceDecision = model.decisionByName[key];
    return !relevantKeys.has(key) || !sourceDecision || sourceDecision.answer?.direction || sourceDecision.cycle ||
      (sourceDecision.when && !sourceDecision.when.valid);
  }))
    return refusal('stale-assignment', 'That exact answer assignment is no longer a current Paths world.');
  /* An authored answer is part of current source truth even if a caller
     mutates a parsed model instead of producing a fresh parse object. */
  if(relevant.some(sourceDecision => sourceDecision.answer?.direction &&
     selectedAnswers[sourceDecision.key] != null && selectedAnswers[sourceDecision.key] !== sourceDecision.answer.direction))
    return refusal('stale-assignment', 'That exact answer assignment conflicts with a current Paths answer.');

  let projected;
  try {
    projected = evaluate(model, date, selectedAnswers);
  } catch {
    return refusal('invalid-source-model', 'Paths source is not a complete parsed model.');
  }
  /* The selected map is a current exact member of the scoped Possible Plans
     matrix. Active keys must resolve exactly; dormant/moot mechanical arms are
     allowed only because membership above proves they came from that matrix,
     and they remain omitted from the receipt and basis. */
  if(relevant.some(sourceDecision => {
    const decision = projected.decisionByName[sourceDecision.key];
    return decision?.availability === 'active' && !sourceDecision.answer?.direction &&
      selectedAnswers[sourceDecision.key] !== decision.effectiveAnswer;
  }))
    return refusal('stale-assignment', 'That exact answer assignment is no longer a current Paths world.');
  const known = [], assumed = [], omitted = [];
  for(const sourceDecision of relevant){
    if(!Array.isArray(sourceDecision.answers) || sourceDecision.answers.length > 1 ||
       (sourceDecision.answers.length === 1 && (!DIRECTIONS.has(sourceDecision.answers[0].direction) ||
        sourceDecision.answer !== sourceDecision.answers[0])) ||
       (sourceDecision.answers.length === 0 && sourceDecision.answer != null))
      return refusal('invalid-authored-answer', `Decision ${JSON.stringify(sourceDecision.name)} has a malformed, repeated or conflicting authored answer.`);
    const decision = projected.decisionByName[sourceDecision.key];
    if(!decision) return refusal('missing-relevant-decision', 'A relevant Paths decision could not be evaluated.');
    if(decision.availability === 'dormant' || decision.availability === 'moot'){
      const reason = decision.availability === 'moot'
        ? {kind:'moot', hostKey:decision.mootReason?.hostKey || null,
          host:decision.mootReason?.host || null, direction:decision.mootReason?.direction || null}
        : {kind:'dormant', waitingFor:(sourceDecision.when?.terms || []).map(term => term.key)};
      omitted.push({key:sourceDecision.key, name:sourceDecision.name, availability:decision.availability, reason});
      continue;
    }
    if(decision.availability !== 'active' || !decision.effectiveAnswer)
      return refusal('unresolved-active-decision', `Decision ${JSON.stringify(sourceDecision.name)} is active but has no exact answer.`);
    if(sourceDecision.key.length > MAX_BASIS_KEY)
      return refusal('basis-key-too-long', `Decision ${JSON.stringify(sourceDecision.name)} is too long for Roadmap's visible projection basis.`);
    if(sourceDecision.answer?.direction){
      if(!isValidDate(sourceDecision.answer.date))
        return refusal('missing-answer-date', `Decision ${JSON.stringify(sourceDecision.name)} needs the actual answer date before projection.`);
      if(sourceDecision.answer.date > date)
        return refusal('future-answer-date', `Decision ${JSON.stringify(sourceDecision.name)} is dated after the projection date.`);
      known.push({key:sourceDecision.key, direction:sourceDecision.answer.direction, date:sourceDecision.answer.date});
    } else {
      assumed.push({key:sourceDecision.key, direction:decision.effectiveAnswer, date});
    }
  }
  if(known.length + assumed.length > MAX_BASIS_ENTRIES)
    return refusal('basis-too-large', `Roadmap's visible projection basis supports at most ${MAX_BASIS_ENTRIES} active decisions.`);

  for(const item of projected.items){
    if(item.condition && (item.itemState === 'waiting' || item.itemState === 'limbo' ||
       item.conditionResult?.value === 'invalid'))
      return refusal('unresolved-item', `Delivery item ${JSON.stringify(item.title)} is not resolved in this exact world.`);
    if((item.status === 'doing' || item.status === 'blocked') && item.itemState !== 'in-plan')
      return refusal('in-flight-item-dropped', `In-flight item ${JSON.stringify(item.title)} would be dropped by this world.`);
  }

  const includedItems = projected.items.filter(item => item.itemState === 'in-plan');
  /* Text intentionally omitted by this exact world has no target mapping and
     therefore cannot poison the handoff. Structural period integrity was
     checked above because it governs the whole output; mapped fields are
     checked only for occurrences that will actually travel. */
  const itemSafety = safeIncludedItems(includedItems, model.periods);
  if(!itemSafety.ok) return itemSafety;
  const receipt = {source, date, known, assumed, omitted};
  const candidate = {model, source, date, receipt, includedItems};
  return {ok:true, assignmentKey:selectedKey, receipt, fingerprint:candidateFingerprint(candidate), candidate};
}

/* acceptedAssumptions is an exact [{key,direction}] ledger. A boolean or a
   partial list is intentionally insufficient: a source edit must invalidate
   prior confirmation instead of silently accepting a different world. */
export function buildRoadmapProjection(model, injectedDate, answers, confirmation){
  const inspected = inspectRoadmapProjection(model, injectedDate, answers);
  if(!inspected.ok) return inspected;
  if(!acceptedExactly(confirmation, inspected) || (confirmation != null && confirmation.fingerprint !== inspected.fingerprint))
    return refusal('assumptions-not-accepted', 'Accept every assumed answer in this exact world before creating its Roadmap.',
      {receipt:inspected.receipt, assignmentKey:inspected.assignmentKey});
  return {ok:true, text:projectionText(model, inspected.candidate),
    receipt:inspected.receipt, assignmentKey:inspected.assignmentKey};
}

/* UI-ready exact delivery outcomes. Distinct mechanical assignments can land
   on the same effective world when a conditional child is dormant or moot;
   fingerprint dedupe prevents presenting false choices with identical receipt
   and Roadmap output. Unavailable worlds remain separate and explanatory. */
export function roadmapProjectionChoices(model, injectedDate){
  const worlds = roadmapProjectionWorlds(model, injectedDate);
  if(!worlds.ok) return worlds;
  const choices = [], seen = new Set();
  for(const assignment of worlds.assignments){
    const inspected = inspectRoadmapProjection(model, injectedDate, assignment.answers);
    const effectiveKey = inspected.ok ? `effective:${inspected.fingerprint}` : `raw:${assignment.assignmentKey}`;
    if(seen.has(effectiveKey)) continue;
    seen.add(effectiveKey);
    choices.push({answers:assignment.answers, assignmentKey:assignment.assignmentKey, inspected});
  }
  return {ok:true, date:worlds.date, choices};
}
