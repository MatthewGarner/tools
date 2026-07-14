/* The verdict is the quotable line — it goes on the deck as the standfirst, and
   roadmap has never had one. It must be right at EVERY size of board, including the
   degenerate ones, so these pin the copy, not just the code path. */
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {parse} from '../parse.js';
import {roadmapVerdict, wipBreach} from '../render-deck.js';

const V = (src, diff) => roadmapVerdict(parse(src), diff);

test('priority 1: a WIP breach outranks everything, in the tool\'s own words', () => {
  const src = 'wip: 2\nNOW\nCore: A [risk]\nCore: B\nCore: C\n\nNEXT\nCore: D';
  assert.equal(V(src), 'Now has 3 items — that’s a list, not a strategy.');
});

test('the WIP copy is ONE shared constant (the deck and the editor warning cannot drift)', () => {
  const m = parse('wip: 2\nNOW\nCore: A\nCore: B\nCore: C');
  assert.equal(wipBreach(m), 'Now has 3 items — that’s a list, not a strategy.',
    'app.js appends its own "(Raise or silence…)" hint to this same stem');
});

test('priority 2: flags — blocked named before at-risk, at most two named', () => {
  const src = 'NOW\nCore: Alpha [risk]\nCore: Beta [blocked]\nCore: Gamma\n\nNEXT\nCore: Delta';
  assert.equal(V(src), 'Now carries 3 of 4 items — Beta blocked, Alpha at risk.');
});

test('priority 2: three or more flags summarise rather than list', () => {
  const src = 'NOW\nCore: Alpha [risk]\nCore: Beta [risk]\nCore: Gamma [risk]\n\nNEXT\nCore: D';
  assert.match(V(src), /\+1 more flagged\.$/);
});

test('priority 3: a diff, when nothing is flagged', () => {
  const src = 'NOW\nCore: A\nCore: B';
  const v = V(src, {any: true, since: '12 Jun', added: 2, moved: 0, dropped: 1});
  assert.equal(v, 'Now carries 2 of 2 items — since 12 Jun: 2 added, 1 dropped.');
});

test('a diff with no bits never emits a dangling colon', () => {
  const v = V('NOW\nCore: A', {any: true, since: '12 Jun', added: 0, moved: 0, dropped: 0});
  assert.doesNotMatch(v, /:\s*\.$/, 'the "since X: ." defect');
  assert.match(v, /Now carries 1 of 1 item\b/);
});

test('priority 4: plain — the load claim plus what is moving', () => {
  assert.equal(V('NOW\nCore: A [doing]\nCore: B\n\nNEXT\nCore: C'),
    'Now carries 2 of 3 items — 1 in progress.');
});

test('pluralisation: one item is an "item" (this is the quotable line — it cannot be wrong)', () => {
  assert.equal(V('NOW\nCore: A'), 'Now carries 1 of 1 item.');
  assert.match(V('NOW\nCore: A [doing]'), /1 in progress\.$/);
  assert.match(V('NOW\nCore: A [doing]\nCore: B [doing]'), /2 in progress\.$/);
});

test('an empty first horizon reads as a fact, not as an error on a slide', () => {
  const v = V('NEXT\nCore: A\n\nLATER\nCore: B');
  assert.equal(v, 'Nothing in Now — 2 items queued in Next and Later.');
  assert.doesNotMatch(v, /0 of/, '"Now carries 0 of 2 items" reads like a bug');
});

test('an empty board does not crash and says so', () => {
  assert.equal(V('title: T'), 'Nothing on the board yet.');
});

test('a long flagged title is clipped, not allowed to run away with the line', () => {
  const long = 'A'.repeat(90);
  const v = V('NOW\nCore: ' + long + ' [risk]');
  assert.ok(v.length < 90, 'the verdict must stay quotable, got ' + v.length + ' chars');
  assert.match(v, /…/, 'clipped with an ellipsis');
});

test('custom horizon names interpolate (a time axis names the period)', () => {
  const src = 'horizons: quarterly from Q3 2026 x3\nQ3 2026\nCore: A\n\nQ4 2026\nCore: B';
  assert.equal(V(src), 'Q3 2026 carries 1 of 2 items.');
});

test('wip: off never fires the breach path, however long Now gets', () => {
  const src = 'wip: off\nNOW\n' + Array.from({length: 9}, (_, i) => 'Core: I' + i).join('\n');
  assert.doesNotMatch(V(src), /list, not a strategy/);
  assert.match(V(src), /^Now carries 9 of 9 items/);
});
