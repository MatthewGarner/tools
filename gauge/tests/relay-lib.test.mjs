import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createSession, putResponse, getSession, reveal, endSession, sha256hex,
  clientIp, TTL_SECONDS, RATE_LIMIT_PER_MIN} from '../../api/gauge/_lib.js';
import {memoryKv} from '../../api/gauge/_kv.js';

const ID = 'a'.repeat(32), KEY = 'b'.repeat(32), PID = 'c'.repeat(16);
const mk = async (names = false) => {
  const kv = memoryKv();
  await createSession(kv, {id: ID, keyHash: sha256hex(KEY), names}, '1.1.1.1');
  return kv;
};

test('create: happy path, duplicate id rejected', async () => {
  const kv = memoryKv();
  const r = await createSession(kv, {id: ID, keyHash: sha256hex(KEY), names: false}, 'ip');
  assert.equal(r.status, 200);
  const dup = await createSession(kv, {id: ID, keyHash: sha256hex(KEY), names: false}, 'ip');
  assert.equal(dup.status, 409);
});

test('create: validation', async () => {
  const kv = memoryKv();
  for(const body of [null, {}, {id: 'short', keyHash: sha256hex(KEY), names: false},
    {id: ID, keyHash: 'nope', names: false}, {id: ID, keyHash: sha256hex(KEY), names: 'yes'}]){
    assert.equal((await createSession(kv, body, 'ip')).status, 400);
  }
});

test('response: upsert then edit; status counts per question', async () => {
  const kv = await mk();
  const r1 = await putResponse(kv, ID, {participantId: PID, values: [70, [4, 8]]}, 'ip');
  assert.equal(r1.status, 200);
  await putResponse(kv, ID, {participantId: PID, values: [55, null]}, 'ip');   // edit replaces
  await putResponse(kv, ID, {participantId: 'd'.repeat(16), values: [null, [5, 9]]}, 'ip');
  const g = await getSession(kv, ID);
  assert.equal(g.status, 200);
  assert.equal(g.body.count, 2);
  assert.deepEqual(g.body.answered, [1, 1]);
  assert.equal(g.body.revealed, false);
  assert.equal('responses' in g.body, false);   // independence enforced server-side
});

test('response: validation set', async () => {
  const kv = await mk();
  const cases = [
    {participantId: 'zz', values: [50]},
    {participantId: PID, values: []},
    {participantId: PID, values: Array(21).fill(null)},
    {participantId: PID, values: [101]},
    {participantId: PID, values: [-1]},
    {participantId: PID, values: [[8, 4]]},
    {participantId: PID, values: [[1, Infinity]]},
    {participantId: PID, values: ['5']},
    {participantId: PID, values: [50], name: 'Ana'},          // anonymous session: no names
  ];
  for(const body of cases) assert.equal((await putResponse(kv, ID, body, 'ip')).status, 400, JSON.stringify(body));
});

test('named session: name required, trimmed, capped', async () => {
  const kv = await mk(true);
  assert.equal((await putResponse(kv, ID, {participantId: PID, values: [50]}, 'ip')).status, 400);
  assert.equal((await putResponse(kv, ID, {participantId: PID, values: [50], name: 'x'.repeat(41)}, 'ip')).status, 400);
  assert.equal((await putResponse(kv, ID, {participantId: PID, values: [50], name: '  Ana '}, 'ip')).status, 200);
  await reveal(kv, ID, {key: KEY});
  const g = await getSession(kv, ID);
  assert.equal(g.body.responses[0].name, 'Ana');
});

test('reveal: wrong key 403, right key returns the full set, responses lock', async () => {
  const kv = await mk();
  await putResponse(kv, ID, {participantId: PID, values: [70, [4, 8]]}, 'ip');
  assert.equal((await reveal(kv, ID, {key: 'f'.repeat(32)})).status, 403);
  const r = await reveal(kv, ID, {key: KEY});
  assert.equal(r.status, 200);
  assert.equal(r.body.revealed, true);
  assert.equal(r.body.responses.length, 1);
  assert.deepEqual(r.body.responses[0].values, [70, [4, 8]]);
  assert.match(r.body.responses[0].who, /^[0-9a-f]{8}$/);   // anonymous cross-round id, never the pid
  const late = await putResponse(kv, ID, {participantId: PID, values: [10, null]}, 'ip');
  assert.equal(late.status, 409);
  const g = await getSession(kv, ID);
  assert.deepEqual(g.body.responses[0].values, [70, [4, 8]]);   // GET now includes values
});

test('unknown or expired session is 404', async () => {
  const kv = memoryKv();
  assert.equal((await getSession(kv, ID)).status, 404);
  assert.equal((await putResponse(kv, ID, {participantId: PID, values: [50]}, 'ip')).status, 404);
  assert.equal((await reveal(kv, ID, {key: KEY})).status, 404);
});

test('TTL: session dies after 24h', async () => {
  let t = 0;
  const kv = memoryKv(() => t);
  await createSession(kv, {id: ID, keyHash: sha256hex(KEY), names: false}, 'ip');
  t = TTL_SECONDS * 1000 + 1;
  assert.equal((await getSession(kv, ID)).status, 404);
});

test('end session: facilitator key required; everything gone afterwards', async () => {
  const kv = await mk();
  await putResponse(kv, ID, {participantId: PID, values: [70, [4, 8]]}, 'ip');
  await reveal(kv, ID, {key: KEY});
  assert.equal((await endSession(kv, ID, {key: 'f'.repeat(32)})).status, 403);
  assert.equal((await endSession(kv, ID, {key: KEY})).status, 200);
  assert.equal((await getSession(kv, ID)).status, 404);
  assert.equal((await putResponse(kv, ID, {participantId: PID, values: [50, null]}, 'ip')).status, 404);
  assert.equal((await endSession(kv, ID, {key: KEY})).status, 404);   // idempotent-ish: already gone
});

test('end session: validation and unknown id', async () => {
  const kv = memoryKv();
  assert.equal((await endSession(kv, ID, {})).status, 400);
  assert.equal((await endSession(kv, ID, {key: KEY})).status, 404);
});

test('rate limit: writes over the per-minute cap get 429', async () => {
  const kv = await mk();
  let last = null;
  for(let i = 0; i < RATE_LIMIT_PER_MIN + 2; i++){
    last = await putResponse(kv, ID, {participantId: PID, values: [50, null]}, '9.9.9.9');
  }
  assert.equal(last.status, 429);
  const ok = await putResponse(kv, ID, {participantId: PID, values: [50, null]}, '8.8.8.8');
  assert.equal(ok.status, 200);   // per-IP, not global
});

test('clientIp: trusts Vercel x-real-ip over spoofable x-forwarded-for', () => {
  // an attacker forging XFF cannot move their rate-limit bucket: x-real-ip wins
  assert.equal(clientIp({headers: {'x-real-ip': '203.0.113.7',
    'x-forwarded-for': '1.1.1.1, 9.9.9.9'}}), '203.0.113.7');
  // off-Vercel (no x-real-ip): fall back to the leftmost XFF entry
  assert.equal(clientIp({headers: {'x-forwarded-for': '198.51.100.4, 10.0.0.1'}}), '198.51.100.4');
  // nothing set (local/dev): a fixed bucket, never empty
  assert.equal(clientIp({headers: {}}), 'local');
  assert.equal(clientIp({}), 'local');
});

test('response write re-arms the TTL — self-heals a session whose create-time EXPIRE was lost', async () => {
  const kv = memoryKv();
  /* simulate createSession dying between its two pipelines: meta exists, no expiry */
  await kv.pipeline([['HSETNX', 'gauge:' + ID, 'meta',
    JSON.stringify({keyHash: sha256hex(KEY), names: false, created: 1})]]);
  await kv.pipeline([['HSET', 'gauge:' + ID, 'revealed', '0']]);
  assert.equal(kv._store.get('gauge:' + ID).expiresAt, null);
  const r = await putResponse(kv, ID, {participantId: PID, values: [50]}, 'ip');
  assert.equal(r.status, 200);
  assert.notEqual(kv._store.get('gauge:' + ID).expiresAt, null);
});
