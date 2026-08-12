/* localStorage home for the living register + link import/export. Storage-agnostic
   (pass any {getItem,setItem,removeItem} backend). A link is a one-way IMPORT — it
   mints a fresh id so a shared register never binds two browsers together. */

import {encodeHash, decodeHash} from '../assets/series.js';
import {validHandoffMeta} from '../assets/handoff.js';

const KEY = id => 'premortem:' + id, IDX = 'premortem:index', TRASH = 'premortem:trash', MAX = 8000;
const freshId = () => (globalThis.crypto?.randomUUID?.() ?? 'imp' + Date.now() + Math.random().toString(36).slice(2, 6));
const PHASES = new Set(['FRAME', 'WRITE', 'COLLECT', 'CLUSTER', 'SCORE', 'ACTIONS', 'VOTE', 'REGISTER']);
const KINDS = new Set(['risk', 'fact', 'assumption', 'belief']);
const text = (value, max) => typeof value === 'string' ? value.slice(0, max) : '';
const date = value => typeof value === 'string' && Number.isFinite(Date.parse(value))
  ? new Date(value).toISOString() : null;
const range = (value, max = Infinity) => Array.isArray(value) && value.length === 2 &&
  value.every(n => Number.isFinite(n) && n >= 0 && n <= max) && value[0] <= value[1]
  ? [value[0], value[1]] : null;

function normaliseDoc(value){
  if(!value || typeof value !== 'object' || Array.isArray(value) || value.v !== 1 || !Array.isArray(value.entries)) return null;
  const people = Number.isFinite(value.people) ? Math.max(1, Math.min(100, Math.floor(value.people))) : 5;
  let votesLeft = people;
  const entries = value.entries.slice(0, 500).filter(e => e && typeof e === 'object' && !Array.isArray(e)).map((e, i) => ({
    /* Imported ids drive rendered selectors, so mint safe unique ids rather than
       trusting hostile or duplicate source values. */
    id: 'imported-' + (i + 1), text: text(e.text, 2000),
    kind: KINDS.has(e.kind) ? e.kind : 'risk',
    tag: ['tiger', 'paper-tiger', 'elephant'].includes(e.tag) ? e.tag : null,
    cluster: e.cluster == null ? null : text(e.cluster, 200),
    p: range(e.p, 100), impact: range(e.impact),
    actions: Array.isArray(e.actions) ? e.actions.slice(0, 100).filter(a => a && typeof a === 'object' && !Array.isArray(a)).map(a => {
      const votes = Number.isFinite(a.votes) ? Math.min(votesLeft, Math.max(0, Math.floor(a.votes))) : 0;
      votesLeft -= votes;
      return {text: text(a.text, 2000), owner: text(a.owner, 300), done: a.done === true, votes};
    }) : [],
    votes: Number.isFinite(e.votes) ? Math.min(people, Math.max(0, Math.floor(e.votes))) : 0,
    status: ['open', 'mitigating', 'closed'].includes(e.status) ? e.status : 'open',
    created: date(e.created), lastReviewed: date(e.lastReviewed),
  }));
  const x = validHandoffMeta(value.x, {kind: 'risk-register'});
  return {v: 1, id: freshId(), title: text(value.title, 500), question: text(value.question, 2000),
    unit: text(value.unit, 20), people,
    phase: PHASES.has(value.phase) ? value.phase : 'REGISTER', entries,
    ...(Number.isFinite(value.endsAt) ? {endsAt: value.endsAt} : {}), ...(x ? {x} : {})};
}

export function makeStore(backend = localStorage){
  const readIdx = () => { try{ return JSON.parse(backend.getItem(IDX)) || []; }catch(e){ return []; } };
  const writeIdx = idx => backend.setItem(IDX, JSON.stringify(idx));
  const load = id => { try{ return JSON.parse(backend.getItem(KEY(id))); }catch(e){ return null; } };
  const list = () => readIdx();
  const remove = id => { backend.removeItem(KEY(id)); writeIdx(readIdx().filter(m => m.id !== id)); };
  const save = doc => {
    backend.setItem(KEY(doc.id), JSON.stringify(doc));
    const idx = readIdx().filter(m => m.id !== doc.id);
    const es = doc.entries || [];
    idx.push({id: doc.id, title: doc.title || '', entries: es.length,
      risks: es.filter(e => e.kind === 'risk').length, saved: Date.now()});
    writeIdx(idx);
  };
  /* Trash is an array of {doc, deleted} tombstones — one per deleted register,
     each purging on its own caller-armed timer, so a second delete can never
     clobber a still-pending first one (the bug: a single-slot TRASH value).
     The storage key is unchanged; a legacy single-object value (written before
     this migration) reads back transparently as a one-element array. */
  const readTrash = () => {
    try{
      const raw = JSON.parse(backend.getItem(TRASH));
      if(!raw) return [];
      return Array.isArray(raw) ? raw : [raw];
    }catch(e){ return []; }
  };
  const writeTrash = arr => arr.length ? backend.setItem(TRASH, JSON.stringify(arr)) : backend.removeItem(TRASH);
  return {
    save, load, list, remove,
    trashed(id){   // a specific tomb by doc id, or (default) the most recently deleted
      const arr = readTrash();
      if(!arr.length) return null;
      return id != null ? (arr.find(t => t.doc?.id === id) || null) : arr[arr.length - 1];
    },
    trashedAll: () => readTrash(),   // every pending tomb — boot re-arms all of them, not just the newest
    trash(id){
      const doc = load(id); if(!doc) return null;
      const tomb = {doc, deleted: Date.now()};
      writeTrash([...readTrash().filter(t => t.doc?.id !== id), tomb]);   // one pending tomb per doc id
      remove(id);
      return tomb;
    },
    restoreTrash(id){   // a specific tomb by doc id, or (default) the newest
      const arr = readTrash();
      if(!arr.length) return null;
      const idx = id != null ? arr.findIndex(t => t.doc?.id === id) : arr.length - 1;
      if(idx < 0) return null;
      const [tomb] = arr.splice(idx, 1);
      save(tomb.doc);
      writeTrash(arr);
      return tomb.doc;
    },
    purgeTrash(id){   // a specific tomb's own 10s timer calls this with its doc id; omit to clear every tomb
      if(id == null){ backend.removeItem(TRASH); return; }
      writeTrash(readTrash().filter(t => t.doc?.id !== id));
    },
  };
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
