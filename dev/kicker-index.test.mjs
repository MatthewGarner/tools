/* The landing indexes must agree with the canonical instrument numbering.
   dev/scaffold.test.mjs already pins every PAGE's kicker to INSTRUMENTS /
   ENERGY_INSTRUMENTS; the untested edge was the landing pages — Swiss 6b
   renumbered the kickers (fermi moved to 11) and home/index.html kept the old
   order, so "03 Fermi" landed on a page headed INSTRUMENT 11. This closes it:
   every numbered card and nav mention must carry the table's number. */
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {INSTRUMENTS, ENERGY_INSTRUMENTS, BINDERS} from './tool-dirs.mjs';

const read = p => readFileSync(new URL('../' + p, import.meta.url), 'utf8');

test('home index cards carry the canonical instrument numbers', () => {
  const home = read('home/index.html');
  const cards = [...home.matchAll(/<a class="tool catalogue-row" href="\/([a-z-]+)\/">\s*<span class="num">(\d+)<\/span>/g)]
    .map(m => ({dir: m[1], num: m[2]}));
  const listed = new Map(cards.map(c => [c.dir, c.num]));
  assert.equal(listed.size, cards.length, 'a tool is listed twice on home');
  assert.deepEqual([...listed.keys()].sort(), Object.keys(INSTRUMENTS).sort(),
    'home lists a different set of tools than INSTRUMENTS');
  for(const [dir, num] of Object.entries(INSTRUMENTS))
    assert.equal(listed.get(dir), num,
      `home says "${listed.get(dir)} ${dir}" but INSTRUMENTS (and the page kicker) say ${num}`);
});

test('home index numbers ascend in page order', () => {
  const home = read('home/index.html');
  const nums = [...home.matchAll(/<span class="num">(\d+)<\/span>/g)].map(m => +m[1]);
  assert.deepEqual(nums, nums.map((_, i) => i + 1), 'home .num sequence is not 1..N in order');
});

test('energy catalogue numbers every instrument once in the canonical order', () => {
  const idx = read('energy/index.html');
  // The catalogue rows own this inventory; the duplicate local nav is gone.
  const rows = [...idx.matchAll(/<a class="tool catalogue-row" href="([a-z-]+)\/">\s*<span class="num">(E\d+)<\/span>/g)];
  assert.deepEqual(rows.map(m=>[m[1],m[2]]),Object.entries(ENERGY_INSTRUMENTS));
});

test('home carries each binder as a distinct band, never a numbered card', () => {
  const home = read('home/index.html');
  for(const b of BINDERS){
    assert.match(home, new RegExp('<a class="binder catalogue-binder" href="/' + b + '/">'),
      b + ': home must show the binder band');
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
