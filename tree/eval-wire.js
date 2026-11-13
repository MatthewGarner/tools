/* The evaluation across a thread boundary. evaluate()'s Maps are keyed by node objects, which a worker's copy of the tree does not
   share with the page, so a result travels keyed by each node's place in a pre-order walk of the tree it was made from and is
   given back its keys by walking the page's own tree the same way. Pure: the worker, the inline fallback and the tests all use it.
   The numbers are the engine's own, untouched: this only renames keys.
   The load-bearing numbers (which ones the page marks as worth a slider) are a function of the tree alone and cost as much as a
   frame on a large one, so they travel with the evaluation: `hot` is the list of 'kind:line' keys the page marks. */
import {evaluate, loadBearing} from './engine.js';

export function preorder(root){
  const nodes = [];
  (function walk(n){ nodes.push(n); n.children.forEach(walk); })(root);
  return nodes;
}

/* the keys the page marks as load-bearing, from the engine's own loadBearing */
export const hotKeys = model => loadBearing(model).map(({ref}) => ref.kind + ':' + ref.line);

/* what the worker answers with: evaluate({root}) made plain */
export function encodeResults(root, results, hot){
  const at = new Map(preorder(root).map((n, i) => [n, i]));
  const pairs = (map, value = v => v) => [...map].map(([k, v]) => [at.get(k), value(v)]);
  return {
    policy: pairs(results.policy, v => at.get(v)),
    stats: pairs(results.stats),
    noOutcome: pairs(results.noOutcome),
    effectiveProbability: pairs(results.effectiveProbability),
    headToHead: results.headToHead.map(h => ({...h, aNode: at.get(h.aNode), bNode: at.get(h.bNode)})),
    flips: results.flips, warnings: results.warnings, worlds: results.worlds, hot,
  };
}

/* the page's side: the same result, keyed by `root`'s own nodes (which must be the tree, or a fresh parse of the text, that was sent) */
export function decodeResults(root, wire){
  const nodes = preorder(root);
  const pairs = (list, value = v => v) => new Map(list.map(([k, v]) => [nodes[k], value(v)]));
  return {
    policy: pairs(wire.policy, v => nodes[v]),
    stats: pairs(wire.stats),
    headToHead: wire.headToHead.map(h => ({...h, aNode: nodes[h.aNode], bNode: nodes[h.bNode]})),
    flips: wire.flips, warnings: wire.warnings,
    noOutcome: pairs(wire.noOutcome),
    effectiveProbability: pairs(wire.effectiveProbability),
    worlds: wire.worlds, hot: wire.hot,
  };
}

/* the job both the worker and the inline fallback run: payload {root} in, wire results out */
export function runEvaluation({root}, run = evaluate){
  const results = run({root});
  return encodeResults(root, results, hotKeys({root}));
}
