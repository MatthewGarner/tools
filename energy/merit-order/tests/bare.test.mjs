import {test} from 'node:test';
import assert from 'node:assert/strict';
import {renderStack, MERIT_PALETTE} from '../render.js';
import {buildStack} from '../stack.js';
import {DEFAULT_PARAMS} from '../scenarios.js';

const ctx = {colors: {card: '#fff', border: '#ddd', ink: '#222', muted: '#667', accent: '#C05621', bg: '#f7f8f6', err: '#b33'},
  measure: t => t.length * 7, palette: MERIT_PALETTE.light};
const state = {generators: buildStack(DEFAULT_PARAMS), demand: DEFAULT_PARAMS.demand};

test('bare mode drops the export verdict block', () => {
  const full = renderStack(state, ctx, {forExport: true, labelCollide: 'drop'});
  const bare = renderStack(state, ctx, {forExport: true, labelCollide: 'drop', bare: true});
  assert.ok(full.length > bare.length, 'bare is shorter (no verdict block)');
  const h = s => +s.match(/height="(\d+)"/)[1];
  assert.ok(h(bare) < h(full), 'bare is shorter in height (no verdict block reserved)');
});
