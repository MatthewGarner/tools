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
  const trashed = () => { try{ return JSON.parse(backend.getItem(TRASH)); }catch(e){ return null; } };
  return {
    save, load, list, remove, trashed,
    trash(id){
      const doc = load(id); if(!doc) return null;
      const tomb = {doc, deleted: Date.now()};
      backend.setItem(TRASH, JSON.stringify(tomb)); remove(id); return tomb;
    },
    restoreTrash(){
      const tomb = trashed(); if(!tomb?.doc) return null;
      save(tomb.doc); backend.removeItem(TRASH); return tomb.doc;
    },
    purgeTrash(){ backend.removeItem(TRASH); },
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
