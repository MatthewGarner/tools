import {test} from 'node:test';
import assert from 'node:assert/strict';
import {validators, setPosition, editLabel, editField, renameZone, setAxisLabel, addItemLine, removeItemLine,
  configInsertIndex} from '../edit-targets.js';

test('setPosition appends @ x,y to a bare label', () => {
  assert.equal(setPosition('Legal sign-off', 62, 41), 'Legal sign-off @ 62,41');
});

test('setPosition replaces an existing position, preserving fields', () => {
  assert.equal(setPosition('Churn is price-driven @ 40,90 :: test: interview five', 55, 70),
    'Churn is price-driven @ 55,70 :: test: interview five');
});

test('setPosition inserts before :: when unplaced but fielded; @ in a field value untouched', () => {
  assert.equal(setPosition('Email launch :: note: ping me @ standup', 30, 60),
    'Email launch @ 30,60 :: note: ping me @ standup');
});

test('editLabel swaps exactly the old label text', () => {
  assert.equal(editLabel('Old name @ 10,20 :: note: n', 'Old name', 'New name'),
    'New name @ 10,20 :: note: n');
});

test('editField rewrites the matching field value only', () => {
  assert.equal(editField('A @ 1,2 :: test: old plan :: note: keep', 'test', 'old plan', 'new plan'),
    'A @ 1,2 :: test: new plan :: note: keep');
  assert.equal(editField('A :: note: x', 'test', 'x', 'y'), 'A :: note: x');   // no match → unchanged
});

test('configInsertIndex points just past the config block', () => {
  assert.equal(configInsertIndex(['preset: futures', '', 'Item @ 1,2']), 1);
  assert.equal(configInsertIndex(['// c', 'title: T', 'zone 1,1: A', 'Item']), 3);
  assert.equal(configInsertIndex(['Item one']), 0);
});

test('renameZone rewrites a declared cell name after the colon', () => {
  const t = 'zones: grid 2x2\nzone 1,2: Quick wins\nItem @ 10,80';
  assert.equal(renameZone(t, {kind:'cell', col:1, row:2, srcLine:1}, 'Easy wins'),
    'zones: grid 2x2\nzone 1,2: Easy wins\nItem @ 10,80');
});

test('renameZone inserts a cell line for preset-named cells (srcLine null)', () => {
  const t = 'preset: futures\n\nSignal @ 20,80';
  assert.equal(renameZone(t, {kind:'cell', col:1, row:2, srcLine:null}, 'Walled gardens'),
    'preset: futures\nzone 1,2: Walled gardens\n\nSignal @ 20,80');
});

test('renameZone rewrites a rule-zone name before the colon', () => {
  const t = 'zone quick-wins: x < 35 & y > 65\nItem @ 10,80';
  assert.equal(renameZone(t, {kind:'rule', srcLine:0}, 'sure things'),
    'zone sure things: x < 35 & y > 65\nItem @ 10,80');
});

test('renameZone returns null for preset rule zones (not renamable in v1)', () => {
  assert.equal(renameZone('preset: risk', {kind:'rule', srcLine:null}, 'x'), null);
});

test('setAxisLabel rewrites an existing x: line, preserving end labels', () => {
  assert.equal(setAxisLabel('x: Effort (low → high)\nItem @ 1,2', 'x', 'Cost'),
    'x: Cost (low → high)\nItem @ 1,2');
});

test('setAxisLabel inserts when the axis line is missing', () => {
  assert.equal(setAxisLabel('preset: futures\nSignal @ 20,80', 'y', 'AI acceptance'),
    'preset: futures\ny: AI acceptance\nSignal @ 20,80');
});

test('validators: labels reject config collisions, ::, @, emptiness; zone names reject : and &', () => {
  assert.ok(validators.label('A perfectly good label'));
  assert.ok(!validators.label(''));
  assert.ok(!validators.label('zones: grid 2x2'));
  assert.ok(!validators.label('a :: b'));
  assert.ok(!validators.label('at @ 5,5'));
  assert.ok(validators.zonename('Walled gardens'));
  assert.ok(!validators.zonename('a: b'));
  assert.ok(!validators.zonename('a & b'));
  assert.ok(validators.axis('Regulation'));
  assert.ok(!validators.axis('Reg (light)'));
  assert.ok(validators.field('watch 5 sessions'));
  assert.ok(!validators.field('a :: b'));
});

test('addItemLine appends after the last item; new items are unplaced', () => {
  const doc = `preset: assumptions
title: T

First item @ 30,90 :: test: watch sessions
Second item @ 75,80
Third unplaced item`;
  const {afterLine, newLine} = addItemLine(doc);
  assert.equal(afterLine, 5);
  assert.equal(newLine, 'New item');
  assert.ok(!newLine.includes('@'));   // unplaced → lands in the tray
});

test('addItemLine with no items inserts after the config block', () => {
  const {afterLine} = addItemLine('preset: assumptions\ntitle: T');
  assert.equal(afterLine, 1);
});

test('removeItemLine accepts only item lines', () => {
  const doc = 'preset: assumptions\n\nOnly item @ 5,5';
  assert.equal(removeItemLine(doc, 2), true);
  assert.equal(removeItemLine(doc, 0), false);   // config
  assert.equal(removeItemLine(doc, 1), false);   // blank
});
