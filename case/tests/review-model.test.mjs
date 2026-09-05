import {test} from 'node:test';
import assert from 'node:assert/strict';
import {parse, classifyReference} from '../parse.js';
import {project, inspectReference, inspectReview} from '../review-model.js';
import {setConfig, setBlockField, appendBlock} from '../edit-targets.js';
import {EXAMPLES} from '../examples.js';

const SOURCE = `title: Launch
status: decided
verdict: Learn first
claim cost: The decision margin
  basis: model
  detail: £3.6k before sensitivity
  qualification: Authored inputs
review first: Budget changes
  date: 2026-09-12
  decision: Reopen the pilot
  previous: /tree/#eyJ2IjoxfQ
review second: Planned readout
  date: 2026-11-13
  change: No new evidence yet
Money: Legacy economics -> /fermi/#abc // retained
`;

test('a decided review warns when its actual authorisation scope is absent', () => {
  const model = parse(SOURCE);
  assert.ok(model.warnings.some(warning => warning.includes('authorised scope')));
  const scoped = parse(setConfig(SOURCE, 'decision', 'Approve the pilot only'));
  assert.equal(scoped.decision, 'Approve the pilot only');
  assert.ok(!scoped.warnings.some(warning => warning.includes('authorised scope')));
  assert.equal(scoped.reviews[0].decision, 'Reopen the pilot', 'top-level edits never rewrite a dated decision');
});

test('blocks preserve fields, dates, source positions and legacy material across projection', () => {
  const model = parse(SOURCE);
  assert.equal(model.claims[0].fields.detail, 5);
  assert.deepEqual(model.reviews.map(entry => entry.id), ['first', 'second']);
  assert.equal(model.reviews[0].decision, 'Reopen the pilot');
  assert.equal(model.reviews[1].change, 'No new evidence yet');
  assert.equal(model.exhibits.length, 1);
  const first = project(model), second = project(first);
  assert.equal(first.claims.length, 2);
  assert.deepEqual(second.claims, first.claims, 'composing an inspected model does not duplicate exhibits');
});

test('block boundaries and duplicate ids warn instead of swallowing other source', () => {
  const model = parse('claim a: First\n  detail: one\nclaim a: Duplicate\n  detail: ignored\ntitle: Safe\noption b: Second\n  requires: two\n  invented: nope');
  assert.equal(model.title, 'Safe');
  assert.equal(model.claims.length, 1);
  assert.equal(model.claims[0].detail, 'one');
  assert.equal(model.options[0].requires, 'two');
  assert.ok(model.warnings.some(w => /duplicate claim/.test(w)));
  assert.ok(model.warnings.some(w => /unknown option field/.test(w)));
});

test('safe reference navigation cannot be earned by credentials, relative tricks or executable schemes', () => {
  for(const value of ['javascript:alert(1)', 'data:text/html,x', '//evil.example/tree/', 'https://good.example@evil.example/x', '/tree/../paths/#x', '/tree/?x=y', '/tree/\\evil', 'https://tools.matthewgarner.me.evil/x\n']) assert.equal(classifyReference(value).safe, false, value);
  assert.equal(classifyReference('https://example.org/research?q=a#section').kind, 'external');
  assert.equal(classifyReference('/tree/#abc').capture, 'unverified');
  assert.equal(classifyReference('/tree/').capture, 'missing');
  assert.equal(classifyReference('/tree/#eyJ2IjoxfQ').capture, 'missing');
  const model = parse('claim x: <script>alert(1)</script>\n  basis: observation\n  detail: A & B < C\n  url: javascript:alert(1)');
  assert.equal(model.claims[0].detail, 'A & B < C', 'rendering owns escaping, never lossy source parsing');
  assert.equal(model.claims[0].reference.safe, false);
  assert.ok(model.warnings.some(w => /unsafe or malformed/.test(w)));
});

test('a hash only becomes captured after meaningful state decodes; raw links remain exact', async () => {
  assert.equal((await inspectReference('/tree/#abc', {decode: async () => ({v: 1})})).capture, 'invalid');
  assert.equal((await inspectReference('/tree/#abc', {decode: async () => ({t: ''})})).capture, 'invalid');
  assert.equal((await inspectReference('/tree/#abc', {decode: async () => {throw Error('bad');}})).capture, 'invalid');
  const captured = await inspectReference('/tree/#abc', {decode: async () => ({t: 'Choose\n  Defer : 0'})});
  assert.equal(captured.capture, 'captured');
  assert.equal(captured.exactUrl, '/tree/#abc');
});

test('text edits preserve dated records and can be undone by restoring the prior text', () => {
  const before = SOURCE;
  const after = setBlockField(before, 'claim', 'cost', 'qualification', 'The margin can reverse');
  assert.equal(parse(after).claims[0].qualification, 'The margin can reverse');
  assert.deepEqual(parse(after).reviews, parse(before).reviews);
  assert.equal(parse(before).claims[0].qualification, 'Authored inputs');
  const appended = appendBlock(after, 'review', {id: 'third', label: 'Later review', date: '2026-12-01', decision: 'Keep open'});
  assert.equal(parse(appended).reviews.length, 3);
  assert.equal(parse(after).reviews.length, 2);
  assert.equal(setConfig(before, 'title', 'Injected\nstatus: decided'), before);
  assert.equal(setBlockField(before, 'claim', 'cost', 'detail', 'A // invisible'), before);
});

test('font, theme and date configuration validates without changing legacy semantics', () => {
  const model = parse('font: dm-sans\ntheme: dark\nview: compare\nreview-by: 2026-11-13\ndate: 2026-02-30');
  assert.equal(model.font, 'dm-sans'); assert.equal(model.theme, 'dark'); assert.equal(model.view, 'compare');
  assert.equal(model.reviewBy, '2026-11-13'); assert.equal(model.date, '');
  assert.match(model.warnings[0], /real YYYY-MM-DD/);
});

test('all fictional examples parse and their captured exhibits replay from self-contained state', async () => {
  for(const example of EXAMPLES){
    const model = parse(example.text);
    assert.deepEqual(model.warnings, [], example.id);
    const review = await inspectReview(model);
    for(const claim of review.claims) assert.equal(claim.reference.capture, 'captured', example.id + ': ' + claim.id);
    for(const entry of review.reviews){
      if(entry.url) assert.equal(entry.reference.capture, 'captured', entry.id);
      if(entry.previous) assert.equal(entry.previousReference.capture, 'captured', entry.id + ' previous');
    }
  }
  const lantern = await inspectReview(parse(EXAMPLES.find(x => x.id === 'lantern').text));
  assert.equal(lantern.claims.find(c => c.id === 'projection').planningContext?.role, 'Delivery projection');
});

test('legacy Decision and Owner exhibit lanes survive alongside similarly named config', () => {
  const source = 'title: Legacy\nDecision: Gate -> /paths/#abc // explicit gate\nOwner: Responsibility -> /map/#def';
  const model = parse(source);
  assert.equal(model.exhibits.length, 2);
  assert.deepEqual(model.lanes, ['Decision', 'Owner']);
  assert.equal(model.decision, '');
  const updated = parse(setConfig(source, 'decision', 'Approve evaluation'));
  assert.equal(updated.decision, 'Approve evaluation');
  assert.equal(updated.exhibits.length, 2);
  assert.equal(updated.exhibits[0].note, 'explicit gate');
});

test('editing indented legacy config targets the effective declaration without revealing older duplicates', () => {
  const source = 'title: First\n  title: Last\nreview later: Later\n  decision: Keep';
  assert.equal(parse(setConfig(source, 'title', 'Changed')).title, 'Changed');
  assert.equal(parse(setConfig(source, 'title', '')).title, '');
  assert.equal(parse(setConfig(source, 'decision', 'Approve')).reviews[0].decision, 'Keep');
});

test('an external legacy exhibit remains a dead link while an explicit external claim is live', async () => {
  const model = await inspectReview(parse('Reference -> https://example.org/research\nclaim paper: Explicit external reference\n  basis: observation\n  url: https://example.org/research'));
  assert.equal(model.claims.find(c => c.legacy).reference.safe, false);
  assert.equal(model.claims.find(c => !c.legacy).reference.kind, 'external');
  assert.equal(model.claims.find(c => !c.legacy).reference.safe, true);
});
