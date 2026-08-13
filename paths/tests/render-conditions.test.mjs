import assert from 'node:assert/strict';
import {test} from 'node:test';

import {parse} from '../parse.js';
import {project} from '../project.js';
import {overviewProjection} from '../overview.js';
import {renderConditions, renderConditionsNarrow} from '../render-conditions.js';

const measure = text => String(text).length * 7;
const colors = {
  bg:'#FBFBFA', card:'#F4F4F1', ink:'#111111', muted:'#6B6B68', border:'#D9D9D5',
  accent:'#1F4FD8', accentInk:'#1A44C2', err:'#B3403A',
};
const decision = (name, fields = '') => `decision ${name}:\n  question: Does ${name} hold?\n` +
  `  signal: measurable ${name}\n  reading: current ${name}\n  owner: ${name} owner\n` +
  `  answer-by: 2026-08-20${fields}\n`;

function view(doc, today = '2026-08-11'){
  return overviewProjection(project(parse(doc), today));
}

function wide(doc, extra = {}){
  return renderConditions(view(doc), {colors, measure, width:1160, ...extra});
}

test('atlas keeps work once in canonical period and lane groups against parallel decisions', () => {
  const svg = wide('title: Habitat choices\ndate: 2026-08-11\n' + decision('pricing') + decision('groups') +
    'NOW\n  Core: Shared\n  Growth: Price route [if pricing]\n' +
    'LATER\n  Core: Joint route [if pricing and groups]\n  Growth: Alternative [unless pricing]');

  assert.match(svg, /data-kind="conditions-atlas"/);
  assert.match(svg, /PARALLEL QUESTIONS/);
  assert.match(svg, /Columns do not imply sequence/);
  assert.equal((svg.match(/data-kind="conditions-decision-header"/g) || []).length, 2);
  assert.equal((svg.match(/data-kind="conditions-work-row"/g) || []).length, 4);
  assert.match(svg, /data-kind="conditions-period"><title>NOW/);
  assert.match(svg, /data-kind="conditions-lane"><title>Growth/);
  for(const title of ['Shared', 'Price route', 'Joint route', 'Alternative'])
    assert.equal((svg.match(new RegExp(`<title>${title} —`, 'g')) || []).length, 1);
  assert.match(svg, /data-min-readable-scale="0\.88"/);
  assert.doesNotMatch(svg, /<path\b/);
});

test('atlas keeps the authored verdict in-plane, including the narrow review surface', () => {
  const doc = 'verdict: Next action: run the pilot before expanding.\n' + decision('pricing') +
    'NOW\n  Core: Pilot [if pricing]';
  for(const svg of [wide(doc), renderConditionsNarrow(view(doc), {colors, measure, width:390})]){
    assert.match(svg, /CONDITIONS ATLAS/);
    assert.match(svg, /VERDICT/);
    assert.match(svg, /Next action: run the pilot before expanding\./);
  }
});

test('cells spell out direct YES and NO outcomes and compound ALL and ANY participation', () => {
  const svg = wide(decision('pricing') + decision('groups') + decision('retention') +
    'NOW\n  Core: Yes route [if pricing]\n  Core: No route [unless pricing]\n' +
    '  Core: Joint [if pricing and groups]\n  Core: Either [if pricing or retention]');

  assert.match(svg, /If Pricing = YES/);
  assert.match(svg, /If Pricing = NO/);
  assert.match(svg, /Only if Pricing = YES and Groups = YES/);
  assert.match(svg, /If either Pricing = YES or Retention = YES/);
  assert.match(svg, /data-decision-key="pricing" data-participation="direct" data-outcome="yes"/);
  assert.match(svg, /data-decision-key="pricing" data-participation="direct" data-outcome="no"/);
  assert.equal((svg.match(/data-participation="all"/g) || []).length, 2);
  assert.equal((svg.match(/data-participation="any"/g) || []).length, 2);
  assert.match(svg, />DIRECT<\/text>/);
  assert.match(svg, />ALL<\/text>/);
  assert.match(svg, />ANY<\/text>/);
});

test('shared work is explicit and unused matrix cells do not invent a dependency', () => {
  const svg = wide(decision('pricing') + decision('groups') +
    'NOW\n  Core: Shared\n  Core: Price [if pricing]');
  assert.match(svg, /data-condition="shared"/);
  assert.match(svg, /Moves regardless/);
  assert.match(svg, /No decision outcome required/);
  assert.equal((svg.match(/data-participation="shared"/g) || []).length, 2);
  assert.match(svg, /data-decision-key="groups" data-participation="none"/);
});

test('the atlas uses the full desktop plane with no decisions and expands for many parallel decisions', () => {
  const noDecisions = wide('NOW\n  Core: Shared');
  assert.match(noDecisions, /No decisions authored yet — all work currently moves regardless/);
  assert.match(noDecisions, /<rect x="36" y="[\d.]+" width="1088"/);

  const many = Array.from({length:8}, (_, index) => decision('choice' + index)).join('') +
    'NOW\n  Core: Conditional [if choice0 and choice7]';
  const manySvg = wide(many);
  assert.ok(Number(/<svg[^>]*width="([\d.]+)"/.exec(manySvg)[1]) >= 1488);
  assert.equal((manySvg.match(/data-kind="conditions-decision-header"/g) || []).length, 8);
});

test('decision opening conditions are written separately without reordering selected columns', () => {
  const doc = decision('groups') + decision('pricing') +
    decision('expansion', '\n  when: pricing and groups') +
    'NOW\n  Core: Shared';
  const svg = wide(doc, {selectedKey:'expansion'});

  assert.match(svg, /Opens independently/);
  assert.match(svg, /Opens if Pricing = YES and Groups = YES/);
  assert.match(svg, /data-kind="conditions-decision-header" data-decision-key="expansion" data-selected="true"/);
  const groupsAt = svg.indexOf('data-decision-key="groups"');
  const pricingAt = svg.indexOf('data-decision-key="pricing"');
  const expansionAt = svg.indexOf('data-decision-key="expansion"');
  assert.ok(groupsAt < pricingAt && pricingAt < expansionAt, 'selection does not impose a new decision order');
});

test('evaluator state, completed history and exact repair evidence survive into the atlas', () => {
  const doc = decision('answered', '\n  answer: no 2026-08-10') +
    decision('assumed', '\n  assume: yes 2026-08-21') +
    'NOW\n  Core: History [done] [if answered]\n  Core: Excluded [if answered]\n' +
    '  Core: Assumption work [if assumed]\n  Core: Broken [if answered and missing]';
  const overview = view(doc, '2026-08-22');
  for(const svg of [renderConditions(overview, {colors, measure, width:1160}),
    renderConditionsNarrow(overview, {colors, measure, width:390})]){
    assert.match(svg, /COMPLETED HISTORY/);
    assert.match(svg, /Completed — conditional on/);
    assert.match(svg, /NOT PURSUING/);
    assert.match(svg, /Not pursuing after Answered = no/);
    assert.match(svg, /WORKING TO ASSUMPTION/);
    assert.match(svg, /Working to the assumption Assumed = yes/);
    assert.match(svg, /Condition needs fixing/);
    assert.match(svg, /data-kind="conditions-model-health"/);
    assert.match(svg, /no decision named &quot;missing&quot;/);
  }
});

test('narrow atlas preserves question, place, complete formulas and interactive targets', () => {
  const overview = view(decision('pricing') + decision('groups') +
    'NOW\n  Core: Shared\n  Growth: Joint [if pricing and groups]\n' +
    'LATER\n  Core: Alternative [unless pricing]');
  const svg = renderConditionsNarrow(overview,
    {colors, measure, width:390, selectedKey:'pricing', interactive:true});

  assert.match(svg, /width="390"/);
  assert.match(svg, /data-kind="conditions-narrow-decisions"/);
  assert.match(svg, /data-kind="conditions-narrow-period"><title>NOW/);
  assert.match(svg, /data-kind="conditions-narrow-lane"><title>Growth/);
  assert.equal((svg.match(/data-kind="conditions-narrow-item"/g) || []).length, 3);
  assert.match(svg, /Only if Pricing = YES and Groups = YES/);
  assert.match(svg, /data-decision-key="pricing" data-outcome="yes" data-participation="all"/);
  assert.match(svg, /data-kind="conditions-narrow-decision"[^>]*data-select-decision=""/);
  assert.match(svg, /aria-pressed="true" tabindex="0" role="button"/);
  assert.match(svg, /<rect data-hit=""[^>]*height="[5-9][0-9]/);
  assert.doesNotMatch(svg, /<path\b/);
});

test('wide and narrow atlas SVG remains well-formed with hostile and long authored text', () => {
  const hostile = '<script>alert(1)</script> & "quoted"';
  const overview = view('title: ' + hostile + '\ndecision hostile:\n  question: ' + hostile +
    '\n  signal: signal\n  reading: reading\n  owner: owner\n  answer-by: 2026-08-20\n' +
    'PERIOD-' + 'P'.repeat(65) + '\n  Lane-' + 'L'.repeat(65) + ': ' + hostile + ' [if hostile]');
  const tag = /^<[a-zA-Z][\w:-]*((\s+[\w:-]+=("[^"<]*"|'[^'<]*'))*)\s*\/?>$/;
  for(const svg of [renderConditions(overview, {colors, measure, width:1160}),
    renderConditionsNarrow(overview, {colors, measure, width:320})]){
    assert.match(svg, /aria-labelledby="paths-conditions-name paths-conditions-description"/);
    assert.doesNotMatch(svg, /<script>/i);
    assert.match(svg, /&lt;script&gt;/);
    assert.doesNotMatch(svg, /NaN|Infinity|undefined/);
    for(const opening of svg.match(/<[^!/][^>]*>/g) || []) assert.match(opening, tag);
  }
});
