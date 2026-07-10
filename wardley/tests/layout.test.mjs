import {test} from 'node:test';
import assert from 'node:assert/strict';
import {parse} from '../parse.js';
import {layoutMap} from '../layout.js';

const lay = (src, geom) => layoutMap(parse(src), geom);
const node = (l, name) => l.nodes.find(n => n.name === name);

test('anchors top, dependents below, needs deepest', () => {
  const l = lay('anchor: Need\nApp @ product\nDB @ commodity\nNeed -> App -> DB');
  assert.ok(node(l, 'Need').anchor);
  assert.ok(node(l, 'Need').y < node(l, 'App').y);
  assert.ok(node(l, 'App').y < node(l, 'DB').y);
});

test('multi-parent takes the longest path', () => {
  // Need -> A -> B -> C and Need -> C: C sits below B (depth 3), not at depth 1
  const l = lay('anchor: Need\nA @ custom\nB @ custom\nC @ commodity\nNeed -> A -> B -> C\nNeed -> C');
  assert.ok(node(l, 'C').y > node(l, 'B').y);
  assert.ok(node(l, 'B').y > node(l, 'A').y);
});

test('cycle edges dropped, layout completes, reported', () => {
  const l = lay('anchor: Need\nA @ custom\nB @ custom\nC @ custom\nNeed -> A -> B -> C\nC -> A');
  assert.equal(l.droppedEdges.length, 1);
  assert.ok(node(l, 'A').y < node(l, 'B').y);     // depth still resolves
  assert.ok(l.links.some(k => k.dropped));
});

test('orphan lands on the bottom row and is reported', () => {
  const l = lay('anchor: Need\nA @ custom\nLoner @ product\nNeed -> A');
  assert.deepEqual(l.orphans, ['Loner']);
  const maxY = Math.max(...l.nodes.map(n => n.y));
  assert.equal(node(l, 'Loner').y, maxY);
});

test('unplaced ghosts pin to the left edge', () => {
  const l = lay('anchor: Need\nGhosty\nNeed -> Ghosty');
  const g = node(l, 'Ghosty');
  assert.ok(g.ghost);
  const placed = lay('anchor: Need\nGhosty @ commodity\nNeed -> Ghosty');
  assert.ok(g.px < node(placed, 'Ghosty').px);
});

test('collision spread: near-equal x in one row get distinct y, deterministically', () => {
  const src = 'anchor: Need\nA @ 0.40\nB @ 0.41\nNeed -> A\nNeed -> B';
  const l1 = lay(src), l2 = lay(src);
  assert.deepEqual(l1, l2);
  assert.notEqual(node(l1, 'A').y, node(l1, 'B').y);
});

test('links carry pixel endpoints between the right nodes', () => {
  const l = lay('anchor: Need\nApp @ product\nNeed -> App');
  assert.equal(l.links.length, 1);
  const [need, app] = [node(l, 'Need'), node(l, 'App')];
  assert.equal(l.links[0].x1, need.px);
  assert.equal(l.links[0].y1, need.y);
  assert.equal(l.links[0].x2, app.px);
  assert.equal(l.links[0].y2, app.y);
});

test('geometry: px maps x through pad and width', () => {
  const l = lay('anchor: Need\nMid @ 0.5\nNeed -> Mid', {w: 1000, h: 600, pad: 100});
  assert.equal(node(l, 'Mid').px, 100 + 0.5 * 800);
});
