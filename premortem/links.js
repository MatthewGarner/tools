/* Public one-way link codec. Imports mint fresh records; no storage or source writeback. */
import {encodeHash, decodeHash} from '../assets/series.js';
import {validHandoffMeta} from '../assets/handoff.js';

const MAX = 8000;
const freshId = () => (globalThis.crypto?.randomUUID?.() ?? 'imp' + Date.now() + Math.random().toString(36).slice(2, 6));
const PHASES = new Set(['FRAME', 'WRITE', 'COLLECT', 'CLUSTER', 'SCORE', 'ACTIONS', 'VOTE', 'REGISTER']);
const KINDS = new Set(['risk', 'opportunity', 'fact', 'assumption', 'belief']);
const text = (value, max) => typeof value === 'string' ? value.slice(0, max) : '';
const date = value => typeof value === 'string' && Number.isFinite(Date.parse(value))
  ? new Date(value).toISOString() : null;
const range = (value, max = Infinity) => Array.isArray(value) && value.length === 2 &&
  value.every(n => Number.isFinite(n) && n >= 0 && n <= max) && value[0] <= value[1]
  ? [value[0], value[1]] : null;

function normaliseDoc(value){
  if(!value || typeof value !== 'object' || Array.isArray(value) || value.v !== 1 || !Array.isArray(value.entries)) return null;
  const mode = value.mode === 'success' ? 'success' : 'risk';
  const registerKind = mode === 'success' ? 'opportunity' : 'risk';
  const otherRegisterKind = mode === 'success' ? 'risk' : 'opportunity';
  // A shared link is an imported workshop, not permission to recast a failure
  // mode as a success condition (or the reverse). Unknown kinds still take the
  // established defensive normalisation path; an explicit other-register kind
  // is a semantic conflict and must be repaired at the source.
  if(value.entries.some(e => e && typeof e === 'object' && !Array.isArray(e) && e.kind === otherRegisterKind)) return null;
  const people = Number.isFinite(value.people) ? Math.max(1, Math.min(100, Math.floor(value.people))) : 5;
  let votesLeft = people * 3;
  const entries = value.entries.slice(0, 500).filter(e => e && typeof e === 'object' && !Array.isArray(e)).map((e, i) => {
    const kind = KINDS.has(e.kind) ? e.kind : registerKind;
    const isRegisterEntry = kind === registerKind;
    const isBoardEntry = ['fact', 'assumption', 'belief'].includes(kind);
    const actions = isRegisterEntry && Array.isArray(e.actions)
      ? e.actions.slice(0, 100).filter(a => a && typeof a === 'object' && !Array.isArray(a)).map(a => {
        const votes = Number.isFinite(a.votes) ? Math.min(votesLeft, Math.max(0, Math.floor(a.votes))) : 0;
        votesLeft -= votes;
        return {text: text(a.text, 2000), owner: text(a.owner, 300), done: a.done === true, votes};
      })
      : [];
    return {
      /* Imported ids drive rendered selectors, so mint safe unique ids rather
         than trusting hostile or duplicate source values. */
      id: 'imported-' + (i + 1), text: text(e.text, 2000), kind,
      tag: kind === 'risk' && ['tiger', 'paper-tiger', 'elephant'].includes(e.tag) ? e.tag : null,
      cluster: isBoardEntry || e.cluster == null ? null : text(e.cluster, 200),
      p: kind === 'risk' || kind === 'assumption' || kind === 'belief' ? range(e.p, 100) : null,
      impact: kind === 'risk' ? range(e.impact) : null,
      actions, votes: isRegisterEntry && Number.isFinite(e.votes) ? Math.min(people * 3, Math.max(0, Math.floor(e.votes))) : 0,
      essential: kind === 'opportunity' && e.essential === true,
      status: isBoardEntry ? 'open' : ['open', 'mitigating', 'closed'].includes(e.status) ? e.status : 'open',
      created: date(e.created), lastReviewed: date(e.lastReviewed),
    };
  });
  const x = validHandoffMeta(value.x, {kind: 'risk-register'});
  return {v: 1, id: freshId(), ...(mode === 'success' ? {mode} : {}), title: text(value.title, 500), question: text(value.question, 2000),
    unit: text(value.unit, 20), people,
    phase: PHASES.has(value.phase) ? value.phase : 'REGISTER', entries,
    ...(Number.isFinite(value.endsAt) ? {endsAt: value.endsAt} : {}), ...(x ? {x} : {})};
}

export async function toLink(doc){
  const s = await encodeHash(doc);
  return s.length > MAX ? null : '#' + s;
}

export async function fromLink(hash){
  try{
    const s = String(hash).replace(/^#/, '');
    if(!s) return null;
    return normaliseDoc(await decodeHash(s));
  }catch(e){ return null; }
}
