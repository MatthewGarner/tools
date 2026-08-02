/* #93: the merge-risk deadline → a premortem frame (2026-08-02). Pure builder —
   returns the premortem doc object, or null when there is no merge to premortem
   (the button renders only on non-null; a handoff is never a dead link). The
   TARGET tool's own store/parse round-trips this in tests. */
import {mergeBias} from './mergebias.js';
import {fmtDay} from './parse.js';

export function premortemHandoff(model, today){
  const mb = mergeBias(model, today);
  if(!mb) return null;
  const title = String(model.title || 'the plan').trim();
  return {
    v: 1, id: 'handoff',                       // fromLink mints a fresh id on import
    title,
    question: 'It’s ' + fmtDay(mb.byDate) + ' and ' + title + ' slipped. Why?',
    unit: '£k', people: 5, phase: 'FRAME', entries: [],
  };
}
