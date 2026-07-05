import {test} from 'node:test';
import assert from 'node:assert/strict';
import {parse, MAX_QUESTIONS} from '../parse.js';

const SPEC = [
  'title: Q3 commitment review',
  'names: off',
  '',
  'We ship the referral loop by end of Q3 :: prob',
  'Weeks to migrate billing :: range weeks',
  'Active teams at end of quarter :: range teams',
  '// comments allowed; blank lines ignored',
].join('\n');

test('spec doc parses', () => {
  const m = parse(SPEC);
  assert.equal(m.title, 'Q3 commitment review');
  assert.equal(m.names, false);
  assert.equal(m.questions.length, 3);
  assert.deepEqual(m.questions[0], {text: 'We ship the referral loop by end of Q3', type: 'prob', unit: null, srcLine: 3});
  assert.deepEqual(m.questions[1], {text: 'Weeks to migrate billing', type: 'range', unit: 'weeks', srcLine: 4});
  assert.equal(m.warnings.length, 0);
});

test('names on', () => {
  assert.equal(parse('names: on\nQ :: prob').names, true);
});

test('bad names value warned, default kept', () => {
  const m = parse('names: maybe\nQ :: prob');
  assert.equal(m.names, false);
  assert.ok(m.warnings.some(w => w.startsWith('line 1:')));
});

test('palette and accent as per series', () => {
  const m = parse('palette: ember\naccent: #C05621\nQ :: prob');
  assert.equal(m.palette, 'ember');
  assert.equal(m.accent, '#C05621');
  assert.ok(parse('palette: nope\nQ :: prob').warnings.length === 1);
  assert.ok(parse('accent: red\nQ :: prob').warnings.length === 1);
});

test('config after first question is warned and ignored', () => {
  const m = parse('Q :: prob\ntitle: late');
  assert.equal(m.title, '');
  assert.ok(m.warnings.some(w => w.includes('config')));
});

test('line without :: is skipped with a warning', () => {
  const m = parse('just some words');
  assert.equal(m.questions.length, 0);
  assert.ok(m.warnings[0].startsWith('line 1:'));
});

test('unknown type warned and skipped', () => {
  const m = parse('Q :: percentile');
  assert.equal(m.questions.length, 0);
  assert.ok(m.warnings[0].includes('percentile'));
});

test('range without unit warns but keeps the question', () => {
  const m = parse('Q :: range');
  assert.equal(m.questions.length, 1);
  assert.equal(m.questions[0].unit, null);
  assert.equal(m.warnings.length, 1);
});

test('missing question text warned', () => {
  const m = parse(':: prob');
  assert.equal(m.questions.length, 0);
  assert.ok(m.warnings[0].includes('text'));
});

test('cap at 20 questions with warning', () => {
  const doc = Array.from({length: 22}, (_, i) => 'Q' + i + ' :: prob').join('\n');
  const m = parse(doc);
  assert.equal(m.questions.length, MAX_QUESTIONS);
  assert.equal(m.warnings.length, 2);
});

test('type is case-insensitive, :: may have any spacing', () => {
  const m = parse('Q::PROB\nR  ::  Range Weeks');
  assert.equal(m.questions[0].type, 'prob');
  assert.equal(m.questions[1].unit, 'Weeks');
});
