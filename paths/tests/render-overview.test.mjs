import assert from 'node:assert/strict';
import {test} from 'node:test';

import {parse} from '../parse.js';
import {project} from '../project.js';
import {decisionImpactProjection, overviewProjection} from '../overview.js';
import {renderOverview, renderOverviewNarrow} from '../render-overview.js';

const measure = text => String(text).length * 7;
const colors = {
  bg:'#FBFBFA', card:'#F4F4F1', ink:'#111111', muted:'#6B6B68', border:'#D9D9D5',
  accent:'#1F4FD8', accentInk:'#1A44C2', err:'#B3403A',
};
const decision = (name, fields = '') => `decision ${name}:\n  question: Does ${name} hold?\n` +
  `  signal: measurable ${name}\n  reading: current ${name}\n  owner: ${name} owner\n` +
  `  answer-by: 2026-08-10${fields}\n`;

function view(doc, today = '2026-08-11'){
  return overviewProjection(project(parse(doc), today));
}

function wide(doc, extra = {}){
  const overview = view(doc);
  return renderOverview(overview, {colors, measure, width:1160, ...extra});
}

test('wide overview renders the canonical period by lane grid and each item exactly once', () => {
  const svg = wide('title: Lantern parallel roadmap\ndate: 2026-08-09\nverdict: Keep both routes open\n' + decision('pricing') + decision('groups') +
    'NOW\n  Core: Shared\n  Growth: Price route [if pricing]\n' +
    'LATER\n  Core: Joint route [if pricing and groups]\n  Growth: Alternative [unless pricing]');

  assert.match(svg, /data-kind="roadmap-grid"/);
  assert.match(svg, /<title id="paths-overview-name">Lantern parallel roadmap<\/title>/);
  assert.match(svg, /data-kind="overview-verdict"/);
  assert.match(svg, /Keep both routes open/);
  assert.match(svg, />2026-08-09<\/text>/);
  assert.match(svg, /data-kind="roadmap-cell" data-period="NOW" data-lane="Core"/);
  assert.match(svg, /data-kind="roadmap-cell" data-period="LATER" data-lane="Growth"/);
  assert.equal((svg.match(/data-kind="roadmap-item"/g) || []).length, 4);
  for(const title of ['Shared', 'Price route', 'Joint route', 'Alternative'])
    assert.equal((svg.match(new RegExp(`<title>${title} —`, 'g')) || []).length, 1, `${title} rendered once`);
  for(const copy of ['Moves regardless', 'Waiting — Pricing = yes',
    'Waiting — Pricing = yes and Groups = yes', 'Waiting — Pricing = no'])
    assert.match(svg, new RegExp(copy));
  assert.doesNotMatch(svg, /Lane × period|Work stays in its authored place/);
  assert.ok(Number(/width="(\d+)"/.exec(svg)[1]) >= 36 * 2 + 150 + 2 * 260,
    'every period retains at least the canonical 260px column');
  assert.match(svg, /data-min-readable-scale="0\.925"/);
});

test('assumptions are grouped once, state groups remain collapsed, and the selected receipt is in the artefact', () => {
  const doc = decision('pricing', '\n  assume: no 2026-08-01') +
    decision('answered', '\n  answer: yes 2026-08-11') +
    'NOW\n  Core: Assumed route [unless pricing]\n  Core: Continuing [if answered]';
  const svg = wide(doc, {interactive:true, selectedKey:'pricing'});

  assert.match(svg, /data-kind="overview-attention"/);
  assert.doesNotMatch(svg, /data-kind="attention-decision"[^>]*data-decision-key="pricing"/);
  assert.equal((svg.match(/data-kind="decision-state-group"/g) || []).length, 5);
  assert.match(svg, /data-state-group="workingToAssumption"/);
  assert.match(svg, /data-state-group="answered"/);
  assert.match(svg, /aria-expanded="false"/);
  assert.match(svg, /data-kind="overview-receipt" data-decision-key="pricing"/);
  for(const copy of ['Does pricing hold?', 'measurable pricing', 'current pricing', 'pricing owner',
    '2026-08-10', 'Working to the assumption Pricing = no', '1 direct item'])
    assert.match(svg, new RegExp(copy));

  const expanded = wide(doc, {interactive:true, selectedKey:'answered', expandedGroups:['answered']});
  assert.match(expanded, /data-state-group="answered"[^>]*aria-expanded="true"/);
  assert.match(expanded, /data-kind="state-decision"[^>]*data-decision-key="answered"[^>]*data-selected="true"/);
});

test('interactive state disclosures are 44px targets and static exports enumerate every decision identity', () => {
  const doc = decision('assumed', '\n  assume: yes 2026-08-11') +
    decision('answered', '\n  answer: yes 2026-08-11') +
    decision('host', '\n  answer: yes 2026-08-11') + decision('pending') +
    decision('dormant', '\n  when: pending') +
    decision('moot', '\n  when: not host') +
    'decision repair:\n  question: Repair?\n  answer-by: 2026-08-10\n' +
    'NOW\n  Core: Route [if host]';
  const overview = view(doc);
  const interactive = renderOverview(overview, {colors, measure, width:1160, interactive:true});
  const groupHitHeights = [...interactive.matchAll(
    /data-kind="decision-state-group"[\s\S]*?<rect[^>]*height="(\d+)"/g)].map(match => Number(match[1]));
  assert.equal(groupHitHeights.length, 5);
  assert.ok(groupHitHeights.every(height => height >= 44));

  const exported = renderOverview(overview, {colors, measure, width:1160});
  for(const key of ['assumed', 'answered', 'dormant', 'moot', 'repair'])
    assert.match(exported, new RegExp(`data-kind="state-decision"[^>]*><title>${key} —`, 'i'));
  assert.doesNotMatch(exported, /aria-expanded=/);
});

test('export receipt distinguishes direct, AND, OR, conditional, history and repair impact', () => {
  const doc = decision('pricing') + decision('gate') +
    decision('follow-up', '\n  when: pricing') +
    'NOW\n  Core: Direct [if pricing]\n  Core: Joint [if pricing and gate]\n' +
    '  Core: Either [if pricing or gate]\n  Core: Historical [unless pricing] [done]\n' +
    '  Core: Broken [if pricing and missing]';
  const model = parse(doc);
  const projected = project(model, '2026-08-11');
  const overview = overviewProjection(projected);
  const impact = decisionImpactProjection(model, projected, 'pricing');
  const svg = renderOverview(overview, {colors, measure, width:1160, selectedKey:'pricing', impact});

  for(const copy of ['CONTINUES WHILE UNRESOLVED', 'CHANGES DIRECTLY WITH THIS ANSWER',
    'ALSO NEEDS', 'EITHER CAN UNLOCK', 'MAY OPEN / MAKES IRRELEVANT',
    'COMPLETED HISTORY', 'REPAIR EVIDENCE']) assert.match(svg, new RegExp(copy));
  assert.match(svg, /Joint — Pricing = yes is necessary, not/);
  assert.match(svg, /sufficient; also needs Gate = yes/);
  assert.match(svg, /Either — either Pricing = yes or Gate = yes can/);
  assert.match(svg, /unlock this work/);
  assert.match(svg, /If answered yes, may open Does follow-up hold\?/);
  assert.match(svg, /Historical — completed history/);
  assert.match(svg, /Broken — Logic needs repair/);
});

test('resolved exclusion is dashed with its reason while other item states are not dashed', () => {
  const svg = wide(decision('groups', '\n  answer: yes 2026-08-01') +
    'NOW\n  Core: Continued [if groups]\n  Core: Rejected [unless groups]\n  Core: Shared');
  const rejected = /<g data-kind="roadmap-item"[^>]*data-state="not-pursuing"[\s\S]*?<\/g>/.exec(svg)?.[0] || '';
  assert.match(rejected, /stroke-dasharray="4 3"/);
  assert.match(rejected, /Not pursuing after Groups = yes/);
  const shared = /<g data-kind="roadmap-item"[^>]*data-state="independent"[\s\S]*?<\/g>/.exec(svg)?.[0] || '';
  assert.doesNotMatch(shared, /stroke-dasharray/);
});

test('narrow overview becomes a period agenda with lane groups and preserves every work card', () => {
  const overview = view(decision('pricing') +
    'NOW\n  Core: Shared\n  Growth: Price route [if pricing]\n' +
    'LATER\n  Growth: Later route [unless pricing]');
  const svg = renderOverviewNarrow(overview, {colors, measure, width:390});

  assert.match(svg, /width="390"/);
  assert.match(svg, /data-kind="roadmap-agenda"/);
  assert.match(svg, /data-kind="overview-receipt" data-decision-key="pricing"/);
  assert.equal((svg.match(/data-kind="agenda-period"/g) || []).length, 2);
  assert.equal((svg.match(/data-kind="roadmap-item"/g) || []).length, 3);
  assert.doesNotMatch(svg, /data-kind="roadmap-grid"/);
  assert.match(svg, /Waiting — Pricing = yes/);
  assert.match(svg, /Waiting — Pricing = no/);
});

test('no active decision omits the receipt instead of rendering an empty shell', () => {
  const svg = wide('NOW\n  Core: Shared route');
  assert.match(svg, /No active unanswered decisions/);
  assert.doesNotMatch(svg, /data-kind="overview-receipt"/);
});

test('model-health warnings remain visible in the overview artefact', () => {
  const svg = wide('NOW\n  Core: Broken route [if missing]');
  assert.match(svg, /data-kind="overview-model-health"/);
  assert.match(svg, /no decision named &quot;missing&quot;/);
});

test('wide and narrow overview are accessible, total and escape hostile projected text', () => {
  const hostile = '<script>alert(1)</script> & "quoted"';
  const overview = view('decision hostile:\n  question: ' + hostile + '\n  signal: ' + hostile +
    '\n  reading: ' + hostile + '\n  owner: ' + hostile + '\n  answer-by: 2026-08-20\n' +
    'A-VERY-LONG-' + 'P'.repeat(70) + '\n  Lane-' + 'L'.repeat(70) + ': ' + hostile + ' [if hostile]');
  for(const svg of [renderOverview(overview, {colors, measure, width:1160}),
    renderOverviewNarrow(overview, {colors, measure, width:320})]){
    assert.match(svg, /role="img" aria-labelledby="paths-overview-name paths-overview-description"/);
    assert.match(svg, /<title id="paths-overview-name">/);
    assert.match(svg, /<desc id="paths-overview-description">/);
    assert.match(svg, /Periods: A-VERY-LONG-/);
    assert.match(svg, /Lanes: Lane-/);
    assert.doesNotMatch(svg, /<script>/i);
    assert.match(svg, /&lt;script&gt;/);
    assert.doesNotMatch(svg, /NaN|Infinity|undefined/);
  }
});
