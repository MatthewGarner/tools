import {test} from 'node:test';
import assert from 'node:assert/strict';
import {parse} from '../parse.js';

const SPEC = [
  'title: Q3 retention',
  'outcome: Improve 90-day retention',
  '  Users forget mid-afternoon habits',
  '    Users don\'t open the app at work',
  '      Smart reminders [testing]',
  '        ? users want to be interrupted [testing]',
  '        ? habit time is detectable [holds]',
  '    Streak freeze [delivering]',
  '  Habits feel like chores',
].join('\n');

test('spec tree parses with inferred kinds', () => {
  const m = parse(SPEC);
  assert.equal(m.title, 'Q3 retention');
  assert.equal(m.outcomes.length, 1);
  const out = m.outcomes[0];
  assert.equal(out.kind, 'outcome');
  assert.equal(out.label, 'Improve 90-day retention');
  const opp = out.children[0];
  assert.equal(opp.kind, 'opportunity');
  const sub = opp.children[0];
  assert.equal(sub.kind, 'opportunity');
  const smart = sub.children[0];
  assert.equal(smart.kind, 'solution');
  assert.equal(smart.status, 'testing');
  assert.equal(smart.children.length, 2);
  assert.equal(smart.children[0].kind, 'assumption');
  assert.equal(smart.children[0].status, 'testing');
  assert.equal(smart.children[1].status, 'holds');
  const freeze = opp.children[1];
  assert.equal(freeze.kind, 'solution');
  assert.equal(freeze.status, 'delivering');
  assert.equal(out.children[1].kind, 'opportunity');
  assert.equal(m.warnings.length, 0);
  assert.equal(smart.srcLine, 4);
});

test('solution-hood requires a status tag; untagged stays opportunity', () => {
  const m = parse('outcome: O\n  Need\n    Nice idea without tag');
  assert.equal(m.outcomes[0].children[0].children[0].kind, 'opportunity');
});

test('assumption without tag defaults to untested', () => {
  const m = parse('outcome: O\n  Need\n    Sol [candidate]\n      ? something we believe');
  assert.equal(m.outcomes[0].children[0].children[0].children[0].status, 'untested');
});

test('? outside a solution kept but warned', () => {
  const m = parse('outcome: O\n  Need\n    ? floating doubt');
  assert.ok(m.warnings.some(w => w.includes('assumption')));
  assert.equal(m.outcomes[0].children[0].children[0].kind, 'assumption');
});

test('solution nested under solution warned', () => {
  const m = parse('outcome: O\n  Need\n    Sol [testing]\n      Sub-sol [candidate]');
  assert.ok(m.warnings.some(w => w.includes('under')));
});

test('unknown status tag ignored and warned', () => {
  const m = parse('outcome: O\n  Need\n    Sol [wip]');
  assert.equal(m.outcomes[0].children[0].children[0].kind, 'opportunity');
  assert.ok(m.warnings.some(w => w.includes('wip')));
});

test('untagged top-level treated as outcome and warned', () => {
  const m = parse('Just a line\n  Need');
  assert.equal(m.outcomes[0].kind, 'outcome');
  assert.equal(m.outcomes[0].label, 'Just a line');
  assert.ok(m.warnings.some(w => w.includes('outcome')));
});

test('multiple outcomes; config keys; comments', () => {
  const m = parse('palette: plum\naccent: #123ABC\n// c\noutcome: A\n  N1\noutcome: B\n  N2');
  assert.equal(m.outcomes.length, 2);
  assert.equal(m.palette, 'plum');
  assert.equal(m.accent, '#123ABC');
});
