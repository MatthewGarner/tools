import {test} from 'node:test';
import assert from 'node:assert/strict';
import {batchEconomics} from '../economics.js';

const base = {demandPerWeek: 3, transactionCost: 1000, holdCostPerItemWeek: 500, currentBatch: 8, maxBatch: 30};

test('optimum agrees with the EOQ closed form within rounding', () => {
  const e = batchEconomics(base);
  const closed = Math.sqrt(2 * base.demandPerWeek * base.transactionCost / base.holdCostPerItemWeek);
  assert.ok(Math.abs(e.optimum - closed) <= 1, `optimum ${e.optimum} vs closed ${closed}`);
});

test('cost curve is U-shaped around the optimum', () => {
  const e = batchEconomics(base);
  const cost = b => e.curve[b - 1].total;
  for(let b = 2; b <= e.optimum; b++) assert.ok(cost(b) <= cost(b - 1) + 1e-9, `falling to B* at ${b}`);
  for(let b = e.optimum + 1; b <= base.maxBatch; b++) assert.ok(cost(b) >= cost(b - 1) - 1e-9, `rising after B* at ${b}`);
});

test('components behave: transaction falls with B, holding rises with B, total = sum', () => {
  const e = batchEconomics(base);
  for(let i = 1; i < e.curve.length; i++){
    assert.ok(e.curve[i].transaction < e.curve[i - 1].transaction);
    assert.ok(e.curve[i].holding > e.curve[i - 1].holding);
  }
  for(const p of e.curve) assert.ok(Math.abs(p.total - p.transaction - p.holding) < 1e-9);
});

test('penalty is zero at the optimum and positive elsewhere', () => {
  const atOpt = batchEconomics({...base, currentBatch: batchEconomics(base).optimum});
  assert.ok(Math.abs(atOpt.penaltyPerItem) < 1e-9);
  const off = batchEconomics({...base, currentBatch: 25});
  assert.ok(off.penaltyPerItem > 0);
  assert.ok(Math.abs(off.penaltyPerWeek - off.penaltyPerItem * base.demandPerWeek) < 1e-9);
});

test('optimum expressed in weeks of demand', () => {
  const e = batchEconomics(base);
  assert.ok(Math.abs(e.optimumWeeks - e.optimum / base.demandPerWeek) < 1e-9);
});

test('degenerate inputs stay finite', () => {
  const e = batchEconomics({...base, transactionCost: 100, holdCostPerItemWeek: 5000});
  assert.equal(e.optimum, 1);                       // heavy holding cost → single-piece flow
  for(const p of e.curve) assert.ok(isFinite(p.total) && p.total > 0);
});
