import {test} from 'node:test';
import assert from 'node:assert/strict';
import {parse} from '../parse.js';
import {project} from '../project.js';
import {renderCausalField as renderOst} from '../render-causal-field.js';
import {whyDiff, whyNarrative, whyDiffView, flattenWhy} from '../diff.js';

const ctx = {
  colors: {card: '#fff', border: '#ddd', ink: '#222', muted: '#667', accent: '#08c',
    bg: '#f7f8f6', err: '#b33',
    status: {done: '#2a7', doing: '#08c', risk: '#c81', blocked: '#b33'}},
  measure: t => t.length * 7,
};

const OLD = `outcome: Improve retention
  Users forget to log
    Reading reminders [testing]
      ? users want nudges [testing]
  Recommendations feel random
    Resume where you left off [testing]`;

const NEW = `outcome: Improve retention
  Users forget to log
    Reading reminders [delivering]
      ? users want nudges [broken]
  Users lose progress on holiday
    Vacation mode [candidate]`;

test('flatten keys nodes by structural ancestry and sibling occurrence with status as state', () => {
  const f = flattenWhy(parse(OLD));
  assert.equal(f.length, 6);
  assert.ok(f.some(e => e.key.endsWith('/solution:Reading reminders#0') && e.state === 'testing'));
});

test('diff: added branch, solution move, broken assumption, dropped branch', () => {
  const d = whyDiff(parse(OLD), parse(NEW));
  assert.ok(d.added.some(e => e.label === 'Vacation mode'));
  assert.ok([...d.moved.values()].some(move => move.item.label === 'Reading reminders' && move.to === 'delivering'));
  assert.ok([...d.moved.values()].some(move => move.item.label === 'users want nudges' && move.to === 'broken'));
  assert.ok(d.dropped.some(e => e.label === 'Resume where you left off'));
  assert.equal(d.any, true);
});

test('narrative reads like a discovery review', () => {
  const n = whyNarrative(whyDiff(parse(OLD), parse(NEW)), 'last sprint');
  assert.match(n, /^Since last sprint: /);
  assert.match(n, /1 opportunity \+ 1 solution added/);
  assert.match(n, /Reading reminders testing → delivering/);
  assert.match(n, /1 assumption broken/);
  assert.match(n, /2 branches dropped/);   // Recommendations feel random + Resume where you left off
});

test('no changes → says so', () => {
  const n = whyNarrative(whyDiff(parse(OLD), parse(OLD)), 'yesterday');
  assert.equal(n, 'Since yesterday: no changes to the tree.');
});

test('view: NEW badge on added cards, was-status on moved solutions, none on assumptions', () => {
  const d = whyDiff(parse(OLD), parse(NEW));
  const v = whyDiffView(d, 'last sprint');
  const m = parse(NEW);
  const vacation = m.outcomes[0].children[1].children[0];
  assert.deepEqual(v.badge(vacation), {kind: 'new', label: 'NEW'});
  const reminders = m.outcomes[0].children[0].children[0];
  assert.deepEqual(v.badge(reminders), {kind: 'moved', label: 'was testing'});
  assert.ok(v.dropped.includes('Resume where you left off'));
});

test('Causal Tree with diff: narrative, new/moved labels, and dropped receipt', () => {
  const m = parse(NEW);
  const v = whyDiffView(whyDiff(parse(OLD), parse(NEW)), 'last sprint');
  const svg = renderOst(m, project(m), ctx, v);
  assert.match(svg, /Since last sprint/);
  assert.match(svg, />NEW<\/text>/);
  assert.match(svg, />WAS TESTING<\/text>/);
  assert.match(svg, /data-causal-dropped=""/);
  assert.match(svg, /line-through/);
  assert.doesNotMatch(svg, /NaN|undefined/);
});

test('renderOst without diff is untouched by the feature', () => {
  const m = parse(NEW);
  const plain = renderOst(m, project(m), ctx);
  assert.doesNotMatch(plain, />NEW<\/text>|DROPPED SINCE|Since /);
  assert.equal(plain, renderOst(m, project(m), ctx, null));
});

test('a new outcome stays a restrained text receipt, not an accent pill', () => {
  const withNewOutcome = NEW + '\noutcome: Reduce support load';
  const m = parse(withNewOutcome);
  const v = whyDiffView(whyDiff(parse(OLD), m), 'x');
  const svg = renderOst(m, project(m), ctx, v);
  assert.match(svg, /data-causal-diff="new"[^>]*>NEW<\/text>/);
  assert.doesNotMatch(svg, /rx="[\d.]+"[^>]*>NEW<\/text>/);
});

test('duplicate authored labels remain separate source claims in diff badges', () => {
  const oldSource = 'outcome: O\n  Need A\n    Repeat [testing]\n  Need B\n    Repeat [testing]';
  const nextSource = 'outcome: O\n  Need A\n    Repeat [testing]\n  Need B\n    Repeat [delivering]';
  const model = parse(nextSource), view = whyDiffView(whyDiff(parse(oldSource), model), 'yesterday');
  const first = model.outcomes[0].children[0].children[0];
  const second = model.outcomes[0].children[1].children[0];
  assert.equal(view.badge(first), null, 'the unchanged duplicate does not inherit its sibling\'s move');
  assert.deepEqual(view.badge(second), {kind:'moved', label:'was testing'}, 'the changed duplicate keeps its own source identity');
});

test('case and whitespace variants still receive separate structural occurrences', () => {
  const oldSource = 'outcome: O\n  Need\n    A [testing]\n    a [testing]';
  const nextSource = 'outcome: O\n  Need\n    A [delivering]\n    a [testing]';
  const model = parse(nextSource), view = whyDiffView(whyDiff(parse(oldSource), model), 'yesterday');
  const first = model.outcomes[0].children[0].children[0];
  const second = model.outcomes[0].children[0].children[1];
  assert.deepEqual(view.badge(first), {kind:'moved', label:'was testing'});
  assert.equal(view.badge(second), null, 'normalised sibling labels do not collapse into one badge');
});

test('inserting above existing source claims does not turn later branches into false NEW and dropped pairs', () => {
  const oldSource = 'outcome: O\n  Need A\n    One [testing]\n  Need B\n    Two [testing]';
  const nextSource = 'outcome: O\n  Need A\n    New [candidate]\n    One [testing]\n  Need B\n    Two [testing]';
  const diff = whyDiff(parse(oldSource), parse(nextSource));
  assert.deepEqual(diff.added.map(item => item.label), ['New']);
  assert.equal(diff.dropped.length, 0, 'line shifts preserve structurally-identical later branches');
});
