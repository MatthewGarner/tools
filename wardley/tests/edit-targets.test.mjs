import {test} from 'node:test';
import assert from 'node:assert/strict';
import {EditorState} from '../../roadmap/vendor/codemirror.js';
import {lineOpsChanges} from '../../assets/editor-common.js';
import {parse} from '../parse.js';
import {kinds, renameComponent, renameAnchor, cycleStage, dragRewrite,
  addComponent, removeComponent, addEdge, removeEdge} from '../edit-targets.js';

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

test('a declaration whose COMMENT contains an arrow is still a declaration', () => {
  // the edge-line guard must read the CODE part only, not the raw line
  const doc = 'anchor: N\nFoo @ custom  // migrating v1->v2\nN -> Foo';
  // remove: the declaration line IS deleted (not just its edge)
  const del = removeComponent(doc, 1, 'Foo').filter(o => o.text === null).map(o => o.line);
  assert.deepEqual(del.sort(), [1, 2]);                 // declaration + its now-1-segment edge
  // rename: the declaration line IS rewritten (comment kept; house 3-space gap)
  const out = renameComponent(doc, 1, 'Foo', 'Bar');
  const decl = out.find(o => o.line === 1);
  assert.equal(decl.text, 'Bar @ custom   // migrating v1->v2');
  const lines = doc.split('\n'); for(const o of out) lines[o.line] = o.text;
  const m = parse(lines.join('\n'));
  assert.ok(m.components.has('bar') && !m.components.has('foo'));   // renamed, not split
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

/* ================= addEdge / removeEdge (the Needs… toggle) =================
   An edge is a PAIR inside a possibly-longer chain line, so removal is a
   chain-split rewrite; addition appends a fresh 2-node line (unambiguous, and
   the doc reads the same). Both are degeneration-proof: bad input → no-op. */

const applyOps = (text, ops) => {
  const lines = text.split('\n');
  for(const o of ops) lines[o.line] = o.text;
  return lines.filter(l => l !== null).join('\n');
};
const addApplied = (text, r) => {
  const lines = text.split('\n');
  lines.splice(r.afterLine + 1, 0, r.newLine);
  return lines.join('\n');
};

test('addEdge appends "from -> to" after the last non-blank line', () => {
  const r = addEdge(HABITAT, 'Habit builder', 'Analytics pipeline');
  assert.deepEqual(r, {afterLine: 8, newLine: 'Habit builder -> Analytics pipeline'});
  const m = parse(addApplied(HABITAT, r));
  assert.ok(m.edges.some(e => e.from === 'habit builder' && e.to === 'analytics pipeline'));
});
test('addEdge round-trips clean: edge count +1, no new warnings, no new components', () => {
  const before = parse(HABITAT);
  const m = parse(addApplied(HABITAT, addEdge(HABITAT, 'Habit builder', 'Analytics pipeline')));
  assert.equal(m.edges.length, before.edges.length + 1);
  assert.equal(m.warnings.length, before.warnings.length);
  assert.equal(m.components.size, before.components.size);
});
test('addEdge skips trailing blank lines when placing the new line', () => {
  const doc = 'anchor: A\nB @ custom\nC @ custom\n\n';
  assert.equal(addEdge(doc, 'B', 'C').afterLine, 2);
});
test('addEdge is a no-op when the pair already exists (even mid-chain — duplicates count twice)', () => {
  assert.equal(addEdge(HABITAT, 'Habit tracking', 'Habit builder'), null);
  assert.equal(addEdge(HABITAT, 'habit TRACKING', 'HABIT builder'), null);   // case-insensitive
});
test('addEdge: reverse direction is independent — B->A adds even when A->B exists', () => {
  const r = addEdge(HABITAT, 'Streak engine', 'Habit builder');
  assert.equal(r.newLine, 'Streak engine -> Habit builder');
});
test('addEdge: the anchor is a valid FROM end', () => {
  const r = addEdge(HABITAT, 'Habit tracking', 'Streak engine');
  assert.equal(r.newLine, 'Habit tracking -> Streak engine');
});
test('addEdge no-ops on self, empties and unknown names (degeneration-proof)', () => {
  assert.equal(addEdge(HABITAT, 'Habit builder', 'Habit builder'), null);
  assert.equal(addEdge(HABITAT, 'Habit builder', 'habit BUILDER'), null);
  assert.equal(addEdge(HABITAT, '', 'Habit builder'), null);
  assert.equal(addEdge(HABITAT, 'Habit builder', '  '), null);
  assert.equal(addEdge(HABITAT, 'Nope', 'Habit builder'), null);
  assert.equal(addEdge(HABITAT, 'Habit builder', 'Nope'), null);
});
test('addEdge refuses a name the edge line cannot carry (anchor literally named "a -> b")', () => {
  // `anchor: a -> b` is a legal anchor whose NAME contains an arrow — written
  // into an edge line it would shatter into different edges; must no-op
  const doc = 'anchor: a -> b\nX @ custom';
  assert.equal(addEdge(doc, 'a -> b', 'X'), null);
  assert.equal(addEdge(doc, 'X', 'a -> b'), null);
});

test('removeEdge end-of-chain: A -> B -> C minus (B,C) leaves A -> B', () => {
  const doc = 'anchor: A\nB @ custom\nC @ custom\nA -> B -> C';
  assert.deepEqual(removeEdge(doc, 'B', 'C'), [{line: 3, text: 'A -> B'}]);
});
test('removeEdge start-of-chain: A -> B -> C minus (A,B) leaves B -> C', () => {
  const doc = 'anchor: A\nB @ custom\nC @ custom\nA -> B -> C';
  assert.deepEqual(removeEdge(doc, 'A', 'B'), [{line: 3, text: 'B -> C'}]);
});
test('removeEdge middle-split: A -> B -> C -> D minus (B,C) leaves TWO chains', () => {
  const doc = 'anchor: A\nB @ custom\nC @ custom\nD @ custom\nA -> B -> C -> D';
  const ops = removeEdge(doc, 'B', 'C');
  assert.deepEqual(ops, [{line: 4, text: 'A -> B\nC -> D'}]);
  const m = parse(applyOps(doc, ops));
  assert.deepEqual(m.edges.map(e => e.from + '>' + e.to).sort(), ['a>b', 'c>d']);
  // the multiline op must be a single CM change (one dispatch = one undo)
  const st = EditorState.create({doc});
  assert.doesNotThrow(() => st.update({changes: lineOpsChanges(st, ops)}));
});
test('removeEdge single-edge line: the whole line goes', () => {
  const doc = 'anchor: A\nB @ custom\nA -> B';
  assert.deepEqual(removeEdge(doc, 'A', 'B'), [{line: 2, text: null}]);
});
test('removeEdge hits EVERY line carrying the pair', () => {
  const doc = 'anchor: A\nB @ custom\nC @ custom\nA -> B\nC -> A -> B';
  assert.deepEqual(removeEdge(doc, 'A', 'B'),
    [{line: 3, text: null}, {line: 4, text: 'C -> A'}]);
});
test('removeEdge repeated pair in ONE line: A -> B -> A -> B minus (A,B) leaves B -> A', () => {
  const doc = 'anchor: A\nB @ custom\nA -> B -> A -> B';
  assert.deepEqual(removeEdge(doc, 'A', 'B'), [{line: 2, text: 'B -> A'}]);
});
test('removeEdge no-ops: absent pair, reverse direction, self pair, empties, unknowns', () => {
  const doc = 'anchor: A\nB @ custom\nC @ custom\nA -> B -> C';
  assert.deepEqual(removeEdge(doc, 'A', 'C'), []);     // not adjacent = not an edge
  assert.deepEqual(removeEdge(doc, 'B', 'A'), []);     // reverse not removed
  assert.deepEqual(removeEdge(doc, 'B', 'B'), []);
  assert.deepEqual(removeEdge(doc, '', 'B'), []);
  assert.deepEqual(removeEdge(doc, 'B', '  '), []);
  assert.deepEqual(removeEdge(doc, 'Nope', 'Also nope'), []);
});
test('removeEdge is case-insensitive and keeps the original indent', () => {
  const doc = 'anchor: A\nB @ custom\nC @ custom\n  A -> B -> C';
  assert.deepEqual(removeEdge(doc, 'b', 'c'), [{line: 3, text: '  A -> B'}]);
});
test('removeEdge keeps a trailing comment on the kept line; middle-split parks it on the LAST fragment', () => {
  const doc = 'anchor: A\nB @ custom\nC @ custom\nA -> B -> C   // the chain';
  assert.deepEqual(removeEdge(doc, 'B', 'C'), [{line: 3, text: 'A -> B   // the chain'}]);
  const doc2 = 'anchor: A\nB @ custom\nC @ custom\nD @ custom\nA -> B -> C -> D   // the chain';
  assert.deepEqual(removeEdge(doc2, 'B', 'C'), [{line: 4, text: 'A -> B\nC -> D   // the chain'}]);
});
test('removeEdge deletes a whole line comment-and-all (removeComponent precedent)', () => {
  const doc = 'anchor: A\nB @ custom\nA -> B   // note dies with the line';
  assert.deepEqual(removeEdge(doc, 'A', 'B'), [{line: 2, text: null}]);
});
test('removeEdge matches through a malformed empty segment the way the parser does', () => {
  // parse() filters empty segments, so "A ->  -> B" IS the edge (A,B); removing
  // it must not leave a stub behind
  const doc = 'anchor: A\nB @ custom\nA ->  -> B';
  assert.deepEqual(removeEdge(doc, 'A', 'B'), [{line: 2, text: null}]);
});
test('removeEdge whole-flow on the house example: mid-chain split, siblings untouched', () => {
  const ops = removeEdge(HABITAT, 'Habit builder', 'Streak engine');
  const m = parse(applyOps(HABITAT, ops));
  assert.ok(!m.edges.some(e => e.from === 'habit builder' && e.to === 'streak engine'));
  assert.ok(m.edges.some(e => e.from === 'habit tracking' && e.to === 'habit builder'));
  assert.ok(m.edges.some(e => e.from === 'streak engine' && e.to === 'analytics pipeline'));
  assert.equal(m.components.size, parse(HABITAT).components.size);   // nobody became a ghost casualty
});
