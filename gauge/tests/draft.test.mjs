import test from 'node:test';
import assert from 'node:assert/strict';
import {schemaFingerprint, draftKey, encodeDraft, decodeDraft} from '../draft.js';

const MODEL = {names: true, questions: [
  {text: 'Ship?', type: 'prob', unit: null},
  {text: 'How long?', type: 'range', unit: 'weeks'},
  {text: 'Pick', type: 'chips', options: ['A', 'B']},
]};

test('draft identity isolates session, round, and the complete schema', () => {
  const fp = schemaFingerprint(MODEL);
  assert.equal(fp, schemaFingerprint(structuredClone(MODEL)));
  assert.notEqual(fp, schemaFingerprint({...MODEL, names: false}));
  assert.notEqual(fp, schemaFingerprint({...MODEL, questions: MODEL.questions.map((q, i) =>
    i === 0 ? {...q, text: 'Launch?'} : q)}));
  assert.notEqual(fp, schemaFingerprint({...MODEL, questions: MODEL.questions.map((q, i) =>
    i === 1 ? {...q, unit: 'days'} : q)}));
  assert.notEqual(fp, schemaFingerprint({...MODEL, questions: MODEL.questions.map((q, i) =>
    i === 2 ? {...q, options: ['A', 'C']} : q)}));
  assert.notEqual(draftKey('a', 1, fp), draftKey('a', 2, fp));
  assert.notEqual(draftKey('a', 1, fp), draftKey('b', 1, fp));
});

test('draft round-trip preserves raw values, name, and touched state', () => {
  const fingerprint = schemaFingerprint(MODEL);
  const fields = [
    {q: 0, part: 'prob', value: '73', touched: true},
    {q: 1, part: 'low', value: '4', touched: false},
    {q: 1, part: 'high', value: '', touched: false},
    {q: 2, part: 'chip', opt: 0, value: '65', touched: false},
    {q: 2, part: 'chip', opt: 1, value: '35', touched: false},
  ];
  const raw = encodeDraft({round: 2, fingerprint, fields, name: ' Ada '});
  assert.deepEqual(decodeDraft(raw, 2, fingerprint), {fields, name: ' Ada '});
});

test('draft decode rejects stale schema, wrong round, malformed and legacy data', () => {
  const fingerprint = schemaFingerprint(MODEL);
  const raw = encodeDraft({round: 1, fingerprint, fields: [], name: ''});
  assert.equal(decodeDraft(raw, 2, fingerprint), null);
  assert.equal(decodeDraft(raw, 1, 'other'), null);
  assert.equal(decodeDraft('{oops', 1, fingerprint), null);
  assert.equal(decodeDraft(JSON.stringify({version: 0, round: 1, fingerprint, fields: []}), 1, fingerprint), null);
});
