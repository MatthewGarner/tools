/* Export scope is a semantic choice, not just renderer chrome. A full hunt with
   several theories must not silently inherit whichever scoped receipt happened
   to be selected in the live app. */
import {project} from './project.js';

const CAUSAL_LIMIT = 'The mechanism is an authored hypothesis, not proof of causal effect.';

export function fullHuntProjection(model){
  const hunt = project(model);
  const theories = hunt.failureTheories || [];
  const full = {...hunt, selectedTheoryId:null, selectedReceipt:null};
  const incomplete = theories.filter(theory => theory.status !== 'ready').length;
  const ready = theories.length - incomplete;
  const hasSpeculative = theories.some(theory => theory.basis === 'speculative-concern');
  const decisiveReason = hunt.status !== 'ready'
    ? hunt.verdict?.line
    : hasSpeculative
      ? 'At least one failure theory is speculative. Stress-test it before making this a target.'
      : hunt.verdict?.authoritative === false ? hunt.verdict.line : '';
  full.status = hunt.status !== 'ready'
    ? `aggregate · ${hunt.status}`
    : hasSpeculative || decisiveReason
      ? 'aggregate · non-authoritative'
      : 'aggregate review';
  const countLine = theories.length === 0
    ? 'No failure theory is stated.'
    : incomplete
      ? `${ready} of ${theories.length} failure ${theories.length === 1 ? 'theory is' : 'theories are'} fully stated; ${incomplete} ${incomplete === 1 ? 'is' : 'are'} incomplete.`
      : `${theories.length} failure ${theories.length === 1 ? 'theory is' : 'theories are'} fully stated; 0 are incomplete.`;
  const scopeLine = 'No scoped receipt is selected in this full-hunt view.';
  const incompleteLine = (!theories.length || incomplete) && !/incomplete review/i.test(decisiveReason || '')
    ? 'Incomplete review is not endorsement.' : '';
  full.verdict = {
    authoritative:false,
    line:[decisiveReason, countLine, incompleteLine, scopeLine]
      .filter(Boolean).join(' '),
    limit:hunt.verdict?.limit || CAUSAL_LIMIT,
  };
  return full;
}
