import {test, beforeEach, after} from 'node:test';
import assert from 'node:assert/strict';

/* node has no location/history — minimal shim, reset per test */
const loc = {hash: '', pathname: '/tool/'};
globalThis.location = loc;
globalThis.history = {replaceState(_s, _t, url){
  if(url.startsWith('#')) loc.hash = url;
  else { loc.hash = ''; loc.pathname = url; }
}};

const {encodeHash, decodeHash, readHashState, writeHashState, mulberry32} =
  await import('../assets/series.js');

beforeEach(() => { loc.hash = ''; loc.pathname = '/tool/'; });
after(() => { delete globalThis.location; delete globalThis.history; });

/* the legacy wire format, verbatim — what every pre-2026-08 URL contains */
const legacyEnc = obj => btoa(unescape(encodeURIComponent(JSON.stringify(obj))));

test('compressed round-trip, unicode-safe', async () => {
  const obj = {v: 1, doc: 'em—dash −3 £4 “quotes” 🚀\nsecond line'};
  const enc = await encodeHash(obj);
  assert.match(enc, /^z:[A-Za-z0-9_-]+$/, 'z: prefix + base64url, no padding');
  assert.deepEqual(await decodeHash(enc), obj);
});

test('legacy hashes decode forever', async () => {
  const obj = {v: 1, doc: 'title: Wexcombe — augment?'};
  assert.deepEqual(await decodeHash(legacyEnc(obj)), obj);
  // a captured in-the-wild legacy hash (encoded {"a":1} with the shipped formula)
  assert.deepEqual(await decodeHash('eyJhIjoxfQ=='), {a: 1});
});

test('corrupt payloads → null, never a throw', async () => {
  assert.equal(await decodeHash('z:!!!not-base64url'), null);
  assert.equal(await decodeHash('z:AAAA'), null);          // valid b64url, invalid deflate
  assert.equal(await decodeHash('%%%'), null);             // corrupt legacy
  assert.equal(await decodeHash(legacyEnc({a: 1}).slice(0, 4)), null);
});

test('readHashState: empty hash → null; z: and legacy both read', async () => {
  assert.equal(await readHashState(), null);
  loc.hash = '#' + legacyEnc({k: 'old'});
  assert.deepEqual(await readHashState(), {k: 'old'});
  loc.hash = '#' + await encodeHash({k: 'new'});
  assert.deepEqual(await readHashState(), {k: 'new'});
});

test('writeHashState sets a z: hash readHashState round-trips', async () => {
  const ok = await writeHashState({doc: 'x '.repeat(500)});
  assert.equal(ok, true);
  assert.match(loc.hash, /^#z:/);
  assert.deepEqual(await readHashState(), {doc: 'x '.repeat(500)});
});

test('compression actually shrinks a real repetitive doc', async () => {
  const doc = Array.from({length: 40}, (_, i) => `Money: Exhibit ${i} -> /fermi/#state${i} // note`).join('\n');
  const enc = await encodeHash({v: 1, doc});
  assert.ok(enc.length < legacyEnc({v: 1, doc}).length * 0.5,
    `compressed ${enc.length} should be <50% of legacy ${legacyEnc({v: 1, doc}).length}`);
});

test('oversize (incompressible) → false + bare pathname, no stale hash', async () => {
  const rnd = mulberry32(42);
  const noise = Array.from({length: 12000}, () => (rnd() * 16 | 0).toString(16)).join('');
  loc.hash = '#stale';
  assert.equal(await writeHashState({noise}), false);
  assert.equal(loc.hash, '');
  assert.equal(loc.pathname, '/tool/');
});

test('write race: the later call always wins', async () => {
  const [a, b] = await Promise.all([writeHashState({n: 1}), writeHashState({n: 2})]);
  assert.equal(a, false, 'superseded write reports false');
  assert.equal(b, true);
  assert.deepEqual(await readHashState(), {n: 2});
});

test('base64url chunking survives >32KB payloads byte-for-byte', async () => {
  const rnd = mulberry32(7);
  const noise = Array.from({length: 120000}, () => (rnd() * 16 | 0).toString(16)).join('');
  const enc = await encodeHash({noise});
  assert.ok(enc.length > 32768, `need a multi-chunk payload, got ${enc.length}`);
  assert.deepEqual(await decodeHash(enc), {noise});
});
