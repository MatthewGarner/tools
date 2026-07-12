import {test} from 'node:test';
import assert from 'node:assert/strict';
import {renderPhase} from '../render-wizard.js';
import {renderRegister} from '../render-register.js';
import {renderBoard} from '../render-board.js';
import {newEntry, exposure, promote} from '../register.js';

const EVIL = '<img src=x onerror=alert(1)>';
const kinded = (text, kind, over = {}) => ({...newEntry(text), kind, ...over});

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

/* ---- Stage 2: FAB board + promote + kind separation ---- */
test('board splits entries into Facts / Assumptions / Beliefs by kind', () => {
  const doc = {entries: [
    kinded('gravity is real', 'fact'),
    kinded('users want habit tracking', 'assumption'),
    kinded('growth will be organic', 'belief'),
    kinded('a genuine risk', 'risk'),
  ]};
  const h = renderBoard(doc, new Date());
  assert.match(h, /gravity is real/);
  assert.match(h, /users want habit tracking/);
  assert.match(h, /growth will be organic/);
  assert.ok(!h.includes('a genuine risk'), 'risks live in the register, not the board');
});
test('board: promote button only on assumptions and beliefs, not facts', () => {
  const doc = {entries: [
    kinded('a fact', 'fact', {id: 'f1'}),
    kinded('an assumption', 'assumption', {id: 'a1'}),
    kinded('a belief', 'belief', {id: 'b1'}),
  ]};
  const h = renderBoard(doc, new Date());
  assert.match(h, /data-promote="a1"/);
  assert.match(h, /data-promote="b1"/);
  assert.ok(!h.includes('data-promote="f1"'), 'facts are certainties — nothing to promote');
});
test('board escapes hostile text and carries a column add-input per kind', () => {
  const h = renderBoard({entries: [kinded(EVIL, 'belief')]}, new Date());
  assert.ok(!h.includes('<img'));
  assert.match(h, /data-add-kind="fact"/);
  assert.match(h, /data-add-kind="assumption"/);
  assert.match(h, /data-add-kind="belief"/);
});
test('promote turns an assumption into a scored risk', () => {
  const r = promote(kinded('assume', 'assumption'), [20, 40], [50, 100]);
  assert.equal(r.kind, 'risk');
  assert.deepEqual(r.p, [20, 40]);
  assert.deepEqual(r.impact, [50, 100]);
});
test('promote pre-fill is sorted — a one-sided confidence never inverts the likelihood', () => {
  const a = kinded('assume', 'assumption', {p: [40, 0], id: 'a1'});   // one-sided confidence → naive inverse would be 100–60
  const h = renderBoard({entries: [a]}, new Date(), 'a1');
  const lo = +h.match(/data-promotep="lo"[^>]*value="(\d+)"/)[1];
  const hi = +h.match(/data-promotep="hi"[^>]*value="(\d+)"/)[1];
  assert.ok(lo <= hi, 'likelihood-wrong pre-fill not inverted (' + lo + ' <= ' + hi + ')');
});
test('register shows only risks — board items never leak in', () => {
  const rs = [{...newEntry('real risk here'), p: [30, 50], impact: [100, 200]},
              kinded('lurking assumption', 'assumption', {p: [60, 80]})];
  const h = renderRegister({title: 'T', unit: '£k', entries: rs}, exposure(rs, {seed: 1}), new Date());
  assert.match(h, /real risk here/);
  assert.ok(!h.includes('lurking assumption'), 'assumptions never appear in the register');
});
test('COLLECT and SCORE list risks only, not board items', () => {
  const es = [newEntry('a real failure mode'), kinded('lurking assumption', 'assumption')];
  const c = renderPhase({phase: 'COLLECT', entries: es}, new Date());
  assert.match(c, /a real failure mode/);
  assert.ok(!c.includes('lurking assumption'), 'COLLECT is risks only');
  const s = renderPhase({phase: 'SCORE', unit: '£k', entries: es}, new Date());
  assert.ok(!s.includes('lurking assumption'), 'SCORE is risks only');
});
