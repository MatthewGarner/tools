/* Pure day engine for the intraday toy: 24 hourly clearings over /merit-order's
   dispatch, a greedy storage schedule decided on the RAW shape, and one re-clear
   with the schedule applied as net demand. No DOM. Storage acts through the
   demand line (charge adds, discharge subtracts) — no fleet block in the stack,
   and the catalogue's static storage rows are EXCLUDED (double-count guard:
   the day-aware fleet is the only storage). */

/* Normalised GB-flavoured day shape (0 = trough, 1 = peak): overnight trough
   ~03:00, morning ramp, midday plateau, evening peak 18:00. Fixed shape — the
   trough/peak params scale it; the shape itself is not editable. */
export const BASE_PROFILE = [
  0.18, 0.10, 0.04, 0.00, 0.02, 0.08, 0.22, 0.42, 0.55, 0.62, 0.66, 0.68,
  0.67, 0.65, 0.63, 0.66, 0.74, 0.88, 1.00, 0.97, 0.85, 0.68, 0.48, 0.30,
];

export const DAY_DEFAULTS = {
  trough: 28, peak: 60,                    // GW
  solarPeak: 6, sunrise: 5, sunset: 21,    // GW; hours (summer-ish default)
  gas: 120, carbon: 50, wind: 0.28,        // merit-order levers passed through
  fleetGW: 0, fleetH: 2, rte: 0.85,        // the day-aware storage fleet
};

export function demandAt(h, p){ return p.trough + BASE_PROFILE[h] * (p.peak - p.trough); }

/* Half-sine solar bell between sunrise and sunset; zero outside. */
export function solarAt(h, p){
  if(p.solarPeak <= 0 || p.sunset <= p.sunrise || h <= p.sunrise || h >= p.sunset) return 0;
  return p.solarPeak * Math.sin(Math.PI * (h - p.sunrise) / (p.sunset - p.sunrise));
}

import {dispatch} from '../merit-order/engine.js';
import {buildStack} from '../merit-order/stack.js';
import {GB_TODAY} from '../merit-order/technologies.js';

export function sansStorage(catalogue){ return catalogue.filter(t => t.bid.kind !== 'storage'); }

const solarInstalled = cat => { const t = cat.find(x => x.key === 'solar'); return t ? t.installed : 0; };

/* The stack for hour h: merit-order's buildStack with the solar availability set
   by the bell (fraction of installed), storage rows excluded. Imports held at
   merit-order's default 3 GW; must-run off (negative prices are merit-order's
   lesson, not this toy's). */
export function hourStack(p, h, catalogue = GB_TODAY){
  const cat = sansStorage(catalogue);
  const inst = solarInstalled(cat);
  const solarFrac = inst > 0 ? Math.min(1, solarAt(h, p) / inst) : 0;
  return buildStack({
    gas: p.gas, carbon: p.carbon, wind: p.wind, solar: solarFrac,
    imports: 3, storageAvail: 0, chargePrice: 0, mustRunOn: false, mustRunDepth: 0,
  }, cat);
}

/* One cleared day: 24 dispatch() calls. net[h] (GW) is demand + charge − discharge
   (just demand for the raw day). */
export function clearDay(p, net, catalogue = GB_TODAY){
  const hours = [];
  for(let h = 0; h < 24; h++){
    const r = dispatch(hourStack(p, h, catalogue), net[h]);
    hours.push({h, demand: net[h], price: r.clearingPrice, marginal: r.marginalName});
  }
  const prices = hours.map(x => x.price);
  const hi = Math.max(...prices), lo = Math.min(...prices);
  return {
    hours, prices, spread: hi - lo,
    peakHour: prices.indexOf(hi), troughHour: prices.indexOf(lo),
    changeovers: hours.filter((x, i) => i > 0 && x.marginal !== hours[i - 1].marginal)
                      .map(x => ({h: x.h, to: x.marginal})),
  };
}

export function rawDay(p, catalogue = GB_TODAY){
  return clearDay(p, Array.from({length: 24}, (_, h) => demandAt(h, p)), catalogue);
}

/* Greedy perfect-foresight pair-matching on the RAW prices — the same
   "perfect foresight is greedy pair-matching" rule earmarked for E11. The
   fleet plans against the raw shape; Task 4 prices it on the flattened one —
   that gap IS the cannibalisation lesson. Charge hour must precede discharge
   hour (starts empty, one day, no carry-over). Per-hour power ≤ fleetGW both
   directions; total discharge energy ≤ fleetGW·fleetH; 1 GWh out costs
   1/rte GWh in. Each pair adds a non-negative prefix to the SoC trace, so
   feasibility (0 ≤ SoC ≤ capacity) holds by construction; socTrace verifies. */
export function greedySchedule(prices, {fleetGW, fleetH, rte}){
  const charge = new Array(24).fill(0), discharge = new Array(24).fill(0);
  if(fleetGW > 0){
    const pairs = [];
    for(let c = 0; c < 24; c++) for(let d = c + 1; d < 24; d++){
      const margin = prices[d] - prices[c] / rte;
      if(margin > 0) pairs.push({c, d, margin});
    }
    pairs.sort((a, b) => b.margin - a.margin || a.c - b.c || a.d - b.d);
    let budget = fleetGW * fleetH;                     // GWh, discharge side
    for(const {c, d} of pairs){
      if(budget <= 0) break;
      const q = Math.min(budget, fleetGW - discharge[d], (fleetGW - charge[c]) * rte);
      if(q <= 0) continue;
      discharge[d] += q; charge[c] += q / rte; budget -= q;
    }
  }
  return {charge, discharge, soc: socTrace(charge, discharge, rte)};
}

function socTrace(charge, discharge, rte){
  const soc = [0];
  for(let h = 0; h < 24; h++) soc.push(soc[h] + charge[h] * rte - discharge[h]);
  return soc;
}

/* The whole toy in one call: raw day → greedy schedule on raw prices → ONE
   re-clear with the schedule as net demand (no fixed-point iteration — the
   one-pass gap between planned and achieved margin is the honest lesson).
   Margins are £k/day (£/MWh × GWh); margin ÷ fleetGW reads as £/MW/day. */
export function runDay(p, catalogue = GB_TODAY){
  const raw = rawDay(p, catalogue);
  const sched = greedySchedule(raw.prices, p);
  const net = Array.from({length: 24}, (_, h) =>
    demandAt(h, p) + sched.charge[h] - sched.discharge[h]);
  const flat = clearDay(p, net, catalogue);
  const marginOn = prices =>
    sched.discharge.reduce((s, v, h) => s + v * prices[h], 0) -
    sched.charge.reduce((s, v, h) => s + v * prices[h], 0);
  return {
    raw, flat, sched,
    plannedMargin: marginOn(raw.prices),
    achievedMargin: marginOn(flat.prices),
    dischargedGWh: sched.discharge.reduce((a, b) => a + b, 0),
  };
}
