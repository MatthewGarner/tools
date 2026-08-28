import {test} from 'node:test';
import assert from 'node:assert/strict';
import {normalizeReceipt, normalizeReceiptMap, packScen, unpackScen, receiptLabel, receiptChipLabel} from '../state.js';

const gauge = {
  kind: 'gauge', label: 'Gauge room envelope', question: 'Weeks to migrate?', unit: 'weeks', round: 2,
  responses: 7, pooling: 'median-endpoints', status: 'needs-restatement',
};

test('legacy v tuples unpack as Stated here and repack without p', () => {
  const state = unpackScen({f: 'users * price', v: {users: ['20', '40', 'uni'], price: ['8', '12']}, t: '500'});
  assert.deepEqual(state.vars.get('users'), {lo: '20', hi: '40', dist: 'uni', base: null});
  assert.deepEqual(state.vars.get('price'), {lo: '8', hi: '12', dist: 'auto', base: null});
  assert.equal(state.droppedReceipts.length, 0);
  assert.deepEqual(packScen(state), {
    f: 'users * price', v: {users: ['20', '40', 'uni'], price: ['8', '12', 'auto']}, t: '500',
  });
});

test('Gauge, snapshot and person receipts round-trip in a separate p map', () => {
  const raw = {f: 'a+b+c', v: {a: ['1', '2', 'auto'], b: ['3', '4', 'auto'], c: ['5', '6', 'auto']}, p: {
    a: gauge,
    b: {kind: 'snapshot', label: 'May cohort export'},
    c: {kind: 'person', label: 'Operations lead'},
  }};
  const state = unpackScen(raw);
  assert.deepEqual(state.vars.get('a').base, gauge);
  assert.deepEqual(state.vars.get('b').base, {kind: 'snapshot', label: 'May cohort export'});
  assert.deepEqual(state.vars.get('c').base, {kind: 'person', label: 'Operations lead'});
  assert.deepEqual(packScen(state), raw);
});

test('Gauge receipt requires the full provenance and supports adopted state', () => {
  assert.deepEqual(normalizeReceipt({...gauge, status: 'adopted'}), {...gauge, status: 'adopted'});
  assert.deepEqual(normalizeReceipt({...gauge, status: 'not-used'}), {...gauge, status: 'not-used'});
  for(const field of ['label', 'round', 'responses', 'pooling', 'status']){
    const bad = {...gauge}; delete bad[field];
    assert.equal(normalizeReceipt(bad), null, field);
  }
  assert.equal(normalizeReceipt({...gauge, pooling: 'average'}), null);
  assert.equal(normalizeReceipt({...gauge, status: 'trusted'}), null);
});

test('unknown, malformed and crafted receipts fail closed to Stated here', () => {
  assert.equal(normalizeReceipt({kind: 'case', label: 'Definitely true'}), null);
  assert.equal(normalizeReceipt({kind: 'snapshot', label: ''}), null);
  assert.equal(normalizeReceipt({kind: 'person', label: 'x\u0000y'}), null);
  assert.equal(normalizeReceipt(Object.create({kind: 'snapshot', label: 'prototype'})), null);
  const accessor = {};
  Object.defineProperty(accessor, 'kind', {get(){ throw new Error('must not run'); }});
  assert.equal(normalizeReceipt(accessor), null);

  const state = unpackScen({f: 'x', v: {x: ['1', '2', 'auto']}, p: {
    x: {kind: 'unknown', label: 'Authority'}, ghost: gauge,
  }});
  assert.equal(state.vars.get('x').base, null);
  assert.deepEqual(state.droppedReceipts.sort(), ['ghost', 'x']);
});

test('target unpack drops non-normalizable Gauge question and unit receipts', () => {
  for(const [field, value] of [
    ['question', 'Weeks\u0000to migrate'],
    ['unit', 'week\u0007s'],
    ['question', 'Weeks\u0085to migrate'],
    ['question', 'Weeks\u202eto migrate'],
    ['unit', 'week\u200ds'],
  ]){
    const state = unpackScen({f:'x', v:{x:['1', '2', 'auto']}, p:{
      x:{...gauge, [field]:value},
    }});
    assert.equal(state.vars.get('x').base, null, field);
    assert.deepEqual(state.droppedReceipts, ['x'], field);
  }
});

test('receipt maps ignore prototype-pollution keys and receipts for absent variables', () => {
  const raw = JSON.parse('{"__proto__":{"kind":"snapshot","label":"bad"},"x":{"kind":"snapshot","label":"May"},"y":{"kind":"person","label":"No row"}}');
  const {receipts, dropped} = normalizeReceiptMap(raw, ['x']);
  assert.deepEqual([...receipts], [['x', {kind: 'snapshot', label: 'May'}]]);
  assert.deepEqual(dropped.sort(), ['__proto__', 'y']);
  assert.equal({}.label, undefined);
});

test('pack normalises receipts and never serialises an absent receipt', () => {
  const snap = {f: 'x+y', vars: new Map([
    ['x', {lo: '1', hi: '2', dist: 'auto', base: {kind: 'snapshot', label: '  Export  '}}],
    ['y', {lo: '3', hi: '4', dist: 'auto', base: {kind: 'oracle', label: 'Certain'}}],
  ]), thresh: ''};
  assert.deepEqual(packScen(snap), {
    f: 'x+y', v: {x: ['1', '2', 'auto'], y: ['3', '4', 'auto']},
    p: {x: {kind: 'snapshot', label: 'Export'}},
  });
});

test('receiptLabel is explicit about source without certifying authority', () => {
  assert.equal(receiptLabel(null), 'Stated here');
  assert.equal(receiptLabel({kind: 'snapshot', label: 'May data'}), 'Data snapshot · May data');
  assert.equal(receiptLabel({...gauge, status: 'adopted'}),
    'Gauge → adopted · Gauge room envelope · weeks · 7 responses · round 2 · median endpoints');
  assert.equal(receiptLabel(gauge),
    'Gauge → review needed · Gauge room envelope · weeks · 7 responses · round 2 · median endpoints');
  assert.equal(receiptLabel({...gauge, status: 'not-used'}),
    'Gauge → not used · Gauge room envelope · weeks · 7 responses · round 2 · median endpoints');
  assert.equal(receiptChipLabel(gauge), 'Gauge · review needed');
  assert.equal(receiptChipLabel({...gauge, status: 'adopted'}), 'Gauge · adopted');
});
