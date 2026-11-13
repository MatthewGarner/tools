/* Swiss 6c: the verdict's ONE key figure — the clearing price, which the
   headline clause quotes as the first £ in the line. */
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {dispatch} from '../engine.js';
import {buildStack} from '../stack.js';
import {buildVerdict, buildVerdictParts} from '../render.js';
import {paramsFor, WORLDS} from '../scenarios.js';

const run = (world, condition, demand) => {
  const params = paramsFor(world, condition);
  const cs = {generators: buildStack(params, WORLDS[world].catalogue), demand: demand ?? params.demand};
  return {cs, result: dispatch(cs.generators, cs.demand)};
};

test('the line is exactly what buildVerdict has always returned', () => {
  const {cs, result} = run('gbToday', null);
  assert.equal(buildVerdictParts(result, cs).line, buildVerdict(result, cs));
});

test('no demand ⇒ no marginal plant, so no figure to ink', () => {
  const {cs, result} = run('gbToday', null, 0);
  assert.equal(buildVerdictParts(result, cs).fig, '');
});

test('the figure is the clearing price, verbatim, and the line’s first £', () => {
  for(const [world, condition] of [['gbToday', null], ['gbToday', 'gasSpike'],
                                   ['he', 'coldPeak'], ['ht', 'windy']]){
    const {cs, result} = run(world, condition);
    const {line, fig} = buildVerdictParts(result, cs);
    assert.equal(fig, '£' + Math.round(result.clearingPrice) + '/MWh');
    assert.ok(line.includes(fig), 'verbatim: ' + fig + ' / ' + line);
    assert.equal(line.indexOf(fig), line.indexOf('£'),
      'the clearing price is the first £ quoted: ' + line);
  }
});

test('unmet demand ⇒ no clearing price, so no figure to ink (F-MO-5)', () => {
  // Hydrogen Evolution's cold-peak demand (63 GW) on the GB-today fleet: 6+ GW short
  const params = paramsFor('he', 'coldPeak');
  const cs = {generators: buildStack(params), demand: params.demand};
  const result = dispatch(cs.generators, cs.demand);
  assert.ok(result.unmet > 1);
  assert.equal(buildVerdictParts(result, cs).fig, '');
});
