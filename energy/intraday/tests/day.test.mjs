import {test} from 'node:test';
import assert from 'node:assert/strict';
import {BASE_PROFILE, DAY_DEFAULTS, demandAt, solarAt, sansStorage, clearDay, rawDay, greedySchedule} from '../day.js';
import {GB_TODAY} from '../../merit-order/technologies.js';

test('BASE_PROFILE: 24 normalised points, trough 0 and peak 1 present', () => {
  assert.equal(BASE_PROFILE.length, 24);
  assert.ok(BASE_PROFILE.every(v => v >= 0 && v <= 1));
  assert.equal(Math.min(...BASE_PROFILE), 0);
  assert.equal(Math.max(...BASE_PROFILE), 1);
  assert.ok(BASE_PROFILE.indexOf(1) >= 17 && BASE_PROFILE.indexOf(1) <= 19, 'evening peak');
  assert.ok(BASE_PROFILE.indexOf(0) >= 2 && BASE_PROFILE.indexOf(0) <= 5, 'overnight trough');
});

test('demandAt scales the profile between trough and peak', () => {
  const p = {...DAY_DEFAULTS, trough: 30, peak: 50};
  assert.equal(demandAt(BASE_PROFILE.indexOf(0), p), 30);
  assert.equal(demandAt(BASE_PROFILE.indexOf(1), p), 50);
  for(let h = 0; h < 24; h++){
    const d = demandAt(h, p);
    assert.ok(d >= 30 && d <= 50, `hour ${h} in range`);
  }
});

test('solarAt: zero outside daylight, peak mid-day, half-sine inside', () => {
  const p = {...DAY_DEFAULTS, solarPeak: 8, sunrise: 6, sunset: 18};
  assert.equal(solarAt(3, p), 0);
  assert.equal(solarAt(22, p), 0);
  assert.equal(solarAt(6, p), 0);                       // sin(0) = 0 at sunrise
  assert.equal(solarAt(18, p), 0);                      // sin(π) = 0 at sunset
  assert.ok(Math.abs(solarAt(12, p) - 8) < 1e-9, 'solar noon = solarPeak');
  assert.ok(solarAt(9, p) > 0 && solarAt(9, p) < 8);
  assert.equal(solarAt(12, {...p, solarPeak: 0}), 0);
});

test('sansStorage removes exactly the storage rows (double-count guard)', () => {
  const out = sansStorage(GB_TODAY);
  assert.ok(!out.some(t => t.bid.kind === 'storage'));
  assert.equal(GB_TODAY.length - out.length, 2);        // bess + pumped
});

test('flat stack ⇒ flat price whatever the demand shape', () => {
  const flatCat = [{key: 'x', label: 'Bigplant', family: 'other', installed: 200, bid: {kind: 'fixed', cost: 50}}];
  const p = {...DAY_DEFAULTS, solarPeak: 0};
  const r = rawDay(p, flatCat);
  assert.ok(r.prices.every(v => v === 50));
  assert.equal(r.spread, 0);
  assert.equal(r.changeovers.length, 0);
});

test('rawDay on the GB catalogue: peak price ≥ trough price, marginal changes exist', () => {
  const r = rawDay({...DAY_DEFAULTS});
  assert.equal(r.hours.length, 24);
  assert.ok(r.prices[r.peakHour] >= r.prices[r.troughHour]);
  assert.ok(r.spread > 0);
  assert.ok(r.changeovers.length >= 1, 'the marginal unit changes at least once across a GB day');
  assert.ok(r.changeovers.every(c => c.h >= 1 && c.h <= 23 && typeof c.to === 'string'));
});

const V = [30,25,20,15,18,25,45,60,70,65,60,55,50,48,50,55,65,85,95,90,80,65,50,40];

test('greedy: zero fleet ⇒ empty schedule', () => {
  const s = greedySchedule(V, {fleetGW: 0, fleetH: 2, rte: 0.85});
  assert.ok(s.charge.every(v => v === 0) && s.discharge.every(v => v === 0));
});

test('greedy: respects power, duration and RTE conservation', () => {
  const f = {fleetGW: 4, fleetH: 2, rte: 0.85};
  const s = greedySchedule(V, f);
  assert.ok(s.charge.every(v => v <= f.fleetGW + 1e-9), 'charge power cap');
  assert.ok(s.discharge.every(v => v <= f.fleetGW + 1e-9), 'discharge power cap');
  const dis = s.discharge.reduce((a, b) => a + b, 0);
  const chg = s.charge.reduce((a, b) => a + b, 0);
  assert.ok(dis <= f.fleetGW * f.fleetH + 1e-9, 'energy budget');
  assert.ok(Math.abs(dis - chg * f.rte) < 1e-9, 'conservation: out = in × RTE');
});

test('greedy: SoC stays within [0, capacity]; charge precedes discharge', () => {
  const f = {fleetGW: 4, fleetH: 2, rte: 0.85};
  const s = greedySchedule(V, f);
  assert.ok(s.soc.every(v => v >= -1e-9 && v <= f.fleetGW * f.fleetH + 1e-9));
  assert.ok(s.soc.at(-1) < 1e-9, 'ends empty (everything profitable was sold)');
});

test('greedy: only profitable pairs taken (no discharge below charge cost ÷ RTE)', () => {
  const flat = new Array(24).fill(50);
  const s = greedySchedule(flat, {fleetGW: 4, fleetH: 2, rte: 0.85});
  assert.ok(s.discharge.every(v => v === 0), 'no arbitrage in a flat day');
  const s2 = greedySchedule([90, 20, 21, 22, ...new Array(20).fill(21)], {fleetGW: 4, fleetH: 2, rte: 0.85});
  assert.equal(s2.discharge[0], 0, 'cannot discharge before charging (starts empty)');
});

import {runDay} from '../day.js';

test('runDay: zero fleet ⇒ flat equals raw', () => {
  const r = runDay({...DAY_DEFAULTS, fleetGW: 0});
  assert.deepEqual(r.flat.prices, r.raw.prices);
  assert.equal(r.dischargedGWh, 0);
});

test('runDay: storage only ever flattens, and the desk never trades underwater', () => {
  for(const gw of [0.5, 1, 2, 4, 8]){
    const r = runDay({...DAY_DEFAULTS, fleetGW: gw});
    assert.ok(r.flat.spread <= r.raw.spread + 1e-9, `spread never widens (${gw} GW)`);
    assert.ok(r.achievedMargin >= -1e-9, `kept trades never lose (${gw} GW)`);
    assert.ok(r.achievedMargin <= r.plannedMargin + 1e-9, `cannibalisation gap (${gw} GW)`);
  }
});

test('runDay: back-off bites at scale — trades dropped, ghosts available', () => {
  // 4 GW, not the amendment's suggested 6: at 6 GW the whole plan piles onto the
  // same 2-3 hours (each capped at fleetGW), so every pair shares an identical
  // post-flatten clearing price and the back-off drops them all together —
  // dischargedGWh hits exactly 0 for every fleetGW ≥ 4.5 (verified by sweep).
  // 4 GW is the largest size where the cut is genuinely partial.
  const r = runDay({...DAY_DEFAULTS, fleetGW: 4});
  assert.ok(r.droppedGWh > 0, '4 GW cannot all fit through the thin cheap night');
  assert.ok(r.dischargedGWh > 0, 'but some trade survives');
  const planDis = r.planSched.discharge.reduce((a, b) => a + b, 0);
  assert.ok(Math.abs(planDis - r.dischargedGWh - r.droppedGWh) < 1e-9, 'plan = kept + dropped');
});

test('runDay: net demand identity — charge lifts the trough, discharge shaves the peak', () => {
  const p = {...DAY_DEFAULTS, fleetGW: 6, fleetH: 2};
  const r = runDay(p);
  for(let h = 0; h < 24; h++){
    const expected = demandAt(h, p) + r.sched.charge[h] - r.sched.discharge[h];
    assert.ok(Math.abs(r.flat.hours[h].demand - expected) < 1e-9, `hour ${h}`);
  }
});
