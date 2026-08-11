import {test} from 'node:test';
import assert from 'node:assert/strict';
import {NO_STORE, sendJson} from '../../api/gauge/_response.js';

process.env.GAUGE_KV = 'memory';

function responseDouble(){
  const headers = new Map();
  return {
    headers,
    response: {
      setHeader(name, value){ headers.set(name, value); },
      status(code){ this.code = code; return this; },
      json(body){ this.body = body; return this; },
    },
  };
}

test('Gauge API responses are explicitly non-cacheable', () => {
  const {headers, response: res} = responseDouble();
  assert.equal(sendJson(res, 200, {ok: true}), res);
  assert.equal(headers.get('Cache-Control'), NO_STORE);
  assert.equal(res.code, 200);
  assert.deepEqual(res.body, {ok: true});
});

test('successful Gauge endpoint responses pass through sendJson', async () => {
  const {default: handler} = await import('../../api/gauge/index.js');
  const {headers, response: res} = responseDouble();
  const returned = await handler({
    method: 'POST',
    headers: {'x-real-ip': 'response-header-test'},
    body: {id: '0123456789abcdef0123456789abcdef', keyHash: 'a'.repeat(64), names: false},
  }, res);
  assert.equal(returned, res);
  assert.equal(res.code, 200);
  assert.deepEqual(res.body, {ok: true});
  assert.equal(headers.get('Cache-Control'), NO_STORE);
});

const handlers = [
  '../../api/gauge/index.js',
  '../../api/gauge/[id]/index.js',
  '../../api/gauge/[id]/response.js',
  '../../api/gauge/[id]/reveal.js',
  '../../api/gauge/[id]/round2.js',
  '../../api/gauge/[id]/end.js',
];

test('every Gauge endpoint applies no-store even to rejected requests', async () => {
  for(const path of handlers){
    const {default: handler} = await import(path);
    const {headers, response: res} = responseDouble();
    await handler({method: 'HEAD', headers: {}}, res);
    assert.equal(headers.get('Cache-Control'), NO_STORE, path);
  }
});
