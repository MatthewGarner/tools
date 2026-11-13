import {test} from 'node:test';
import assert from 'node:assert/strict';
import {railLabels, overlapping} from '../labels.js';

/* XB-4: the exposure rule's labels never overprint and stay inside the margins. 6px per character. */
const measure = s => String(s).length * 6;
const opts = {x0: 40, x1: 1200, measure, font: '9.5px x'};

test('equal values share one label', () => {
  const r = railLabels([{key: 'P10', valueText: '−200', x: 400}, {key: 'P50', valueText: '−200', x: 400}, {key: 'P90', valueText: '+300', x: 700}], opts);
  assert.deepEqual(r.labels.map(l => l.text), ['P10 · P50 −200', 'P90 +300']);
});

test('the zero marker is dropped rather than printed over P50, and when a label already reads 0', () => {
  const near = railLabels([{key: 'P10', valueText: '−360', x: 100}, {key: 'P50', valueText: '+10', x: 300}, {key: 'P90', valueText: '+390', x: 700}], {...opts, zero: {x: 298}});
  assert.ok(!near.labels.some(l => l.text === '0'), 'zero overlapped P50 and is left out');
  const far = railLabels([{key: 'P10', valueText: '−360', x: 100}, {key: 'P50', valueText: '+10', x: 300}, {key: 'P90', valueText: '+390', x: 700}], {...opts, zero: {x: 500}});
  assert.ok(far.labels.some(l => l.text === '0'));
  const equal = railLabels([{key: 'P10', valueText: '0', x: 300}, {key: 'P90', valueText: '+390', x: 700}], {...opts, zero: {x: 300}});
  assert.deepEqual(equal.labels.map(l => l.text), ['P10 0', 'P90 +390'], 'a label already reads 0: no second 0');
});

test('labels stay inside the margins: anchored to the edge instead of hanging out', () => {
  const r = railLabels([{key: 'P10', valueText: '−1000', x: 42}, {key: 'P50', valueText: '+10', x: 600}, {key: 'P90', valueText: '+3000', x: 1199}], opts);
  for(const l of r.labels){ assert.ok(l.left >= 40 - 1e-9 && l.right <= 1200 + 1e-9, l.text); }
  assert.equal(r.labels[0].anchor, 'start');
  assert.equal(r.labels.at(-1).anchor, 'end');
});

test('crowded labels never overprint: they drop to further rows', () => {
  const r = railLabels([{key: 'P10', valueText: '−200', x: 500}, {key: 'P50', valueText: '−190', x: 520}, {key: 'P90', valueText: '−180', x: 540}], opts);
  assert.equal(overlapping(r.labels), false);
  assert.equal(r.rows, 3);
  assert.equal(r.labels.length, 3);
});

test('a roomy rule keeps one row and the centred labels', () => {
  const r = railLabels([{key: 'P10', valueText: '−200', x: 300}, {key: 'P50', valueText: '+10', x: 600}, {key: 'P90', valueText: '+300', x: 900}], opts);
  assert.equal(r.rows, 1);
  assert.ok(r.labels.every(l => l.anchor === 'middle'));
});
