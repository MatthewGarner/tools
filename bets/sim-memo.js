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

/* the job the worker and the inline fallback both run: the simulation of each model, in order (the engine's own function, untouched) */
export function runSimulations({models}, simulate = simulateModel){
  return models.map(m => simulate(m));
}

/* A portfolio the size of the built-in examples simulates in about one frame, so the first picture at load is drawn from the
   simulation in the same task (one render, nothing after it moves). A larger one is drawn pending and filled in by the worker. */
export const SMALL_PORTFOLIO = 8;
export const isSmall = model => flat(model).filter(b => b.stake && b.odds && b.payoff).length <= SMALL_PORTFOLIO;

/* What a pending picture is drawn from. The last result is carried onto the portfolio as edited: a bet is the one it was if it has
   the same name (failing that, the same place in the list, which is a rename), and keeps that bet's figures; the portfolio line is
   the last one. A bet that was not in the last result, and a portfolio with no last result at all, take a coarse run of the
   engine's own function (a few hundred runs, a few milliseconds): never final, always drawn as pending, always replaced. */
export const COARSE_RUNS = 400;
const flat = model => model.groups.flatMap(g => g.bets);
export function carrySim(last, model, coarse = m => simulateModel(m, {nsim: COARSE_RUNS})){
  if(!last) return withNames(coarse(model), model);
  const before = flat(last.model), now = flat(model);
  const byName = new Map();
  for(const b of before) if(!byName.has(b.name)) byName.set(b.name, b);
  const taken = new Set(), source = new Array(now.length).fill(null);
  now.forEach((b, i) => { const hit = byName.get(b.name); if(hit && !taken.has(hit)){ source[i] = hit; taken.add(hit); } });
  now.forEach((b, i) => { if(!source[i] && before[i] && !taken.has(before[i]) && !now.some(x => x.name === before[i].name)){ source[i] = before[i]; taken.add(before[i]); } });
  let rough = null;
  const bets = new Map();
  now.forEach((b, i) => {
    const kept = source[i] && last.sim.bets.get(source[i].srcLine);
    if(kept){ bets.set(b.srcLine, kept); return; }
    rough = rough || coarse(model);
    if(rough.bets.has(b.srcLine)) bets.set(b.srcLine, rough.bets.get(b.srcLine));
  });
  return withNames({...last.sim, bets}, model);
}

export function createSimMemo(simulate = simulateModel, keep = 6){
  const kept = new Map();   // key -> result, oldest first
  const keepIt = (key, sim) => {
    kept.delete(key);
    kept.set(key, sim);
    if(kept.size > keep) kept.delete(kept.keys().next().value);
  };
  return {
    key: simulationKey,
    get(model){
      const key = simulationKey(model);
      keepIt(key, kept.get(key) || simulate(model));
      return withNames(kept.get(key), model);
    },
    /* the kept result for this model, or null: nothing is simulated */
    peek(model){
      const key = simulationKey(model);
      const sim = kept.get(key);
      if(!sim) return null;
      keepIt(key, sim);
      return withNames(sim, model);
    },
    /* a result computed elsewhere (the worker) for this model */
    put(model, sim){ keepIt(simulationKey(model), sim); },
  };
}
