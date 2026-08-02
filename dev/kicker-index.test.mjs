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
  const cards = [...home.matchAll(/<a class="tool" href="\/([a-z-]+)\/">\s*<span class="num">(\d+)<\/span>/g)]
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

test('energy index E-numbers carry the canonical series', () => {
  const idx = read('energy/index.html');
  for(const [name, kick] of Object.entries(ENERGY_INSTRUMENTS)){
    /* the masthead nav and the card both number the tool; every mention must agree */
    const mentions = [...idx.matchAll(new RegExp(
      '<a[^>]*href="' + name + '/"[^>]*>(?:[\\s\\S]*?)<span class="enum">(E\\d+)</span>', 'g'))]
      .map(m => m[1]);
    assert.ok(mentions.length >= 2, name + ' should be numbered in nav AND card, found ' + mentions.length);
    for(const n of mentions)
      assert.equal(n, kick, `energy index says "${n} ${name}" but ENERGY_INSTRUMENTS says ${kick}`);
  }
});

test('home carries each binder as a distinct band, never a numbered card', () => {
  const home = read('home/index.html');
  for(const b of BINDERS){
    assert.match(home, new RegExp('<a class="binder" href="/' + b + '/">'),
      b + ': home must show the binder band');
    assert.ok(!new RegExp('<a class="tool" href="/' + b + '/">').test(home),
      b + ': a binder must never be a numbered instrument card');
  }
});
