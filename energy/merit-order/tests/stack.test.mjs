import {test} from 'node:test';
import assert from 'node:assert/strict';
import {gasLHV, srmc, storageBid, buildStack, applyAdv, ccsBid} from '../stack.js';
import {FES_HT} from '../technologies.js';
import {dispatch} from '../engine.js';

const r = n => Math.round(n);

test('gasLHV converts pence/therm → £/MWh (LHV, ×1.108 gross→net)', () => {
  assert.equal(Math.round(gasLHV(100) * 100) / 100, 37.81);
  assert.equal(Math.round(gasLHV(250) * 100) / 100, 94.52);
});

test('gas SRMC bands at normal gas (100p/therm, £50/t)', () => {
  assert.equal(r(srmc(0.60, 100, 50, 3)), 83);
  assert.equal(r(srmc(0.54, 100, 50, 3)), 92);
  assert.equal(r(srmc(0.49, 100, 50, 3)), 101);
  assert.equal(r(srmc(0.42, 100, 50, 6)), 120);
  assert.equal(r(srmc(0.36, 100, 50, 6)), 139);
});

test('gas SRMC bands at spike gas (250p/therm) — CCGT-49 sits on the £216.5 boundary → £217', () => {
  assert.deepEqual([0.60,0.54,0.49].map(e => r(srmc(e,250,50,3))), [177,197,217]);
  assert.deepEqual([0.42,0.36].map(e => r(srmc(e,250,50,6))), [255,297]);
});

test('storageBid = charge ÷ RTE (below the cheapest gas)', () => {
  assert.equal(r(storageBid(40, 0.85)), 47);   // BESS
  assert.equal(r(storageBid(40, 0.75)), 53);   // pumped
});

const DEF = {demand:40, gas:100, carbon:50, wind:0.28, solar:0.20,
  imports:3, storageAvail:0.50, chargePrice:40, mustRunOn:false, mustRunDepth:30};

test('buildStack: names are globally unique (guards the perPlant collision)', () => {
  const names = buildStack(DEF).map(g => g.name);
  assert.equal(new Set(names).size, names.length);
});

test('buildStack: gas fleet expands into 5 bands; storage sits BELOW the cheapest gas', () => {
  const gens = buildStack(DEF);
  const cost = n => gens.find(g => g.name === n).cost;
  const bess = cost('BESS'), pumped = cost('Pumped storage');
  const cheapestGas = Math.min(...gens.filter(g => g.thermal).map(g => g.cost));
  assert.ok(bess < cheapestGas && pumped < cheapestGas, 'storage below gas');
  assert.equal(gens.filter(g => g.thermal).length, 5);
});

test('buildStack: VRE + storage widths scale by availability', () => {
  const gens = buildStack(DEF);
  assert.equal(Math.round(gens.find(g => g.name === 'Wind').capacity * 100) / 100, 8.96); // 32×0.28
  assert.equal(Math.round(gens.find(g => g.name === 'BESS').capacity * 100) / 100, 3.6);  // 7.2×0.5
});

test('buildStack: default clears in CCGT-60 @ £83 with storage inframarginal (rent = spread)', () => {
  const gens = buildStack(DEF);
  const res = dispatch(gens, DEF.demand);
  assert.equal(res.marginalName, 'CCGT 60%');
  assert.equal(Math.round(res.clearingPrice), 83);
  assert.ok(res.perPlant['BESS'].dispatchedMW > 0, 'BESS dispatched');
  assert.ok(res.perPlant['BESS'].rent > 0, 'BESS earns rent (the spread)');
  assert.equal(res.unmet, 0);
});

test('buildStack: must-run on → wind/solar bid −depth', () => {
  const gens = buildStack({...DEF, mustRunOn:true, mustRunDepth:30});
  assert.equal(gens.find(g => g.name === 'Wind').cost, -30);
  assert.equal(gens.find(g => g.name === 'Wind').mustRun, true);
});

test('applyAdv overrides capacity + cost by name', () => {
  const gens = applyAdv(buildStack(DEF), {'BESS': [10, 20]});
  const b = gens.find(g => g.name === 'BESS');
  assert.equal(b.capacity, 10);
  assert.equal(b.cost, 20);
});

test('buildStack throws on a duplicate-name catalogue', () => {
  const dup = [
    {key:'a', label:'X', family:'wind', installed:1, bid:{kind:'fixed', cost:1}},
    {key:'b', label:'X', family:'solar', installed:1, bid:{kind:'fixed', cost:2}},
  ];
  assert.throws(() => buildStack(DEF, dup), /unique|duplicate/i);
});

test('ccsBid: nearly flat, and crosses the gas bands at the right carbon', () => {
  assert.equal(Math.round(ccsBid(100, 50)), 93);          // 92.65
  assert.equal(Math.round(ccsBid(100, 80)), 94);          // 93.81
  // fleet CCGT-54 crossover is ~£53: CCS pricier at 52, cheaper at 54
  assert.ok(ccsBid(100, 52) > srmc(0.54, 100, 52, 3));
  assert.ok(ccsBid(100, 54) < srmc(0.54, 100, 54, 3));
  // undercuts the dirtiest CCGT-49 early (~£29); the best CCGT-60 only late (~£83)
  assert.ok(ccsBid(100, 30) < srmc(0.49, 100, 30, 3));
  assert.ok(ccsBid(100, 70) > srmc(0.60, 100, 70, 3));    // not yet below the best gas at £70
  assert.ok(ccsBid(100, 90) < srmc(0.60, 100, 90, 3));    // below it by £90
});

test('buildStack(FES_HT): CCS priced by ccsBid, hydrogen £200, both thermal-hued, unique names', () => {
  const P = {demand:50, gas:100, carbon:50, wind:.28, solar:.20, imports:5, storageAvail:.5, chargePrice:40, mustRunOn:false, mustRunDepth:30};
  const g = buildStack(P, FES_HT);
  const ccs = g.find(x => x.name === 'Gas-CCS');
  assert.equal(Math.round(ccs.cost), 93);
  assert.equal(ccs.thermal, true);          // tinted from the thermal ramp
  assert.equal(ccs.family, 'ccs');          // but its own family for labelling
  const h2 = g.find(x => x.name === 'Hydrogen');
  assert.equal(h2.cost, 200);
  assert.equal(h2.thermal, true);
  assert.equal(h2.family, 'hydrogen');
  const names = g.map(x => x.name);
  assert.equal(new Set(names).size, names.length);
});
