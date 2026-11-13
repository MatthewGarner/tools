import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mdEscape} from '../format.js';
import {parse} from '../parse.js';
import {simulate, markdown} from '../engine.js';

/* One escaping rule for every tool (XB-8): a backslash before each of \ | * _ ` [ ] < >, and no HTML entities. */
const VECTOR = 'a|b *c* _d_ <b>e</b> [f] \\ & "g"';
const WANT = 'a\\|b \\*c\\* \\_d\\_ \\<b\\>e\\</b\\> \\[f\\] \\\\ & "g"';

test('mdEscape: the shared vector', () => assert.equal(mdEscape(VECTOR), WANT));
test('mdEscape: a newline is a space, and nothing else is touched', () => assert.equal(mdEscape('a\r\nb ! # ( )'), 'a b ! # ( )'));

test('Markdown copy writes the raw ampersand, never an entity', () => {
  const m = parse('title: R&D <alpha>\nunit: £k\nFish & chips\n  Fish & chips <b>bold</b>: stake 10, odds 40-60%, payoff 20-30\n    kill: stop & go');
  const md = markdown(m, simulate(m), 'https://x/bets/');
  assert.doesNotMatch(md, /&(amp|lt|gt);/);
  assert.ok(md.startsWith('# R&D \\<alpha\\>'), md.split('\n')[0]);
  assert.ok(md.includes('Fish & chips \\<b\\>bold\\</b\\>'));
});
