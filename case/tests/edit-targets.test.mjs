import {test} from 'node:test';
import assert from 'node:assert/strict';
import {validators, editLabel, editNote, setQuestion} from '../edit-targets.js';

test('label rewrite replaces only the label segment', () => {
  assert.equal(editLabel('Money: NPV model -> /fermi/#x // note', 'NPV model', 'The £ case'),
    'Money: The £ case -> /fermi/#x // note');
  assert.ok(!validators.label('a -> b') && !validators.label('title: x') && validators.label('Board options'));
});

test('note rewrite replaces, appends, or strips', () => {
  assert.equal(editNote('A -> /map/#x // old', 'old', 'new words'), 'A -> /map/#x // new words');
  assert.equal(editNote('A -> /map/#x', '', 'fresh'), 'A -> /map/#x // fresh');
  assert.equal(editNote('A -> /map/#x // old', 'old', ''), 'A -> /map/#x');
});

test('setQuestion rewrites, inserts after title, or removes', () => {
  assert.equal(setQuestion('title: T\nquestion: Old?\nA -> /map/#x', 'New?'),
    'title: T\nquestion: New?\nA -> /map/#x');
  assert.equal(setQuestion('title: T\nA -> /map/#x', 'Asked?'),
    'title: T\nquestion: Asked?\nA -> /map/#x');
  assert.equal(setQuestion('title: T\nquestion: Old?\nA -> /map/#x', ''),
    'title: T\nA -> /map/#x');
});
