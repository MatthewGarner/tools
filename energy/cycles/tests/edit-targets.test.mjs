import {test} from 'node:test';
import assert from 'node:assert/strict';
import {parse} from '../parse.js';
import {validators, editField, addKeyLine, removeKeyLine, ADDABLE} from '../edit-targets.js';

const DOC =
`title: Cycle budget
battery: 100MW / 200MWh
spread: 35..85
rte: 86..90%
fade: 0.006..0.012 %/cycle
calendar: 1.0..1.8 %/yr
cycles: 6000 over 15yr`;

test('field rewrites hit their own number only', () => {
  assert.equal(editField('battery: 100MW / 200MWh', 'mw', '50'), 'battery: 50MW / 200MWh');
  assert.equal(editField('battery: 100MW / 200MWh', 'mwh', '400'), 'battery: 100MW / 400MWh');
  assert.equal(editField('spread: 35..85', 'spreadLo', '30'), 'spread: 30..85');
  assert.equal(editField('spread: 35..85', 'spreadHi', '90'), 'spread: 35..90');
  assert.equal(editField('fade: 0.006..0.012 %/cycle', 'fadeHi', '0.02'), 'fade: 0.006..0.02 %/cycle');
  assert.equal(editField('cycles: 6000 over 15yr', 'budget', '4000'), 'cycles: 4000 over 15yr');
  assert.equal(editField('cycles: 6000 over 15yr', 'years', '20'), 'cycles: 6000 over 20yr');
  assert.equal(editField('drift: -4..0 %/yr', 'driftLo', '-6'), 'drift: -6..0 %/yr');
  assert.equal(editField('second: 35..60%', 'secondHi', '70'), 'second: 35..70%');
  assert.equal(editField('augment: 120..180 £/kWh', 'augLo', '100'), 'augment: 100..180 £/kWh');
});

test('single-value lines: the lo field edits the lone number', () => {
  assert.equal(editField('rte: 88%', 'rteLo', '86'), 'rte: 86%');
  assert.equal(editField('charge: 20', 'chargeLo', '25'), 'charge: 25');
});

test('round-trips through the parser; unknown field is a no-op', () => {
  const m = parse('battery: 100MW / 200MWh\n' + editField('spread: 35..85', 'spreadHi', '95'));
  assert.equal(m.spread.hi, 95);
  assert.equal(editField('spread: 35..85', 'nope', '1'), 'spread: 35..85');
});

test('validators.num', () => {
  for(const ok of ['70', '-4', '0.006']) assert.ok(validators.num(ok));
  for(const bad of ['', 'x', '1..2']) assert.ok(!validators.num(bad));
});

/* ---- structure edits: add / remove an optional key line ---- */

test('ADDABLE is exactly the optional keys', () => {
  assert.deepEqual([...ADDABLE].sort(), ['augment', 'charge', 'discount', 'drift', 'second']);
});

test('addKeyLine returns an inline default for each optional key', () => {
  assert.equal(addKeyLine(DOC, 'second').newLine, 'second: 35..60%');
  assert.equal(addKeyLine(DOC, 'drift').newLine, 'drift: -4..0 %/yr');
  assert.equal(addKeyLine(DOC, 'augment').newLine, 'augment: 120..180 £/kWh');
  assert.equal(addKeyLine(DOC, 'discount').newLine, 'discount: 7..10%');
});

test('addKeyLine charge makes the 45%-of-spread assumption explicit (from the real spread)', () => {
  const r = addKeyLine(DOC, 'charge');           // spread 35..85 → p50 √(35·85)=54.5 → 0.45·=24.5 → 25
  assert.equal(r.newLine, 'charge: 25');
  const before = parse(DOC);                     // the defaulted value it replaces
  const lines = DOC.split('\n');
  lines.splice(r.afterLine + 1, 0, r.newLine);
  const after = parse(lines.join('\n'));
  assert.equal(after.chargeDefaulted, false);    // now explicit
  assert.ok(Math.abs(after.charge.lo - before.charge.lo) <= 1, 'stays within a whisker of the default it makes explicit');
});

test('addKeyLine charge falls back to a fixed range with no spread', () => {
  assert.equal(addKeyLine('battery: 100MW / 200MWh', 'charge').newLine, 'charge: 15..45');
});

test('addKeyLine inserts after the nearest present canonical predecessor', () => {
  // charge → after spread (line 2); the doc reads canonically afterwards
  const c = addKeyLine(DOC, 'charge');
  assert.equal(c.afterLine, 2);
  // augment → after cycles (line 6, the last present key before it)
  const a = addKeyLine(DOC, 'augment');
  assert.equal(a.afterLine, 6);
  // drift → after spread (charge/second absent), i.e. line 2
  const d = addKeyLine(DOC, 'drift');
  assert.equal(d.afterLine, 2);
});

test('the inserted line parses cleanly (soft warnings only, no new errors)', () => {
  for(const k of ['charge', 'second', 'drift', 'augment', 'discount']){
    const r = addKeyLine(DOC, k);
    const lines = DOC.split('\n');
    lines.splice(r.afterLine + 1, 0, r.newLine);
    const m = parse(lines.join('\n'));
    assert.ok(m.srcLines[k] != null, k + ' is now a real parsed key');
    assert.ok(!m.warnings.some(w => /don’t know/.test(w)), k + ' produced no unknown-key warning');
  }
});

test('addKeyLine is a no-op when the key is already present or not addable', () => {
  const withSecond = DOC + '\nsecond: 40..70%';
  assert.equal(addKeyLine(withSecond, 'second'), null);
  assert.equal(addKeyLine(DOC, 'spread'), null);    // required, not addable
  assert.equal(addKeyLine(DOC, 'nope'), null);
});

test('removeKeyLine returns the source line of a present optional key, -1 otherwise', () => {
  const withDrift = DOC + '\ndrift: -3..1 %/yr';
  assert.equal(removeKeyLine(withDrift, 'drift'), 7);
  assert.equal(removeKeyLine(DOC, 'drift'), -1);    // absent
  assert.equal(removeKeyLine(DOC, 'spread'), -1);   // required, not removable
  assert.equal(removeKeyLine(DOC, 'nope'), -1);
});

test('remove is comment-aware via the parser srcLines (finds the line despite a // note)', () => {
  const doc = DOC + '\naugment: 120..180 £/kWh   // OEM quote';
  assert.equal(removeKeyLine(doc, 'augment'), 7);
});
