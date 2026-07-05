import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createSession, putResponse, getSession, reveal, openRound2, sha256hex}
  from '../../api/gauge/_lib.js';
import {memoryKv} from '../../api/gauge/_kv.js';

const ID = 'a'.repeat(32), KEY = 'b'.repeat(32);
const P1 = 'c'.repeat(16), P2 = 'd'.repeat(16);

async function rigRevealed(){
  const kv = memoryKv();
  await createSession(kv, {id: ID, keyHash: sha256hex(KEY), names: false}, 'ip');
  await putResponse(kv, ID, {participantId: P1, values: [70, [4, 8]]}, 'ip');
  await putResponse(kv, ID, {participantId: P2, values: [30, [10, 20]]}, 'ip');
  await reveal(kv, ID, {key: KEY});
  return kv;
}

test('round2: gated on reveal, key-checked, idempotent', async () => {
  const kv = memoryKv();
  await createSession(kv, {id: ID, keyHash: sha256hex(KEY), names: false}, 'ip');
  assert.equal((await openRound2(kv, ID, {key: KEY})).status, 409);   // not revealed yet
  await reveal(kv, ID, {key: KEY});
  assert.equal((await openRound2(kv, ID, {key: 'f'.repeat(32)})).status, 403);
  const r = await openRound2(kv, ID, {key: KEY});
  assert.equal(r.status, 200);
  assert.equal(r.body.round, 2);
  assert.equal((await openRound2(kv, ID, {key: KEY})).status, 200);   // idempotent
});

test('round 2 submissions land in round 2; round 1 responses untouched', async () => {
  const kv = await rigRevealed();
  await openRound2(kv, ID, {key: KEY});
  const r = await putResponse(kv, ID, {participantId: P1, values: [55, [5, 7]]}, 'ip');
  assert.equal(r.status, 200);
  const g = await getSession(kv, ID);
  assert.equal(g.body.round, 2);
  assert.equal(g.body.count, 2);                 // round 1 intact
  assert.equal(g.body.count2, 1);
  assert.deepEqual(g.body.answered2, [1, 1]);
  assert.equal(g.body.revealed, true);
  assert.equal(g.body.revealed2, false);
  assert.equal('responses2' in g.body, false);   // round-2 independence until reveal 2
  const r1vals = g.body.responses.map(e => e.values[0]).sort((a, b) => a - b);
  assert.deepEqual(r1vals, [30, 70]);
});

test('reveal on round 2 locks it and returns both rounds', async () => {
  const kv = await rigRevealed();
  await openRound2(kv, ID, {key: KEY});
  await putResponse(kv, ID, {participantId: P1, values: [55, [5, 7]]}, 'ip');
  const r = await reveal(kv, ID, {key: KEY});
  assert.equal(r.status, 200);
  assert.equal(r.body.revealed2, true);
  assert.equal(r.body.responses.length, 2);
  assert.equal(r.body.responses2.length, 1);
  const locked = await putResponse(kv, ID, {participantId: P2, values: [40, null]}, 'ip');
  assert.equal(locked.status, 409);
});

test('who: stable across rounds, present in both, never the pid', async () => {
  const kv = await rigRevealed();
  await openRound2(kv, ID, {key: KEY});
  await putResponse(kv, ID, {participantId: P1, values: [55, null]}, 'ip');
  const r = await reveal(kv, ID, {key: KEY});
  const w1 = r.body.responses.map(e => e.who);
  const w2 = r.body.responses2.map(e => e.who);
  for(const w of [...w1, ...w2]){
    assert.match(w, /^[0-9a-f]{8}$/);
    assert.ok(!P1.includes(w) && !P2.includes(w));
  }
  assert.ok(w1.includes(w2[0]), 'the resubmitter keeps the same who across rounds');
});

test('before round 2 opens, submissions still hit the revealed-lock', async () => {
  const kv = await rigRevealed();
  const r = await putResponse(kv, ID, {participantId: P1, values: [50, null]}, 'ip');
  assert.equal(r.status, 409);
});
