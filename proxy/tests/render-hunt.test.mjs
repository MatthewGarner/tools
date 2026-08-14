import {test} from 'node:test';
import assert from 'node:assert/strict';

import {parse} from '../parse.js';
import {project} from '../project.js';
import {renderHunt, renderHuntNarrow, renderHuntReceipt} from '../render-hunt.js';
import {fullHuntProjection} from '../export-projection.js';

const measure = text => String(text).length * 7;
const colors = {bg:'#FBFBFA', card:'#F4F4F1', ink:'#111111', muted:'#6B6B68',
  border:'#D9D9D5', accent:'#1F4FD8', accentInk:'#1A44C2', err:'#B3403A'};
const context = extra => ({colors, measure, ...extra});
const visibleText = svg => svg.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
const group = (svg, kind) => new RegExp(`<g data-kind="${kind}"[\\s\\S]*?<\\/g>`).exec(svg)?.[0] || '';

const COMPLETE_PATTERN = `reported-pattern:
  proxy-reading: +18%
  outcome-reading: -11%
  protected-outcome: Qualified groups retained after seven days
  population: Invited teams
  horizon: Prior 14 days
  comparator: Previous 14 days
  source: Author-entered product reading`;

function source({basis = 'reasoned-mechanism', pattern = COMPLETE_PATTERN, extra = ''} = {}){
  return `title: Group invitations
date: 2026-08-13
outcome: Groups retain after the first week
proxy: Invitation rate
action: Prompt every active member to invite friends
mode: optimise
intended-theory:
  mechanism: Relevant friends join established groups
protects:
  - Qualified groups retained after seven days
  - Member reports per active group
failure-theory low-intent:
  mechanism: Prompts create low-intent invitations and noisier groups
  harmed-outcome: Qualified groups retained after seven days
  guardrail: Qualified group retention after seven days
  basis: ${basis}
  support: High-invite cohorts have lower return
  weaken-with: Qualified retention remains comparable in matched cohorts
${pattern}
${extra}`;
}

const secondTheory = `failure-theory reports:
  mechanism: Prompt volume produces more abusive invitations
  harmed-outcome: Member reports per active group
  guardrail: Member reports per active group
  basis: reasoned-mechanism
  support: Report reviews cluster around unsolicited invitations
  weaken-with: Reports remain stable in a prompted comparison`;

test('wide hunt makes measurement, intended route and failure route structurally distinct', () => {
  const hunt = project(parse(source()));
  const svg = renderHunt(hunt, context({width:1180}));
  const intended = group(svg, 'intended-route');
  const failure = group(svg, 'failure-route');
  const measurement = group(svg, 'target-and-measurement');

  for(const route of [intended, failure]){
    assert.match(route, />ACTION<\/text>/);
    assert.match(route, /MECHANISM<\/text>/);
    assert.match(route, /OUTCOME<\/text>/);
    assert.doesNotMatch(route, /Invitation rate|\+18%|-11%|PROXY READING/);
  }
  assert.match(measurement, /MEASURE UNDER PRESSURE/);
  assert.match(measurement, /Invitation rate/);
  assert.match(svg, /data-kind="reported-pattern"/);
});

test('reported readings stay in a scoped pattern strip with both causal limits', () => {
  const svg = renderHunt(project(parse(source())), context({width:1180}));
  const strip = group(svg, 'reported-pattern');
  const copy = visibleText(strip);
  for(const value of ['REPORTED PATTERN', '+18%', '-11%', 'Invited teams', 'Prior 14 days',
    'Previous 14 days', 'Author-entered product reading',
    'Reported pattern does not establish causality.', 'Mechanism remains a hypothesis.'])
    assert.match(copy, new RegExp(value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'));
  assert.doesNotMatch(strip, /<line[^>]+marker|data-kind="(?:intended|failure)-route"/);
});

test('authored palette configuration reaches wide, narrow and scoped artefacts', () => {
  const hunt = project(parse(`${source()}\npalette: plum\naccent: #9D3E78`));
  assert.equal(hunt.accent, '#9D3E78');
  for(const svg of [renderHunt(hunt, context({width:1180, dark:false})),
    renderHuntNarrow(hunt, context({width:390, dark:false})),
    renderHuntReceipt(hunt, context({width:520, dark:false}))]){
    assert.match(svg, /#9D3E78/);
  }
});

test('pattern strip names a desired outcome reading truthfully on desktop and phone', () => {
  const desiredPattern = COMPLETE_PATTERN.replace(
    'protected-outcome: Qualified groups retained after seven days',
    'outcome: Groups retain after the first week');
  const hunt = project(parse(source({pattern:desiredPattern})), 'low-intent');
  assert.equal(hunt.reportedPattern.outcomeKind, 'desired');
  for(const svg of [renderHunt(hunt, context({width:1180})),
    renderHuntNarrow(hunt, context({width:390}))]){
    const strip = group(svg, 'reported-pattern');
    assert.match(visibleText(strip), /DESIRED OUTCOME READING/);
    assert.doesNotMatch(visibleText(strip), /PROTECTED OUTCOME READING/);
    assert.match(visibleText(strip), /Groups retain after the first week/);
  }
});

test('static full hunt renders every theory expanded and no transient selection controls', () => {
  const hunt = project(parse(source({extra:secondTheory})), 'low-intent');
  const svg = renderHunt(hunt, context({width:1180}));
  const copy = visibleText(svg);
  assert.equal((svg.match(/data-kind="failure-theory"/g) || []).length, 2);
  for(const value of ['Qualified group retention after seven days',
    'Qualified retention remains comparable in matched cohorts',
    'Member reports per active group', 'Reports remain stable in a prompted comparison',
    'High-invite cohorts have lower return', 'Report reviews cluster around unsolicited invitations'])
    assert.match(copy, new RegExp(value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'));
  assert.doesNotMatch(svg, /data-selected=|data-select-theory|aria-pressed=|tabindex=|role="button"|data-hit=/);
  assert.doesNotMatch(svg, /data-kind="selected-theory-receipt"/);
});

test('interactive wide and narrow hunts expose selected receipt and named 44px theory targets', () => {
  const hunt = project(parse(source({extra:secondTheory})), 'reports');
  for(const svg of [renderHunt(hunt, context({width:1180, interactive:true})),
    renderHuntNarrow(hunt, context({width:390, interactive:true}))]){
    assert.match(svg, /role="group" aria-labelledby="proxy-hunt-name proxy-hunt-description"/);
    assert.match(svg, /data-theory-id="reports" data-select-theory="" data-selected="true" aria-pressed="true" tabindex="0" role="button"/);
    assert.match(visibleText(svg), /SELECTED · REASONED/);
    assert.match(svg, /data-kind="selected-theory-receipt" data-theory-id="reports"/);
    assert.match(svg, /data-kind="selected-theory-receipt"[^>]+tabindex="0" role="region"/);
    assert.match(visibleText(svg), /Member reports per active group/);
    const hits = [...svg.matchAll(/<rect data-hit=""[^>]*height="([\d.]+)"/g)];
    assert.equal(hits.length, 2);
    assert.ok(hits.every(match => Number(match[1]) >= 44));
  }
});

test('incomplete and speculative theories cannot look like approval', () => {
  const incompleteSource = source({pattern:'', extra:''}).replace(
    '  guardrail: Qualified group retention after seven days\n', '');
  const incomplete = renderHuntNarrow(project(parse(incompleteSource)), context({width:390}));
  assert.match(visibleText(incomplete), /MISSING GUARDRAIL/);
  assert.match(visibleText(incomplete), /Complete this failure theory before treating the review as a guardrail/);

  const speculative = renderHunt(project(parse(source({basis:'speculative-concern'}))), context({width:1180}));
  assert.match(visibleText(speculative), /SPECULATIVE/);
  assert.match(visibleText(speculative), /Stress-test before making this a target/);
  assert.match(visibleText(speculative), /reported pattern can motivate investigation; it does not establish this mechanism or a causal effect/i);
});

test('challenge-empty, monitor and undecided trade-off states stay explicit', () => {
  const empty = project(parse(`outcome: Retention
proxy: Invitation rate
action: Prompt members
intended-theory:
  mechanism: Relevant friends join`));
  const emptySvg = renderHuntNarrow(empty, context({width:390}));
  assert.match(visibleText(emptySvg), /Challenge not yet articulated/);
  assert.match(visibleText(emptySvg), /Incomplete review (?:—|is) not endorsement/);

  const monitor = project(parse(source({pattern:'', extra:
    'optimisation-pressure: Aggressive acquisition targets'}).replace('mode: optimise', 'mode: monitor')));
  const monitorSvg = renderHunt(monitor, context({width:1180}));
  assert.match(visibleText(monitorSvg), /MEASURE TO MONITOR/);
  assert.match(visibleText(monitorSvg), /OPTIMISATION PRESSURE/);
  assert.match(visibleText(monitorSvg), /Aggressive acquisition targets/);

  const tradeOff = project(parse(source({pattern:'', extra:
    'trade-off: Group creation versus qualified retention'})));
  const tradeSvg = renderHunt(tradeOff, context({width:1180}));
  assert.match(visibleText(tradeSvg), /Trade-off not yet decided/);
  assert.match(visibleText(tradeSvg), /Decision rule: Not authored/);
});

test('narrow static hunt is width-aware, semantically named and keeps every theory expanded', () => {
  const hunt = project(parse(source({extra:secondTheory})));
  const svg = renderHuntNarrow(hunt, context({width:320}));
  assert.match(svg, /^<svg[^>]+width="320"[^>]+viewBox="0 0 320 \d+"/);
  assert.match(svg, /role="img" aria-labelledby="proxy-hunt-name proxy-hunt-description" data-layout="proxy-hunt-narrow"/);
  assert.equal((svg.match(/data-kind="failure-theory"/g) || []).length, 2);
  assert.match(visibleText(svg), /WHAT WOULD WEAKEN THIS CONCERN/);
  assert.doesNotMatch(svg, /data-select-theory|data-selected=|aria-pressed=|tabindex=/);
  const rootHeight = Number(/<svg[^>]+height="(\d+)"/.exec(svg)?.[1]);
  const ys = [...svg.matchAll(/<text[^>]+ y="([\d.]+)"/g)].map(match => Number(match[1]));
  assert.ok(ys.length && ys.every(y => y >= 0 && y < rootHeight));
});

test('scoped receipt contains guardrail, basis, weakening condition and causal caveats', () => {
  const hunt = project(parse(source()), 'low-intent');
  const svg = renderHuntReceipt(hunt, context({width:520}));
  const copy = visibleText(svg);
  assert.match(svg, /data-kind="selected-theory-receipt" data-theory-id="low-intent"/);
  assert.match(svg, /data-kind="receipt-reported-pattern"/);
  for(const value of ['AUTHORED DATE · 2026-08-13', 'Group invitations',
    'Groups retain after the first week', 'Invitation rate',
    'FAILURE THEORY RECEIPT · SCOPED', 'PAIRED GUARDRAIL', 'Reasoned mechanism',
    'Qualified retention remains comparable in matched cohorts', 'APPLICABLE REPORTED PATTERN',
    'NON-CAUSAL CONTEXT', '+18%', '-11%', 'Invited teams', 'Prior 14 days',
    'Previous 14 days', 'Author-entered product reading',
    'Reported pattern does not establish causality.', 'Mechanism remains a hypothesis.'])
    assert.match(copy, new RegExp(value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'));
  assert.match(svg, /role="img" aria-labelledby="proxy-hunt-receipt-name proxy-hunt-receipt-description"/);
  assert.doesNotMatch(svg, /data-select-theory|tabindex=|role="button"/);
});

test('every receipt carries its causal limitation even with no reported pattern', () => {
  const hunt = project(parse(source({pattern:''})), 'low-intent');
  assert.equal(hunt.selectedReceipt.reportedPattern, null);
  for(const svg of [renderHunt(hunt, context({width:1180, interactive:true})),
    renderHuntNarrow(hunt, context({width:390, interactive:true})),
    renderHuntReceipt(hunt, context({width:520}))]){
    const copy = visibleText(svg);
    assert.match(copy, /CAUSAL LIMIT/);
    assert.match(copy, /mechanism is an authored hypothesis, not proof of causal effect/i);
    assert.doesNotMatch(svg, /data-kind="receipt-reported-pattern"/);
  }
  for(const svg of [renderHunt(hunt, context({width:1180})),
    renderHuntNarrow(hunt, context({width:390}))]){
    assert.match(svg, /data-kind="causal-limitation"/);
    assert.match(visibleText(svg), /mechanism is an authored hypothesis, not proof of causal effect/i);
  }
});

test('an author-stated verdict is labelled, hunt-level, and never replaces review state', () => {
  const claimed = 'Proceed with caution for 2 cohorts.';
  const incomplete = project(parse(`${source({basis:'speculative-concern'})}\nverdict: ${claimed}`));
  const full = fullHuntProjection(parse(`${source({basis:'speculative-concern'})}\nverdict: ${claimed}`));
  for(const svg of [
    renderHunt(incomplete, context({width:1180})),
    renderHuntNarrow(incomplete, context({width:390})),
    renderHuntReceipt(incomplete, context({width:520})),
    renderHunt(full, context({width:1180})),
  ]){
    const copy = visibleText(svg);
    assert.match(copy, /REVIEW STATE.*TOOL-DERIVED/i);
    assert.match(copy, /Stress-test(?: it)? before making this a target/i);
    assert.match(copy, /AUTHOR-STATED VERDICT.*HUNT-LEVEL/i);
    assert.match(copy, /Proceed with caution for 2 cohorts/i);
    assert.match(copy, /mechanism is an authored hypothesis, not proof of causal effect/i);
  }
  const receipt = visibleText(renderHuntReceipt(incomplete, context({width:520})));
  assert.match(receipt, /NOT A THEORY CONCLUSION/i);
  assert.equal(full.verdict.authoritative, false);
  assert.match(full.verdict.line, /At least one failure theory is speculative/i);
});

test('hostile authored text is escaped and every renderer emits strict finite SVG', () => {
  const hostile = '<script>alert("x")</script> & \'quoted\' ' + 'X'.repeat(140);
  const hunt = project(parse(source().replace('Group invitations', hostile)
    .replace('High-invite cohorts have lower return', hostile) + `\nverdict: ${hostile}`));
  const TAG = /^<[a-zA-Z][\w:-]*((\s+[\w:-]+=("[^"<]*"|'[^'<]*'))*)\s*\/?>$/;
  for(const svg of [renderHunt(hunt, context({width:1180})),
    renderHuntNarrow(hunt, context({width:320})), renderHuntReceipt(hunt, context({width:390}))]){
    assert.doesNotMatch(svg, /<script>/i);
    assert.match(svg, /&lt;script&gt;alert\(&quot;x&quot;\)&lt;\/script&gt; &amp; &#39;quoted&#39;/);
    assert.doesNotMatch(svg, /(?:NaN|Infinity|undefined)/);
    assert.match(svg, /^<svg[^>]+width="\d+" height="\d+"/);
    for(const tag of svg.match(/<[^!/][^>]*>/g) || []) assert.match(tag, TAG, `malformed tag ${tag}`);
  }
});
