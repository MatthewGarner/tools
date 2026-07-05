import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createRelay, pollDelay, startPoll, randomHex, sha256hex} from '../relay-client.js';

const capture = (status = 200, data = {ok: true}) => {
  const calls = [];
  const fetchFn = async (url, opts) => {
    calls.push({url, opts});
    return {ok: status < 400, status, json: async () => data};
  };
  return {calls, fetchFn};
};

test('create/submit/status/reveal hit the right routes', async () => {
  const {calls, fetchFn} = capture();
  const r = createRelay({fetchFn});
  await r.create('a'.repeat(32), 'h'.repeat(64), true);
  await r.submit('a'.repeat(32), {participantId: 'p'.repeat(16), values: [50]});
  await r.status('a'.repeat(32));
  await r.reveal('a'.repeat(32), 'k'.repeat(32));
  await r.end('a'.repeat(32), 'k'.repeat(32));
  assert.deepEqual(calls.map(c => [c.opts.method, c.url]), [
    ['POST', '/api/gauge'],
    ['PUT', '/api/gauge/' + 'a'.repeat(32) + '/response'],
    ['GET', '/api/gauge/' + 'a'.repeat(32)],
    ['POST', '/api/gauge/' + 'a'.repeat(32) + '/reveal'],
    ['POST', '/api/gauge/' + 'a'.repeat(32) + '/end'],
  ]);
  assert.deepEqual(JSON.parse(calls[0].opts.body), {id: 'a'.repeat(32), keyHash: 'h'.repeat(64), names: true});
  assert.deepEqual(JSON.parse(calls[3].opts.body), {key: 'k'.repeat(32)});
});

test('results carry ok/status/data; network failure never rejects', async () => {
  const {fetchFn} = capture(409, {error: 'revealed'});
  const r = createRelay({fetchFn});
  const out = await r.status('a'.repeat(32));
  assert.deepEqual(out, {ok: false, status: 409, data: {error: 'revealed'}});
  const dead = createRelay({fetchFn: async () => { throw new Error('offline'); }});
  assert.deepEqual(await dead.status('a'.repeat(32)), {ok: false, status: 0, data: null});
});

test('pollDelay: jitter band and exponential backoff capped at 60s', () => {
  assert.equal(pollDelay(5000, 0, () => 0), 4000);      // -20%
  assert.equal(pollDelay(5000, 0, () => 1), 6000);      // +20%
  assert.equal(pollDelay(5000, 0, () => 0.5), 5000);
  assert.equal(pollDelay(5000, 2, () => 0.5), 20000);   // 5s · 2²
  assert.equal(pollDelay(5000, 10, () => 0.5), 60000);  // cap
});

test('startPoll: ticks, backs off on error, stops when onUpdate returns false', async () => {
  const queue = [];
  const timer = (fn, ms) => { queue.push({fn, ms}); return queue.length; };
  const runNext = async () => { const t = queue.shift(); await t.fn(); return t.ms; };
  let n = 0;
  const results = [];
  const errs = [];
  const tick = async () => {
    n++;
    if(n === 2) throw new Error('blip');
    return {n};
  };
  startPoll({tick, baseMs: 5000, rand: () => 0.5, timer, clear: () => {},
    onUpdate: r => { results.push(r.n); return r.n < 4; },
    onError: f => errs.push(f)});
  assert.equal(await runNext(), 0);          // immediate first tick
  assert.equal(await runNext(), 5000);       // healthy cadence
  assert.deepEqual(errs, [1]);               // tick 2 failed
  assert.equal(await runNext(), 10000);      // backed off
  assert.equal(await runNext(), 5000);       // recovered
  assert.deepEqual(results, [1, 3, 4]);      // n=4 returned false…
  assert.equal(queue.length, 0);             // …so nothing else scheduled
});

test('startPoll: stop() prevents further scheduling', async () => {
  const queue = [];
  const timer = (fn, ms) => { queue.push(fn); return 1; };
  const p = startPoll({tick: async () => ({}), onUpdate: () => true, timer, clear: () => {}});
  p.stop();
  await queue.shift()();          // the already-scheduled immediate tick
  assert.equal(queue.length, 0);
});

test('crypto helpers', async () => {
  assert.match(randomHex(16), /^[0-9a-f]{32}$/);
  assert.notEqual(randomHex(16), randomHex(16));
  assert.equal(await sha256hex('abc'),
    'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
});
