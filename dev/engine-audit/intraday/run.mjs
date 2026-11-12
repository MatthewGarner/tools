// Intraday audit harness.  Run:  node dev/engine-audit/intraday/run.mjs
// kind 'pass' = independent evidence the engine is right; 'defect'/'question' assert the CORRECT behaviour and FAIL today.
import {makeRunner, rng} from './lib.mjs';
import * as D from '../../../energy/intraday/day.js';
import {dispatch} from '../../../energy/merit-order/engine.js';
import {GB_TODAY} from '../../../energy/merit-order/technologies.js';
import {srmc} from '../../../energy/merit-order/stack.js';
import {decodeDayState, encodeDayState, RANGES} from '../../../energy/intraday/state.js';
import {buildDayVerdict} from '../../../energy/intraday/render-day.js';

const R = makeRunner('intraday');
const near = (a, b, t = 1e-9) => Math.abs(a - b) <= t;

/* ---------- 1. shape + stack, hand-computed (defaults: trough 22, peak 44, solar 6 GW 05..21, wind 32%, gas 100p, carbon 50) ---------- */
R.eq('D1', 'pass', 'demandAt(3) = trough', D.demandAt(3, D.DAY_DEFAULTS), 22);
R.eq('D1', 'pass', 'demandAt(18) = peak', D.demandAt(18, D.DAY_DEFAULTS), 44);
R.eq('D1', 'pass', 'solarAt(13) = peak of the half-sine (6 GW)', D.solarAt(13, D.DAY_DEFAULTS), 6, 1e-12);
R.eq('D1', 'pass', 'solarAt(5) = solarAt(21) = 0', [D.solarAt(5, D.DAY_DEFAULTS), D.solarAt(21, D.DAY_DEFAULTS)], [0, 0]);
{
  // h=3: wind 0.32*32=10.24 @0, solar 0, hydro 1.9 @3, nuclear 6 @5, waste 4.5 @20 -> cumulative 22.64 >= 22 : Waste/CHP sets £20
  const r = dispatch(D.hourStack(D.DAY_DEFAULTS, 3), 22);
  R.eq('D2', 'pass', 'h=3 trough demand 22 -> Waste/CHP at £20', [r.marginalName, r.clearingPrice], ['Waste/CHP', 20]);
  // h=18: solar 6*sin(pi*13/16)=2.8284; cumulative: 10.24+2.8284+1.9+6+4.5+4(biomass)+3(imports) = 32.47; CCGT60 6.2 -> 38.67; CCGT54 15.5 -> 54.17 >= 44
  const r2 = dispatch(D.hourStack(D.DAY_DEFAULTS, 18), 44);
  R.eq('D2', 'pass', 'h=18 peak demand 44 -> CCGT 54% at srmc(.54,100,50,3)', [r2.marginalName, r2.clearingPrice], ['CCGT 54%', srmc(0.54, 100, 50, 3)], 1e-9);
  const names = D.hourStack(D.DAY_DEFAULTS, 18).map(g => g.name);
  R.check('D2', 'pass', 'storage rows excluded from the hour stack (double-count guard)', !names.includes('BESS') && !names.includes('Pumped storage'));
  const sol = D.hourStack(D.DAY_DEFAULTS, 18).find(g => g.name === 'Solar').capacity;
  R.eq('D2', 'pass', 'solar capacity at h=18 = bell value', sol, D.solarAt(18, D.DAY_DEFAULTS), 1e-9);
  const raw = D.rawDay(D.DAY_DEFAULTS);
  R.eq('D2', 'pass', 'default raw day: spread = CCGT54 - waste £20; floor hour 3', [raw.troughHour, raw.spread], [3, srmc(0.54, 100, 50, 3) - 20]);
  R.check('D2', 'pass', 'peak hour is the FIRST hour at the CCGT-54 plateau (17, solar still up; demand peak is 18 - a tie, reported earliest)', raw.peakHour === 17 && near(raw.prices[17], raw.prices[18]), `peakHour=${raw.peakHour}`);
}

/* ---------- 2. greedy schedule: hand case ---------- */
{
  // prices 50 everywhere except h3=10 and h18=100. 1 GW x 2 h, rte .85.
  // best pair (3,18) margin 100-10/.85=88.2. Charge-side cap: 1 GW grid => 0.85 GWh stored => q=0.85 at 18.
  // Next best (c,18) margin 100-50/.85=41.2 with c=0 first: remaining discharge room at 18 = 1-0.85=0.15 GWh -> charge[0]=0.15/0.85.
  // Then (3,d) is blocked (charge[3] full) so the book stops: total discharge 1.0 GWh, all at h18.
  const prices = Array(24).fill(50); prices[3] = 10; prices[18] = 100;
  const s = D.greedySchedule(prices, {fleetGW: 1, fleetH: 2, rte: 0.85});
  R.check('G1', 'pass', 'hand schedule: charge h3 = 1, charge h0 = 0.15/0.85, discharge h18 = 1', near(s.charge[3], 1) && near(s.charge[0], 0.15 / 0.85) && near(s.discharge[18], 1), JSON.stringify([s.charge[3], s.charge[0], s.discharge[18]]));
  R.eq('G1', 'pass', 'hand schedule: nothing else moves', s.charge.reduce((a, b) => a + b, 0) + s.discharge.reduce((a, b) => a + b, 0), 1 + 0.15 / 0.85 + 1, 1e-9);
  const empty = D.greedySchedule(prices, {fleetGW: 0, fleetH: 2, rte: 0.85});
  R.eq('G1', 'pass', 'fleet 0 -> no trades', empty.pairs.length, 0);
  const flat = D.greedySchedule(Array(24).fill(70), {fleetGW: 5, fleetH: 3, rte: 0.85});
  R.eq('G1', 'pass', 'flat prices -> no trades', flat.pairs.length, 0);
  const s1 = D.greedySchedule([0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 100, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], {fleetGW: 2, fleetH: 1, rte: 1});
  R.eq('G1', 'pass', 'rte=1: cost-free charging, 2 GWh at £100 => 200 GW*£ ; energy in == out', [s1.discharge[12], s1.charge.reduce((a, b) => a + b, 0)], [2, 2], 1e-9);
}

/* ---------- 3. seeded sweeps: schedule feasibility + energy balance (greedy and runDay) ---------- */
const rnd = rng(20261112);
const pick = (lo, hi, st) => lo + Math.floor(rnd() * ((hi - lo) / st + 1)) * st;
{
  const bad = {power: 0, cap: 0, soc: 0, endsEmpty: 0, balance: 0, simul: 0, pairMargin: 0};
  let n = 0;
  for(let t = 0; t < 400; t++){
    const prices = Array.from({length: 24}, () => Math.round(rnd() * 200 - 30));
    const p = {fleetGW: pick(0.5, 12, 0.5), fleetH: pick(1, 6, 0.5), rte: [0.5, 0.7, 0.85, 0.95, 1][Math.floor(rnd() * 5)]};
    const s = D.greedySchedule(prices, p); n++;
    const cap = p.fleetGW * p.fleetH, E = 1e-9;
    if(s.charge.some(v => v > p.fleetGW + E || v < -E) || s.discharge.some(v => v > p.fleetGW + E || v < -E)) bad.power++;
    if(s.discharge.reduce((a, b) => a + b, 0) > cap + E) bad.cap++;
    if(s.soc.some(v => v < -E || v > cap + E)) bad.soc++;
    if(Math.abs(s.soc[24]) > 1e-7) bad.endsEmpty++;
    if(Math.abs(s.charge.reduce((a, b) => a + b, 0) * p.rte - s.discharge.reduce((a, b) => a + b, 0)) > 1e-7) bad.balance++;
    if(s.charge.some((c, h) => c > E && s.discharge[h] > E)) bad.simul++;
    if(s.pairs.some(({c, d}) => prices[d] - prices[c] / p.rte <= 0)) bad.pairMargin++;
    const re = D.scheduleFromPairs(s.pairs, p.rte);
    if(re.charge.some((v, h) => !near(v, s.charge[h], 1e-9)) || re.discharge.some((v, h) => !near(v, s.discharge[h], 1e-9))) bad.pairMargin++;
  }
  R.check('G2', 'pass', `greedy: power <= fleetGW both ways (${n} random inputs)`, bad.power === 0, `viol=${bad.power}`);
  R.check('G2', 'pass', 'greedy: total discharge <= fleetGW*fleetH', bad.cap === 0, `viol=${bad.cap}`);
  R.check('G2', 'pass', 'greedy: 0 <= SoC <= capacity at every hour', bad.soc === 0, `viol=${bad.soc}`);
  R.check('G2', 'pass', 'greedy: day ends with an empty tank', bad.endsEmpty === 0, `viol=${bad.endsEmpty}`);
  R.check('G2', 'pass', 'greedy: charge x rte = discharge (energy balance through efficiency)', bad.balance === 0, `viol=${bad.balance}`);
  R.check('G2', 'pass', 'greedy: never charges and discharges in the same hour', bad.simul === 0, `viol=${bad.simul}`);
  R.check('G2', 'pass', 'greedy: every accepted pair has positive margin; scheduleFromPairs reproduces it', bad.pairMargin === 0, `viol=${bad.pairMargin}`);
}

/* ---------- 4. greedy vs exact DP optimum (same constraints: power, SoC, total discharge <= fleetGW*fleetH) ---------- */
function dpOpt(prices, {fleetGW, fleetH, rte}){
  const Q = 0.05, cap = Math.round(fleetGW * fleetH / Q), maxD = Math.floor(fleetGW / Q + 1e-9), maxC = Math.floor(fleetGW * rte / Q + 1e-9);
  let V = new Map([['0,0', 0]]);
  for(let h = 0; h < 24; h++){
    const N = new Map();
    for(const [k, v] of V){
      const [s, dd] = k.split(',').map(Number);
      for(let a = -maxC; a <= maxD; a++){
        const t = s - a; if(t < 0 || t > cap) continue;
        const nd = dd + (a > 0 ? a : 0); if(nd > cap) continue;
        const val = v + (a > 0 ? a * Q * prices[h] : a * Q * prices[h] / rte);
        const kk = t + ',' + nd; if(!N.has(kk) || N.get(kk) < val) N.set(kk, val);
      }
    }
    V = N;
  }
  return Math.max(...V.values());
}
const marginOn = (s, pr) => s.discharge.reduce((a, v, h) => a + v * pr[h], 0) - s.charge.reduce((a, v, h) => a + v * pr[h], 0);
{
  let bad = 0, n = 0, worst = 1;
  for(let t = 0; t < 60; t++){
    const p = {...D.DAY_DEFAULTS, trough: pick(18, 40, 1), peak: pick(30, 60, 1), solarPeak: pick(0, 14, 1), gas: pick(40, 300, 5), carbon: pick(0, 150, 5), fleetGW: pick(0.5, 3, 0.5), fleetH: pick(1, 3, 0.5)};
    const raw = D.rawDay(p), g = D.greedySchedule(raw.prices, p), gm = marginOn(g, raw.prices), opt = dpOpt(raw.prices, p); n++;
    if(gm < opt * (1 - 1e-4)){ bad++; worst = Math.min(worst, gm / opt); }   // gm slightly > opt is the DP's 0.05 GWh grid, not an engine fault
  }
  R.check('G3', 'pass', `greedy == exact optimum on engine-generated days (${n} cases; "perfect foresight" holds for the shapes this engine makes)`, bad === 0, `mismatches=${bad} worst ratio=${worst.toFixed(4)}`);
  // QUESTION: on arbitrary (noisy) price vectors greedy is suboptimal. The engine never feeds it such a vector, so this is not reachable.
  let sub = 0, tot = 0, w = 1;
  for(let t = 0; t < 80; t++){
    const prices = Array.from({length: 24}, () => Math.round(rnd() * 150 - 10));
    const p = {fleetGW: pick(1, 2, 1), fleetH: pick(1, 2, 1), rte: [0.7, 0.85, 1][Math.floor(rnd() * 3)]};
    const gm = marginOn(D.greedySchedule(prices, p), prices), opt = dpOpt(prices, p); tot++;
    if(gm < opt - 1e-6){ sub++; w = Math.min(w, gm / opt); }
  }
  R.check('Q-GREEDY', 'question', 'QUESTION (not UI-reachable): greedy pair-matching is optimal on arbitrary price vectors', sub === 0, `suboptimal in ${sub}/${tot} random vectors, worst ratio ${w.toFixed(3)}`);
}

/* ---------- 5. runDay: independent re-clear, per-slice margins, identities ---------- */
function refPrice(gens, d){            // independent unit-by-unit reference
  const idx = gens.map((g, i) => i).sort((i, j) => gens[i].cost - gens[j].cost || i - j);
  let rem = d, price = 0; for(const i of idx){ const t = Math.min(gens[i].capacity, rem); rem -= t; if(rem < 1e-9) rem = 0; if(t > 1e-9) price = gens[i].cost; }
  return price;
}
{
  const bad = {reclear: 0, slice: 0, ident: 0, nonneg: 0, planned: 0, dropped: 0, net: 0};
  let n = 0;
  for(let t = 0; t < 120; t++){
    const p = {...D.DAY_DEFAULTS, trough: pick(18, 40, 1), peak: pick(30, 60, 1), solarPeak: pick(0, 14, 1), gas: pick(40, 300, 5), carbon: pick(0, 150, 5), fleetGW: pick(0, 12, 0.5), fleetH: pick(1, 6, 0.5), rte: [0.7, 0.85, 1][Math.floor(rnd() * 3)]};
    const r = D.runDay(p); n++;
    for(let h = 0; h < 24; h++){
      const net = D.demandAt(h, p) + r.sched.charge[h] - r.sched.discharge[h];
      if(!near(net, r.flat.hours[h].demand, 1e-9)) bad.net++;
      if(!near(refPrice(D.hourStack(p, h), net), r.flat.prices[h], 1e-9)) bad.reclear++;
      if(!near(refPrice(D.hourStack(p, h), D.demandAt(h, p)), r.raw.prices[h], 1e-9)) bad.reclear++;
    }
    // reconstruct slices from the schedule: margin identity and non-negativity per surviving slice
    const ach = marginOn(r.sched, r.flat.prices);
    if(!near(ach, r.achievedMargin, 1e-9)) bad.ident++;
    if(r.achievedMargin < -1e-9) bad.nonneg++;
    if(!near(r.plannedMargin, marginOn(r.planSched, r.raw.prices), 1e-9)) bad.ident++;
    if(!near(r.dischargedGWh, r.sched.discharge.reduce((a, b) => a + b, 0), 1e-9)) bad.ident++;
    if(r.droppedGWh < -1e-9) bad.dropped++;
    if(r.dischargedGWh > 0.05 && r.achievedMargin > r.plannedMargin + 1e-6) bad.planned++;
    // balance + bounds survive the back-off
    const cap = p.fleetGW * p.fleetH;
    if(r.sched.soc.some(v => v < -1e-9 || v > cap + 1e-9) || Math.abs(r.sched.soc[24]) > 1e-7) bad.slice++;
    if(r.sched.charge.some(v => v > p.fleetGW + 1e-9) || r.sched.discharge.some(v => v > p.fleetGW + 1e-9)) bad.slice++;
  }
  R.check('RD1', 'pass', `runDay: net demand = demand + charge - discharge; every hour re-clears to an independent reference price (${n} days)`, bad.net === 0 && bad.reclear === 0, `net viol=${bad.net} reclear viol=${bad.reclear}`);
  R.check('RD1', 'pass', 'runDay: achieved/planned margin identities, dischargedGWh, droppedGWh >= 0', bad.ident === 0 && bad.dropped === 0, `ident=${bad.ident} dropped=${bad.dropped}`);
  R.check('RD1', 'pass', 'runDay: achievedMargin >= 0; never exceeds plannedMargin (verdict "keeps X of Y" stays X<=Y)', bad.nonneg === 0 && bad.planned === 0, `nonneg=${bad.nonneg} X>Y=${bad.planned}`);
  R.check('RD1', 'pass', 'runDay: SoC within [0,cap], empty at close, power within fleetGW after back-off', bad.slice === 0, `viol=${bad.slice}`);
}
{ // per-slice claim: "every surviving slice pays" - rebuild slices by re-running greedy+backoff is internal; test via hour-pair marginality instead:
  // for the default 1 GW fleet, margin per discharged GWh must be >= 0 in aggregate AND flat-price spread between any charge hour and any discharge hour used must beat the loss.
  const p = {...D.DAY_DEFAULTS, fleetGW: 4, fleetH: 2}, r = D.runDay(p);
  const chH = r.sched.charge.map((v, h) => v > 1e-9 ? h : -1).filter(h => h >= 0), diH = r.sched.discharge.map((v, h) => v > 1e-9 ? h : -1).filter(h => h >= 0);
  const worst = Math.min(...diH.map(d => Math.min(...chH.filter(c => c < d).map(c => r.flat.prices[d] - r.flat.prices[c] / p.rte))));
  R.check('RD2', 'pass', 'surviving book: every charge->discharge hour pair that exists pays on flat prices', worst >= -1e-9, `worst pair margin £${worst.toFixed(2)}/MWh`);
}

/* ---------- 6. defects ---------- */
{ // F-ID-1/2: the back-off is not an optimiser; a bigger fleet earns LESS in total than a smaller one, and can print "finds nothing worth trading" when it can trade
  const base = {...D.DAY_DEFAULTS, trough: 29, peak: 35, solarPeak: 3, gas: 185, carbon: 30};
  const half = D.runDay({...base, fleetGW: 0.5, fleetH: 1}), one = D.runDay({...base, fleetGW: 1, fleetH: 1});
  R.check('F-ID-1', 'defect', 'a 1 GW x 1 h fleet earns at least what a 0.5 GW x 1 h fleet earns (it could simply trade less)', one.achievedMargin >= half.achievedMargin - 1e-9,
    `0.5 GW: £${half.achievedMargin.toFixed(2)}k/day, 1 GW: £${one.achievedMargin.toFixed(2)}k/day`);
  const v = buildDayVerdict(one, {...base, fleetGW: 1, fleetH: 1});
  const lossPerMWh = one.raw.prices[1] / 0.85 - one.raw.prices[1];       // round-trip loss at the cheapest-hour price
  R.check('F-ID-1b', 'defect', 'verdict does not say "spread is thinner than the round-trip loss" when it is not', !(/thinner than the round-trip loss/.test(v) && one.raw.spread > lossPerMWh),
    `raw spread £${one.raw.spread.toFixed(1)} vs loss ~£${lossPerMWh.toFixed(1)}/MWh; text: "${v}"`);
  const def = {...D.DAY_DEFAULTS};
  const a = D.runDay({...def, fleetGW: 0.5, fleetH: 2}), b = D.runDay({...def, fleetGW: 1, fleetH: 2});
  R.check('F-ID-2', 'defect', 'default day: a 1 GW x 2 h fleet earns at least what 0.5 GW x 2 h earns', b.achievedMargin >= a.achievedMargin - 1e-9, `0.5 GW: £${a.achievedMargin.toFixed(2)}k, 1 GW: £${b.achievedMargin.toFixed(2)}k (per-MW verdict figure £${Math.round(a.achievedMargin / 0.5)} vs £${Math.round(b.achievedMargin / 1)})`);
  let viol = []; let prev = -1;
  for(const f of [0.5, 1, 1.5, 2, 3, 4, 6, 8, 10, 12]){ const m = D.runDay({...def, fleetGW: f, fleetH: 2}).achievedMargin; if(prev >= 0 && m < prev - 1e-9) viol.push(f); prev = m; }
  R.check('F-ID-2b', 'defect', 'default day, 2 h: total margin never falls as the fleet grows (0.5..12 GW)', viol.length === 0, `falls at fleet sizes ${viol.join(', ')} GW`);
  let bigger = 0, tot = 0;
  for(let t = 0; t < 120; t++){
    const base = {...D.DAY_DEFAULTS, trough: pick(18, 40, 1), peak: pick(30, 60, 1), solarPeak: pick(0, 14, 1), gas: pick(40, 300, 5), carbon: pick(0, 150, 5), fleetH: pick(1, 6, 0.5)};
    if(base.peak < base.trough + 3) continue; let pr = -1;
    for(const f of [0.5, 1, 2, 4, 8, 12]){ const m = D.runDay({...base, fleetGW: f}).achievedMargin; tot++; if(pr >= 0 && m < pr - 1e-9) bigger++; pr = m; }
  }
  R.check('F-ID-2c', 'defect', 'seeded sweep: bigger fleet never earns less in total', bigger === 0, `${bigger} of ${tot} fleet-size steps earn less than the smaller fleet`);
}
{ // F-ID-3: Trough slider (18..40) can exceed Peak slider (30..60)
  const p = {...D.DAY_DEFAULTS, trough: 40, peak: 30};
  R.check('F-ID-3', 'defect', 'evening "peak" demand >= overnight "trough" demand for every slider-reachable pair', D.demandAt(18, p) >= D.demandAt(3, p), `trough=40 peak=30 -> demand at 03:00 = ${D.demandAt(3, p)} GW, at 18:00 = ${D.demandAt(18, p)} GW`);
}
{ // F-ID-4: decode treats null as 0
  const d = decodeDayState({v: 1, c: null, p: {gas: null, carbon: ''}});
  R.check('F-ID-4', 'defect', 'a null/empty param in a shared URL falls back to the default, not to the slider minimum', d.p.gas === D.DAY_DEFAULTS.gas && d.p.carbon === D.DAY_DEFAULTS.carbon, `gas=${d.p.gas} (default ${D.DAY_DEFAULTS.gas}), carbon=${d.p.carbon} (default ${D.DAY_DEFAULTS.carbon})`);
  const rt = decodeDayState(encodeDayState({...D.DAY_DEFAULTS, fleetGW: 4, gas: 250}, 'bigFleet'));
  R.check('S1', 'pass', 'state encode/decode round-trips and clamps to RANGES', rt.p.fleetGW === 4 && rt.p.gas === 250 && decodeDayState({v: 1, p: {fleetGW: 5000}}).p.fleetGW === RANGES.fleetGW[1]);
}
{ // F-ID-5: the stated season of the default day is inconsistent (comment): summer-night trough with winter peak and a summer sun
  const p = D.DAY_DEFAULTS;
  R.check('F-ID-5', 'question', 'QUESTION: default day mixes summer trough (22 GW, "summer-night"), winter peak (44 GW) and a 16 h summer sun (05:00-21:00)', !(p.trough <= 24 && p.peak >= 44 && p.sunset - p.sunrise >= 14), `trough ${p.trough}, peak ${p.peak}, sun ${p.sunrise}-${p.sunset}`);
}
{ // timing: worst reachable slider corner
  const t0 = Date.now(); D.runDay({...D.DAY_DEFAULTS, gas: 300, fleetGW: 12, fleetH: 6}); const ms = Date.now() - t0;
  R.check('E1', 'pass', 'worst slider corner (12 GW x 6 h) runs fast enough for a slider tick', ms < 500, `${ms} ms`);
}
R.finish();
