/* The shell manifest must describe exactly the pages the suite ships, under the
   names the catalogue gives them. The manifest is the source the stamped header
   and the first-screen gate will both read, so a missing page would silently
   escape the gate and a drifted name would reintroduce the Bets / "Bet
   portfolio" disagreement the shell exists to remove. */
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {TOOL_DIRS, ENERGY_TOOL_DIRS} from './tool-dirs.mjs';
import {SUITE_CATALOG} from '../assets/suite-catalog.js';
import {SHELL_MANIFEST, HEADER_BUDGET, ANCHOR_BUDGET, HEADER_CONTROLS_MAX} from './shell-manifest.mjs';

const dirs = [...TOOL_DIRS, ...ENERGY_TOOL_DIRS];

test('the manifest has exactly one entry per Product and Energy page', () => {
  assert.deepEqual(Object.keys(SHELL_MANIFEST).sort(), [...dirs].sort(),
    'dev/shell-manifest.mjs and dev/tool-dirs.mjs disagree about which pages exist');
  assert.equal(new Set(dirs).size, dirs.length, 'tool-dirs lists a page twice');
});

test('every name equals the catalogue title for that page', () => {
  for(const dir of dirs){
    const source = TOOL_DIRS.includes(dir) ? 'product' : 'energy';
    const entry = SUITE_CATALOG.find(tool => tool.source === source && tool.route === dir);
    assert.ok(entry, dir + ': no catalogue entry');
    assert.equal(SHELL_MANIFEST[dir].name, entry.title,
      dir + ': manifest name must equal the catalogue title');
  }
});

test('every anchor is a non-empty selector and every flag is a boolean', () => {
  for(const [dir, entry] of Object.entries(SHELL_MANIFEST)){
    assert.equal(typeof entry.anchor, 'string', dir + ': anchor is not a string');
    assert.ok(entry.anchor.length > 0 && entry.anchor === entry.anchor.trim(), dir + ': anchor is empty or padded');
    for(const flag of ['new', 'examples', 'templates', 'share', 'anchorBudget', 'shell'])
      assert.equal(typeof entry[flag], 'boolean', dir + ': ' + flag + ' must be a boolean');
  }
});

test('the budgets are the spec section 2 numbers', () => {
  assert.deepEqual({...HEADER_BUDGET}, {phone: 215, laptop: 180});
  assert.deepEqual({...ANCHOR_BUDGET}, {phone: 280, laptop: 240});
  assert.equal(HEADER_CONTROLS_MAX, 2);
});
