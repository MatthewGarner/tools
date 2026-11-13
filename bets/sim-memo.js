/* The simulation, kept. A view switch, a theme change, zoom, a snapshot pick, or an edit to a title, a name or a kill's text
   re-renders from the kept result; only a change to what simulate() reads runs it again. Pure: the simulate function is passed in
   so a test can count the runs. */
import {simulate as simulateModel, withNames} from './engine.js';

/* Exactly what simulate() reads or reports: per bet in source order, its line, its three ranges, and whether it has a kill
   criterion (the NO KILL audit). Names, titles, unit, kill text and view state are not in it. */
export function simulationKey(model){
  const parts = [];
  for(const g of model.groups) for(const b of g.bets)
    parts.push([b.srcLine, b.stake, b.odds, b.payoff, b.kill ? 1 : 0]);
  return JSON.stringify(parts);
}

export function createSimMemo(simulate = simulateModel, keep = 6){
  const kept = new Map();   // key -> result, oldest first
  return {
    get(model){
      const key = simulationKey(model);
      let sim = kept.get(key);
      if(sim){ kept.delete(key); }
      else sim = simulate(model);
      kept.set(key, sim);
      if(kept.size > keep) kept.delete(kept.keys().next().value);
      return withNames(sim, model);
    },
  };
}
