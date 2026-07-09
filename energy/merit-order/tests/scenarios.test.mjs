import {test} from 'node:test';
import assert from 'node:assert/strict';
import {DEFAULT_PARAMS, CONDITIONS, paramsFor, WORLDS} from '../scenarios.js';
import {buildStack} from '../stack.js';
import {dispatch} from '../engine.js';

const clear = (world, condition) => {
  const p = paramsFor(world, condition);
  return dispatch(buildStack(p, WORLDS[world].catalogue), p.demand);
};

test('every world default clears at its story unit, never unmet', () => {
  const want = {gbToday:['CCGT 60%',83], ht:['Nuclear',5], ee:['BESS',47], he:['BESS',47], fb:['CCGT 60%',83]};
  for(const w of Object.keys(want)){
    const r = clear(w, null);
    assert.equal(r.marginalName, want[w][0], `${w} default marginal`);
    assert.equal(Math.round(r.clearingPrice), want[w][1], `${w} default price`);
    assert.equal(r.unmet, 0, `${w} default unmet`);
  }
});

test('cold peak — net-zero worlds priced by hydrogen, fossil/electric by gas peakers', () => {
  const want = {ht:['Hydrogen',200], he:['Hydrogen',200], ee:['OCGT 36%',139], fb:['OCGT 36%',139]};
  for(const w of Object.keys(want)){
    const r = clear(w, 'coldPeak');
    assert.equal(r.marginalName, want[w][0], `${w} coldpeak marginal`);
    assert.equal(Math.round(r.clearingPrice), want[w][1], `${w} coldpeak price`);
    assert.equal(r.unmet, 0, `${w} coldpeak unmet`);
    assert.notEqual(r.marginalName, 'Gas-CCS', `${w} must not land on the CCS trap`);
  }
});

test('GB-today conditions unchanged under the (world, condition) signature', () => {
  const want = {windy:['Nuclear',5], coldPeak:['CCGT 49%',101], gasSpike:['CCGT 60%',177], negative:['Wind',-30]};
  for(const key of Object.keys(want)){
    const r = clear('gbToday', key);
    assert.equal(r.marginalName, want[key][0], `${key} marginal`);
    assert.equal(Math.round(r.clearingPrice), want[key][1], `${key} price`);
    assert.equal(r.unmet, 0, `${key} unmet`);
  }
});

test('gas spike: storage earns a fat spread (rent > £100/MWh dispatched)', () => {
  const p = paramsFor('gbToday', 'gasSpike');
  const r = dispatch(buildStack(p, WORLDS.gbToday.catalogue), p.demand);
  const bess = r.perPlant['BESS'];
  assert.ok(bess.rent / bess.dispatchedMW > 100, 'spread balloons at spike');
});

test('coldPeak resolves demand from the world coldPeakDemand + pins imports 5; unknown world → gbToday', () => {
  for(const w of ['ht','ee','he','fb','gbToday']){
    const p = paramsFor(w, 'coldPeak');
    assert.equal(p.demand, WORLDS[w].params.coldPeakDemand);
    assert.equal(p.imports, 5);
  }
  assert.deepEqual(paramsFor('nonsense', null), paramsFor('gbToday', null));
});

test('every world: demandMax ≥ typical demand and ≥ coldPeakDemand', () => {
  for(const w of Object.keys(WORLDS)){
    const p = WORLDS[w].params;
    assert.ok(p.demandMax >= p.demand, `${w} demandMax≥demand`);
    assert.ok(p.demandMax >= p.coldPeakDemand, `${w} demandMax≥coldPeakDemand`);
  }
});

test('CCS dispatch-order crossover: at carbon 80, Gas-CCS sits below fleet CCGT-54 in the HT stack', () => {
  const g = buildStack({...WORLDS.ht.params, carbon: 80}, WORLDS.ht.catalogue);
  const cost = n => g.find(x => x.name === n).cost;
  assert.ok(cost('Gas-CCS') < cost('CCGT 54%'), 'CCS below fleet gas at high carbon');
  assert.ok(cost('Gas-CCS') > cost('CCGT 60%'), 'but not yet below the best gas at £80');
});
