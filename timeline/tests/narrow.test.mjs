/* Ship 2 — the <520px narrow relayout: stacked milestone rows on a SHARED time
   axis. renderNarrow is a preview-only early return; exports/wide stay untouched.
   Every invariant test also asserts /data-narrow/ so a gate drift can't let it
   silently pass against the wide board (Fable M3). */
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {parse, parseDate} from '../parse.js';
import {render, timelineReadout} from '../render.js';

const ctx = {
  colors: {card: '#ffffff', border: '#dddddd', ink: '#222222', muted: '#66777a',
    accent: '#0088cc', bg: '#f7f8f6', err: '#b3403a',
    status: {done: '#1D7A3E', doing: '#0C7FAE', risk: '#9A6A00', blocked: '#B3403A'}},
  measure: t => t.length * 7,
  today: parseDate('2026-07-06'),
};
const W = 360;
const DOC = 'title: Q3\nApp: Feature freeze 2026-08-14 .. 2026-08-28\n' +
  'App: Store review 2026-10-15 .. 2026-11-15 // review times vary wildly\n' +
  'Ops: Cutover 2026-12-01 [risk]\nOps: Signoff 2026-09-10 [done]';

test('narrow gate: width < 520 returns a data-narrow svg of that width; wide has neither', () => {
  const narrow = render(parse(DOC), {...ctx, width: W});
  assert.match(narrow, /data-narrow=""/);
  assert.match(narrow, new RegExp('<svg[^>]*width="' + W + '"'));
  const wide = render(parse(DOC), ctx);                       // no width
  assert.doesNotMatch(wide, /data-narrow/);
  assert.notEqual(narrow, wide);
});

test('narrow: width >= 520 is NOT narrow (the wide board)', () => {
  assert.doesNotMatch(render(parse(DOC), {...ctx, width: 520}), /data-narrow/);
  assert.doesNotMatch(render(parse(DOC), {...ctx, width: 900}), /data-narrow/);
});

test('narrow shared axis: two equal date-ranges get equal pixel-width whiskers', () => {
  const doc = 'A: Feature freeze 2026-08-14 .. 2026-08-28\nB: Also two weeks 2026-11-01 .. 2026-11-15';
  const svg = render(parse(doc), {...ctx, width: W});
  assert.match(svg, /data-narrow=""/);
  const bands = [...svg.matchAll(/data-ms="whisker"[^>]*width="([\d.]+)"/g)].map(m => +m[1]);
  assert.equal(bands.length, 2);
  assert.ok(Math.abs(bands[0] - bands[1]) < 0.6, 'equal ranges must map to equal widths: ' + bands);
});

test('narrow: every milestone renders a P50 diamond; ranged ones a whisker + P90; done/single do not', () => {
  const svg = render(parse(DOC), {...ctx, width: W});
  assert.match(svg, /data-narrow=""/);
  assert.equal((svg.match(/data-ms="p50"/g) || []).length, 4);
  assert.equal((svg.match(/data-ms="p90"/g) || []).length, 2);   // Feature freeze + Store review only
  assert.doesNotMatch(svg, /NaN|Infinity|undefined/);
});

test('narrow: named lanes get one uppercase section header each; the unnamed lane does not', () => {
  const svg = render(parse('X: one 2026-08 .. 2026-09\nplain 2026-08-10'), {...ctx, width: W});
  assert.match(svg, /data-narrow=""/);
  assert.match(svg, />X</);
  assert.equal((svg.match(/letter-spacing="1"/g) || []).length, 1);   // exactly one lane header
});

test('narrow: a TODAY rule and month-tick labels render', () => {
  const svg = render(parse(DOC), {...ctx, width: W});
  assert.match(svg, /data-narrow=""/);
  assert.match(svg, /data-today/);
  assert.match(svg, />TODAY</);
  assert.match(svg, /Aug 2026|Sep 2026|Oct 2026/);
});

test('narrow gates inline edits OUT even with edit:true (below 44px; edit via the DSL editor)', () => {
  const svg = render(parse(DOC), {...ctx, width: W}, null, {edit: true});
  assert.match(svg, /data-narrow=""/);
  assert.doesNotMatch(svg, /data-edit/);
  assert.doesNotMatch(svg, />×</);
  assert.doesNotMatch(svg, />＋/);
});

test('narrow compare: ghost diamonds, slip labels, NEW badge, since-line and dropped list all render', async () => {
  const {timelineDiff, timelineDiffView} = await import('../diff.js');
  const oldDoc = 'title: T\nGrid: Offer 2026-08 .. 2026-10\nGrid: Energisation 2027-01 .. 2027-04\nBuild: Dropped thing 2026-12 .. 2027-01';
  const newDoc = 'title: T\nGrid: Offer 2026-08 .. 2026-10\nGrid: Energisation 2027-02-15 .. 2027-06-01 [risk]\nBuild: New item 2026-11';
  const diff = timelineDiffView(timelineDiff(parse(oldDoc), parse(newDoc)), 'JUNE');
  const svg = render(parse(newDoc), {...ctx, width: W}, diff);
  assert.match(svg, /data-narrow=""/);
  assert.match(svg, /data-ms="ghost"/);          // Energisation moved → ghost
  assert.match(svg, />NEW</);                     // New item
  assert.match(svg, /JUNE/);                      // since-line
  assert.match(svg, /DROPPED SINCE/);             // Dropped thing
  assert.match(svg, /[+−]\d+ weeks?/);            // slip label on the ghost trail
});

test('exports/renderer are stateless: a narrow paint leaks nothing into a later wide render', () => {
  const before = render(parse(DOC), {...ctx, slide: true});
  render(parse(DOC), {...ctx, width: W});         // a narrow paint happens in between
  const after = render(parse(DOC), {...ctx, slide: true});
  assert.equal(after, before);                    // byte-identical ⇒ no module state leaked
  assert.doesNotMatch(after, /data-narrow/);      // the export ctx (no width) is always the wide board
});

test('the verdict (timelineReadout) still names the widest whisker regardless of width', () => {
  const doc = 'A: Short 2026-08-01 .. 2026-08-08\nA: Privacy audit signed 2026-09 .. 2026-12';
  const line = timelineReadout(parse(doc), parseDate('2026-07-06'));
  assert.match(line, /Widest whisker: Privacy audit signed/);
});
