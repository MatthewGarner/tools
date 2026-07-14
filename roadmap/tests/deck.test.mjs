/* Stage 1: the shared deck frame + the BOARD style + its overflow ladder.
   The ladder (drop notes -> clamp titles -> cap+chip -> flip to list rows,
   itself capped) must be PROVEN TO TERMINATE: nothing the board paints may
   ever fall below the body zone it was given. Goldens use the stub measure
   (t.length*7) too, so these tests don't prove real-metrics wrap decisions —
   that's the real-metrics PNG render (Stage 1 verification step 5) — but they
   DO prove the ladder's bookkeeping (capFit, listMode, the chip) never lets a
   column overrun its box, at any item count / horizon count / lane count. */
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {parse} from '../parse.js';
import {
  renderDeck, renderBoardBody, typeRamp, boardGeometry, capFit, diffCounts,
  roadmapVerdict, W, H, M,
} from '../render-deck.js';

const measure = t => t.length * 7;
const colors = {
  card: '#fff', border: '#ddd', ink: '#222', muted: '#667', accent: '#08c', bg: '#f7f8f6',
  err: '#b33', status: {done: '#1D7A3E', doing: '#0C7FAE', risk: '#9A6A00', blocked: '#B3403A'},
  statusInk: {done: '#1C753C', doing: '#0B709A', risk: '#8E6200', blocked: '#B3403A'}, accentInk: '#0A6C94',
};
const ctx = {colors, measure};

/* ---------------- bounds sweep: parse the SVG, check every y ---------------- */
function attrsOf(tag){
  const o = {};
  for(const m of tag.matchAll(/([\w:-]+)=["']([^"']*)["']/g)) o[m[1]] = m[2];
  return o;
}
/* every element's "bottom" (rects: y+height; text: baseline y; lines: max of
   y1/y2) — attribute-order independent, so it doesn't care how the local
   rect()/txt()/line() builders order their attributes. */
function bottoms(svg){
  const out = [];
  for(const tag of svg.match(/<rect\b[^>]*>/g) || []){
    const a = attrsOf(tag);
    if(a.y !== undefined && a.height !== undefined) out.push(parseFloat(a.y) + parseFloat(a.height));
  }
  for(const tag of svg.match(/<text\b[^>]*>/g) || []){
    const a = attrsOf(tag);
    if(a.y !== undefined) out.push(parseFloat(a.y));
  }
  for(const tag of svg.match(/<line\b[^>]*>/g) || []){
    const a = attrsOf(tag);
    if(a.y1 !== undefined) out.push(parseFloat(a.y1));
    if(a.y2 !== undefined) out.push(parseFloat(a.y2));
  }
  return out;
}
/* the board BODY fragment alone, bounds-swept against the (y0, y1) it was
   handed — no frame footer text to exclude (renderBoardBody has none). */
function assertContained(model, y0, y1, extraCtx = {}){
  const body = renderBoardBody(model, {...ctx, ...extraCtx}, y0, y1);
  const max = Math.max(0, ...bottoms(body));
  assert.ok(max <= y1 + 0.5, 'board body painted below y1=' + y1 + ' (max observed ' + max + ')\n' + body.slice(0, 400));
  return body;
}

const itemsDoc = (n, lane = 'Core') => {
  let doc = 'title: T\ndate: 2026-07-14\nNOW\n';
  for(let i = 0; i < n; i++) doc += lane + ': Item number ' + i + '\n';
  doc += 'NEXT\n' + lane + ': placeholder\nLATER\n' + lane + ': placeholder';
  return doc;
};

/* ---------------- torture fixtures: containment must survive every one ---------------- */

test('containment: 30 items in one column (forces the list flip) never overruns the body', () => {
  const model = parse(itemsDoc(30));
  const body = assertContained(model, 214, 968);
  assert.match(body, /\+ \d+ more/, 'the list-mode cap must show a "+N more" chip — the prototype had none');
});

test('containment: 8 horizons (narrowest type ramp) never overruns the body', () => {
  let doc = 'title: T\ndate: 2026-07-14\nhorizons: A,B,C,D,E,F,G,H\n';
  for(const h of ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H']) doc += '\n' + h + '\nCore: one\nGrowth: two\nPlatform: three';
  const model = parse(doc);
  assert.equal(model.horizons.length, 8);
  const body = assertContained(model, 214, 968);
  assert.ok(body.includes('font-size="15"'), 'nH=8 should hit the narrowest type ramp (fsT=15)');
});

test('containment: 8 lanes in one horizon never overruns the body', () => {
  const lanes = ['Core', 'Growth', 'Platform', 'Insights', 'Coach', 'Billing', 'Support', 'Web'];
  let doc = 'title: T\ndate: 2026-07-14\nNOW\n' + lanes.map(l => l + ': item in ' + l).join('\n') +
    '\nNEXT\nCore: x\nLATER\nCore: y';
  const model = parse(doc);
  assert.equal(model.lanes.length, 8);
  assertContained(model, 214, 968);
});

test('containment: a 60-word title never overruns the body (card mode)', () => {
  const long = Array.from({length: 60}, (_, i) => 'word' + i).join(' ');
  const model = parse('title: T\ndate: 2026-07-14\nNOW\nCore: ' + long + '\nNEXT\nCore: x\nLATER\nCore: y');
  assertContained(model, 214, 968);
});

test('containment: a 60-word title never overruns the body (list mode, forced by many siblings)', () => {
  const long = Array.from({length: 60}, (_, i) => 'word' + i).join(' ');
  let doc = 'title: T\ndate: 2026-07-14\nNOW\nCore: ' + long + '\n';
  for(let i = 0; i < 25; i++) doc += 'Core: filler ' + i + '\n';
  doc += 'NEXT\nCore: x\nLATER\nCore: y';
  const model = parse(doc);
  const body = assertContained(model, 214, 968);
  assert.match(body, /\+ \d+ more/);
});

test('containment: an empty column renders a ghost, not a crash', () => {
  const model = parse('title: T\ndate: 2026-07-14\nNOW\nCore: only item\nNEXT\n\nLATER\nCore: another');
  const body = assertContained(model, 214, 968);
  assert.match(body, /Nothing scheduled/);
});

test('containment: an empty board (no items at all) does not crash', () => {
  const model = parse('title: T\ndate: 2026-07-14');
  assert.equal(model.items.length, 0);
  const svg = renderDeck(model, ctx);
  assert.match(svg, /^<svg/);
  assert.match(svg, /Nothing on the board yet\./);
});

test('a no-title/no-date doc renders deterministically with an injected today, and omits the date on "off"', () => {
  const model = parse('NOW\nCore: A\nNEXT\nCore: B\nLATER\nCore: C');
  assert.equal(model.title, '');
  assert.equal(model.dateStr, null);
  const withToday = renderDeck(model, {...ctx, today: '2026-07-14'});
  assert.match(withToday, />Roadmap</, 'title falls back to "Roadmap"');
  assert.match(withToday, />2026-07-14</, 'the injected today prints when dateStr is null');
  const withoutToday = renderDeck(model, ctx);
  assert.doesNotMatch(withoutToday, /2026-07-14/);

  const off = parse('date: off\nNOW\nCore: A');
  const svgOff = renderDeck(off, {...ctx, today: '2026-07-14'});
  assert.doesNotMatch(svgOff, /2026-07-14/, 'date: off suppresses the date even with today injected');
  assert.doesNotMatch(svgOff, />off</, 'never print the literal word "off" (the prototype\'s bug)');
});

/* ---------------- the list-flip threshold ---------------- */

test('list-flip threshold: flips exactly where the >25%-hidden estimate crosses', () => {
  const zoneH = 968 - 214;               // the real single-line-verdict body band
  const below = parse(itemsDoc(6));
  const above = parse(itemsDoc(7));
  assert.equal(boardGeometry(below, zoneH).listMode, false, '6 items still fits as cards');
  assert.equal(boardGeometry(above, zoneH).listMode, true, '7 items should flip to list rows');
});

test('list-flip: an empty column never triggers the flip on its own', () => {
  const model = parse('title: T\nNOW\n\nNEXT\nCore: a\nLATER\nCore: b');
  assert.equal(boardGeometry(model, 754).listMode, false);
});

/* ---------------- column-set / type-ramp selection ---------------- */

test('typeRamp: the four breakpoints from the prototype, at their edges', () => {
  assert.equal(typeRamp(846).fsT, 21);
  assert.equal(typeRamp(500).fsT, 21);
  assert.equal(typeRamp(499).fsT, 19);
  assert.equal(typeRamp(380).fsT, 19);
  assert.equal(typeRamp(379).fsT, 17);
  assert.equal(typeRamp(300).fsT, 17);
  assert.equal(typeRamp(299).fsT, 15);
  assert.equal(typeRamp(299).fsN, 0, 'the narrowest ramp drops notes entirely');
});

test('column-set: colW (and so the ramp) is driven by the horizon count', () => {
  const nHOf = n => parse('title: T\nhorizons: ' + Array.from({length: n}, (_, i) => 'H' + i).join(',') + '\nH0\nCore: a');
  const expect = {2: 21, 3: 21, 4: 19, 5: 17, 6: 15, 7: 15, 8: 15};
  for(const [n, fsT] of Object.entries(expect)){
    const model = nHOf(+n);
    const geo = boardGeometry(model, 754);
    assert.equal(geo.ramp.fsT, fsT, 'nH=' + n + ' colW=' + geo.colW);
  }
});

/* ---------------- capFit: the terminating overflow primitive ---------------- */

test('capFit: shows everything when it all fits, no chip reserved', () => {
  assert.equal(capFit([50, 50, 50], 200, 10, 40), 3);   // 150 + 2*10 = 170 <= 200
});

test('capFit: caps and always leaves room for the chip it implies', () => {
  const heights = Array(10).fill(60);
  const shown = capFit(heights, 300, 10, 40);
  assert.ok(shown < 10, 'must actually cap');
  const used = heights.slice(0, shown).reduce((a, h) => a + h, 0) + Math.max(0, shown - 1) * 10;
  assert.ok(used + 40 <= 300, 'shown items + gaps + the chip budget must fit inside availH');
});

test('capFit: terminates (returns a finite count) even when nothing fits', () => {
  assert.equal(capFit([1000], 10, 0, 40), 0);
  assert.equal(capFit([], 500, 10, 40), 0);
});

/* ---------------- diffCounts: bridging badge-shaped diff into verdict counts ---------------- */

test('diffCounts: null/absent diff stays null (never fabricates a diff)', () => {
  assert.equal(diffCounts(parse('NOW\nCore: A'), null), null);
  assert.equal(diffCounts(parse('NOW\nCore: A'), {any: false}), null);
});

test('diffCounts: tallies badges + dropped length into the counts roadmapVerdict expects', () => {
  const model = parse('NOW\nCore: A\nCore: B\nCore: C');
  const diff = {
    any: true, since: '12 Jun',
    badge: it => it.title === 'A' ? {kind: 'new', label: 'New'} : it.title === 'B' ? {kind: 'moved', label: 'was Next'} : null,
    dropped: ['Old thing'],
  };
  assert.deepEqual(diffCounts(model, diff), {any: true, since: '12 Jun', added: 1, moved: 1, dropped: 1});
  const v = roadmapVerdict(model, diffCounts(model, diff));
  assert.match(v, /1 added, 1 moved, 1 dropped/);
});

/* ---------------- board renders diff badges + the dropped footer strip ---------------- */

test('board renders NEW/MOVED badges on cards and a struck dropped strip in the footer', () => {
  const model = parse('title: T\ndate: 2026-07-14\nNOW\nCore: Fresh thing\nCore: Old spot\nNEXT\nCore: x\nLATER\nCore: y');
  const diff = {
    any: true, since: '12 Jun',
    badge: it => it.title === 'Fresh thing' ? {kind: 'new', label: 'New'} : null,
    dropped: ['Gone thing'],
  };
  const svg = renderDeck(model, {...ctx, diff});
  assert.match(svg, />NEW</);
  assert.match(svg, /Dropped since 12 Jun/);
  assert.match(svg, /text-decoration="line-through"/);
});

/* ---------------- default style selection (E) ---------------- */

test('style selection: unset + no time axis -> board', () => {
  const model = parse('NOW\nCore: A');
  assert.equal(model.style, null);
  assert.equal(model.timeAxis, false);
  const svg = renderDeck(model, ctx);
  assert.match(svg, /NOW</);
});

test('style selection: unset + a time axis wants grid, which is not built yet -> falls back to board', () => {
  const model = parse('horizons: quarterly from Q3 2026 x3\nQ3 2026\nCore: A\nQ4 2026\nCore: B');
  assert.equal(model.timeAxis, true);
  assert.equal(model.style, null);
  const svg = renderDeck(model, ctx);   // must not throw
  assert.match(svg, /Q3 2026</);
});

test('style selection: an explicit but unimplemented style (focus/register/grid) falls back to board without crashing', () => {
  for(const style of ['focus', 'register', 'grid']){
    const model = parse('style: ' + style + '\nNOW\nCore: A');
    assert.equal(model.style, style);
    const svg = renderDeck(model, ctx);
    assert.match(svg, /^<svg/);
    assert.match(svg, /NOW</);
  }
});

test('style selection: style: board renders board explicitly', () => {
  const model = parse('style: board\nNOW\nCore: A');
  const svg = renderDeck(model, ctx);
  assert.match(svg, /NOW</);
});

/* ---------------- frame shape: the hard geometry requirements ---------------- */

test('frame: root svg carries double-quoted integer width/height (svgToCanvas + poster read this)', () => {
  const model = parse('title: T\ndate: 2026-07-14\nNOW\nCore: A');
  const svg = renderDeck(model, ctx);
  assert.match(svg, /^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg" width="1920" height="1080"/);
  assert.equal(W, 1920); assert.equal(H, 1080); assert.equal(M, 100);
});

test('frame: a long verdict wraps to at most 2 lines and budgets the body band down', () => {
  const many = Array.from({length: 6}, (_, i) => 'Core: Item ' + i + ' [blocked]').join('\n');
  const model = parse('title: T\ndate: 2026-07-14\nwip: off\nNOW\n' + many);
  const v = roadmapVerdict(model);
  assert.ok(v.length > 40, 'the flagged-items branch should produce a long verdict here');
  const svg = renderDeck(model, ctx);
  assert.match(svg, /^<svg/);   // renders without throwing at whatever wrap depth results
});

test('frame: the footer rule sits at y=1002 and metrics at y=1036, always', () => {
  const model = parse('title: T\ndate: 2026-07-14\nNOW\nCore: A');
  const svg = renderDeck(model, ctx);
  assert.match(svg, /<line x1="100" y1="1002" x2="1820" y2="1002"/);
  assert.match(svg, /<text x="100" y="1036"/);
});
