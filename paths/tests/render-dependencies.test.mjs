import assert from 'node:assert/strict';
import {test} from 'node:test';

import {parse} from '../parse.js';
import {project} from '../project.js';
import {decisionImpactProjection, overviewProjection} from '../overview.js';
import {renderDependencies, renderDependenciesNarrow} from '../render-dependencies.js';

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
  return renderDependencies(view(doc), {colors, measure, width:1160, ...extra});
}

test('wide dependencies keep each work item once in the canonical period by lane grid', () => {
  const svg = wide('title: Habitat choices\ndate: 2026-08-11\n' + decision('pricing') + decision('groups') +
    'NOW\n  Core: Shared\n  Growth: Price route [if pricing]\n' +
    'LATER\n  Core: Joint route [if pricing and groups]\n  Growth: Alternative [unless pricing]',
  {selectedKey:'pricing'});

  assert.match(svg, /data-kind="decision-spine"/);
  assert.equal((svg.match(/data-kind="decision-node"/g) || []).length, 2);
  assert.match(svg, /data-kind="dependency-grid-base"/);
  assert.match(svg, /data-kind="dependency-period"><title>NOW/);
  assert.match(svg, /data-kind="dependency-lane"><title>Growth/);
  assert.equal((svg.match(/data-kind="dependency-item"/g) || []).length, 4);
  for(const title of ['Shared', 'Price route', 'Joint route', 'Alternative'])
    assert.equal((svg.match(new RegExp(`<title>${title} —`, 'g')) || []).length, 1);
  assert.match(svg, /data-min-readable-scale="0\.86"/);
  assert.ok(Number(/width="(\d+)"/.exec(svg)[1]) >= 36 * 2 + 150 + 2 * 280);
});

test('the selected decision alone traces labelled YES and NO routes to every affected card', () => {
  const svg = wide(decision('pricing') + decision('groups') +
    'NOW\n  Core: Yes route [if pricing]\n  Core: No route [unless pricing]\n' +
    '  Core: Other [if groups]', {selectedKey:'pricing'});

  assert.equal((svg.match(/data-kind="dependency-route"/g) || []).length, 2);
  assert.match(svg, /data-decision-key="pricing" data-item-identity="[^\"]+" data-outcome="yes"/);
  assert.match(svg, /data-decision-key="pricing" data-item-identity="[^\"]+" data-outcome="no"/);
  assert.match(svg, /data-negated="true"/);
  assert.doesNotMatch(svg, /data-kind="dependency-route" data-decision-key="groups"/);
  assert.match(svg, /data-kind="decision-output" data-decision-key="pricing" data-outcome="yes"/);
  assert.match(svg, /data-kind="decision-output" data-decision-key="pricing" data-outcome="no"/);
});

test('no selection shows complete condition text without an always-on graph', () => {
  const svg = wide(decision('pricing') + 'NOW\n  Core: Price route [if pricing]');
  assert.doesNotMatch(svg, /data-kind="dependency-route"/);
  assert.match(svg, /IF Pricing = YES/);
  assert.match(svg, /This outcome unlocks the work/);
});

test('AND and OR remain complete, joined and free of false ownership', () => {
  const doc = decision('pricing') + decision('groups') + decision('retention') +
    'NOW\n  Core: Joint [if pricing and groups]\n  Core: Either [if pricing or retention]';
  const svg = wide(doc, {selectedKey:'pricing'});

  assert.match(svg, /ONLY IF Pricing = YES AND Groups = YES/);
  assert.match(svg, /All are necessary; none is/);
  assert.match(svg, /sufficient alone/);
  assert.match(svg, /data-kind="condition-join" data-operator="and"/);
  assert.match(svg, /ALL REQUIRED/);
  assert.match(svg, /IF EITHER Pricing = YES OR Retention = YES/);
  assert.match(svg, /Either can unlock/);
  assert.match(svg, /data-kind="condition-join" data-operator="or"/);
  assert.match(svg, /EITHER CAN UNLOCK/);
  assert.equal((svg.match(/data-kind="dependency-route"/g) || []).length, 2,
    'one selected route reaches each compound item; other requirements remain explicit on the card');
});

test('unconditional and broken conditions are self-explanatory without connectors', () => {
  const svg = wide(decision('pricing') +
    'NOW\n  Core: Shared\n  Core: Broken [if pricing and missing]', {selectedKey:'pricing'});
  assert.match(svg, /data-condition="independent"/);
  assert.match(svg, /MOVES REGARDLESS/);
  assert.match(svg, /No decision outcome required/);
  assert.match(svg, /data-condition="repair"/);
  assert.match(svg, /CONDITION NEEDS FIXING/);
  assert.doesNotMatch(svg, /data-item-identity="[^\"]+" data-outcome="[^\"]+" data-operator="and"/);
});

test('selection highlights affected work and fades unrelated conditional work', () => {
  const svg = wide(decision('pricing') + decision('groups') +
    'NOW\n  Core: Price [if pricing]\n  Core: Group [if groups]\n  Core: Shared', {selectedKey:'pricing'});
  assert.match(svg, /data-kind="dependency-item"[^>]*data-condition="simple" data-emphasis="selected" opacity="1"/);
  assert.match(svg, /data-kind="dependency-item"[^>]*data-condition="simple" data-emphasis="unrelated" opacity="0\.28"/);
  assert.match(svg, /data-kind="dependency-item"[^>]*data-condition="independent" data-emphasis="independent" opacity="0\.6"/);
  assert.match(svg, /data-kind="decision-node" data-decision-key="pricing" data-emphasis="selected" opacity="1"/);
  assert.match(svg, /data-kind="decision-node" data-decision-key="groups" data-emphasis="unrelated" opacity="0\.35"/);
});

test('the focused decision is anchored at the left edge without implying decision sequence', () => {
  const svg = wide(decision('groups') + decision('retention') + decision('pricing') +
    'NOW\n  Core: Price [if pricing]', {selectedKey:'pricing'});
  const selected = /data-kind="decision-node" data-decision-key="pricing"[\s\S]*?<rect x="([\d.]+)"/.exec(svg);
  const groups = /data-kind="decision-node" data-decision-key="groups"[\s\S]*?<rect x="([\d.]+)"/.exec(svg);

  assert.ok(selected, 'selected node is rendered');
  assert.ok(groups, 'other parallel nodes remain rendered');
  assert.equal(Number(selected[1]), 36, 'selected node starts in the first unscrolled viewport');
  assert.ok(Number(selected[1]) < Number(groups[1]), 'focused node is visually first');
  assert.match(svg, /PARALLEL DECISIONS/);
  assert.match(svg, /FOCUSED: Pricing/);
});

test('narrow dependencies group complete requirements and render every item once with place context', () => {
  const overview = view(decision('pricing') + decision('groups') +
    'NOW\n  Core: Shared\n  Growth: Price route [if pricing]\n' +
    'LATER\n  Core: Joint [if pricing and groups]\n  Growth: Alternative [unless pricing]');
  const svg = renderDependenciesNarrow(overview, {colors, measure, width:390, selectedKey:'pricing'});

  assert.match(svg, /width="390"/);
  assert.match(svg, /data-kind="dependency-agenda"/);
  assert.doesNotMatch(svg, /data-kind="dependency-grid-base"/);
  assert.equal((svg.match(/data-kind="dependency-item"/g) || []).length, 4);
  assert.match(svg, /data-kind="dependency-group" data-condition="and" data-emphasis="selected"/);
  assert.match(svg, /ONLY IF Pricing = YES AND Groups = YES/);
  assert.match(svg, /NOW · Growth/);
  assert.match(svg, /LATER · Core/);
});

test('interactive decision nodes use the shared selection contract and 44px targets', () => {
  const svg = renderDependenciesNarrow(view(decision('pricing') + 'NOW\n  Core: Route [if pricing]'),
    {colors, measure, width:390, selectedKey:'pricing', interactive:true});
  assert.match(svg, /data-kind="narrow-decision-node"[^>]*data-select-decision=""/);
  assert.match(svg, /aria-pressed="true" tabindex="0" role="button"/);
  assert.match(svg, /<rect data-hit=""[^>]*height="52"/);
});

test('conditional decisions state their complete opening condition and remain visible when their host is selected', () => {
  const doc = decision('pricing') + decision('groups') +
    decision('expansion', '\n  when: pricing and groups') +
    'NOW\n  Core: Shared';
  const wideSvg = wide(doc, {selectedKey:'pricing'});
  assert.match(wideSvg, /OPENS IF Pricing = YES/);
  assert.match(wideSvg, /AND Groups = YES/);
  assert.match(wideSvg, /data-kind="decision-node" data-decision-key="expansion" data-emphasis="affected" opacity="1"/);
  const narrowSvg = renderDependenciesNarrow(view(doc), {colors, measure, width:390, selectedKey:'pricing'});
  assert.match(narrowSvg, /OPENS IF Pricing = YES AND Groups = YES/);
  assert.match(narrowSvg, /data-kind="narrow-decision-node" data-decision-key="expansion" data-emphasis="affected" opacity="1"/);
});

test('cards retain evaluator truth and model-health gives the exact repair reason wide and narrow', () => {
  const doc = decision('answered', '\n  answer: no 2026-08-10') +
    decision('assumed', '\n  assume: yes 2026-08-21') +
    'NOW\n  Core: History [done] [if answered]\n  Core: Excluded [if answered]\n' +
    '  Core: Assumption work [if assumed]\n  Core: Broken [if answered and missing]';
  const overview = view(doc, '2026-08-22');
  for(const svg of [renderDependencies(overview, {colors, measure, width:1160, selectedKey:'answered'}),
    renderDependenciesNarrow(overview, {colors, measure, width:390, selectedKey:'answered'})]){
    assert.match(svg, /Completed — conditional on[\s\S]*Answered = yes/);
    assert.match(svg, /Not pursuing after Answered = no/);
    assert.match(svg, /Working to the assumption Assumed[\s\S]*= yes/);
    assert.match(svg, /data-kind="dependency-model-health"/);
    assert.match(svg, /no decision named &quot;missing&quot;/);
    assert.doesNotMatch(svg, /Check the model health notes/);
    const history = svg.slice(svg.indexOf('<title>History —'), svg.indexOf('</g>', svg.indexOf('<title>History —')));
    const excluded = svg.slice(svg.indexOf('<title>Excluded —'), svg.indexOf('</g>', svg.indexOf('<title>Excluded —')));
    assert.match(history, /Historical condition[\s\S]*already[\s\S]*completed/);
    assert.doesNotMatch(history, /unlocks the work/);
    assert.match(excluded, /This outcome is no longer[\s\S]*being[\s\S]*pursued/);
    assert.doesNotMatch(excluded, /unlocks the work/);
  }
});

test('selected when routes solve out-of-order chains and visibly label direct versus downstream', () => {
  const doc = decision('a') + decision('c', '\n  when: b') + decision('b', '\n  when: a') +
    'NOW\n  Core: Shared';
  const model = parse(doc), projected = project(model, '2026-08-11');
  const overview = overviewProjection(projected);
  const impact = decisionImpactProjection(model, projected, 'a');
  const svg = renderDependencies(overview, {colors, measure, width:1160, selectedKey:'a', impact});
  assert.match(svg, /data-kind="decision-opening-route"[^>]*data-from-decision="a"[^>]*data-to-decision="b"[^>]*data-relation="direct"/);
  assert.match(svg, /data-kind="decision-opening-route"[^>]*data-from-decision="b"[^>]*data-to-decision="c"[^>]*data-relation="downstream"/);
  assert.doesNotMatch(svg, /data-from-decision="a"[^>]*data-to-decision="c"/);
  assert.match(svg, /data-kind="decision-node" data-decision-key="c" data-emphasis="affected" opacity="1"/);
  assert.match(svg, />DIRECT<\/text>/);
  assert.match(svg, />DOWNSTREAM<\/text>/);
});

test('wide and narrow dependencies are accessible, total and escape hostile projected text', () => {
  const hostile = '<script>alert(1)</script> & "quoted"';
  const overview = view('title: ' + hostile + '\ndecision hostile:\n  question: ' + hostile +
    '\n  signal: signal\n  reading: reading\n  owner: owner\n  answer-by: 2026-08-20\n' +
    'PERIOD-' + 'P'.repeat(65) + '\n  Lane-' + 'L'.repeat(65) + ': ' + hostile + ' [if hostile]');
  for(const svg of [renderDependencies(overview, {colors, measure, width:1160, selectedKey:'hostile'}),
    renderDependenciesNarrow(overview, {colors, measure, width:320, selectedKey:'hostile'})]){
    assert.match(svg, /aria-labelledby="paths-dependencies-name paths-dependencies-description"/);
    assert.match(svg, /<title id="paths-dependencies-name">/);
    assert.match(svg, /<desc id="paths-dependencies-description">/);
    assert.doesNotMatch(svg, /<script>/i);
    assert.match(svg, /&lt;script&gt;/);
    assert.doesNotMatch(svg, /NaN|Infinity|undefined/);
  }
});
