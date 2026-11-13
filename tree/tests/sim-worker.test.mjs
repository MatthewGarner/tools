/* The worker's answer is the page's own answer: evaluating through the worker file (message in, structured clone out, keys given
   back by the page's own tree) is bit-identical to the inline call, on the built-in examples and on a large tree; the pending
   picture's carried results answer for the edited tree; and a model error answers instead of killing the worker. */
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {parse} from '../parse.js';
import {evaluate} from '../engine.js';
import {readFileSync} from 'node:fs';
/* the built-in examples, read from the page that offers them (the tests hold no second copy) */
const EXAMPLES = [...readFileSync(new URL('../app.js', import.meta.url), 'utf8').matchAll(/\{name: '([^']+)', src:\n`([\s\S]*?)`\}/g)].map(m => ({name: m[1], src: m[2]}));
import {decodeResults, preorder} from '../eval-wire.js';
import {carryResults, pendingResults} from '../eval-memo.js';
import {treeLarge} from '../../dev/feel-audit/stress-btp.mjs';

const posted = [];
globalThis.self = {postMessage: m => posted.push(structuredClone(m))};   // what the browser does between threads
await import('../sim-worker.js');
const ask = (root, reqId = 1) => { posted.length = 0; self.onmessage({data: {payload: {root}, reqId}}); return posted[0]; };

/* every figure of two results over two trees of the same text, compared node for node (numbers by SameValue: -0, NaN and the last bit) */
function assertSame(a, rootA, b, rootB){
  const na = preorder(rootA), nb = preorder(rootB);
  const at = (nodes, n) => nodes.indexOf(n);
  assert.deepStrictEqual([...a.stats.keys()].map(n => at(na, n)), [...b.stats.keys()].map(n => at(nb, n)), 'same nodes, same order');
  for(const name of ['stats', 'noOutcome', 'effectiveProbability']){
    assert.equal(a[name].size, b[name].size, name);
    for(const [n, v] of a[name]) assert.deepStrictEqual(v, b[name].get(nb[at(na, n)]), name);
  }
  assert.equal(a.policy.size, b.policy.size);
  for(const [n, v] of a.policy) assert.equal(at(nb, b.policy.get(nb[at(na, n)])), at(na, v));
  assert.deepStrictEqual(a.headToHead.map(h => [h.a, h.b, h.aShare, at(na, h.aNode), at(na, h.bNode)]),
    b.headToHead.map(h => [h.a, h.b, h.aShare, at(nb, h.aNode), at(nb, h.bNode)]));
  assert.deepStrictEqual(a.flips, b.flips);
  assert.deepStrictEqual(a.warnings, b.warnings);
  assert.equal(a.worlds, b.worlds);
}

const docs = [...EXAMPLES.map(e => [e.name, e.src]), ['large tree', treeLarge()]];
for(const [name, src] of docs){
  test('the worker evaluates ' + name + ' bit-identically to the inline call', () => {
    const sent = parse(src), page = parse(src), inlineModel = parse(src);
    const answer = ask(sent.root);
    assert.equal(answer.reqId, 1);
    const decoded = decodeResults(page.root, answer.result);
    const inline = evaluate(inlineModel);
    assert.ok(inline.stats.size > 0);
    assertSame(decoded, page.root, inline, inlineModel.root);
  });
}

test('a model error is answered as an error, and the same worker then answers the next request', () => {
  const bad = ask({kind: 'decision', children: null}, 3);
  assert.equal(bad.reqId, 3);
  assert.equal(typeof bad.error, 'string');
  const model = parse(EXAMPLES[0].src);
  const good = ask(model.root, 4);
  assert.equal(good.reqId, 4);
  assert.ok(good.result.stats.length > 0);
});

test('carried results answer for an edited tree: matched nodes keep their figures, a new node has none', () => {
  const src = EXAMPLES[1].src;
  const before = parse(src), results = evaluate(before);
  const edited = parse(src.replace('1.5M to 2.5M', '1.6M to 2.5M').replace('  Do nothing: 0', '  Do nothing: 0\n  Partner: 50k'));
  const carried = carryResults(before.root, results, edited.root);
  const [build] = edited.root.children;
  assert.equal(carried.stats.get(build).mean, results.stats.get(before.root.children[0]).mean, 'an edited branch shows its last figure');
  assert.equal(carried.stats.get(edited.root).mean, results.stats.get(before.root).mean);
  const added = edited.root.children.find(c => c.label === 'Partner');
  assert.equal(carried.stats.has(added), false, 'a new node has no figure yet');
  assert.equal(carried.policy.get(edited.root).label, results.policy.get(before.root).label);
  for(const k of carried.stats.keys()) assert.ok(preorder(edited.root).includes(k), 'every key is a node of the edited tree');
});

test('pending results are complete: a new node and a tree with no last result are filled from one coarse run, never from nothing', () => {
  const src = EXAMPLES[1].src;
  const before = parse(src), results = evaluate(before);
  const edited = parse(src.replace('  Do nothing: 0', '  Do nothing: 0\n  Partner: 50k'));
  let coarse = 0;
  const rough = m => { coarse++; return evaluate(m, {sims: 400}); };
  const pending = pendingResults({root: before.root, results}, edited, rough);
  assert.equal(coarse, 1);
  for(const n of preorder(edited.root)) assert.ok(pending.stats.has(n), n.label);
  assert.equal(pending.stats.get(edited.root.children[0]).mean, results.stats.get(before.root.children[0]).mean, 'carried figures stay the last ones');
  pendingResults({root: before.root, results}, parse(src), rough);
  assert.equal(coarse, 1, 'no coarse run when every node has a last figure');
  const first = pendingResults(null, edited, rough);
  assert.equal(coarse, 2);
  for(const n of preorder(edited.root)) assert.ok(first.stats.has(n));
});
