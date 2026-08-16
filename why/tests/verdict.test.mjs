/* The /why verdict + metrics projections (Swiss 6b).

   Everything here is a projection of the SAME audits the OST already draws
   (project.js: audits, noWhy, ost.unaddressed) — the verdict never invents a
   state the DSL can't express. Tier order follows the tool's own stated
   hierarchy: a broken assumption on something you're delivering is the loudest
   flag on the page, then work with no why, then untested commitments, then
   coverage, then the shape. */
import test from 'node:test';
import assert from 'node:assert';
import {parse} from '../parse.js';
import {project, whyVerdict, whyMetrics, treeCounts} from '../project.js';

const v = src => { const m = parse(src); return whyVerdict(m, project(m)); };
const figIsInLine = r => { assert.ok(r, 'expected a verdict'); assert.ok(r.line.includes(r.fig), r.fig + ' not found in: ' + r.line); };

test('no outcomes → no verdict at all', () => {
  assert.equal(v(''), null);
  assert.equal(v('title: Nothing yet'), null);
  assert.equal(whyVerdict(null, null), null);
});

test('tier 1 — a broken assumption under a committed solution', () => {
  const r = v(`outcome: O
  Users churn at 30 days
    Resume where you left off [delivering]
      ? abandoned books drive churn [broken]`);
  assert.equal(r.fig, '1 of 1');
  assert.equal(r.line, '1 of 1 committed solution rests on a broken assumption — the tree already says this will not work.');
  figIsInLine(r);
});

test('tier 1 — outranks every other flag, and counts across the tree', () => {
  const r = v(`outcome: O
  Need A
    Sol A [delivering]
      ? a [broken]
    Sol B [testing]
  Need B
  Loose [delivering]`);
  // Sol A broken, Sol B untested, "Loose" has no why, "Need B" is bare — broken still wins
  assert.equal(r.fig, '1 of 3');
  /* the verb agrees with the NUMERATOR ("one of three … rests"), the noun with
     the denominator ("of three solutionS") — the grammar of every tier here */
  assert.equal(r.line, '1 of 3 committed solutions rests on a broken assumption — the tree already says this will not work.');
});

test('tier 2 — committed work with no opportunity above it', () => {
  const r = v(`outcome: O
  Auto-bidder v2 [delivering]
    ? traders will trust it [holds]`);
  assert.equal(r.fig, '1 of 1');
  assert.equal(r.line, '1 of 1 committed solution sits under no opportunity — that work answers a need nobody wrote down.');
  figIsInLine(r);
});

test('tier 3 — untested bets', () => {
  const r = v(`outcome: O
  Users forget mid-afternoon
    Reading reminders [testing]
    Resume where you left off [delivering]
      ? abandoned books drive churn [holds]`);
  assert.equal(r.fig, '1 of 2');
  assert.equal(r.line, '1 of 2 committed solutions is an untested bet — the commitment ran ahead of the discovery.');
  figIsInLine(r);
});

test('tier 3 — plural reading', () => {
  const r = v(`outcome: O
  Need A
    Sol A [testing]
  Need B
    Sol B [delivering]`);
  assert.equal(r.fig, '2 of 2');
  assert.ok(r.line.startsWith('2 of 2 committed solutions are untested bets'), r.line);
});

test('tier 4 — opportunities carrying no solution', () => {
  const r = v(`outcome: O
  Need A
    Sol A [delivering]
      ? a [holds]
  Need B
  Need C`);
  assert.equal(r.fig, '2 of 3');
  assert.equal(r.line, '2 of 3 opportunities carry no solution — the tree is wider than the plan.');
  figIsInLine(r);
});

test('tier 4 — one bare opportunity reads singular', () => {
  const r = v(`outcome: O
  Need A
    Sol A [delivering]
      ? a [holds]
  Need B`);
  assert.equal(r.line, '1 of 2 opportunities carries no solution — the tree is wider than the plan.');
});

test('tier 5 — full coverage, nothing flagged', () => {
  const r = v(`outcome: O
  Need A
    Sol A [delivering]
      ? a [holds]`);
  assert.equal(r.fig, '1 of 1');
  assert.equal(r.line, '1 of 1 opportunity carries a solution and nothing is flagged — discovery has covered the plan.');
  figIsInLine(r);
});

test('tier 5 — plural, and a shipped solution still counts as cover', () => {
  const r = v(`outcome: O
  Need A
    Sol A [shipped]
  Need B
    Sol B [delivering]
      ? b [holds]`);
  assert.equal(r.fig, '2 of 2');
  assert.ok(r.line.startsWith('2 of 2 opportunities carry a solution and nothing is flagged'), r.line);
});

test('tier 6 — solutions hanging straight off an outcome, with no need named', () => {
  const r = v(`outcome: O
  Curated shelves [candidate]
  Publisher storefront [parked]`);
  assert.equal(r.fig, '2 solutions');
  assert.equal(r.line, "2 solutions hang straight off an outcome — the tree records what you'll build, never why.");
  figIsInLine(r);
});

test('tier 6 — the singular reading', () => {
  const r = v(`outcome: O
  Curated shelves [candidate]`);
  assert.equal(r.line, "1 solution hangs straight off an outcome — the tree records what you'll build, never why.");
});

test('tier 7 — a bare outcome', () => {
  const one = v('outcome: Improve retention');
  assert.equal(one.fig, '1 outcome');
  assert.equal(one.line, '1 outcome with nothing beneath it — the tree names an ambition and no needs.');
  const two = v('outcome: A\noutcome: B');
  assert.equal(two.line, '2 outcomes with nothing beneath them — the tree names an ambition and no needs.');
});

test('every tier puts its figure in its line', () => {
  const corpus = [
    'outcome: O\n  N\n    S [delivering]\n      ? a [broken]',
    'outcome: O\n  S [delivering]\n    ? a [holds]',
    'outcome: O\n  N\n    S [testing]',
    'outcome: O\n  N\n    S [delivering]\n      ? a [holds]\n  M',
    'outcome: O\n  N\n    S [delivering]\n      ? a [holds]',
    'outcome: O\n  S [candidate]',
    'outcome: O',
  ];
  for(const src of corpus) figIsInLine(v(src));
});

/* ---------- counts + metrics row ---------- */

test('treeCounts walks the whole tree, at any depth', () => {
  assert.deepEqual(treeCounts(parse(`outcome: O
  Need A
    Deeper need
      Sol A [testing]
        ? a
        ? b [holds]
  Need B
outcome: P
  Need C
    Sol B [shipped]`)), {outcomes: 2, opportunities: 4, solutions: 2, assumptions: 2});
});

test('metrics — the tree, counted', () => {
  assert.deepEqual(whyMetrics(parse(`outcome: O
  Need A
    Sol A [testing]
      ? a [holds]`)), ['1 outcome', '1 opportunity', '1 solution', '1 assumption']);
});

test('metrics — empty segments drop out; an empty model hides the row', () => {
  assert.deepEqual(whyMetrics(parse('outcome: A\noutcome: B')), ['2 outcomes']);
  assert.deepEqual(whyMetrics(parse('')), []);
  assert.deepEqual(whyMetrics(null), []);
});
