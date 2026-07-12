/* Pure phase machine for the premortem wizard. Gating lives here so the app and
   the tests agree on when a phase can advance; the doc's `phase` is the state. */
import {isRisk} from './register.js';

export const PHASES = ['FRAME', 'WRITE', 'COLLECT', 'CLUSTER', 'SCORE', 'ACTIONS', 'VOTE', 'REGISTER'];
const scoreable = e => Array.isArray(e.p) && Array.isArray(e.impact);

export function canAdvance(doc){
  const es = (doc.entries || []).filter(isRisk);   // board items (fact/assumption/belief) don't count toward the wizard gates
  switch(doc.phase){
    case 'FRAME': return doc.title?.trim() && doc.question?.trim()
      ? {ok: true} : {ok: false, why: 'Name the effort and the failure question first.'};
    case 'COLLECT': return es.length
      ? {ok: true} : {ok: false, why: 'Write down at least one way it could fail.'};
    case 'SCORE': return es.some(scoreable)
      ? {ok: true} : {ok: false, why: 'Score at least one risk — a likelihood and an impact range.'};
    default: return {ok: true};
  }
}

export function advance(doc){
  const i = PHASES.indexOf(doc.phase);
  if(i < 0 || i === PHASES.length - 1 || !canAdvance(doc).ok) return doc;
  return {...doc, phase: PHASES[i + 1]};
}
export function back(doc){
  const i = PHASES.indexOf(doc.phase);
  return i <= 0 ? doc : {...doc, phase: PHASES[i - 1]};
}

export function votePool(doc){ return (doc.people || 5) * 3; }

/* one ± vote on an action; totals never exceed the pool or drop below 0 */
export function castVote(doc, entryId, actionIdx, dir){
  const pool = votePool(doc);
  const used = (doc.entries || []).filter(isRisk).reduce((s, e) => s + e.actions.reduce((t, a) => t + (a.votes || 0), 0), 0);
  return {...doc, entries: doc.entries.map(e => e.id !== entryId ? e : {
    ...e, actions: e.actions.map((a, ai) => {
      if(ai !== actionIdx) return a;
      if(dir > 0) return used >= pool ? a : {...a, votes: (a.votes || 0) + 1};
      return {...a, votes: Math.max(0, (a.votes || 0) - 1)};
    }),
  })};
}
