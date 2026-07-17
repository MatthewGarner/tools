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

/* ---- chips allocation form ---- */
const {equal: feq, deepEqual: fdeq, ok: fok} = assert;
test('chips question renders a row per option with steppers', () => {
  const html = renderForm(parse('Pick :: chips A | B | C'));
  feq((html.match(/data-part="chip"/g) || []).length, 3);
  feq((html.match(/class="chipstep/g) || []).length, 6);       // − and + per option
  fok(html.includes('chipsleft'));
});

test('collectValues: full allocation collected, blank skipped, bad sum errors', () => {
  const model = parse('Pick :: chips A | B | C');
  const f = (j, v) => ({q: 0, part: 'chip', opt: j, value: String(v), touched: true});
  fdeq(collectValues(model, [f(0, 60), f(1, 25), f(2, 15)]).values[0], [60, 25, 15]);
  feq(collectValues(model, [f(0, ''), f(1, ''), f(2, '')]).values[0], null);
  const bad = collectValues(model, [f(0, 60), f(1, 25), f(2, 5)]);
  feq(bad.values[0], null);
  fok(bad.errors.some(e => e.q === 0 && e.msg.includes('100')));
});

/* ---- editable (compose) authoring chrome ---- */
const kindsOf = html => new Set([...html.matchAll(/data-edit="([^"]+)"/g)].map(m => m[1]));

test('editable form has NO edit chrome unless opts.editable', () => {
  const html = renderForm(parse('Ship :: prob\nWeeks :: range weeks\nPick :: chips A | B | C'));
  assert.equal(kindsOf(html).size, 0);
  assert.ok(!html.includes('data-edit'));
});

test('editable prob/range/chips emit their authoring targets', () => {
  const m = parse('Ship :: prob\nWeeks :: range weeks\nPick :: chips A | B | C');
  const kinds = kindsOf(renderForm(m, {editable: true}));
  for(const k of ['qtext', 'qtype', 'removeq', 'unit', 'opt', 'rmopt', 'addopt', 'addq'])
    assert.ok(kinds.has(k), 'missing ' + k);
});

test('every data-edit target carries data-line (except doc-level addq) and prefilled data-raw', () => {
  const html = renderForm(parse('Weeks :: range weeks'), {editable: true});
  // qtext prefilled with the text, qtype with the type, unit with the unit
  assert.match(html, /data-edit="qtext" data-line="0" data-raw="Weeks"/);
  assert.match(html, /data-edit="qtype" data-line="0" data-raw="range"/);
  assert.match(html, /data-edit="unit" data-line="0" data-raw="weeks"/);
});

test('addq is a menu target with no data-line so the coarse redirect skips it', () => {
  const html = renderForm(parse('Ship :: prob'), {editable: true});
  assert.match(html, /class="addq" data-edit="addq"/);
  assert.ok(!/data-edit="addq" data-line/.test(html));
});

test('rmopt appears only above 2 options; addopt disappears at 8', () => {
  const two = renderForm(parse('Pick :: chips A | B'), {editable: true});
  assert.ok(!two.includes('data-edit="rmopt"'), 'no remove at the 2-floor');
  assert.ok(two.includes('data-edit="addopt"'));
  const three = renderForm(parse('Pick :: chips A | B | C'), {editable: true});
  assert.equal((three.match(/data-edit="rmopt"/g) || []).length, 3);
  const eight = renderForm(parse('Pick :: chips A|B|C|D|E|F|G|H'), {editable: true});
  assert.ok(!eight.includes('data-edit="addopt"'), 'no add at the 8-ceiling');
  assert.equal((eight.match(/data-edit="rmopt"/g) || []).length, 8);
});

test('missing range unit renders a ghost unit pill (empty raw)', () => {
  const html = renderForm(parse('Weeks :: range'), {editable: true});
  assert.match(html, /class="unit unitpill ghost"[^>]*data-edit="unit"[^>]*data-raw=""/);
  assert.ok(html.includes('>unit</span>'));   // placeholder label
});

test('editable targets are spans (role=button), never native buttons', () => {
  const html = renderForm(parse('Pick :: chips A | B | C'), {editable: true});
  for(const m of html.matchAll(/<(\w+)[^>]*data-edit=/g)) assert.equal(m[1], 'span');
});

test('editable question text/options stay escaped', () => {
  const html = renderForm(parse('a <b> "c" :: chips X & Y | B'), {editable: true});
  assert.ok(html.includes('data-raw="a &lt;b&gt; &quot;c&quot;"'));
  assert.ok(html.includes('data-raw="X &amp; Y"'));
  assert.ok(!html.includes('<b>'));
});
