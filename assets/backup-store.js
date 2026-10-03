/* Browser-origin backup transport. Values stay opaque: a damaged workspace is
   still worth recovering. This is not a validator or repairer for each model. */
export const BACKUP_FORMAT = 'matthew-garner-saved-work';
export const BACKUP_VERSION = 1;
export const MAX_BACKUP_BYTES = 20 * 1024 * 1024;
export const MAX_VALUE_BYTES = 5 * 1024 * 1024;
export const MAX_BACKUP_ITEMS = 500;
const encoder = new TextEncoder();
import {SOURCE_TOOLS as sources, NAMED_TOOLS as saved, BASELINE_TOOLS as snapshots, LAB_TITLES as lab} from './saved-work-keys.js';
import {WORK_META_KEY} from './work-metadata.js';
import {templateKeyInfo} from './template-store.js';
import {RECENT_TOOLS} from './recent-store.js';
const templateInfo=key=>{const info=templateKeyInfo(key);return info&&Object.hasOwn(info.scope==='lab'?lab:RECENT_TOOLS[info.scope]||{},info.tool)?info:null;};
const exact = new Set([
  ...sources.map(tool => `${tool}-src`), ...saved.map(tool => `${tool}-saved`),
  ...snapshots.map(tool => `${tool}-snaps`), 'fermi-models', 'premortem:index', 'premortem:trash',
  ...Object.keys(lab).map(tool => `thinking-lab:${tool}:v1`), 'thinking-lab:predictions:v2',
]);
// Only generated register IDs, and the shipped example ID. Never treat a broad
// localStorage prefix as permission to copy unrelated data or session identity.
const registerKey = /^premortem:(?:[a-f\d]{8}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{12}|d\d{10,16}|imp\d{10,16}[a-z\d]{4}|example-lantern)$/i;
const recentKey = /^mg:recent:v1:(tools|energy):[a-z\d-]{1,64}$/;
const plans = new WeakMap();

export class BackupError extends Error {
  constructor(message, code = 'invalid', details = {}) { super(message); this.name = 'BackupError'; this.code = code; Object.assign(this, details); }
}
export const isOwnedKey = key => typeof key === 'string' && (exact.has(key) || registerKey.test(key) || recentKey.test(key) || WORK_META_KEY.test(key) || !!templateInfo(key));
const bytes = text => encoder.encode(text).length;
const plain = object => object !== null && typeof object === 'object' && !Array.isArray(object) &&
  [Object.prototype, null].includes(Object.getPrototypeOf(object));
function fields(object, names) {
  return plain(object) && Object.keys(object).length === names.length && names.every(name => Object.hasOwn(object, name));
}
function validOrigin(origin) {
  if(typeof origin !== 'string' || origin.length > 512) return false;
  try { const url = new URL(origin); return ['https:', 'http:'].includes(url.protocol) && url.origin === origin; } catch { return false; }
}

export function validateArchive(value) {
  if(!fields(value, ['format', 'version', 'origin', 'createdAt', 'entries']) || value.format !== BACKUP_FORMAT || value.version !== BACKUP_VERSION)
    throw new BackupError('Choose a saved-work backup in the supported version 1 format.');
  if(!validOrigin(value.origin) || typeof value.createdAt !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value.createdAt) || !Number.isFinite(Date.parse(value.createdAt)) || new Date(value.createdAt).toISOString() !== value.createdAt)
    throw new BackupError('The backup has invalid source or date information.');
  if(!Array.isArray(value.entries) || value.entries.length > MAX_BACKUP_ITEMS) throw new BackupError('The backup contains too many items.');
  const seen = new Set();
  const entries = value.entries.map(entry => {
    if(!fields(entry, ['key', 'value']) || !isOwnedKey(entry.key) || typeof entry.value !== 'string')
      throw new BackupError('The backup includes an unsupported key or value. Nothing has been imported.');
    if(seen.has(entry.key)) throw new BackupError('The backup contains duplicate saved-work keys.');
    if(bytes(entry.value) > MAX_VALUE_BYTES) throw new BackupError('A saved item exceeds the 5 MB backup limit.');
    seen.add(entry.key);
    return Object.freeze({key:entry.key, value:entry.value});
  });
  const archive = {format:BACKUP_FORMAT, version:BACKUP_VERSION, origin:value.origin, createdAt:value.createdAt, entries};
  if(bytes(JSON.stringify(archive)) > MAX_BACKUP_BYTES) throw new BackupError('The backup exceeds the 20 MB limit.');
  return Object.freeze({...archive, entries:Object.freeze(entries)});
}
export function parseArchive(text) {
  if(typeof text !== 'string' || bytes(text) > MAX_BACKUP_BYTES) throw new BackupError('Choose a JSON backup smaller than 20 MB.');
  let value;
  try { value = JSON.parse(text); } catch { throw new BackupError('This file is not valid JSON. Nothing has been imported.'); }
  return validateArchive(value);
}

// Energy remains a separate live storage origin. Importing its drafts on Tools
// would report success, then redirect the user away from the restored values.
// Partition mixed recovery files by the tools available at the destination;
// the original file stays intact and can be used again at the other address.
export function partitionArchive(input, hostname) {
  const archive = validateArchive(input);
  const families = {
    'tools.matthewgarner.me':['tools','lab'],
    'energy.matthewgarner.me':['energy'],
    'thinking-lab-experiments.matthewg12.chatgpt.site':['lab'],
  }[hostname];
  if(!families) return {archive, elsewhere:[]}; // Combined local/deployment previews.
  const entries=[], destinations=new Map();
  for(const entry of archive.entries) {
    const family=templateInfo(entry.key)?.scope || entry.key.match(WORK_META_KEY)?.[1] || (entry.key.startsWith('thinking-lab:') ? 'lab'
      : /^(?:cycles-src|risk-src|mg:recent:v1:energy:)/.test(entry.key) ? 'energy' : 'tools');
    if(families.includes(family)) { entries.push(entry); continue; }
    const label=family==='energy'?'Energy':'Tools Lab';
    const url=family==='energy'?'https://energy.matthewgarner.me/backup/':'https://tools.matthewgarner.me/backup/';
    const destination=destinations.get(url)||{label,url,count:0};
    destination.count++;destinations.set(url,destination);
  }
  return {archive:validateArchive({...archive,entries}),elsewhere:[...destinations.values()]};
}

export function readOwned(storage) {
  try {
    const keys = new Set();
    for(let index = 0; index < storage.length; index++) { const key = storage.key(index); if(isOwnedKey(key)) keys.add(key); }
    if(keys.size > MAX_BACKUP_ITEMS) throw new BackupError('There are too many saved items for one backup.');
    return [...keys].sort().flatMap(key => { const value = storage.getItem(key); return value === null ? [] : [{key, value}]; });
  } catch(error) {
    if(error instanceof BackupError) throw error;
    throw new BackupError('This browser is blocking access to saved work. No changes were made.', 'storage');
  }
}
function makeArchive(entries, {origin, now = new Date()} = {}) {
  return validateArchive({format:BACKUP_FORMAT, version:BACKUP_VERSION, origin, createdAt:new Date(now).toISOString(), entries});
}
export function exportArchive(storage, metadata) {
  const entries = readOwned(storage), archive = makeArchive(entries, metadata);
  if(!same(entries, readOwned(storage))) throw new BackupError('Saved work changed while preparing the backup. Close other tool tabs and download again.', 'stale');
  return archive;
}
export function serializeArchive(archive) {
  const text = JSON.stringify(validateArchive(archive), null, 2);
  if(bytes(text) > MAX_BACKUP_BYTES) throw new BackupError('The backup exceeds the 20 MB limit.');
  return text;
}

export function keyLabel(key, raw) {
  const template=templateInfo(key);
  if(template)return `${template.scope==='lab'?lab[template.tool]:RECENT_TOOLS[template.scope][template.tool]} · ${template.isDefault?'default template':'personal template'}`;
  if(WORK_META_KEY.test(key))return 'Your work · name, pin, archive and saved-change date';
  if(key.startsWith('thinking-lab:')) { const [,route,version] = key.split(':'); return `${lab[route]}${route === 'predictions' && version === 'v1' ? ' (earlier version)' : ''}`; }
  if(key === 'premortem:index') return 'Premortem · register list';
  if(key === 'premortem:trash') return 'Premortem · recovery bin';
  if(key.startsWith('premortem:')) {
    let title; try { const value = JSON.parse(raw); title = plain(value) && typeof value.title === 'string' ? value.title.trim().slice(0, 120) : ''; } catch {}
    return `Premortem · ${title || key.slice(10)}`;
  }
  if(recentKey.test(key)) {
    let name; try { const value = JSON.parse(raw); name = plain(value) && typeof value.name === 'string' ? value.name.trim().slice(0, 120) : ''; } catch {}
    return `${key.includes(':energy:') ? 'Energy' : 'Product'} snapshot · ${name || key.split(':').at(-1)}`;
  }
  const [tool, kind] = key.split('-');
  return `${tool[0].toUpperCase() + tool.slice(1)} · ${{src:'current draft', saved:'saved versions', snaps:'comparison snapshots', models:'saved models'}[kind]}`;
}
const same = (first, second) => first.length === second.length && first.every((entry, index) => entry.key === second[index].key && entry.value === second[index].value);
const premortem = entries => entries.filter(entry => entry.key.startsWith('premortem:')).sort((a, b) => a.key.localeCompare(b.key));

export function previewImport(storage, input) {
  const archive = validateArchive(input);
  const before = readOwned(storage);
  const current = new Map(before.map(entry => [entry.key, entry.value]));
  const incomingRegisters = premortem(archive.entries), existingRegisters = premortem(before);
  const registerConflict = incomingRegisters.length > 0 && existingRegisters.length > 0 && !same(incomingRegisters, existingRegisters);
  const statuses = new Map(archive.entries.map(entry => {
    const previous = current.get(entry.key);
    const status = registerConflict && entry.key.startsWith('premortem:') ? 'conflict' : previous === entry.value ? 'same' : previous === undefined ? 'add' : 'conflict';
    return [entry.key,status];
  }));
  const conflicts = archive.entries.filter(entry => statuses.get(entry.key) === 'conflict' && !WORK_META_KEY.test(entry.key));
  const rows = archive.entries.map(entry => {
    let status = statuses.get(entry.key);
    if (WORK_META_KEY.test(entry.key) && status === 'add') {
      let meta; try { meta = JSON.parse(entry.value); } catch { /* Opaque damaged values remain recoverable. */ }
      // Keeping a native store must also keep its catalogue identity: importing
      // an absent metadata key could otherwise rename or archive different work.
      if (plain(meta) && typeof meta.ref === 'string' && conflicts.some(owner => meta.ref.startsWith(owner.key + ':')))
        status = 'conflict';
    }
    return Object.freeze({key:entry.key, name:keyLabel(entry.key, entry.value), status, bytes:bytes(entry.value)});
  });
  const plan = Object.freeze({origin:archive.origin, createdAt:archive.createdAt, rows:Object.freeze(rows), registerConflict});
  plans.set(plan, {archive, before, current});
  return plan;
}
function stateFor(plan) {
  const state = plans.get(plan);
  if(!state) throw new BackupError('Preview this backup again before importing.', 'stale');
  return state;
}
export function recoveryArchive(plan, metadata) { return makeArchive(stateFor(plan).before, metadata); }
export function assertUnchanged(storage, plan) {
  if(!same(stateFor(plan).before, readOwned(storage))) throw new BackupError('Saved work changed after this preview. Preview the file again before importing.', 'stale');
}

export function applyImport(storage, plan, {replace = false, backupDownloaded = false} = {}) {
  const {archive, before, current} = stateFor(plan);
  assertUnchanged(storage, plan);
  if(replace && plan.rows.some(row => row.status === 'conflict') && !backupDownloaded)
    throw new BackupError('Save the pre-import recovery backup before replacing existing work.', 'backup-required');
  const writes = archive.entries.filter((entry, index) => plan.rows[index].status === 'add' || (replace && plan.rows[index].status === 'conflict' && current.get(entry.key) !== entry.value));
  const expected = new Map(before.map(entry => [entry.key, entry.value]));
  const written = [];
  const expectedEntries = () => [...expected].sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([key, value]) => ({key, value}));
  try {
    for(const entry of writes) {
      if(!same(expectedEntries(), readOwned(storage))) throw new BackupError('Another tab changed saved work during import.', 'stale');
      storage.setItem(entry.key, entry.value);
      written.push(entry);
      expected.set(entry.key, entry.value);
      if(storage.getItem(entry.key) !== entry.value) throw new Error('Storage did not retain the write.');
    }
    if(!same(expectedEntries(), readOwned(storage))) throw new BackupError('Another tab changed saved work during import.', 'stale');
  } catch(error) {
    const rollbackFailed = [];
    for(const entry of written.reverse()) {
      try {
        // Do not destroy a concurrent edit while undoing our own writes.
        if(storage.getItem(entry.key) !== entry.value) { rollbackFailed.push(entry.key); continue; }
        if(current.has(entry.key)) storage.setItem(entry.key, current.get(entry.key)); else storage.removeItem(entry.key);
        if(storage.getItem(entry.key) !== (current.get(entry.key) ?? null)) rollbackFailed.push(entry.key);
      } catch { rollbackFailed.push(entry.key); }
    }
    plans.delete(plan);
    throw new BackupError(rollbackFailed.length
      ? 'Import stopped, and some changes could not be undone. Keep both backup files and review the items listed below.'
      : 'Import stopped. Its completed writes were undone; other tabs may have changed saved work. Check storage space and preview the file again.',
    'import-failed', {rollbackFailed, cause:error});
  }
  plans.delete(plan);
  return {imported:writes.length, preserved:plan.rows.filter(row => row.status === 'conflict' && !replace).length, unchanged:plan.rows.filter(row => row.status === 'same').length};
}
