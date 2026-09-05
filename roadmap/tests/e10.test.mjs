/* E10 — register outcome regroup (`group:` config key).
   Spec: docs/superpowers/specs/2026-08-10-track1-roadmap-conditional-display.md S4
   (+ Rev A amendments). group: lane (default) | outcome. Outcome mode is a
   GROUPING LENS over the register only: either way / only-if-a-bet-pays-off /
   only-if-it-doesn't / in-a-condition-cycle / not-needed, no data-hdrop bands,
   no "+ ADD" rows. */
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {parse} from '../parse.js';
import {CONFIG_KEYS, setConfigKey, setGroup} from '../edit-targets.js';
import {registerOutcomeGroups} from '../cond-parts.js';
import {registerRows} from '../deck-parts.js';

const measure = (s, f) => (s ? s.length : 0) * ((/(\d+)px/.exec(String(f)) || [])[1] || 12) * 0.55;
const colors = {
  bg: '#fff', card: '#fff', border: '#ccc', ink: '#111', muted: '#666', accent: '#08c', accentInk: '#067',
  err: '#c00', status: {done: '#1D7A3E', doing: '#0C7FAE', risk: '#9A6A00', blocked: '#B3403A'},
  statusInk: {done: '#1C753C', doing: '#0B709A', risk: '#8E6200', blocked: '#B3403A'},
};
const ctx = (extra = {}) => ({colors, measure, dark: false, today: '2026-08-09', ...extra});

const OUTCOME_DOC = 'title: T\nstyle: register\ngroup: outcome\nwip: off\nNOW\n' +
  'Core: Foundation\nNEXT\n' +
  'Core: Root gate [bet: gate]\n' +
  'Core: Feature ships [if gate] -- ships once gate pays off\n' +
  'Core: Fallback plan [unless gate] -- covers if gate fails\n' +
  'Core: Alpha loop [bet: alpha] [if beta]\n' +
  'Core: Beta loop [bet: beta] [if alpha]\n' +
  'LATER\n' +
  'Growth: Expansion bet [bet: expansion won]\n' +
  'Growth: Won fallback dropped [unless expansion] -- superseded once expansion shipped\n' +
  'Growth: Won rider stays [if expansion]';

/* ---------- parse: group key ---------- */


test('group: defaults to "lane" when absent', () => {
  assert.equal(parse('NOW\nAlpha').group, 'lane');
});

test('group: outcome on a register doc parses cleanly, no warnings from the key itself', () => {
  const m = parse('title: T\nstyle: register\ngroup: outcome\nNOW\nAlpha');
  assert.equal(m.group, 'outcome');
  assert.ok(!m.warnings.some(w => w.includes('group:')));
});

test('group: unknown value warns and falls back to lane', () => {
  const m = parse('style: register\ngroup: sideways\nNOW\nAlpha');
  assert.equal(m.group, 'lane');
  assert.ok(m.warnings.some(w => w === 'line 2: group: wants lane or outcome — reading lane'), JSON.stringify(m.warnings));
});

test('group: outcome on a non-register view warns that it only affects the register', () => {
  const board = parse('style: board\ngroup: outcome\nNOW\nAlpha');
  assert.ok(board.warnings.some(w => w === 'group: only affects the register view'), JSON.stringify(board.warnings));
  const plain = parse('group: outcome\nNOW\nAlpha');   // effective style resolves to board
  assert.ok(plain.warnings.some(w => w === 'group: only affects the register view'));
  const reg = parse('style: register\ngroup: outcome\nNOW\nAlpha');
  assert.ok(!reg.warnings.some(w => w.includes('only affects')));
});

test('a config line "group:" never becomes a lane/item — even a lane literally named "group" is eaten as config, protected by CONFIG_KEYS', () => {
  const m = parse('NOW\ngroup: not a lane prefix, an item');
  // read as config (currentH>=0 so it warns about the collision) — never an item
  assert.equal(m.items.length, 0);
  assert.ok(m.warnings.some(w => w.includes('group')));
  assert.ok(CONFIG_KEYS.test('group'), 'CONFIG_KEYS must include group, or a lane named "group" would silently eat the config warning path\'s own protection');
});

test('setGroup writes group: outcome, and it round-trips through parse', () => {
  const text = setGroup('style: register\nNOW\nAlpha', 'outcome');
  assert.match(text, /^group: outcome$/m);
  assert.equal(parse(text).group, 'outcome');
});

test('setGroup("lane") CLEARS the key rather than writing "group: lane"', () => {
  const withGroup = setConfigKey('style: register\nNOW\nAlpha', 'group', 'outcome');
  const cleared = setGroup(withGroup, 'lane');
  assert.ok(!/group:/.test(cleared), cleared);
  assert.equal(parse(cleared).group, 'lane');
});

test('registerOutcomeGroups: either-way / pays-off / doesn\'t / cycle / not-needed sections, correct membership', () => {
  const m = parse(OUTCOME_DOC);
  const rows = registerRows(m);
  const groups = registerOutcomeGroups(m, rows);
  const byKind = k => groups.find(g => g.kind === k);

  const either = byKind('either');
  assert.ok(either, JSON.stringify(groups.map(g => g.kind)));
  assert.deepEqual(either.items.map(i => i.title).sort(), [
    'Expansion bet', 'Foundation', 'Root gate', 'Won rider stays',
  ].sort());

  const pays = byKind('pays');
  assert.equal(pays.items.length, 1);
  assert.equal(pays.items[0].title, 'Feature ships');
  assert.ok(pays.label.includes('gate'), pays.label);

  const notPays = byKind('not-pays');
  assert.equal(notPays.items.length, 1);
  assert.equal(notPays.items[0].title, 'Fallback plan');

  const cycle = byKind('cycle');
  assert.ok(cycle, 'a cycle section must appear when a cycle exists');
  assert.deepEqual(cycle.items.map(i => i.title).sort(), ['Alpha loop', 'Beta loop']);

  const notNeeded = byKind('not-needed');
  assert.equal(notNeeded.items.length, 1);
  assert.equal(notNeeded.items[0].title, 'Won fallback dropped');
});

test('registerOutcomeGroups: empty sections are omitted entirely', () => {
  const m = parse('style: register\ngroup: outcome\nNOW\nAlpha\nNEXT\nBeta');
  const groups = registerOutcomeGroups(m, registerRows(m));
  // no bets at all -> everything is either-way, nothing else appears
  assert.deepEqual(groups.map(g => g.kind), ['either']);
});

test('registerOutcomeGroups: a bet with only an [if] rider (no [unless]) omits the "doesn\'t" half', () => {
  const m = parse('style: register\ngroup: outcome\nNOW\nCore: Root [bet: x]\nNEXT\nCore: Rider [if x]');
  const groups = registerOutcomeGroups(m, registerRows(m));
  assert.ok(groups.some(g => g.kind === 'pays'));
  assert.ok(!groups.some(g => g.kind === 'not-pays'));
});
