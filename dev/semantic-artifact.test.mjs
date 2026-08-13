import assert from 'node:assert/strict';
import {test} from 'node:test';

import {parse as parsePaths} from '../paths/parse.js';
import {project} from '../paths/project.js';
import {decisionImpactProjection, overviewProjection} from '../paths/overview.js';
import {renderOverview, renderOverviewNarrow} from '../paths/render-overview.js';
import {renderQuestionLens, renderQuestionLensNarrow} from '../paths/render-question-lens.js';
import {renderConditions, renderConditionsNarrow} from '../paths/render-conditions.js';
import {collectVars, computeSensitivity, parse as parseFermi, simulateModel,
  tokenize} from '../fermi/engine.js';
import {renderDriverTree} from '../fermi/render-driver.js';
import {quantile} from '../assets/series.js';
import {inspectSemanticArtifact} from './semantic-artifact.mjs';

const measure = text => String(text).length * 7;
const colors = {
  bg:'#FBFBFA', card:'#F4F4F1', ink:'#111111', muted:'#6B6B68', border:'#D9D9D5',
  accent:'#1F4FD8', accentInk:'#1A44C2', err:'#B3403A',
};
const VERDICT = 'Keep the shared foundation moving while pricing remains reversible.';
const pathsSource = `title: Habitat learning plan
date: 2026-08-13
verdict: ${VERDICT}
decision pricing:
  question: Will customers accept the revenue offer?
  signal: 6 of 10 customers accept
  reading: 3 of 10 accepted in pilot
  owner: Alex
  answer-by: 2026-08-20
decision groups:
  question: Will groups improve activation?
  signal: invitations per active user
  reading: 1.2 invitations per active user
  owner: Priya
  answer-by: 2026-08-27
decision expansion:
  question: Should we expand the offer?
  signal: pricing and groups both clear threshold
  reading: waiting on both trials
  owner: Jamie
  answer-by: 2026-09-10
  when: pricing and groups
NOW
  Core: Shared foundation
  Growth: Revenue offer [if pricing]
NEXT
  Growth: Joint invitation experiment [if pricing and groups]
  Core: Fixed fee alternative [unless pricing]
`;

function pathsFixture(){
  const model = parsePaths(pathsSource);
  const projection = project(model, '2026-08-13');
  const overview = overviewProjection(projection);
  const selectedKey = 'pricing';
  const impact = decisionImpactProjection(model, projection, selectedKey);
  return {overview, selectedKey, impact};
}

const pathsRenderers = [
  ['Brief', renderOverview, renderOverviewNarrow],
  ['Question lens', renderQuestionLens, renderQuestionLensNarrow],
  ['Conditions', renderConditions, renderConditionsNarrow],
];

test('Paths visual releases expose verdict, structured state and keyboard selection at desktop and phone widths', () => {
  const fixture = pathsFixture();
  for(const [name, wide, narrow] of pathsRenderers){
    for(const [size, render, width] of [['desktop', wide, 1160], ['phone', narrow, 390]]){
      const svg = render(fixture.overview, {colors, measure, width, interactive:true,
        selectedKey:fixture.selectedKey, impact:fixture.impact});
      const outline = inspectSemanticArtifact(svg);
      assert.equal(outline.rootRole, 'group', `${name} ${size} is an interactive semantic group`);
      assert.ok(outline.title.trim(), `${name} ${size} has a semantic title`);
      assert.match(outline.description, new RegExp(VERDICT.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')),
        `${name} ${size} description carries the verdict`);
      assert.match(outline.description, /Selected (?:decision|question) Pricing/i,
        `${name} ${size} identifies the selected decision`);
      assert.match(outline.description, /Unanswered/i,
        `${name} ${size} announces the selected decision state`);
      assert.ok(outline.controls.every(control => control.tabIndex === '0' && control.label &&
        (['true', 'false'].includes(control.pressed) || ['true', 'false'].includes(control.expanded))),
      `${name} ${size} controls are named keyboard buttons with announced state`);
      const decisions = outline.controls.filter(control => control.decisionKey);
      assert.ok(decisions.length >= 2 && decisions.every(control => control.selectable &&
        ['true', 'false'].includes(control.pressed)),
      `${name} ${size} exposes decision controls with pressed state`);
      const selected = decisions.filter(control => control.decisionKey === fixture.selectedKey &&
        control.pressed === 'true');
      assert.ok(selected.length >= 1, `${name} ${size} announces selection with aria-pressed`);
    }
  }
});

test('Paths static SVG exports keep the semantic outline and remove all live interaction markup', () => {
  const fixture = pathsFixture();
  for(const [name, wide, narrow] of pathsRenderers){
    for(const [size, render, width] of [['desktop', wide, 1160], ['phone', narrow, 390]]){
      const svg = render(fixture.overview, {colors, measure, width,
        selectedKey:fixture.selectedKey, impact:fixture.impact});
      const outline = inspectSemanticArtifact(svg);
      assert.equal(outline.rootRole, 'img', `${name} ${size} export is one static image`);
      assert.ok(outline.title.trim() && outline.description.trim(),
        `${name} ${size} export retains title and description`);
      assert.match(outline.description, new RegExp(VERDICT.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')),
        `${name} ${size} export retains the verdict`);
      assert.match(outline.description, /Selected (?:decision|question) Pricing/i,
        `${name} ${size} export retains the selected decision context`);
      assert.deepEqual(outline.liveInteractionMarkup, [],
        `${name} ${size} export contains no live interaction affordances`);
    }
  }
});

function driverFixture(){
  const ast = parseFermi(tokenize('customers * annual_value * conversion'));
  const varNames = collectVars(ast, []);
  const ranges = {customers:[800, 1200], annual_value:[90, 140], conversion:[0.08, 0.18]};
  const dists = Object.fromEntries(varNames.map(name => [name, 'auto']));
  const model = {ast, varNames, ranges, dists};
  const {sorted} = simulateModel(model, {seed:0x5EED, n:10000});
  const p10 = quantile(sorted, .1), p50 = quantile(sorted, .5), p90 = quantile(sorted, .9);
  const {sens, fullRatio} = computeSensitivity(model, {seed:0x5EED, p10, p90});
  return {...model, p10, p50, p90, sens, fullRatio, bases:{
    conversion:{kind:'gauge', label:'Customer panel', question:'What share converts?', unit:'%',
      round:2, responses:8, pooling:'envelope', status:'needs-restatement'},
  }};
}

test('Fermi Driver Tree exposes its verdict, numerical result and assumption basis as a static outline', () => {
  const svg = renderDriverTree(driverFixture(), {colors, measure});
  const outline = inspectSemanticArtifact(svg);
  assert.equal(outline.rootRole, 'img');
  assert.match(outline.title, /What drives the answer/);
  assert.match(outline.description, /Research .* first|No single input dominates/);
  assert.match(outline.description, /Outcome median .* P10 .* P90 .* spread/i);
  assert.match(outline.description, /Assumption sources/);
  assert.match(outline.description, /Gauge.*review needed/);
  assert.deepEqual(outline.liveInteractionMarkup, []);
});
