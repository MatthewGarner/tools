import {test} from 'node:test';
import assert from 'node:assert/strict';
import {makeScenario, AUTHORED_SEED, verdict} from '../engine.js';
import {renderGrid, renderCollapse} from '../render.js';

const C = {ink: '#222', muted: '#667', border: '#ddd', card: '#fff', bg: '#f7f8f6', accent: '#3b6ea5',
  err: '#b3403a', brandText: '#D62015'};
const s = makeScenario(AUTHORED_SEED);
const rootW = svg => Number(/<svg[^>]*\bwidth="(\d+)"/.exec(svg)[1]);
const svgH = svg => Number(/<svg[^>]*\bheight="(\d+)"/.exec(svg)[1]);

test('grid renders a card per person + act/hold targets; valid SVG; no NaN', () => {
  const svg = renderGrid(s, C, {turn: 3, calls: []});
  assert.ok(svg.startsWith('<svg') && svg.includes('</svg>'));
  assert.equal((svg.match(/data-act="talk"/g) || []).length, s.people);
  assert.doesNotMatch(svg, /NaN|undefined/);
});

test('grid leaks NOTHING it does not render: byte-identical under future quarters zeroed + every truth field REPLACED (I-5)', () => {
  // REPLACE (not permute) trueMean/outputs — a permuted array survives any aggregate
  // read (min/max/sum), so an impostor domain reading s.outputs.flat() or ...s.trueMean
  // would slip a permutation-only test; 999-replacement makes it bite (Fable I-5).
  const g = {...s,
    shown: s.shown.map(r => r.map((v, q) => q > 3 ? 0 : v)),    // future quarters zeroed
    outputs: s.outputs.map(r => r.map(() => 999)),              // pre-round truth (carries the drop) — replaced
    trueMean: s.trueMean.map(() => 999),                        // per-person true baseline — replaced
    signalPerson: (s.signalPerson + 2) % s.people, signalQuarter: 0, firstCatchable: 0};
  assert.equal(renderGrid(g, C, {turn: 3}), renderGrid(s, C, {turn: 3}), 'the grid reads only visible quarters + band');
});

test('grid never uses control-chart / xMR vocabulary in the copy (I2)', () => {
  const svg = renderGrid(s, C, {turn: 5});
  assert.doesNotMatch(svg, /xMR|control chart|control limit|UCL|LCL/i);
});

test('renderGrid: no-width default is unchanged (3 cols → 758)', () => {
  const s = makeScenario(AUTHORED_SEED);
  assert.equal(rootW(renderGrid(s, C, {turn: 4, calls: []})), 758);
});

test('renderGrid: wide width fills to ~1088 (cards grow, not zoom)', () => {
  const s = makeScenario(AUTHORED_SEED);
  const w = rootW(renderGrid(s, C, {turn: 4, calls: [], width: 1088}));
  assert.ok(w >= 1080 && w <= 1096, 'expected ~1088, got ' + w);
});

test('renderGrid: cols=1 (phone) ignores width — stays 274 for the tap-target scale-up', () => {
  const s = makeScenario(AUTHORED_SEED);
  assert.equal(rootW(renderGrid(s, C, {turn: 4, calls: [], cols: 1, width: 1088})), 274);
});

test('collapse is the verdict artefact: verdict line, the real-signal name, the oracle caption; valid; no NaN', () => {
  const calls = [{person: 3, quarter: 3}, {person: 5, quarter: 4}, {person: s.signalPerson, quarter: 7}];
  const svg = renderCollapse(s, C, calls);
  assert.ok(svg.startsWith('<svg') && svg.includes('</svg>'));
  assert.match(svg, /real decline/i);                 // the signal walks out of the band
  assert.match(svg, /spike, or shift/i);              // the oracle caption (essay's transferable question)
  assert.match(svg, /funnel/i);                       // the Deming footnote
  assert.doesNotMatch(svg, /xMR|control chart|UCL/i);
  assert.doesNotMatch(svg, /NaN|undefined/);
  // the phone RELAYOUT (re-wrapped narrow width, not a shrink): narrower canvas,
  // same payoff content, still well-formed
  const narrow = renderCollapse(s, C, calls, {width: 356});
  assert.match(narrow, /width="356"/, 'narrow collapse relayouts to a phone width');
  assert.match(narrow, /real decline/i);
  assert.match(narrow, /spike, or shift/i);
  assert.doesNotMatch(narrow, /NaN|undefined/);
});

test('renderCollapse: no-width default unchanged (wide 760)', () => {
  const s = makeScenario(AUTHORED_SEED);
  assert.equal(rootW(renderCollapse(s, C, [])), 760);
});

test('renderCollapse: narrow (356) branch reached by width<520', () => {
  const s = makeScenario(AUTHORED_SEED);
  assert.equal(rootW(renderCollapse(s, C, [], {width: 356})), 356);
});

test('renderCollapse: wide width opens the chart (wider AND taller)', () => {
  const s = makeScenario(AUTHORED_SEED);
  const wide = renderCollapse(s, C, [], {width: 1088});
  const base = renderCollapse(s, C, []);                 // 760
  assert.ok(rootW(wide) >= 1080, 'root width ~1088, got ' + rootW(wide));
  // the shared chart band grows in height too (the tangle is vertical) → overall SVG taller
  assert.ok(svgH(wide) > svgH(base), 'wide collapse should be taller (chH scaled)');
});

test('renderCollapse: body prose stays capped (no <text> line spans the full chart)', () => {
  const s = makeScenario(AUTHORED_SEED);
  const wide = renderCollapse(s, C, [], {width: 1088});
  // pull the muted body lines (the description/stats), assert none exceeds ~95 chars
  const bodyLines = [...wide.matchAll(/<text[^>]*>([^<]{40,})<\/text>/g)].map(m => m[1]);
  assert.ok(bodyLines.some(l => l.length > 20), 'sanity: found body text');
  assert.ok(bodyLines.every(l => l.length <= 100), 'no body line should run past ~100 chars: ' +
    (bodyLines.find(l => l.length > 100) || ''));
});

/* ---- Swiss 6b: the collapse's verdict anatomy ---- */

test('verdict(): the key figure is the conversations you opened, and it OPENS the line', () => {
  const calls = [{person: 3, quarter: 3}, {person: 5, quarter: 4}];
  const v = verdict(s, calls);
  assert.equal(v.fig, '2');
  assert.equal(v.line.indexOf(v.fig), 0, 'position-safe: the figure can never match a digit in a later count');
  assert.equal(verdict(s, []).fig, '0');
});

test('6b: the collapse draws a VERDICT kicker and exactly one brand-coloured figure', () => {
  const calls = [{person: 3, quarter: 3}, {person: 5, quarter: 4}, {person: s.signalPerson, quarter: 7}];
  for(const width of [356, 760, 1088]){
    const svg = renderCollapse(s, C, calls, {width});
    assert.ok(svg.includes('VERDICT'), 'literal uppercase kicker at width ' + width);
    assert.equal((svg.match(/fill="#D62015"/g) || []).length, 1, 'one brand run at width ' + width);
    assert.ok(svg.includes(">3</tspan>"), 'the brand run IS the figure at width ' + width);
  }
});

test('6b: a colour-less ctx falls back to ink (no undefined fill escapes)', () => {
  const {brandText, ...noBrand} = C;
  const svg = renderCollapse(s, noBrand, [{person: 1, quarter: 2}]);
  assert.doesNotMatch(svg, /undefined/);
  assert.ok(svg.includes("<tspan fill=\"#222\">"));
});

test('6b: the verdict block is content-driven — narrow re-wraps to more lines and the chart follows', () => {
  const calls = [{person: 3, quarter: 3}];
  const linesAt = w => (renderCollapse(s, C, calls, {width: w}).match(/font-size="(?:16|18|20)"/g) || []).length;
  assert.ok(linesAt(356) > linesAt(1088), 'the 30-char narrow wrap takes more lines than the wide one');
  const bandY = w => Number(/<rect x="[\d.]+" y="([\d.]+)"[^>]*fill-opacity="0.12"/.exec(
    renderCollapse(s, C, calls, {width: w}))[1]);
  assert.ok(bandY(356) > 100, 'the chart band starts below the wrapped verdict, got ' + bandY(356));
});
