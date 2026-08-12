/* Priority-lane sensitivity: expedited work jumps the shared queue; it does not
   create capacity. A separate small simulator keeps that causal claim explicit
   instead of treating an expedite label as a magical shorter estimate. */
import {mulberry32, gaussian, quantile} from '../assets/series.js';
import {SEED, WEEK} from './engine.js';

const COV = {low: 0.25, med: 0.5, high: 1};
const dist = values => {
  if(!values.length) return null;
  const sorted = values.slice().sort((a, b) => a - b);
  return {mean: sorted.reduce((a, x) => a + x, 0) / sorted.length, p85: quantile(sorted, .85), count: sorted.length};
};

export function expediteSensitivity(params, {expeditePerWeek = 0, seed = SEED + 71, horizonDays = 2000} = {}){
  const rand = mulberry32(seed), gauss = gaussian(rand);
  const cov = typeof params.cov === 'number' ? params.cov : COV[params.cov];
  const sg2 = Math.log(1 + cov * cov), mu = Math.log(params.itemDays) - sg2 / 2, sg = Math.sqrt(sg2);
  const size = () => Math.exp(mu + sg * gauss());
  const demand = Math.max(.01, params.demandPerWeek);
  // Leave a standard lane by construction. The slider asks for a demand rate,
  // not a fictional percentage of guaranteed capacity.
  const effectivePerWeek = Math.max(0, Math.min(Number(expeditePerWeek) || 0, demand * .8));
  const expediteChance = effectivePerWeek / demand;
  const nextArrival = t => t - Math.log(1 - rand()) / (demand / WEEK);
  const expedited = [], standard = [], active = [], done = [];
  let t = 0, next = nextArrival(0), id = 0;
  const rate = () => active.length ? Math.min(1, params.team / active.length) : 0;
  const pull = () => {
    while(active.length < params.wipLimit && (expedited.length || standard.length)){
      const item = expedited.shift() || standard.shift();
      item.start = t; active.push(item);
    }
  };
  const soonest = () => {
    const r = rate(); let at = Infinity, i = -1;
    active.forEach((item, index) => { const end = t + item.remaining / r; if(end < at){ at = end; i = index; } });
    return {at, i};
  };
  while(t < horizonDays){
    const finish = active.length ? soonest() : {at: Infinity, i: -1};
    const at = Math.min(next, finish.at, horizonDays), dt = at - t, r = rate();
    active.forEach(item => { item.remaining -= r * dt; }); t = at;
    if(t >= horizonDays) break;
    if(finish.at <= next && finish.i >= 0){
      const item = active.splice(finish.i, 1)[0]; item.done = t; done.push(item); pull();
    } else {
      const item = {id: id++, arrive: t, remaining: size(), kind: rand() < expediteChance ? 'expedite' : 'standard'};
      if(item.kind === 'expedite') expedited.push(item); else standard.push(item);
      pull(); next = nextArrival(t);
    }
  }
  const warm = horizonDays * .2;
  const kept = done.filter(item => item.done >= warm);
  const all = dist(kept.map(item => item.done - item.arrive));
  const exp = dist(kept.filter(item => item.kind === 'expedite').map(item => item.done - item.arrive));
  const regular = dist(kept.filter(item => item.kind === 'standard').map(item => item.done - item.arrive));
  return {requestedPerWeek: Number(expeditePerWeek) || 0, effectivePerWeek, all, expedite: exp, standard: regular,
    throughputPerWeek: kept.length / (horizonDays - warm) * WEEK};
}
