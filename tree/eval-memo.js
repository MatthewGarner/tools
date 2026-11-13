/* The evaluation, kept. evaluate() reads the tree and nothing else, and its Maps are keyed by node objects, so a kept result can
   answer only for the nodes it was made from. A re-render parses the same text into fresh, deep-equal nodes: on a hit the fresh
   model is pointed at the kept tree (the model's other fields — title, currency, verdict — are display and stay fresh).
   Pure: evaluate is passed in so a test can count the runs. */
import {evaluate as evaluateModel} from './engine.js';

export const evaluationKey = model => JSON.stringify(model.root);   // kind, label, value, p, their raw text, line, children

export function createEvalMemo(evaluate = evaluateModel, keep = 4){
  const kept = new Map();   // key -> {root, results}, oldest first
  return {
    get(model){
      if(!model.root) return evaluate(model);
      const key = evaluationKey(model);
      let hit = kept.get(key);
      if(hit) kept.delete(key);
      else hit = {root: model.root, results: evaluate(model)};
      kept.set(key, hit);
      if(kept.size > keep) kept.delete(kept.keys().next().value);
      model.root = hit.root;
      return hit.results;
    },
  };
}
