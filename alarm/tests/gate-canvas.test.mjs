import {test} from 'node:test';
import assert from 'node:assert/strict';
import {layoutFlow} from '../gate-canvas.js';
const geom = {w: 800, h: 400, dotR: 3};
const dots = Array.from({length: 100}, (_, i) => ({real: i < 10, score: i < 55 ? 2 : -1}));

test('single stage: two terminal bins, counts add up', () => {
  const {bins, positions} = layoutFlow(dots, [{split: d => d.score > 0}], geom);
  assert.equal(bins.length, 2);
  assert.equal(bins[0].count + bins[1].count, 100);
  assert.equal(positions.length, 100);
});
test('bins group by class: real dots contiguous within a bin', () => {
  const {positions} = layoutFlow(dots, [{split: d => d.score > 0}], geom);
  const alarm = positions.filter(p => p.pass[0]).sort((a, b) => a.y1 - b.y1 || a.x1 - b.x1);
  const flags = alarm.map(p => dots[p.i].real);
  const firstBenign = flags.indexOf(false);
  assert.ok(firstBenign === -1 || flags.slice(firstBenign).every(f => !f));  // no real after benign
});
test('two stages: three terminal bins (proves the #105 API)', () => {
  const {bins} = layoutFlow(dots, [{split: d => d.score > 0}, {split: d => d.score > 1}], geom);
  assert.equal(bins.length, 3);
  assert.equal(bins.reduce((s, b) => s + b.count, 0), 100);
});
test('layout is pure and deterministic', () => {
  const a = layoutFlow(dots, [{split: d => d.score > 0}], geom);
  assert.deepEqual(a, layoutFlow(dots, [{split: d => d.score > 0}], geom));
});
