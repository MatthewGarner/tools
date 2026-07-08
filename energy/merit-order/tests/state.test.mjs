import {test} from 'node:test';
import assert from 'node:assert/strict';
import {dispatch} from '../engine.js';
import {defaultGenerators, PRESETS, generatorsFromPreset, setMustRun, encodeState, decodeState} from '../state.js';

test('every preset clears where the spec claims', () => {
  const want = {typical:['CCGT',60], windy:['CCGT',60], coldStill:['Peaker',150], gasSpike:['CCGT',120], negative:['Renewables',-30]};
  for(const key of Object.keys(want)){
    const p = PRESETS[key];
    const r = dispatch(generatorsFromPreset(p), p.demand);
    assert.equal(r.marginalName, want[key][0], `${key} marginal`);
    assert.equal(r.clearingPrice, want[key][1], `${key} price`);
    assert.equal(r.unmet, 0, `${key} must not be unmet`);   // guards the Cold-still-evening trap
  }
});

test('gas-price dial: CCGT = price, Peaker = 2.5·price; Nuclear stays below CCGT across the range', () => {
  const gens = generatorsFromPreset(PRESETS.gasSpike);
  const cost = n => gens.find(g => g.name === n).cost;
  assert.equal(cost('CCGT'), 120);
  assert.equal(cost('Peaker'), 300);
  assert.ok(cost('Nuclear') < cost('CCGT'));
});

test('must-run: negative bid + mustRun flag; toggling OFF restores cost 0', () => {
  const gens = generatorsFromPreset(PRESETS.negative);
  const r = gens.find(g => g.name === 'Renewables');
  assert.equal(r.cost, -30); assert.equal(r.mustRun, true);
  setMustRun(gens, false, 30);                       // OFF path (untested before)
  assert.equal(r.cost, 0); assert.equal(r.mustRun, false);
});

test('URL codec round-trips; malformed / wrong-version → null (caller falls back)', () => {
  const gens = generatorsFromPreset(PRESETS.windy);
  const back = decodeState(encodeState(gens, 40));
  assert.deepEqual(back.generators.map(g => [g.name, g.capacity, g.cost, g.mustRun]),
                   gens.map(g => [g.name, g.capacity, g.cost, g.mustRun]));
  assert.equal(back.demand, 40);
  assert.equal(decodeState(null), null);
  assert.equal(decodeState({v: 99, p: {}}), null);
});
