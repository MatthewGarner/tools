import {SOURCE_TOOLS, NAMED_TOOLS, BASELINE_TOOLS, LAB_TITLES} from './saved-work-keys.js';
import {workToken} from './work-reference.js';

export const WORK_META_PREFIX = 'mg:work-meta:v1:';
export const WORK_META_KEY = /^mg:work-meta:v1:(tools|energy|lab):[a-z0-9]+-[a-z0-9]+$/;
const object = value => value && typeof value === 'object' && !Array.isArray(value);
export const workFamily = key => key.startsWith('thinking-lab:') ? 'lab' : /^(?:cycles-src|risk-src|mg:recent:v1:energy:)/.test(key) ? 'energy' : 'tools';
export const workId = (key, localId = 'current') => key + ':' + localId;
export const itemId = item => typeof item.id === 'string' && item.id ? item.id : workToken(item);
const metaKey = record => WORK_META_PREFIX + workFamily(record.key) + ':' + workToken(record.id);

export function readWorkMeta(storage, record) {
  const raw = storage.getItem(metaKey(record));
  if (raw === null) return {};
  let value; try { value = JSON.parse(raw); } catch { throw Error('Work organisation needs recovery. Use Backup & restore before replacing it.'); }
  if (!object(value) || value.v !== 1 || value.ref !== record.id ||
      (value.name !== undefined && (typeof value.name !== 'string' || !value.name.trim() || value.name.length > 160)) ||
      (value.pinned !== undefined && typeof value.pinned !== 'boolean') ||
      (value.archived !== undefined && typeof value.archived !== 'boolean') ||
      (value.updatedAt !== undefined && (!Number.isSafeInteger(value.updatedAt) || value.updatedAt <= 0)) ||
      (value.fingerprint !== undefined && typeof value.fingerprint !== 'string'))
    throw Error('Work organisation needs recovery. Use Backup & restore before replacing it.');
  return value;
}
export function organiseWork(storage, record, change) {
  if (!record?.id || !record.key) throw Error('Choose saved work to organise.');
  const next = {...readWorkMeta(storage, record), v:1, ref:record.id};
  for (const [key, value] of Object.entries(change)) {
    if (key === 'name') {
      if (typeof value !== 'string' || !value.trim() || value.trim().length > 160) throw Error('Enter a name of up to 160 characters.');
      next.name = value.trim();
    } else if (['pinned', 'archived'].includes(key) && typeof value === 'boolean') next[key] = value;
    else throw Error('Unsupported work change.');
  }
  storage.setItem(metaKey(record), JSON.stringify(next));
}
export function retainWorkIdentity(storage,key,before,after) {
  const oldRecord={key,id:workId(key,itemId(before))},nextRecord={key,id:workId(key,itemId(after))};
  try {
    const meta=readWorkMeta(storage,oldRecord);
    if(Object.keys(meta).length&&storage.getItem(metaKey(nextRecord))===null)
      storage.setItem(metaKey(nextRecord),JSON.stringify({...meta,ref:nextRecord.id}));
  } catch { /* Keep the native save independent of optional catalogue metadata. */ }
}
export function decorateWork(storage, records) {
  const unreadable = [];
  const items = records.map(record => {
    let meta = {}; try { meta = readWorkMeta(storage, record); } catch { unreadable.push(record.id); }
    return {...record, name:meta.name || record.name, originalName:record.name,
      pinned:meta.pinned === true, archived:meta.archived === true,
      savedAt:meta.fingerprint === record.fingerprint && meta.updatedAt ? meta.updatedAt : record.savedAt};
  });
  items.sort((a,b) => Number(b.pinned) - Number(a.pinned) || (b.savedAt || 0) - (a.savedAt || 0) || a.name.localeCompare(b.name));
  return {records:items, unreadable};
}

// A save timestamp describes changed model content, not opening a catalogue,
// switching workspace, renaming its catalogue entry or rewriting identical bytes.
function entries(key, raw) {
  if (raw === null) return [];
  const record = (localId, value) => ({key, id:workId(key,localId), fingerprint:workToken(value)});
  if (SOURCE_TOOLS.some(tool => key === tool + '-src')) return [record('current',raw)];
  let value; try { value = JSON.parse(raw); } catch { return []; }
  if (NAMED_TOOLS.some(tool => key === tool + '-saved') || BASELINE_TOOLS.some(tool => key === tool + '-snaps') || key === 'fermi-models')
    return Array.isArray(value) ? value.filter(object).map(item => record(itemId(item),item)) : [];
  const match = key.match(/^thinking-lab:([^:]+):v[12]$/);
  if (match && Object.hasOwn(LAB_TITLES,match[1]) && object(value)) {
    const workspaces = match[1] === 'reframe' ? value.sessions : value.workspaces;
    return Array.isArray(workspaces) ? workspaces.filter(item => object(item) && typeof item.id === 'string').map(item => record(item.id,item)) : [record('current',value)];
  }
  return [];
}
export function saveTrackedWork(storage, key, raw, now = Date.now()) {
  // A failed metadata read must not prevent a write the browser still allows.
  let previous = null; try { previous = storage.getItem(key); } catch {}
  storage.setItem(key,raw); // Native save errors retain each tool's existing handling.
  if (previous === raw) return;
  const before = new Map(entries(key,previous).map(record => [record.id,record.fingerprint]));
  const after = entries(key,raw), retained = new Set(after.map(record => record.id));
  // Capped native lists discard old records. Keep explicit organisation for undo,
  // but do not let generated dates for absent records exhaust the backup limit.
  for (const [id, fingerprint] of before) {
    if (retained.has(id)) continue;
    try {
      const record = {key,id}, meta = readWorkMeta(storage,record);
      if (meta.fingerprint === fingerprint && Object.keys(meta).every(field => ['v','ref','fingerprint','updatedAt'].includes(field)) && storage.getItem(key) === raw)
        storage.removeItem(metaKey(record));
    } catch { /* Metadata cleanup must never prevent a native save. */ }
  }
  for (const record of after) {
    if (before.get(record.id) === record.fingerprint) continue;
    try {
      const meta = readWorkMeta(storage,record);
      storage.setItem(metaKey(record),JSON.stringify({...meta,v:1,ref:record.id,fingerprint:record.fingerprint,updatedAt:now}));
    } catch { /* A failed date write must not turn a successful model save into a failure.
                 Fingerprint matching prevents an older date being shown as current. */ }
  }
}
