import {test} from 'node:test';
import assert from 'node:assert/strict';
import {renderForm, collectValues} from '../render-form.js';
import {parse} from '../parse.js';

const M = parse('names: on\nShip by Q3 :: prob\nWeeks to migrate :: range weeks');
const M_ANON = parse('Ship by Q3 :: prob');

test('form structure: one .q per question, typed and indexed', () => {
  const html = renderForm(M);
  assert.ok(html.includes('data-q="0"') && html.includes('data-type="prob"'));
  assert.ok(html.includes('data-q="1"') && html.includes('data-type="range"'));
  assert.ok(html.includes('data-part="prob"') && html.includes('data-touched="0"'));
  assert.ok(html.includes('data-part="low"') && html.includes('data-part="high"'));
  assert.ok(html.includes('weeks'));
  assert.ok(html.includes('toss-up'));          // verbal anchors
  assert.ok(html.includes('90% range'));        // inline interval explainer
  assert.ok(html.includes('data-name'));        // named session collects a name
});

test('anonymous sessions never render a name field', () => {
  assert.ok(!renderForm(M_ANON).includes('data-name'));
});

test('question text is escaped', () => {
  const m = parse('a <b> & "c" :: prob');
  const html = renderForm(m);
  assert.ok(html.includes('a &lt;b&gt; &amp; &quot;c&quot;'));
  assert.ok(!html.includes('<b>'));
});

test('collectValues: touched prob + full range', () => {
  const r = collectValues(M, [
    {q: 0, part: 'prob', value: '72', touched: true},
    {q: 1, part: 'low', value: '4'}, {q: 1, part: 'high', value: '8'},
  ]);
  assert.deepEqual(r.values, [72, [4, 8]]);
  assert.equal(r.answered, 2);
  assert.deepEqual(r.errors, []);
});

test('collectValues: untouched prob and empty range are null', () => {
  const r = collectValues(M, [
    {q: 0, part: 'prob', value: '50', touched: false},
    {q: 1, part: 'low', value: ''}, {q: 1, part: 'high', value: ''},
  ]);
  assert.deepEqual(r.values, [null, null]);
  assert.equal(r.answered, 0);
});

test('collectValues: half-filled and inverted ranges error, prob clamped', () => {
  const half = collectValues(M, [{q: 1, part: 'low', value: '4'}, {q: 1, part: 'high', value: ''}]);
  assert.equal(half.errors[0].q, 1);
  const inv = collectValues(M, [{q: 1, part: 'low', value: '9'}, {q: 1, part: 'high', value: '4'}]);
  assert.ok(inv.errors[0].msg.includes('low'));
  const clamp = collectValues(M, [{q: 0, part: 'prob', value: '140', touched: true}]);
  assert.equal(clamp.values[0], 100);
});
