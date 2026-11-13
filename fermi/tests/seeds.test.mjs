import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {SEEDS, N, SENS_N, POUR_GRAINS, CF_SEED, CF_N, CF_BAND_N} from '../seeds.js';

test('the stream constants are what saved links were made with', () => {
  assert.deepEqual([SEEDS.A, SEEDS.B, N, SENS_N, POUR_GRAINS, CF_SEED, CF_N, CF_BAND_N],
    [0x5EED, 0x0B5EED, 20000, 8000, 500, 0xCA5F, 40000, 10000]);
});

test('app.js and the golden harness both take them from the one module', () => {
  const app = readFileSync(new URL('../app.js', import.meta.url), 'utf8');
  const golden = readFileSync(new URL('../../dev/golden.mjs', import.meta.url), 'utf8');
  assert.match(app, /from '\.\/seeds\.js'/);
  assert.match(golden, /fermi\/seeds\.js/);
  assert.doesNotMatch(app, /0x5EED|0xCA5F|const N = 20000/);
  const fermi = golden.slice(golden.indexOf("selected('fermi-driver')"), golden.indexOf("/* /timeline fixtures"));
  assert.doesNotMatch(fermi, /0x5EED|0xCA5F|20000|10000|40000/);
});
