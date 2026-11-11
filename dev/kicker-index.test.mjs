/* The landing indexes must agree with the canonical instrument numbering.
   dev/scaffold.test.mjs already pins every PAGE's kicker to INSTRUMENTS /
   ENERGY_INSTRUMENTS; the untested edge was the landing pages — Swiss 6b
   renumbered the kickers (fermi moved to 11) and home/index.html kept the old
   order, so "03 Fermi" landed on a page headed INSTRUMENT 11. This closes it:
   every numbered card and nav mention must carry the table's number. */
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {INSTRUMENTS, ENERGY_INSTRUMENTS, BINDERS, TOOL_DIRS} from './tool-dirs.mjs';
import {SUITE_CATALOG} from '../assets/suite-catalog.js';
import {SHELL_MANIFEST} from './shell-manifest.mjs';

const read = p => readFileSync(new URL('../' + p, import.meta.url), 'utf8');

test('the front door numbers nothing: instrument numbers live on the pages\' kickers, not in the index', () => {
  const home = read('home/index.html');
  assert.doesNotMatch(home, /<span class="num">/, 'the front door groups by job; a number would imply an order it does not have');
  assert.doesNotMatch(home, /catalogue-row/, 'the old numbered rows are gone from home');
  for(const dir of Object.keys(INSTRUMENTS))
    if(!['alarm', 'flow', 'signal-vs-noise'].includes(dir))
      assert.ok(home.includes('href="/' + dir + '/"') || SUITE_CATALOG.find(t => t.id === 'product:' + dir)?.room !== 'instrument', dir + ' is an instrument and must be on the front door');
});

test('energy catalogue numbers every instrument once in the canonical order', () => {
  const idx = read('energy/index.html');
  // The catalogue rows own this inventory; the duplicate local nav is gone.
  const rows = [...idx.matchAll(/<a class="tool catalogue-row" href="([a-z-]+)\/">\s*<span class="num">(E\d+)<\/span>/g)];
  assert.deepEqual(rows.map(m=>[m[1],m[2]]),Object.entries(ENERGY_INSTRUMENTS));
});

test('home carries each binder as the flagship of its own job, never a numbered card', () => {
  const home = read('home/index.html');
  for(const b of BINDERS){
    assert.match(home, new RegExp('<a class="door-flagship" href="/' + b + '/">'),
      b + ': home must show the binder as its job\'s flagship');
    assert.ok(!new RegExp('<a class="tool catalogue-row" href="/' + b + '/">').test(home),
      b + ': a binder must never be a numbered instrument card');
  }
});

test('Paths, Roadmap and Timeline name their different planning claims at the entry point', () => {
  const paths = read('paths/index.html');
  const roadmap = read('roadmap/index.html');
  const timeline = read('timeline/index.html');
  assert.match(paths, /Decision plan · all outcomes/,
    'Paths must identify its all-outcomes decision-plan claim before the workspace');
  assert.match(paths, /question can stop, pivot or expand investment/,
    'Paths must state the uncertainty it owns, rather than reading like a schedule');
  assert.match(roadmap, /Delivery roadmap · committed work/,
    'Roadmap must identify its delivery claim before the workspace');
  assert.match(roadmap, /If an open question can stop, pivot or expand investment, design the decision plan in <a href="\/paths\/">Paths<\/a> first\./,
    'Roadmap must route material conditionality to Paths without implying a shared model');
  assert.match(timeline, /Timing forecast · ranges, not promises/,
    'Timeline keeps its forecast claim on the tool title without repeating it in the artifact');
  assert.match(timeline, /does not decide which conditional work belongs in the plan/,
    'Timeline must not make a timing forecast look like a decision or delivery plan');
  assert.match(timeline, /<a href="\/paths\/">Paths<\/a> and <a href="\/roadmap\/">Roadmap<\/a>/,
    'Timeline must route decision and delivery concerns back to their distinct instruments');
});

test('a shell page\'s h1 is its catalogue title', () => {
  const shells = Object.entries(SHELL_MANIFEST).filter(([, entry]) => entry.shell);
  assert.ok(shells.length >= 3, 'no shell pages to check');
  for(const [dir, entry] of shells){
    const source = TOOL_DIRS.includes(dir) ? 'product' : 'energy';
    const catalogue = SUITE_CATALOG.find(tool => tool.source === source && tool.route === dir);
    const html = read((source === 'energy' ? 'energy/' : '') + dir + '/index.html');
    const h1s = [...html.matchAll(/<h1[^>]*>([\s\S]*?)<\/h1>/g)].map(m => m[1].replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').trim());
    assert.deepEqual(h1s, [catalogue.title], dir + ': the page must carry exactly one h1, equal to the catalogue title');
  }
});
