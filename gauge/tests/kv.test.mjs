import {test} from 'node:test';
import assert from 'node:assert/strict';
import {memoryKv, upstashKv} from '../../api/gauge/_kv.js';

test('memoryKv: HSETNX creates once, HGET/HGETALL read back', async () => {
  const kv = memoryKv();
  assert.deepEqual(await kv.pipeline([['HSETNX', 'k', 'meta', 'a']]), [1]);
  assert.deepEqual(await kv.pipeline([['HSETNX', 'k', 'meta', 'b']]), [0]);
  assert.deepEqual(await kv.pipeline([['HGET', 'k', 'meta']]), ['a']);
  await kv.pipeline([['HSET', 'k', 'f1', 'x', 'f2', 'y']]);
  const [flat] = await kv.pipeline([['HGETALL', 'k']]);
  assert.deepEqual(flat, ['meta', 'a', 'f1', 'x', 'f2', 'y']);
});

test('memoryKv: missing keys read as null / empty', async () => {
  const kv = memoryKv();
  assert.deepEqual(await kv.pipeline([['HGET', 'nope', 'f'], ['HGETALL', 'nope']]), [null, []]);
});

test('memoryKv: EXPIRE kills the key after TTL; NX respects existing TTL', async () => {
  let t = 0;
  const kv = memoryKv(() => t);
  await kv.pipeline([['HSET', 'k', 'f', 'v'], ['EXPIRE', 'k', 10]]);
  assert.deepEqual(await kv.pipeline([['EXPIRE', 'k', 9999, 'NX']]), [0]);   // TTL already set
  t = 9999;
  assert.deepEqual(await kv.pipeline([['HGET', 'k', 'f']]), ['v']);
  t = 10001;
  assert.deepEqual(await kv.pipeline([['HGET', 'k', 'f']]), [null]);
});

test('memoryKv: INCR counts and expires', async () => {
  let t = 0;
  const kv = memoryKv(() => t);
  assert.deepEqual(await kv.pipeline([['INCR', 'rl'], ['EXPIRE', 'rl', 60, 'NX']]), [1, 1]);
  assert.deepEqual(await kv.pipeline([['INCR', 'rl']]), [2]);
  t = 60001;
  assert.deepEqual(await kv.pipeline([['INCR', 'rl']]), [1]);
});

test('memoryKv: DEL removes the key', async () => {
  const kv = memoryKv();
  await kv.pipeline([['HSET', 'k', 'f', 'v']]);
  assert.deepEqual(await kv.pipeline([['DEL', 'k']]), [1]);
  assert.deepEqual(await kv.pipeline([['HGETALL', 'k'], ['DEL', 'k']]), [[], 0]);
});

test('upstashKv: pipelines to REST endpoint with bearer token', async () => {
  const calls = [];
  globalThis.fetch = async (url, opts) => {
    calls.push({url, opts});
    return {ok: true, json: async () => [{result: 1}, {result: 'v'}]};
  };
  const kv = upstashKv({UPSTASH_REDIS_REST_URL: 'https://r.upstash.io', UPSTASH_REDIS_REST_TOKEN: 'tok'});
  const out = await kv.pipeline([['HSET', 'k', 'f', 'v'], ['HGET', 'k', 'f']]);
  assert.deepEqual(out, [1, 'v']);
  assert.equal(calls[0].url, 'https://r.upstash.io/pipeline');
  assert.equal(calls[0].opts.headers.Authorization, 'Bearer tok');
  assert.deepEqual(JSON.parse(calls[0].opts.body)[1], ['HGET', 'k', 'f']);
});

test('upstashKv: command error or bad status throws', async () => {
  globalThis.fetch = async () => ({ok: true, json: async () => [{error: 'WRONGTYPE'}]});
  const kv = upstashKv({KV_REST_API_URL: 'https://r', KV_REST_API_TOKEN: 't'});
  await assert.rejects(() => kv.pipeline([['HGET', 'k', 'f']]), /WRONGTYPE/);
  globalThis.fetch = async () => ({ok: false, status: 500, json: async () => ({})});
  await assert.rejects(() => kv.pipeline([['HGET', 'k', 'f']]), /500/);
});

test('upstashKv: missing env throws at construction', () => {
  assert.throws(() => upstashKv({}));
});
