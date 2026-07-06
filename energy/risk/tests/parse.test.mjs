import {test} from 'node:test';
import assert from 'node:assert/strict';
import {parse} from '../parse.js';

test('config keys + merchant range', () => {
  const m = parse('title: T\nunit: $/kW/yr\nmerchant: 60..180');
  assert.equal(m.title, 'T');
  assert.equal(m.unit, '$/kW/yr');
  assert.deepEqual({lo: m.merchant.lo, hi: m.merchant.hi}, {lo: 60, hi: 180});
  assert.equal(m.merchant.srcLine, 2);
  assert.deepEqual(m.warnings, []);
});

test('floor with share and fee; share stored as fraction', () => {
  const m = parse('merchant: 60..180\nfloor: 70 share 60% fee 5');
  const s = m.structures[0];
  assert.equal(s.kind, 'floor');
  assert.deepEqual(s.params, {level: 70, share: 0.6, fee: 5});
  assert.equal(s.srcLine, 1);
});

test('bare floor keeps all upside (share defaults 1, fee 0)', () => {
  const s = parse('merchant: 60..180\nfloor: 70').structures[0];
  assert.deepEqual(s.params, {level: 70, share: 1, fee: 0});
});

test('toll and insure with limit; labels default and can be quoted', () => {
  const m = parse('merchant: 60..180\ntoll: 95 "2-year toll"\ninsure: premium 6 attach 65 limit 30');
  assert.deepEqual(m.structures[0], {kind: 'toll', label: '2-year toll',
    params: {fixed: 95, fee: 0}, srcLine: 1});
  const ins = m.structures[1];
  assert.equal(ins.label, 'Insure @65');
  assert.deepEqual(ins.params, {premium: 6, attach: 65, limit: 30});
});

test('soft warnings, never hard errors', () => {
  const m = parse([
    'merchant: 180..60',            // inverted → swap + warn
    'floor: 200 share 60%',         // above P95 → always binds
    'floor: 10',                    // below P5 → never binds
    'insure: attach 65',            // missing premium → skipped + warn
    'floor: 70 premium 3',          // premium doesn't apply to floor
    'gibberish here',               // unknown line
    'merchant: 50..100',            // second merchant ignored
  ].join('\n'));
  assert.deepEqual({lo: m.merchant.lo, hi: m.merchant.hi}, {lo: 60, hi: 180});
  assert.equal(m.structures.length, 3);           // two floors + the floor that ignored premium
  assert.equal(m.warnings.length, 7);
  for(const frag of ['inverted', 'always binds', 'never binds',
      'premium', 'apply', 'merchant: / floor: / toll: / insure:', 'one revenue'])
    assert.ok(m.warnings.some(w => w.includes(frag)), 'want a warning about: ' + frag + ' — got ' + JSON.stringify(m.warnings));
});

test('share above 100 clamps with a warning; attach at/above midpoint warns', () => {
  const m = parse('merchant: 60..180\nfloor: 70 share 140%\ninsure: premium 6 attach 130');
  assert.equal(m.structures[0].params.share, 1);
  assert.ok(m.warnings.some(w => w.includes('share')));
  assert.ok(m.warnings.some(w => w.includes('median')));
});

test('comments and blank lines are free; srcLine survives them', () => {
  const m = parse('// a comment\n\nmerchant: 60..180 // trailing note\nfloor: 70');
  assert.equal(m.merchant.srcLine, 2);
  assert.equal(m.structures[0].srcLine, 3);
});

test('no merchant line warns once structures exist', () => {
  const m = parse('floor: 70');
  assert.equal(m.merchant, null);
  assert.ok(m.warnings.some(w => w.includes('merchant')));
});
