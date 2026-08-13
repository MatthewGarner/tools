import assert from 'node:assert/strict';
import {test} from 'node:test';

import {encodeHash} from '../../assets/series.js';
import {assertInteractionCases} from '../../dev/interaction-budget.mjs';
import {treeLayout} from '../layout-tree.js';
import {decisionImpactProjection, overviewProjection} from '../overview.js';
import {parse} from '../parse.js';
import {project} from '../project.js';
import {renderConditions} from '../render-conditions.js';
import {renderOverview} from '../render-overview.js';
import {renderPlans} from '../render-plans.js';
import {renderQuestionLens} from '../render-question-lens.js';
import {renderTree} from '../render-tree.js';
import {treeProjection} from '../tree.js';
import {PATHS_INTERACTION_CASES} from './fixtures/interaction-budget.mjs';

const TODAY = '2026-08-13';
const measure = text => String(text ?? '').length * 7;
const colors = {
  bg:'#FBFBFA', card:'#F4F4F1', surface:'#F4F4F1', ink:'#111111', muted:'#6B6B68',
  border:'#D9D9D5', line:'#D9D9D5', accent:'#1F4FD8', accentInk:'#1A44C2',
  err:'#B3403A', status:{done:'#1D7A3E', doing:'#0C7FAE', risk:'#9A6A00', blocked:'#B3403A'},
};

function prepare(text){
  const model = parse(text);
  const projection = project(model, TODAY);
  const overview = overviewProjection(projection);
  const selectedKey = overview.initialSelection?.key || overview.decisions?.[0]?.key || null;
  const impact = selectedKey ? decisionImpactProjection(model, projection, selectedKey) : null;
  return {model, projection, overview, selectedKey, impact};
}

function ctx(state, interactive = true){
  return {colors, measure, width:1160, today:TODAY, projection:state.projection,
    selectedKey:state.selectedKey, impact:state.impact, interactive};
}

function renderLens(state, lens, interactive = true){
  const context = ctx(state, interactive);
  if(lens === 'brief') return renderOverview(state.overview, context);
  if(lens === 'question') return renderQuestionLens(state.overview, context);
  if(lens === 'conditions') return renderConditions(state.overview, context);
  if(lens === 'plans') return renderPlans(state.projection, context);
  if(lens === 'tree'){
    const topology = treeProjection(state.projection);
    return renderTree(topology, treeLayout(topology, {width:1160, measure}), context);
  }
  throw new Error(`unknown Paths lens: ${lens}`);
}

const assertSvg = value => assert.match(value, /^<svg[\s>]/);

test('paths render-compute budget: first parse → project → render under 100ms', async () => {
  const results = await assertInteractionCases({
    name:'paths render-compute first render', budgetMs:100, cases:PATHS_INTERACTION_CASES,
    run:entry => renderLens(prepare(entry.text), 'brief'),
  });
  for(const result of results) assertSvg(result.value);
});

test('paths render-compute budget: edited text → reproject → render under 100ms', async () => {
  const results = await assertInteractionCases({
    name:'paths render-compute edited text', budgetMs:100, cases:PATHS_INTERACTION_CASES,
    run:entry => renderLens(prepare(entry.editedText), 'brief'),
  });
  for(const result of results) assertSvg(result.value);
});

test('paths render-compute budget: construct all five lenses under 200ms', async () => {
  const prepared = PATHS_INTERACTION_CASES.map(entry => ({...entry, state:prepare(entry.text)}));
  const results = await assertInteractionCases({
    name:'paths render-compute all lenses', budgetMs:200, cases:prepared,
    run:entry => ['brief', 'question', 'conditions', 'plans', 'tree']
      .map(lens => renderLens(entry.state, lens)).join(''),
  });
  for(const result of results) assert.equal((result.value.match(/<svg/g) || []).length, 5);
});

test('paths render-compute budget: construct static exports for all five lenses under 200ms', async () => {
  const prepared = PATHS_INTERACTION_CASES.map(entry => ({...entry, state:prepare(entry.text)}));
  const results = await assertInteractionCases({
    name:'paths render-compute exports', budgetMs:200, cases:prepared,
    run:entry => ['brief', 'question', 'conditions', 'plans', 'tree']
      .map(lens => renderLens(entry.state, lens, false)).join(''),
  });
  for(const result of results){
    assert.equal((result.value.match(/<svg/g) || []).length, 5);
    assert.doesNotMatch(result.value, /role="button"|tabindex="0"|data-edit=/);
  }
});

test('paths URL encode compute budget: realistic and hostile documents under 40ms', async () => {
  const results = await assertInteractionCases({
    name:'paths URL encode', budgetMs:40, cases:PATHS_INTERACTION_CASES,
    run:entry => encodeHash({t:entry.text}),
  });
  for(const result of results){
    assert.match(result.value, /^z:/);
    assert.ok(result.value.length < 6000, 'fixture remains representable in the URL');
  }
});
