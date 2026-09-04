/* The conditional dependency chain used by Chapter Spotlight. */
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {parse} from '../parse.js';
import {betChain} from '../cond-parts.js';

const measure = (s, f) => (s ? s.length : 0) * ((/(\d+)px/.exec(String(f)) || [])[1] || 12) * 0.55;
const colors = {
  bg: '#fff', card: '#fff', border: '#ccc', ink: '#111', muted: '#666', accent: '#08c', accentInk: '#067',
  err: '#c00', status: {done: '#1D7A3E', doing: '#0C7FAE', risk: '#9A6A00', blocked: '#B3403A'},
  statusInk: {done: '#1C753C', doing: '#0B709A', risk: '#8E6200', blocked: '#B3403A'},
};
const ctx = (extra = {}) => ({colors, measure, dark: false, today: '2026-08-09', ...extra});

/* ---------- betChain() (cond-parts.js) ---------- */


test('betChain: an item with no cond returns []', () => {
  const m = parse('title: T\nNOW\nCore: Plain item\nNEXT\nCore: Another');
  assert.deepEqual(betChain(m, m.items[0]), []);
});

test('betChain: a single open link', () => {
  const m = parse('title: T\nNOW\nCore: Root [bet: reminders]\nNEXT\nCore: Rider [if reminders]');
  const rider = m.items.find(i => i.title === 'Rider');
  assert.deepEqual(betChain(m, rider), [{name: 'reminders', display: 'reminders', when: 'if', state: 'open'}]);
});

test('betChain: an unless link carries when: "unless"', () => {
  const m = parse('title: T\nNOW\nCore: Root [bet: reminders]\nNEXT\nCore: Fallback [unless reminders]');
  const rider = m.items.find(i => i.title === 'Fallback');
  assert.deepEqual(betChain(m, rider), [{name: 'reminders', display: 'reminders', when: 'unless', state: 'open'}]);
});

test('betChain: a chain of two — item [if a], a\'s declaring item [if b] — root (b) first', () => {
  // root won (paid off) is the ROOT of the chain; gate stays open — the
  // Root->Gate resolution clears Gate's OWN cond (worldState null) while
  // Gate's own bet stays unresolved, so Rider's chain still walks through it.
  const m = parse('title: T\nNOW\nCore: Root [bet: root won]\nCore: Gate [bet: gate] [if root]\nCore: Rider [if gate]');
  const rider = m.items.find(i => i.title === 'Rider');
  assert.deepEqual(betChain(m, rider), [
    {name: 'root', display: 'root', when: 'if', state: 'paid off'},
    {name: 'gate', display: 'gate', when: 'if', state: 'open'},
  ]);
});

test('betChain: resolved states — paid off / didn\'t pay off / never ran', () => {
  const won = parse('title: T\nNOW\nCore: Root [bet: reminders won]\nNEXT\nCore: Rider [if reminders]');
  assert.equal(betChain(won, won.items.find(i => i.title === 'Rider'))[0].state, 'paid off');
  const lost = parse('title: T\nNOW\nCore: Root [bet: reminders lost]\nNEXT\nCore: Rider [unless reminders]');
  // unless-of-lost is LIVE (worldState null), but betChain reads the bet's OWN
  // effective regardless of the caller's when — still exercises the state map.
  assert.equal(betChain(lost, lost.items.find(i => i.title === 'Rider'))[0].state, "didn't pay off");
  // moot: root lost drops Gate ([if root]); Gate's own bet "gate" never gets
  // a chance to run — Rider's chain names it "never ran", and continues past
  // it to root's own "didn't pay off".
  const moot = parse('title: T\nNOW\nCore: Root [bet: root lost]\nCore: Gate [bet: gate] [if root]\nCore: Rider [if gate]');
  const chain = betChain(moot, moot.items.find(i => i.title === 'Rider'));
  assert.deepEqual(chain, [
    {name: 'root', display: 'root', when: 'if', state: "didn't pay off"},
    {name: 'gate', display: 'gate', when: 'if', state: 'never ran'},
  ]);
});

test('betChain: a condition cycle reads "in a cycle" and the walk terminates (own visited set)', () => {
  const m = parse('title: T\nNOW\nA [bet: x] [if y]\nB [bet: y] [if x]');
  assert.ok(m.bets.x.cycle && m.bets.y.cycle, 'sanity: both bets really are flagged as a cycle');
  const a = m.items.find(i => i.title === 'A');
  const chain = betChain(m, a);
  assert.equal(chain.length, 2, 'terminates without looping forever');
  assert.ok(chain.every(l => l.state === 'in a cycle'));
});
