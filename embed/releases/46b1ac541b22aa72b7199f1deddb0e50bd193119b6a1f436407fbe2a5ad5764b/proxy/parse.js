/* /proxy DSL → authored model. Pure; no DOM and no inference.
   Measurements live only on the hunt/report pattern. Theory blocks contain
   authored mechanisms and outcomes, never the proxy or its readings. */

import {PALETTE_NAMES} from '../assets/series.js';

export const MODES = ['optimise', 'monitor'];
export const BASES = ['reasoned-mechanism', 'speculative-concern'];
export const MAX_FAILURE_THEORIES = 3;
export const MAX_PROTECTED_OUTCOMES = 20;
export const MAX_FIELD_CHARS = 1000;
export const MAX_SOURCE_CHARS = 200_000;

const TOP_FIELDS = new Map([
  ['title', 'title'],
  ['date', 'date'],
  ['outcome', 'outcome'],
  ['proxy', 'proxy'],
  ['action', 'action'],
  ['mode', 'mode'],
  ['optimisation-pressure', 'optimisationPressure'],
  ['trade-off', 'tradeOff'],
  ['decision-rule', 'decisionRule'],
  ['verdict', 'verdict'],
  ['palette', 'palette'],
  ['accent', 'accent'],
]);

const THEORY_FIELDS = new Map([
  ['mechanism', 'mechanism'],
  ['harmed-outcome', 'harmedOutcome'],
  ['guardrail', 'guardrail'],
  ['basis', 'basis'],
  ['support', 'support'],
  ['weaken-with', 'weakenWith'],
]);

const PATTERN_FIELDS = new Map([
  ['proxy-reading', 'proxyReading'],
  ['outcome-reading', 'outcomeReading'],
  /* Read old shared links without silently endorsing their wording. New source
     and the authored model use the outcome-neutral field above. */
  ['protected-outcome-reading', 'outcomeReading'],
  /* `outcome:` can point at the desired outcome or any declared protected
     outcome. `protected-outcome:` remains readable source shorthand, but maps
     to the same target rather than making a second kind of reading. */
  ['outcome', 'outcome'],
  ['protected-outcome', 'outcome'],
  ['population', 'population'],
  ['horizon', 'horizon'],
  ['comparator', 'comparator'],
  ['source', 'source'],
]);

const canonical = value => String(value ?? '').trim().replace(/\s+/g, ' ').toLowerCase();
const displayKey = key => key.replace(/[A-Z]/g, c => '-' + c.toLowerCase());
const stripComment = value => value.replace(/\s+\/\/.*$/, '').trim();

function emptyModel(){
  return {
    title: '', date: '', outcome: '', proxy: '', action: '', mode: 'optimise',
    optimisationPressure: '', tradeOff: '', decisionRule: '', verdict: null,
    palette: 'ocean', accent: null,
    intendedTheory: null, protectedOutcomes: [], failureTheories: [],
    reportedPattern: null, warnings: [], srcLines: {}, rejected: false,
  };
}

function blankIntended(srcLine){
  return {mechanism: '', srcLine, srcLines: {}};
}

function blankTheory(id, srcLine){
  return {id, mechanism: '', harmedOutcome: '', guardrail: '', basis: null,
    support: '', weakenWith: '', srcLine, srcLines: {}, harmedOutcomeRef: null};
}

function blankPattern(srcLine){
  return {proxyReading: '', outcomeReading: '', outcome: '', population: '',
    horizon: '', comparator: '', source: '', srcLine, srcLines: {}, outcomeRef: null};
}

function isIsoDate(value){
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if(!m) return false;
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  return d.getUTCFullYear() === +m[1] && d.getUTCMonth() === +m[2] - 1 && d.getUTCDate() === +m[3];
}

export function parse(input){
  const model = emptyModel();
  const text = String(input ?? '');
  if(text.length > MAX_SOURCE_CHARS){
    model.rejected = true;
    model.warnings.push(`source exceeds ${MAX_SOURCE_CHARS.toLocaleString('en')} characters — hunt rejected; split the review rather than truncating claims`);
    return model;
  }

  const lines = text.split(/\r?\n/);
  const warn = (ln, message) => model.warnings.push(`line ${ln + 1}: ${message}`);
  const seenTop = new Set();
  const theoryIds = new Set();
  const protectedNames = new Set();
  let current = null; // {kind, node?, ignored?}

  const readValue = (rawValue, key, ln) => {
    const value = stripComment(rawValue);
    if(value.length > MAX_FIELD_CHARS){
      warn(ln, `${key} exceeds ${MAX_FIELD_CHARS} characters — value ignored rather than truncated`);
      return null;
    }
    return value;
  };

  const setTop = (sourceKey, targetKey, rawValue, ln) => {
    /* Verdict follows the shared authored-verdict convention: the last line
       wins, so the menu-first editor can safely rewrite its effective line.
       Other top-level fields deliberately remain first-wins. */
    if(seenTop.has(targetKey) && targetKey !== 'verdict'){
      warn(ln, `${sourceKey} is already declared — second value ignored`);
      return;
    }
    if(seenTop.has(targetKey)) warn(ln, `${sourceKey} is already declared — later value used`);
    seenTop.add(targetKey);
    const value = readValue(rawValue, sourceKey, ln);
    model.srcLines[targetKey] = ln;
    if(value == null){ model[targetKey] = targetKey === 'mode' ? null : ''; return; }
    if(targetKey === 'mode'){
      const mode = value.toLowerCase();
      if(!MODES.includes(mode)){
        model.mode = null;
        warn(ln, `unknown mode "${value}" — use ${MODES.join(' or ')}`);
      } else model.mode = mode;
      return;
    }
    if(targetKey === 'palette'){
      const palette = value.toLowerCase();
      if(PALETTE_NAMES.includes(palette)) model.palette = palette;
      else warn(ln, `unknown palette "${value}" — options: ${PALETTE_NAMES.join(', ')}`);
      return;
    }
    if(targetKey === 'accent'){
      if(/^#[0-9a-f]{6}$/i.test(value)) model.accent = value;
      else warn(ln, 'accent wants a 6-digit hex like #C05621');
      return;
    }
    if(targetKey === 'date' && value && !isIsoDate(value))
      warn(ln, `date "${value}" is not valid — use YYYY-MM-DD`);
    model[targetKey] = value;
  };

  const setChild = (node, targetKey, sourceKey, rawValue, ln, kind) => {
    if(Object.hasOwn(node.srcLines, targetKey)){
      warn(ln, `${sourceKey} is already declared in this ${kind} — second value ignored`);
      return;
    }
    node.srcLines[targetKey] = ln;
    const value = readValue(rawValue, sourceKey, ln);
    if(value == null){ node[targetKey] = targetKey === 'basis' ? null : ''; return; }
    if(targetKey === 'basis'){
      const basis = value.toLowerCase();
      if(!BASES.includes(basis)){
        node.basis = null;
        warn(ln, `unknown basis "${value}" — use ${BASES.join(' or ')}`);
      } else node.basis = basis;
      return;
    }
    node[targetKey] = value;
  };

  for(let ln = 0; ln < lines.length; ln++){
    const withTabs = lines[ln];
    const raw = withTabs.replace(/\t/g, '  ');
    const line = raw.trim();
    if(!line || line.startsWith('//')) continue;
    if(withTabs.includes('\t')) warn(ln, 'tab indentation treated as 2 spaces; use spaces to keep the source unambiguous');
    const indent = raw.match(/^ */)[0].length;

    if(indent === 0){
      current = null;

      if(/^intended-theory\s*:\s*$/i.test(line)){
        if(model.intendedTheory){
          warn(ln, 'second intended-theory block ignored — keep one intended mechanism');
          current = {kind: 'intended', ignored: true};
        } else {
          model.intendedTheory = blankIntended(ln);
          current = {kind: 'intended', node: model.intendedTheory};
        }
        continue;
      }

      if(/^protects\s*:\s*$/i.test(line)){
        current = {kind: 'protects'};
        continue;
      }

      const failure = /^failure-theory(?:\s+([^:]*?))?\s*:\s*$/i.exec(line);
      if(failure){
        const id = (failure[1] || '').trim();
        if(!id){
          warn(ln, 'failure-theory needs an id, e.g. "failure-theory low-intent:" — block ignored');
          current = {kind: 'failure', ignored: true};
        } else if(id.length > 120){
          warn(ln, 'failure-theory id exceeds 120 characters — block ignored');
          current = {kind: 'failure', ignored: true};
        } else if(theoryIds.has(canonical(id))){
          warn(ln, `failure theory "${id}" is already declared — duplicate block ignored`);
          current = {kind: 'failure', ignored: true};
        } else if(model.failureTheories.length >= MAX_FAILURE_THEORIES){
          warn(ln, `a hunt keeps at most ${MAX_FAILURE_THEORIES} failure theories — "${id}" ignored`);
          current = {kind: 'failure', ignored: true};
        } else {
          const theory = blankTheory(id, ln);
          model.failureTheories.push(theory);
          theoryIds.add(canonical(id));
          current = {kind: 'failure', node: theory};
        }
        continue;
      }

      if(/^reported-pattern\s*:\s*$/i.test(line)){
        if(model.reportedPattern){
          warn(ln, 'second reported-pattern block ignored — keep one reported reading context');
          current = {kind: 'pattern', ignored: true};
        } else {
          model.reportedPattern = blankPattern(ln);
          current = {kind: 'pattern', node: model.reportedPattern};
        }
        continue;
      }

      const top = /^([a-z][\w-]*)\s*:\s*(.*)$/i.exec(line);
      if(top){
        const sourceKey = top[1].toLowerCase();
        const targetKey = TOP_FIELDS.get(sourceKey);
        if(!targetKey) warn(ln, `unknown top-level key "${sourceKey}" — line ignored`);
        else setTop(sourceKey, targetKey, top[2], ln);
      } else warn(ln, `cannot read top-level line "${line.slice(0, 60)}" — line ignored`);
      continue;
    }

    if(indent !== 2){
      warn(ln, `expected exactly 2 spaces inside a block — line ignored`);
      continue;
    }
    if(!current){
      warn(ln, 'indented field has no block above it — line ignored');
      continue;
    }
    if(current.ignored) continue;

    if(current.kind === 'protects'){
      const item = /^-\s+(.+)$/.exec(line);
      if(!item){ warn(ln, 'protected outcome wants "- Outcome name" — line ignored'); continue; }
      const name = readValue(item[1], 'protected outcome', ln);
      if(name == null || !name){ warn(ln, 'protected outcome is empty — line ignored'); continue; }
      const key = canonical(name);
      if(protectedNames.has(key)){
        warn(ln, 'protected outcome is already declared — duplicate ignored');
      } else if(model.protectedOutcomes.length >= MAX_PROTECTED_OUTCOMES){
        warn(ln, `at most ${MAX_PROTECTED_OUTCOMES} protected outcomes are retained — extra item ignored`);
      } else {
        protectedNames.add(key);
        model.protectedOutcomes.push({name, srcLine: ln});
      }
      continue;
    }

    const child = /^([a-z][\w-]*)\s*:\s*(.*)$/i.exec(line);
    if(!child){ warn(ln, `cannot read ${current.kind} field "${line.slice(0, 60)}" — line ignored`); continue; }
    const sourceKey = child[1].toLowerCase();
    if(current.kind === 'intended'){
      if(sourceKey !== 'mechanism') warn(ln, `unknown intended-theory field "${sourceKey}" — line ignored`);
      else setChild(current.node, 'mechanism', sourceKey, child[2], ln, 'intended-theory');
    } else if(current.kind === 'failure'){
      const targetKey = THEORY_FIELDS.get(sourceKey);
      if(!targetKey) warn(ln, `unknown failure-theory field "${sourceKey}" — line ignored`);
      else setChild(current.node, targetKey, sourceKey, child[2], ln, 'failure-theory');
    } else if(current.kind === 'pattern'){
      const targetKey = PATTERN_FIELDS.get(sourceKey);
      if(!targetKey) warn(ln, `unknown reported-pattern field "${sourceKey}" — line ignored`);
      else {
        if(sourceKey === 'protected-outcome-reading')
          warn(ln, 'protected-outcome-reading is legacy syntax — use outcome-reading');
        setChild(current.node, targetKey, sourceKey, child[2], ln, 'reported-pattern');
      }
    }
  }

  const desiredKey = canonical(model.outcome);
  const protectedByKey = new Map(model.protectedOutcomes.map(item => [canonical(item.name), item.name]));
  for(const theory of model.failureTheories){
    const refKey = canonical(theory.harmedOutcome);
    if(refKey && desiredKey && refKey === desiredKey)
      theory.harmedOutcomeRef = {kind: 'desired', name: model.outcome};
    else if(refKey && protectedByKey.has(refKey))
      theory.harmedOutcomeRef = {kind: 'protected', name: protectedByKey.get(refKey)};
    else if(refKey){
      const line = theory.srcLines.harmedOutcome ?? theory.srcLine;
      warn(line, `harmed outcome "${theory.harmedOutcome}" must reference the desired outcome or a declared protected outcome`);
    }

    for(const key of ['mechanism', 'harmedOutcome', 'guardrail', 'basis', 'weakenWith']){
      if(!theory[key])
        warn(theory.srcLine, `failure theory "${theory.id}" is missing ${displayKey(key)}`);
    }
  }

  if(model.reportedPattern){
    for(const [sourceKey, targetKey] of [
      ['proxy-reading', 'proxyReading'], ['outcome-reading', 'outcomeReading'],
      ['population', 'population'], ['horizon', 'horizon'],
      ['comparator', 'comparator'], ['source', 'source'],
    ]){
      if(!model.reportedPattern[targetKey])
        warn(model.reportedPattern.srcLine, `reported-pattern is missing ${sourceKey}`);
    }
    const stated = canonical(model.reportedPattern.outcome);
    if(stated){
      if(desiredKey && stated === desiredKey){
        model.reportedPattern.outcomeRef = {kind: 'desired', name: model.outcome, explicit: true};
      } else if(protectedByKey.has(stated)){
        model.reportedPattern.outcomeRef = {kind: 'protected', name: protectedByKey.get(stated), explicit: true};
      } else {
        const line = model.reportedPattern.srcLines.outcome ?? model.reportedPattern.srcLine;
        warn(line, `reported outcome "${model.reportedPattern.outcome}" must reference the desired outcome or a declared protected outcome`);
      }
    } else if((model.outcome ? 1 : 0) + model.protectedOutcomes.length === 1){
      const only = model.outcome
        ? {kind: 'desired', name: model.outcome, explicit: false}
        : {kind: 'protected', name: model.protectedOutcomes[0].name, explicit: false};
      model.reportedPattern.outcomeRef = only;
    } else if((model.outcome ? 1 : 0) + model.protectedOutcomes.length > 1){
      warn(model.reportedPattern.srcLine,
        'reported-pattern must name outcome when more than one desired/protected outcome is declared');
    } else {
      warn(model.reportedPattern.srcLine,
        'reported-pattern has an outcome-reading but no desired or protected outcome is declared');
    }
  }
  if(model.mode === 'monitor' && !model.optimisationPressure)
    model.warnings.push('monitor mode needs optimisation-pressure — name the target pressure this guardrail constrains');
  if(model.tradeOff && !model.decisionRule)
    model.warnings.push('trade-off is declared without a decision-rule — trade-off not yet decided');

  return model;
}
