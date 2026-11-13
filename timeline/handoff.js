/* #93: the merge-risk deadline → a premortem frame (2026-08-02). Pure builder —
   returns the premortem doc object, or null when there is no merge to premortem
   (the button renders only on non-null; a handoff is never a dead link). The
   TARGET tool's own store/parse round-trips this in tests. */
import {mergeBias} from './mergebias.js';
import {fmtQuoted} from './parse.js';
import {handoffMeta} from '../assets/handoff.js';

export function premortemHandoff(model, today, returnTo = ''){
  today = model.today ?? today;                // the same today the page uses
  const mb = mergeBias(model, today);
  if(!mb) return null;
  const title = String(model.title || 'the plan').trim();
  return {
    v: 1, id: 'handoff',                       // fromLink mints a fresh id on import
    title,
    question: 'It’s ' + fmtQuoted(mb.byDate, mb.byMonth) + ' and ' + title + ' slipped. Why?',
    unit: '£k', people: 5, phase: 'FRAME', entries: [],
    x: handoffMeta('timeline', 'risk-register', 'Timeline', returnTo),
  };
}
