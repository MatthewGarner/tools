/* The roadmap verdict + metrics projections (Swiss 6b).

   /roadmap has no dates, so the verdict may never claim one. Everything below is
   derived from counts the model already carries: items per horizon, the declared
   WIP limit (spans included, via activeCount) and the [risk]/[blocked] flags. */
import test from 'node:test';
import assert from 'node:assert';
import {parse, roadmapVerdict, roadmapMetrics} from '../parse.js';
import {resolveVerdict} from '../../assets/verdict.js';

const v = src => roadmapVerdict(parse(src));
/* the contract every tier owes: the key figure is IN the line, verbatim */
const figIsInLine = r => { assert.ok(r, 'expected a verdict'); assert.ok(r.line.includes(r.fig), r.fig + ' not found in: ' + r.line); };

test('no items → no verdict at all', () => {
  assert.equal(roadmapVerdict(parse('')), null);
  assert.equal(roadmapVerdict(parse('title: Empty')), null);
  assert.equal(roadmapVerdict(null), null);
});

test('tier 1 — a column over the declared WIP limit is the story', () => {
  const r = v(`wip: 3
NOW
A
B
C
D
NEXT
E`);
  assert.equal(r.fig, '4 of 3');
  assert.equal(r.line, 'Now is running 4 of 3 — the WIP limit is the first thing this plan breaks.');
  figIsInLine(r);
});

test('tier 1 — names the WORST breaching column, not the first', () => {
  const r = v(`wip: 2
NOW
A
B
C
NEXT
D
E
F
G`);
  assert.equal(r.fig, '4 of 2');
  assert.ok(r.line.startsWith('Next is running 4 of 2'), r.line);
});

test('tier 1 — spans count as in flight (activeCount, not items written here)', () => {
  const r = v(`horizons: quarterly from Q3 2026 x4
wip: 1
Q3 2026
A x3
Q4 2026
B`);
  assert.equal(r.fig, '2 of 1');
  assert.ok(r.line.startsWith('Q4 2026 is running 2 of 1'), r.line);
});

test('tier 1 — wip: off silences the tier entirely', () => {
  const r = v(`wip: off
NOW
A
B
C
D
E
F
G
H`);
  assert.equal(r.fig, '8 of 8');   // falls through to the shape tier
});

test('tier 2 — flags inside the committed column', () => {
  const r = v(`wip: off
NOW
A [risk]
B [blocked]
C
D
NEXT
E`);
  assert.equal(r.fig, '2 of 4');
  assert.equal(r.line, "2 of 4 items in Now are flagged — the risk sits inside what you've already committed.");
  figIsInLine(r);
});

test('tier 2 — one flag in the committed column reads singular', () => {
  const r = v(`wip: off
NOW
A [blocked]
B`);
  assert.equal(r.line, "1 of 2 items in Now is flagged — the risk sits inside what you've already committed.");
});

test('tier 2 — [doing] and [done] are not flags', () => {
  const r = v(`wip: off
NOW
A [doing]
B [done]`);
  assert.equal(r.fig, '2 of 2');   // shape tier, not the flag tier
});

test('tier 2b — flags beyond the commitment say so', () => {
  const r = v(`wip: off
NOW
A
B
NEXT
C [risk]
D [blocked]`);
  assert.equal(r.fig, '2 of 4');
  assert.equal(r.line, '2 of 4 items are flagged, none in Now — the trouble sits beyond the commitment.');
  figIsInLine(r);
});

test('tier 2b — a single flag beyond the commitment reads singular', () => {
  const r = v(`wip: off
NOW
A
LATER
B [risk]`);
  assert.equal(r.line, '1 of 2 items is flagged, none in Now — the trouble sits beyond the commitment.');
});

test('tier 3 — the shape of the commitment', () => {
  const r = v(`wip: off
NOW
A
B
C
NEXT
D
LATER
E
F`);
  assert.equal(r.fig, '3 of 6');
  assert.equal(r.line, '3 of 6 items sit in Now — the rest is shaped, not committed.');
  figIsInLine(r);
});

test('tier 3 — everything committed', () => {
  const r = v(`wip: off
NOW
A
B`);
  assert.equal(r.fig, '2 of 2');
  assert.equal(r.line, '2 of 2 items sit in Now — everything is committed and nothing is shaped.');
});

test('tier 3 — nothing committed', () => {
  const r = v(`wip: off
NEXT
A
B
C`);
  assert.equal(r.fig, '0 of 3');
  assert.equal(r.line, '0 of 3 items sit in Now — the whole plan is shaped, none of it committed.');
});

test('tier 3 — a one-item roadmap stays grammatical', () => {
  const one = v(`wip: off
NOW
A`);
  assert.equal(one.line, '1 of 1 item sits in Now — everything is committed and nothing is shaped.');
  const late = v(`wip: off
LATER
A`);
  assert.equal(late.line, '0 of 1 item sits in Now — the whole plan is shaped, none of it committed.');
});

test('tier 3 — renamed horizons are named honestly', () => {
  const r = v(`wip: off
horizons: Q3 2026, Q4 2026
Q3 2026
A
Q4 2026
B`);
  assert.equal(r.line, '1 of 2 items sits in Q3 2026 — the rest is shaped, not committed.');
});

/* /roadmap deliberately has no dates — a verdict that invented one would be the
   worst thing this tool could say. The only proper nouns it may use are horizon
   names the author wrote themselves. */
test('the verdict never claims a date', () => {
  for(const src of ['NOW\nA [risk]', 'wip: 1\nNOW\nA\nB', 'NOW\nA\nNEXT\nB', 'wip: off\nNEXT\nA']){
    const {line} = v(src);
    assert.ok(!/\d{4}-\d{2}-\d{2}|\bP\d0\b|\bby \w/.test(line), 'a date leaked into: ' + line);
  }
});

/* ---------- metrics row ---------- */

test('metrics — structural facts, straight off the model', () => {
  assert.deepEqual(roadmapMetrics(parse(`wip: 3
horizons: Now, Next, Later
NOW
Core: A
Growth: B
NEXT
Core: C`)), ['3 items', '3 horizons', '2 lanes', 'Wip limit 3']);
});

test('metrics — no named lanes, no lane segment; wip off drops its own', () => {
  assert.deepEqual(roadmapMetrics(parse(`wip: off
NOW
A`)), ['1 item', '3 horizons']);
});

test('metrics — an empty model hides the row', () => {
  assert.deepEqual(roadmapMetrics(parse('')), []);
  assert.deepEqual(roadmapMetrics(null), []);
});

/* ---------- authored `verdict:` override, at the paint level (2026-08-09) ----------
   app.js: `resolveVerdict(model.verdict, {line: vd.line, fig: vd.fig})` — the
   authored key ALWAYS wins over the auto ladder above when present and
   non-empty; 'off' (or an empty string) hides the verdict entirely regardless
   of what the auto ladder would have said; an ABSENT key (never wrote
   `verdict:`) falls through to the auto line untouched. resolveVerdict is
   generic (assets/verdict.js, shared by every tool with a verdict), so this
   proves roadmap's own wiring calls it correctly, not resolveVerdict itself
   (that's assets/tests/verdict.test.mjs's job — out of this task's file
   allowlist). */
test('authored verdict: beats the auto ladder outright, whatever tier the ladder would have picked', () => {
  const m = parse(`verdict: We are betting the quarter on retention
wip: 1
NOW
A
B
C`);   // tier 1 (WIP breach) would otherwise speak loudly here
  const auto = roadmapVerdict(m);
  assert.ok(auto && auto.line.includes('WIP'), 'sanity: the auto ladder has something to say');
  const v = resolveVerdict(m.verdict, auto);
  assert.equal(v.line, 'We are betting the quarter on retention');
  assert.ok(!v.line.includes('WIP'), 'the authored line replaces the auto line outright, not alongside it');
});

test('authored verdict: off hides the verdict even when the auto ladder would have spoken', () => {
  const m = parse('verdict: off\nwip: 1\nNOW\nA\nB\nC');
  const v = resolveVerdict(m.verdict, roadmapVerdict(m));
  assert.deepEqual(v, {line: '', fig: ''});
});

test('authored verdict: an absent key falls through to the auto line, untouched', () => {
  const m = parse('wip: 1\nNOW\nA\nB\nC');
  assert.equal(m.verdict, null, 'sanity: no verdict: key was written');
  const auto = roadmapVerdict(m);
  const v = resolveVerdict(m.verdict, auto);
  assert.deepEqual(v, {line: auto.line, fig: auto.fig});
});
