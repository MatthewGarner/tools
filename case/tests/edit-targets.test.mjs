import {test} from 'node:test';
import assert from 'node:assert/strict';
import {addExhibitLine, validators, editLabel, editNote, setQuestion, setStatus, setTitle, setVerdict} from '../edit-targets.js';

test('label rewrite replaces only the label segment', () => {
  assert.equal(editLabel('Money: NPV model -> /fermi/#x // note', 'NPV model', 'The £ case'),
    'Money: The £ case -> /fermi/#x // note');
  assert.ok(!validators.label('a -> b') && !validators.label('title: x') && validators.label('Board options'));
  assert.equal(validators.label('One\rtwo'), false);
  assert.equal(editLabel('same: same -> /map/#x', 'same', 'changed'), 'same: changed -> /map/#x');
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

test('setStatus rewrites or inserts the parser default as a real config line', () => {
  assert.equal(setStatus('title: T\nstatus: open\nA -> /map/#x', 'parked'),
    'title: T\nstatus: parked\nA -> /map/#x');
  assert.equal(setStatus('title: T\nquestion: Decide?\nA -> /map/#x', 'decided'),
    'title: T\nquestion: Decide?\nstatus: decided\nA -> /map/#x');
  assert.equal(setStatus('title: T\nA -> /map/#x', 'unknown'),
    'title: T\nA -> /map/#x');
});

test('native-facing config rewrites preserve CRLF and never accept structural line breaks', () => {
  const crlf = 'title: T\r\nquestion: Old?\r\nA -> /map/#x';
  assert.equal(setQuestion(crlf, 'New?'), 'title: T\r\nquestion: New?\r\nA -> /map/#x');
  assert.equal(setTitle(crlf, 'Renamed'), 'title: Renamed\r\nquestion: Old?\r\nA -> /map/#x');
  assert.equal(setVerdict(crlf, 'We decide'), 'title: T\r\nquestion: Old?\r\nverdict: We decide\r\nA -> /map/#x');
  assert.equal(validators.note('safe\r\nno'), false);
  assert.equal(validators.verdict('safe\nno'), false);
  assert.equal(validators.title('Approve // later'), false);
  assert.equal(validators.question('Ship? // subject to review'), false);
});

test('native config rewrites target the parser-effective duplicate and clearing removes hidden duplicates', () => {
  assert.equal(setTitle('title: First\ntitle: Second\nA -> /map/#x', 'Final'),
    'title: First\ntitle: Final\nA -> /map/#x');
  assert.equal(setQuestion('question: First?\nquestion: Second?\nA -> /map/#x', ''),
    'A -> /map/#x');
});

test('addExhibitLine appends a canonical source-owned exhibit after content', () => {
  assert.deepEqual(addExhibitLine('title: T\n\nA -> /map/#x\n'), {afterLine: 2, newLine: 'New exhibit -> /fermi/'});
  assert.deepEqual(addExhibitLine(''), {afterLine: -1, newLine: 'New exhibit -> /fermi/'});
});
