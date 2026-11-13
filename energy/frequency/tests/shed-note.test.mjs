/* FREQ-Q1: the shed-load simplification is stated in the assumptions. */
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {simulate} from '../engine.js';
import {assumptionLines, toMarkdown} from '../render.js';

const NOTE = 'Load that is shed stays off for the 30 seconds shown, and damping uses demand as it was before shedding.';
const p = {trip: 1.8, eSync: 90, load: 30, dcMw: 1, battMW: 1, eGfm: 15};

test('FREQ-Q1: the assumptions carry the shed-load line, in the receipt and the Markdown', () => {
  assert.ok(assumptionLines(p).includes(NOTE), assumptionLines(p).join(' | '));
  assert.ok(toMarkdown(simulate(p), p).includes(NOTE));
});
