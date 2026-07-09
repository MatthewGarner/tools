import {test} from 'node:test';
import assert from 'node:assert/strict';
import {FAMILIES, GB_TODAY, FES_HT, FES_EE, FES_HE, FES_FB} from '../technologies.js';

test('10 families — 8 base + ccs + hydrogen (thermal-hued, so ≤8 chart HUES via textures)', () => {
  assert.equal(FAMILIES.length, 10);
  assert.deepEqual([...FAMILIES].sort(),
    ['biomass','ccs','hydrogen','imports','nuclear','other','solar','storage','thermal','wind'].sort());
});

test('FES catalogues carry the sourced 2035 capacities + new block types', () => {
  const cap = (cat, k) => cat.find(t => t.key === k)?.installed;
  assert.equal(cap(FES_HT, 'wind'), 124);      // 38 onshore + 86 offshore
  assert.equal(cap(FES_HT, 'gasCCS'), 8.1);
  assert.equal(cap(FES_HE, 'hydrogen'), 7.1);  // HE has the most H2
  assert.equal(cap(FES_FB, 'hydrogen'), 0);    // FB has none (kept at 0, not filtered out)
  assert.equal(cap(FES_FB, 'gasCCGT'), 33.1);  // FB leans on gas
  assert.equal(FES_HT.find(t => t.key === 'gasCCS').bid.kind, 'ccs');
  assert.equal(FES_HT.find(t => t.key === 'hydrogen').bid.cost, 200);
  assert.equal(FES_HT.find(t => t.key === 'gasCCS').thermalHue, true);
});

test('every FES catalogue: unique keys, declared families, hydro+waste held at GB-today', () => {
  for(const cat of [FES_HT, FES_EE, FES_HE, FES_FB]){
    const keys = cat.map(t => t.key);
    assert.equal(new Set(keys).size, keys.length);
    for(const t of cat) assert.ok(FAMILIES.includes(t.family), `${t.key} family`);
    assert.equal(cat.find(t => t.key === 'hydro').installed, 1.9);
    assert.equal(cat.find(t => t.key === 'waste').installed, 4.5);
  }
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
