import {test} from 'node:test';
import assert from 'node:assert/strict';
import {parse} from '../parse.js';
import {validators, editField, editLabel, removeParam, addLegLine, removeLegLine, legTemplate} from '../edit-targets.js';

const DOC =
`title: Route to market
merchant: 60..180

floor: 70 share 60% fee 5    // optimiser floor
toll: 95
insure: premium 6 attach 65 limit 30`;

test('validators.num accepts decimals, rejects junk', () => {
  for(const ok of ['70', '70.5', '0']) assert.ok(validators.num(ok), ok);
  for(const bad of ['', 'abc', '7..0', '-']) assert.ok(!validators.num(bad), bad);
});

test('validators.label accepts one-line text (incl. empty), rejects quotes/newlines', () => {
  for(const ok of ['', 'PPA floor', 'Floor 55 + 75/25']) assert.ok(validators.label(ok), ok);
  for(const bad of ['a"b', 'two\nlines']) assert.ok(!validators.label(bad), bad);
});

test('every field rewrites its own number and nothing else', () => {
  assert.equal(editField('floor: 70 share 60% fee 5', 'level', '85'), 'floor: 85 share 60% fee 5');
  assert.equal(editField('floor: 70 share 60% fee 5', 'share', '75'), 'floor: 70 share 75% fee 5');
  assert.equal(editField('floor: 70 share 60% fee 5', 'fee', '8'), 'floor: 70 share 60% fee 8');
  assert.equal(editField('toll: 95', 'fixed', '100'), 'toll: 100');
  assert.equal(editField('insure: premium 6 attach 65 limit 30', 'attach', '60'),
    'insure: premium 6 attach 60 limit 30');
  assert.equal(editField('merchant: 60..180', 'merchantLo', '55'), 'merchant: 55..180');
  assert.equal(editField('merchant: 60..180', 'merchantHi', '200'), 'merchant: 60..200');
});

test('rewrites round-trip through the parser', () => {
  const line = editField('floor: 70 share 60% fee 5 "Optimiser"', 'share', '75');
  const m = parse('merchant: 60..180\n' + line);
  assert.equal(m.structures[0].params.share, 0.75);
  assert.equal(m.structures[0].label, 'Optimiser');   // label untouched
});

test('unknown field or unmatched line returns the line unchanged', () => {
  assert.equal(editField('toll: 95', 'share', '75'), 'toll: 95');
  assert.equal(editField('floor: 70', 'nope', '1'), 'floor: 70');
});

/* ---- editField append-on-absent (fixes the silent no-op on floors written
   without share/fee, and powers the insure "＋ Add limit" menu row) ---- */

test('editing an ABSENT share/fee appends the clause (was a silent no-op)', () => {
  assert.equal(editField('floor: 70', 'share', '75'), 'floor: 70 share 75%');
  assert.equal(editField('floor: 70 share 60%', 'fee', '5'), 'floor: 70 share 60% fee 5');
  assert.equal(editField('insure: premium 6 attach 65', 'limit', '30'), 'insure: premium 6 attach 65 limit 30');
});

test('append lands at the end of the params, BEFORE the trailing "label" and any // comment', () => {
  assert.equal(editField('floor: 70 "PPA floor"', 'share', '75'), 'floor: 70 share 75% "PPA floor"');
  assert.equal(editField('floor: 70 fee 5   // note', 'share', '80'), 'floor: 70 fee 5 share 80%   // note');
  assert.equal(editField('insure: premium 6 attach 65 "cover"', 'limit', '30'), 'insure: premium 6 attach 65 limit 30 "cover"');
});

test('append round-trips through the parser', () => {
  const m = parse('merchant: 60..180\n' + editField('floor: 70 "x"', 'share', '75'));
  assert.equal(m.structures[0].params.share, 0.75);
  assert.equal(m.structures[0].label, 'x');
});

test('present share/fee still edit in place (append does not double them)', () => {
  assert.equal(editField('floor: 70 share 60% fee 5', 'share', '75'), 'floor: 70 share 75% fee 5');
  assert.equal(editField('floor: 70 share 60% fee 5', 'fee', '8'), 'floor: 70 share 60% fee 8');
});

/* ---- editLabel: set / replace / clear the trailing "label" ---- */

test('editLabel sets, replaces, and clears the quoted label (comment-aware)', () => {
  assert.equal(editLabel('toll: 95', 'Fixed PPA'), 'toll: 95 "Fixed PPA"');
  assert.equal(editLabel('toll: 95 "old"', 'new'), 'toll: 95 "new"');
  assert.equal(editLabel('toll: 95 "old"', ''), 'toll: 95');
  assert.equal(editLabel('floor: 70 share 60% "opt"   // note', 'renamed'), 'floor: 70 share 60% "renamed"   // note');
  assert.equal(editLabel('toll: 95   // note', 'Fixed'), 'toll: 95 "Fixed"   // note');
});

/* ---- removeParam: strip a share/fee/limit clause (insure "Remove limit") ---- */

test('removeParam strips the clause, keeping label + comment', () => {
  assert.equal(removeParam('insure: premium 6 attach 65 limit 30', 'limit'), 'insure: premium 6 attach 65');
  assert.equal(removeParam('insure: premium 6 attach 65 limit 30 "cover"', 'limit'), 'insure: premium 6 attach 65 "cover"');
  assert.equal(removeParam('floor: 70 share 60% fee 5   // n', 'fee'), 'floor: 70 share 60%   // n');
  assert.equal(removeParam('insure: premium 6 attach 65', 'limit'), 'insure: premium 6 attach 65');  // absent: no-op
});

/* ---- addLegLine / legTemplate: new structure from the merchant range ---- */

test('legTemplate derives sensible values from the merchant range', () => {
  const merch = {lo: 60, hi: 180};
  assert.equal(legTemplate('floor', merch), 'floor: 72 share 60%');
  assert.equal(legTemplate('toll', merch), 'toll: 96');
  assert.equal(legTemplate('insure', merch), 'insure: premium 6 attach 66');
});

test('legTemplate falls back to house constants with no merchant', () => {
  assert.equal(legTemplate('floor', null), 'floor: 70 share 60%');
  assert.equal(legTemplate('toll', null), 'toll: 95');
  assert.equal(legTemplate('insure', null), 'insure: premium 6 attach 65');
});

test('addLegLine inserts after the last structure (else after merchant)', () => {
  const r = addLegLine(DOC, 'floor');
  assert.equal(r.afterLine, 5);                       // after the insure line
  assert.equal(r.newLine, 'floor: 72 share 60%');
  const noStruct = 'title: x\nmerchant: 60..180';
  const r2 = addLegLine(noStruct, 'toll');
  assert.equal(r2.afterLine, 1);                      // after merchant
  assert.equal(r2.newLine, 'toll: 96');
});

test('the added leg parses cleanly as a new structure', () => {
  const r = addLegLine(DOC, 'insure');
  const lines = DOC.split('\n');
  lines.splice(r.afterLine + 1, 0, r.newLine);
  const m = parse(lines.join('\n'));
  assert.equal(m.structures.length, 4);
  assert.equal(m.structures[3].kind, 'insure');
  assert.ok(!m.warnings.some(w => /don’t know/.test(w)));
});

test('addLegLine rejects an unknown kind', () => {
  assert.equal(addLegLine(DOC, 'merchant'), null);
  assert.equal(addLegLine(DOC, 'nope'), null);
});

test('removeLegLine confirms a structure line, rejects merchant/config', () => {
  assert.equal(removeLegLine(DOC, 3), true);           // the floor line
  assert.equal(removeLegLine(DOC, 5), true);           // the insure line
  assert.equal(removeLegLine(DOC, 1), false);          // merchant
  assert.equal(removeLegLine(DOC, 0), false);          // title
});
