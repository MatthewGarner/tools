import {test} from 'node:test';
import assert from 'node:assert/strict';
import {renderLearningCloseOut, renderLearningCloseOutNarrow} from '../render-learning-closeout.js';

const colors = {bg:'#FFFFFF', surface:'#FAFAFA', ink:'#111111', muted:'#666666', border:'#CCCCCC',
  accent:'#2457E6', accentInk:'#173AA0', urgent:'#B42318'};
const ctx = {colors, measure:value => String(value).length * 6};
const decision = {key:'setup', name:'setup', question:'What did guided setup teach us?', reading:'Directionally higher return',
  answer:{direction:'yes', date:'2026-08-13'}};
const receipt = {record:'documented', carryForward:'scoped-finding', currency:'challenged', basisKind:'observation',
  declaredCarryForward:'scoped-finding', decisionUse:'Keep the pilot narrow', claim:'Setup completers returned more often',
  scope:'New solo users, pilot cohort', reviewBy:'2026-10-31', reconsiderIf:'The matched pattern reverses',
  nextCheck:'Run an assigned variant', qualifier:'Author-stated contents; not evidence, causal, or research-quality certification.',
  reviews:[{effect:'challenges-prior', relation:'inside-scope', priorClaim:'Setup completers returned more often',
    priorScope:'New solo users, pilot cohort', newObservation:'The pattern reversed', srcLine:20}], retirements:[],
  events:[{kind:'retirement', effect:'pending', reason:'Later product replacement', retiredOn:'2026-12-01', srcLine:16},
    {kind:'review', effect:'challenges-prior', relation:'inside-scope', priorClaim:'Setup completers returned more often',
      priorScope:'New solo users, pilot cohort', newObservation:'The pattern reversed', srcLine:20}]};

test('scoped close-out export keeps the three independent facts and semantic boundary visible', () => {
  const svg = renderLearningCloseOut({date:'13 AUG 2026'}, decision, receipt, ctx);
  assert.match(svg, /data-kind="learning-closeout"/);
  assert.match(svg, /data-scope="selected-decision"/);
  assert.match(svg, />Documented</);
  assert.match(svg, />Scoped finding</);
  assert.match(svg, />Challenged</);
  assert.match(svg, /Author-stated contents; not evidence, causal, or research-quality certification/);
  assert.match(svg, /APPEND-ONLY HISTORY/);
  assert.ok(svg.indexOf('Later product replacement') < svg.indexOf('The pattern reversed'),
    'review and retirement remain in one source-ordered stream');
  assert.match(svg, /INSIDE SCOPE/);
  assert.match(svg, /Prior claim: Setup completers returned more often/);
  assert.match(svg, /Prior scope:/);
  assert.match(svg, /New solo users, pilot cohort/);
});

test('narrow close-out is a real relayout and hostile authored text remains escaped', () => {
  const svg = renderLearningCloseOutNarrow({}, {...decision, question:'<script>alert(1)</script>'},
    {...receipt, claim:'<img src=x onerror=alert(1)>'}, {...ctx, width:390});
  assert.match(svg, /data-layout="narrow"/);
  assert.doesNotMatch(svg, /<script>/);
  assert.doesNotMatch(svg, /<img/);
  assert.match(svg, /&lt;script&gt;/);
  assert.match(svg, /&lt;img src=x onerror=alert\(1\)&gt;/);
});

test('an eligible decision without authored close-out exports no record, no carry-forward and no currency', () => {
  const svg = renderLearningCloseOut({}, decision, null, ctx);
  assert.match(svg, />Not documented</);
  assert.match(svg, />Not stated</);
  assert.match(svg, />Not applicable</);
  assert.doesNotMatch(svg, />Current</);
  assert.match(svg, /Not authored/);
  assert.match(svg, /not evidence, causal, or research-quality certification/);
});
