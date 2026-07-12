/* localStorage home for the living register + link import/export. Storage-agnostic
   (pass any {getItem,setItem,removeItem} backend). A link is a one-way IMPORT — it
   mints a fresh id so a shared register never binds two browsers together. */

const KEY = id => 'premortem:' + id, IDX = 'premortem:index', MAX = 8000;
/* same unicode-safe base64 as assets/series.js writeHashState (its helpers aren't exported) */
const enc = obj => btoa(unescape(encodeURIComponent(JSON.stringify(obj))));
const dec = str => JSON.parse(decodeURIComponent(escape(atob(str))));
const freshId = () => (globalThis.crypto?.randomUUID?.() ?? 'imp' + Date.now() + Math.random().toString(36).slice(2, 6));

export function makeStore(backend = localStorage){
  const readIdx = () => { try{ return JSON.parse(backend.getItem(IDX)) || []; }catch(e){ return []; } };
  const writeIdx = idx => backend.setItem(IDX, JSON.stringify(idx));
  return {
    save(doc){
      backend.setItem(KEY(doc.id), JSON.stringify(doc));
      const idx = readIdx().filter(m => m.id !== doc.id);
      const es = doc.entries || [];
      idx.push({id: doc.id, title: doc.title || '', entries: es.length,
        risks: es.filter(e => e.kind === 'risk').length, saved: Date.now()});
      writeIdx(idx);
    },
    load(id){ try{ return JSON.parse(backend.getItem(KEY(id))); }catch(e){ return null; } },
    list(){ return readIdx(); },
    remove(id){ backend.removeItem(KEY(id)); writeIdx(readIdx().filter(m => m.id !== id)); },
  };
}

export function toLink(doc){
  const s = enc(doc);
  return s.length > MAX ? null : '#' + s;
}

export function fromLink(hash){
  try{
    const s = String(hash).replace(/^#/, '');
    if(!s) return null;
    const doc = dec(s);
    if(!doc || typeof doc !== 'object' || Array.isArray(doc)) return null;
    if(Array.isArray(doc.entries)) doc.entries.forEach(e => { if(e && e.kind == null) e.kind = 'risk'; });   // legacy/foreign docs: no kind ⇒ risk (else invisible on every face)
    return {...doc, id: freshId()};
  }catch(e){ return null; }
}
