/* Every case here builds its input from a REAL document:
   parse → project → treeProjection → treeLayout → renderTree.

   The previous version of this file hand-built fixture objects with invented
   field names (`state` where the engine emits `itemState`, `displayName` where
   it emits `name`). The renderer was then written to satisfy those fixtures, so
   tests and code agreed with each other and disagreed with reality: on a real
   document every diamond carried the whole question sentence, "Following an
   assumed yes" never rendered, and a stump said only "+1". Tests that invent
   their own input cannot catch that class of defect — so these do not. */
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {parse} from '../parse.js';
import {project} from '../project.js';
import {treeProjection} from '../tree.js';
import {treeLayout} from '../layout-tree.js';
import {renderTree, renderOutline} from '../render-tree.js';

const measure = text => String(text).length * 7;
const colors = {
  bg:'#FBFBFA', card:'#F4F4F1', ink:'#111111', muted:'#6B6B68', border:'#D9D9D5',
  accent:'#1F4FD8', accentInk:'#1A44C2', err:'#B3403A', track:'#EDF0EE',
  status:{done:'#1D7A3E', doing:'#1F4FD8', risk:'#9A6A00', blocked:'#B3403A'},
  statusInk:{done:'#1C753C', doing:'#1A44C2', risk:'#8E6200', blocked:'#B3403A'},
};

function renderDoc(doc, today = '2026-12-22', width = 1160){
  const projection = project(parse(doc), today);
  const tp = treeProjection(projection);
  const layout = treeLayout(tp, {width, measure});
  return renderTree(tp, layout, {colors, measure, dark:false, today, projection});
}

const decisionBlock = (name, extra = '') =>
  `decision ${name}:\n  question: Does ${name} hold?\n  signal: a measurable signal\n` +
  `  owner: a squad\n  answer-by: 2026-12-15\n${extra}`;

/* ---------- item states, each on a document that genuinely produces it ---------- */

test('an unconditional item reads Included', () => {
  const svg = renderDoc('today: 2026-12-01\nNOW\n  Core: Streak repair');
  assert.match(svg, /Included/);
});

test('an open question with no assumption leaves its items Waiting for that question, by name', () => {
  const svg = renderDoc('today: 2026-12-01\n' + decisionBlock('groups') +
    'LATER\n  Growth: Group challenges [if groups]', '2026-12-01');
  assert.match(svg, /Waiting for groups/);
  assert.doesNotMatch(svg, /Following an assumed/);
});

test('an in-force assumption reads Following an assumed yes, never Waiting', () => {
  const svg = renderDoc('today: 2026-12-22\n' + decisionBlock('groups', '  assume: yes 2026-12-22\n') +
    'LATER\n  Growth: Group challenges [if groups]');
  assert.match(svg, /Following an assumed yes/);
  assert.doesNotMatch(svg, /Waiting for groups/);
});

test('an assumed no is distinguished from an assumed yes', () => {
  const svg = renderDoc('today: 2026-12-22\n' + decisionBlock('groups', '  assume: no 2026-12-22\n') +
    'LATER\n  Growth: Group challenges [if groups]');
  assert.match(svg, /Following an assumed no/);
  assert.doesNotMatch(svg, /Following an assumed yes/);
});

test('an answered question marks the other arm Not needed', () => {
  const svg = renderDoc('today: 2026-12-22\n' +
    decisionBlock('reminders', '  answer: yes 2026-10-15\n') +
    'LATER\n  Core: Reminder digest [if reminders]\n  Core: Manual outreach [unless reminders]');
  assert.match(svg, /Not needed/);
});

/* ---------- the stump ---------- */

test('an answered question paints ONE collapsed stump carrying its count and the words Not needed', () => {
  const svg = renderDoc('today: 2026-12-22\n' +
    decisionBlock('reminders', '  answer: yes 2026-10-15\n') +
    'LATER\n  Core: Reminder digest [if reminders]\n' +
    '  Core: Manual outreach [unless reminders]\n  Core: Phone calls [unless reminders]');
  const stumps = svg.match(/data-kind="stump"/g) || [];
  assert.equal(stumps.length, 1, 'exactly one stump, never a litter of dead cards');
  assert.match(svg, /Not needed · 2/);
});

/* ---------- question labels ---------- */

test('a question is labelled with its NAME and state, never its question sentence', () => {
  const doc = 'today: 2026-12-01\ndecision groups:\n' +
    '  question: Do people add three friends without prompting?\n' +
    '  signal: invites per user >= 3\n  owner: growth squad\n  answer-by: 2026-12-15\n' +
    'LATER\n  Growth: Group challenges [if groups]';
  const svg = renderDoc(doc, '2026-12-01');
  assert.match(svg, />groups</, 'the diamond carries the short name');
  assert.doesNotMatch(svg, /Do people add three friends/,
    'the question sentence belongs in the inspector, not on the diamond');
});

test('each question state renders its display word', () => {
  const answered = renderDoc('today: 2026-12-22\n' + decisionBlock('a', '  answer: yes 2026-10-15\n') +
    'LATER\n  Core: X [if a]');
  assert.match(answered, /Answer: yes/);
  const no = renderDoc('today: 2026-12-22\n' + decisionBlock('a', '  answer: no 2026-10-15\n') +
    'LATER\n  Core: X [if a]');
  assert.match(no, /Answer: no/);
  const open = renderDoc('today: 2026-12-01\n' + decisionBlock('a') + 'LATER\n  Core: X [if a]', '2026-12-01');
  assert.match(open, /Open/);
});

/* ---------- safety and the display boundary ---------- */

test('model-derived strings are XML-escaped', () => {
  const svg = renderDoc('today: 2026-12-01\n' + decisionBlock('groups') +
    'LATER\n  A & <b>: Ship <it> & win [if groups]', '2026-12-01');
  assert.match(svg, /&amp;/);
  assert.doesNotMatch(svg, /<b>:/, 'a raw angle bracket from the document must never reach the markup');
});

test('display copy never leaks an engine identifier', () => {
  const svg = renderDoc('today: 2026-12-22\n' +
    decisionBlock('groups', '  assume: yes 2026-12-22\n') +
    decisionBlock('pricing', '  when: groups\n') +
    decisionBlock('done-one', '  answer: no 2026-10-15\n') +
    'NOW\n  Core: Shared\nLATER\n  Core: A [if groups]\n  Core: B [unless done-one]\n  Core: C [if pricing]');
  for(const word of ['moot', 'dormant', 'limbo', 'provenance', 'enumerable', 'in-plan', 'not-needed'])
    assert.equal(svg.includes(word), false, `${word} leaked into display copy`);
});

test('risk and blocked stay small tags; the conditional treatment owns the card', () => {
  const svg = renderDoc('today: 2026-12-01\n' + decisionBlock('groups') +
    'LATER\n  Core: Risky thing [risk] [if groups]', '2026-12-01');
  assert.match(svg, /RISK/);
  assert.match(svg, /Waiting for groups/, 'the conditional state still owns the card');
});

test('an item whose condition names no known question is kept in a labelled band', () => {
  const svg = renderDoc('today: 2026-12-01\nNOW\n  Core: Orphan [if nobody]', '2026-12-01');
  assert.match(svg, /Unplaced/);
  assert.match(svg, /Orphan/, 'malformed input degrades loudly; it is never dropped');
});

/* ---------- XML rules the export decoder enforces ---------- */

test('every fill and stroke hex has a valid length', () => {
  const svg = renderDoc('today: 2026-12-22\n' + decisionBlock('groups', '  assume: yes 2026-12-22\n') +
    'NOW\n  Core: Shared\nLATER\n  Core: A [if groups]');
  for(const match of svg.matchAll(/(?:fill|stroke)="#([0-9a-fA-F]+)"/g))
    assert.ok([3, 4, 6, 8].includes(match[1].length), `invalid hex #${match[1]}`);
});

test('every tag is strictly well-formed: no bare attributes, no stray quotes', () => {
  const svg = renderDoc('today: 2026-12-22\n' + decisionBlock('groups') +
    'NOW\n  Core: Shared\nLATER\n  Core: A [if groups]');
  const TAG = /^<[a-zA-Z][\w:-]*((\s+[\w:-]+=("[^"<]*"|'[^'<]*'))*)\s*\/?>$/;
  for(const tag of svg.match(/<[^!/][^>]*>/g) || [])
    assert.match(tag, TAG, `malformed tag ${tag.slice(0, 120)}`);
});

/* ---------- the narrow outline (below a 520px container) ---------- */

function outlineDoc(doc, today = '2026-12-22', width = 360){
  const projection = project(parse(doc), today);
  return renderOutline(treeProjection(projection), {colors, measure, dark:false, today, width});
}

test('the outline stacks shared work, then each question with its arms', () => {
  const svg = outlineDoc('today: 2026-12-01\n' + decisionBlock('groups') +
    'NOW\n  Core: Streak repair\nLATER\n  Growth: Challenges [if groups]\n  Core: Solo [if not groups]', '2026-12-01');
  assert.match(svg, /Shared work/);
  assert.match(svg, /Streak repair/);
  assert.match(svg, /If so/);
  assert.match(svg, /If not/);
  assert.match(svg, /Waiting for groups/);
});

test('the outline names an answered breadcrumb by its answer, never "Open"', () => {
  const svg = outlineDoc('today: 2026-12-22\n' + decisionBlock('reminders', '  answer: yes 2026-10-15\n') +
    decisionBlock('groups') + 'LATER\n  Core: Digest [if reminders]\n  Core: Challenges [if groups]');
  assert.doesNotMatch(svg, /reminders · Open/, 'an answered question is not open');
});

test('dates read as "15 Dec", not as raw ISO, in both renderers', () => {
  const doc = 'today: 2026-12-01\n' + decisionBlock('groups') + 'LATER\n  Core: A [if groups]';
  assert.match(outlineDoc(doc, '2026-12-01'), /Due 15 Dec/);
  assert.match(renderDoc(doc, '2026-12-01'), /Due · 15 Dec/);
});

test('the outline is content-driven in height and never wider than its container', () => {
  const short = outlineDoc('today: 2026-12-01\nNOW\n  Core: One', '2026-12-01');
  const long = outlineDoc('today: 2026-12-01\nNOW\n' +
    Array.from({length: 12}, (_, i) => `  Core: Item ${i}`).join('\n'), '2026-12-01');
  const heightOf = svg => Number(/height="([\d.]+)"/.exec(svg)[1]);
  assert.ok(heightOf(long) > heightOf(short), 'height grows with content');
  assert.equal(Number(/width="([\d.]+)"/.exec(long)[1]), 360);
});
