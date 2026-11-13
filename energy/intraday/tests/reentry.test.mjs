/* Engine audit 2026-11-12, F-ID-1: the back-off cuts slices and never re-adds them, so it can overshoot
   to an empty book when a smaller profitable one exists. After the fix the terminal book is an
   equilibrium both ways: every kept slice pays, and no dropped slice could rejoin with all still paying. */
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {DAY_DEFAULTS, runDay, rawDay, greedySchedule, scheduleFromPairs, clearDay, demandAt} from '../day.js';
import {buildDayVerdict} from '../render-day.js';

const GAS185 = {...DAY_DEFAULTS, trough: 29, peak: 35, solarPeak: 3, gas: 185, carbon: 30};
const netOf = (p, s) => Array.from({length: 24}, (_, h) => demandAt(h, p) + s.charge[h] - s.discharge[h]);
const marginOf = (flat, {c, d}, rte) => flat.prices[d] - flat.prices[c] / rte;
/* does this book (a list of slices) leave every slice at or above zero on the prices it makes? */
const bookPays = (p, pairs) => {
  const flat = clearDay(p, netOf(p, scheduleFromPairs(pairs, p.rte)));
  return pairs.every(sl => marginOf(flat, sl, p.rte) >= -1e-9);
};

test('F-ID-1: the default day at 12 GW x 2 h is not an overshoot (it used to keep 4.95 GWh where 5.00 pays)', () => {
  const r = runDay({...DAY_DEFAULTS, fleetGW: 12, fleetH: 2});
  assert.ok(r.dischargedGWh >= 5 - 1e-9, `kept ${r.dischargedGWh} GWh`);
  // (that 12 GW still earns less than 10 GW is the price-taker rule, by design - not asserted)
});

/* Second ruling: whole 0.25 GWh slices are an artefact of the plan. When no whole slice can rejoin, each dropped
   slice is offered back at the largest part (steps of a tenth of the slice) that leaves every trade paying. */
const UNIT = sl => sl.unit ?? sl.q / 10;
test('F-ID-1 (second ruling): 1 GW x 1 h earns, and at least what 0.5 GW x 1 h earns less one step', () => {
  const half = runDay({...GAS185, fleetGW: 0.5, fleetH: 1});
  const one = runDay({...GAS185, fleetGW: 1, fleetH: 1});
  assert.ok(one.achievedMargin > 0, `1 GW x 1 h earns £${one.achievedMargin}k (was £0)`);
  assert.ok(one.dischargedGWh > 0.05 - 1e-9, `discharged ${one.dischargedGWh} GWh`);
  // tolerance: one step (0.025 GWh) at the best raw margin per GWh of the plan; the 0.5 GW fleet's own part-slice is 0.075 GWh
  const plan = greedySchedule(rawDay({...GAS185, fleetGW: 1, fleetH: 1}).prices, {...GAS185, fleetGW: 1, fleetH: 1});
  const rawMargin = Math.max(...plan.pairs.map(sl => rawDay(GAS185).prices[sl.d] - rawDay(GAS185).prices[sl.c] / GAS185.rte));
  const tol = 0.025 * rawMargin;
  assert.ok(one.achievedMargin >= half.achievedMargin - tol, `1 GW £${one.achievedMargin}k vs 0.5 GW £${half.achievedMargin}k, tolerance £${tol}k`);
});

test('F-ID-1: the book is empty only when the smallest part of no dropped slice pays on its own', () => {
  let n = 0, empties = 0;
  { // today's overshoot: this book is empty although a single slice pays on its own
    const p = {...GAS185, fleetGW: 1, fleetH: 1};
    const plan = greedySchedule(rawDay(p).prices, p);
    const anyPaysAlone = plan.pairs.some(sl => bookPays(p, [sl]));
    assert.ok(!anyPaysAlone || runDay(p).dischargedGWh > 0.05, 'a slice pays alone, so the book cannot be empty');
    const r = runDay(p);
    assert.ok(r.dischargedGWh > 0.05, 'the smallest part of a dropped slice pays here, so the book is not empty');
  }
  for(const gas of [60, 100, 185, 250]) for(const trough of [20, 29, 35]) for(const fleetGW of [0.5, 1, 2, 6, 12]) for(const fleetH of [1, 2, 4]){
    const p = {...DAY_DEFAULTS, trough, peak: Math.max(trough + 6, 35), solarPeak: 3, gas, carbon: 30, fleetGW, fleetH};
    const r = runDay(p); n++;
    if(r.dischargedGWh > 1e-9) continue;
    empties++;
    const plan = greedySchedule(rawDay(p).prices, p);
    for(const sl of plan.pairs) assert.ok(!bookPays(p, [{...sl, q: sl.q / 10}]), `empty book but the smallest part of slice ${JSON.stringify(sl)} pays alone (gas ${gas}, trough ${trough}, ${fleetGW} GW x ${fleetH} h)`);
  }
  assert.ok(n > 100 && empties >= 1, `sweep ran ${n} days, ${empties} with an empty book`);
});

test('F-ID-1: the smallest part of no dropped remainder can rejoin; every kept slice pays; margin, SoC and energy balance hold', () => {
  let checked = 0;
  for(const gas of [60, 100, 185, 250]) for(const trough of [20, 29]) for(const fleetGW of [0.5, 1, 2, 4, 8, 12]) for(const fleetH of [1, 2, 4]){
    const p = {...DAY_DEFAULTS, trough, peak: 35 + (trough === 20 ? 10 : 0), solarPeak: 3, gas, carbon: 30, fleetGW, fleetH};
    const r = runDay(p);
    assert.ok(Array.isArray(r.book) && Array.isArray(r.dropped), 'runDay exposes the terminal book and the dropped slices');
    assert.ok(bookPays(p, r.book), 'every kept slice pays');
    assert.ok(r.achievedMargin <= r.plannedMargin + 1e-9 || r.dischargedGWh <= 0.05, 'achieved never exceeds planned');
    const cap = fleetGW * fleetH;
    assert.ok(r.sched.soc.every(v => v >= -1e-9 && v <= cap + 1e-9) && Math.abs(r.sched.soc[24]) < 1e-7, 'SoC within the tank, empty at close');
    assert.ok(Math.abs(r.sched.charge.reduce((a, b) => a + b, 0) * p.rte - r.sched.discharge.reduce((a, b) => a + b, 0)) < 1e-7, 'charge x rte = discharge');
    assert.ok(r.sched.charge.every(v => v <= fleetGW + 1e-9) && r.sched.discharge.every(v => v <= fleetGW + 1e-9), 'power within the fleet');
    for(const sl of r.dropped){ assert.ok(!bookPays(p, [...r.book, {...sl, q: UNIT(sl)}]), `the smallest part of dropped slice ${JSON.stringify(sl)} could rejoin (gas ${gas}, ${fleetGW} GW x ${fleetH} h)`); checked++; }
  }
  assert.ok(checked > 50, `${checked} dropped slices tested`);
});

test('F-ID-1b: an empty book after a non-empty plan says the fleet closes the spread, not that the spread is thin', () => {
  const p = {...GAS185, fleetGW: 1, fleetH: 1};
  const r = {...runDay(p), dischargedGWh: 0, droppedGWh: 1.2};   // the plan traded; none of it survives
  const v = buildDayVerdict(r, p);
  assert.doesNotMatch(v, /thinner than the round-trip loss/);
  assert.match(v, /its own trading closes the (day's )?spread/);
  assert.ok(v.includes(`£${Math.round(r.raw.spread)}`), 'the key figure still appears in the line');
});

test('F-ID-1b: "thinner than the round-trip loss" survives when the plan itself is empty', () => {
  const p = {...DAY_DEFAULTS, trough: 30, peak: 47, solarPeak: 2, sunrise: 8, sunset: 16, fleetGW: 2, fleetH: 2};
  const r = runDay(p);
  assert.equal(r.dischargedGWh, 0);
  assert.equal(r.droppedGWh, 0, 'the plan is empty too');
  assert.match(buildDayVerdict(r, p), /thinner than the round-trip loss/);
});
