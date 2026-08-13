import {test} from 'node:test';
import assert from 'node:assert/strict';
import {parse as parsePaths} from '../paths/parse.js';
import {inspectRoadmapProjection, projectionAcceptance, buildRoadmapProjection} from '../paths/handoff-roadmap.js';
import {parse as parseRoadmap} from '../roadmap/parse.js';
import {PATHS_SEMANTIC_STRESS} from '../paths/tests/fixtures/semantic-stress.mjs';
import {parse as parseGauge} from '../gauge/parse.js';
import {sessionStats} from '../gauge/engine.js';
import {fermiHandoff, fermiHandoffIssue} from '../gauge/handoff.js';
import {unpackScen} from '../fermi/state.js';
import {GAUGE_FERMI_PROVENANCE_STRESS} from './semantic-stress.mjs';

test('the canonical Paths stress corpus preserves truth or refuses without a partial delivery projection', () => {
  for(const scenario of PATHS_SEMANTIC_STRESS){
    const source = parsePaths(scenario.text);
    const inspected = inspectRoadmapProjection(source, '2026-08-12', scenario.answers);
    if(scenario.refusal){
      assert.equal(inspected.ok, false, scenario.id);
      assert.equal(inspected.code, scenario.refusal, scenario.id);
      assert.equal(Object.hasOwn(inspected, 'text'), false, scenario.id);
      continue;
    }
    assert.equal(inspected.ok, true, scenario.id);
    assert.deepEqual({known:inspected.receipt.known, assumed:inspected.receipt.assumed}, scenario.receipt, scenario.id);
    if(scenario.omitted) assert.equal(inspected.receipt.omitted[0]?.key, scenario.omitted, scenario.id);
    const built = buildRoadmapProjection(source, '2026-08-12', scenario.answers, projectionAcceptance(inspected));
    assert.equal(built.ok, true, scenario.id);
    const target = parseRoadmap(built.text);
    assert.equal(target.warnings.length, 0, scenario.id);
    assert.deepEqual({known:target.basis.answered, assumed:target.basis.assumed}, scenario.receipt, scenario.id);
    const selected = target.items.map(item => item.title);
    assert.deepEqual(selected, scenario.targetItems, scenario.id + ': exact selected target work');
    for(const absent of scenario.absentItems || [])
      assert.equal(selected.includes(absent), false, scenario.id + ': must omit ' + absent);
  }
});

test('a Gauge room aggregate remains review-needed and malformed provenance transfers fail closed', () => {
  const gauge = parseGauge('Weeks to migrate :: range weeks');
  const state = unpackScen(fermiHandoff(gauge, sessionStats(gauge, [{values:[[4, 8]]}])));
  assert.equal(state.vars.get('weeks_to_migrate').base.status, 'needs-restatement');
  assert.equal(state.vars.get('weeks_to_migrate').base.pooling, 'envelope');

  for(const scenario of GAUGE_FERMI_PROVENANCE_STRESS){
    const malformed = parseGauge(scenario.source);
    assert.equal(fermiHandoff(malformed, sessionStats(malformed, [{values:[[4, 8]]}])), null, scenario.id);
    assert.match(fermiHandoffIssue(malformed), scenario.issue, scenario.id);
  }
});
