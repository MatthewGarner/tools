import {test} from 'node:test';
import assert from 'node:assert/strict';
import {addQuestionLine, removeQuestionLine} from '../edit-targets.js';

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

test('removeQuestionLine accepts only question lines', () => {
  assert.equal(removeQuestionLine(doc, 3), true);
  assert.equal(removeQuestionLine(doc, 0), false);   // title
  assert.equal(removeQuestionLine(doc, 2), false);   // blank
});
