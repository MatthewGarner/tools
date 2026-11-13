import {test} from 'node:test';
import assert from 'node:assert/strict';
import {parse} from '../parse.js';
import {simulate} from '../engine.js';
import {renderBoard} from '../render.js';

/* a very long group heading prints in full, wrapped, and never runs past the ledger */
test('a long group heading wraps inside the board', () => {
  const heading = ('A very long group heading that describes the strategic theme in far more words than anyone should write on one line of a board ').repeat(2).trim();
  const m = parse(heading + '\n  A: stake 10, odds 40-60%, payoff 20-30');
  const colors = {ink: '#111', muted: '#666', accent: '#c05621', accentInk: '#8e4a1e', bg: '#fff', card: '#fff', border: '#ddd', err: '#b33', track: '#eee', status: {}, statusInk: {}};
  const svg = renderBoard(m, simulate(m), {colors, measure: t => t.length * 6, intent: 'native'});
  const lines = [...svg.matchAll(/<text x="40" y="[\d.]+" font-size="10"[^>]*letter-spacing="0.14em"[^>]*>([^<]*)</g)].map(x => x[1]);
  assert.ok(lines.length >= 2, 'wrapped onto several lines');
  assert.equal(lines.join(' '), heading.toUpperCase());
  for(const l of lines) assert.ok(l.length * 6 * 1.16 <= 1160, 'inside the ledger');
});
