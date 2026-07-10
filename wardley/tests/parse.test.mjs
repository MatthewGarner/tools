import {test} from 'node:test';
import assert from 'node:assert/strict';
import {parse, STAGES} from '../parse.js';

const DOC = `title: Habitat platform
anchor: Habit tracking

// the platform
Streak engine @ custom
User DB @ 0.83
Push gateway

Habit tracking -> Streak engine -> User DB
Streak engine -> Push gateway`;

test('config + anchor + components + chained edges parse', () => {
  const m = parse(DOC);
  assert.equal(m.title, 'Habitat platform');
  assert.deepEqual(m.anchors, [{name: 'Habit tracking', srcLine: 1}]);
  const streak = m.components.get('streak engine');
  assert.equal(streak.name, 'Streak engine');
  assert.equal(streak.x, 0.375);                 // custom midpoint
  assert.equal(streak.stage, 'custom');
  assert.equal(streak.ghost, false);
  assert.equal(streak.srcLine, 4);
  assert.equal(m.components.get('user db').x, 0.83);
  assert.equal(m.components.get('user db').stage, null);
  assert.deepEqual(m.edges, [
    {from: 'habit tracking', to: 'streak engine', srcLine: 8},
    {from: 'streak engine', to: 'user db', srcLine: 8},
    {from: 'streak engine', to: 'push gateway', srcLine: 9},
  ]);
  assert.equal(m.warnings.length, 1);            // only the bare Push gateway
});

test('stage names snap to midpoints', () => {
  const m = parse('anchor: A\nG @ genesis\nC @ custom\nP @ product\nK @ commodity\nA -> G');
  assert.equal(m.components.get('g').x, 0.125);
  assert.equal(m.components.get('c').x, 0.375);
  assert.equal(m.components.get('p').x, 0.625);
  assert.equal(m.components.get('k').x, 0.875);
});

test('bare component is a ghost with a warning', () => {
  const m = parse('anchor: A\nPush gateway\nA -> Push gateway');
  const g = m.components.get('push gateway');
  assert.equal(g.ghost, true);
  assert.equal(g.x, null);
  assert.ok(m.warnings.some(w => w.includes('line 2') && w.includes('no position')));
});

test('edge naming an undeclared component auto-creates a ghost + warning', () => {
  const m = parse('anchor: A\nB @ custom\nA -> B -> Mystery');
  const g = m.components.get('mystery');
  assert.equal(g.ghost, true);
  assert.equal(g.name, 'Mystery');
  assert.ok(m.warnings.some(w => w.includes('line 3') && w.toLowerCase().includes('undeclared')));
});

test('duplicate component warns, first declaration wins', () => {
  const m = parse('anchor: A\nB @ custom\nb @ product\nA -> B');
  assert.equal(m.components.get('b').x, 0.375);
  assert.ok(m.warnings.some(w => w.includes('line 3') && w.includes('duplicate')));
});

test('missing anchor: placeholder + warning', () => {
  const m = parse('B @ custom');
  assert.equal(m.anchors.length, 1);
  assert.equal(m.anchors[0].name, 'User need');
  assert.ok(m.warnings.some(w => w.toLowerCase().includes('anchor')));
});

test('unknown stage word: warning, unplaced ghost', () => {
  const m = parse('anchor: A\nB @ bespoke\nA -> B');
  assert.equal(m.components.get('b').x, null);
  assert.equal(m.components.get('b').ghost, true);
  assert.ok(m.warnings.some(w => w.includes('line 2') && w.includes('bespoke')));
});

test('numeric position outside 0–1 clamps with a warning', () => {
  const m = parse('anchor: A\nB @ 1.4\nA -> B');
  assert.equal(m.components.get('b').x, 1);
  assert.ok(m.warnings.some(w => w.includes('line 2')));
});

test('edges match case-insensitively; display name preserved', () => {
  const m = parse('anchor: A\nStreak Engine @ custom\nA -> streak engine');
  assert.equal(m.components.get('streak engine').name, 'Streak Engine');
  assert.deepEqual(m.edges[0], {from: 'a', to: 'streak engine', srcLine: 2});
});

test('self-edges and empty segments warn and are skipped', () => {
  const m = parse('anchor: A\nB @ custom\nB -> B\nA -> \nA -> B');
  assert.equal(m.edges.length, 1);
  assert.ok(m.warnings.some(w => w.includes('line 3') && w.includes('itself')));
  assert.ok(m.warnings.some(w => w.includes('line 4')));
});

test('comments and blanks are skipped; config after content warns', () => {
  const m = parse('anchor: A\nB @ custom\ntitle: Late\nA -> B');
  assert.equal(m.title, '');
  assert.ok(m.warnings.some(w => w.includes('line 3')));
});

test('palette and accent validate like the house DSLs', () => {
  const ok = parse('title: T\npalette: ocean\naccent: #C05621\nanchor: A\nB @ custom\nA -> B');
  assert.equal(ok.palette, 'ocean');
  assert.equal(ok.accent, '#C05621');
  const bad = parse('palette: nope\naccent: red\nanchor: A\nB @ custom\nA -> B');
  assert.equal(bad.palette, 'ocean');            // default kept
  assert.equal(bad.accent, null);
  assert.equal(bad.warnings.filter(w => w.includes('line 1') || w.includes('line 2')).length, 2);
});

test('STAGES exports the four bands', () => {
  assert.deepEqual(STAGES.map(s => s.name), ['genesis', 'custom', 'product', 'commodity']);
});

test('trailing // comments are stripped from content lines', () => {
  const m = parse('anchor: A\nAnalytics pipeline    // drag me\nA -> Analytics pipeline');
  assert.ok(m.components.has('analytics pipeline'));
  assert.equal(m.components.size, 1);              // no bogus second ghost
  assert.equal(m.components.get('analytics pipeline').name, 'Analytics pipeline');
});
