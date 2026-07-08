/* Pure: archetypes, presets, front-door lever→generator writers, versioned
   URL codec. State's source of truth is the 4 generators (archetype order) +
   demand; the dials write into them. `carbon` is carried for later tools (E67),
   unused in E61's UI. No DOM here (node-testable). */
export const ARCHETYPE_ORDER = ['Renewables', 'Nuclear', 'CCGT', 'Peaker'];

export function defaultGenerators(){
  return [
    {name: 'Renewables', capacity: 15, cost: 0,   carbon: 0,   mustRun: false},
    {name: 'Nuclear',    capacity: 6,  cost: 8,   carbon: 0,   mustRun: false},
    {name: 'CCGT',       capacity: 25, cost: 60,  carbon: 360, mustRun: false},
    {name: 'Peaker',     capacity: 10, cost: 150, carbon: 490, mustRun: false},
  ];
}
const find = (gens, name) => gens.find(g => g.name === name);

export function setRenewShare(gens, mw){ find(gens, 'Renewables').capacity = mw; }
export function setGasPrice(gens, price){ find(gens, 'CCGT').cost = price; find(gens, 'Peaker').cost = 2.5 * price; }
export function setMustRun(gens, on, depth){
  const r = find(gens, 'Renewables'); r.mustRun = on; r.cost = on ? -depth : 0;
}

export const PRESETS = {
  typical:   {label: 'Typical day',       demand: 40, renew: 15, gas: 60,  mustRun: false, depth: 30},
  windy:     {label: 'Windy day',         demand: 40, renew: 30, gas: 60,  mustRun: false, depth: 30},
  coldStill: {label: 'Cold still evening', demand: 42, renew: 2,  gas: 60,  mustRun: false, depth: 30},
  gasSpike:  {label: 'Gas spike',         demand: 40, renew: 15, gas: 120, mustRun: false, depth: 30},
  negative:  {label: 'Negative prices',   demand: 12, renew: 25, gas: 60,  mustRun: true,  depth: 30},
};

export function generatorsFromPreset(p){
  const gens = defaultGenerators();
  setRenewShare(gens, p.renew);
  setGasPrice(gens, p.gas);
  setMustRun(gens, p.mustRun, p.depth);
  return gens;
}

/* Versioned URL schema {v:1, p:{name→[cap,cost,mustRun]}, d}. */
export function encodeState(gens, demand){
  const p = {};
  for(const g of gens) p[g.name] = [g.capacity, g.cost, g.mustRun ? 1 : 0];
  return {v: 1, p, d: demand};
}
export function decodeState(obj){
  if(!obj || obj.v !== 1 || !obj.p) return null;   // malformed / old version → caller falls back to Typical day
  const gens = defaultGenerators();
  for(const g of gens){
    const row = obj.p[g.name];
    if(Array.isArray(row)){ g.capacity = row[0]; g.cost = row[1]; g.mustRun = !!row[2]; }
  }
  return {generators: gens, demand: obj.d};
}
