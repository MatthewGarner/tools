/* Pure uniform-price (pay-as-clear) merit-order dispatch. Generators
   {name, capacity(GW), cost(£/MWh, may be <0), carbon, mustRun} in archetype
   order. Marginal unit = the last unit NEEDED. Negative prices fall out when
   demand crosses a negative-bid (must-run) block. mustRun is metadata to the
   dispatch mechanics — it does not change filling (a must-run block wider than
   demand is partially stranded like any plant; the render/copy reads that
   distinctly). Identity is by `name` throughout. */
/* A demand within BOUNDARY_EPS GW (1 kW) of a stack step — including the zero step and the top of
   the stack — IS on the step, so float noise (4e-15 GW either side of 29.64) cannot flip the marginal
   plant or the price. Nothing more than BOUNDARY_EPS from every step is touched. */
export const BOUNDARY_EPS = 1e-9;

export function dispatch(generators, demand){
  let d = Math.max(0, demand);                                    // clamp ≥ 0
  const sorted = [...generators].sort((a, b) => a.cost - b.cost); // stable → ties keep input (archetype) order
  const totalCapacity = sorted.reduce((s, g) => s + g.capacity, 0);
  if(d <= BOUNDARY_EPS) d = 0;
  else { let edge = 0; for(const g of sorted){ edge += g.capacity; if(Math.abs(d - edge) <= BOUNDARY_EPS){ d = edge; break; } } }
  const perPlant = {};
  let running = 0, marginalName = null, clearingPrice = 0;
  for(const g of sorted){
    const before = running;
    const dispatchedMW = Math.max(0, Math.min(g.capacity, d - before));
    if(marginalName === null && before < d && d <= before + g.capacity){
      marginalName = g.name; clearingPrice = g.cost;
    }
    perPlant[g.name] = {cost: g.cost, dispatchedMW, strandedMW: g.capacity - dispatchedMW, rent: 0};
    running += g.capacity;
  }
  const unmet = Math.max(0, d - totalCapacity);
  if(unmet > 0){                                                  // demand exceeds capacity
    const withCap = sorted.filter(g => g.capacity > 0);          // advanced editor can zero a plant out
    if(withCap.length){ const priciest = withCap[withCap.length - 1]; marginalName = priciest.name; clearingPrice = priciest.cost; }
  }
  if(totalCapacity === 0){ marginalName = null; clearingPrice = 0; }
  for(const g of sorted){
    const p = perPlant[g.name];
    p.rent = Math.max(0, clearingPrice - g.cost) * p.dispatchedMW;
  }
  const totalRent = Object.values(perPlant).reduce((s, p) => s + p.rent, 0);
  return {sorted, clearingPrice, marginalName, perPlant, totalRent, unmet};
}
