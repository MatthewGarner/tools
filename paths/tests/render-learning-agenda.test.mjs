import assert from 'node:assert/strict';
import {test} from 'node:test';

import {learningAgendaProjection} from '../learning-agenda.js';
import {parse} from '../parse.js';
import {project} from '../project.js';
import {renderLearningAgenda, renderLearningAgendaNarrow} from '../render-learning-agenda.js';

const measure = text => String(text).length * 7;
const colors = {bg:'#FBFBFA', card:'#F4F4F1', ink:'#111111', muted:'#6B6B68',
  border:'#D9D9D5', accent:'#1F4FD8', accentInk:'#1A44C2', err:'#B3403A'};
const decision = (name, fields = '') => `decision ${name}:
  question: Will ${name} clear the threshold?
  signal: ${name} acceptance
  reading: ${name} reading
  owner: ${name} owner
  answer-by: ${/\n  answer-by:/.test(fields) ? fields.match(/\n  answer-by: ([^\n]+)/)[1] : '2026-08-20'}${fields.replace(/\n  answer-by: [^\n]+/, '')}
`;

function agenda(extra = ''){
  const text = `style: agenda
title: Habitat evidence plan
date: 2026-08-13
verdict: Learn before making the expansion irreversible.
${decision('pricing', '\n  answer-by: 2026-08-01')}${decision('groups')}${decision('expansion', '\n  when: pricing and groups')}${decision('answered', '\n  answer: no 2026-08-10')}${decision('assumed', '\n  answer-by: 2026-08-10\n  assume: yes 2026-08-11')}decision broken:
  question: Broken?
  owner: Alex
  answer-by: 2026-08-20
NOW
  Core: Shared foundation
  Growth: Revenue offer [if pricing]
  Growth: Fixed fee [unless pricing]
NEXT
  Growth: Joint launch [if pricing and groups]
  Core: Either route [if pricing or groups]
${extra}`;
  const model = parse(text), projected = project(model, '2026-08-13');
  return learningAgendaProjection(model, projected);
}

test('wide agenda makes learning move, current state and conditional impact visible without a legend or graph', () => {
  const svg = renderLearningAgenda(agenda(), {colors, measure, width:1160, selectedKey:'pricing'});
  for(const copy of ['LEARNING AGENDA', 'DO NEXT', 'BLOCKED LEARNING', 'NOT READY',
    'SETTLED / NO LONGER APPLICABLE', 'Get pricing acceptance from pricing owner by 2026-08-01.',
    'Unanswered — overdue since 2026-08-01', 'Revenue offer — changes directly when Pricing = yes',
    'Fixed fee — changes directly when Pricing = no',
    'Pricing = yes is necessary, not sufficient; also needs Groups = yes',
    'either Pricing = yes or Groups = yes can unlock this work']) assert.match(svg, new RegExp(copy.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  assert.match(svg, /data-kind="agenda-entry" data-group="active" data-decision-key="pricing"/);
  assert.match(svg, /data-selected="true"/);
  assert.match(svg, />SELECTED<\/text>/);
  assert.doesNotMatch(svg, /LEGEND|<path\b|experiment/i);
});

test('interactive wide and narrow agendas expose named 44px keyboard targets and selected state', () => {
  const view = agenda();
  for(const svg of [renderLearningAgenda(view, {colors, measure, width:1160, interactive:true, selectedKey:'pricing'}),
    renderLearningAgendaNarrow(view, {colors, measure, width:390, interactive:true, selectedKey:'pricing'})]){
    assert.match(svg, /role="group" aria-labelledby="paths-agenda-name paths-agenda-description"/);
    assert.match(svg, /data-decision-key="pricing"[^>]*aria-pressed="true" tabindex="0" role="button"/);
    const targets = [...svg.matchAll(/<rect data-hit=""[^>]*height="([\d.]+)"/g)];
    assert.equal(targets.length, view.entries.length);
    assert.ok(targets.every(match => Number(match[1]) >= 44));
  }
});

test('narrow agenda is a genuine stacked evidence docket with every decision state and complete opening condition', () => {
  const svg = renderLearningAgendaNarrow(agenda(), {colors, measure, width:390, selectedKey:'expansion'});
  assert.match(svg, /width="390"/);
  assert.match(svg, /data-kind="learning-agenda-narrow" data-layout="stacked"/);
  assert.match(svg, /Opens when pricing and groups\./);
  assert.match(svg, /Wait until this question opens\./);
  assert.match(svg, /Missing signal/);
  assert.match(svg, /Answered no/);
  assert.match(svg, /working to the assumption Assumed = yes/i);
  assert.match(svg, /font-size="14" font-weight="600"[^>]*>Still unanswered/);
  assert.match(svg, /font-size="10"[^>]*>NEXT LEARNING MOVE<\/text>/);
  assert.match(svg, /font-size="14" font-weight="700"[^>]*>Get assumed acceptance/);
  assert.doesNotMatch(svg, /viewBox="0 0 1160/);
  for(const card of svg.match(/<g data-kind="agenda-entry"[\s\S]*?<\/g>/g) || []){
    const box = /<rect x="[\d.]+" y="([\d.]+)" width="[\d.]+" height="([\d.]+)"/.exec(card);
    assert.ok(box, 'agenda card has a measured background');
    const bottom = Number(box[1]) + Number(box[2]);
    const textYs = [...card.matchAll(/<text x="[\d.]+" y="([\d.]+)"/g)].map(match => Number(match[1]));
    assert.ok(textYs.length && textYs.every(y => y <= bottom - 8),
      'all narrow card text remains within its measured card');
  }
});

test('static agenda exports retain the semantic outline but no live interaction markup', () => {
  const view = agenda();
  for(const svg of [renderLearningAgenda(view, {colors, measure, width:1160, selectedKey:'pricing'}),
    renderLearningAgendaNarrow(view, {colors, measure, width:390, selectedKey:'pricing'})]){
    assert.match(svg, /role="img" aria-labelledby="paths-agenda-name paths-agenda-description"/);
    assert.match(svg, /<title id="paths-agenda-name">/);
    assert.match(svg, /<desc id="paths-agenda-description">/);
    assert.match(svg, /Verdict: Learn before making the expansion irreversible/);
    assert.doesNotMatch(svg, /data-select-decision|tabindex=|role="button"|aria-pressed=/);
  }
});

test('complete export can deliberately omit transient selection while retaining every docket', () => {
  const view = agenda();
  const svg = renderLearningAgenda(view, {colors, measure, width:1160,
    selectedKey:'pricing', selection:false});
  assert.doesNotMatch(svg, />SELECTED<\/text>|data-selected="true"/);
  assert.equal((svg.match(/data-kind="agenda-entry"/g) || []).length, view.entries.length);
});

test('invalid opening conditions say repair first and never tell the user to wait', () => {
  const text = `decision gated:
  question: Can this open?
  signal: threshold
  owner: Alex
  answer-by: 2026-08-20
  when: missing
`;
  const model = parse(text), view = learningAgendaProjection(model, project(model, '2026-08-13'));
  const svg = renderLearningAgendaNarrow(view, {colors, measure, width:390});
  assert.match(svg, /Opening condition needs repair — this question cannot be scheduled yet/);
  assert.match(svg, /Repair the opening condition before planning[\s\S]*any learning move\./);
  assert.match(svg, /no decision named &quot;missing&quot;/);
  assert.doesNotMatch(svg, /Wait until this question opens\./);
  assert.match(svg, /data-section="not-ready"[\s\S]*data-decision-key="gated"/);
});

test('wide and narrow agenda escape hostile text and remain finite', () => {
  const hostile = '<script>alert(1)</script> & "quoted" ' + 'X'.repeat(90);
  const view = agenda(`  Core: ${hostile} [if pricing]\n`);
  for(const svg of [renderLearningAgenda(view, {colors, measure, width:1160}),
    renderLearningAgendaNarrow(view, {colors, measure, width:320})]){
    assert.doesNotMatch(svg, /<script>/i);
    assert.match(svg, /&lt;script&gt;/);
    assert.doesNotMatch(svg, /NaN|Infinity|undefined/);
  }
});
