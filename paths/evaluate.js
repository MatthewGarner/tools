/* /paths semantic projection. Pure; `today` is always supplied by the caller. */
import {nameMap, own, cloneNames} from './names.js';

const VALUES = new Set(['true', 'false', 'unknown', 'invalid']);

const union = operands => {
  const out = new Set();
  for(const operand of operands) for(const member of operand.provenance || []) out.add(member);
  return out;
};

const evidenceOf = operands => operands.flatMap(operand => operand.evidence || []);

export function evaluateOperation(operator, operands){
  const values = operands.map(operand => operand.value);
  if(values.some(value => !VALUES.has(value) || value === 'invalid'))
    return {value:'invalid', provenance:union(operands), evidence:evidenceOf(operands)};

  if(operator === 'not'){
    const operand = operands[0];
    return {...operand, value:operand.value === 'true' ? 'false' : operand.value === 'false' ? 'true' : operand.value,
      provenance:new Set(operand.provenance || []), evidence:[...(operand.evidence || [])]};
  }

  let value, determining;
  if(operator === 'and'){
    if(values.includes('false')){ value = 'false'; determining = operands.filter(o => o.value === 'false'); }
    else if(values.includes('unknown')){ value = 'unknown'; determining = operands.filter(o => o.value === 'unknown'); }
    else { value = 'true'; determining = operands; }
  } else if(operator === 'or'){
    if(values.includes('true')){ value = 'true'; determining = operands.filter(o => o.value === 'true'); }
    else if(values.includes('unknown')){ value = 'unknown'; determining = operands.filter(o => o.value === 'unknown'); }
    else { value = 'false'; determining = operands; }
  } else {
    const operand = operands[0] || {value:'invalid', provenance:new Set(), evidence:[]};
    return {value:operand.value, provenance:new Set(operand.provenance || []), evidence:[...(operand.evidence || [])]};
  }
  return {value, provenance:union(determining), evidence:evidenceOf(determining)};
}

function normalizeClause(value, term){
  if(typeof value === 'string') return {value, provenance:new Set(), evidence:[{term}]};
  if(!value || !VALUES.has(value.value)) return {value:'invalid', provenance:new Set(), evidence:[{term}]};
  return {value:value.value, provenance:new Set(value.provenance || []),
    evidence:value.evidence ? [...value.evidence] : [{term, ...value}]};
}

export function evaluateCondition(condition, source){
  if(!condition || !condition.valid)
    return {value:'invalid', provenance:new Set(), evidence:[], condition};
  const resolver = typeof source === 'function'
    ? source
    : term => own(source, term.key) ?? own(source, term.name);
  const clauses = condition.terms.map(term => {
    let clause = normalizeClause(resolver(term), term);
    if(term.negated) clause = evaluateOperation('not', [clause]);
    return clause;
  });
  const result = evaluateOperation(condition.operator, clauses);
  return {...result, condition, clauses};
}

function projectWarning(code, line, subject, message){
  return {phase:'project', code, line, subject, message};
}

function appendWarning(warnings, seen, code, line, subject, message){
  const key = `${code}\0${line ?? ''}\0${subject ?? ''}`;
  if(seen.has(key)) return;
  seen.add(key);
  warnings.push(projectWarning(code, line, subject, message));
}

function formatDue(value){
  const months = ['January','February','March','April','May','June','July','August','September','October','November','December'];
  const [, month, day] = value.split('-').map(Number);
  return `${day} ${months[month - 1]}`;
}

const sentenceName = value => value ? value[0].toUpperCase() + value.slice(1) : value;

export function oversizedUrlWarning(){
  return projectWarning('oversized-url-state', null, 'url-state',
    'This plan is too large to store in the URL — shorten notes or remove unused items before sharing it.');
}

function hypotheticalOf(assignment, key){
  const value = own(assignment, key) ?? own(assignment, key.toLowerCase());
  if(value === 'yes' || value === 'no') return value;
  if(value === 'won') return 'yes';
  if(value === 'lost') return 'no';
  return null;
}

function falseReason(whenResult, model){
  const evidence = whenResult.evidence?.[0];
  if(!evidence) return null;
  const term = evidence.term;
  const host = model.decisionByName[term?.key];
  if(!host) return null;
  if(evidence.reason) return evidence.reason;
  const direction = evidence.rawValue === 'true' ? 'yes' : 'no';
  return {host:host.name, hostKey:host.key, direction};
}

function displayEvidenceFor(source, conditionResult, decisionByName, assumedEffect = null){
  if(!source.condition) return {kind:'unconditional'};
  if(!source.condition.valid || conditionResult.value === 'invalid') return {kind:'condition-error'};
  if(source.status === 'done' && conditionResult.value === 'false') return {kind:'completed'};
  const evidence = conditionResult.evidence || [];
  if(assumedEffect?.keys.length){
    const decision = decisionByName[assumedEffect.keys[0]];
    return {kind:assumedEffect.kind === 'follows' ? 'assumption' : 'set-aside',
      decision:decision.key, direction:decision.assumption.direction, decisions:[...assumedEffect.keys]};
  }
  for(const member of evidence){
    const decision = member.decision;
    if(member.reason && decision){
      return {kind:'host-exclusion', decision:decision.key,
        host:member.reason.hostKey || String(member.reason.host || '').toLowerCase(),
        direction:member.reason.direction};
    }
  }
  for(const member of evidence){
    const decision = member.decision;
    if(decision?.availability === 'active' && decision.answer?.direction &&
      decision.effectiveAnswer === decision.answer.direction){
      return {kind:'written-answer', decision:decision.key, direction:decision.answer.direction};
    }
  }
  for(const member of evidence){
    const decision = member.decision;
    if(decision?.availability === 'active' && decision.effectiveAnswer){
      return {kind:'assigned-answer', decision:decision.key, direction:decision.effectiveAnswer};
    }
  }
  const pending = evidence.find(member => member.decision)?.decision;
  return pending ? {kind:'pending-answer', decision:pending.key} : {kind:'condition-error'};
}

/* An assumption is in force once BOTH dates have passed: today is later than `answer-by` (the due date
   is the last day to answer, so overdue starts the day after) AND today is on or after the assumption's
   own date (a start date, so it applies on that day). An assumption with no date of its own is gated by
   `answer-by` alone. */
export function assumptionInForceOn(decision, today){
  const assumption = decision.assumption;
  if(!assumption || !decision.answerBy || !today || !(today > decision.answerBy)) return false;
  return !assumption.date || today >= assumption.date;
}

export function resolveDecisions(model, injectedToday, assignment = {}){
  const today = model.today || injectedToday || null;
  const projected = nameMap();
  const visiting = new Set();

  function resolve(key){
    key = key.toLowerCase();
    if(projected[key]) return projected[key];
    const source = model.decisionByName[key];
    if(!source) return {value:'invalid', provenance:new Set(), evidence:[], availability:'dormant'};
    if(source.cycle || visiting.has(key)){
      const cycleResult = {...source, availability:'dormant', effectiveAnswer:null, value:'unknown',
        provenance:new Set(['unknown']), evidence:[], assumption:source.assumption ? {...source.assumption, inForce:false} : null,
        overdue:false, late:!!(source.answer?.date && source.answerBy && source.answer.date > source.answerBy), cycle:true};
      projected[key] = cycleResult;
      return cycleResult;
    }
    visiting.add(key);
    let availability = 'active', whenResult = null;
    if(source.when){
      if(!source.when.valid){
        availability = 'dormant';
        whenResult = {value:'invalid', provenance:new Set(), evidence:[]};
      } else {
        whenResult = evaluateCondition(source.when, term => {
          const dependency = resolve(term.key);
          return {value:dependency.value, provenance:dependency.provenance,
            evidence:[{term, decision:dependency, rawValue:dependency.value, reason:dependency.mootReason}]};
        });
        availability = whenResult.value === 'true' ? 'active'
          : whenResult.value === 'false' ? 'moot' : 'dormant';
      }
    }
    const hypothetical = hypotheticalOf(assignment, key);
    let effectiveAnswer = null, value = 'unknown', provenance = new Set(['unknown']);
    let mootReason = null, assumptionInForce = false;
    if(availability === 'moot'){
      value = 'false'; provenance = new Set(['never-arose']);
      mootReason = falseReason(whenResult, model);
    } else if(availability === 'active' && source.answer?.direction){
      effectiveAnswer = source.answer.direction;
      value = effectiveAnswer === 'yes' ? 'true' : 'false';
      provenance = new Set(['answered']);
    } else if(availability === 'active' && hypothetical){
      effectiveAnswer = hypothetical;
      value = hypothetical === 'yes' ? 'true' : 'false';
      provenance = new Set(['answered']);
    } else if(availability === 'active' && assumptionInForceOn(source, today)){
      assumptionInForce = true;
      provenance = new Set([`assumed-${source.assumption.direction}`]);
    }
    const late = !!(source.answer?.date && source.answerBy && source.answer.date > source.answerBy);
    const overdue = availability === 'active' && !source.answer?.direction && !!(today && source.answerBy && today > source.answerBy);
    const result = {...source, availability, effectiveAnswer, value, provenance,
      evidence:[{decision:source, rawValue:value, reason:mootReason}], whenResult, mootReason,
      assumption:source.assumption ? {...source.assumption, inForce:assumptionInForce} : null,
      overdue, late, timeliness:{overdue, late}};
    projected[key] = result;
    visiting.delete(key);
    return result;
  }
  for(const decision of model.decisions) resolve(decision.key);
  return {today, decisions:model.decisions.map(d => projected[d.key]), decisionByName:projected};
}

function chooseParent(item, dependencies){
  const eligible = dependencies.filter(d => d.availability !== 'dormant');
  if(!eligible.length) return {parent:null, secondary:[]};
  const bySource = (a, b) => a.srcLine - b.srcLine;
  let candidates = eligible;
  if(item.condition.operator === 'and' && item.conditionResult.value === 'false'){
    const killing = new Set((item.conditionResult.evidence || []).map(e => e.term?.key));
    candidates = eligible.filter(d => killing.has(d.key));
  }
  let parent;
  if(item.condition.operator === 'or' && item.conditionResult.value !== 'false'){
    candidates = eligible.filter(d => d.value !== 'false');
    const dated = candidates.filter(d => d.answerBy);
    parent = (dated.length ? dated.sort((a, b) => a.answerBy.localeCompare(b.answerBy) || bySource(a, b))
      : candidates.sort(bySource))[0];
  } else if(item.condition.operator === 'and'){
    const dated = candidates.filter(d => d.answerBy);
    parent = (dated.length ? dated.sort((a, b) => b.answerBy.localeCompare(a.answerBy) || bySource(a, b))
      : candidates.sort(bySource))[0];
  } else parent = candidates.sort(bySource)[0];
  if(!parent) return {parent:null, secondary:eligible.sort(bySource).map(d => d.key)};
  return {parent:parent.key, secondary:eligible.filter(d => d.key !== parent.key).sort(bySource).map(d => d.key)};
}

/* The resolution this same document would have if every assumption now in force were the answer.
   It is a projection of what the evaluator already knows: it exists only to say which way an
   assumption points for an item whose condition is unknown because of it. */
function assumedResolutionFor(model, injectedToday, assignment, resolution){
  const forced = cloneNames(assignment);
  let any = false;
  for(const decision of resolution.decisions){
    if(decision.assumption?.inForce){ forced[decision.key] = decision.assumption.direction; any = true; }
  }
  return any ? resolveDecisions(model, injectedToday, forced) : null;
}

function conditionIn(source, resolution){
  return source.condition
    ? evaluateCondition(source.condition, term => {
        const decision = resolution.decisionByName[term.key];
        if(!decision) return {value:'invalid', provenance:new Set(), evidence:[]};
        return {value:decision.value, provenance:decision.provenance,
          evidence:[{term, decision, rawValue:decision.value, reason:decision.mootReason}]};
      })
    : {value:'true', provenance:new Set(), evidence:[], condition:null, clauses:[]};
}

function stateForSource(source, resolution, assumedResolution = null){
  const conditionResult = conditionIn(source, resolution);
  /* An item whose condition is unknown only because of an assumption: if every assumption in force
     were the answer, would the condition hold (working to the assumption), fail (set aside by it), or
     still depend on something else unknown (waiting)? */
  let assumedEffect = null;
  if(conditionResult.value === 'unknown' && assumedResolution && source.status !== 'done' &&
    [...conditionResult.provenance].some(p => p.startsWith('assumed-'))){
    const hypothetical = conditionIn(source, assumedResolution);
    if(hypothetical.value === 'true' || hypothetical.value === 'false'){
      /* name the assumptions that settled it: those the assumed answers decide in the condition, else
         (when the effect travels through a question's `when:`) those that left the condition unknown */
      const named = members => [...new Set((members || []).map(member => member.term?.key)
        .filter(key => resolution.decisionByName[key]?.assumption?.inForce))];
      const decided = named(hypothetical.evidence);
      const keys = decided.length ? decided : named(conditionResult.evidence);
      assumedEffect = {kind:hypothetical.value === 'true' ? 'follows' : 'set-aside', keys};
    }
  }
  let itemState = conditionResult.value === 'true' ? 'in-plan'
    : conditionResult.value === 'false' ? 'not-needed'
    : assumedEffect?.kind === 'follows' ? 'limbo'
    : assumedEffect?.kind === 'set-aside' ? 'set-aside'
    : 'waiting';
  if(source.status === 'done' && conditionResult.value !== 'invalid') itemState = 'in-plan';
  return {conditionResult, itemState, assumedEffect};
}

/* Reach needs only item states. Keep it on the same semantic helper as the
   full projection without constructing warnings, display evidence and card
   placement for twelve throwaway comparison worlds. */
export function projectItemStates(model, injectedToday, assignment = {}){
  const resolution = resolveDecisions(model, injectedToday, assignment);
  const assumed = assumedResolutionFor(model, injectedToday, assignment, resolution);
  return model.items.map(source => stateForSource(source, resolution, assumed).itemState);
}

export function evaluate(model, injectedToday, assignment = {}){
  const resolution = resolveDecisions(model, injectedToday, assignment);
  const assumedResolution = assumedResolutionFor(model, injectedToday, assignment, resolution);
  const warnings = [...model.warnings];
  const seen = new Set(warnings.map(w => `${w.code}\0${w.line ?? ''}\0${w.subject ?? ''}`));

  for(const decision of resolution.decisions){
    const assumptionLine = decision.assumption?.srcLine + 1;
    const answerLine = decision.answer?.srcLine + 1;
    const reason = decision.mootReason;
    if(decision.answer){
      if(decision.availability === 'dormant') appendWarning(warnings, seen, 'answer-dormant', answerLine, decision.key,
        `line ${answerLine}: the answer for ${JSON.stringify(decision.name)} is kept, but is not used until this question opens`);
      else if(decision.availability === 'moot') appendWarning(warnings, seen, 'answer-moot', answerLine, decision.key,
        `line ${answerLine}: the answer for ${JSON.stringify(decision.name)} is kept, but is not used — ${sentenceName(decision.name)} did not apply because ${sentenceName(reason?.host) || 'its host'} was ${reason?.direction || 'no'}; remove the answer if it is no longer useful`);
    }
    if(decision.assumption){
      if(decision.availability === 'dormant') appendWarning(warnings, seen, 'assumption-dormant', assumptionLine, decision.key,
        `line ${assumptionLine}: assumption not used because ${JSON.stringify(decision.name)} is not open yet — remove it, or wait until the question opens`);
      else if(decision.availability === 'moot') appendWarning(warnings, seen, 'assumption-moot', assumptionLine, decision.key,
        `line ${assumptionLine}: assumption not used — ${sentenceName(decision.name)} did not apply because ${sentenceName(reason?.host) || 'its host'} was ${reason?.direction || 'no'}; remove the assumption`);
      else if(decision.answer) appendWarning(warnings, seen, 'assumption-answered', assumptionLine, decision.key,
        `line ${assumptionLine}: assumption not used because ${JSON.stringify(decision.name)} already has "Answer: ${decision.answer.direction}" — remove the assumption`);
      else if(!decision.answerBy) appendWarning(warnings, seen, 'assumption-no-due', assumptionLine, decision.key,
        `line ${assumptionLine}: the assumption for ${JSON.stringify(decision.name)} cannot start without an "answer-by:" date — add one; assumption not used`);
      else if(!assumptionInForceOn(decision, resolution.today)){
        /* say what is true (it starts once both dates have passed) and which change would put it to use now */
        const dueOpen = !resolution.today || resolution.today <= decision.answerBy;
        const startsLater = !!(decision.assumption.date && (!resolution.today || resolution.today < decision.assumption.date));
        const code = dueOpen ? 'assumption-before-due' : 'assumption-not-started';
        const takesEffect = dueOpen
          ? `it takes effect after the answer is due (${formatDue(decision.answerBy)})${startsLater ? ` and on its own date (${formatDue(decision.assumption.date)})` : ''}`
          : `it takes effect on its own date (${formatDue(decision.assumption.date)})`;
        const fixes = [dueOpen ? 'move "answer-by:" to a date before today' : '',
          startsLater ? 'set the assumption date to today or earlier' : ''].filter(Boolean).join(' and ');
        appendWarning(warnings, seen, code, assumptionLine, decision.key,
          `line ${assumptionLine}: the assumption for ${JSON.stringify(decision.name)} is not in force yet — ${takesEffect}; to use it now, ${fixes}`);
      }
    }
  }

  const items = model.items.map(source => {
    const {conditionResult, itemState:projectedState, assumedEffect} = stateForSource(source, resolution, assumedResolution);
    let itemState = projectedState;
    if(source.status === 'done' && conditionResult.value !== 'invalid'){
      if(conditionResult.value === 'false'){
        const line = source.srcLine + 1;
        appendWarning(warnings, seen, 'done-false-condition', line, String(source.identity),
          `line ${line}: completed item ${JSON.stringify(source.title)} is labelled "Not needed" — kept because "[done]" records work already finished; remove the condition if the item was unconditional`);
      }
      itemState = 'in-plan';
    }
    const dependencies = source.condition?.valid
      ? source.condition.terms.map(t => resolution.decisionByName[t.key]).filter(Boolean)
      : [];
    const displayEvidence = displayEvidenceFor(source, conditionResult, resolution.decisionByName, assumedEffect);
    const item = {...source, conditionResult, itemState, state:itemState, displayEvidence, assumedEffect};
    const placement = source.condition?.valid ? chooseParent(item, dependencies) : {parent:null, secondary:[]};
    const secondaryDependencyMode = source.condition?.valid && source.condition.operator === 'and'
      ? 'required' : null;
    return {...item, parentDecision:placement.parent, secondaryDependencies:placement.secondary,
      secondaryDependencyMode};
  });

  return {...model, today:resolution.today, decisions:resolution.decisions,
    decisionByName:resolution.decisionByName, items, warnings};
}
