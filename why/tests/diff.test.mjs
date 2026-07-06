import {test} from 'node:test';
import assert from 'node:assert/strict';
import {parse} from '../parse.js';
import {project} from '../project.js';
import {renderOst} from '../render-ost.js';
import {whyDiff, whyNarrative, whyDiffView, flattenWhy} from '../diff.js';

const ctx = {
  colors: {card: '#fff', border: '#ddd', ink: '#222', muted: '#667', accent: '#08c',
    bg: '#f7f8f6', err: '#b33',
    status: {done: '#2a7', doing: '#08c', risk: '#c81', blocked: '#b33'}},
  measure: t => t.length * 7,
};

const OLD = `outcome: Improve retention
  Users forget to log
    Smart reminders [testing]
      ? users want nudges [testing]
  Streaks feel punishing
    Streak freeze [testing]`;

const NEW = `outcome: Improve retention
  Users forget to log
    Smart reminders [delivering]
      ? users want nudges [broken]
  Users lose progress on holiday
    Vacation mode [candidate]`;

test('flatten keys nodes by kind|label with status as state', () => {
  const f = flattenWhy(parse(OLD));
  assert.equal(f.length, 6);
  assert.ok(f.some(e => e.key === 'solution|Smart reminders' && e.state === 'testing'));
});

test('diff: added branch, solution move, broken assumption, dropped branch', () => {
  const d = whyDiff(parse(OLD), parse(NEW));
  assert.ok(d.added.some(e => e.label === 'Vacation mode'));
  assert.ok(d.moved.get('solution|smart reminders').to === 'delivering');
  assert.ok(d.moved.get('assumption|users want nudges').to === 'broken');
  assert.ok(d.dropped.some(e => e.label === 'Streak freeze'));
  assert.equal(d.any, true);
});

test('narrative reads like a discovery review', () => {
  const n = whyNarrative(whyDiff(parse(OLD), parse(NEW)), 'last sprint');
  assert.match(n, /^Since last sprint: /);
  assert.match(n, /1 opportunity \+ 1 solution added/);
  assert.match(n, /Smart reminders testing → delivering/);
  assert.match(n, /1 assumption broken/);
  assert.match(n, /2 branches dropped/);   // Streaks feel punishing + Streak freeze
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
  assert.ok(v.dropped.includes('Streak freeze'));
});

test('renderOst with diff: narrative, NEW pill, was-status pill, dropped strip', () => {
  const m = parse(NEW);
  const v = whyDiffView(whyDiff(parse(OLD), parse(NEW)), 'last sprint');
  const svg = renderOst(m, project(m), ctx, v);
  assert.match(svg, /Since last sprint/);
  assert.match(svg, />NEW<\/text>/);
  assert.match(svg, />WAS TESTING<\/text>/);
  assert.match(svg, /DROPPED SINCE/);
  assert.match(svg, /line-through/);
  assert.doesNotMatch(svg, /NaN|undefined/);
});

test('renderOst without diff is untouched by the feature', () => {
  const m = parse(NEW);
  const plain = renderOst(m, project(m), ctx);
  assert.doesNotMatch(plain, />NEW<\/text>|DROPPED SINCE|Since /);
  assert.equal(plain, renderOst(m, project(m), ctx, null));
});

test('a NEW outcome badge inverts: solid accent pill, card-colour text', () => {
  const withNewOutcome = NEW + '\noutcome: Reduce support load';
  const m = parse(withNewOutcome);
  const v = whyDiffView(whyDiff(parse(OLD), m), 'x');
  const svg = renderOst(m, project(m), ctx, v);
  /* inverted structure: the pill's stroke and the label's fill are both the
     card colour (whatever the palette scheme derived it to be) */
  assert.match(svg, /stroke="(#[0-9a-fA-F]+)" stroke-width="1.25"\/><text[^>]*fill="\1">NEW<\/text>/);
});
