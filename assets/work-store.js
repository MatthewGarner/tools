import {SOURCE_TOOLS, NAMED_TOOLS, BASELINE_TOOLS, LAB_TITLES, REGISTER_KEY} from './saved-work-keys.js';
import {RECENT_TOOLS} from './recent-store.js';
import {workToken} from './work-reference.js';

export const WORK_KINDS = {workspace:'Editable workspace', draft:'Current draft', copy:'Saved copy', baseline:'Comparison baseline'};
const object = value => value && typeof value === 'object' && !Array.isArray(value);
const label = (value, fallback) => typeof value === 'string' && value.trim() ? value.trim().slice(0, 160) : fallback;
const sourceTitle = value => typeof value === 'string' ? value.match(/^title:\s*(.+)$/im)?.[1] : '';
const multiWorkspace = new Set(['reframe','mixer','constraints','analogy','interventions','answers','objections','territory','scenes','family','questions','disagreement']);
const date = value => {
  const parsed = typeof value === 'number' ? value : typeof value === 'string' ? Date.parse(value) : NaN;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
};

// Inspect only known stores. Reading the catalogue never migrates, rewrites or
// loads an engine, and an unreadable family cannot hide other recoverable work.
export function readNativeWork(storage, {scope = 'tools', pathname = '/'} = {}) {
  const records = [], unreadable = [];
  if (!['tools', 'energy'].includes(scope)) return {records, unreadable};
  const titles = RECENT_TOOLS[scope];
  const route = tool => scope === 'energy' && pathname.startsWith('/energy') ? `/energy/${tool}/` : `/${tool}/`;
  function read(key, json = true) {
    const raw = storage.getItem(key);
    if (raw === null) return null;
    if (raw.length > 8_000_000) { unreadable.push(key); return null; }
    if (!json) return raw;
    try { return JSON.parse(raw); } catch { unreadable.push(key); return null; }
  }
  function add(record) { records.push({...record, id:record.key + ':' + (record.localId ?? workToken(record.state || record.name))}); }
  for (const tool of SOURCE_TOOLS.filter(tool => Object.hasOwn(titles, tool))) {
    const key = `${tool}-src`, source = read(key, false);
    if (typeof source === 'string' && source.trim()) add({key, tool, toolName:titles[tool], kind:'draft', name:label(sourceTitle(source), titles[tool]), href:route(tool), savedAt:null});
  }
  for (const tool of NAMED_TOOLS.filter(tool => Object.hasOwn(titles, tool))) {
    const key = `${tool}-saved`, items = read(key);
    if (items !== null && !Array.isArray(items)) { unreadable.push(key); continue; }
    for (const [i, item] of (items || []).entries()) {
      if (!object(item) || typeof item.src !== 'string') { unreadable.push(key); continue; }
      // Gauge named question sets remain editable records, unlike the other
      // tools' load-a-copy lists. Reopen through its native selection path.
      if(tool==='gauge'){
        add({key,localId:String(i),tool,toolName:titles[tool],kind:'workspace',name:label(item.name,'Untitled questions'),href:route(tool)+'?work='+workToken(item),savedAt:date(item.savedAt)});
        continue;
      }
      add({key, localId:String(i), tool, toolName:titles[tool], kind:'copy', name:label(item.name, sourceTitle(item.src) || titles[tool]),
        href:route(tool), state:{t:item.src, ...(tool === 'proxy' && typeof item.selectedTheoryId === 'string' ? {s:item.selectedTheoryId} : {})}, savedAt:date(item.savedAt)});
    }
  }
  for (const tool of BASELINE_TOOLS.filter(tool => Object.hasOwn(titles, tool))) {
    const key = `${tool}-snaps`, items = read(key);
    if (items !== null && !Array.isArray(items)) { unreadable.push(key); continue; }
    for (const [i, item] of (items || []).entries()) {
      if (!object(item) || typeof item.src !== 'string' || typeof item.label !== 'string') { unreadable.push(key); continue; }
      add({key, localId:String(i), tool, toolName:titles[tool], kind:'baseline', name:label(item.label, titles[tool]), href:route(tool) + '?baseline=' + workToken(item), savedAt:date(item.savedAt)});
    }
  }
  if (scope === 'tools') {
    const estimates = read('fermi-models');
    if (estimates !== null && !Array.isArray(estimates)) unreadable.push('fermi-models');
    for (const [i, item] of (Array.isArray(estimates) ? estimates : []).entries()) {
      if (!object(item) || typeof item.f !== 'string' || !object(item.v)) { unreadable.push('fermi-models'); continue; }
      const {name, ...state} = item;
      add({key:'fermi-models', localId:String(i), tool:'fermi', toolName:'Fermi', kind:'copy', name:label(name, item.q || item.f), href:'/fermi/', state, savedAt:date(item.savedAt)});
    }
    const registers = read('premortem:index');
    if (registers !== null && !Array.isArray(registers)) unreadable.push('premortem:index');
    for (const item of Array.isArray(registers) ? registers : []) {
      if (!object(item) || typeof item.id !== 'string' || !REGISTER_KEY.test('premortem:' + item.id)) { unreadable.push('premortem:index'); continue; }
      // Follow only the library's own IDs, never a storage prefix scan.
      const key = 'premortem:' + item.id, document = read(key);
      if (!object(document) || document.id !== item.id) continue;
      add({key, localId:item.id, tool:'premortem', toolName:'Premortem', kind:'workspace', name:label(item.title, 'Untitled register'), href:'/premortem/?work=' + encodeURIComponent(item.id), savedAt:date(item.saved)});
    }
    for (const [tool, toolName] of Object.entries(LAB_TITLES)) {
      let key = `thinking-lab:${tool}:${tool === 'predictions' ? 'v2' : 'v1'}`, value = read(key);
      if(tool === 'predictions' && value === null){key='thinking-lab:predictions:v1';value=read(key);}
      if (value === null) continue;
      if (!object(value)) { unreadable.push(key); continue; }
      const workspaces = tool === 'reframe' ? value.sessions : value.workspaces;
      if(multiWorkspace.has(tool) && !Array.isArray(workspaces)){unreadable.push(key);continue;}
      if (Array.isArray(workspaces)) {
        for (const work of workspaces) {
          if (!object(work) || typeof work.id !== 'string' || work.id.length > 200) { unreadable.push(key); continue; }
          add({key, localId:work.id, tool, toolName, kind:'workspace', name:label(work.problem, label(work.title, 'Untitled workspace')),
            href:`/lab/${tool}/?work=${encodeURIComponent(work.id)}`, savedAt:date(work.updatedAt || work.savedAt || work.createdAt)});
        }
      } else {
        add({key, tool, toolName, kind:'workspace', name:label(value.title || value.problem, toolName), href:`/lab/${tool}/`, savedAt:date(value.savedAt || value.updatedAt)});
      }
    }
  }
  return {records:records.sort((a,b) => (b.savedAt || 0) - (a.savedAt || 0) || a.name.localeCompare(b.name)), unreadable:[...new Set(unreadable)]};
}

export function filterWork(records, query = '', kind = '') {
  const normal = value => String(value).normalize('NFKD').replace(/\p{M}/gu, '').toLocaleLowerCase('en');
  const terms = normal(query).trim().split(/\s+/).filter(Boolean);
  return records.filter(record => (!kind || record.kind === kind) && terms.every(term => normal(`${record.name} ${record.toolName} ${WORK_KINDS[record.kind]}`).includes(term)));
}
