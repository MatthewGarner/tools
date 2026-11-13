/* Pure keyed comparison shared by native renderers and saved baselines. */
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

