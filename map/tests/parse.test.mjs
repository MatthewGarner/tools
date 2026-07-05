import {test} from 'node:test';
import assert from 'node:assert/strict';
import {parse, parseRules, MAX_ITEMS} from '../parse.js';

test('spec example: preset, positions, fields, unplaced tray', () => {
  const m = parse([
    'preset: assumptions',
    '',
    'Users will import their data @ 15,85 :: test: watch 5 onboarding sessions',
    'Finance will sponsor          @ 70,60',
    'Churn is price-driven         @ 40,90 :: test: interview 5 churned users',
    'Legal sign-off                            // no position → unplaced tray',
  ].join('\n'));
  assert.equal(m.preset, 'assumptions');
  assert.equal(m.items.length, 4);
  assert.deepEqual([m.items[0].x, m.items[0].y], [15, 85]);
  assert.deepEqual(m.items[0].fields, [{key:'test', val:'watch 5 onboarding sessions', srcLine:2}]);
  assert.equal(m.items[1].label, 'Finance will sponsor');
  assert.equal(m.items[3].x, null);           // unplaced
  assert.equal(m.items[3].srcLine, 5);
  assert.equal(m.warnings.length, 0);
});

test('inline // is not a comment; only whole-line comments are stripped', () => {
  const m = parse('// whole-line comment\nItem @ 10,10');
  assert.equal(m.items.length, 1);
});

test('custom mode: axes with end labels, grid, cell names, rule zones', () => {
  const m = parse([
    'x: Effort (low → high)',
    'y: Value (low -> high)',
    'zones: grid 3x3',
    'zone 1,3: Quick wins',
    'zone quick-wins: x < 35 & y > 65',
    'zone band: x + y > 120',
  ].join('\n'));
  assert.deepEqual(m.axes.x, {label:'Effort', low:'low', high:'high', srcLine:0});
  assert.deepEqual(m.axes.y, {label:'Value', low:'low', high:'high', srcLine:1});
  assert.deepEqual(m.grid, {cols:3, rows:3, srcLine:2});
  assert.deepEqual(m.cellNames, [{col:1, row:3, name:'Quick wins', srcLine:3}]);
  assert.deepEqual(m.ruleZones[0].rules,
    [{expr:'x', op:'<', val:35}, {expr:'y', op:'>', val:65}]);
  assert.deepEqual(m.ruleZones[1].rules, [{expr:'x+y', op:'>', val:120}]);
});

test('axis label without end labels', () => {
  const m = parse('x: Effort');
  assert.deepEqual(m.axes.x, {label:'Effort', low:null, high:null, srcLine:0});
});

test('rule grammar edge cases', () => {
  assert.deepEqual(parseRules('x-y < -10').rules, [{expr:'x-y', op:'<', val:-10}]);
  assert.deepEqual(parseRules('X > 12.5').rules, [{expr:'x', op:'>', val:12.5}]);
  assert.ok(parseRules('x = 50').error);
  assert.ok(parseRules('x < 35 & z > 10').error);
  assert.ok(parseRules('x*y > 100').error);
});

test('bad rule zone warns with line number and is dropped', () => {
  const m = parse('zone weird: x % 3 > 1');
  assert.equal(m.ruleZones.length, 0);
  assert.ok(m.warnings.some(w => w.startsWith('line 1:')));
});

test('unknown preset warns; palette/accent/title as series', () => {
  const m = parse('preset: swot\ntitle: T\npalette: plum\naccent: #123ABC');
  assert.equal(m.preset, null);
  assert.ok(m.warnings.some(w => w.includes('swot')));
  assert.equal(m.title, 'T');
  assert.equal(m.palette, 'plum');
  assert.equal(m.accent, '#123ABC');
});

test('positions clamp to 0–100 with warning', () => {
  const m = parse('Over the edge @ 120,-5');
  assert.deepEqual([m.items[0].x, m.items[0].y], [100, 0]);
  assert.ok(m.warnings.some(w => w.includes('clamped')));
});

test('field segment without key: value becomes a note with warning', () => {
  const m = parse('Item @ 10,10 :: just some words');
  assert.deepEqual(m.items[0].fields[0].key, 'note');
  assert.equal(m.items[0].fields[0].val, 'just some words');
  assert.ok(m.warnings.some(w => w.includes('key: value')));
});

test('zones: wants grid NxM; out-of-range grid warns', () => {
  assert.ok(parse('zones: circles').warnings.some(w => w.includes('grid NxM')));
  const m = parse('zones: grid 9x2');
  assert.equal(m.grid, null);
  assert.ok(m.warnings.some(w => w.includes('1x1 to 6x6')));
});

test('missing label warns and placeholds', () => {
  const m = parse('@ 50,50');
  assert.equal(m.items[0].label, '(unnamed)');
  assert.ok(m.warnings.some(w => w.includes('label')));
});

test('cell-name zone without a name warns', () => {
  assert.ok(parse('zone 1,2:').warnings.some(w => w.includes('name')));
});

test('item cap warns beyond MAX_ITEMS but keeps rendering all', () => {
  const src = Array.from({length: MAX_ITEMS + 1}, (_, i) => 'Item ' + i + ' @ 50,50').join('\n');
  const m = parse(src);
  assert.equal(m.items.length, MAX_ITEMS + 1);
  assert.ok(m.warnings.some(w => w.includes('crowded')));
});

test('decimal positions parse', () => {
  const m = parse('Fine @ 12.5,87.5');
  assert.deepEqual([m.items[0].x, m.items[0].y], [12.5, 87.5]);
});

test('stray @ that looks like a position warns and stays in the label', () => {
  for(const src of ['Thing @ 55', 'Thing @ 55 60', 'Thing @ 55,', 'Thing @']){
    const m = parse(src);
    assert.equal(m.items[0].x, null, src);
    assert.ok(m.warnings.some(w => w.includes('@ x,y')), src + ' should warn');
  }
});

test('@ followed by plain words is left alone', () => {
  const m = parse('Email @ scale\nShip @ 40,90');
  assert.equal(m.items[0].label, 'Email @ scale');
  assert.deepEqual([m.items[1].x, m.items[1].y], [40, 90]);
  assert.equal(m.warnings.length, 0);
});
