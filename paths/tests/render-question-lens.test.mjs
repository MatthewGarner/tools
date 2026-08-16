import assert from 'node:assert/strict';
import {test} from 'node:test';

import {parse} from '../parse.js';
import {project} from '../project.js';
import {decisionImpactProjection, overviewProjection} from '../overview.js';
import {renderQuestionLens, renderQuestionLensNarrow} from '../render-question-lens.js';

const measure = text => String(text).length * 7;
const colors = {
  bg:'#FBFBFA', card:'#F4F4F1', ink:'#111111', muted:'#6B6B68', border:'#D9D9D5',
  accent:'#1F4FD8', accentInk:'#1A44C2', err:'#B3403A',
};
const decision = (name, fields = '') => `decision ${name}:\n  question: Should we pursue ${name}?\n` +
  `  signal: measurable ${name}\n  reading: current ${name}\n  owner: ${name} owner\n` +
  `  answer-by: 2026-08-20${fields}\n`;

function fixture(extra = ''){
  const doc = 'title: Lantern choices\ndate: 2026-08-11\n' +
    decision('pricing', '\n  assume: yes 2026-08-01') + decision('groups') + decision('retention') +
    decision('expansion', '\n  when: pricing and groups') +
    'NOW\n  Core: Shared foundation\n  Growth: Revenue offer [if pricing]\n' +
    '  Growth: Fixed fee route [unless pricing]\n' +
    'NEXT\n  Core: Joint launch [if pricing and groups]\n' +
    '  Growth: Either experiment [if pricing or retention]\n' +
    'LATER\n  Core: Historical pilot [unless pricing] [done]\n' + extra;
  const model = parse(doc);
  const projected = project(model, '2026-08-22');
  return {model, projected, overview:overviewProjection(projected),
    impact:decisionImpactProjection(model, projected, 'pricing')};
}

function context(extra = {}){
  const {overview, impact} = fixture();
  return {overview, ctx:{colors, measure, width:1160, selectedKey:'pricing', impact, ...extra}};
}

test('question lens leads with the selected decision receipt and two explicit outcomes', () => {
  const {overview, ctx} = context();
  const svg = renderQuestionLens(overview, ctx);
  assert.match(svg, /data-kind="question-lens"/);

  assert.match(svg, /data-kind="question-receipt" data-decision-key="pricing"/);
  for(const copy of ['Should we pursue pricing?', 'measurable pricing', 'current pricing',
    'pricing owner', '2026-08-20', 'Working to the assumption Pricing = yes'])
    assert.match(svg, new RegExp(copy));
  assert.match(svg, /data-kind="question-outcome" data-outcome="yes"/);
  assert.match(svg, /data-kind="question-outcome" data-outcome="no"/);
  assert.match(svg, />IF YES<\/text>/);
  assert.match(svg, />IF NO<\/text>/);
  assert.doesNotMatch(svg, /dependency-route|decision-output|LEGEND/);
});

test('both outcomes preserve authored place and write complete simple, AND, OR and negative conditions', () => {
  const {overview, ctx} = context();
  const svg = renderQuestionLens(overview, ctx);

  for(const copy of ['NOW · Growth', 'NEXT · Core', 'NEXT · Growth',
    'IF Pricing = YES', 'IF Pricing = NO',
    'ONLY IF Pricing = YES AND Groups = YES',
    'IF EITHER Pricing = YES OR Retention = YES']) assert.match(svg, new RegExp(copy));
  for(const direction of ['yes', 'no']){
    const section = svg.slice(svg.indexOf(`data-kind="question-outcome" data-outcome="${direction}"`),
      svg.indexOf('</g>', svg.indexOf(`data-kind="question-outcome" data-outcome="${direction}"`)));
    assert.match(section, /data-kind="question-work-card"/);
  }
  assert.equal((svg.match(/<title>Revenue offer —/g) || []).length, 2,
    'the same affected item is compared once in each counterfactual outcome');
});

test('parallel questions are an unordered interactive register with 44px targets', () => {
  const {overview, ctx} = context({interactive:true});
  const svg = renderQuestionLens(overview, ctx);

  assert.match(svg, /PARALLEL QUESTIONS · NOT SEQUENCED/);
  assert.equal((svg.match(/data-kind="parallel-question"/g) || []).length, 4);
  assert.match(svg, /data-kind="parallel-question"[^>]*data-decision-key="pricing"[^>]*data-selected="true"/);
  assert.match(svg, /data-kind="parallel-question"[^>]*data-decision-key="groups"[^>]*data-select-decision=""/);
  assert.match(svg, /aria-pressed="false" tabindex="0" role="button"/);
  assert.doesNotMatch(svg, /data-sequence|>1<|>2<|>3</);
  const hits = [...svg.matchAll(/<rect data-hit=""[^>]*height="([\d.]+)"/g)];
  assert.equal(hits.length, 4);
  assert.ok(hits.every(hit => Number(hit[1]) >= 44));
});

test('a selected conditional question that is not open shows its complete prerequisite, not executable answer columns', () => {
  const doc = 'title: Conditional question\n' + decision('pricing', '\n  answer: yes 2026-08-11') +
    decision('groups') + decision('expansion', '\n  when: pricing and groups') +
    'NOW\n  Growth: Expansion offer [if expansion]\n  Core: Shared foundation';
  const model = parse(doc), projected = project(model, '2026-08-11');
  const overview = overviewProjection(projected);
  const impact = decisionImpactProjection(model, projected, 'expansion');
  for(const svg of [
    renderQuestionLens(overview, {colors, measure, width:1160, selectedKey:'expansion', impact}),
    renderQuestionLensNarrow(overview, {colors, measure, width:390, selectedKey:'expansion', impact}),
  ]){
    assert.match(svg, /data-kind="question-prerequisite-barrier" data-availability="dormant"/);
    assert.match(svg, /NOT OPEN YET/);
    assert.match(svg, /OPENS ONLY IF Pricing = YES AND Groups = YES/);
    assert.match(svg, /This question cannot be answered yet\. Answer/);
    assert.match(svg, /condition is satisfied\./);
    assert.doesNotMatch(svg, /data-kind="question-outcome"/);
    assert.doesNotMatch(svg, /data-kind="question-work-card"/);
    assert.doesNotMatch(svg, />IF YES<\/text>|>IF NO<\/text>/);
  }
});

test('history, excluded work, conditional questions and exact repair evidence remain visible', () => {
  const doc = 'title: Edge cases\n' + decision('pricing', '\n  answer: yes 2026-08-10') +
    decision('groups') + decision('expansion', '\n  when: pricing and groups') +
    'NOW\n  Core: Excluded route [unless pricing]\n' +
    '  Core: Historical route [unless pricing] [done]\n' +
    '  Core: Broken route [if pricing and missing]';
  const model = parse(doc), projected = project(model, '2026-08-11');
  const overview = overviewProjection(projected);
  const impact = decisionImpactProjection(model, projected, 'pricing');
  const svg = renderQuestionLens(overview, {colors, measure, width:1160, selectedKey:'pricing', impact});

  assert.match(svg, /data-current-state="not-pursuing"/);
  assert.match(svg, /Not pursuing after Pricing = yes/);
  assert.match(svg, /data-kind="question-history"/);
  assert.match(svg, /Historical route/);
  assert.match(svg, /data-kind="question-changes" data-outcome="yes"/);
  assert.match(svg, /Should we pursue expansion\?/);
  assert.match(svg, /OPENS ONLY IF Pricing = YES AND Groups = YES/);
  assert.match(svg, /data-kind="question-model-health"/);
  assert.match(svg, /no decision named &quot;missing&quot;/);
});

test('narrow lens stacks full-width outcomes and remains accessible and XML-safe', () => {
  const hostile = '<script>alert(1)</script> & "quoted"';
  const doc = 'title: ' + hostile + '\n' + decision('pricing') +
    'NOW\n  Lane: ' + hostile + ' [if pricing]';
  const model = parse(doc), projected = project(model, '2026-08-11');
  const overview = overviewProjection(projected);
  const impact = decisionImpactProjection(model, projected, 'pricing');
  const svg = renderQuestionLensNarrow(overview,
    {colors, measure, width:390, selectedKey:'pricing', impact});

  assert.match(svg, /width="390"/);
  assert.match(svg, /data-kind="question-lens-narrow"/);
  assert.match(svg, /data-layout="stacked"/);
  assert.match(svg, /role="img" aria-labelledby="paths-question-lens-name paths-question-lens-description"/);
  assert.match(svg, /<title id="paths-question-lens-name">/);
  assert.match(svg, /<desc id="paths-question-lens-description">/);
  assert.doesNotMatch(svg, /<script>/i);
  assert.match(svg, /&lt;script&gt;/);
  assert.doesNotMatch(svg, /NaN|Infinity|undefined/);
});

test('empty question lens gives direction instead of an empty receipt', () => {
  const overview = overviewProjection(project(parse('NOW\n  Core: Shared route'), '2026-08-11'));
  const svg = renderQuestionLens(overview, {colors, measure, width:1160});
  assert.match(svg, /No questions authored yet/);
  assert.doesNotMatch(svg, /data-kind="question-receipt"/);
});
