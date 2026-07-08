import {test} from 'node:test';
import assert from 'node:assert/strict';
import {DEFAULT_PARAMS, CONDITIONS, paramsFor} from '../scenarios.js';
import {buildStack} from '../stack.js';
import {dispatch} from '../engine.js';

const clear = key => {
  const p = paramsFor(key);
  return dispatch(buildStack(p), p.demand);
};

test('default: CCGT-60 @ £83, nothing unmet', () => {
  const r = dispatch(buildStack(DEFAULT_PARAMS), DEFAULT_PARAMS.demand);
  assert.equal(r.marginalName, 'CCGT 60%');
  assert.equal(Math.round(r.clearingPrice), 83);
  assert.equal(r.unmet, 0);
});

test('every Condition clears at its literal {marginal, price}, never unmet', () => {
  const want = {
    windy:      ['Nuclear', 5],
    coldPeak:   ['CCGT 49%', 101],
    gasSpike:   ['CCGT 60%', 177],
    negative:   ['Wind', -30],
  };
  for(const key of Object.keys(want)){
    const r = clear(key);
    assert.equal(r.marginalName, want[key][0], `${key} marginal`);
    assert.equal(Math.round(r.clearingPrice), want[key][1], `${key} price`);
    assert.equal(r.unmet, 0, `${key} unmet`);
  }
});

test('gas spike: storage earns a fat spread (rent > £100/MWh dispatched)', () => {
  const p = paramsFor('gasSpike');
  const r = dispatch(buildStack(p), p.demand);
  const bess = r.perPlant['BESS'];
  assert.ok(bess.rent / bess.dispatchedMW > 100, 'spread balloons at spike');
});

test('paramsFor(null) returns a fresh copy of the defaults', () => {
  const p = paramsFor(null);
  assert.deepEqual(p, DEFAULT_PARAMS);
  assert.notEqual(p, DEFAULT_PARAMS);   // not the same object (safe to mutate)
});
