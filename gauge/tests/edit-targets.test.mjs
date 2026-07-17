import {test} from 'node:test';
import assert from 'node:assert/strict';
import {
  addQuestionLine, removeQuestionLine,
  renameQuestion, setType, setUnit, renameOption, addOption, removeOption,
} from '../edit-targets.js';
import {parse} from '../parse.js';

const doc = `title: Q3 commitment review
names: off

We ship the referral loop :: prob
Weeks to migrate billing :: range weeks`;

test('addQuestionLine appends after the last question', () => {
  const {afterLine, newLine} = addQuestionLine(doc);
  assert.equal(afterLine, 4);
  assert.equal(newLine, 'New question :: prob');
});

test('addQuestionLine with no questions inserts after the config block', () => {
  assert.equal(addQuestionLine('title: T\nnames: off').afterLine, 1);
});

test('addQuestionLine on an empty doc appends at the end', () => {
  assert.equal(addQuestionLine('').afterLine, 0);
});

test('addQuestionLine takes a type: range/chips get sensible starter tails', () => {
  assert.equal(addQuestionLine(doc, 'range').newLine, 'New question :: range units');
  assert.equal(addQuestionLine(doc, 'chips').newLine, 'New question :: chips Option A | Option B');
  assert.equal(addQuestionLine(doc, 'prob').newLine, 'New question :: prob');
  // each template round-trips to the intended type
  assert.equal(parse(addQuestionLine(doc, 'range').newLine).questions[0].type, 'range');
  assert.equal(parse(addQuestionLine(doc, 'chips').newLine).questions[0].type, 'chips');
});

test('removeQuestionLine accepts only question lines', () => {
  assert.equal(removeQuestionLine(doc, 3), true);
  assert.equal(removeQuestionLine(doc, 0), false);   // title
  assert.equal(removeQuestionLine(doc, 2), false);   // blank
});

/* ---- renameQuestion: rewrite the text before :: , keep the kind tail ---- */
test('renameQuestion replaces the text and preserves the kind tail', () => {
  assert.equal(renameQuestion('We ship the referral loop :: prob', 'Ship v2'),
    'Ship v2 :: prob');
  assert.equal(renameQuestion('Weeks to migrate billing :: range weeks', 'Weeks left'),
    'Weeks left :: range weeks');
  assert.equal(renameQuestion('Pick :: chips A | B | C', 'Pick the bet'),
    'Pick the bet :: chips A | B | C');
});

test('renameQuestion preserves leading indent', () => {
  assert.equal(renameQuestion('  Old :: prob', 'New'), '  New :: prob');
});

test('renameQuestion rejects text that would break the line', () => {
  assert.equal(renameQuestion('Old :: prob', ''), null);            // empty
  assert.equal(renameQuestion('Old :: prob', '   '), null);        // blank
  assert.equal(renameQuestion('Old :: prob', 'a :: b'), null);     // stray ::
  assert.equal(renameQuestion('Old :: prob', '// hi'), null);      // comment line
  assert.equal(renameQuestion('Old :: prob', 'title: x'), null);   // config-line trap
  assert.equal(renameQuestion('Old :: prob', 'names: on'), null);
});

test('renameQuestion returns null on a non-question line', () => {
  assert.equal(renameQuestion('title: T', 'x'), null);
});

/* ---- setType: convert prob <-> range <-> chips with sane defaults ---- */
test('setType is a no-op (null) when the type is unchanged', () => {
  assert.equal(setType('Q :: prob', 'prob'), null);
  assert.equal(setType('Q :: range weeks', 'range'), null);
  assert.equal(setType('Q :: chips A | B', 'chips'), null);
});

test('setType to prob strips unit/options', () => {
  assert.equal(setType('Q :: range weeks', 'prob'), 'Q :: prob');
  assert.equal(setType('Q :: chips A | B | C', 'prob'), 'Q :: prob');
});

test('setType to range supplies a placeholder unit', () => {
  assert.equal(setType('Q :: prob', 'range'), 'Q :: range units');
  assert.equal(setType('Q :: chips A | B', 'range'), 'Q :: range units');
});

test('setType to chips supplies two option defaults', () => {
  assert.equal(setType('Q :: prob', 'chips'), 'Q :: chips Option A | Option B');
  assert.equal(setType('Q :: range weeks', 'chips'), 'Q :: chips Option A | Option B');
});

test('setType preserves the question text and indent', () => {
  assert.equal(setType('  Weeks to ship :: prob', 'range'), '  Weeks to ship :: range units');
  assert.equal(setType('a <b> "c" :: prob', 'chips'), 'a <b> "c" :: chips Option A | Option B');
});

test('setType round-trips through the parser to the requested type', () => {
  assert.equal(parse(setType('Q :: prob', 'range')).questions[0].type, 'range');
  assert.equal(parse(setType('Q :: prob', 'chips')).questions[0].type, 'chips');
  assert.equal(parse(setType('Q :: chips A | B', 'prob')).questions[0].type, 'prob');
});

test('setType returns null on a non-question line', () => {
  assert.equal(setType('title: T', 'range'), null);
});

/* ---- setUnit: range lines only ---- */
test('setUnit replaces the unit on a range line', () => {
  assert.equal(setUnit('Q :: range weeks', 'months'), 'Q :: range months');
  assert.equal(setUnit('Q :: range', 'teams'), 'Q :: range teams');   // was unit-less
});

test('setUnit preserves text and indent', () => {
  assert.equal(setUnit('  Weeks left :: range weeks', 'days'), '  Weeks left :: range days');
});

test('setUnit rejects empty/broken units and non-range lines', () => {
  assert.equal(setUnit('Q :: range weeks', ''), null);
  assert.equal(setUnit('Q :: range weeks', '  '), null);
  assert.equal(setUnit('Q :: prob', 'weeks'), null);       // not a range
  assert.equal(setUnit('Q :: chips A | B', 'weeks'), null);
});

/* ---- chip options: rename / add / remove within the 2..8 bound ---- */
test('renameOption rewrites one option by index', () => {
  assert.equal(renameOption('Q :: chips A | B | C', 0, 'Alpha'), 'Q :: chips Alpha | B | C');
  assert.equal(renameOption('Q :: chips A | B | C', 2, 'Gamma'), 'Q :: chips A | B | Gamma');
});

test('renameOption preserves indent and other options', () => {
  assert.equal(renameOption('  Pick :: chips A | B', 1, 'Beta'), '  Pick :: chips A | Beta');
});

test('renameOption rejects empty/pipe labels and out-of-range/non-chips', () => {
  assert.equal(renameOption('Q :: chips A | B', 0, ''), null);
  assert.equal(renameOption('Q :: chips A | B', 0, 'x | y'), null);   // stray pipe
  assert.equal(renameOption('Q :: chips A | B', 5, 'x'), null);       // no such option
  assert.equal(renameOption('Q :: prob', 0, 'x'), null);             // not chips
});

test('addOption appends a fresh option label', () => {
  assert.equal(addOption('Q :: chips A | B'), 'Q :: chips A | B | Option C');
  assert.equal(addOption('Q :: chips A | B | C'), 'Q :: chips A | B | C | Option D');
});

test('addOption preserves indent', () => {
  assert.equal(addOption('  Q :: chips A | B'), '  Q :: chips A | B | Option C');
});

test('addOption refuses to exceed 8 options', () => {
  const eight = 'Q :: chips A | B | C | D | E | F | G | H';
  assert.equal(addOption(eight), null);
});

test('addOption returns null on a non-chips line', () => {
  assert.equal(addOption('Q :: prob'), null);
});

test('removeOption drops one option by index', () => {
  assert.equal(removeOption('Q :: chips A | B | C', 1), 'Q :: chips A | C');
  assert.equal(removeOption('Q :: chips A | B | C', 2), 'Q :: chips A | B');
});

test('removeOption refuses to drop below 2 options', () => {
  assert.equal(removeOption('Q :: chips A | B', 0), null);
});

test('removeOption rejects out-of-range and non-chips lines', () => {
  assert.equal(removeOption('Q :: chips A | B | C', 9), null);
  assert.equal(removeOption('Q :: prob', 0), null);
});
