import {test} from 'node:test';
import assert from 'node:assert/strict';
import {FAMILIES, GB_TODAY} from '../technologies.js';

test('exactly 8 families (≤ dataviz validated categorical set)', () => {
  assert.equal(FAMILIES.length, 8);
  assert.deepEqual([...FAMILIES].sort(),
    ['biomass','imports','nuclear','other','solar','storage','thermal','wind'].sort());
});

test('every catalogue entry uses a declared family and a known bid kind', () => {
  const kinds = new Set(['vre','fixed','storage','imports','gas']);
  for(const t of GB_TODAY){
    assert.ok(FAMILIES.includes(t.family), `${t.key} family`);
    assert.ok(kinds.has(t.bid.kind), `${t.key} bid.kind`);
  }
});

test('sourced GB-2026 capacities are present', () => {
  const cap = k => GB_TODAY.find(t => t.key === k).installed;
  assert.equal(cap('wind'), 32);
  assert.equal(cap('solar'), 22);
  assert.equal(cap('nuclear'), 6);
  assert.equal(cap('gasCCGT'), 31);
  assert.equal(cap('gasOCGT'), 2.5);
  assert.equal(cap('bess'), 7.2);
  assert.equal(cap('pumped'), 2.8);
});

test('nuclear + waste are must-run with positive bids; wind/solar are vre', () => {
  const t = k => GB_TODAY.find(x => x.key === k);
  assert.equal(t('nuclear').mustRun, true);
  assert.equal(t('nuclear').bid.cost > 0, true);
  assert.equal(t('waste').mustRun, true);
  assert.equal(t('wind').bid.kind, 'vre');
  assert.equal(t('solar').bid.kind, 'vre');
});

test('gas bands: CCGT shares sum to 1, OCGT shares sum to 1', () => {
  const g = k => GB_TODAY.find(x => x.key === k).bid.bands.reduce((s,b) => s + b.share, 0);
  assert.equal(Math.round(g('gasCCGT') * 100) / 100, 1);
  assert.equal(Math.round(g('gasOCGT') * 100) / 100, 1);
});
