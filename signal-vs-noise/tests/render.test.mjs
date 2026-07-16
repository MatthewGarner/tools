import {test} from 'node:test';
import assert from 'node:assert/strict';
import {makeScenario, AUTHORED_SEED} from '../engine.js';
import {renderGrid, renderCollapse} from '../render.js';

const C = {ink: '#222', muted: '#667', border: '#ddd', card: '#fff', bg: '#f7f8f6', accent: '#3b6ea5', err: '#b3403a'};
const s = makeScenario(AUTHORED_SEED);

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

test('collapse is the verdict artefact: verdict line, the real-signal name, the oracle caption; valid; no NaN', () => {
  const calls = [{person: 3, quarter: 3}, {person: 5, quarter: 4}, {person: s.signalPerson, quarter: 7}];
  const svg = renderCollapse(s, C, calls);
  assert.ok(svg.startsWith('<svg') && svg.includes('</svg>'));
  assert.match(svg, /real decline/i);                 // the signal walks out of the band
  assert.match(svg, /spike, or shift/i);              // the oracle caption (essay's transferable question)
  assert.match(svg, /funnel/i);                       // the Deming footnote
  assert.doesNotMatch(svg, /xMR|control chart|UCL/i);
  assert.doesNotMatch(svg, /NaN|undefined/);
});
