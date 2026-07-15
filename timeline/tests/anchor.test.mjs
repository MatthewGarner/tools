/* Task A — the label always clears the P90 diamond. Direct branch tests of the
   pure `msLabelAnchor` helper (sharper + cheaper than SVG-parsing), plus two
   integration invariants on the real edit:true SVG: no P90 diamond inside a
   same-row label extent, and no two same-lane labels overlapping on one row. */
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {parse, parseDate} from '../parse.js';
import {render, msLabelAnchor} from '../render.js';

const ctx = {
  colors: {card: '#ffffff', border: '#dddddd', ink: '#222222', muted: '#66777a',
    accent: '#0088cc', bg: '#f7f8f6', err: '#b3403a',
    status: {done: '#1D7A3E', doing: '#0C7FAE', risk: '#9A6A00', blocked: '#B3403A'}},
  measure: t => t.length * 7,
  today: parseDate('2026-07-06'),
};
const measure = ctx.measure;
const LF = '600 12.5px sans', NF = '10.5px sans';   // font strings ignored by the length*7 stub
// a ranged milestone whose sub-line "14 Aug 2026 → 28 Aug 2026" measures 25*7 = 175px
const ranged = extra => ({label: 'A', single: false, status: null,
  p50: parseDate('2026-08-14'), p90: parseDate('2026-08-28'), note: null, ...extra});

test('msLabelAnchor: long whisker + short label keeps the x50 anchor', () => {
  const it = ranged({label: 'A'});
  const {labelX, anchorEnd} = msLabelAnchor(it, 100, 800, 6, 1, 0, 2000, measure, LF, NF, false);
  assert.equal(anchorEnd, false);
  assert.equal(labelX, 100 + 6 + 5);              // x50 + r + 5S
});

test('msLabelAnchor: short whisker + long label anchors AFTER the P90 diamond', () => {
  const it = ranged({label: 'A'.repeat(40)});     // titleW 280 > subW 175 → widest 280
  const x50 = 100, x90 = 160, r = 6;
  const {labelX, anchorEnd} = msLabelAnchor(it, x50, x90, r, 1, 0, 2000, measure, LF, NF, false);
  assert.equal(anchorEnd, false);
  assert.equal(labelX, x90 + 0.8 * r + 6);        // right of the P90 diamond
  assert.ok(labelX > x90 + 0.8 * r, 'clears the diamond right tip');
});

test('msLabelAnchor: no room right → flips LEFT, right-anchored, staying on-board', () => {
  const it = ranged({label: 'A'.repeat(30)});     // widest 210
  const x50 = 300, x90 = 360, r = 6, plotX = 0, plotW = 500;
  const {labelX, anchorEnd, widest} = msLabelAnchor(it, x50, x90, r, 1, plotX, plotW, measure, LF, NF, false);
  assert.equal(anchorEnd, true);
  assert.equal(labelX, x50 - r - 6);              // x50 - r - 6S, right-anchored
  assert.ok(labelX - widest >= plotX, 'the flipped block stays on-board-left');
});

test('msLabelAnchor: hasGhost (compare) suppresses the flip → keeps right-of-P90', () => {
  const it = ranged({label: 'A'.repeat(30)});
  const x50 = 300, x90 = 360, r = 6, plotX = 0, plotW = 500;
  const {labelX, anchorEnd} = msLabelAnchor(it, x50, x90, r, 1, plotX, plotW, measure, LF, NF, true);
  assert.equal(anchorEnd, false);
  assert.equal(labelX, x90 + 0.8 * r + 6);        // right-of-P90, accept the clip
});

test('msLabelAnchor: single-date milestones never re-anchor', () => {
  const it = {label: 'A'.repeat(40), single: true, status: null,
    p50: parseDate('2026-08-20'), p90: parseDate('2026-08-20'), note: null};
  const {labelX, anchorEnd} = msLabelAnchor(it, 100, 100, 6, 1, 0, 200, measure, LF, NF, false);
  assert.equal(anchorEnd, false);
  assert.equal(labelX, 100 + 6 + 5);
});

/* ---- integration invariants on the real SVG (edit:true → labels carry data-edit) ---- */

// milestone title (data-edit="label", 12.5px) + sub (data-edit="dates", 10.5px),
// anchor-aware extent, row-grouped by the reconstructed row centre.
function labelsOf(svg){
  const out = [];
  const re = /<text([^>]*)>([^<]*)/g;
  let m;
  while((m = re.exec(svg))){
    const attrs = m[1], content = m[2];
    const kind = (attrs.match(/data-edit="(label|dates)"/) || [])[1];
    if(!kind) continue;
    const x = parseFloat((attrs.match(/ x="([\d.-]+)"/) || [])[1]);
    const y = parseFloat((attrs.match(/ y="([\d.-]+)"/) || [])[1]);
    const anchor = (attrs.match(/text-anchor="(\w+)"/) || [])[1] || 'start';
    const line = (attrs.match(/data-line="(-?\d+)"/) || [])[1];
    const w = measure(content);
    const left = anchor === 'end' ? x - w : anchor === 'middle' ? x - w / 2 : x;
    const right = anchor === 'end' ? x : anchor === 'middle' ? x + w / 2 : x + w;
    const rowCenter = kind === 'label' ? y + 2 : y - 10.5;   // inverse of the draw offsets
    out.push({left, right, rowCenter, line, kind});
  }
  return out;
}
function p90sOf(svg){
  const out = [];
  const re = /data-ms="p90"[^>]*d="M([\d.-]+) ([\d.-]+)/g;   // M<cx> <cy-0.8r>
  let m;
  while((m = re.exec(svg))) out.push({cx: parseFloat(m[1]), rowCenter: parseFloat(m[2]) + 4.8});
  return out;
}
const sameRow = (a, b) => Math.abs(a - b) < 2;

function noP90InsideSameRowLabel(svg){
  const labels = labelsOf(svg), p90s = p90sOf(svg);
  for(const d of p90s)
    for(const L of labels)
      if(sameRow(L.rowCenter, d.rowCenter) && d.cx > L.left + 1 && d.cx < L.right - 1) return false;
  return true;
}
function noSameLaneLabelOverlap(svg){
  const byLine = new Map();                        // union title+sub per milestone
  for(const L of labelsOf(svg)){
    if(L.line == null || L.line === '-1') continue;
    const e = byLine.get(L.line) || {left: Infinity, right: -Infinity, rowCenter: L.rowCenter};
    e.left = Math.min(e.left, L.left); e.right = Math.max(e.right, L.right);
    byLine.set(L.line, e);
  }
  const items = [...byLine.values()];
  for(let i = 0; i < items.length; i++)
    for(let j = i + 1; j < items.length; j++){
      const a = items[i], b = items[j];
      if(sameRow(a.rowCenter, b.rowCenter) && a.left < b.right - 1 && b.left < a.right - 1) return false;
    }
  return true;
}

test('P90 diamond never sits inside a same-row label extent (edit)', () => {
  const doc = 'App: Feature freeze 2026-08-14 .. 2026-08-28\n' +
    'App: Store review 2026-10-15 .. 2026-11-15 // review times vary wildly';
  const svg = render(parse(doc), {...ctx, edit: true});
  assert.ok(noP90InsideSameRowLabel(svg), 'a P90 diamond overlaps same-row label text');
});

test('a wide sub-line does not let two same-lane milestones overlap on one row', () => {
  const doc = 'App: Ship it 2026-08-01 .. 2026-08-05 // a deliberately long trailing note that runs wide\n' +
    'App: Next thing 2026-08-20';
  const svg = render(parse(doc), {...ctx, edit: true});
  assert.ok(noSameLaneLabelOverlap(svg), 'sub-line width ignored — labels overlap on one row');
});
