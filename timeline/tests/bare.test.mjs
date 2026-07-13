import {test} from 'node:test';
import assert from 'node:assert/strict';
import {parse} from '../parse.js';
import {render} from '../render.js';

const ctx = {colors: {card: '#fff', border: '#ddd', ink: '#222', muted: '#667', accent: '#08c', bg: '#f7f8f6', err: '#b33',
  status: {done: '#1D7A3E', doing: '#0C7FAE', risk: '#9A6A00', blocked: '#B3403A'}}, measure: t => t.length * 7, today: 20640};
const doc = 'title: My Programme\ntoday: 2026-07-06\nGrid: Offer 2026-08 .. 2026-10\nGrid: Energisation 2027-02 .. 2027-06 [risk]';

test('bare mode drops the title, top date and readout', () => {
  const full = render(parse(doc), ctx);
  const bare = render(parse(doc), {...ctx, bare: true});
  assert.ok(full.includes('>My Programme</text>'), 'full keeps title');
  assert.ok(!bare.includes('>My Programme</text>'), 'bare drops title');
  assert.ok(!bare.includes('Next up'), 'bare drops the readout line');
});
