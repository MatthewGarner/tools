import {test} from 'node:test';
import assert from 'node:assert/strict';
import {parse} from '../parse.js';
import {sessionStats, delphiStats, mergeFinal} from '../engine.js';
import {renderOverlay} from '../render-overlay.js';

const ctx = {
  colors: {card: '#fff', border: '#ddd', ink: '#222', muted: '#667', accent: '#08c',
    bg: '#f7f8f6', err: '#b33', track: '#edf0ee',
    status: {done: '#2a7', doing: '#08c', risk: '#c81', blocked: '#b33'}},
  measure: t => t.length * 7,
};
const model = parse('title: Delphi check\nShip by Q3 :: prob\nWeeks to migrate :: range weeks');
const r1 = [
  {who: 'aaaa1111', values: [80, [10, 20]]},
  {who: 'bbbb2222', values: [20, [2, 6]]},
  {who: 'cccc3333', values: [50, [8, 12]]},
];
const r2 = [
  {who: 'aaaa1111', values: [60, [8, 14]]},
  {who: 'bbbb2222', values: [45, null]},
];

function renderDelphi(){
  const fin = mergeFinal(r1, r2);
  const stats = sessionStats(model, fin);
  const delphi = delphiStats(model, r1, r2);
  const round1 = sessionStats(model, r1);
  return renderOverlay(model, stats, ctx, {delphi, round1});
}

test('delphi overlay: header pill, pooled markers, round-1 strips, convergence line', () => {
  const svg = renderDelphi();
  assert.match(svg, /DELPHI ROUND 2/);
  assert.match(svg, /pooled/i);
  assert.match(svg, /round 1/i);
  assert.match(svg, /narrowed|barely moved|widened/i);
  assert.doesNotMatch(svg, /NaN|Infinity|undefined/);
});

test('delphi overlay: prob median label becomes the pooled median', () => {
  const svg = renderDelphi();
  assert.match(svg, /pooled median 50%/);
});

test('range panel scale covers round-1 extremes even when round 2 is narrower', () => {
  const svg = renderDelphi();
  assert.match(svg, /round 1: 2–20/);          // the round-1 pooled band label
});

test('without opts the overlay is byte-identical to before (regression guard)', () => {
  const stats = sessionStats(model, r1);
  assert.equal(renderOverlay(model, stats, ctx), renderOverlay(model, stats, ctx, {}));
});
