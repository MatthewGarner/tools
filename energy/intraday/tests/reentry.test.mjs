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

test('F-ID-1: the 1 GW x 1 h case of the audit stays empty for a stated reason: no 0.25 GWh slice pays alone', () => {
  // 0.5 GW x 1 h trades a 0.075 GWh part-slice (its power limit trims the last quantum); a 1 GW fleet's
  // slices are whole 0.25 GWh clips and each one moves the price past its own margin.
  const p = {...GAS185, fleetGW: 1, fleetH: 1};
  const r = runDay(p);
  assert.equal(r.dischargedGWh, 0);
  for(const sl of greedySchedule(rawDay(p).prices, p).pairs) assert.ok(!bookPays(p, [sl]));
});

test('F-ID-1: the book is empty only when no single slice pays on its own', () => {
  let n = 0, empties = 0;
  { // today's overshoot: this book is empty although a single slice pays on its own
    const p = {...GAS185, fleetGW: 1, fleetH: 1};
    const plan = greedySchedule(rawDay(p).prices, p);
    const anyPaysAlone = plan.pairs.some(sl => bookPays(p, [sl]));
    assert.ok(!anyPaysAlone || runDay(p).dischargedGWh > 0.05, 'a slice pays alone, so the book cannot be empty');
  }
  for(const gas of [60, 100, 185, 250]) for(const trough of [20, 29, 35]) for(const fleetGW of [0.5, 1, 2, 6, 12]) for(const fleetH of [1, 2, 4]){
    const p = {...DAY_DEFAULTS, trough, peak: Math.max(trough + 6, 35), solarPeak: 3, gas, carbon: 30, fleetGW, fleetH};
    const r = runDay(p); n++;
    if(r.dischargedGWh > 1e-9) continue;
    empties++;
    const plan = greedySchedule(rawDay(p).prices, p);
    for(const sl of plan.pairs) assert.ok(!bookPays(p, [sl]), `empty book but slice ${JSON.stringify(sl)} pays alone (gas ${gas}, trough ${trough}, ${fleetGW} GW x ${fleetH} h)`);
  }
  assert.ok(n > 100 && empties >= 1, `sweep ran ${n} days, ${empties} with an empty book`);
});

test('F-ID-1: no dropped slice can rejoin with every slice still paying; every kept slice pays', () => {
  let checked = 0;
  for(const gas of [60, 100, 185, 250]) for(const trough of [20, 29]) for(const fleetGW of [0.5, 1, 2, 4, 8, 12]) for(const fleetH of [1, 2, 4]){
    const p = {...DAY_DEFAULTS, trough, peak: 35 + (trough === 20 ? 10 : 0), solarPeak: 3, gas, carbon: 30, fleetGW, fleetH};
    const r = runDay(p);
    assert.ok(Array.isArray(r.book) && Array.isArray(r.dropped), 'runDay exposes the terminal book and the dropped slices');
    assert.ok(bookPays(p, r.book), 'every kept slice pays');
    for(const sl of r.dropped){ assert.ok(!bookPays(p, [...r.book, sl]), `dropped slice ${JSON.stringify(sl)} could rejoin (gas ${gas}, ${fleetGW} GW x ${fleetH} h)`); checked++; }
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
