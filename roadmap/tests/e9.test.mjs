/* E9 — honest committed-vs-conditional counts.
   Spec: docs/superpowers/specs/2026-08-10-track1-roadmap-conditional-display.md S2
   (+ Rev A amendments). condCount() beside activeCount; F = activeCount − M,
   M = condCount, appended wherever a count already renders; register gets
   per-horizon headers; roadmapMetrics (DOM only) grows a min/max "in play"
   range over the open non-cycle bets. */
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {parse, applyWorld, activeCount, condCount, roadmapMetrics} from '../parse.js';
import {render} from '../render.js';
import {renderBoardDeck, renderBoardLive} from '../render-board.js';
import {renderFocusDeck, renderFocusLive} from '../render-focus.js';
import {renderRegisterLive, renderRegisterDeck} from '../render-register.js';
import {deckMetrics} from '../render-deck.js';

const measure = (s, f) => (s ? s.length : 0) * ((/(\d+)px/.exec(String(f)) || [])[1] || 12) * 0.55;
const colors = {
  bg: '#fff', card: '#fff', border: '#ccc', ink: '#111', muted: '#666', accent: '#08c', accentInk: '#067',
  err: '#c00', status: {done: '#1D7A3E', doing: '#0C7FAE', risk: '#9A6A00', blocked: '#B3403A'},
  statusInk: {done: '#1C753C', doing: '#0B709A', risk: '#8E6200', blocked: '#B3403A'},
};
const ctx = (extra = {}) => ({colors, measure, dark: false, today: '2026-08-09', ...extra});

const FORK_DOC = 'title: T\nNOW\nCore: Ship base [bet: reminders]\nNEXT\nCore: Smart nudges [if reminders]\nCore: Manual digest [unless reminders]\nLATER\nCore: Later thing';
const PLAIN_DOC = 'title: T\nNOW\nCore: Plain item\nNEXT\nCore: Another one';

/* ---------- condCount arithmetic ---------- */

test('condCount counts only worldState === "cond" items, same span-coverage shape as activeCount', () => {
  const m = parse(FORK_DOC);
  // NEXT has 2 items, both cond (unresolved fork): both if/unless read 'cond'
  assert.equal(activeCount(m, 1), 2);
  assert.equal(condCount(m, 1), 2);
  // NOW has just the declaring item, uninvolved in its own fork
  assert.equal(condCount(m, 0), 0);
  // LATER is untouched
  assert.equal(condCount(m, 2), 0);
});

test('condCount is span-aware: a spanning cond item counts in every column it covers', () => {
  // x-spans only parse on a TIME AXIS board (span-parse.test.mjs) — Now/Next/
  // Later section headers keep "x2" as literal title text.
  const m = parse('wip: off\nhorizons: quarterly from Q3 2026 x4\nQ3 2026\nCore: A [bet: x]\nQ4 2026\nCore: B [if x] x2\nQ1 2027\nCore: C');
  assert.equal(m.items[1].span, 2);
  assert.equal(condCount(m, 1), 1, 'covers Q4');
  assert.equal(condCount(m, 2), 1, 'span carries the cond item into Q1 2027 too');
  assert.equal(activeCount(m, 2), 2, 'B (spanning) + C both active in Q1 2027');
});

test('a [doing] dropped item counts in activeCount but never in condCount — dropped is not cond', () => {
  const m = parse('wip: off\nNOW\nCore: A [bet: x lost]\nNEXT\nCore: B [if x] [doing]');
  assert.equal(m.items[1].worldState, 'dropped');
  assert.equal(activeCount(m, 1), 1, '[doing] keeps it counted despite the drop');
  assert.equal(condCount(m, 1), 0, 'a dropped item is never cond, doing or not');
});

test('a bet-free doc: condCount is 0 everywhere', () => {
  const m = parse(PLAIN_DOC);
  assert.equal(condCount(m, 0), 0);
  assert.equal(condCount(m, 1), 0);
});

/* ---------- label split on renderers ---------- */

test('board (deck + live) count label splits into "F + M conditional" when cond items exist', () => {
  const m = parse(FORK_DOC);
  const deckSvg = renderBoardDeck(m, ctx(), colors);
  const liveSvg = renderBoardLive(m, ctx({edit: true}));
  // NOW: 1 active, 0 cond -> plain "1"
  assert.ok(deckSvg.includes('>1<'), 'NOW column stays plain (no cond items there)');
  // NEXT: 2 active, both cond -> "0 + 2 conditional"
  assert.ok(deckSvg.includes('0 + 2 conditional'), deckSvg.match(/>[^<]*conditional[^<]*</)?.[0]);
  assert.ok(liveSvg.includes('0 + 2 conditional'));
});

test('focus (deck + live) hero count splits when the hero horizon carries cond items', () => {
  const m = parse(FORK_DOC + '\nfocus: Next');
  const deckSvg = renderFocusDeck(m, ctx(), colors);
  const liveSvg = renderFocusLive(m, ctx({edit: true}));
  assert.ok(deckSvg.includes('0 + 2 conditional'));
  assert.ok(liveSvg.includes('0 + 2 conditional'));
});

test('grid (render.js): "· N ACTIVE" / "N ITEMS" split with the tighter COND wording', () => {
  const span = 'wip: 1\nhorizons: quarterly from Q3 2026 x4\nQ3 2026\nCore: A [bet: x]\nCore: also x2\nQ4 2026\nCore: B [if x]';
  const m = parse(span);
  const svg = render(m, ctx());
  // Q3 2026 has 2 active (A, "also" spanning in), 0 cond -> plain count, no COND text
  // Q4 2026 has 2 active ("also" span-carried + B cond) -> "1 + 1 COND"
  assert.ok(svg.includes('1 + 1 COND'), 'wide grid splits the span-mode ACTIVE label');
});

test('grid narrow chart (width: 380) uses the compact no-space "F+M COND" form', () => {
  // the "N ITEMS" flag only ever fires on the FIRST column — put both the
  // declaring bet AND a rider in NOW, so column 0 itself carries a cond item.
  const m = parse('wip: 1\nNOW\nCore: A [bet: x]\nCore: Rider [if x]\nNEXT\nCore: Other');
  const svg = render(m, ctx({width: 380}));
  assert.ok(svg.includes('1+1 COND ITEMS'), svg.match(/>[^<]*ITEMS[^<]*</)?.[0]);
});

test('a bet-free doc renders NO "conditional"/"COND" text anywhere — byte-identity for the count labels', () => {
  const m = parse(PLAIN_DOC);
  const svgs = [
    render(m, ctx()), render(m, ctx({width: 380})),
    renderBoardDeck(m, ctx(), colors), renderBoardLive(m, ctx({edit: true})),
    renderFocusDeck(m, ctx(), colors), renderFocusLive(m, ctx({edit: true})),
  ];
  for(const svg of svgs){
    assert.ok(!svg.includes('conditional'));
    assert.ok(!svg.includes('COND'));
  }
});

test('OVER WIP fires from the FULL activeCount even when the settled share (F) alone sits under the limit', () => {
  // the flag only ever fires on column 0 (board's "historical first-column
  // flag"), so the cond item has to live in NOW itself: F=1 (A) sits under
  // wip:1 on its own, but the full active count (2, incl. the cond rider) breaches.
  const m = parse('wip: 1\nNOW\nCore: A [bet: x]\nCore: Rider [if x]\nNEXT\nCore: Other');
  const deckSvg = renderBoardDeck(m, ctx(), colors);
  assert.ok(deckSvg.includes('OVER WIP'), 'the breach still fires (full count, not the settled share)');
  assert.ok(deckSvg.includes('1 + 1 conditional · OVER WIP'), 'the split survives inside the over-wip label');
});

/* ---------- register per-horizon headers ---------- */

test('register live: per-horizon group header with the F + M conditional split appears once a bet exists', () => {
  const m = parse(FORK_DOC);
  const svg = renderRegisterLive(m, ctx({edit: true}));
  assert.ok(svg.includes('NOW') && !svg.includes('+ 0 conditional'), 'NOW: settled horizon shows a plain count, never "+ 0 conditional" noise');
  assert.ok(svg.includes('0 + 2 conditional'), 'NEXT: both items conditional');
});

test('register live: no header row on a bet-free doc — byte-identical to pre-slice shape', () => {
  const svg = renderRegisterLive(parse(PLAIN_DOC), ctx({edit: true}));
  assert.ok(!svg.includes('conditional'));
});

test('register deck is untouched this slice: no header row, no split, even with bets', () => {
  const svg = renderRegisterDeck(parse(FORK_DOC), ctx(), colors);
  assert.ok(!svg.includes('conditional'), 'deck register does not gain the split/header (spec: unchanged this slice)');
});

/* ---------- roadmapMetrics range (DOM header only) ---------- */

test('metrics range: a simple open fork appends "between B and W in play"', () => {
  const m = parse(FORK_DOC);
  const metrics = roadmapMetrics(m);
  // won -> both riders live (2 kept); lost -> both drop (0 kept, of the fork pair);
  // the OTHER 2 items (the bet's own declaring item + Later thing) always count.
  const won = applyWorld(m, {reminders: 'won'});
  const lost = applyWorld(m, {reminders: 'lost'});
  const inPlay = w => w.items.filter(i => i.worldState !== 'dropped' || i.status === 'doing').length;
  const lo = Math.min(inPlay(won), inPlay(lost)), hi = Math.max(inPlay(won), inPlay(lost));
  assert.ok(metrics.some(s => s === (lo === hi ? lo + ' in play' : 'between ' + lo + ' and ' + hi + ' in play')),
    JSON.stringify(metrics));
});

test('metrics range: a resolved-only doc (no open bets) never appends a range segment', () => {
  const m = parse(FORK_DOC.replace('[bet: reminders]', '[bet: reminders won]'));
  const metrics = roadmapMetrics(m);
  assert.ok(!metrics.some(s => s.includes('in play')));
});

test('metrics range: a bet-free doc never appends a range segment', () => {
  const metrics = roadmapMetrics(parse(PLAIN_DOC));
  assert.ok(!metrics.some(s => s.includes('in play')));
});

test('metrics range: chained bets — a lost parent moots the child, whose OWN riders drop too, through applyWorld', () => {
  // root: open bet. gate: [if root][bet: gate]. rider: [if gate].
  // root lost -> gate drops (moot) -> rider (if gate) drops too (moot cascades).
  // root won -> gate lives, still an OPEN bet itself... but "gate" is also open,
  // so BOTH root and gate are open non-cycle bets here (2 -> 4 worlds).
  const m = parse('wip: off\nNOW\nCore: Root [bet: root]\nNEXT\nCore: Gate [bet: gate] [if root]\nLATER\nCore: Rider [if gate]');
  const metrics = roadmapMetrics(m);
  const line = metrics.find(s => s.includes('in play'));
  assert.ok(line, JSON.stringify(metrics));
  // brute-force the same 4 worlds directly to pin the exact range
  const combos = [['won', 'won'], ['won', 'lost'], ['lost', 'won'], ['lost', 'lost']];
  const counts = combos.map(([r, g]) => {
    const w = applyWorld(m, {root: r, gate: g});
    return w.items.filter(i => i.worldState !== 'dropped' || i.status === 'doing').length;
  });
  const lo = Math.min(...counts), hi = Math.max(...counts);
  assert.equal(line, lo === hi ? lo + ' in play' : 'between ' + lo + ' and ' + hi + ' in play');
});

test('metrics range: a bet sitting in a condition cycle is excluded from both the trigger and the enumeration', () => {
  // a depends on b, b depends on a — both cycle, effective reads unresolved but b.cycle=true
  const m = parse('wip: off\nNOW\nCore: A [bet: a] [if b]\nNEXT\nCore: B [bet: b] [if a]');
  assert.equal(m.bets.a.cycle, true);
  assert.equal(m.bets.b.cycle, true);
  const metrics = roadmapMetrics(m);
  assert.ok(!metrics.some(s => s.includes('in play')), 'a doc with only cycle bets shows no range');
});

test('metrics range: more than 6 open non-cycle bets omits the segment (perf cap)', () => {
  const lines = ['wip: off', 'NOW'];
  for(let i = 0; i < 7; i++) lines.push('Core: Bet' + i + ' [bet: b' + i + ']');
  const m = parse(lines.join('\n'));
  assert.equal(Object.keys(m.bets).length, 7);
  const metrics = roadmapMetrics(m);
  assert.ok(!metrics.some(s => s.includes('in play')), 'past the 2^6 cap the segment is omitted, not computed');
});

test('metrics range: exactly 6 open non-cycle bets still computes (boundary of the cap)', () => {
  const lines = ['wip: off', 'NOW'];
  for(let i = 0; i < 6; i++) lines.push('Core: Bet' + i + ' [bet: b' + i + ']');
  const m = parse(lines.join('\n'));
  const metrics = roadmapMetrics(m);
  assert.ok(metrics.some(s => s.includes('in play')), 'exactly 6 is within the cap');
});

test('metrics range degenerate: B === W renders "N in play", not a range', () => {
  // a single open bet whose rider is [doing] regardless of outcome — item count never moves
  const m = parse('wip: off\nNOW\nCore: A [bet: x]\nNEXT\nCore: B [if x] [doing]');
  const metrics = roadmapMetrics(m);
  const line = metrics.find(s => s.includes('in play'));
  assert.ok(line, JSON.stringify(metrics));
  assert.ok(/^\d+ in play$/.test(line), 'no "between" when the count never actually varies: ' + line);
});

test('metrics range under what-if preview: the projected model resolves the bet, so the range collapses (no segment)', () => {
  const m = parse(FORK_DOC);
  const projected = applyWorld(m, {reminders: 'won'});
  const metrics = roadmapMetrics(projected);
  assert.ok(!metrics.some(s => s.includes('in play')), 'a resolved preview has zero open bets left to enumerate');
});

test('metrics range is memoised per model object: repeat calls on the same object are cheap and consistent', () => {
  const m = parse(FORK_DOC);
  const a = roadmapMetrics(m);
  const b = roadmapMetrics(m);
  assert.deepEqual(a, b);
});

/* ---------- deckMetrics (SVG exports) stays pinned, unaffected by this slice ---------- */

test('deckMetrics is unchanged for a doc with open bets — no range, no split, SVG exports stable', () => {
  const m = parse(FORK_DOC);
  assert.equal(deckMetrics(m), '4 items · 3 horizons');
});
