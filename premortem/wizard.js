/* Pure phase machine for the premortem wizard. Gating lives here so the app and
   the tests agree on when a phase can advance; the doc's `phase` is the state. */
import {isRisk, isOpportunity, isScoreable, modeOf} from './register.js';

export const PHASES = ['FRAME', 'WRITE', 'COLLECT', 'CLUSTER', 'SCORE', 'ACTIONS', 'VOTE', 'REGISTER'];

export function phaseLabel(doc, phase){
  if(modeOf(doc) !== 'success') return ({FRAME: 'Frame', WRITE: 'Write', COLLECT: 'Collect', CLUSTER: 'Cluster', SCORE: 'Score', ACTIONS: 'Actions', VOTE: 'Vote', REGISTER: 'Register'})[phase];
  return ({FRAME: 'Frame', WRITE: 'Write', COLLECT: 'Collect', CLUSTER: 'Cluster', SCORE: 'Commit', ACTIONS: 'Actions', VOTE: 'Vote', REGISTER: 'Register'})[phase];
}

export function canAdvance(doc){
  const success = modeOf(doc) === 'success';
  const es = (doc.entries || []).filter(success ? isOpportunity : isRisk);   // board items don't count toward the wizard gates
  switch(doc.phase){
    case 'FRAME': return doc.title?.trim() && doc.question?.trim()
      ? {ok: true} : {ok: false, why: success ? 'Name the effort and the success question first.' : 'Name the effort and the failure question first.'};
    case 'COLLECT': return es.length
      ? {ok: true} : {ok: false, why: success ? 'Write down at least one condition that made success possible.' : 'Write down at least one way it could fail.'};
    case 'SCORE': return success
      ? es.some(e => e.essential)
        ? {ok: true} : {ok: false, why: 'Mark at least one condition we must deliberately make true.'}
      : es.some(isScoreable)
        ? {ok: true} : {ok: false, why: 'Score at least one risk with complete low–high ranges (likelihood 0–100%, impact at least 0).'};
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
  const used = (doc.entries || []).filter(modeOf(doc) === 'success' ? isOpportunity : isRisk).reduce((s, e) => s + e.actions.reduce((t, a) => t + (a.votes || 0), 0), 0);
  return {...doc, entries: doc.entries.map(e => e.id !== entryId ? e : {
    ...e, actions: e.actions.map((a, ai) => {
      if(ai !== actionIdx) return a;
      if(dir > 0) return used >= pool ? a : {...a, votes: (a.votes || 0) + 1};
      return {...a, votes: Math.max(0, (a.votes || 0) - 1)};
    }),
  })};
}
