import {saveTrackedWork} from './work-metadata.js';
/* Shared snapshot machinery (extracted from /roadmap 2026-07-06, third-consumer
   rule): a capped localStorage store of {label, src}, a pure keyed differ, and
   the Snapshot / Compare-with… / delete wiring the workspace tools share.
   diffItems is DOM-free; wireSnapshots owns the three controls. */

import {workToken} from './work-reference.js';

export function snapStore(storageKey){
  const load = () => { try{ return JSON.parse(localStorage.getItem(storageKey) || '[]'); }catch(e){ return []; } };
  const save = list => { try{ saveTrackedWork(localStorage,storageKey, JSON.stringify(list.slice(-20))); }catch(e){} };
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
  els.snap.textContent='Save baseline';
  els.snap.title='Keep the current model for comparison with later edits';
  els.sel.setAttribute('aria-label','Compare with baseline');
  els.del.textContent='Delete baseline';
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
    setTimeout(() => { els.snap.textContent = 'Save baseline'; }, 1200);
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
  const url=new URL(location.href), token=url.searchParams.get('baseline');
  if(token){
    const index=store.load().findIndex(item=>workToken(item)===token);
    if(index>=0){
      els.sel.value=String(index);els.del.style.display='';
      for(let parent=els.sel.parentElement;parent;parent=parent.parentElement)if(parent.tagName==='DETAILS')parent.open=true;
    }
    else { const message=document.createElement('span');message.setAttribute('role','status');message.textContent='That comparison baseline is no longer saved here.';els.sel.after(message); }
    url.searchParams.delete('baseline');window.history.replaceState(window.history.state,'',url.pathname+url.search+url.hash);
  }
  return {current, refresh};
}
