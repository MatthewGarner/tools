/* E7 — deck world spread (`deck: spread`). forkEntries() extraction, the
   deck: config key, and the spread body's panel membership rules. */
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {parse, forkEntries, applyWorld, roadmapVerdict} from '../parse.js';
import {renderDeck, effectiveStyle} from '../render-deck.js';

const ctx = {
  colors: {card: '#fff', border: '#ddd', ink: '#222', muted: '#667', accent: '#08c', bg: '#f7f8f6',
    err: '#b33', status: {done: '#1D7A3E', doing: '#1F4FD8', risk: '#9A6A00', blocked: '#B3403A'},
    statusInk: {done: '#1C753C', doing: '#1A44C2', risk: '#8E6200', blocked: '#B3403A'}, accentInk: '#0A6C94',
    brand: '#E2231A', brandText: '#D62015'},
  measure: t => String(t).length * 7,
};

/* ---------- forkEntries() extraction ---------- */

test('forkEntries: no bets at all -> []', () => {
  const m = parse('date: 2026-08-09\nNOW\nCore: Foundation');
  assert.deepEqual(forkEntries(m), []);
});

test('forkEntries: a bet nothing conditions on has reach 0 -> excluded', () => {
  const m = parse('date: 2026-08-09\nNOW\nCore: Retention engine [bet: retention]\nCore: Unrelated item');
  assert.deepEqual(forkEntries(m), []);
});

test('forkEntries: a resolved bet is never a candidate (only unresolved, non-cycle)', () => {
  const m = parse('date: 2026-08-09\nNOW\nCore: Retention engine [bet: retention won]\n' +
    'Core: Proactive nudges [if retention]');
  assert.deepEqual(forkEntries(m), []);
});

test('forkEntries: reach counts items whose worldState differs between won and lost', () => {
  const m = parse('date: 2026-08-09\nhorizons: Now, Next, Later\nNOW\nCore: Foundation\nNEXT\n' +
    'Core: Retention engine [bet: retention]\nCore: Proactive nudges [if retention]\n' +
    'Core: Manual outreach [unless retention]');
  const entries = forkEntries(m);
  assert.equal(entries.length, 1);
  assert.equal(entries[0].name, 'retention');
  assert.equal(entries[0].display, 'retention');
  assert.equal(entries[0].n, 2);   // the if rider + the unless fallback
  assert.equal(entries[0].srcLine, m.bets.retention.srcLine);
});

test('forkEntries: sorts by reach desc, ties by srcLine asc — most riders speaks, earliest wins a tie', () => {
  const m = parse('date: 2026-08-09\nhorizons: Now, Next, Later\nNOW\n' +
    'Core: Bet A [bet: a]\nCore: A rider one [if a]\nCore: A rider two [unless a]\nCore: A rider three [if a]\n' +
    'NEXT\nCore: Bet B [bet: b]\nCore: B rider [if b]');
  const entries = forkEntries(m);
  assert.equal(entries.length, 2);
  assert.equal(entries[0].name, 'a');   // reach 3 > reach 1
  assert.equal(entries[1].name, 'b');
});

test('forkEntries: a genuine reach tie breaks by earliest declared (srcLine asc)', () => {
  const m = parse('date: 2026-08-09\nhorizons: Now, Next, Later\nNOW\n' +
    'Core: Bet A [bet: a]\nCore: A rider [if a]\n' +
    'NEXT\nCore: Bet B [bet: b]\nCore: B rider [if b]');
  const entries = forkEntries(m);
  assert.equal(entries.length, 2);
  assert.equal(entries[0].n, 1);
  assert.equal(entries[1].n, 1);
  assert.ok(entries[0].srcLine < entries[1].srcLine);
  assert.equal(entries[0].name, 'a');
});

test('forkEntries: a cycle bet is excluded, same as forkTier always excluded it', () => {
  const m = parse('date: 2026-08-09\nNOW\nCore: Bet A [bet: a] [if b]\nCore: Bet B [bet: b] [if a]');
  assert.deepEqual(forkEntries(m), []);
});

test('forkTier verdict sentence is BYTE-IDENTICAL after the forkEntries extraction', () => {
  const m = parse('title: Fork doc\ndate: 2026-08-09\nhorizons: Now, Next, Later\nwip: off\nNOW\n' +
    'Core: Foundation\nNEXT\n' +
    'Core: Retention engine [bet: retention] [doing] -- ships behind a flag\n' +
    'Core: Proactive nudges [if retention]\n' +
    'Core: Manual outreach [unless retention]\n' +
    'LATER\nGrowth: Cross-sell push');
  const v = roadmapVerdict(m);
  assert.equal(v.fig, '2 of 5');
  assert.equal(v.line, '2 of 5 items turn on the retention bet — the plan forks there, and says so.');
});

/* ---------- deck: config key ---------- */

const withDeck = (deckLine, body) => (deckLine ? 'deck: ' + deckLine + '\n' : '') +
  'date: 2026-08-09\nhorizons: Now, Next, Later\nNOW\nCore: Foundation\nNEXT\n' +
  'Core: Retention engine [bet: retention]\nCore: Proactive nudges [if retention]\n' +
  'Core: Manual outreach [unless retention]\n' + (body || '');

test('deck: spread parses clean when the doc has an open bet with reach', () => {
  const m = parse(withDeck('spread'));
  assert.equal(m.deck, 'spread');
  assert.deepEqual(m.warnings, []);
});

test('deck: unknown value warns and is ignored', () => {
  const m = parse(withDeck('poster'));
  assert.equal(m.deck, null);
  assert.ok(m.warnings.some(w => w.includes('unknown deck "poster" — use spread')));   // snippet() supplies the quotes
});

test('deck: empty value is silently ignored (a stray colon is not a typo)', () => {
  const m = parse(withDeck(''));
  assert.equal(m.deck, null);
  assert.deepEqual(m.warnings, []);
});

test('deck: spread with no open fork warns and names the fallback style', () => {
  const m = parse('deck: spread\ndate: 2026-08-09\nNOW\nCore: Foundation\nNEXT\nCore: Something else');
  assert.equal(m.deck, 'spread');
  assert.ok(m.warnings.some(w =>
    w === 'deck: spread needs an open bet with conditional items — showing the board deck'));
});

test('deck: spread with no open fork names the ACTUAL effective style, not always "board"', () => {
  const m = parse('deck: spread\nstyle: register\ndate: 2026-08-09\nNOW\nCore: Foundation\nNEXT\nCore: Something else');
  assert.ok(m.warnings.some(w =>
    w === 'deck: spread needs an open bet with conditional items — showing the register deck'));
});

test('missing-colon hint recognises "deck" too', () => {
  const m = parse('deck spread\nNOW\nCore: item');
  assert.ok(m.warnings.some(w => w.includes('did you mean "deck:"? (missing colon)')));
});

test('a lane genuinely called "Deck" is eaten as config, same collision as group:/style:', () => {
  const m = parse('date: 2026-08-09\nNOW\nDeck: some item');
  assert.ok(m.warnings.some(w => w.includes('read as the deck: setting')));
});

/* ---------- spread trigger (renderDeck dispatch) ---------- */

function svgOf(model){ return renderDeck(model, ctx); }

test('no deck: key -> the ordinary style dispatch, untouched', () => {
  const m = parse(withDeck(null));
  const svg = svgOf(m);
  assert.ok(svg.includes('NOW'));   // the board's own horizon label
  assert.ok(!svg.includes('PAYS OFF'));
});

test('deck: spread with a bet but NO reach -> falls back to the style deck, not the spread body', () => {
  const m = parse('deck: spread\ndate: 2026-08-09\nNOW\nCore: Foundation\nNEXT\nCore: Something else');
  const svg = svgOf(m);
  assert.ok(svg.includes('NOW'));
  assert.ok(!svg.includes('PAYS OFF'));
});

test('deck: spread with an open, reachable bet -> the spread body renders', () => {
  const m = parse(withDeck('spread'));
  const svg = svgOf(m);
  assert.ok(svg.includes('IF RETENTION PAYS OFF'));
  assert.ok(svg.includes('EITHER WAY'));
  assert.ok(svg.includes("IF IT DOESN&#39;T"));
});

/* ---------- panel membership ---------- */

/* A single-bet fixture used by several membership checks below: bet `a`
   with an [if]/[unless] pair (LEFT/RIGHT), an unrelated open bet `b` whose
   own rider stays cond in BOTH of a's worlds (CENTRE, ghosted), a chained
   rider through b's OWN declaring item (CENTRE, plain — not ghosted, since
   its state genuinely differs between a's two worlds), a [done] item
   conditioned on a (excluded everywhere), and a [doing] item on the
   [unless a] side (RIGHT, keeps its pill). */
const spreadDoc = 'deck: spread\ndate: 2026-08-09\nhorizons: Now, Next, Later\nNOW\n' +
  'Core: Foundation plain\n' +                                              // CENTRE, plain (no cond at all)
  'Core: Bet A anchor [bet: a]\n' +                                         // CENTRE, plain (no cond of its own)
  'Core: A if-rider [if a]\n' +                                             // LEFT
  'Core: A unless-rider [doing] [unless a]\n' +                             // RIGHT, keeps [doing] pill
  'Core: Done under A [done] [if a]\n' +                                    // excluded everywhere
  'NEXT\n' +
  /* B's OWN declaring item is conditioned on A — the chained case: under
     A-won B's item is live (unresolved, cond.when=if returns null), under
     A-lost it's dropped (moot). A rider on B inherits that chain. */
  'Core: Bet B declares [bet: b] [if a]\n' +                                // LEFT (dropped only when a's answer is no)
  'Core: B unless-rider [unless b]\n' +                                     // CENTRE, plain (cond under a-won, live under a-lost)
  /* Bet C is a genuinely UNRELATED open bet — untouched by either of A's
     projections, so C stays unresolved (and a rider on it stays 'cond') in
     BOTH worlds. */
  'Core: Bet C declares [bet: c]\n' +                                       // CENTRE, plain
  'Core: C if-rider [if c]\n' +                                             // CENTRE, ghosted (cond in both)
  '';
const spreadModel = () => parse(spreadDoc);

test('the fixture actually has the shape this suite claims (fork picks bet a, reach > 0)', () => {
  const m = spreadModel();
  const entries = forkEntries(m);
  assert.equal(entries[0].name, 'a');
  assert.ok(entries[0].n > 0);
});

test('a plain [if]/[unless] pair on the spread bet lands LEFT/RIGHT respectively', () => {
  const svg = svgOf(spreadModel());
  const leftPanel = svg.slice(svg.indexOf('IF A PAYS OFF'), svg.indexOf('EITHER WAY'));
  const rightPanel = svg.slice(svg.indexOf("IF IT DOESN&#39;T"));
  assert.ok(leftPanel.includes('A if-rider'));
  assert.ok(rightPanel.includes('A unless-rider'));
  assert.ok(!leftPanel.includes('A unless-rider'));
  assert.ok(!rightPanel.includes('A if-rider'));
});

test("a rider on a second bet that is itself conditioned on the spread bet cascades LEFT " +
  "(B's own item is only dropped when A doesn't pay off)", () => {
  const svg = svgOf(spreadModel());
  const leftPanel = svg.slice(svg.indexOf('IF A PAYS OFF'), svg.indexOf('EITHER WAY'));
  assert.ok(leftPanel.includes('Bet B declares'));
});

test('a [doing] rider keeps its status pill wherever it lands', () => {
  const svg = svgOf(spreadModel());
  const rightPanel = svg.slice(svg.indexOf("IF IT DOESN&#39;T"));
  assert.ok(rightPanel.includes('A unless-rider'));
  assert.ok(rightPanel.includes('IN PROGRESS'));
});

test('a [done] item conditioned on the spread bet is excluded from every panel', () => {
  const svg = svgOf(spreadModel());
  assert.ok(!svg.includes('Done under A'));
});

test('a plain unconditional item, and a bet\'s own declaring item with no cond of its own, land CENTRE', () => {
  const svg = svgOf(spreadModel());
  const centrePanel = svg.slice(svg.indexOf('EITHER WAY'), svg.indexOf("IF IT DOESN&#39;T"));
  assert.ok(centrePanel.includes('Foundation plain'));
  assert.ok(centrePanel.includes('Bet A anchor'));
});

test('a rider on an UNRELATED open bet that stays cond under both of the spread bet\'s worlds ' +
  'lands CENTRE, ghosted with its own cond capsule', () => {
  const svg = svgOf(spreadModel());
  const centrePanel = svg.slice(svg.indexOf('EITHER WAY'), svg.indexOf("IF IT DOESN&#39;T"));
  assert.ok(centrePanel.includes('C if-rider'));
  assert.ok(centrePanel.includes('opacity="0.65"'));
  assert.ok(centrePanel.includes('if c'));   // the cond capsule label
});

test('[unless B] where B\'s OWN item is conditioned on the spread bet (cond under one world, ' +
  'live under the other) lands CENTRE, NOT ghosted — it genuinely differs, but stays in play both times', () => {
  const svg = svgOf(spreadModel());
  const centrePanel = svg.slice(svg.indexOf('EITHER WAY'), svg.indexOf("IF IT DOESN&#39;T"));
  assert.ok(centrePanel.includes('B unless-rider'));
  const idx = centrePanel.indexOf('B unless-rider');
  // walk back to the nearest opacity wrapper (if any) that would mark it ghosted —
  // there should be none for this item specifically (it renders as a bare <text>)
  const upto = centrePanel.slice(0, idx);
  const lastGhostOpen = upto.lastIndexOf('<g opacity="0.65">');
  const lastGhostClose = upto.lastIndexOf('</g>');
  assert.ok(lastGhostOpen === -1 || lastGhostOpen < lastGhostClose,
    'B unless-rider must not sit inside an open ghost <g>');
});

/* ---------- caps + "+n more" ---------- */

test('a crowded side panel caps and prints "+ n more"', () => {
  const many = Array.from({length: 30}, (_, i) => 'Core: If rider number ' + i + ' [if a]').join('\n');
  const m = parse('deck: spread\ndate: 2026-08-09\nNOW\nCore: Bet A [bet: a]\n' + many);
  const svg = svgOf(m);
  const leftPanel = svg.slice(svg.indexOf('IF A PAYS OFF'), svg.indexOf('EITHER WAY'));
  assert.match(leftPanel, /\+ \d+ more/);
});

test('an empty side panel keeps the panel and shows the ghost text', () => {
  const m = parse('deck: spread\ndate: 2026-08-09\nNOW\nCore: Bet A [bet: a]\nCore: A if-rider [if a]');
  const svg = svgOf(m);
  const rightPanel = svg.slice(svg.indexOf("IF IT DOESN&#39;T"));
  assert.ok(rightPanel.includes('nothing new starts'));
});

/* ---------- the reading line ---------- */

test('the reading line reuses forkEntries()[0].n and the full item count, forkTier\'s own numbers', () => {
  const m = spreadModel();
  const entries = forkEntries(m);
  const svg = svgOf(m);
  assert.ok(svg.includes('The a answer decides ' + entries[0].n + ' of ' + m.items.length + ' items.'));
});

/* ---------- deckFrame gets the FULL model, never a presentation strip ---------- */

test('deckFrame metrics describe the WHOLE model even with more horizons than the presentation strip shows', () => {
  const m = parse('deck: spread\ndate: 2026-08-09\nhorizons: H1,H2,H3,H4,H5\nH1\nCore: Bet A [bet: a]\n' +
    'Core: A if-rider [if a]\nCore: A unless-rider [unless a]');
  const svg = svgOf(m);
  assert.ok(svg.includes(m.items.length + ' items'));
  assert.ok(svg.includes(m.horizons.length + ' horizons'));   // all 5, never the 3-horizon strip
});
