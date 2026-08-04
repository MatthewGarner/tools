/* localStorage home for the living register + link import/export. Storage-agnostic
   (pass any {getItem,setItem,removeItem} backend). A link is a one-way IMPORT — it
   mints a fresh id so a shared register never binds two browsers together. */

import {encodeHash, decodeHash} from '../assets/series.js';

const KEY = id => 'premortem:' + id, IDX = 'premortem:index', TRASH = 'premortem:trash', MAX = 8000;
const freshId = () => (globalThis.crypto?.randomUUID?.() ?? 'imp' + Date.now() + Math.random().toString(36).slice(2, 6));

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
    const doc = await decodeHash(s);
    if(!doc || typeof doc !== 'object' || Array.isArray(doc)) return null;
    if(Array.isArray(doc.entries)) doc.entries.forEach(e => { if(e && e.kind == null) e.kind = 'risk'; });   // legacy/foreign docs: no kind ⇒ risk (else invisible on every face)
    return {...doc, id: freshId()};
  }catch(e){ return null; }
}
