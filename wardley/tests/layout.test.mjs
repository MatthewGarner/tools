import {test} from 'node:test';
import assert from 'node:assert/strict';
import {parse} from '../parse.js';
import {layoutMap} from '../layout.js';

const lay = (src, geom) => layoutMap(parse(src), {measure: text => text.length * 7, intent: 'native', geom});
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

test('authored evolution x survives every density and export intent exactly', () => {
  const components = Array.from({length: 18}, (_, i) => `Component ${i + 1} @ ${(i + 1) / 20}`).join('\n');
  const model = parse('anchor: Need\n' + components);
  for(const intent of ['live-wide', 'native', 'presentation']){
    const layout = layoutMap(model, {measure: text => text.length * 7, intent});
    for(const component of model.components.values()){
      const placed = node(layout, component.name);
      assert.equal(placed.x, component.x);
      assert.equal(placed.px, layout.pad + component.x * (layout.w - 2 * layout.pad));
    }
  }
});

test('density keeps every authored label in the field rather than replacing it with a remote key', () => {
  const components = Array.from({length: 18}, (_, i) => `Capability ${String(i + 1).padStart(2, '0')} @ ${((i % 4) + 1) / 5}`).join('\n');
  const layout = lay('anchor: Need\n' + components);
  assert.equal(layout.density, 'stacked');
  assert.equal(layout.keyEntries.length, 0);
  assert.deepEqual(layout.nodes.filter(item => !item.anchor).map(item => item.id),
    Array.from({length:18}, (_, i) => 'W' + String(i + 1).padStart(2, '0')));
  assert.ok(layout.nodes.filter(item => !item.anchor).every(item => !item.useKey && item.lines.join(' ').startsWith('Capability')));
});

test('long direct names become measured two-line cards without row overlap', () => {
  const src = `anchor: Customer need
Long capability for cohort onboarding @ custom
Reliable notification delivery service @ custom
Customer need -> Long capability for cohort onboarding
Customer need -> Reliable notification delivery service`;
  const layout = lay(src);
  const cards = layout.nodes.filter(item => !item.anchor);
  assert.ok(cards.every(item => item.lines.length === 2 && item.cardH > 28));
  const [a,b] = cards;
  const overlapX = a.cardX < b.cardX+b.cardW && a.cardX+a.cardW > b.cardX;
  assert.ok(!overlapX || Math.abs(a.y-b.y) >= Math.max(a.cardH,b.cardH));
});

test('cycle callouts and dependency spine are deterministic', () => {
  const src = 'anchor: Need\nA @ custom\nB @ product\nC @ commodity\nNeed -> A -> B -> C\nC -> A';
  const a=lay(src),b=lay(src);
  assert.deepEqual(a.loopCallouts,b.loopCallouts);
  assert.equal(a.loopCallouts.length,1);
  assert.deepEqual(a.spine.map(item=>item.name),['Need','A','B','C']);
});
