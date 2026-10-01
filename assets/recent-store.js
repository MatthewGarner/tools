/* One key per snapshot: saving in another tab cannot overwrite the whole shelf.
   Storage is origin-local, with separate scopes for the combined preview origin. */
export const RECENT_TOOLS = {
  tools: {fermi:'Fermi',rank:'Rank',roadmap:'Roadmap',why:'Why',tree:'Tree',map:'Map',gauge:'Gauge',flow:'Flow',timeline:'Timeline',wardley:'Wardley',alarm:'Alarm',duel:'Duel',premortem:'Premortem',bets:'Bets','signal-vs-noise':'Signal vs noise',case:'Case',paths:'Paths',proxy:'Proxy'},
  energy: {cycles:'Cycles',risk:'Risk',frequency:'Frequency','merit-order':'Merit order',intraday:'Intraday'},
};
export const RECENT_LIMIT = 20;
export const HASH_LIMIT = 100000;
const PREFIX = 'mg:recent:v1:';
const idPattern = /^[a-z0-9-]{1,64}$/;
const hashPattern = /^(?:z:)?[A-Za-z0-9_+/=-]+$/;
const validTool = (scope, tool) => Object.hasOwn(RECENT_TOOLS[scope] || {}, tool);
export function validRecord(r, scope){
  return !!r && r.v === 1 && r.scope === scope && validTool(scope,r.tool) && typeof r.id === 'string' && idPattern.test(r.id)
    && typeof r.name === 'string' && r.name.trim().length > 0 && r.name.length <= 120
    && Number.isSafeInteger(r.savedAt) && r.savedAt > 0 && typeof r.hash === 'string'
    && r.hash.length <= HASH_LIMIT && hashPattern.test(r.hash);
}
export function recentRoute(scope, tool, pathname = '/'){
  if(!validTool(scope,tool)) throw new Error('Unknown tool.');
  return (scope === 'energy' && /^\/energy(?:\/|$)/.test(pathname) ? '/energy/' : '/') + tool + '/';
}
export function snapshotName(state, fallback){
  const title = state?.title || state?.q || state?.question || (typeof state?.t === 'string' && state.t.match(/^title:\s*(.+)$/im)?.[1]);
  return (typeof title === 'string' && title.trim() || fallback).slice(0,120);
}
export function recentStore(storage, scope){
  if(!Object.hasOwn(RECENT_TOOLS,scope)) throw new Error('Unknown catalogue.');
  const prefix = PREFIX + scope + ':';
  const key = id => {if(!idPattern.test(id)) throw new Error('Invalid snapshot.');return prefix+id;};
  const read = id => {
    const raw = storage.getItem(key(id));
    if(!raw) return null;
    let r;try{r=JSON.parse(raw);}catch{return null;}
    return validRecord(r,scope) && r.id === id ? r : null;
  };
  const list = () => {
    const out=[];
    for(let i=0;i<storage.length;i++){
      const k=storage.key(i);
      if(k?.startsWith(prefix) && idPattern.test(k.slice(prefix.length))){const r=read(k.slice(prefix.length));if(r)out.push(r);}
    }
    return out.sort((a,b)=>b.savedAt-a.savedAt || a.id.localeCompare(b.id));
  };
  const write = r => {if(!validRecord(r,scope))throw new Error('This snapshot cannot be saved.');storage.setItem(key(r.id),JSON.stringify(r));return r;};
  return {list,
    add({id,tool,name,hash,savedAt}){
      if(list().length >= RECENT_LIMIT) throw new Error('Recent work holds 20 snapshots. Remove one from the catalogue before saving another.');
      if(storage.getItem(key(id)) !== null) throw new Error('This snapshot already exists. Try again.');
      return write({v:1,scope,id,tool,name:name.trim(),hash,savedAt});
    },
    rename(id,name){const r=read(id);if(!r)throw new Error('This snapshot was removed in another tab.');return write({...r,name:name.trim()});},
    remove(id){storage.removeItem(key(id));},
  };
}
