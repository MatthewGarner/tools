import {test} from 'node:test';
import assert from 'node:assert/strict';
import {parse} from '../parse.js';
import {render} from '../render.js';

const measure = t => t.length * 7;
const colors = {
  card: '#fff', border: '#ddd', ink: '#222', muted: '#667', accent: '#08c', bg: '#f7f8f6',
  err: '#b33', status: {done: '#1D7A3E', doing: '#0C7FAE', risk: '#9A6A00', blocked: '#B3403A'},
  statusInk: {done: '#1D7A3E', doing: '#0C7FAE', risk: '#9A6A00', blocked: '#B3403A'},
  accentInk: '#08c',
};
const narrow = src => render(parse(src), {colors, measure, width: 360});
const M = 'title: T\ndate: 2026-07-04\nhorizons: monthly from Jul 2026 x4\n';

test('a spanning card appears ONCE, in its start section, and says how long it runs', () => {
  const svg = narrow(M + 'Jul 2026\nCore: Sync engine rewrite x3');
  /* NOTE (plan deviation): drawCard already repeats a title 4x per card (data-raw,
     two aria-labels, the visible text), and this task's own "also running" line
     (see the next test) repeats it again in each through-month — so a bare
     `svg.split(title)` count can never equal 1, even pre-existing, span-free.
     ">title<" isolates the one visible card-text node, which the "also running:
     title" line never matches (it reads "running: title", not ">title"). */
  assert.equal(svg.split('>Sync engine rewrite<').length - 1, 1, 'exactly one card, not one per month');
  assert.match(svg, />runs Jul 2026 → Sep 2026</);
});

test('a month a span runs THROUGH lists it — an empty-looking month would be a lie', () => {
  const svg = narrow(M + 'Jul 2026\nCore: Sync engine rewrite x3');
  assert.match(svg, />also running: Sync engine rewrite</,
    'Aug and Sep have no cards of their own, but the work IS in flight');
});

test('several carried-over items are listed together', () => {
  const svg = narrow(M + 'Jul 2026\nCore: Alpha x3\nCore: Beta x2');
  assert.match(svg, />also running: Alpha · Beta</);
});

test('a month with no carried-over work says nothing extra', () => {
  const svg = narrow(M + 'Jul 2026\nCore: Alpha\nAug 2026\nCore: Beta');
  assert.doesNotMatch(svg, /also running/);
});

test('an off-board span names its true end on the phone too', () => {
  const svg = narrow(M + 'Sep 2026\nCore: Long haul x4');
  assert.match(svg, />runs Sep 2026 → Dec 2026</);
});
