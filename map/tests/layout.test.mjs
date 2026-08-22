import {test} from 'node:test';
import assert from 'node:assert/strict';
import {parse} from '../parse.js';
import {layoutPlaced, measuredLines, sourceItems} from '../layout.js';

const measure = (text, font = '') => String(text).length * (+(/([\d.]+)px/.exec(font)?.[1] || 12)) * 0.55;

test('display IDs follow source order without entering the model', () => {
  const model = parse('A @ 20,80\nB @ 80,20\nC');
  const records = sourceItems(model, {flagged: []});
  assert.deepEqual(records.map(record => record.id), ['M01', 'M02', 'M03']);
  assert.equal('id' in model.items[0], false);
});

test('direct geometry is pure and grows to two measured label lines', () => {
  const model = parse('A long map label that wraps cleanly @ 50,50');
  const records = sourceItems(model, {flagged: []});
  const args = {planeX: 72, planeY: 70, planeW: 620, planeH: 470, scale: 1,
    measure, font: '700 11px sans-serif', maxLabelW: 110, zoneObstacles: []};
  const one = layoutPlaced(records, args), two = layoutPlaced(records, args);
  assert.deepEqual(one, two);
  assert.equal(one.mode, 'direct');
  assert.equal(one.records[0].lines.length, 2);
  assert.ok(one.records[0].h > 20);
});

test('direct layout can reserve the true 44px menu footprint without falling back to IDs', () => {
  const model = parse('Alpha @ 50,50\nBeta @ 50,50\nGamma @ 50,50');
  const plan = layoutPlaced(sourceItems(model, {flagged: []}), {planeX:72, planeY:70, planeW:620, planeH:470,
    measure, font:'700 11px sans-serif', zoneObstacles:[], interactionHeight:44});
  assert.equal(plan.mode, 'direct');
  for(let i=0;i<plan.records.length;i++) for(let j=i+1;j<plan.records.length;j++){
    const a=plan.records[i], b=plan.records[j], ay=a.y+a.h/2-22, by=b.y+b.h/2-22;
    const overlap=Math.min(a.x+a.w+16,b.x+b.w+16)>Math.max(a.x,b.x) && Math.min(ay+44,by+44)>Math.max(ay,by);
    assert.equal(overlap, false, 'direct labels must be separated enough for their real menus');
  }
});

test('more than nine items switches to an exhaustive keyed layout', () => {
  const model = parse(Array.from({length: 10}, (_, i) => `Item ${i + 1} @ 50,50`).join('\n'));
  const records = sourceItems(model, {flagged: []});
  const plan = layoutPlaced(records, {planeX: 72, planeY: 70, planeW: 620, planeH: 470,
    measure, font: '700 11px sans-serif', zoneObstacles: []});
  assert.equal(plan.mode, 'keyed');
  assert.equal(plan.records.length, 10);
});

test('single long tokens break within the measured label width', () => {
  const lines = measuredLines('Supercalifragilisticexpialidocious', '700 11px sans-serif', 55, measure);
  assert.ok(lines.length > 1);
  assert.ok(lines.every(line => measure(line, '700 11px sans-serif') <= 55.01));
});
