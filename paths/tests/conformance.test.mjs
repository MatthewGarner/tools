import {test} from 'node:test';
import assert from 'node:assert/strict';
import {parse as parsePaths} from '../parse.js';
import {project} from '../evaluate.js';
import {parse as parseRoadmap} from '../../roadmap/parse.js';
import {knownDifference, sharedCases} from './fixtures/conformance.mjs';

function normalizePaths(fixture){
  const model = project(parsePaths(fixture.pathsDoc), fixture.today);
  return {
    host:model.decisionByName[fixture.host].value,
    items:Object.fromEntries(Object.entries(fixture.itemIdentityMap).map(([identity, pair]) => {
      const item = model.items.find(candidate => candidate.identity === pair.paths);
      return [identity, item.itemState];
    })),
  };
}

function normalizeRoadmap(fixture){
  const model = parseRoadmap(fixture.roadmapDoc);
  const effective = model.bets[fixture.host].effective;
  const host = effective === 'won' ? 'true' : effective === 'unresolved' ? 'unknown' : 'false';
  const items = {};
  for(const [identity, pair] of Object.entries(fixture.itemIdentityMap)){
    const item = model.items.find(candidate => candidate.srcLine === pair.roadmap);
    items[identity] = item.worldState === 'dropped' ? 'not-needed'
      : item.worldState === 'cond' ? 'waiting' : 'in-plan';
  }
  return {host, items};
}

for(const fixture of sharedCases) test(`paired conformance: ${fixture.name}`, () => {
  const paths = normalizePaths(fixture);
  const roadmap = normalizeRoadmap(fixture);
  assert.deepEqual(paths, fixture.expect);
  assert.deepEqual(roadmap, fixture.expect);
  assert.deepEqual(paths, roadmap);
});

test('known divergence: /paths mootness beats the child written yes; /roadmap keeps its written outcome', () => {
  const paths = normalizePaths(knownDifference);
  const roadmap = normalizeRoadmap(knownDifference);
  assert.deepEqual(paths, knownDifference.expect.paths);
  assert.deepEqual(roadmap, knownDifference.expect.roadmap);
  assert.notDeepEqual(paths, roadmap);
});
