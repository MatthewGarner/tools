/* The shell manifest must describe exactly the pages the suite ships, under the
   names the catalogue gives them. The manifest is the source the stamped header
   and the first-screen gate will both read, so a missing page would silently
   escape the gate and a drifted name would reintroduce the Bets / "Bet
   portfolio" disagreement the shell exists to remove. */
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {TOOL_DIRS, ENERGY_TOOL_DIRS} from './tool-dirs.mjs';
import {SUITE_CATALOG} from '../assets/suite-catalog.js';
import {SHELL_MANIFEST, HEADER_BUDGET, HEADER_BUDGET_ENERGY, headerHeight, headerBudget, ANCHOR_BUDGET, HEADER_CONTROLS_MAX} from './shell-manifest.mjs';

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
    for(const flag of ['new', 'examples', 'templates', 'share', 'anchorBudget', 'shell', 'ownLink', 'longName'])
      assert.equal(typeof entry[flag], 'boolean', dir + ': ' + flag + ' must be a boolean');
  }
});

test('the budgets are the spec section 2 numbers', () => {
  assert.deepEqual({...HEADER_BUDGET}, {phone: 215, laptop: 180});
  assert.deepEqual({...ANCHOR_BUDGET}, {phone: 280, laptop: 240});
  assert.equal(HEADER_CONTROLS_MAX, 2);
});

test('Energy pages add the 44px strip row to the Product budget and header height', () => {
  assert.deepEqual({...HEADER_BUDGET_ENERGY}, {phone: 259, laptop: 224});
  assert.equal(headerHeight('fermi'), 96);
  assert.equal(headerHeight('cycles'), 120);
  assert.deepEqual({...headerBudget('risk')}, {phone: 259, laptop: 224});
  assert.deepEqual({...headerBudget('rank')}, {phone: 215, laptop: 180});
});

/* The capabilities every page is meant to have, written out by hand. The browser suites read the manifest, so a
   manifest edit alone could silence them; changing a flag is a deliberate two-place change (here and in the manifest). */
const PINNED = {
  fermi: {new: false, examples: false, templates: true, share: true, workspaces: null, ownLink: false, longName: false},
  rank: {new: true, examples: true, templates: true, share: true, workspaces: null, ownLink: false, longName: false},
  roadmap: {new: true, examples: true, templates: true, share: true, workspaces: null, ownLink: false, longName: false},
  why: {new: true, examples: true, templates: true, share: true, workspaces: null, ownLink: false, longName: false},
  tree: {new: true, examples: true, templates: true, share: true, workspaces: null, ownLink: false, longName: false},
  map: {new: true, examples: true, templates: true, share: true, workspaces: null, ownLink: false, longName: false},
  gauge: {new: true, examples: true, templates: true, share: false, workspaces: "Question sets", ownLink: true, longName: false},
  flow: {new: false, examples: false, templates: false, share: true, workspaces: null, ownLink: false, longName: false},
  timeline: {new: true, examples: true, templates: true, share: true, workspaces: null, ownLink: false, longName: false},
  wardley: {new: true, examples: true, templates: true, share: true, workspaces: null, ownLink: false, longName: false},
  alarm: {new: false, examples: false, templates: false, share: true, workspaces: null, ownLink: false, longName: false},
  duel: {new: false, examples: false, templates: true, share: true, workspaces: null, ownLink: false, longName: false},
  premortem: {new: true, examples: false, templates: true, share: true, workspaces: "Registers", ownLink: false, longName: false},
  bets: {new: true, examples: true, templates: true, share: true, workspaces: null, ownLink: false, longName: false},
  "signal-vs-noise": {new: false, examples: false, templates: false, share: true, workspaces: null, ownLink: false, longName: false},
  case: {new: true, examples: true, templates: false, share: true, workspaces: null, ownLink: false, longName: false},
  paths: {new: true, examples: true, templates: false, share: true, workspaces: null, ownLink: false, longName: false},
  proxy: {new: true, examples: true, templates: true, share: true, workspaces: null, ownLink: false, longName: false},
  cycles: {new: true, examples: true, templates: true, share: true, workspaces: null, ownLink: false, longName: false},
  risk: {new: true, examples: true, templates: true, share: true, workspaces: null, ownLink: false, longName: false},
  frequency: {new: false, examples: false, templates: false, share: true, workspaces: null, ownLink: false, longName: true},
  "merit-order": {new: false, examples: false, templates: true, share: true, workspaces: null, ownLink: false, longName: false},
  intraday: {new: false, examples: false, templates: true, share: true, workspaces: null, ownLink: false, longName: true},
};
test('each page\'s capability flags are pinned in this literal table', () => {
  assert.deepEqual(Object.keys(PINNED).sort(), Object.keys(SHELL_MANIFEST).sort(), 'the table and the manifest list different pages');
  for(const [dir, pinned] of Object.entries(PINNED)){
    const entry = SHELL_MANIFEST[dir];
    assert.deepEqual({new: entry.new, examples: entry.examples, templates: entry.templates, share: entry.share, workspaces: entry.workspaces, ownLink: entry.ownLink, longName: entry.longName}, pinned,
      dir + ': the manifest no longer matches the pinned capabilities; change both deliberately');
  }
});
