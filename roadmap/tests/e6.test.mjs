/* S5/E6 — the focus "hinges on" strip: betChain() (cond-parts.js) and the
   live hero-card foot row it feeds (render-focus.js). Spec:
   docs/superpowers/specs/2026-08-10-track1-roadmap-conditional-display.md
   §S5, Rev A override (states are open/paid off/didn't pay off/never
   ran/in a cycle — "not yet placed" is unreachable and deleted). */
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {parse} from '../parse.js';
import {renderFocusLive} from '../render-focus.js';
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

/* ---------- the live hero strip (render-focus.js) ---------- */

const chainDoc = 'title: T\nstyle: focus\nNOW\nCore: Root [bet: root won]\nCore: Gate [bet: gate] [if root]\nCore: Rider [if gate]';

test('strip present on a cond hero card: HINGES ON + capsule text for every link', () => {
  const svg = renderFocusLive(parse(chainDoc), ctx());
  assert.ok(svg.includes('HINGES ON'));
  assert.ok(svg.includes('root · paid off'));
  assert.ok(svg.includes('gate · open'));
});

test('strip absent on a plain live card and on a dropped/done card', () => {
  const plain = renderFocusLive(parse('title: T\nstyle: focus\nNOW\nCore: Just a card'), ctx());
  assert.ok(!plain.includes('HINGES ON'));
  const dropped = renderFocusLive(
    parse('title: T\nstyle: focus\nNOW\nCore: Root [bet: root lost]\nCore: Casualty [if root]'), ctx());
  assert.ok(!dropped.includes('HINGES ON'), 'a dropped card carries its own "not needed" tag, not the hinge strip');
  const done = renderFocusLive(
    parse('title: T\nstyle: focus\nNOW\nCore: Root [bet: root]\nCore: Settled [done] [if root]'), ctx());
  assert.ok(!done.includes('HINGES ON'), '[done] outranks the fork — worldState is null, never cond');
});

test('a bet-free doc renders byte-identical — no HINGES ON substring at all', () => {
  const svg = renderFocusLive(parse('title: T\nstyle: focus\nNOW\nCore: A\nNEXT\nCore: B'), ctx());
  assert.ok(!svg.includes('HINGES ON'));
});

test('height: +22 gated exactly to a cond hero card, tagH held constant', () => {
  // both docs give "Twin" the SAME bet-open tag (tagH unchanged) — the only
  // difference is the second doc ALSO conditions Twin on a second, open bet,
  // flipping worldState to 'cond' and adding the strip.
  const base = 'title: T\nstyle: focus\nNOW\nCore: Twin [bet: gate]\nNEXT\nCore: Root holder [bet: root]';
  const cond = 'title: T\nstyle: focus\nNOW\nCore: Twin [bet: gate] [if root]\nNEXT\nCore: Root holder [bet: root]';
  const hOf = svg => +/<rect x="\d+" y="[\d.]+" width="[\d.]+" height="([\d.]+)" fill="[^"]*" rx="14"/.exec(svg)[1];
  const hBase = hOf(renderFocusLive(parse(base), ctx()));
  const hCond = hOf(renderFocusLive(parse(cond), ctx()));
  assert.equal(hCond - hBase, 22);
});

test('no data-edit/data-hit/data-whatif/data-menu inside the strip, even in edit mode', () => {
  const svg = renderFocusLive(parse(chainDoc), ctx({edit: true}));
  const start = svg.indexOf('HINGES ON');
  assert.ok(start !== -1);
  const end = svg.indexOf('</g>', start);
  const seg = svg.slice(start, end);
  assert.ok(!/data-/.test(seg), 'strip segment: ' + seg);
});

test('long chain clips from the end, keeping the FIRST (root) link visible', () => {
  // a five-deep chain forced through a narrow measure (short capsules still
  // add up past the card width) — the root link must always survive.
  const doc = 'title: T\nstyle: focus\nNOW\n' +
    'Core: B1 [bet: b1 won]\n' +
    'Core: B2 [bet: b2] [if b1]\n' +
    'Core: B3 [bet: b3] [if b2]\n' +
    'Core: B4 [bet: b4] [if b3]\n' +
    'Core: B5 [bet: b5] [if b4]\n' +
    'Core: Rider [if b5]';
  const wideMeasure = (s, f) => (s ? s.length : 0) * ((/(\d+)px/.exec(String(f)) || [])[1] || 12) * 3;
  const svg = renderFocusLive(parse(doc), ctx({measure: wideMeasure}));
  assert.ok(svg.includes('HINGES ON'));
  assert.ok(svg.includes('b1 · paid off'), 'root link (b1) must survive clipping');
  assert.ok(!svg.includes('b5 · open'), 'the far end of a too-long chain is clipped away');
});
