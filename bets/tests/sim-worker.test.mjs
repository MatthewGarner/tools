/* The worker's answer is the page's own answer: simulating through the worker file (message in, structured clone out) is bit-identical
   to the inline call, on the built-in examples and on a large portfolio; and a model error answers instead of killing the worker. */
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {parse} from '../parse.js';
import {simulate} from '../engine.js';
import {readFileSync} from 'node:fs';
/* the built-in examples, read from the page that offers them (the tests hold no second copy) */
const EXAMPLES = [...readFileSync(new URL('../app.js', import.meta.url), 'utf8').matchAll(/\{name: '([^']+)', src:\n`([\s\S]*?)`\}/g)].map(m => ({name: m[1], src: m[2]}));
import {runSimulations} from '../sim-memo.js';
import {betsLarge} from '../../dev/feel-audit/stress-btp.mjs';

const posted = [];
globalThis.self = {postMessage: m => posted.push(structuredClone(m))};   // what the browser does between threads
await import('../sim-worker.js');
const ask = (payload, reqId = 1) => { posted.length = 0; self.onmessage({data: {payload, reqId}}); return posted[0]; };

const docs = [...EXAMPLES.map(e => [e.name, e.src]), ['large portfolio', betsLarge()]];
for(const [name, src] of docs){
  test('the worker simulates ' + name + ' bit-identically to the inline call', () => {
    const model = parse(src);
    const answer = ask({models: [parse(src)]});
    assert.equal(answer.reqId, 1);
    assert.deepStrictEqual(answer.result[0], simulate(model));
  });
}

test('two models in one request come back in order', () => {
  const [a, b] = EXAMPLES.map(e => parse(e.src));
  const answer = ask({models: [a, b]}, 7);
  assert.deepStrictEqual(answer.result, [simulate(a), simulate(b)]);
  assert.deepStrictEqual(answer.result, runSimulations({models: [a, b]}));
});

test('a model error is answered as an error, and the same worker then answers the next request', () => {
  const bad = ask({models: [{groups: null}]}, 3);
  assert.equal(bad.reqId, 3);
  assert.equal(typeof bad.error, 'string');
  assert.ok(bad.error.length > 0);
  assert.equal(bad.result, undefined);
  const model = parse(EXAMPLES[0].src);
  const good = ask({models: [model]}, 4);
  assert.deepStrictEqual(good.result[0], simulate(model));
});
