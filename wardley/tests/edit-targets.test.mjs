import {test} from 'node:test';
import assert from 'node:assert/strict';
import {parse} from '../parse.js';
import {kinds, renameComponent, renameAnchor, cycleStage, dragRewrite} from '../edit-targets.js';

const DOC = `title: T
anchor: Need
Streak engine @ custom
User DB @ 0.83
Need -> Streak engine -> User DB
streak engine -> Need2`;

const apply = (text, edits) => {
  const lines = text.split('\n');
  for(const e of edits) lines[e.line] = e.text;
  return lines.join('\n');
};

test('renameComponent rewrites the declaration and every edge mention', () => {
  const edits = renameComponent(DOC, 2, 'Streak engine', 'Habit engine');
  assert.equal(edits.length, 3);                       // decl + 2 edge lines
  const out = apply(DOC, edits);
  const m = parse(out);
  assert.ok(m.components.has('habit engine'));
  assert.ok(!m.components.has('streak engine'));
  assert.equal(m.edges.filter(e => e.from === 'habit engine' || e.to === 'habit engine').length, 3);
});

test('renameAnchor rewrites the anchor line and edge mentions', () => {
  const edits = renameAnchor(DOC, 1, 'Need', 'Habit tracking');
  const out = apply(DOC, edits);
  const m = parse(out);
  assert.equal(m.anchors[0].name, 'Habit tracking');
  assert.ok(m.edges.some(e => e.from === 'habit tracking'));
});

test('cycleStage writes the stage word', () => {
  const edits = cycleStage(DOC, 2, 'product');
  assert.deepEqual(edits, [{line: 2, text: 'Streak engine @ product'}]);
  const m = parse(apply(DOC, edits));
  assert.equal(m.components.get('streak engine').x, 0.625);
  assert.equal(m.components.get('streak engine').stage, 'product');
});

test('dragRewrite: numeric replaces the stage word', () => {
  const edits = dragRewrite(DOC, 2, 0.6234);
  assert.deepEqual(edits, [{line: 2, text: 'Streak engine @ 0.62'}]);
});

test('dragRewrite: bare ghost gains a position and stops being a ghost', () => {
  const doc = 'anchor: A\nGhosty\nA -> Ghosty';
  const out = apply(doc, dragRewrite(doc, 1, 0.31));
  const g = parse(out).components.get('ghosty');
  assert.equal(g.x, 0.31);
  assert.equal(g.ghost, false);
});

test('dragRewrite clamps outside 0–1', () => {
  assert.deepEqual(dragRewrite(DOC, 3, 1.7), [{line: 3, text: 'User DB @ 1'}]);
  assert.deepEqual(dragRewrite(DOC, 3, -0.4), [{line: 3, text: 'User DB @ 0'}]);
});

test('name validator rejects structure characters and empties', () => {
  assert.ok(kinds.name.validate('Habit engine'));
  assert.ok(!kinds.name.validate(''));
  assert.ok(!kinds.name.validate('a -> b'));
  assert.ok(!kinds.name.validate('a @ b'));
});

test('stage kind cycles through the four words', () => {
  assert.deepEqual(kinds.stage.cycle, ['genesis', 'custom', 'product', 'commodity']);
});

test('dragRewrite places @ BEFORE a trailing comment (the ghost-drag bug)', () => {
  const doc = 'anchor: A\nAnalytics pipeline    // no position yet\nA -> Analytics pipeline';
  const edits = dragRewrite(doc, 1, 0.6);
  assert.deepEqual(edits, [{line: 1, text: 'Analytics pipeline @ 0.6   // no position yet'}]);
  const lines = doc.split('\n'); lines[1] = edits[0].text;
  const g = parse(lines.join('\n')).components.get('analytics pipeline');
  assert.equal(g.x, 0.6);
  assert.equal(g.ghost, false);
});

test('cycleStage and rename preserve trailing comments', () => {
  const doc = 'anchor: A\nB @ custom   // core bet\nA -> B';
  assert.deepEqual(cycleStage(doc, 1, 'product'), [{line: 1, text: 'B @ product   // core bet'}]);
  const out = renameComponent(doc, 1, 'B', 'Core');
  assert.equal(out[0].text, 'Core @ custom   // core bet');
});
