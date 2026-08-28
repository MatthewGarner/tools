import {test} from 'node:test';
import assert from 'node:assert/strict';
import {parse, parseMoney} from '../parse.js';

const BID = [
  'title: Bid for the Acme contract',
  'currency: £',
  '',
  'Bid decision',
  '  Submit bid: -150k',
  '    Outcome',
  '      Win (p=0.3-0.45): 2M to 5M',
  '      Lose (p=rest): 0',
  '  No bid: 0',
].join('\n');

test('spec bid tree parses exactly', () => {
  const m = parse(BID);
  assert.equal(m.title, 'Bid for the Acme contract');
  assert.equal(m.currency, '£');
  const root = m.root;
  assert.equal(root.label, 'Bid decision');
  assert.equal(root.kind, 'decision');
  assert.equal(root.children.length, 2);
  const [bid, noBid] = root.children;
  assert.deepEqual(bid.value, {lo: -150000, hi: -150000});
  assert.equal(bid.kind, 'decision');   // one child (Outcome) without p ⇒ decision (degenerate, fine)
  const outcome = bid.children[0];
  assert.equal(outcome.kind, 'chance');
  const [win, lose] = outcome.children;
  assert.deepEqual(win.p, {lo: 0.3, hi: 0.45});
  assert.deepEqual(win.value, {lo: 2e6, hi: 5e6});
  assert.equal(win.kind, 'leaf');
  assert.equal(lose.p, 'rest');
  assert.equal(noBid.kind, 'leaf');
  assert.deepEqual(noBid.value, {lo: 0, hi: 0});
  assert.equal(m.warnings.length, 0);
  assert.equal(win.srcLine, 6);
});

test('parseMoney: points, ranges, to-ranges, suffixes, currency strip', () => {
  assert.deepEqual(parseMoney('4523'), {lo: 4523, hi: 4523});
  assert.deepEqual(parseMoney('-150k'), {lo: -150000, hi: -150000});
  assert.deepEqual(parseMoney('2M-5M'), {lo: 2e6, hi: 5e6});
  assert.deepEqual(parseMoney('2M to 5M'), {lo: 2e6, hi: 5e6});
  assert.deepEqual(parseMoney('-1M to -0.5M'), {lo: -1e6, hi: -5e5});
  assert.deepEqual(parseMoney('£2.5k'), {lo: 2500, hi: 2500});
  assert.deepEqual(parseMoney('$3B'), {lo: 3e9, hi: 3e9});
  assert.equal(parseMoney('not a number'), null);
  assert.equal(parseMoney('1M-'), null);
});

test('probability ranges and points', () => {
  const m = parse('Root\n  A\n    X (p=0.6): 10\n    Y (p=0.2-0.3): 20\n    Z (p=rest): 0\n  B: 5');
  const chance = m.root.children[0];
  assert.equal(chance.kind, 'chance');
  assert.deepEqual(chance.children[0].p, {lo: 0.6, hi: 0.6});
  assert.deepEqual(chance.children[1].p, {lo: 0.2, hi: 0.3});
  assert.equal(chance.children[2].p, 'rest');
});

test('missing p among probabilistic siblings is explicit p=0, never inferred as rest', () => {
  const m1 = parse('Root\n  A\n    X (p=0.5): 10\n    Y: 20\n    Z (p=rest): 0');
  assert.ok(m1.warnings.some(w => w.includes('Y')));
  const m2 = parse('Root\n  A\n    X (p=0.7): 10\n    Y: 20\n  B: 1');
  const y = m2.root.children[0].children[1];
  assert.deepEqual(y.p, {lo: 0, hi: 0});
  assert.ok(m2.warnings.some(w => w.includes('Y') && w.includes('no p=') && w.includes('p=0')));
});

test('unreadable authored probability remains distinct from a missing probability fallback', () => {
  const model = parse('Root\n  A\n    Known (p=0.5): 10\n    Invalid (p=maybe): 20\n    Missing: 30\n  B: 1');
  const [, invalid, missing] = model.root.children[0].children;
  assert.equal(invalid.pRaw, 'maybe');
  assert.equal(invalid.pParseValid, false);
  assert.deepEqual(invalid.p, {lo:0, hi:0});
  assert.equal(missing.pRaw, null);
  assert.equal(missing.pParseValid, null);
  assert.deepEqual(missing.p, {lo:0, hi:0});
  assert.ok(model.warnings.some(warning => /unreadable probability "maybe"/.test(warning)));
  assert.ok(model.warnings.some(warning => warning.includes('Missing') && warning.includes('given p=0')));
  assert.ok(!model.warnings.some(warning => warning.includes('Invalid') && warning.includes('has no p=')));
});

test('only the first authored p=rest survives; duplicates fail safely to p=0 with their own warning', () => {
  const m = parse('Root\n  A\n    X (p=0.4): 10\n    Other (p=rest): 2\n    Duplicate (p=rest): 999\n  B: 1');
  const chance = m.root.children[0];
  assert.equal(chance.children[1].p, 'rest');
  assert.deepEqual(chance.children[2].p, {lo: 0, hi: 0});
  assert.equal(chance.children[2].pRaw, '0', 'editor/display raw matches the effective rejected probability');
  assert.ok(m.warnings.some(w => w.includes('line 5') && w.includes('second p=rest') && w.includes('p=0')));
});

test('leaf without value warned and treated as 0', () => {
  const m = parse('Root\n  A\n  B: 5');
  assert.deepEqual(m.root.children[0].value, {lo: 0, hi: 0});
  assert.ok(m.warnings.some(w => w.toLowerCase().includes('value')));
});

test('multiple top-level nodes wrap in an implicit decision root', () => {
  const m = parse('Option A: 10\nOption B: 20');
  assert.equal(m.root.kind, 'decision');
  assert.equal(m.root.children.length, 2);
  assert.equal(m.root.label, 'Decision');
});

test('labels containing colons keep their text when tail is not a number', () => {
  const m = parse('Root\n  Plan B: the sequel\n  C: 5');
  assert.equal(m.root.children[0].label, 'Plan B: the sequel');
  assert.deepEqual(m.root.children[0].value, {lo: 0, hi: 0});   // valueless leaf → 0, warned
  assert.ok(m.warnings.some(w => w.includes('Plan B')));
});

test('odd indentation warns but still nests', () => {
  const m = parse('Root\n   Odd child: 5');   // 3 spaces
  assert.ok(m.warnings.some(w => w.includes('indent')));
  assert.equal(m.root.children.length, 1);
});

test('config: palette validated, accent hex, comments ignored', () => {
  const m = parse('palette: ember\naccent: #123ABC\n// note\nRoot\n  A: 1\n  B: 2');
  assert.equal(m.palette, 'ember');
  assert.equal(m.accent, '#123ABC');
  const bad = parse('palette: neon\nRoot\n  A: 1\n  B: 2');
  assert.equal(bad.palette, 'ocean');
  assert.ok(bad.warnings.some(w => w.includes('neon')));
});

/* ---------- `verdict:` (2026-07-31) ----------
   The parser's whole job is to hand the RAW value on: what "off" means, and the
   difference between an absent key and a cleared one, lives once in
   assets/verdict.js (resolveVerdict) so seven parsers cannot drift on it. */
test('verdict: is stored raw, and an absent key stays null', () => {
  assert.equal(parse(`Decision
  Go: 100
  Stop: 0`).verdict, null);
  assert.equal(parse(`verdict: We ship in March
Decision
  Go: 100
  Stop: 0`).verdict, 'We ship in March');
});

test('verdict: off is stored verbatim — suppression is the resolver\'s call, not the parser\'s', () => {
  assert.equal(parse(`verdict: off
Decision
  Go: 100
  Stop: 0`).verdict, 'off');
  assert.equal(parse(`verdict: OFF
Decision
  Go: 100
  Stop: 0`).verdict, 'OFF');
});

test('verdict: an emptied value is NOT the same as an absent key', () => {
  assert.equal(parse(`verdict:
Decision
  Go: 100
  Stop: 0`).verdict, '');
});

test('verdict: a line merely STARTING with off is authored text, not suppression', () => {
  assert.equal(parse(`verdict: Off the back of Q3 we hold the date
Decision
  Go: 100
  Stop: 0`).verdict,
    'Off the back of Q3 we hold the date');
});
