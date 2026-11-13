/* Q-IMP / F-MO-9: the page says how many GW of imports each world offers, and that
   they come at an assumed neighbour price. The figures themselves are unchanged. */
import {test} from 'node:test';
import assert from 'node:assert/strict';
import * as R from '../render.js';
import {buildStack, importsOffer} from '../stack.js';
import {WORLDS, paramsFor} from '../scenarios.js';

const line = (world, cond) => {
  const w = WORLDS[world], p = paramsFor(world, cond), gens = buildStack(p, w.catalogue);
  return {text: R.importLine(gens, importsOffer(p, w.catalogue).installed), gens};
};

test('Q-IMP: each world names its own import offer, and the assumed price', () => {
  const want = {gbToday: [3, 10.3], ht: [3, 19], ee: [3, 21], he: [3, 18], fb: [3, 13]};
  for(const [k, [offered, installed]] of Object.entries(want)){
    const {text} = line(k, null);
    assert.ok(text.includes(`${offered} GW of ${installed} GW installed`), `${k}: ${text}`);
    assert.match(text, /assumed neighbour price of £80\/MWh/, k);
  }
});

test('Q-IMP: the still cold peak offers 5 GW, and the line follows it', () => {
  const a = line('fb', null).text, b = line('fb', 'coldPeak').text;
  assert.notEqual(a, b);
  assert.ok(b.includes('5 GW of 13 GW installed'), b);
  assert.ok(line('gbToday', 'coldPeak').text.includes('5 GW of 10.3 GW installed'));
});

test('Q-IMP: the figures are untouched — the import block still offers min(imports, installed) at £80', () => {
  const {gens} = line('fb', 'coldPeak');
  assert.equal(gens.find(g => g.name === 'Imports').capacity, 5);
  assert.equal(gens.find(g => g.name === 'Imports').cost, 80);
});

test('Q-IMP: the receipt carries the line; no imports block, no line', () => {
  const {gens} = line('ee', null);
  const lines = R.receiptLines({generators: gens, demand: 60}, {worldLabel: 'x', gas: 100, carbon: 50, importsInstalled: 21});
  assert.ok(lines.some(l => /3 GW of 21 GW installed.*assumed neighbour price/.test(l)), lines.join('|'));
  assert.equal(R.importLine(gens.filter(g => g.family !== 'imports'), 21), '');
});
