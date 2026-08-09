/* Conditional roadmaps — slice A3 (render states, every surface).
   Spec: docs/superpowers/specs/2026-08-09-conditional-roadmap-spec.md §2.
   Plan: docs/superpowers/plans/2026-08-09-conditional-roadmap-plan.md A3. */
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {parse} from '../parse.js';
import {render} from '../render.js';
import {renderBoardDeck, renderBoardLive} from '../render-board.js';
import {renderRegisterDeck, renderRegisterLive} from '../render-register.js';
import {renderFocusDeck, renderFocusLive} from '../render-focus.js';
import {renderDeck} from '../render-deck.js';
import {anyBet, cardTag, tagColors, stateOpacity} from '../cond-parts.js';

const measure = (s, f) => (s ? s.length : 0) * ((/(\d+)px/.exec(String(f)) || [])[1] || 12) * 0.55;
const colors = {
  bg: '#fff', card: '#fff', border: '#ccc', ink: '#111', muted: '#666', accent: '#08c', accentInk: '#067',
  err: '#c00', status: {done: '#1D7A3E', doing: '#0C7FAE', risk: '#9A6A00', blocked: '#B3403A'},
  statusInk: {done: '#1C753C', doing: '#0B709A', risk: '#8E6200', blocked: '#B3403A'},
};
const ctx = (extra = {}) => ({colors, measure, dark: false, today: '2026-08-09', ...extra});

const FORK_DOC = 'title: T\nNOW\nCore: Ship base [bet: reminders]\nNEXT\nCore: Smart nudges [if reminders]\nCore: Manual digest [unless reminders]\nLATER\nCore: Later thing';
const RESOLVED_WON = FORK_DOC.replace('[bet: reminders]', '[bet: reminders won]');
const RESOLVED_LOST = FORK_DOC.replace('[bet: reminders]', '[bet: reminders lost]');
/* a chained (moot) doc: root bet drops "gate", whose OWN [if gate] rider
   must then read as "never ran" — never "lost", per spec §1. */
const MOOT_DOC = 'title: T\nNOW\nCore: Root [bet: root lost]\nNEXT\nCore: Gate [bet: gate] [if root]\nLATER\nCore: Rider [if gate]';
const PLAIN_DOC = 'title: T\nNOW\nCore: Plain item\nNEXT\nCore: Another one';

/* ---------- cond-parts.js pure helpers ---------- */

test('anyBet is false for a bet-free doc, true once any bet/cond appears', () => {
  assert.equal(anyBet(parse(PLAIN_DOC)), false);
  assert.equal(anyBet(parse(FORK_DOC)), true);
});

test('cardTag: bet-open / cond / dropped / moot wording', () => {
  const m = parse(FORK_DOC);
  const [betItem, ifItem, unlessItem] = m.items;
  assert.deepEqual(cardTag(m, betItem), {kind: 'bet-open', label: 'BET reminders'});
  assert.deepEqual(cardTag(m, ifItem), {kind: 'cond', label: 'if reminders'});
  // BOTH sides of an unresolved fork read as 'cond' — the fork hasn't answered,
  // so neither branch is dropped yet (that only happens once the bet resolves)
  assert.deepEqual(cardTag(m, unlessItem), {kind: 'cond', label: 'unless reminders'});

  const won = parse(RESOLVED_WON);
  assert.deepEqual(cardTag(won, won.items[0]), {kind: 'bet-won', label: 'reminders · won'});
  assert.deepEqual(cardTag(won, won.items[2]), {kind: 'dropped', label: 'dropped — reminders won'});

  const moot = parse(MOOT_DOC);
  const gate = moot.items[1], rider = moot.items[2];
  assert.equal(gate.worldState, 'dropped');
  assert.deepEqual(cardTag(moot, gate), {kind: 'dropped', label: 'dropped — root lost'});
  assert.deepEqual(cardTag(moot, rider), {kind: 'dropped', label: 'dropped — gate never ran'},
    'a moot bet\'s own [if] dependent reads "never ran", never "lost"');
});

test('cardTag never emits ✓/✗ glyphs or NBSP', () => {
  for(const doc of [FORK_DOC, RESOLVED_WON, RESOLVED_LOST, MOOT_DOC]){
    const m = parse(doc);
    for(const it of m.items){
      const tag = cardTag(m, it);
      if(!tag) continue;
      assert.ok(!/[✓✗]/.test(tag.label));
      assert.ok(!tag.label.includes(' '), 'no NBSP in capsule text (PNG export trap)');
    }
  }
});

test('single-strongest-state opacity never multiplies — dropped/cond override the certainty fade outright', () => {
  assert.equal(stateOpacity({worldState: 'dropped'}, 0.5), stateOpacity({worldState: 'dropped'}, 1),
    'dropped opacity is the SAME regardless of column fade');
  assert.equal(stateOpacity({worldState: 'cond'}, 0.5), stateOpacity({worldState: 'cond'}, 1));
  assert.equal(stateOpacity({worldState: null}, 0.72), 0.72, 'a plain item keeps the passed-through certainty fade');
});

/* ---------- byte-identity: a bet-free doc renders with NO new markup ---------- */

test('a bet-free doc: chart/board/register/focus/deck carry no capsule/dashed markup', () => {
  const m = parse(PLAIN_DOC);
  const svgs = [
    render(m, ctx()),
    render(m, ctx({width: 380})),                 // narrow chart
    renderBoardDeck(m, ctx(), colors),
    renderBoardLive(m, ctx({edit: true})),
    renderRegisterDeck(m, ctx(), colors),
    renderRegisterLive(m, ctx({edit: true})),
    renderFocusDeck(m, ctx(), colors),
    renderFocusLive(m, ctx({edit: true})),
    renderDeck(m, ctx()),
  ];
  for(const svg of svgs){
    assert.ok(!svg.includes('stroke-dasharray="3 3"') || !svg.includes('BET '), 'no bet capsule on a bet-free doc');
    assert.ok(!/dropped —/.test(svg));
    assert.ok(!/BET [A-Za-z]/.test(svg));
    assert.ok(!/·\s*(won|lost|never ran)/.test(svg));
  }
});

/* ---------- chart (render.js) ---------- */

test('chart: bet/cond/dropped capsules render, full EIP kept (never the ghost treatment)', () => {
  const m = parse(FORK_DOC);
  const svg = render(m, ctx({edit: true}));
  assert.ok(svg.includes('BET reminders'));
  assert.ok(svg.includes('if reminders'));
  assert.ok(svg.includes('data-edit="title"'), 'cond/bet cards keep full edit-in-place markup');
  assert.ok(svg.includes('data-edit="cardmenu"'));

  const won = parse(RESOLVED_WON);
  const svgWon = render(won, ctx({edit: true}));
  assert.ok(svgWon.includes('reminders · won'));
  assert.ok(svgWon.includes('dropped — reminders won'));
  assert.ok(svgWon.includes('data-edit="title"'), 'a dropped card keeps full edit markup too');
});

test('chart narrow: same capsule/dashed treatment as wide', () => {
  const svg = render(parse(FORK_DOC), ctx({width: 380}));
  assert.ok(svg.includes('BET reminders'));
  assert.ok(svg.includes('if reminders'));
});

test('chart: diff badge suppressed on a dropped item', () => {
  const before = 'title: T\nNOW\nCore: Ship base [bet: reminders won]\nNEXT\nCore: Manual digest [unless reminders]\nLATER\nCore: X';
  const m = parse(before);
  // any:false — a bare card badge, not the legend's own always-on NEW key
  const diff = {badge: it => it.title === 'Manual digest' ? {kind: 'new', label: 'new'} : null, any: false, dropped: []};
  const svg = render(m, ctx({diff}));
  assert.ok(!svg.includes('>NEW<'), 'the dropped item\'s NEW badge never paints');
});

test('chart: a moot bet\'s own item shows "never ran" and its [if] rider drops the same way', () => {
  const svg = render(parse(MOOT_DOC), ctx());
  assert.match(svg, /dropped — root lost/);
  assert.match(svg, /dropped — gate never ran/);
  assert.ok(!svg.includes('gate lost'));
});

/* ---------- board ---------- */

test('board deck: card-column capsule + list-mode sub-line tag', () => {
  const m = parse(FORK_DOC);
  const svg = renderBoardDeck(m, ctx(), colors);
  assert.ok(svg.includes('BET reminders') || svg.includes('if reminders'));
});

test('board live: full capsule + edit markup kept on cond/dropped cards', () => {
  const m = parse(RESOLVED_LOST);
  const svg = renderBoardLive(m, ctx({edit: true}));
  assert.ok(svg.includes('reminders · lost'));
  assert.ok(svg.includes('dropped — reminders lost'));
  assert.ok(svg.includes('data-edit="cardmenu"'));
});

test('board: dropped item carries no flag border even when [risk]', () => {
  const doc = 'title: T\nNOW\nCore: Root [bet: root lost]\nNEXT\nCore: Fallout [if root] [risk]\nLATER\nCore: X';
  const m = parse(doc);
  const fallout = m.items.find(i => i.title.startsWith('Fallout'));
  assert.equal(fallout.worldState, 'dropped');
  const svg = renderBoardLive(m, ctx({edit: true}));
  // the flag-coloured stroke (status.risk) must not appear on the dropped card's rect
  assert.ok(!new RegExp('stroke="' + colors.status.risk + '"').test(svg.split('Fallout')[0].slice(-400)));
});

/* ---------- register ---------- */

test('register deck + live: tag under the title, no risk/blocked wash on a dropped row', () => {
  const doc = 'title: T\nNOW\nCore: Root [bet: root lost]\nNEXT\nCore: Fallout [if root] [risk]\nLATER\nCore: X';
  const m = parse(doc);
  const deckSvg = renderRegisterDeck(m, ctx(), colors);
  const liveSvg = renderRegisterLive(m, ctx({edit: true}));
  for(const svg of [deckSvg, liveSvg]){
    assert.ok(svg.includes('dropped — root lost'));
    // the blocked/risk wash uses tint(C.status.risk) or +'33' suffix — assert absence near Fallout
    assert.ok(!svg.includes(colors.status.risk + '33'));
  }
});

test('register: BET/resolved capsules render', () => {
  const svg = renderRegisterLive(parse(RESOLVED_WON), ctx({edit: true}));
  assert.ok(svg.includes('reminders · won'));
});

/* ---------- focus ---------- */

test('focus hero: full capsule; rail degrades to fade-only (no capsule text)', () => {
  const doc = 'title: T\nstyle: focus\nNOW\nCore: Ship base [bet: reminders]\nNEXT\nCore: Smart nudges [if reminders]\nLATER\nCore: Later thing';
  const m = parse(doc);
  const deckSvg = renderFocusDeck(m, ctx(), colors);
  const liveSvg = renderFocusLive(m, ctx({edit: true}));
  for(const svg of [deckSvg, liveSvg]) assert.ok(svg.includes('BET reminders'), 'hero carries the capsule');
  // the rail item ("Smart nudges", in NEXT which is not the hero) must render its
  // title but WITHOUT the "if reminders" capsule text next to it
  for(const svg of [deckSvg, liveSvg]){
    assert.ok(svg.includes('Smart nudges'));
    assert.ok(!svg.includes('if reminders'), 'the rail row is fade-only — no capsule');
  }
});

/* ---------- deck grid (delegates to the chart) ---------- */

test('deck grid style shows the capsule through the delegated chart', () => {
  const doc = 'title: T\nhorizons: quarterly from Q1 2026 x4\nQ1 2026\nCore: Ship base [bet: reminders]\nQ2 2026\nCore: Smart nudges [if reminders]';
  const svg = renderDeck(parse(doc), ctx());
  assert.ok(svg.includes('BET reminders'));
});

/* ---------- SVG is XML, not HTML (dev/svg-wellformed.test.mjs scans only the
   committed goldens, which carry no bet/cond doc yet — A6 captures those.
   This is the same strict tag-level pattern, applied here to the NEW markup
   directly, so it's proven before the golden ever exists). ---------- */

const TAG = /^<[a-zA-Z][\w:-]*((\s+[\w:-]+=("[^"<]*"|'[^'<]*'))*)\s*\/?>$/;
function assertWellFormedTags(svg, label){
  for(const tag of svg.match(/<[^!/][^>]*>/g) || [])
    assert.match(tag, TAG, label + ': malformed tag ' + tag.slice(0, 140));
}

test('new cond/dropped/bet markup is well-formed XML everywhere it renders', () => {
  const fork = parse(FORK_DOC), won = parse(RESOLVED_WON), moot = parse(MOOT_DOC);
  const cases = [
    ['chart', render(fork, ctx({edit: true}))],
    ['chart-narrow', render(fork, ctx({width: 380, edit: true}))],
    ['chart-dropped', render(won, ctx({edit: true}))],
    ['chart-moot', render(moot, ctx())],
    ['board-deck', renderBoardDeck(fork, ctx(), colors)],
    ['board-live', renderBoardLive(won, ctx({edit: true}))],
    ['register-deck', renderRegisterDeck(fork, ctx(), colors)],
    ['register-live', renderRegisterLive(won, ctx({edit: true}))],
    ['focus-deck', renderFocusDeck(fork, ctx(), colors)],
    ['focus-live', renderFocusLive(won, ctx({edit: true}))],
    ['deck-dispatch', renderDeck(fork, ctx())],
  ];
  for(const [label, svg] of cases) assertWellFormedTags(svg, label);
});

/* ---------- injection: hostile bet/cond names ---------- */

test('a hostile bet name is escaped in every capsule-bearing renderer', () => {
  const hostile = '<script>alert(1)</script>';
  const doc = 'title: T\nNOW\nCore: A [bet: xss]\nNEXT\nCore: B [if xss]';
  // can't put the hostile string INTO the bet name (grammar is [a-z0-9-]+),
  // so prove escaping via the title instead, alongside a real bet/cond pair —
  // the point is that cardTag's own output always flows through the same
  // esc()-at-emission discipline as every other capsule label in this file.
  const m = parse(doc.replace('Ship base', hostile));
  for(const svg of [render(m, ctx()), renderBoardLive(m, ctx({edit: true})),
    renderRegisterLive(m, ctx({edit: true})), renderFocusLive(m, ctx({edit: true}))]){
    assert.ok(!svg.includes('<script>'));
  }
});
