import {test} from 'node:test';
import assert from 'node:assert/strict';
import {parse} from '../parse.js';
import {evaluate} from '../engine.js';
import {decisionComparisonProjection} from '../comparison.js';

test('comparison projection preserves every root option in source order and pairs each against the recommendation', () => {
  const model = parse('Root\n  First: 0\n  Recommended: 100\n  Closest: 90');
  const results = evaluate(model);
  const projection = decisionComparisonProjection(model, results);
  assert.deepEqual(projection.options.map(option => option.label), ['First', 'Recommended', 'Closest']);
  assert.equal(projection.options[1].recommended, true);
  assert.equal(projection.options[1].winRateVsRecommendation, null, 'recommendation is the reference, not compared with itself');
  for(const option of [projection.options[0], projection.options[2]]){
    const pair = results.headToHead.find(row =>
      (row.aNode === option.node && row.bNode === projection.recommendation) ||
      (row.bNode === option.node && row.aNode === projection.recommendation));
    const expected = pair.aNode === option.node ? pair.aShare : 1 - pair.aShare;
    assert.equal(option.winRateVsRecommendation, expected, option.label + ' keeps its own paired rate');
  }
  for(const option of projection.options) assert.ok(option.stats && Number.isFinite(option.stats.mean));
});

test('comparison projection carries compact, path-qualified chance-input provenance', () => {
  const model = parse('Root\n  Pilot\n    Demand\n      Strong (p=0.4): 100\n      Weak (p=rest): 0\n  Hold: 20');
  const projection = decisionComparisonProjection(model, evaluate(model));
  assert.deepEqual(projection.options[0].chanceInputs.map(input => input.label), [
    'Demand › Strong', 'Demand › Weak',
  ]);
  assert.deepEqual(projection.options[0].chanceInputs.map(input => input.authored), ['p=0.4', 'rest']);
  assert.deepEqual(projection.options[1].chanceInputs, []);
});

test('closest flip says whether its threshold is inside the authored 90% range', () => {
  const outside = parse('Root\n  Bid: -150k\n    Outcome\n      Win (p=0.3-0.45): 2M\n      Lose (p=rest): 0\n  Hold: 0');
  const out = decisionComparisonProjection(outside, evaluate(outside)).closestFlip;
  assert.equal(out.kind, 'prob');
  assert.equal(out.label, 'Win');
  assert.equal(out.insideAuthoredRange, false);

  const inside = parse('Root\n  Bid: -150k\n    Outcome\n      Win (p=0.05-0.15): 2M\n      Lose (p=rest): 0\n  Hold: 0');
  assert.equal(decisionComparisonProjection(inside, evaluate(inside)).closestFlip.insideAuthoredRange, true);
});

test('midpoint sensitivity is explicitly separate when midpoint and Monte Carlo recommendations disagree', () => {
  const model = parse('Root\n  Risky\n    Big (p=0.5): 10M to 40M\n    Bust (p=rest): -5M\n  Safe: 9M');
  const projection = decisionComparisonProjection(model, evaluate(model));
  assert.equal(projection.recommendation.label, 'Safe');
  assert.equal(projection.midpointRecommendation.label, 'Risky');
  assert.equal(projection.modelDisagreement, true);
  assert.equal(projection.closestFlip.story, 'midpoint');
});
