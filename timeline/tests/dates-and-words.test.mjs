/* Engine-correctness spec, Part 3 B and C: one today, the viewer's own day, a clock only
   while its event is ahead, an overdue plan said plainly, unreadable dates named, dates at
   the precision written, one duration formatter, honest Compare, safe Markdown. */
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {parse, parseDate, parseLead, fmtItemDay} from '../parse.js';
import {render, timelineVerdict, timelineReadout, toMarkdown} from '../render.js';
import {premortemHandoff} from '../handoff.js';
import {inspectorHTML} from '../inspector.js';
import {timelineDiff, timelineDiffView} from '../diff.js';
import {duration} from '../duration.js';
import {leadReceipt, primaryDecisionLead} from '../lrm.js';
import {localDay, localISO} from '../clock.js';

const D = s => parseDate(s);
const T = D('2026-09-05');
const ctx = {colors: {card: '#fff', border: '#ddd', ink: '#222', muted: '#667', accent: '#08c', bg: '#f7f8f6', err: '#b33',
  status: {done: '#1D7A3E', doing: '#0C7FAE', risk: '#9A6A00', blocked: '#B3403A'}, brand: '#E2231A', brandText: '#D62015'},
  measure: t => t.length * 7, today: T, intent: 'native'};
const words = svg => [...svg.matchAll(/<text[^>]*>([^<]*)<\/text>/g)].map(m => m[1]).join(' | ');
const view = (a, b) => timelineDiffView(timelineDiff(parse(a), parse(b)), 'then');

/* ---- B ---- */
test('TL-12: every consumer uses model.today ?? clock', () => {
  const m = parse('today: 2026-09-05\nA: a 2026-10-01 .. 2026-12-01\nB: b 2026-11-01 .. 2027-01-01');
  const clock = D('2027-06-01'), page = timelineVerdict(m, T).line;
  assert.equal(timelineVerdict(m, clock).line, page);
  assert.equal(timelineReadout(m, clock), timelineReadout(m, T));
  assert.equal(toMarkdown(m, null, '', clock).split('\n')[2], '**' + page + '**');
  assert.notEqual(premortemHandoff(m, clock), null);
  assert.equal(premortemHandoff(m, clock).question, premortemHandoff(m, T).question);
});
test('TL-23: the clock is the viewer\'s calendar day, not the UTC day', () => {
  const was = process.env.TZ;
  try{
    process.env.TZ = 'Pacific/Auckland';                   // UTC+13 in November
    const d = new Date(Date.UTC(2026, 10, 12, 23, 30));     // 13 Nov 12:30 in Auckland, still 12 Nov in UTC
    assert.equal(localDay(d), D('2026-11-13')); assert.equal(localISO(d), '2026-11-13');
    process.env.TZ = 'America/Los_Angeles';                // UTC-8
    const e = new Date(Date.UTC(2026, 10, 13, 3, 0));       // 12 Nov 19:00 in Los Angeles, already 13 Nov in UTC
    assert.equal(localDay(e), D('2026-11-12')); assert.equal(localISO(e), '2026-11-12');
  }finally{ if(was === undefined) delete process.env.TZ; else process.env.TZ = was; }
});
test('TL-15: a decision clock exists only while its event is today or ahead', () => {
  const past = parse('Old event 2026-06-01 [fixed] [lead: 6w]\nA: a 2026-10 .. 2026-12\nB: b 2026-11 .. 2027-01');
  assert.doesNotMatch(timelineVerdict(past, T).line + timelineVerdict(past, T).rest, /Decision|Decide by/);
  assert.equal(primaryDecisionLead(past, T), null);
  assert.doesNotMatch(toMarkdown(past, null, '', T), /decide by/);
  assert.doesNotMatch(words(render(past, ctx)), /Decide by/);
  const today = parse('Event 2026-09-05 [fixed] [lead: 6w]\nA: a 2026-10 .. 2026-12');
  assert.match(leadReceipt(today.items[0], T).text, /Decision window closed/);
  assert.match(timelineVerdict(today, T).line, /Decision window closed/);
});
test('TL-21: a plan wholly past its P50s leads with that, names how many are past P90, and asks for new dates', () => {
  const v = timelineVerdict(parse('A: a 2026-01 .. 2026-02\nB: b 2026-03 .. 2026-08\nC: c 2026-08-20 .. 2026-10'), T).line;
  assert.match(v, /^All 3 ranged lanes have reached their P50 finish and are still open \(2 past their P90\) — they need new dates\.$/);
  assert.match(timelineVerdict(parse('A: a 2026-01 .. 2026-02'), T).line, /^The ranged lane has reached its P50 finish and is still open \(past its P90\) — it needs new dates\.$/);
  assert.match(timelineVerdict(parse('A: a 2026-08-01 .. 2026-10\nB: b 2026-08-20 .. 2026-10'), T).line, /\(not yet past their P90\)/);
  // not when any lane is still ahead of its P50
  assert.doesNotMatch(timelineVerdict(parse('A: a 2026-01 .. 2026-02\nB: b 2026-11 .. 2026-12'), T).line, /need new dates/);
});
test('TL-1, TL-14, TL-25: unreadable dates and leads are refused, and the warning names the fragment', () => {
  const y = parse('A: a 0050-03-10 .. 0050-04-10');
  assert.equal(parseDate('0050-03-10'), null); assert.equal(parseDate('0999-12-31'), null); assert.notEqual(parseDate('1000-01-01'), null);
  assert.equal(y.items.length, 0); assert.ok(y.warnings.length);
  assert.equal(parseLead('3650d'), 3650); assert.equal(parseLead('3651d'), null); assert.equal(parseLead('99999999999w'), null);
  const m = parse('E 2027-01-01 [fixed] [lead: 99999999999w]\nA: x 2026-10 .. 2026-12');
  assert.equal(m.items[0].leadDays, null); assert.ok(m.warnings.some(w => /ten years/.test(w)), m.warnings.join('|'));
  assert.doesNotMatch(timelineVerdict(m, T).line + render(m, ctx), /NaN|undefined/);
  const l = parse('Launch 2026-9-5 .. 2026-10-02');
  assert.ok(l.warnings.some(w => w.includes('"2026-9-5"')), l.warnings.join('|'));
  assert.ok(parse('x 2026-9-5').warnings.some(w => w.includes('"2026-9-5"')));
  assert.equal(parse('A: a 2026-10-05 .. 2026-12-01 // see 2026-9-5').warnings.length, 0, 'a loose date in a note is not a fragment of the date');
});
test('TL-16, TL-10, TL-11: one printer, at the precision written, whatever the separator', () => {
  const md = toMarkdown(parse('A: a 2026-10 .. 2026-12'), null, '', T);
  assert.match(md, /\| Oct 2026 \| Dec 2026 \|/);
  const dd = h => (h.match(/<dd>[^<]*<\/dd>/g) || []).map(s => s.replace(/<\/?dd>/g, '')).join('|');
  assert.equal(dd(inspectorHTML(parse('A: w 2026-10 – 2026-12').items[0], T)), 'Oct 2026|Dec 2026');
  assert.equal(dd(inspectorHTML(parse('A: w 2026-10 — 2026-12-05').items[0], T)), 'Oct 2026|5 Dec 2026');
  const rev = parse('X 2026-12-05 .. 2026-10');
  assert.equal(fmtItemDay(rev.items[0], 'p50'), 'Oct 2026'); assert.equal(fmtItemDay(rev.items[0], 'p90'), '5 Dec 2026');
  assert.match(words(render(rev, ctx)), /Finish Oct 2026 – 5 Dec 2026/);
  assert.equal(dd(inspectorHTML(rev.items[0], T)), 'Oct 2026|5 Dec 2026');
});
test('TL-Q4: a date that was a bare month is "mid-Oct 2026" in a sentence; computed dates are days', () => {
  const m = parse('A: a 2026-10 .. 2026-11\nB: b 2026-10 .. 2026-11');
  const v = timelineVerdict(m, T).line;
  assert.match(v, /ranged lanes by mid-Oct 2026 /);
  assert.match(v, /80% needs \d+ \w+ 2026/);
  assert.match(premortemHandoff(m, T).question, /^It’s mid-Oct 2026 and /);
  const g = parse('A: a 2026-10 .. 2026-11\nB: b 2026-10 .. 2026-11\nGate 2027-02 [fixed]');
  assert.match(timelineVerdict(g, T).line, /Fixed: Gate mid-Feb 2027 /);
  assert.match(timelineVerdict(parse('A: a 2026-10-15 .. 2026-11-15\nB: b 2026-10-15 .. 2026-11-15'), T).line, /by 15 Oct 2026 /);
});

/* ---- C ---- */
test('TL-17, TL-6, TL-9: one duration formatter', () => {
  const table = {0: '0 days', 1: '1 day', 3: '3 days', 6: '6 days', 7: '1 week', 8: '8 days', 10: '10 days', 14: '2 weeks', 20: '20 days', 21: '3 weeks', 27: '27 days', 28: '4 weeks', 29: '4 weeks', 31: '4 weeks', 33: '5 weeks', 42: '6 weeks', '-10': '10 days'};
  for(const [d, want] of Object.entries(table)) assert.equal(duration(+d), want, d);
  for(let d = 1; d < 400; d++) assert.doesNotMatch(duration(d), /^0 /);
  // surfaces
  const h = inspectorHTML(parse('A: w 2026-09-05 [started: 2026-09-05]').items[0], T);
  assert.doesNotMatch(h, /0 weeks/); assert.match(h, /0 days/);
  assert.match(view('A: x 2026-10-01 .. 2026-12-01', 'A: x 2026-10-04 .. 2026-12-01').sinceLine, /worst x \+3 days/);
  assert.match(toMarkdown(parse('A: x 2026-10-04 .. 2026-12-01'), view('A: x 2026-10-01 .. 2026-12-01', 'A: x 2026-10-04 .. 2026-12-01'), '', T), /x slipped \+3 days/);
});
test('TL-7, TL-8: Compare counts status changes and tells narrowed and completed from widened', () => {
  assert.match(view('A: x 2026-10-01 .. 2026-12-01 [risk]', 'A: x 2026-10-01 .. 2026-12-01').sinceLine, /1 status change/);
  assert.doesNotMatch(view('A: x 2026-10-01 .. 2026-12-01 [risk]', 'A: x 2026-10-01 .. 2026-12-01').sinceLine, /nothing moved/);
  assert.match(view('A: x 2026-10-01 .. 2026-12-01', 'A: x 2026-10-01 .. 2026-11-01').sinceLine, /1 range narrowed/);
  assert.doesNotMatch(view('A: x 2026-10-01 .. 2026-12-01', 'A: x 2026-10-01 .. 2026-11-01').sinceLine, /widened/);
  const done = view('A: x 2026-10-01 .. 2026-12-01', 'A: x 2026-10-01 [done]').sinceLine;
  assert.match(done, /1 completed/); assert.doesNotMatch(done, /widened|narrowed/);
  assert.match(view('A: x 2026-10-01 .. 2026-12-01', 'A: x 2026-10-01 .. 2026-12-20').sinceLine, /1 range widened/);
  assert.match(view('A: x 2026-10-01 .. 2026-12-01\nB: y 2026-10-01 .. 2026-12-01', 'A: x 2026-10-01 .. 2026-12-01 [risk]\nB: y 2026-10-01 .. 2026-12-01 [risk]').sinceLine, /2 status changes/);
  assert.match(view('A: x 2026-10-01 .. 2026-12-01', 'A: x 2026-10-01 .. 2026-12-01 // note').sinceLine, /nothing moved/);
});
test('TL-18: the one-lane sentence carries the not-counted and stale tails', () => {
  const ro = timelineReadout(parse('A: a 2026-10-01 .. 2026-12-01\nS: single 2026-12-10\nGate 2026-12-15 [fixed]'), T);
  assert.match(ro, /one lane, a planning estimate\. · 1 single-date lane not counted/);
  const st = timelineReadout(parse('A: a 2026-08-20 .. 2026-09-01\nA: z 2026-09-10 .. 2026-12-01\nGate 2026-12-15 [fixed]'), T);
  assert.match(st, /1 lane past its P90 — re-estimate it/);
});
test('TL-13: Markdown cells escape pipes and newlines', () => {
  const md = toMarkdown(parse('A: x | y 2026-10 .. 2026-12 // note | here'), null, '', T).split('\n').find(l => l.startsWith('| x'));
  assert.equal(md.split(/(?<!\\)\|/).length, 9);
  assert.match(md, /x \\\| y/);
});
test('TL-24: the highlight lands on the probability, not on digits inside a label', () => {
  const early = D('2026-06-01');
  let v = null;                                             // find a gate date whose joint prints "≈ 5%": the "5%" of a "15%" label would be found first
  for(let g = D('2026-08-01'); g < D('2026-10-01') && !v; g++){
    const iso = new Date(g * 86400000).toISOString().slice(0, 10);
    const t = timelineVerdict(parse('A: a 2026-10-01 .. 2026-12-01\nB: b 2026-10-01 .. 2026-12-01\nQ3 15% rollout ' + iso + ' [fixed]'), early);
    if(/≈ 5%;/.test(t.line)) v = t;
  }
  assert.ok(v, 'a 5% case exists in the scan');
  assert.ok(v.line.indexOf(v.fig) > v.line.indexOf('clear it'), `figure "${v.fig}" in "${v.line}"`);
  assert.equal(v.line.indexOf(v.fig), v.line.lastIndexOf(v.fig));
  assert.match(v.fig, /5%$/);
});
