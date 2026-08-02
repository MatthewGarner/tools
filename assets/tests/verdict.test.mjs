/* assets/tests/verdict.test.mjs — the Swiss 6b anatomy: pure figure-splitting
   and the SVG rendition (the DOM painters are covered by the browser suites). */
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {markFigure, countsLine} from '../verdict.js';
import {svgMetrics, svgVerdict} from '../verdict-svg.js';

/* a crude but deterministic text measurer — 0.55em per char, enough to drive
   wrapText the same way in every test run */
const measure = (s, font) => {
  const px = parseFloat(/(\d+(?:\.\d+)?)px/.exec(font)[1]);
  return s.length * px * 0.55;
};
const FONT = "'Helvetica Neue', Helvetica, sans-serif";
const C = {ink: '#111111', muted: '#6B6B68', brandText: '#D62015'};

test('markFigure splits around the first occurrence only', () => {
  assert.deepEqual(markFigure('holds #1 in 71 of 100 shuffles', '71 of 100'), [
    {t: 'holds #1 in ', fig: false},
    {t: '71 of 100', fig: true},
    {t: ' shuffles', fig: false},
  ]);
  assert.deepEqual(markFigure('3 of 7 land', '3 of 7'), [
    {t: '3 of 7', fig: true}, {t: ' land', fig: false},
  ]);
  assert.deepEqual(markFigure('two 4s here', '4'), [
    {t: 'two ', fig: false}, {t: '4', fig: true}, {t: 's here', fig: false},
  ]);
});

test('markFigure degrades to one plain run when the figure is absent or empty', () => {
  assert.deepEqual(markFigure('no number', 'zzz'), [{t: 'no number', fig: false}]);
  assert.deepEqual(markFigure('no number', ''), [{t: 'no number', fig: false}]);
  assert.deepEqual(markFigure('no number', null), [{t: 'no number', fig: false}]);
  assert.deepEqual(markFigure('', 'x'), []);
  assert.deepEqual(markFigure(null, 'x'), []);
});

test('countsLine joins with the middot and drops empties', () => {
  assert.equal(countsLine(['7 items', '3 horizons', 'WIP 4/6']), '7 items · 3 horizons · WIP 4/6');
  assert.equal(countsLine(['7 items', '', null, '  ']), '7 items');
  assert.equal(countsLine([]), '');
  assert.equal(countsLine('4 lanes'), '4 lanes');
});

test('svgMetrics: 700 ink title, 500 muted counts after a held 3-space gap, uppercased', () => {
  const s = svgMetrics({x: 36, y: 38, model: 'Habitat — launch plan',
    counts: ['7 milestones', '3 lanes'], ink: C.ink, muted: C.muted, font: FONT});
  assert.match(s, /font-size="10" font-weight="700" letter-spacing="1.8" fill="#111111"/);
  assert.match(s, /HABITAT — LAUNCH PLAN/);
  assert.match(s, /<tspan fill="#6B6B68" font-weight="500">   7 MILESTONES · 3 LANES<\/tspan>/);
  assert.equal(svgMetrics({x: 0, y: 0, model: '', counts: [], ...C, font: FONT}), '');
});

test('svgMetrics without a model title renders counts as the muted 500 strap', () => {
  // timeline/map already print a 22px title; repeating it in caps would stutter
  const s = svgMetrics({x: 0, y: 0, model: '', counts: ['7 milestones', '3 lanes'],
    ink: C.ink, muted: C.muted, font: FONT});
  assert.match(s, /font-weight="500" letter-spacing="1.8" fill="#6B6B68">7 MILESTONES · 3 LANES</);
  assert.doesNotMatch(s, /<tspan/, 'counts-only is one run, not a title plus a tspan');
});

test('svgMetrics scales its type and tracking together', () => {
  const s = svgMetrics({x: 0, y: 0, model: 'M', counts: [], ink: C.ink, muted: C.muted,
    font: FONT, scale: 2});
  assert.match(s, /font-size="20"/);
  assert.match(s, /letter-spacing="3.6"/);
});

test('svgVerdict emits the kicker, the display line and exactly one brand tspan', () => {
  const {svg, height} = svgVerdict({x: 36, y: 92, width: 480,
    line: 'All 4 lanes by 15 Nov ≈ 33% — promise 4 Jan 2027.', fig: '≈ 33%',
    ...C, font: FONT, measure});
  assert.match(svg, /letter-spacing="1.8" fill="#6B6B68">VERDICT<\/text>/);
  assert.match(svg, /font-size="24" font-weight="700" letter-spacing="-0.36"/);
  assert.equal((svg.match(/<tspan fill="#D62015">/g) || []).length, 1);
  assert.match(svg, /<tspan fill="#D62015">≈ 33%<\/tspan>/);
  assert.ok(height > 30, 'block advances past the kicker');
});

test('svgVerdict marks the figure once even when the text repeats it', () => {
  const {svg} = svgVerdict({x: 0, y: 0, width: 4000,
    line: '3 of 7 tracks land; 3 of 7 slip.', fig: '3 of 7', ...C, font: FONT, measure});
  assert.equal((svg.match(/<tspan/g) || []).length, 1);
});

test('svgVerdict wraps at min(width, 820) and advances 32px a line at 24px', () => {
  const long = 'Referral flow holds first place in seventy one of one hundred random weight shuffles across the whole board today.';
  const {svg, height} = svgVerdict({x: 0, y: 0, width: 300, line: long, fig: '', ...C,
    font: FONT, measure});
  const ys = [...svg.matchAll(/<text xml:space="preserve" x="0" y="(-?[\d.]+)"/g)].map(m => +m[1]);
  assert.ok(ys.length >= 4, 'wraps into several lines');
  assert.equal(ys[0], 0, 'kicker sits on the given baseline');
  assert.equal(ys[1], 30, 'first verdict line is 30px below the kicker');
  assert.equal(ys[2] - ys[1], 32, 'line advance is 32px at 24px type');
  assert.equal(height, ys[ys.length - 1] + 32);
});

test('svgVerdict escapes the model text and holds the spaces around the figure', () => {
  const {svg} = svgVerdict({x: 0, y: 0, width: 4000,
    line: 'A & B <s> hold 5 of 9 slots', fig: '5 of 9', ...C, font: FONT, measure});
  assert.match(svg, /A &amp; B &lt;s&gt; hold <tspan fill="#D62015">5 of 9<\/tspan> slots/);
});

test('svgVerdict is empty for an empty line', () => {
  assert.deepEqual(svgVerdict({x: 0, y: 0, width: 100, line: '', fig: '', ...C,
    font: FONT, measure}), {svg: '', height: 0});
});

/* ---------- authored verdicts (2026-07-31) ----------
   `verdict:` lets the author suppress or replace the tool's line. The semantics
   live HERE, once, so seven parsers can stay dumb (store the raw string) and
   cannot drift on what "off" means. */
import {firstFigure, resolveVerdict} from '../verdict.js';

test('firstFigure: the first numeric token, so an authored line keeps the anatomy', () => {
  assert.equal(firstFigure('3 of 5 bets are unfunded'), '3');
  assert.equal(firstFigure('We are carrying £3.2M of exposure'), '£3.2M');
  assert.equal(firstFigure('Churn moved 12% against us'), '12%');
  assert.equal(firstFigure('1,200 users churned'), '1,200');
});

test('firstFigure: a bare year IS the figure (Matt 2026-07-31 — no unpredictable range rule)', () => {
  assert.equal(firstFigure('We ship in March 2027'), '2027');
});

test('firstFigure: digits inside tokens are spelling, not figures', () => {
  assert.equal(firstFigure('Ship v2 by March'), '');          // not the 2 of "v2"
  assert.equal(firstFigure('Ship v2 in 14 days'), '14');      // skips to the real figure
  assert.equal(firstFigure('top-3 priorities'), '3');         // the hyphen is the word's, not a minus
  assert.equal(firstFigure('slipped by -3 weeks'), '-3');     // a real minus after a boundary survives
});

test('firstFigure: no number means no brand colour — red is reserved for figures', () => {
  assert.equal(firstFigure('We ship, or we do not ship'), '');
  assert.equal(firstFigure(''), '');
  assert.equal(firstFigure(null), '');
});

test('resolveVerdict: an absent key leaves the tool auto verdict untouched', () => {
  const auto = {line: 'Now is overloaded.', fig: 'Now'};
  assert.deepEqual(resolveVerdict(null, auto), auto);
  assert.deepEqual(resolveVerdict(undefined, auto), auto);
});

test('resolveVerdict: off suppresses, whatever the case or padding', () => {
  const auto = {line: 'Now is overloaded.', fig: 'Now'};
  for(const v of ['off', 'OFF', 'Off', '  off  '])
    assert.deepEqual(resolveVerdict(v, auto), {line: '', fig: ''}, v);
});

test('resolveVerdict: an empty value suppresses too — deleting the text must not resurrect the auto line', () => {
  assert.deepEqual(resolveVerdict('', {line: 'x', fig: ''}), {line: '', fig: ''});
  assert.deepEqual(resolveVerdict('   ', {line: 'x', fig: ''}), {line: '', fig: ''});
});

test('resolveVerdict: "off" only suppresses as the WHOLE value, never as a first word', () => {
  const got = resolveVerdict('Off the back of Q3 we hold the date', {line: 'auto', fig: ''});
  assert.equal(got.line, 'Off the back of Q3 we hold the date');
  assert.equal(got.fig, '');    // the 3 of "Q3" is spelling, not a figure
});

test('resolveVerdict: authored text replaces the line and derives its own figure', () => {
  const got = resolveVerdict('  3 of 5 bets are unfunded  ', {line: 'auto', fig: 'auto'});
  assert.deepEqual(got, {line: '3 of 5 bets are unfunded', fig: '3'});
});
