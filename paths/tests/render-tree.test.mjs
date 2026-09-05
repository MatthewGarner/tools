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

function renderInteractiveDoc(doc, {today = '2026-12-22', width = 1160,
  selectedKey = null, narrow = false} = {}){
  const projection = project(parse(doc), today);
  const tp = treeProjection(projection);
  const ctx = {colors, measure, dark:false, today, projection, interactive:true, selectedKey};
  return narrow
    ? renderOutline(tp, {...ctx, width})
    : renderTree(tp, treeLayout(tp, {width, measure}), ctx);
}

const decisionBlock = (name, extra = '') =>
  `decision ${name}:\n  question: Does ${name} hold?\n  signal: a measurable signal\n` +
  `  owner: a squad\n  answer-by: 2026-12-15\n${extra}`;

test('interactive wide questions are named keyboard buttons carrying stable parsed identity', () => {
  const svg = renderInteractiveDoc(decisionBlock('groups') +
    'LATER\n  Growth: Club challenges [if groups]', {selectedKey:'groups'});
  assert.match(svg, /role="group" aria-labelledby="paths-tree-name paths-tree-description"/);
  assert.match(svg, /data-kind="question" data-select-decision="" data-decision-key="groups" data-line="0" data-selected="true" aria-expanded="true" aria-controls="decision-inspector" tabindex="0" role="button" aria-label="Inspect question groups — 7 days overdue"/);
});

test('interactive collapsed breadcrumbs retain a 44px hit target and answer-labelled button', () => {
  const svg = renderInteractiveDoc(decisionBlock('groups', '  answer: yes 2026-12-10\n') +
    'LATER\n  Growth: Club challenges [if groups]', {width:1});
  assert.match(svg, /data-kind="breadcrumb" data-select-decision="" data-decision-key="groups"/);
  assert.match(svg, /aria-label="Inspect question groups — Answer: yes"/);
  assert.match(svg, /<rect data-hit=""[^>]*height="44" fill="transparent"/);
});

test('interactive narrow questions are full-row 44px keyboard targets with selected state', () => {
  const svg = renderInteractiveDoc(decisionBlock('groups') +
    'LATER\n  Growth: Club challenges [if groups]',
  {width:390, narrow:true, selectedKey:'groups'});
  assert.match(svg, /data-kind="outline-question" data-select-decision="" data-decision-key="groups" data-line="0" data-selected="true" aria-expanded="true" aria-controls="decision-inspector" tabindex="0" role="button"/);
  assert.match(svg, /<rect data-hit=""[^>]*height="44" fill="transparent"/);
});

test('export renderers remain non-interactive images with no selection attributes', () => {
  const doc = decisionBlock('groups') + 'LATER\n  Growth: Club challenges [if groups]';
  for(const svg of [renderDoc(doc), outlineDoc(doc)]){
    assert.match(svg, /role="img"/);
    assert.doesNotMatch(svg, /data-select-decision|data-selected|tabindex="0"/);
  }
});

/* ---------- item states, each on a document that genuinely produces it ---------- */

test('an unconditional item reads Included', () => {
  const svg = renderDoc('today: 2026-12-01\nNOW\n  Core: Resume position fix');
  assert.match(svg, /Included/);
});

test('an open question with no assumption leaves its items Waiting for that question, by name', () => {
  const svg = renderDoc('today: 2026-12-01\n' + decisionBlock('groups') +
    'LATER\n  Growth: Club challenges [if groups]', '2026-12-01');
  assert.match(svg, /Waiting for groups/);
  assert.doesNotMatch(svg, /Following an assumed/);
});

test('an in-force assumption reads Following an assumed yes, never Waiting', () => {
  const svg = renderDoc('today: 2026-12-22\n' + decisionBlock('groups', '  assume: yes 2026-12-22\n') +
    'LATER\n  Growth: Club challenges [if groups]');
  assert.match(svg, /Following an assumed yes/);
  assert.doesNotMatch(svg, /Waiting for groups/);
});

test('an assumed no is distinguished from an assumed yes', () => {
  const svg = renderDoc('today: 2026-12-22\n' + decisionBlock('groups', '  assume: no 2026-12-22\n') +
    'LATER\n  Growth: Club challenges [if groups]');
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

test('an answered question with no rejected work paints no empty stump', () => {
  const svg = renderDoc('today: 2026-12-22\n' +
    decisionBlock('reminders', '  answer: yes 2026-10-15\n') +
    'LATER\n  Core: Reminder digest [if reminders]');
  assert.doesNotMatch(svg, /data-kind="stump"/);
  assert.doesNotMatch(svg, /Not needed · 0/);
});

test('completed rejected work stays Completed on its actual arm and never inflates the Not needed stump', () => {
  const svg = renderDoc('today: 2026-12-22\n' +
    decisionBlock('reminders', '  answer: yes 2026-10-15\n') +
    'LATER\n  Core: Already shipped [unless reminders] [done]\n' +
    '  Core: Unbuilt fallback [unless reminders]');
  assert.match(svg, /Already shipped/);
  assert.match(svg, /Completed/);
  assert.match(svg, /Not needed · 1/);
  assert.doesNotMatch(svg, /Not needed · 2/);
});

test('answered compound work still waiting on another dependency renders wide and narrow', () => {
  const doc = 'today: 2026-12-20\n' +
    decisionBlock('approved', '  answer: yes 2026-12-20\n').replace('2026-12-15', '2026-12-31') +
    decisionBlock('research').replace('2026-12-15', '2026-12-01') +
    'LATER\n  Core: Launch after both [if approved and research]';
  for(const svg of [renderDoc(doc, '2026-12-20'), outlineDoc(doc, '2026-12-20')]){
    assert.match(svg, /Launch after both/);
    assert.match(svg, /Waiting for research/);
    assert.match(svg, /If so/);
  }
});

test('a compound continuation can remain limbo after its parent is answered', () => {
  const doc = 'today: 2026-12-20\n' +
    decisionBlock('approved', '  answer: yes 2026-12-20\n').replace('2026-12-15', '2026-12-31') +
    decisionBlock('research', '  assume: yes 2026-12-20\n').replace('2026-12-15', '2026-12-01') +
    'LATER\n  Core: Launch after both [if approved and research]';
  for(const svg of [renderDoc(doc, '2026-12-20'), outlineDoc(doc, '2026-12-20')]){
    assert.match(svg, /Launch after both/);
    assert.match(svg, /Following an assumed yes/);
  }
});

test('answered-no continuations and mixed rejected work keep truthful arm labels', () => {
  const doc = 'today: 2026-12-20\n' +
    decisionBlock('approved', '  answer: no 2026-12-20\n').replace('2026-12-15', '2026-12-31') +
    decisionBlock('research').replace('2026-12-15', '2026-12-01') +
    'LATER\n  Core: Launch another way [if not approved and research]\n' +
    '  Core: Earlier approved work [if approved] [done]\n' +
    '  Core: Unbuilt approved work [if approved]';
  for(const svg of [renderDoc(doc, '2026-12-20'), outlineDoc(doc, '2026-12-20')]){
    assert.match(svg, /Launch another way/);
    assert.match(svg, /Waiting for research/);
    assert.match(svg, /If not/);
    assert.match(svg, /Earlier approved work/);
    assert.match(svg, /Completed/);
    assert.match(svg, /If so/);
    assert.match(svg, /Not needed · 1/);
  }
});

test('a collapsed answered question keeps answer and branch context beside its continuation', () => {
  const doc = 'today: 2026-12-20\n' +
    decisionBlock('approved', '  answer: yes 2026-12-20\n') +
    'LATER\n  Core: Launch [if approved]';
  const svg = renderDoc(doc, '2026-12-20', 1);
  assert.match(svg, /data-kind="breadcrumb"/);
  assert.match(svg, /Yes · If so/);
  assert.match(svg, /Launch/);
  assert.match(svg, /Included/);
});

test('a fully collapsed answer renders chosen, completed rejected, and not-needed rejected work with context', () => {
  const doc = 'today: 2026-12-20\n' +
    decisionBlock('fork', '  answer: yes 2026-12-20\n') +
    'LATER\n  Core: Chosen [if fork]\n  Core: Done fallback [unless fork] [done]\n' +
    '  Core: Unbuilt fallback [unless fork]';
  const svg = renderDoc(doc, '2026-12-20', 1);
  for(const text of ['Chosen', 'Done fallback', 'Unbuilt fallback', 'Not needed', 'Yes · If so', 'If not'])
    assert.match(svg, new RegExp(text));
  assert.match(svg, /data-treatment="completed"/);
  assert.match(svg, /data-kind="stump"/);
});

/* ---------- question labels ---------- */

test('a question is labelled with its NAME and state, never its question sentence', () => {
  const doc = 'today: 2026-12-01\ndecision groups:\n' +
    '  question: Do people add three friends without prompting?\n' +
    '  signal: invites per user >= 3\n  owner: growth squad\n  answer-by: 2026-12-15\n' +
    'LATER\n  Growth: Club challenges [if groups]';
  const svg = renderDoc(doc, '2026-12-01');
  assert.match(svg, />groups</, 'the diamond carries the short name');
  assert.doesNotMatch(svg, /Do people add three friends/,
    'the question sentence belongs in the inspector, not on the diamond');
});

test('the wide tree explicitly labels both arm directions even when the arms are empty', () => {
  const svg = renderDoc('today: 2026-12-01\n' + decisionBlock('unused'), '2026-12-01');
  assert.match(svg, /If so/);
  assert.match(svg, /If not/);
});

test('the wide Tree ends with the remaining plan count and its non-enumeration boundary', () => {
  const svg = renderDoc('today: 2026-12-01\n' + decisionBlock('groups') +
    decisionBlock('pricing'), '2026-12-01');
  assert.match(svg, /data-kind="tree-terminal" data-state="count"/);
  assert.match(svg, /4 possible plans remain/);
  assert.match(svg, /Tree does not enumerate/);
  assert.match(svg, /every combined plan/);
});

test('a real document with only unconditional work renders no open-plan terminal', () => {
  const svg = renderDoc('NOW\n  Core: Only work', '2026-12-01');
  assert.match(svg, /Only work/);
  assert.doesNotMatch(svg, /data-kind="tree-terminal"/);
  assert.doesNotMatch(svg, /After the open decisions/);
});

test('a fully answered real document renders no open-plan terminal', () => {
  const svg = renderDoc('today: 2026-12-20\n' +
    decisionBlock('settled', '  answer: yes 2026-12-20\n') +
    'NOW\n  Core: Chosen [if settled]\n  Core: Rejected [unless settled]', '2026-12-20');
  assert.match(svg, /Answer: yes/);
  assert.doesNotMatch(svg, /data-kind="tree-terminal"/);
  assert.doesNotMatch(svg, /After the open decisions/);
});

test('the wide Tree explicitly renders the enumeration-refused limit from a real document', () => {
  const decisions = Array.from({length:7}, (_, index) => decisionBlock(`q${index}`));
  const svg = renderDoc('today: 2026-12-01\n' + decisions.join(''), '2026-12-01');
  assert.match(svg, /data-kind="tree-terminal" data-state="limit"/);
  assert.match(svg, /Enumeration limit reached/);
  assert.match(svg, /128 possible plans/);
  assert.match(svg, /Tree does not enumerate/);
  assert.match(svg, /every combined plan/);
});

test('unequal real arm streams retain both horizon labels and every item', () => {
  const svg = renderDoc('today: 2026-12-01\n' + decisionBlock('fork') +
    'LATER\n  Core: Yes work [if fork]\n  Core: No one [unless fork]\n' +
    '  Core: No two [unless fork]\n  Core: No three [unless fork]', '2026-12-01');
  for(const text of ['If so', 'If not', 'Yes work', 'No one', 'No two', 'No three'])
    assert.match(svg, new RegExp(text));
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

test('all four work statuses, notes and projected dependency names render as separate card content', () => {
  const doc = 'today: 2026-12-01\n' + decisionBlock('long-meaningful-decision-name') +
    decisionBlock('coach-pricing') +
    'NOW\n  Core: Finished [done]\n  Core: Underway [doing]\n  Core: Exposed [risk]\n' +
    '  Core: Stuck [blocked]\nLATER\n' +
    '  Marketplace: Joint launch [if long-meaningful-decision-name and coach-pricing] -- Preserve this note';
  const svg = renderDoc(doc, '2026-12-01');
  for(const status of ['DONE', 'DOING', 'RISK', 'BLOCKED']) assert.match(svg, new RegExp('>' + status + '<'));
  assert.match(svg, /Preserve this note/);
  assert.match(svg, /Needs · long-meaningful-decision-name/,
    'the full primary decision name survives in the dependency tag title');
  assert.match(svg, /Also · coach-pricing/);
});

test('an item whose condition names no known question is kept in a labelled band', () => {
  const svg = renderDoc('today: 2026-12-01\nNOW\n  Core: Orphan [if nobody]', '2026-12-01');
  assert.match(svg, /Unplaced/);
  assert.match(svg, /Orphan/, 'malformed input degrades loudly; it is never dropped');
  assert.match(svg, /Condition needs fixing/);
  assert.doesNotMatch(svg, /Not open yet/);
});

test('malformed condition evidence renders Condition needs fixing in wide and narrow views', () => {
  const doc = 'today: 2026-12-01\n' + decisionBlock('groups') + decisionBlock('pricing') +
    'NOW\n  Core: Broken [if groups and pricing or groups]';
  const wide = renderDoc(doc, '2026-12-01');
  const narrow = outlineDoc(doc, '2026-12-01');
  for(const svg of [wide, narrow]){
    assert.match(svg, /Condition needs fixing/);
    assert.doesNotMatch(svg, /Waiting for/);
    assert.doesNotMatch(svg, /Not open yet/);
  }
});

test('contradictory repeated terms stay visible as condition errors at wide and constrained widths', () => {
  const doc = 'today: 2026-12-20\n' + decisionBlock('a', '  answer: yes 2026-12-20\n') +
    'NOW\n  Core: Item [if a and not a]';
  for(const svg of [renderDoc(doc, '2026-12-20', 1160), renderDoc(doc, '2026-12-20', 1)]){
    assert.match(svg, /Item/);
    assert.match(svg, /Condition needs fixing/);
    assert.match(svg, /data-kind="unplaced"/);
  }
});

test('OR alternatives never claim that a secondary question is also required', () => {
  const orSvg = renderDoc('today: 2026-12-01\n' + decisionBlock('groups') + decisionBlock('pricing') +
    'NOW\n  Core: Either path [if groups or pricing]', '2026-12-01');
  assert.doesNotMatch(orSvg, /Also ·/);
  const andSvg = renderDoc('today: 2026-12-01\n' + decisionBlock('groups') + decisionBlock('pricing') +
    'NOW\n  Core: Joint path [if groups and pricing]', '2026-12-01');
  assert.match(andSvg, /Also ·/);
});

test('hostile custom accent text is rejected before parser output reaches SVG attributes', () => {
  const doc = 'accent: #fff\" onload=\"alert(1)\nNOW\n  Core: Safe';
  const parsed = parse(doc);
  assert.equal(parsed.accent, null);
  const projection = project(parsed, '2026-12-01');
  const topology = treeProjection(projection);
  const svg = renderTree(topology, treeLayout(topology, {width:700, measure}),
    {colors, measure, dark:false, today:'2026-12-01', projection});
  assert.doesNotMatch(svg, /onload|alert\(1\)/);
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

test('empty and fully-collapsed real documents render finite XML geometry', () => {
  const collapsedDoc = 'today: 2026-12-20\n' +
    decisionBlock('settled', '  answer: yes 2026-12-20\n') +
    'LATER\n  Core: Continue [if settled]';
  for(const svg of [renderDoc('', '2026-12-20', 1), renderDoc(collapsedDoc, '2026-12-20', 1)]){
    assert.doesNotMatch(svg, /(?:NaN|[+-]?Infinity)/);
    const root = /^<svg\b[^>]*\bwidth="([^"]+)"[^>]*\bheight="([^"]+)"[^>]*\bviewBox="([^"]+)"/.exec(svg);
    assert.ok(root, 'root SVG geometry is present');
    for(const value of [root[1], root[2], ...root[3].split(/\s+/)])
      assert.ok(Number.isFinite(Number(value)), `finite root geometry, got ${value}`);
    for(const match of svg.matchAll(/\b(?:x|y|x1|x2|cx|cy|width|height)="([^"]+)"/g))
      assert.ok(Number.isFinite(Number(match[1])), `finite numeric attribute, got ${match[0]}`);
  }
});

test('the Unplaced wash ends at the tree body and cannot cover the verdict canvas', () => {
  const doc = 'verdict: Keep this verdict visible.\nNOW\n  Core: Orphan [if nobody]';
  const projection = project(parse(doc), '2026-12-01');
  const topology = treeProjection(projection);
  const layout = treeLayout(topology, {width:700, measure});
  const svg = renderTree(topology, layout, {colors, measure, dark:false, today:'2026-12-01', projection});
  const match = /<g data-kind="unplaced"><rect x="0" y="([^"]+)" width="[^"]+" height="([^"]+)"/.exec(svg);
  assert.ok(match, 'unplaced wash geometry is emitted');
  assert.ok(Number(match[1]) + Number(match[2]) <= layout.totalHeight,
    'translated wash stays inside bodyHeight');
  assert.match(svg, /Keep this verdict visible/);
});

/* ---------- the narrow outline (below a 520px container) ---------- */

function outlineDoc(doc, today = '2026-12-22', width = 360){
  const projection = project(parse(doc), today);
  return renderOutline(treeProjection(projection), {colors, measure, dark:false, today, width, projection});
}

test('a real wide export is a complete named artefact with frame, regions, and generated verdict', () => {
  const doc = 'title: Lantern paths\ndate: 2026-12-02\n' + decisionBlock('groups') +
    'NOW\n  Core: Shared repair\nLATER\n  Growth: Club challenges [if groups]';
  const svg = renderDoc(doc, '2026-12-01');
  assert.match(svg, /role="img" aria-labelledby="paths-tree-name paths-tree-description"/);
  assert.match(svg, /<title id="paths-tree-name">Lantern paths — decision tree<\/title>/);
  assert.match(svg, /<desc id="paths-tree-description">Dated 2026-12-02\. 1 question, 2 items, 2 possible plans\./);
  assert.match(svg, /Questions: groups: Open/);
  assert.match(svg, /Work: 1 included, 1 waiting/);
  assert.match(svg, /Tree boundary: 2 possible plans remain/);
  for(const text of ['Lantern paths', '2026-12-02',
    'SHARED WORK · IN EVERY PLAN', 'QUESTION PATHS · CHANGES WITH ANSWERS',
    'One of two items depends on the groups answer']) assert.match(svg, new RegExp(text));
  assert.match(svg, /data-kind="artifact-verdict"/);
});

test('a compact real wide Tree trims unused right canvas while retaining its minimum readable width', () => {
  const compact = renderDoc('title: Compact plan\nNOW\n  Core: One card', '2026-12-01', 1160);
  const rootWidth = Number(/^<svg\b[^>]*\bwidth="([^"]+)"/.exec(compact)?.[1]);
  assert.equal(rootWidth, 520, 'compact content uses the wide-artifact floor, not the 1160px request');
  assert.match(compact, /Compact plan/);
  assert.match(compact, /One card/);

  const fuller = renderDoc('NOW\n' + Array.from({length:4}, (_, index) =>
    `  Core: Card ${index + 1}`).join('\n'), '2026-12-01', 1160);
  const fullerWidth = Number(/^<svg\b[^>]*\bwidth="([^"]+)"/.exec(fuller)?.[1]);
  assert.ok(fullerWidth > rootWidth && fullerWidth < 1160,
    'the canvas remains content-driven above the floor without reverting to the full request');
});

test('the projected date and authored verdict contract survive wide export and narrow relayout', () => {
  const base = 'title: Launch paths\nverdict: Choose the 2-week pilot first.\nNOW\n  Core: Pilot';
  for(const svg of [renderDoc(base, '2026-12-03'), outlineDoc(base, '2026-12-03')]){
    assert.match(svg, /Launch paths/);
    assert.match(svg, /2026-12-03/, 'an absent date uses the injected/projected today');
    assert.match(svg, /1 item/);
    assert.doesNotMatch(svg, /data-kind="artifact-metrics"/);
    assert.match(svg, /Choose the /);
    assert.match(svg, />2<\/tspan>-week/, 'authored verdict remains visible with its figure treatment');
    assert.match(svg, /role="img" aria-labelledby=/);
  }

  const off = 'title: Quiet paths\ndate: off\nverdict: off\nNOW\n  Core: Pilot';
  for(const svg of [renderDoc(off, '2026-12-03'), outlineDoc(off, '2026-12-03')]){
    assert.doesNotMatch(svg, /data-kind="artifact-date"/);
    assert.doesNotMatch(svg, /data-kind="artifact-verdict"/);
    assert.doesNotMatch(svg, />VERDICT</);
  }
});

test('the narrow outline keeps the complete context as a genuine relayout', () => {
  const svg = outlineDoc('title: Lantern mobile\ndate: 2026-12-04\n' + decisionBlock('groups') +
    'NOW\n  Core: Shared repair\nLATER\n  Growth: Club challenges [if groups]', '2026-12-01', 320);
  for(const text of ['Lantern mobile', '2026-12-04',
    'SHARED WORK · IN EVERY PLAN', 'QUESTION PATHS · CHANGES WITH ANSWERS', 'VERDICT'])
    assert.match(svg, new RegExp(text));
  assert.match(svg, /<title id="paths-tree-name">Lantern mobile — outline<\/title>/);
  assert.equal(Number(/width="([\d.]+)"/.exec(svg)[1]), 320);
});

test('the narrow outline carries dependency text and the possible-plan limit boundary', () => {
  const decisions = Array.from({length:7}, (_, index) => decisionBlock(`q${index}`));
  const limit = outlineDoc('today: 2026-12-01\n' + decisions.join(''), '2026-12-01', 320);
  for(const text of ['TREE BOUNDARY', 'Enumeration limit reached', '128 possible plans',
    'Tree does not enumerate', 'every combined plan']) assert.match(limit, new RegExp(text));

  const compound = outlineDoc('today: 2026-12-01\n' + decisionBlock('groups') +
    decisionBlock('pricing') + 'LATER\n  Core: Joint [if groups and pricing] -- dependency note',
  '2026-12-01', 320);
  for(const text of ['dependency note', 'Needs · groups', 'Also · pricing'])
    assert.match(compound, new RegExp(text));
});

test('long unspaced title and verdict tokens are clipped inside wide and narrow artefacts', () => {
  const token = 'X'.repeat(180);
  const doc = `title: ${token}\nverdict: ${token}\nNOW\n  Core: Item`;
  for(const svg of [renderDoc(doc, '2026-12-01', 620), outlineDoc(doc, '2026-12-01', 320)]){
    const header = /<g data-kind="artifact-header">([\s\S]*?)<\/g>/.exec(svg)?.[1] || '';
    const readout = /<g data-kind="artifact-verdict">([\s\S]*?)<\/g>/.exec(svg)?.[1] || '';
    assert.doesNotMatch(header, new RegExp(token));
    assert.doesNotMatch(readout, new RegExp(token));
    assert.match(header, /…/);
    assert.match(readout, /…/);
  }
});

test('the outline stacks shared work, then each question with its arms', () => {
  const svg = outlineDoc('today: 2026-12-01\n' + decisionBlock('groups') +
    'NOW\n  Core: Resume position fix\nLATER\n  Growth: Challenges [if groups]\n  Core: Solo [if not groups]', '2026-12-01');
  assert.match(svg, /SHARED WORK/);
  assert.match(svg, /Resume position fix/);
  assert.match(svg, /If so/);
  assert.match(svg, /If not/);
  assert.match(svg, /Waiting for groups/);
});

test('the narrow outline names every simple rejected item beneath its Not needed count', () => {
  const doc = 'today: 2026-12-20\n' +
    decisionBlock('reminders', '  answer: yes 2026-12-20\n') +
    'LATER\n  Core: Chosen digest [if reminders]\n' +
    '  Core: Manual outreach [unless reminders]\n  Core: Phone calls [unless reminders]';
  const narrow = outlineDoc(doc, '2026-12-20');
  for(const text of ['If not', 'Not needed · 2', 'Manual outreach', 'Phone calls'])
    assert.match(narrow, new RegExp(text));
  assert.ok(narrow.indexOf('If not') < narrow.indexOf('Not needed · 2'));
  assert.ok(narrow.indexOf('Not needed · 2') < narrow.indexOf('Manual outreach'));
  assert.ok(narrow.indexOf('Manual outreach') < narrow.indexOf('Phone calls'));
});

test('a compound item rejected by answered A=yes, B=no remains named in wide and narrow stumps', () => {
  const doc = 'today: 2026-12-20\n' +
    decisionBlock('a', '  answer: yes 2026-12-02\n') +
    decisionBlock('b', '  answer: no 2026-12-02\n') +
    'LATER\n  Core: Compound excluded [if a and b]';
  for(const svg of [renderDoc(doc, '2026-12-20'), outlineDoc(doc, '2026-12-20')]){
    assert.match(svg, /If so/);
    assert.match(svg, /Not needed · 1/);
    assert.match(svg, /Compound excluded/);
  }
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

/* Terra, Stage 2a review: an overdue question rendered "Open" — the single most
   important thing this view has to say, silently absent. The projection already
   carried {kind:'overdue', days}; the label simply never read it. */
test('an overdue question says how overdue it is, in both renderers', () => {
  const doc = 'today: 2026-12-22\n' + decisionBlock('groups') + 'LATER\n  Core: A [if groups]';
  const wide = renderDoc(doc, '2026-12-22');
  assert.match(wide, /7 days overdue/);
  assert.doesNotMatch(wide, />Open</, 'an overdue question is not merely open');
  const projection = project(parse(doc), '2026-12-22');
  const narrow = renderOutline(treeProjection(projection),
    {colors, measure, dark:false, today:'2026-12-22', width:360});
  assert.match(narrow, /7 days overdue/);
});

test('narrow long decision names and overdue deadlines occupy separate rows at 390px and 320px', () => {
  const name = 'international-coach-marketplace-pricing-decision';
  const doc = 'today: 2026-12-22\n' + decisionBlock(name) +
    `LATER\n  Core: A [if ${name}]`;
  for(const width of [390, 320]){
    const svg = outlineDoc(doc, '2026-12-22', width);
    const group = /<g data-kind="outline-question">([\s\S]*?)<\/g>/.exec(svg)?.[1] || '';
    const labels = [...group.matchAll(/<text x="([^"]+)" y="([^"]+)"[^>]*>([^<]*)<\/text>/g)];
    assert.equal(labels.length, 2, `${width}px question header has exactly two text rows`);
    assert.equal(labels[0][1], labels[1][1], `${width}px state starts at the name's left edge`);
    assert.ok(Number(labels[1][2]) > Number(labels[0][2]), `${width}px baselines are disjoint`);
    assert.match(labels[0][3], /international-coach/);
    assert.equal(labels[1][3], '7 days overdue · Due 15 Dec',
      `${width}px retains both overdue state and due date`);
  }
});
