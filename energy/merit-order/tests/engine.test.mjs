import {test} from 'node:test';
import assert from 'node:assert/strict';
import {dispatch} from '../engine.js';
import {buildStack} from '../stack.js';
import {DEFAULT_PARAMS} from '../scenarios.js';

const G = (name, capacity, cost, mustRun = false) => ({name, capacity, cost, carbon: 0, mustRun});
// archetype order: Renewables, Nuclear, CCGT, Peaker
const stack = (renew = 15, renewCost = 0) => [
  G('Renewables', renew, renewCost), G('Nuclear', 6, 8), G('CCGT', 25, 60), G('Peaker', 10, 150),
];

test('typical: demand 40 clears at £60, CCGT marginal', () => {
  const r = dispatch(stack(), 40);
  assert.equal(r.clearingPrice, 60);
  assert.equal(r.marginalName, 'CCGT');
  assert.equal(r.perPlant.CCGT.dispatchedMW, 40 - 21);       // 19 GW of CCGT used
  assert.equal(r.perPlant.CCGT.strandedMW, 25 - 19);
  assert.equal(r.perPlant.Peaker.dispatchedMW, 0);
  assert.equal(r.unmet, 0);
});

test('exact interior boundary picks the LAST unit needed (Nuclear, not CCGT)', () => {
  const r = dispatch(stack(), 21);   // Renewables 15 + Nuclear 6 = 21 exactly
  assert.equal(r.marginalName, 'Nuclear');
  assert.equal(r.clearingPrice, 8);
});

test('final boundary: demand = total capacity → priciest dispatched is marginal', () => {
  const r = dispatch(stack(), 56);   // 15+6+25+10
  assert.equal(r.marginalName, 'Peaker');
  assert.equal(r.clearingPrice, 150);
  assert.equal(r.unmet, 0);
});

test('demand > capacity → unmet shortfall, priciest marginal, all dispatched', () => {
  const r = dispatch(stack(), 60);
  assert.equal(r.unmet, 4);
  assert.equal(r.marginalName, 'Peaker');
  assert.equal(r.perPlant.Peaker.dispatchedMW, 10);
});

test('demand 0 → nothing dispatched, no marginal, price 0', () => {
  const r = dispatch(stack(), 0);
  assert.equal(r.marginalName, null);
  assert.equal(r.clearingPrice, 0);
});

test('negative: must-run renewables @ −£30, low demand → negative clearing', () => {
  const r = dispatch(stack(25, -30), 12);   // 12 GW inside the 25 GW renewables block
  assert.equal(r.marginalName, 'Renewables');
  assert.equal(r.clearingPrice, -30);
});

test('rent = (clearing − cost)·dispatched; 0 for the marginal plant', () => {
  const r = dispatch(stack(), 40);
  assert.equal(r.perPlant.Renewables.rent, (60 - 0) * 15);   // wind earns £60 it didn't set
  assert.equal(r.perPlant.Nuclear.rent, (60 - 8) * 6);
  assert.equal(r.perPlant.CCGT.rent, 0);                     // marginal earns no rent
});

test('equal-cost tie-break preserves archetype (input) order', () => {
  const r = dispatch([G('Renewables', 10, 50), G('Nuclear', 10, 50)], 15);
  assert.equal(r.marginalName, 'Nuclear');   // Renewables filled first (input order), Nuclear marginal
});

test('defensive: negative demand clamps to 0; zero total capacity → price 0, no marginal', () => {
  assert.equal(dispatch(stack(), -5).marginalName, null);
  const z = dispatch([G('Renewables', 0, 0), G('Nuclear', 0, 8)], 5);
  assert.equal(z.clearingPrice, 0);
  assert.equal(z.marginalName, null);
});

test('unmet fallback skips a zero-capacity priciest plant (editor can zero one out)', () => {
  // Peaker (priciest) edited to 0 GW; demand 30 > capacity 21 → CCGT is the priciest WITH capacity
  const s = [G('Renewables', 15, 0), G('Nuclear', 6, 8), G('CCGT', 25, 60), G('Peaker', 0, 150)];
  // shrink CCGT so demand overflows: use demand 50 > 15+6+25+0 = 46
  const r = dispatch(s, 50);
  assert.equal(r.unmet, 4);
  assert.equal(r.marginalName, 'CCGT');   // NOT the 0-capacity Peaker
  assert.equal(r.clearingPrice, 60);
});

test('many-block: the unchanged engine handles the v2 14-block stack (default → CCGT-60 @ £83)', () => {
  const r = dispatch(buildStack(DEFAULT_PARAMS), DEFAULT_PARAMS.demand);
  assert.equal(r.sorted.length, 14);
  assert.equal(r.marginalName, 'CCGT 60%');
  assert.equal(Math.round(r.clearingPrice), 83);
  assert.equal(r.unmet, 0);
});
