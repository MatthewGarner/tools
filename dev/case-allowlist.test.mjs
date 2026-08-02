/* /case ships a LITERAL copy of the suite's tool lists (tool-dirs.mjs is
   dev-only, never served) — this pin is what stops the copy drifting when a
   tool ships. */
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {TOOL_DIRS, ENERGY_TOOL_DIRS} from './tool-dirs.mjs';
import {SUITE_TOOLS, ENERGY_TOOLS} from '../case/parse.js';

test('case allowlist matches the canonical tool lists', () => {
  assert.deepEqual([...SUITE_TOOLS].sort(), [...TOOL_DIRS].sort());
  assert.deepEqual([...ENERGY_TOOLS].sort(), [...ENERGY_TOOL_DIRS].sort());
});
