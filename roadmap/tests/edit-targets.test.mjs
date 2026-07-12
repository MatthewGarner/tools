import {test} from 'node:test';
import assert from 'node:assert/strict';
import {applies, validators, addItemLine, removeItemLine, moveHorizon} from '../edit-targets.js';
import {parse} from '../parse.js';

test('title rewrite keeps lane, status, note, link', () => {
  assert.equal(applies.title('Core: Streak freeze [doing] -- top request -> https://x', 'Streak freeze', 'Streak shield'),
               'Core: Streak shield [doing] -- top request -> https://x');
});
test('note rewrite touches only the note', () => {
  assert.equal(applies.note('Core: Freeze [doing] -- top request', 'top request', 'most-wanted fix'),
               'Core: Freeze [doing] -- most-wanted fix');
});
test('status swap', () => {
  assert.equal(applies.status('Core: Freeze [doing]', 'doing', 'risk'), 'Core: Freeze [risk]');
});
test('validators reject structure-breakers', () => {
  assert.ok(validators.title('Nice title') && !validators.title('a -- b') && !validators.title('[x]'));
  assert.ok(validators.note('fine') && !validators.note('a -- b'));
});

const DOC = `title: Habitat — Product Roadmap
horizons: Now, Next, Later

NOW
Core: Streak freeze [doing] -- the fix
Growth: Referral flow [risk]

NEXT
Core: Smart reminders
Platform: Full offline mode

LATER
Growth: Coach marketplace`;

test('addItemLine lands at the end of the horizon section, lane-prefixed', () => {
  const {afterLine} = addItemLine(DOC, 'Growth', 'NEXT');
  assert.equal(afterLine, 9);           // after "Platform: Full offline mode"
});

test('addItemLine into an empty horizon inserts after its header', () => {
  const doc = 'NOW\n\nNEXT\nCore: Later thing';
  const {afterLine} = addItemLine(doc, 'Core', 'NOW');
  assert.equal(afterLine, 0);
});

test('removeItemLine accepts only item lines', () => {
  assert.equal(removeItemLine(DOC, 5), true);    // Growth: Referral flow
  assert.equal(removeItemLine(DOC, 3), false);   // NOW header
  assert.equal(removeItemLine(DOC, 0), false);   // title
});

/* moveHorizon — the card-menu "Move to…" row (phone replacement for drag) */
test('moveHorizon: round-trips through the parser under the target horizon', () => {
  const text = moveHorizon(DOC, 4, 'Next');   // srcLine 4 = "Core: Streak freeze [doing] -- the fix"
  assert.ok(text);
  const m = parse(text);
  const moved = m.items.find(i => i.title === 'Streak freeze');
  assert.equal(m.horizons[moved.h], 'Next');
  assert.equal(moved.lane, 'Core');
  assert.equal(moved.status, 'doing');
  assert.equal(moved.note, 'the fix');
});

test('moveHorizon: is case-insensitive on the target horizon name', () => {
  const text = moveHorizon(DOC, 4, 'later');
  assert.ok(text);
  const m = parse(text);
  const moved = m.items.find(i => i.title === 'Streak freeze');
  assert.equal(m.horizons[moved.h], 'Later');
});

test('moveHorizon: no-op when the target IS the item\'s current horizon', () => {
  assert.equal(moveHorizon(DOC, 4, 'Now'), null);
});

test('moveHorizon: null for an unknown horizon or a non-item line', () => {
  assert.equal(moveHorizon(DOC, 4, 'Someday'), null);
  assert.equal(moveHorizon(DOC, 3, 'Next'), null);   // line 3 is the NOW header, not an item
});

test('moveHorizon: lands right after the header when the lane is new to that horizon', () => {
  const text = moveHorizon(DOC, 5, 'Next');   // "Growth: Referral flow [risk]" — NEXT has no Growth lane
  assert.ok(text);
  const lines = text.split('\n');
  const nextIdx = lines.indexOf('NEXT');
  assert.equal(lines[nextIdx + 1].trim(), 'Growth: Referral flow [risk]');
});
