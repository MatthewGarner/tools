/* Pure pricing + stack builder for the GB merit-order tool. No DOM, node-testable.
   Gas is priced on a short-run marginal cost (SRMC) basis from the gas + carbon
   levers; storage bids its charging cost (charge ÷ round-trip efficiency), which
   sits below gas so it's dispatched first, displacing gas. */
import {GB_TODAY} from './technologies.js';

export const THERM_MWH = 0.0293071;   // 1 therm in MWh (gross calorific value)
export const GROSS_TO_NET = 1.108;    // gross (GCV) → net (LHV) natural-gas ratio
export const EF_LHV = 0.202;          // tCO2 per MWh_thermal (LHV/net basis)

export function gasLHV(pTherm){                    // pence/therm → £/MWh thermal (LHV)
  return (pTherm / 100) / THERM_MWH * GROSS_TO_NET;
}
export function srmc(eff, pTherm, carbon, vom){    // £/MWh electrical
  return gasLHV(pTherm) / eff + (carbon * EF_LHV) / eff + vom;
}
export function storageBid(chargePrice, rte){      // £/MWh — what it must earn to justify charging
  return chargePrice / rte;
}

export function buildStack(params, catalogue = GB_TODAY){
  const gens = [];
  const push = (name, capacity, cost, opts = {}) =>
    gens.push({name, capacity, cost, carbon: opts.carbon ?? 0, mustRun: !!opts.mustRun,
               family: opts.family, storage: !!opts.storage, thermal: !!opts.thermal});
  for(const t of catalogue){
    const b = t.bid;
    if(b.kind === 'vre'){
      const avail = t.key === 'solar' ? params.solar : params.wind;
      push(t.label, t.installed * avail, params.mustRunOn ? -params.mustRunDepth : 0,
           {family: t.family, mustRun: params.mustRunOn});
    } else if(b.kind === 'fixed'){
      push(t.label, t.installed, b.cost, {family: t.family, mustRun: t.mustRun});
    } else if(b.kind === 'storage'){
      push(t.label, t.installed * params.storageAvail,
           Math.round(storageBid(params.chargePrice, b.rte)),
           {family: t.family, storage: true});
    } else if(b.kind === 'imports'){
      push(t.label, Math.min(params.imports, t.installed), b.price, {family: t.family});
    } else if(b.kind === 'gas'){
      for(const band of b.bands){
        push(band.label, t.installed * band.share,
             srmc(band.eff, params.gas, params.carbon, b.vom),
             {family: t.family, thermal: true, carbon: EF_LHV / band.eff});
      }
    }
  }
  const names = gens.map(g => g.name);
  if(new Set(names).size !== names.length) throw new Error('buildStack: generator names must be unique');
  return gens;
}

export function applyAdv(gens, adv){
  if(!adv) return gens;
  return gens.map(g => {
    const row = adv[g.name];
    return Array.isArray(row) ? {...g, capacity: row[0], cost: row[1]} : g;
  });
}
