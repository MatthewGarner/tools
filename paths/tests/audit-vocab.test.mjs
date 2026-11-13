/* Engine-audit fixes for Paths: one vocabulary for plans, the assumption warning, the hand-off reasons. */
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {parse} from '../parse.js';
import {project} from '../project.js';
import {evaluate} from '../evaluate.js';
import {treeProjection} from '../tree.js';
import {verdict} from '../verdict.js';
import {overviewProjection} from '../overview.js';
import {decisionInspectorData} from '../inspector.js';
import {learningAgendaProjection} from '../learning-agenda.js';
import {roadmapProjectionChoices, inspectRoadmapProjection} from '../handoff-roadmap.js';
import {treeLayout} from '../layout-tree.js';
import {renderTree} from '../render-tree.js';
import {renderPlans} from '../render-plans.js';

const TODAY = '2026-11-13';
const colors = {bg: '#FBFBFA', card: '#F4F4F1', ink: '#111111', muted: '#6B6B68', border: '#D9D9D5', accent: '#1F4FD8', accentInk: '#1A44C2', err: '#B3403A', track: '#EDF0EE',
  status: {done: '#1D7A3E', doing: '#1F4FD8', risk: '#9A6A00', blocked: '#B3403A'}, statusInk: {done: '#1C753C', doing: '#1A44C2', risk: '#8E6200', blocked: '#B3403A'}};
const measure = t => String(t).length * 7;
const texts = svg => [...String(svg).matchAll(/>([^<>]+)</g)].map(x => x[1].replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&').replace(/&#39;/g, "'").replace(/&quot;/g, '"')).join(' | ');
const D = (n, extra = '', due = '2026-10-01') => `decision ${n}:\n  question: Does ${n} hold?\n  signal: s ${n}\n  owner: o\n  answer-by: ${due}\n${extra}`;
const proj = (src, today = TODAY) => project(parse(src), today);

/* ---------- PA-6 / PA-7: one vocabulary ---------- */
const THREE = D('a') + D('b') + D('c') + 'NOW\n  X: x [if a]\n  Y: y [if b]\n  Z: z';

test('PA-6: the Tree view counts distinct plans, the Plans view says combinations of answers and distinct plans', () => {
  const p = proj(THREE), tp = treeProjection(p);
  assert.equal(p.worlds.plans.length, 4);
  assert.equal(p.worlds.possibleCount, 8);
  assert.equal(tp.terminal.planCount, 4);
  const tree = texts(renderTree(tp, treeLayout(tp, {width: 1160, measure}), {colors, measure, dark: false, today: TODAY, projection: p}));
  assert.match(tree, /4 possible plans remain/);
  assert.ok(!/8 possible plans/.test(tree));
  const plans = texts(renderPlans(p, {colors, measure, dark: false, today: TODAY, projection: p, width: 1160}));
  assert.match(plans, /8 combinations of answers/);
  assert.match(plans, /4 distinct plans/);
  assert.ok(!/assignments/.test(plans));
});

test('PA-7: the refusal says how many combinations of answers there would be', () => {
  const seven = ['a', 'b', 'c', 'd', 'e', 'f', 'g'].map(n => D(n)).join('') + 'NOW\n  X: x [if a]\n  Y: y [if b or c or d or e or f or g]';
  const p = proj(seven);
  assert.equal(p.worlds.reason, 'Seven open questions would make 128 combinations of answers. Answer one, or use the Tree view.');
  const tp = treeProjection(p);
  const tree = texts(renderTree(tp, treeLayout(tp, {width: 1160, measure}), {colors, measure, dark: false, today: TODAY, projection: p}));
  assert.match(tree, /128 combinations of answers/);
  assert.ok(!/possible plans/.test(tree.replace(/possible plans? remain/g, '')) || /Enumeration limit reached/.test(tree));
});

/* ---------- PA-9: the advice names a change that clears the warning ---------- */
test('PA-9: the "not used yet" advice is about answer-by, and following it clears the warning', () => {
  const before = proj(D('a', '  assume: yes 2026-11-01\n', '2026-12-01') + 'NOW\n  X: x [if a]').warnings.find(w => w.code === 'assumption-before-due');
  assert.ok(before);
  assert.match(before.message, /answer-by/);
  assert.ok(!/change its date/.test(before.message), before.message);
  const moved = proj(D('a', '  assume: yes 2026-11-01\n', '2026-11-01') + 'NOW\n  X: x [if a]');
  assert.ok(!moved.warnings.some(w => w.code === 'assumption-before-due'));
  assert.equal(moved.items[0].itemState, 'limbo');
  const dated = proj(D('a', '  assume: yes 2026-10-01\n', '2026-12-01') + 'NOW\n  X: x [if a]').warnings.find(w => w.code === 'assumption-before-due');
  assert.ok(dated, 'moving the assumption\'s own date does not clear it (PA-8: the date is recorded, not read)');
});

/* ---------- PA-12: the hand-off names the real reason ---------- */
test('PA-12: a misspelt condition and a when: cycle refuse with their own reasons', () => {
  const typo = roadmapProjectionChoices(parse(D('a') + 'NOW\n  X: x [if aa]\nLATER\n  Y: y [if a]'), TODAY);
  assert.equal(typo.ok, false);
  assert.equal(typo.code, 'invalid-item-condition');
  assert.match(typo.reason, /does not exist/);
  const cycle = roadmapProjectionChoices(parse(D('a', '  when: b\n') + D('b', '  when: a\n') + 'NOW\n  X: x [if a]\nLATER\n  Y: y'), TODAY);
  assert.equal(cycle.ok, false);
  assert.equal(cycle.code, 'when-cycle');
  assert.match(cycle.reason, /when:/);
  assert.ok(!/complete parsed model/.test(cycle.reason + typo.reason));
  const badWhen = roadmapProjectionChoices(parse(D('a', '  when: zz\n') + 'NOW\n  X: x [if a]\nLATER\n  Y: y'), TODAY);
  assert.equal(badWhen.ok, false);
  assert.equal(badWhen.code, 'invalid-decision-condition');
  assert.match(badWhen.reason, /does not exist/);
  const m = parse(D('a') + 'NOW\n  X: x [if aa]\nLATER\n  Y: y [if a]');
  assert.equal(inspectRoadmapProjection(m, TODAY, {a: 'yes'}).code, 'invalid-item-condition');
});
