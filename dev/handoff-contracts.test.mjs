import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync, readdirSync} from 'node:fs';
import {HANDOFF_CONTRACTS, HANDOFF_SOURCE_MANIFEST, REQUIRED_CONTRACT_FIELDS, contractValidationErrors} from './handoff-contracts.mjs';
import {parse as parseMap} from '../map/parse.js';
import {resolve as resolveMap} from '../map/zones.js';
import {readout as mapReadout} from '../map/readout.js';
import {gaugeHandoff} from '../map/handoff.js';
import {parse as parseGauge} from '../gauge/parse.js';
import {sessionStats} from '../gauge/engine.js';
import {fermiHandoff} from '../gauge/handoff.js';
import {unpackScen} from '../fermi/state.js';
import {parse as parseTimeline, parseDate} from '../timeline/parse.js';
import {premortemHandoff} from '../timeline/handoff.js';
import {toLink, fromLink} from '../premortem/store.js';
import {parse as parseRoadmap} from '../roadmap/parse.js';
import {roadmapToPathsStarter} from '../roadmap/handoff-paths.js';
import {parse as parsePaths} from '../paths/parse.js';
import {inspectRoadmapProjection, projectionAcceptance, buildRoadmapProjection} from '../paths/handoff-roadmap.js';

function assertDeepFrozen(value, seen = new Set()){
  if(value == null || typeof value !== 'object' || seen.has(value)) return;
  seen.add(value); assert.equal(Object.isFrozen(value), true);
  for(const key of Reflect.ownKeys(value)) assertDeepFrozen(value[key], seen);
}

test('every visible handoff has one complete, immutable contract and real test evidence', () => {
  assert.equal(new Set(HANDOFF_CONTRACTS.map(contract => contract.id)).size, HANDOFF_CONTRACTS.length);
  assertDeepFrozen(HANDOFF_CONTRACTS);
  for(const contract of HANDOFF_CONTRACTS){
    for(const field of REQUIRED_CONTRACT_FIELDS) assert.ok(contract[field], `${contract.id} needs ${field}`);
    assert.deepEqual(contractValidationErrors(contract), [], contract.id);
    assert.ok(readFileSync(new URL('../' + contract.evidence, import.meta.url), 'utf8').length > 0,
      `${contract.id} evidence must remain present`);
  }
});

function attribute(tag, name){
  return tag.match(new RegExp(`\\b${name}="([^"]+)"`))?.[1] || null;
}

function discoveredVisibleHandoffs(){
  const root = new URL('../', import.meta.url);
  const found = [];
  for(const entry of readdirSync(root)){
    const html = new URL(`../${entry}/index.html`, import.meta.url);
    try{
      const source = readFileSync(html, 'utf8');
      for(const tag of source.matchAll(/<button\b[^>]*>/g)){
        const contractId = attribute(tag[0], 'data-handoff-contract');
        if(contractId) found.push({contractId, sourceActionId: attribute(tag[0], 'id'), sourceFile: `${entry}/index.html`});
      }
    }catch{}
    const app = new URL(`../${entry}/app.js`, import.meta.url);
    try{
      const source = readFileSync(app, 'utf8');
      for(const match of source.matchAll(/([A-Za-z_$][\w$]*)\.id = '([^']+)';[^\n]*?\1\.dataset\.handoffContract = '([^']+)'/g)){
        found.push({contractId: match[3], sourceActionId: match[2], sourceFile: `${entry}/app.js`});
      }
    }catch{}
  }
  return found.sort((a, b) => a.contractId.localeCompare(b.contractId));
}

/* Discover egress from executable source, not from an attribute which a future
 * author could omit. `handoffHref()` is the shared URL-local handoff route;
 * Timeline deliberately uses its target's codec then assigns location.href.
 * Either form is a cross-tool egress that must earn exactly one contract. */
function discoveredHandoffEgresses(){
  const root = new URL('../', import.meta.url);
  const found = [];
  for(const entry of readdirSync(root)){
    const files = [`${entry}/app.js`, ...(entry === 'gauge' ? ['gauge/session.js'] : [])];
    for(const file of files){
      let source;
      try{ source = readFileSync(new URL('../' + file, import.meta.url), 'utf8'); }catch{ continue; }
      for(const match of source.matchAll(/handoffHref\(\s*['"]\/([a-z0-9-]+)\//g))
        found.push({source:entry, target:match[1], sourceFile:file});
      for(const match of source.matchAll(/location\.href\s*=\s*['"]\/([a-z0-9-]+)\//g))
        found.push({source:entry, target:match[1], sourceFile:file});
    }
  }
  return found.sort((a, b) => `${a.source}\0${a.target}\0${a.sourceFile}`
    .localeCompare(`${b.source}\0${b.target}\0${b.sourceFile}`));
}

function routeEndpoints(route){
  const match = /^\/([a-z-]+)\/ → \/([a-z-]+)\/$/.exec(route || '');
  return match ? {source:match[1], target:match[2]} : null;
}

test('the independently discovered source controls bind every active UI handoff to exactly one contract', () => {
  assertDeepFrozen(HANDOFF_SOURCE_MANIFEST);
  const expected = HANDOFF_SOURCE_MANIFEST.map(({contractId, sourceActionId, sourceFile}) =>
    ({contractId, sourceActionId, sourceFile})).sort((a, b) => a.contractId.localeCompare(b.contractId));
  assert.deepEqual(discoveredVisibleHandoffs(), expected,
    'every marked source control must have one manifest entry, and vice versa');
  assert.deepEqual(HANDOFF_SOURCE_MANIFEST.map(entry => entry.contractId).sort(),
    HANDOFF_CONTRACTS.map(contract => contract.id).sort(),
    'every contract needs one visible source control, and every source control needs one contract');
  for(const entry of HANDOFF_SOURCE_MANIFEST){
    const source = readFileSync(new URL('../' + entry.launchFile, import.meta.url), 'utf8');
    assert.ok(source.includes(entry.launchMarker),
      `${entry.contractId}: ${entry.launchFile} no longer contains ${entry.launchMarker}`);
  }
});

test('actual cross-tool egress is one-to-one with the contract routes', () => {
  const expected = HANDOFF_CONTRACTS.map(contract => ({...routeEndpoints(contract.route)}))
    .map(endpoint => ({...endpoint, sourceFile: endpoint.source === 'gauge'
      ? 'gauge/session.js' : `${endpoint.source}/app.js`}))
    .sort((a, b) => `${a.source}\0${a.target}\0${a.sourceFile}`
      .localeCompare(`${b.source}\0${b.target}\0${b.sourceFile}`));
  assert.deepEqual(discoveredHandoffEgresses(), expected,
    'a newly authored handoffHref/direct cross-tool navigation must add a contract before it can ship');
});

test('Map to Gauge keeps propositions as room priors, not evidence', () => {
  const map = parseMap('preset: assumptions\nDaily use @ 20,80');
  const target = parseGauge(gaugeHandoff(map, mapReadout(map, resolveMap(map))));
  assert.equal(target.questions[0].text, 'Daily use');
  assert.equal(target.questions[0].type, 'prob');
});

test('Gauge to Fermi lands review-needed, with no invented formula', () => {
  const gauge = parseGauge('Weeks to migrate :: range weeks');
  const target = unpackScen(fermiHandoff(gauge, sessionStats(gauge, [{values:[[4, 8]]}])));
  assert.equal(target.f, '');
  assert.equal(target.vars.get('weeks_to_migrate').base.status, 'needs-restatement');
  assert.equal(target.vars.get('weeks_to_migrate').base.pooling, 'envelope');
});

test('Timeline to Premortem is a separate, target-codec draft', async () => {
  const source = parseTimeline('title: Habitat launch\nApp: Cut 2026-09 .. 2026-10\nMarketing: Review 2026-10 .. 2026-11');
  const draft = premortemHandoff(source, parseDate('2026-08-01'));
  const target = await fromLink(await toLink(draft));
  assert.equal(target.id === 'handoff', false);
  assert.match(target.question, /slipped\. Why\?$/);
});

test('Roadmap to Paths never invents decision fields', () => {
  const source = parseRoadmap('title: Habitat\nNow\nCore: Pilot [bet: price]\nNext\nCore: Expansion [if price]');
  const target = parsePaths(roadmapToPathsStarter(source));
  assert.equal(target.decisions.length, 1);
  assert.deepEqual(target.warnings.map(warning => warning.code),
    ['missing-question', 'missing-signal', 'missing-owner', 'missing-due-date']);
  assert.equal(target.decisions[0].learn, null);
  assert.equal(target.decisions[0].enough, null);
});

test('Paths to Roadmap needs an exact, accepted basis and removes branch syntax', () => {
  const source = parsePaths(`title: Habitat\ndecision price:\n  question: Is price viable?\n  signal: pilot\n  owner: Alex\n  answer-by: 2026-08-10\nNow\n  Core: Foundation\nNext\n  Growth: Expansion [if price]`);
  const inspected = inspectRoadmapProjection(source, '2026-08-12', {price:'yes'});
  assert.equal(inspected.ok, true);
  assert.equal(buildRoadmapProjection(source, '2026-08-12', {price:'yes'}).code, 'assumptions-not-accepted');
  const target = parseRoadmap(buildRoadmapProjection(source, '2026-08-12', {price:'yes'}, projectionAcceptance(inspected)).text);
  assert.equal(target.basis.assumed[0].key, 'price');
  assert.equal(target.items.some(item => item.cond), false);
});
