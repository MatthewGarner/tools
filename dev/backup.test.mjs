import test from 'node:test';
import assert from 'node:assert/strict';
import {BACKUP_FORMAT, MAX_BACKUP_BYTES, MAX_VALUE_BYTES, isOwnedKey, exportArchive, parseArchive, serializeArchive,
  previewImport, recoveryArchive, applyImport, readOwned, keyLabel} from '../assets/backup-store.js';

const metadata = {origin:'https://tools.matthewgarner.me', now:'2026-10-02T12:00:00.000Z'};
const incoming = entries => ({format:BACKUP_FORMAT, version:1, origin:'https://thinking-lab-experiments.matthewg12.chatgpt.site', createdAt:'2026-10-01T12:00:00.000Z', entries});
const pair = (key, value) => ({key, value});
function memory(initial = {}, hooks = {}) {
  const values = new Map(Object.entries(initial));
  let writes = 0;
  return {
    values,
    get length() { return values.size; },
    key(index) { return [...values.keys()][index] ?? null; },
    getItem(key) { hooks.get?.(key); return values.get(key) ?? null; },
    // Count outside the optional hook: optional-call arguments are not evaluated
    // when the hook is absent, which would disable after-write race fixtures.
    setItem(key, value) { writes++; hooks.set?.(key, value, writes); values.set(key, value); hooks.afterSet?.(key, value, writes, values); },
    removeItem(key) { hooks.remove?.(key); values.delete(key); },
    get writes() { return writes; },
  };
}

test('export reads only actual suite work keys and preserves damaged raw recovery values', () => {
  const store = memory({
    'roadmap-src':'title: A draft\n', 'roadmap-snaps':'[{bad json', 'thinking-lab:reframe:v1':'broken\u0000🪴',
    'thinking-lab:predictions:v1':'{"s":1}', 'thinking-lab:predictions:v2':'{"s":2}',
    'mg:recent:v1:energy:abc-123':'{"name":"Battery"}', 'premortem:example-lantern':'corrupt',
    'mg:appearance':'dark', 'thinking-lab:appearance':'light', 'gauge-pid-abcd':'private participant',
    'gauge-draft-abcd':'session draft', token:'secret', 'premortem:token':'secret', 'thinking-lab:unknown:v1':'unknown',
  }, {get(key) { assert.ok(isOwnedKey(key), `must not read excluded key ${key}`); }});
  const archive = exportArchive(store, metadata);
  assert.equal(archive.entries.length, 7);
  assert.deepEqual(parseArchive(serializeArchive(archive)), archive);
  assert.equal(archive.entries.find(entry => entry.key === 'thinking-lab:reframe:v1').value, 'broken\u0000🪴');
  assert.equal(store.writes, 0);
});

test('exact allowlist covers current Lab and original Tools saves, rejecting namespace lookalikes', () => {
  for(const key of ['fermi-models', 'case-src', 'cycles-src', 'risk-src', 'paths-saved', 'gauge-saved', 'wardley-snaps',
    'thinking-lab:answers:v1', 'thinking-lab:family:v1', 'thinking-lab:territory:v1', 'thinking-lab:disagreement:v1',
    'premortem:01234567-89ab-cdef-0123-456789abcdef', 'premortem:d1720000000000', 'premortem:imp1720000000000abcd']) assert.ok(isOwnedKey(key), key);
  for(const key of ['__proto__', 'constructor', 'prototype', 'premortem:__proto__', 'mg:recent:v1:tools:__proto__',
    'thinking-lab:reframe:v2', 'thinking-lab:reframe:v1:token', 'gauge-pid-123', 'fermi-models-extra', 'mg:recent:v1:unknown:123']) assert.equal(isOwnedKey(key), false, key);
});

test('malformed envelope, prototype keys, duplicate items and non-string values fail before writes', () => {
  const valid = incoming([pair('roadmap-src', 'new')]);
  const invalid = [null, [], {}, {...valid, version:2}, {...valid, origin:'https://user:pass@example.test'},
    {...valid, origin:'https://tools.matthewgarner.me/path'}, {...valid, createdAt:'yesterday'}, {...valid, createdAt:'2026-02-31T12:00:00.000Z'},
    {...valid, entries:[pair('__proto__', '{}')]}, {...valid, entries:[pair('roadmap-src', null)]},
    {...valid, entries:[pair('roadmap-src', 'one'), pair('roadmap-src', 'two')]},
    {...valid, entries:[{key:'roadmap-src', value:'new', extra:'ignored?'}]},
    JSON.parse(JSON.stringify(valid).replace('"version":1', '"version":1,"__proto__":{"polluted":true}')),
  ];
  const store = memory({'roadmap-src':'old'});
  for(const value of invalid) assert.throws(() => previewImport(store, value));
  assert.throws(() => parseArchive('{incomplete'));
  assert.equal({}.polluted, undefined);
  assert.equal(store.writes, 0);
  assert.equal(store.getItem('roadmap-src'), 'old');
});

test('limits bound UTF-8 bytes and entry count before storage writes', () => {
  const store = memory();
  assert.throws(() => previewImport(store, incoming([pair('roadmap-src', '🪴'.repeat(MAX_VALUE_BYTES / 4 + 1))])), /5 MB/);
  assert.throws(() => parseArchive(' '.repeat(MAX_BACKUP_BYTES + 1)), /20 MB/);
  assert.throws(() => previewImport(store, incoming(Array.from({length:501}, (_, i) => pair(`mg:recent:v1:tools:k${i}`, 'x')))), /too many/);
  assert.equal(store.writes, 0);
});

test('default import adds absent keys, keeps conflicts and leaves identical and unrelated values alone', () => {
  const store = memory({'roadmap-src':'here', 'thinking-lab:accuracy:v1':'same', token:'untouched'});
  const archive = incoming([pair('roadmap-src', 'there'), pair('thinking-lab:accuracy:v1', 'same'), pair('thinking-lab:constraints:v1', 'new')]);
  const plan = previewImport(store, archive);
  assert.deepEqual(plan.rows.map(row => row.status), ['conflict', 'same', 'add']);
  assert.deepEqual(applyImport(store, plan), {imported:1, preserved:1, unchanged:1});
  assert.equal(store.getItem('roadmap-src'), 'here');
  assert.equal(store.getItem('thinking-lab:constraints:v1'), 'new');
  assert.equal(store.getItem('token'), 'untouched');
  assert.equal(store.writes, 1);
});

test('replacement requires recovery acknowledgement and preserves exact pre-import bytes', () => {
  const store = memory({'thinking-lab:mixer:v1':'unreadable original\u0000', token:'secret'});
  const plan = previewImport(store, incoming([pair('thinking-lab:mixer:v1', '{"new":true}')]));
  const recovery = recoveryArchive(plan, metadata);
  assert.deepEqual(recovery.entries, [pair('thinking-lab:mixer:v1', 'unreadable original\u0000')]);
  assert.throws(() => applyImport(store, plan, {replace:true}), error => error.code === 'backup-required');
  assert.equal(store.writes, 0);
  assert.deepEqual(applyImport(store, plan, {replace:true, backupDownloaded:true}), {imported:1, preserved:0, unchanged:0});
  assert.equal(store.getItem('thinking-lab:mixer:v1'), '{"new":true}');
  assert.equal(store.getItem('token'), 'secret');
  assert.throws(() => applyImport(store, plan, {replace:true, backupDownloaded:true}), /Preview/);
});

test('Premortem library conflicts are kept together rather than importing invisible unindexed registers', () => {
  const first = 'premortem:d1720000000000', second = 'premortem:d1720000000001';
  const store = memory({'premortem:index':'[{"id":"d1720000000000"}]', [first]:'{"title":"Here"}'});
  const plan = previewImport(store, incoming([pair('premortem:index', '[{"id":"d1720000000001"}]'), pair(second, '{"title":"There"}'), pair('roadmap-src', 'new')]));
  assert.equal(plan.registerConflict, true);
  assert.deepEqual(plan.rows.map(row => row.status), ['conflict', 'conflict', 'add']);
  assert.deepEqual(applyImport(store, plan), {imported:1, preserved:2, unchanged:0});
  assert.equal(store.getItem(second), null);
  assert.equal(store.getItem('premortem:index'), '[{"id":"d1720000000000"}]');
  const replace = previewImport(store, incoming([pair('premortem:index', '[{"id":"d1720000000001"}]'), pair(second, '{"title":"There"}')]));
  applyImport(store, replace, {replace:true, backupDownloaded:true});
  assert.equal(store.getItem(second), '{"title":"There"}');
  assert.equal(store.getItem(first), '{"title":"Here"}', 'replacement does not delete keys omitted from the file');
});

test('a cross-tab write between preview and apply stops even when it changed a different suite key', () => {
  const store = memory({'roadmap-src':'before'});
  const plan = previewImport(store, incoming([pair('tree-src', 'new')]));
  store.values.set('thinking-lab:teams:v1', 'changed elsewhere');
  assert.throws(() => applyImport(store, plan), error => error.code === 'stale');
  assert.equal(store.writes, 0);
  assert.equal(store.getItem('tree-src'), null);
});

test('a quota failure rolls back earlier additions and replacements byte-for-byte', () => {
  const store = memory({'roadmap-src':'original'}, {set(_key, _value, count) { if(count === 3) throw new Error('QuotaExceededError'); }});
  const plan = previewImport(store, incoming([pair('roadmap-src', 'replacement'), pair('tree-src', 'added'), pair('why-src', 'fails')]));
  assert.throws(() => applyImport(store, plan, {replace:true, backupDownloaded:true}), error => error.code === 'import-failed' && error.rollbackFailed.length === 0);
  assert.deepEqual([...store.values], [['roadmap-src', 'original']]);
});

test('rollback failure reports the exact still-changed keys and retains the recovery copy', () => {
  const store = memory({'roadmap-src':'original'}, {set(_key, _value, count) { if(count >= 2) throw new Error('QuotaExceededError'); }});
  const plan = previewImport(store, incoming([pair('roadmap-src', 'replacement'), pair('tree-src', 'fails')]));
  const recovery = recoveryArchive(plan, metadata);
  assert.throws(() => applyImport(store, plan, {replace:true, backupDownloaded:true}), error => error.code === 'import-failed' && error.rollbackFailed.join() === 'roadmap-src');
  assert.equal(store.getItem('roadmap-src'), 'replacement');
  assert.deepEqual(recovery.entries, [pair('roadmap-src', 'original')]);
});

test('a concurrent edit during import survives rollback and is reported instead of overwritten', () => {
  const store = memory({'roadmap-src':'original'}, {afterSet(_key, _value, count, values) { if(count === 1) values.set('roadmap-src', 'concurrent edit'); }});
  const plan = previewImport(store, incoming([pair('roadmap-src', 'replacement'), pair('tree-src', 'new')]));
  assert.throws(() => applyImport(store, plan, {replace:true, backupDownloaded:true}), error => error.rollbackFailed?.join() === 'roadmap-src');
  assert.equal(store.getItem('roadmap-src'), 'concurrent edit');
  assert.equal(store.getItem('tree-src'), null);
});

test('blocked storage and malformed plans stop with no import attempt', () => {
  const store = memory({'roadmap-src':'before'}, {get() { throw new Error('SecurityError'); }});
  assert.throws(() => readOwned(store), error => error.code === 'storage');
  assert.throws(() => previewImport(store, incoming([pair('roadmap-src', 'new')])), error => error.code === 'storage');
  assert.throws(() => applyImport(store, {rows:[]}), error => error.code === 'stale');
  assert.equal(store.writes, 0);
});

test('export refuses an inconsistent snapshot when another tab writes while it is being prepared', () => {
  let reads = 0;
  const store = memory({'roadmap-src':'first'}, {get(key) { if(key === 'roadmap-src' && ++reads === 2) store.values.set(key, 'second'); }});
  assert.throws(() => exportArchive(store, metadata), error => error.code === 'stale');
  assert.equal(store.writes, 0);
  assert.equal(store.values.get('roadmap-src'), 'second');
});

test('preview is immutable and does not trust a title as markup or rewrite original data', () => {
  const raw = '{"title":"<img src=x onerror=alert(1)>","__proto__":{"polluted":true}}';
  const store = memory();
  const source = incoming([pair('premortem:example-lantern', raw)]);
  const plan = previewImport(store, source);
  source.entries[0].value = 'mutated after preview';
  assert.throws(() => { plan.rows[0].key = 'token'; }, TypeError);
  assert.equal(keyLabel('premortem:example-lantern', raw), 'Premortem · <img src=x onerror=alert(1)>');
  applyImport(store, plan);
  assert.equal(store.getItem('premortem:example-lantern'), raw);
  assert.equal({}.polluted, undefined);
});
