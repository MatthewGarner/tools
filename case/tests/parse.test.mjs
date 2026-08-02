import {test} from 'node:test';
import assert from 'node:assert/strict';
import {parse, classifyUrl} from '../parse.js';

const DOC = ['title: Wexcombe augmentation',
  'question: Augment in 2029, or run the fleet down?',
  'status: decided',
  'verdict: We augment — the warranty binds 3 years before the wear does',
  'Money: Augment NPV model -> /fermi/#abc // the £ case',
  'Money: Board options -> https://tools.matthewgarner.me/tree/#def',
  'Delivery: Plan of record -> https://energy.matthewgarner.me/cycles/#xyz',
  'Unlinked thing -> https://example.com/x'].join('\n');

test('config + exhibits parse with lanes, notes and srcLines', () => {
  const m = parse(DOC);
  assert.equal(m.title, 'Wexcombe augmentation');
  assert.equal(m.question, 'Augment in 2029, or run the fleet down?');
  assert.equal(m.status, 'decided');
  assert.match(m.verdict, /^We augment/);
  assert.equal(m.exhibits.length, 4);
  assert.deepEqual(m.lanes, ['Money', 'Delivery']);
  const [a, b, c, d] = m.exhibits;
  assert.deepEqual([a.lane, a.label, a.url, a.note, a.tool, a.live],
    ['Money', 'Augment NPV model', '/fermi/#abc', 'the £ case', 'fermi', true]);
  assert.equal(b.tool, 'tree'); assert.ok(b.live);
  assert.equal(c.tool, 'cycles'); assert.ok(c.live);
  assert.equal(d.live, false, 'foreign origin is a dead exhibit');
  assert.equal(m.warnings.length, 1);
  assert.match(m.warnings[0], /dead exhibit/);
  assert.equal(a.srcLine, 4);
});

test('a URL\'s // never splits; the note needs a whitespace boundary', () => {
  const m = parse('A -> https://tools.matthewgarner.me/map/#x//y');
  assert.equal(m.exhibits[0].url, 'https://tools.matthewgarner.me/map/#x//y');
  assert.equal(m.exhibits[0].note, '');
});

test('exhibit without a link warns and is skipped; label required', () => {
  const m = parse('just some words\nMoney: -> /fermi/#x');
  assert.equal(m.exhibits.length, 0);
  assert.equal(m.warnings.length, 2);
  assert.match(m.warnings[0], /needs a link/);
  assert.match(m.warnings[1], /needs a label/);
});

test('decided without a verdict warns; open does not', () => {
  assert.match(parse('status: decided\nA -> /map/#x').warnings.join(' '), /decided case states its verdict/);
  assert.equal(parse('status: open\nA -> /map/#x').warnings.length, 0);
  assert.match(parse('status: decided\nverdict: off\nA -> /map/#x').warnings.join(' '), /states its verdict/);
});

test('status/palette validated softly; verdict raw preserved', () => {
  const m = parse('status: maybe\npalette: neon');
  assert.equal(m.status, 'open');
  assert.equal(m.warnings.length, 2);
  assert.equal(parse('verdict: off').verdict, 'off');
  assert.equal(parse('').verdict, null);
});

test('classifyUrl: energy names only on the energy origin, and vice versa', () => {
  assert.deepEqual(classifyUrl('/cycles/#x'), {tool: 'cycles', live: false});
  assert.deepEqual(classifyUrl('https://energy.matthewgarner.me/cycles/#x'), {tool: 'cycles', live: true});
  assert.deepEqual(classifyUrl('https://energy.matthewgarner.me/fermi/#x'), {tool: 'fermi', live: false});
  assert.deepEqual(classifyUrl('javascript:alert(1)'), {tool: '', live: false});
  assert.deepEqual(classifyUrl('http://tools.matthewgarner.me/map/#x'), {tool: '', live: false},
    'plain http is not the suite');
});

test('trailing comments strip from config values, boundary-only', () => {
  const m = parse('title: T // working name\nquestion: Ship? // really');
  assert.equal(m.title, 'T');
  assert.equal(m.question, 'Ship?');
});
