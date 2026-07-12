import {test} from 'node:test';
import assert from 'node:assert/strict';
import {renderPhase} from '../render-wizard.js';
import {renderRegister} from '../render-register.js';
import {newEntry, exposure} from '../register.js';

const EVIL = '<img src=x onerror=alert(1)>';

test('FRAME renders title + question inputs', () => {
  const h = renderPhase({phase: 'FRAME', title: '', question: ''}, new Date());
  assert.match(h, /data-field="title"/);
  assert.match(h, /data-field="question"/);
});
test('WRITE renders a countdown with data-ends epoch', () => {
  assert.match(renderPhase({phase: 'WRITE', endsAt: 999}, new Date()), /data-ends="999"/);
});
test('COLLECT: entry input + lexicon chips + escaped text', () => {
  const h = renderPhase({phase: 'COLLECT', entries: [newEntry(EVIL)]}, new Date());
  assert.match(h, /data-add="entry"/);
  assert.ok(!h.includes('<img'), 'hostile text escaped');
  assert.match(h, /data-tag="tiger"/);
});
test('SCORE: paired p and impact inputs', () => {
  const h = renderPhase({phase: 'SCORE', unit: '£k', entries: [newEntry('r')]}, new Date());
  assert.match(h, /data-p="lo"/);
  assert.match(h, /data-p="hi"/);
  assert.match(h, /data-impact="hi"/);
});
test('VOTE renders the pool arithmetic (people × 3) + vote hooks', () => {
  const doc = {phase: 'VOTE', people: 4, entries: [{...newEntry('r'), p: [10, 20], impact: [1, 2],
    actions: [{text: 'a', owner: '', done: false, votes: 0}]}]};
  const h = renderPhase(doc, new Date());
  assert.match(h, /12/);                 // pool = 4 × 3
  assert.match(h, /data-vote="1"/);
});
test('REGISTER orders by exposure, marks staleness, escapes text', () => {
  const rs = [{...newEntry('small'), p: [5, 10], impact: [10, 20]},
    {...newEntry('BIG ' + EVIL), p: [40, 60], impact: [100, 200]}];
  const doc = {phase: 'REGISTER', title: 'T', unit: '£k', entries: rs};
  const h = renderRegister(doc, exposure(rs, {seed: 1}), new Date());
  assert.ok(!h.includes('<img'));
  assert.ok(h.indexOf('BIG') < h.indexOf('small'), 'higher exposure ranked first');
  assert.match(h, /fresh|ageing|stale/);
  assert.match(h, /portfolio/i);
});
