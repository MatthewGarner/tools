/* Shared snapshot machinery (extracted from /roadmap 2026-07-06, third-consumer
   rule): a capped localStorage store of {label, src}, a pure keyed differ, and
   the Snapshot / Compare-with… / delete wiring the workspace tools share.
   diffItems is DOM-free; wireSnapshots owns the three controls. */

export function snapStore(storageKey){
  const load = () => { try{ return JSON.parse(localStorage.getItem(storageKey) || '[]'); }catch(e){ return []; } };
  const save = list => { try{ localStorage.setItem(storageKey, JSON.stringify(list.slice(-20))); }catch(e){} };
  return {load, save};
}

const norm = s => String(s).toLowerCase().replace(/\s+/g, ' ').trim();

/* Keyed diff between two item lists. `key` names an item across snapshots;
   `state` is what counts as a move when it changes (horizon, status, position…). */
export function diffItems(oldList, curList, {key, state} = {}){
  key = key || (it => it.title);
  state = state || (() => '');
  const oldMap = new Map();
  for(const it of oldList) oldMap.set(norm(key(it)), {state: state(it), item: it});
  const curKeys = new Set(curList.map(it => norm(key(it))));
  const added = [];
  const moved = new Map();
  for(const it of curList){
    const k = norm(key(it));
    if(!oldMap.has(k)){ added.push(it); continue; }
    const from = oldMap.get(k).state, to = state(it);
    if(String(from).toLowerCase() !== String(to).toLowerCase()) moved.set(k, {from, to, item: it});
  }
  const dropped = oldList.filter(it => !curKeys.has(norm(key(it))));
  return {added, moved, dropped, any: added.length + moved.size + dropped.length > 0};
}
diffItems.norm = norm;

/* Snapshot / Compare-with… / × wiring (lifted verbatim in behaviour from
   roadmap/app.js). `els` = {snap, sel, del}; parse caches per snapshot. */
export function wireSnapshots({store, parse, getSrc, makeLabel, els, onChange, canSnap}){
  const cache = new Map();
  function refresh(){
    const cur = els.sel.value;
    els.sel.textContent = '';
    const none = document.createElement('option');
    none.value = ''; none.textContent = 'Compare with…';
    els.sel.appendChild(none);
    store.load().forEach((sn, i) => {
      const o = document.createElement('option');
      o.value = String(i);
      o.textContent = sn.label;
      els.sel.appendChild(o);
    });
    els.sel.value = [...els.sel.options].some(o => o.value === cur) ? cur : '';
    els.del.style.display = els.sel.value ? '' : 'none';
  }
  function current(){
    const idx = els.sel.value;
    if(idx === '') return null;
    const sn = store.load()[+idx];
    if(!sn) return null;
    const key = idx + '|' + sn.src.length + '|' + sn.label;
    if(!cache.has(key)) cache.set(key, parse(sn.src));
    return {label: sn.label, model: cache.get(key)};
  }
  els.snap.addEventListener('click', () => {
    if(canSnap && !canSnap()) return;
    const list = store.load();
    list.push({label: makeLabel(), src: getSrc()});
    store.save(list);
    refresh();
    els.snap.textContent = 'Saved';
    setTimeout(() => { els.snap.textContent = 'Snapshot'; }, 1200);
  });
  els.sel.addEventListener('change', () => {
    els.del.style.display = els.sel.value ? '' : 'none';
    onChange();
  });
  els.del.addEventListener('click', () => {
    const idx = els.sel.value;
    if(idx === '') return;
    const list = store.load();
    list.splice(+idx, 1);
    store.save(list);
    cache.clear();
    els.sel.value = '';
    refresh();
    onChange();
  });
  refresh();
  return {current, refresh};
}
