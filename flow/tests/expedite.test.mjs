import test from 'node:test';
import assert from 'node:assert/strict';
import {expediteSensitivity} from '../expedite.js';

const healthy = {demandPerWeek: 3, itemDays: 4, team: 4, wipLimit: 4, cov: 'med'};

test('zero expedite demand leaves no expedite observation and a standard reading', () => {
  const r = expediteSensitivity(healthy, {expeditePerWeek: 0});
  assert.equal(r.effectivePerWeek, 0);
  assert.equal(r.expedite, null);
  assert.ok(r.standard?.mean > 0);
});

test('priority sensitivity is deterministic and preserves a standard lane', () => {
  const a = expediteSensitivity(healthy, {expeditePerWeek: 1});
  const b = expediteSensitivity(healthy, {expeditePerWeek: 1});
  assert.deepEqual(a, b);
  assert.ok(a.expedite?.count > 0 && a.standard?.count > 0);
  assert.ok(a.expedite.mean < a.standard.mean, `${a.expedite.mean} < ${a.standard.mean}`);
});

test('requested expedites are capped below all demand rather than erasing standard work', () => {
  const r = expediteSensitivity(healthy, {expeditePerWeek: 100});
  assert.equal(r.effectivePerWeek, healthy.demandPerWeek * .8);
  assert.ok(r.standard?.count > 0);
});
