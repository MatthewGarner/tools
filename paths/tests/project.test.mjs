import assert from 'node:assert/strict';
import test from 'node:test';

import {parse} from '../parse.js';
import {project} from '../project.js';

test('the consumer projection supplies reach for every decision and a numeric denominator', () => {
  const projection = project(parse(`decision groups:\n  question: groups?\n  signal: signal\n  owner: owner\n  answer-by: 2026-12-15\ndecision pricing:\n  question: pricing?\n  signal: signal\n  owner: owner\n  answer-by: 2026-12-20\nNOW\n  Core: Shared\n  Core: Group work [if groups]\n  Core: Pricing work [if pricing]`), '2026-12-01');

  assert.ok(projection.decisions.length > 0);
  for(const decision of projection.decisions){
    assert.equal(typeof decision.reach, 'number', `${decision.key} reach`);
  }
  assert.equal(typeof projection.reachDenominator, 'number');
  assert.equal(projection.reachDenominator, 3);
});
