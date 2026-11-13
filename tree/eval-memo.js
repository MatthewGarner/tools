/* The evaluation, kept. evaluate() reads the tree and nothing else, and its Maps are keyed by node objects, so a kept result can
   answer only for the nodes it was made from. A re-render parses the same text into fresh, deep-equal nodes: on a hit the fresh
   model is pointed at the kept tree (the model's other fields — title, currency, verdict — are display and stay fresh).
   Pure: evaluate is passed in so a test can count the runs. */
import {evaluate as evaluateModel} from './engine.js';

export const evaluationKey = model => JSON.stringify(model.root);   // kind, label, value, p, their raw text, line, children

export function createEvalMemo(evaluate = evaluateModel, keep = 4){
  const kept = new Map();   // key -> {root, results}, oldest first
  const keepIt = (key, hit) => {
    kept.delete(key);
    kept.set(key, hit);
    if(kept.size > keep) kept.delete(kept.keys().next().value);
  };
  return {
    key: evaluationKey,
    get(model){
      if(!model.root) return evaluate(model);
      const key = evaluationKey(model);
      const hit = kept.get(key) || {root: model.root, results: evaluate(model)};
      keepIt(key, hit);
      model.root = hit.root;
      return hit.results;
    },
    /* the kept result for this tree, or null: nothing is evaluated. On a hit the fresh model is pointed at the kept tree, as get() does. */
    peek(model){
      if(!model.root) return evaluate(model);
      const key = evaluationKey(model);
      const hit = kept.get(key);
      if(!hit) return null;
      keepIt(key, hit);
      model.root = hit.root;
      return hit.results;
    },
    /* a result computed elsewhere (the worker), keyed by this model's own nodes */
    put(model, results){ keepIt(evaluationKey(model), {root: model.root, results}); },
  };
}

/* A tree the size of the built-in examples evaluates in about one frame, so the first picture at load is drawn from the evaluation
   in the same task (one render, nothing after it moves). A larger one is drawn pending and filled in by the worker. */
export const SMALL_TREE = 16;
export function isSmall(model){
  let n = 0;
  (function walk(node){ n++; node.children.forEach(walk); })(model.root);
  return !model.root || n <= SMALL_TREE;
}

/* What a pending picture is drawn from: the last evaluation, carried onto the nodes of the tree as edited. A node is matched to
   the one it was (same kind and label under a matched parent; failing that, the same place and kind, which is a rename). A node with
   no counterpart has no entry, so nothing is drawn for it that was not computed. Pure. */
export function carryResults(lastRoot, last, root){
  const pair = new Map();   // new node -> old node
  (function match(o, n){
    pair.set(n, o);
    const used = new Set();
    const ok = n.children.map(c => {
      const hit = o.children.find(x => !used.has(x) && x.kind === c.kind && x.label === c.label);
      if(hit) used.add(hit);
      return hit || null;
    });
    n.children.forEach((c, i) => {
      let hit = ok[i];
      if(!hit){
        const same = o.children[i];
        if(same && !used.has(same) && same.kind === c.kind){ hit = same; used.add(same); }
      }
      if(hit) match(hit, c);
    });
  })(lastRoot, root);
  const back = new Map([...pair].map(([n, o]) => [o, n]));
  const lift = map => { const out = new Map(); for(const [n, o] of pair) if(map.has(o)) out.set(n, map.get(o)); return out; };
  const policy = new Map();
  for(const [n, o] of pair){
    const chosen = last.policy.get(o);
    if(chosen && back.has(chosen)) policy.set(n, back.get(chosen));
  }
  return {
    policy, stats: lift(last.stats), noOutcome: lift(last.noOutcome), effectiveProbability: lift(last.effectiveProbability),
    headToHead: last.headToHead.filter(h => back.has(h.aNode) && back.has(h.bNode))
      .map(h => ({...h, a: back.get(h.aNode).label, b: back.get(h.bNode).label, aNode: back.get(h.aNode), bNode: back.get(h.bNode)})),
    flips: last.flips, warnings: last.warnings, worlds: last.worlds, hot: last.hot,
  };
}

/* The results a pending picture is drawn from: the last evaluation carried onto `model`'s tree, and, only for a node it had no
   answer for (or for every node, with no last result), a coarse run of the engine's own function (a few hundred worlds):
   never final, always drawn as pending, always replaced. `last` is {root, results} or null. */
export const COARSE_WORLDS = 400;
export function pendingResults(last, model, coarse = m => evaluateModel(m, {sims: COARSE_WORLDS})){
  if(!last) return coarse(model);
  const carried = carryResults(last.root, last.results, model.root);
  const nodes = [];
  (function walk(n){ nodes.push(n); n.children.forEach(walk); })(model.root);
  if(nodes.every(n => carried.stats.has(n))) return carried;
  const rough = coarse(model);
  for(const name of ['stats', 'noOutcome', 'effectiveProbability', 'policy'])
    for(const [n, v] of rough[name]) if(!carried[name].has(n) && !(name === 'policy' && carried.stats.has(n))) carried[name].set(n, v);
  if(!carried.headToHead.length) carried.headToHead = rough.headToHead;
  return carried;
}
