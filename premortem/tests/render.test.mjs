import {test} from 'node:test';
import assert from 'node:assert/strict';
import {renderPhase} from '../render-wizard.js';
import {renderRegister} from '../render-register.js';
import {renderBoard, boardVerdict} from '../render-board.js';
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
  assert.match(h, /aria-label="Likelihood low for r"/);
  assert.match(h, /aria-label="Likelihood high for r"/);
  assert.match(h, /aria-label="Impact low for r"/);
  assert.match(h, /aria-label="Impact high for r"/);
});

test('SCORE renders a partial range as an empty field, never the string null', () => {
  const e = {...newEntry('r'), p: [25, null], impact: [null, 40]};
  const h = renderPhase({phase: 'SCORE', unit: '£k', entries: [e]}, new Date());
  assert.ok(!h.includes('value="null"'));
  assert.match(h, /data-p="lo"[^>]*value="25"/);
  assert.match(h, /data-p="hi"[^>]*value=""/);
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
    kinded('users want reading', 'assumption'),
    kinded('growth will be organic', 'belief'),
    kinded('a genuine risk', 'risk'),
  ]};
  const h = renderBoard(doc, new Date());
  assert.match(h, /gravity is real/);
  assert.match(h, /users want reading/);
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
test('board numeric ranges have specific accessible names', () => {
  const e = kinded('checkout risk', 'assumption', {id: 'a1'});
  const card = renderBoard({entries: [e]}, new Date());
  assert.match(card, /aria-label="Confidence low for checkout risk"/);
  assert.match(card, /aria-label="Confidence high for checkout risk"/);
  const promoteForm = renderBoard({entries: [e]}, new Date(), 'a1');
  assert.match(promoteForm, /aria-label="Likelihood wrong low for checkout risk"/);
  assert.match(promoteForm, /aria-label="Impact high for checkout risk"/);
});
test('boardVerdict names one figure, verbatim in the line, on every branch', () => {
  const cases = [
    boardVerdict([]),
    boardVerdict([kinded('a', 'fact'), kinded('b', 'fact')]),
    boardVerdict([kinded('a', 'fact'), kinded('b', 'assumption'), kinded('c', 'belief')]),
  ];
  assert.equal(cases[0].fig, '', 'no number on the empty board — a phrase never takes the red');
  assert.equal(cases[1].fig, '2');
  assert.match(cases[1].line, /^2 facts and nothing taken on faith/);
  assert.equal(cases[2].fig, '2');
  assert.match(cases[2].line, /^2 assumptions & beliefs on the board/);
  for(const v of cases) assert.ok(v.line.includes(v.fig), 'figure verbatim in: ' + v.line);
});
test('board renders the verdict as the 6b block with exactly one .fig', () => {
  const h = renderBoard({entries: [kinded('a', 'assumption'), kinded('b', 'belief')]}, new Date());
  assert.match(h, /<div class="verdict-block"><div class="vkick">Verdict<\/div>/);
  assert.equal((h.match(/class="fig"/g) || []).length, 1);
  assert.match(h, /<span class="fig">2<\/span> assumptions &amp; beliefs/);
  assert.ok(!h.includes('boardverdict'), 'the old paragraph is gone');
});
test('promote turns an assumption into a scored risk', () => {
  const r = promote(kinded('assume', 'assumption'), [20, 40], [50, 100]);
  assert.equal(r.kind, 'risk');
  assert.deepEqual(r.p, [20, 40]);
  assert.deepEqual(r.impact, [50, 100]);
});
test('promote pre-fill ignores an invalid confidence range instead of inventing bounds', () => {
  const a = kinded('assume', 'assumption', {p: [40, 0], id: 'a1'});   // legacy one-sided value created by the old null→0 coercion
  const h = renderBoard({entries: [a]}, new Date(), 'a1');
  assert.match(h, /data-promotep="lo"[^>]*value=""/);
  assert.match(h, /data-promotep="hi"[^>]*value=""/);
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

test('pre-parade renders opportunity language and no likelihood/impact score controls', () => {
  const e = kinded('Keep the old onboarding reversible', 'opportunity', {essential: true, actions: [{text: 'Run an A/B cutover', owner: 'Alex', votes: 2}]});
  const doc = {mode: 'success', title: 'Lantern win', question: 'What did we do?', unit: '£k', phase: 'SCORE', entries: [e, kinded('board belief', 'belief')]};
  const score = renderPhase(doc, new Date());
  assert.match(score, /Must make true/);
  assert.ok(!score.includes('likelihood'));
  assert.ok(!score.includes('data-impact'));
  assert.ok(!score.includes('board belief'));
  const register = renderRegister({...doc, phase: 'REGISTER'}, exposure([], {seed: 1}), new Date());
  assert.match(register, /Success register/);
  assert.match(register, /must make true/);
  assert.ok(!register.includes('Portfolio exposure'));
  assert.ok(!register.includes('EV-ranked'));
});

test('pre-parade collect keeps the risk lexicon out of success conditions', () => {
  const collect = renderPhase({mode: 'success', phase: 'COLLECT', entries: [
    kinded('Keep the old onboarding reversible', 'opportunity'),
  ]}, new Date());
  assert.ok(!collect.includes('data-tag='));
  assert.ok(!collect.includes('paper tiger'));
});

test('pre-parade board promotion is direct and never asks for numeric harm ranges', () => {
  const h = renderBoard({mode: 'success', entries: [kinded('Coaches will join', 'belief', {id: 'b1'})]}, new Date(), 'b1');
  assert.match(h, /Add to success register/);
  assert.ok(!h.includes('data-promoteimpact'));
  assert.ok(!h.includes('data-promotep'));
});
