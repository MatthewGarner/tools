import {test} from 'node:test';
import assert from 'node:assert/strict';
import {EditorState} from '../../roadmap/vendor/codemirror.js';
import {lineOpsChanges} from '../../assets/editor-common.js';
import {parse} from '../parse.js';
import {kinds, renameComponent, renameAnchor, cycleStage, dragRewrite,
  addComponent, removeComponent} from '../edit-targets.js';

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

const HABITAT = `title: Habitat platform
anchor: Habit tracking

Habit builder @ product
Streak engine @ custom
Analytics pipeline    // no position yet

Habit tracking -> Habit builder -> Streak engine
Streak engine -> Analytics pipeline`;

test('addComponent inserts after the last declaration BEFORE the edge block', () => {
  const r = addComponent(HABITAT, 'Cache', 'commodity');
  assert.equal(r.newLine, 'Cache @ commodity');
  assert.equal(r.afterLine, 5);                       // the Analytics pipeline line
  assert.equal(r.select, 'Cache');
});
test('addComponent: no stage → bare ghost line', () => {
  assert.equal(addComponent(HABITAT, 'Cache', null).newLine, 'Cache');
});
test('addComponent: edge-auto-created ghosts (edge srcLines) never count as declarations', () => {
  const doc = 'anchor: A\nA -> Mystery';
  assert.equal(addComponent(doc, 'B', 'custom').afterLine, 0);   // after anchor, before the edge
});
test('addComponent: config-only doc → after the config block', () => {
  assert.equal(addComponent('title: T\npalette: ocean', 'B', 'custom').afterLine, 1);
});
test('addComponent: empty doc → line 0', () => {
  assert.equal(addComponent('', 'B', 'custom').afterLine, 0);
});
test('removeComponent: declaration deleted, 3-chain spliced, 2-chain line deleted', () => {
  const ops = removeComponent(HABITAT, 4, 'Streak engine');
  const lines = HABITAT.split('\n');
  const del = ops.filter(o => o.text === null).map(o => o.line).sort();
  assert.deepEqual(del, [4, 8]);                      // declaration + "Streak engine -> Analytics pipeline"
  const spliced = ops.find(o => o.line === 7);
  assert.equal(spliced.text, 'Habit tracking -> Habit builder');
});
test('removeComponent: A -> B -> A collapses the self-edge it would create', () => {
  const doc = 'anchor: N\nA @ custom\nB @ custom\nN -> A\nA -> B -> A';
  const ops = removeComponent(doc, 2, 'B');
  const edge = ops.find(o => o.line === 4);
  assert.equal(edge.text, null);                      // A -> A collapses to A → <2 segments → delete
});
test('removeComponent: comments preserved on KEPT lines, lost with deleted lines', () => {
  const doc = 'anchor: N\nA @ custom\nB @ custom\nN -> A -> B   // the chain';
  const ops = removeComponent(doc, 2, 'B');
  assert.equal(ops.find(o => o.line === 3).text, 'N -> A   // the chain');
});
test('removeComponent: case-insensitive edge match', () => {
  const doc = 'anchor: N\nBig Thing @ custom\nN -> big thing';
  const del = removeComponent(doc, 1, 'Big Thing').filter(o => o.text === null).map(o => o.line);
  assert.deepEqual(del.sort(), [1, 2]);
});
test('phantom-ghost regression: removed name never survives anywhere', () => {
  // parse is already imported at the top of this test file
  const doc = 'anchor: N\nA @ custom\nB @ 0.7\nN -> A -> B\nB -> A';
  const ops = removeComponent(doc, 2, 'B');
  const lines = doc.split('\n');
  for(const o of ops) lines[o.line] = o.text;
  const out = lines.filter(l => l !== null).join('\n');
  const m = parse(out);
  assert.ok(!m.components.has('b'));
  assert.equal(m.components.get('a').x, 0.375);       // A keeps its position
});
test('removing an edge-created ghost never double-touches its line', () => {
  // ghosts declared BY an edge carry the edge's own srcLine (parse.js) — the
  // splice pass owns that line; no separate declaration-delete op may exist
  const del = removeComponent('anchor: N\nN -> Ghost', 1, 'Ghost');
  assert.deepEqual(del, [{line: 1, text: null}]);
  const spliced = removeComponent('anchor: N\nN -> Ghost -> B\nB @ custom', 1, 'Ghost');
  assert.deepEqual(spliced, [{line: 1, text: 'N -> B'}]);
});
test('rename over a COMMENTED edge line no longer skips it (live-bug regression)', () => {
  const doc = 'anchor: N\nB @ custom\nN -> B // note';
  const out = renameComponent(doc, 1, 'B', 'Core');
  const edge = out.find(e => e.line === 2);
  assert.equal(edge.text, 'N -> Core   // note');
});

test('renaming an edge-created ghost emits ONE op on its line (no duplicate → no throw)', () => {
  // the ghost "Data store" is declared BY the edge, so its srcLine is the edge
  // line; a separate declaration op would be a duplicate applyLineOps rejects
  const doc = 'anchor: Need\nNeed -> Streak engine -> Data store';
  const out = renameComponent(doc, 1, 'Data store', 'DB');
  assert.deepEqual(out, [{line: 1, text: 'Need -> Streak engine -> DB'}]);
  // applyLineOps must accept it (would throw on a duplicate line op)
  const st = EditorState.create({doc});
  assert.doesNotThrow(() => st.update({changes: lineOpsChanges(st, out)}));
});
