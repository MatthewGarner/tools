/* Stage 1: the shared deck frame + the BOARD style + its overflow ladder.
   Stage 2/3: REGISTER (formal table), FOCUS (hero + ranked rail), GRID
   (the existing chart, scaled to fit) — same containment discipline: every
   style's overflow ladder must be PROVEN TO TERMINATE, nothing painted may
   ever fall below the body zone it was given. Goldens use the stub measure
   (t.length*7) too, so these tests don't prove real-metrics wrap decisions —
   that's the real-metrics PNG render (verification step 5) — but they DO
   prove the ladder's bookkeeping (capFit, listMode, the chip) never lets a
   column/row/card overrun its box, at any item/horizon/lane count. */
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {parse} from '../parse.js';
import {
  renderDeck, renderBoardBody, typeRamp, boardGeometry, capFit, diffCounts,
  roadmapVerdict, W, H, M,
  renderRegisterBody, registerColumns,
  renderFocusBody, focusHeroIndex, focusColumnCount,
  renderGridBody, gridFit,
} from '../render-deck.js';

const INNER = W - M * 2;

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

test('style selection: unset + a time axis wants grid, which IS built now -> renders the embedded chart, not board columns', () => {
  const model = parse('horizons: quarterly from Q3 2026 x3\nQ3 2026\nCore: A\nQ4 2026\nCore: B');
  assert.equal(model.timeAxis, true);
  assert.equal(model.style, null);
  const svg = renderDeck(model, ctx);   // must not throw
  assert.match(svg, /Q3 2026</);
  assert.match(svg, /<svg[^>]*\sx="/, 'grid embeds the inner chart as a nested <svg x=...> element');
});

test('style selection: register/focus/grid are all built now — each renders its own distinct structure, not board', () => {
  const register = renderDeck(parse('style: register\nNOW\nCore: A'), ctx);
  assert.match(register, /^<svg/);
  assert.match(register, />ITEM</, 'register prints its own column headers');
  assert.doesNotMatch(register, /Nothing scheduled/, 'not board\'s empty-column ghost copy');

  const focus = renderDeck(parse('style: focus\nNOW\nCore: A'), ctx);
  assert.match(focus, /^<svg/);
  assert.match(focus, />NOW</);
  assert.doesNotMatch(focus, />ITEM</, 'not register\'s table header');

  const grid = renderDeck(parse('style: grid\nNOW\nCore: A'), ctx);
  assert.match(grid, /^<svg/);
  assert.match(grid, /<svg[^>]*\sx="/, 'grid embeds the inner chart as a nested <svg x=...> element');
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

/* generic bounds-sweep for a style's BODY-only fragment, given the (y0, y1)
   it was handed — reuses the board section's bottoms()/attrsOf() above,
   which parse by attribute name, not by which style built the tag. */
function assertBodyContained(renderFn, model, y0, y1, extraCtx = {}, label = ''){
  const body = renderFn(model, {...ctx, ...extraCtx}, y0, y1);
  const max = Math.max(0, ...bottoms(body));
  assert.ok(max <= y1 + 0.5, (label || 'body') + ' painted below y1=' + y1 + ' (max observed ' + max + ')\n' + body.slice(0, 400));
  return body;
}

/* ==================================================================
   REGISTER — the roadmap as a formal table
   ================================================================== */

const regDoc = (n, lane = 'Core') => {
  let doc = 'title: T\ndate: 2026-07-14\nNOW\n';
  for(let i = 0; i < n; i++) doc += lane + ': Item number ' + i + '\n';
  doc += 'NEXT\n' + lane + ': placeholder\nLATER\n' + lane + ': placeholder';
  return doc;
};

test('register containment: 30 rows in one horizon never overruns the body', () => {
  const model = parse(regDoc(30));
  const body = assertBodyContained(renderRegisterBody, model, 214, 968, {}, 'register');
  assert.match(body, /\+ \d+ more/, 'the row cap must show a "+N more" chip');
});

test('register containment: 8 horizons (ditto-suppression cycles 8x) never overruns the body', () => {
  let doc = 'title: T\ndate: 2026-07-14\nhorizons: A,B,C,D,E,F,G,H\n';
  for(const h of ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H']) doc += '\n' + h + '\nCore: one\nGrowth: two\nPlatform: three';
  const model = parse(doc);
  assert.equal(model.horizons.length, 8);
  assertBodyContained(renderRegisterBody, model, 214, 968, {}, 'register 8-horizon');
});

test('register containment: 8 lanes in one horizon never overruns the body', () => {
  const lanes = ['Core', 'Growth', 'Platform', 'Insights', 'Coach', 'Billing', 'Support', 'Web'];
  const doc = 'title: T\ndate: 2026-07-14\nNOW\n' + lanes.map(l => l + ': item in ' + l).join('\n') +
    '\nNEXT\nCore: x\nLATER\nCore: y';
  const model = parse(doc);
  assert.equal(model.lanes.length, 8);
  assertBodyContained(renderRegisterBody, model, 214, 968, {}, 'register 8-lane');
});

test('register containment: a 60-word title never overruns the body', () => {
  const long = Array.from({length: 60}, (_, i) => 'word' + i).join(' ');
  const model = parse('title: T\ndate: 2026-07-14\nNOW\nCore: ' + long + '\nNEXT\nCore: x\nLATER\nCore: y');
  assertBodyContained(renderRegisterBody, model, 214, 968, {}, 'register 60-word title');
});

test('register containment: 15 dropped rows are CAPPED, not left unbounded (the prototype\'s bug)', () => {
  /* a busy live table (forces its OWN row cap too) so the dropped section is
     genuinely fighting for space, not just idly rendering into a mostly-
     empty page — the scenario the prototype's unbounded dropped list broke. */
  const model = parse(regDoc(20));
  const dropped = Array.from({length: 15}, (_, i) => 'Old thing number ' + i);
  const diff = {any: true, since: '12 Jun', badge: () => null, dropped};
  const body = assertBodyContained(renderRegisterBody, model, 214, 968, {diff}, 'register w/ 15 dropped');
  assert.match(body, /DROPPED SINCE 12 JUN/);
  assert.match(body, /\+ \d+ more dropped/, '15 dropped rows must be capped with a chip once the live table is busy too');
});

test('register containment: 15 dropped rows never overrun the body even against a SPARSE live table (plenty of natural room, no cap needed)', () => {
  const model = parse('title: T\ndate: 2026-07-14\nNOW\nCore: A\nNEXT\nCore: B\nLATER\nCore: C');
  const dropped = Array.from({length: 15}, (_, i) => 'Old thing number ' + i);
  const diff = {any: true, since: '12 Jun', badge: () => null, dropped};
  const body = assertBodyContained(renderRegisterBody, model, 214, 968, {diff}, 'register sparse + 15 dropped');
  assert.match(body, /Old thing number 14/, 'plenty of room here, so all 15 can show uncapped — containment is what matters');
});

test('register containment: an empty register (0 items, no diff) does not crash', () => {
  const model = parse('title: T\ndate: 2026-07-14');
  const body = assertBodyContained(renderRegisterBody, model, 214, 968, {}, 'empty register');
  assert.match(body, /Nothing on the register yet/);
});

test('register column-set: a full-featured doc keeps all 5 columns, in order', () => {
  const model = parse('title: T\nNOW\nCore: A [doing] -- a note');
  const cols = registerColumns(model);
  assert.deepEqual(cols.map(c => c.key), ['item', 'lane', 'horizon', 'status', 'note']);
});

test('register column-set: a laneless doc drops LANE and redistributes its width', () => {
  const model = parse('title: T\nNOW\nplain item [doing] -- note');
  const cols = registerColumns(model);
  assert.ok(!cols.some(c => c.key === 'lane'), 'a laneless doc has no LANE column');
  const total = cols.reduce((a, c) => a + c.w, 0);
  assert.ok(Math.abs(total - INNER) < 0.5, 'the dropped column\'s width is redistributed, not lost');
});

test('register column-set: a doc with no statuses drops STATUS; a doc with no notes drops NOTE', () => {
  const noStatus = parse('title: T\nNOW\nCore: A -- has a note');
  assert.ok(!registerColumns(noStatus).some(c => c.key === 'status'));
  const noNote = parse('title: T\nNOW\nCore: A [doing]');
  assert.ok(!registerColumns(noNote).some(c => c.key === 'note'));
});

test('register column-set: item is ALWAYS present, even in the barest doc', () => {
  const model = parse('title: T\nNOW\nplain item');
  const cols = registerColumns(model);
  assert.equal(cols[0].key, 'item');
  assert.equal(cols.length, 2, 'only item + horizon survive with no lane/status/note');
});

test('register rows: horizon is ditto-suppressed within a group', () => {
  const doc = 'title: T\nNOW\nGrowth: G-item\nCore: C-item\nNEXT\nCore: N-item';
  const model = parse(doc);
  const body = renderRegisterBody(model, ctx, 214, 968);
  const nowCount = (body.match(/>Now</g) || []).length;
  assert.equal(nowCount, 1, 'the 2nd row in the Now group must NOT repeat the horizon label');
  assert.match(body, />Next</);
});

test('register diff: a NEW item gets a capsule after its title; a moved item gets an italic "was X" in the horizon cell', () => {
  const model = parse('title: T\ndate: 2026-07-14\nNOW\nCore: Fresh thing\nCore: Moved thing\nNEXT\nCore: x\nLATER\nCore: y');
  const diff = {
    any: true, since: '12 Jun',
    badge: it => it.title === 'Fresh thing' ? {kind: 'new', label: 'New'} :
                 it.title === 'Moved thing' ? {kind: 'moved', label: 'was Next'} : null,
    dropped: [],
  };
  const body = renderRegisterBody(model, {...ctx, diff}, 214, 968);
  assert.match(body, />NEW</);
  assert.match(body, /font-style="italic"[^>]*>was Next</);
});

test('register: at-risk rows are washed, blocked rows washed harder (a distinct, stronger fill)', () => {
  const model = parse('title: T\nNOW\nCore: risky [risk]\nCore: stuck [blocked]\nCore: fine\nNEXT\nCore: x\nLATER\nCore: y');
  const body = renderRegisterBody(model, ctx, 214, 968);
  assert.match(body, /fill="#9A6A001F"/, 'at-risk wash is the standard 12% tint');
  assert.match(body, /fill="#B3403A33"/, 'blocked wash is stronger than the at-risk tint');
});

/* ==================================================================
   FOCUS — attention-weighted
   ================================================================== */

test('focus hero selection: an empty first horizon does not crash and picks the first NON-EMPTY one (the prototype crashed on hs[-1])', () => {
  const model = parse('title: T\nNOW\n\nNEXT\nCore: A\nLATER\nCore: B');
  assert.equal(focusHeroIndex(model), 1, 'Now is empty, so Next (index 1) is the hero');
  const body = assertBodyContained(renderFocusBody, model, 214, 968, {}, 'focus w/ empty first horizon');
  assert.match(body, />NEXT</);
  assert.doesNotMatch(body, /Nothing scheduled/, 'the hero itself (Next) has an item, so no empty-hero ghost');
});

test('focus hero selection: an entirely empty board falls back to horizon 0, not a crash', () => {
  const model = parse('title: T\ndate: 2026-07-14');
  assert.equal(model.items.length, 0);
  assert.equal(focusHeroIndex(model), 0);
  const body = assertBodyContained(renderFocusBody, model, 214, 968, {}, 'focus w/ empty board');
  assert.match(body, /Nothing scheduled/);
});

test('focus column threshold: 1 column at <=5 items, 2 columns at >=6', () => {
  assert.equal(focusColumnCount(1), 1);
  assert.equal(focusColumnCount(5), 1);
  assert.equal(focusColumnCount(6), 2);
  assert.equal(focusColumnCount(12), 2);
});

test('focus: WIP breach on the hero (horizon 0) prints "N — OVER WIP W" at the wash edge', () => {
  const items = Array.from({length: 8}, (_, i) => 'Core: Item ' + i).join('\n');
  const model = parse('title: T\ndate: 2026-07-14\nwip: 6\nNOW\n' + items);
  const body = renderFocusBody(model, ctx, 214, 968);
  assert.match(body, />8 — OVER WIP 6</);
});

test('focus containment: an over-WIP 8-item hero (2-column, row-pair equalised) never overruns the body', () => {
  const items = Array.from({length: 8}, (_, i) =>
    'Core: Item number ' + i + (i % 3 === 0 ? ' -- a short note' : '')).join('\n');
  const model = parse('title: T\ndate: 2026-07-14\nwip: 6\nNOW\n' + items + '\nNEXT\nCore: x\nLATER\nCore: y');
  const body = assertBodyContained(renderFocusBody, model, 214, 968, {}, 'focus 8-item hero');
  assert.match(body, /fill="#0[89a-fA-F][0-9a-fA-F]*0D"/, 'the accent wash should be present');
});

test('focus containment: 30 items in the hero (forces the overflow chip) never overruns the body', () => {
  const items = Array.from({length: 30}, (_, i) => 'Core: Item number ' + i).join('\n');
  const model = parse('title: T\ndate: 2026-07-14\nwip: off\nNOW\n' + items + '\nNEXT\nCore: x\nLATER\nCore: y');
  const body = assertBodyContained(renderFocusBody, model, 214, 968, {}, 'focus 30-item hero');
  assert.match(body, /\+ \d+ more in Now/, 'the overflow chip must name the horizon');
});

test('focus containment: 8 horizons (a deep rail, certainty-faded) never overruns the body', () => {
  let doc = 'title: T\ndate: 2026-07-14\nhorizons: A,B,C,D,E,F,G,H\n';
  for(const h of ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H']) doc += '\n' + h + '\nCore: one\nGrowth: two';
  const model = parse(doc);
  assertBodyContained(renderFocusBody, model, 214, 968, {}, 'focus 8 horizons');
});

test('focus containment: a 60-word title never overruns the body (hero card)', () => {
  const long = Array.from({length: 60}, (_, i) => 'word' + i).join(' ');
  const model = parse('title: T\ndate: 2026-07-14\nNOW\nCore: ' + long + '\nNEXT\nCore: x\nLATER\nCore: y');
  assertBodyContained(renderFocusBody, model, 214, 968, {}, 'focus 60-word title');
});

test('focus rail: certainty fade only applies when model.fade is on', () => {
  const doc = 'title: T\ndate: 2026-07-14\nNOW\nCore: hero item\nNEXT\nCore: rail item';
  const faded = renderFocusBody(parse(doc), ctx, 214, 968);
  const fadedOps = [...faded.matchAll(/<g opacity="([\d.]+)">/g)].map(m => +m[1]);
  assert.ok(fadedOps.some(o => o < 1), 'fade on: at least one rail row should be faded below 1');

  const unfaded = renderFocusBody(parse('fade: off\n' + doc), ctx, 214, 968);
  const unfadedOps = [...unfaded.matchAll(/<g opacity="([\d.]+)">/g)].map(m => +m[1]);
  assert.ok(unfadedOps.length > 0 && unfadedOps.every(o => o === 1), 'fade off: no rail row should be faded');
});

/* ==================================================================
   GRID — the existing chart, scaled to fit
   ================================================================== */

test('gridFit: fits without scaling up past 1x when the chart already fits', () => {
  const fit = gridFit(800, 400, 1720, 754);
  assert.equal(fit.scale, 1);
  assert.equal(fit.x, (1720 - 800) / 2);
  assert.equal(fit.y, (754 - 400) / 2);
});

test('gridFit: scales DOWN to the binding dimension (width- or height-bound)', () => {
  const wide = gridFit(3440, 754, 1720, 754);    // 2x too wide -> width-bound
  assert.equal(wide.scale, 0.5);
  const tall = gridFit(1720, 1508, 1720, 754);   // 2x too tall -> height-bound
  assert.equal(tall.scale, 0.5);
});

test('gridFit: centres the scaled box inside the target box', () => {
  const fit = gridFit(1000, 500, 1720, 754);
  assert.equal(fit.x, (1720 - 1000 * fit.scale) / 2);
  assert.equal(fit.y, (754 - 500 * fit.scale) / 2);
});

function gridNestedBox(svg){
  const m = svg.match(/<svg\s+x="([-\d.]+)"\s+y="([-\d.]+)"\s+width="([\d.]+)"\s+height="([\d.]+)"/);
  assert.ok(m, 'grid body must be a single nested <svg x y width height> element');
  return {x: +m[1], y: +m[2], w: +m[3], h: +m[4]};
}

test('grid: scale-and-centre keeps the nested chart within the body band, at torture sizes', () => {
  const cases = [
    'horizons: quarterly from Q3 2026 x8\nQ3 2026\nCore: A\nQ4 2026\nCore: B',   // 8 horizons
    'NOW\n' + ['Core', 'Growth', 'Platform', 'Insights', 'Coach', 'Billing', 'Support', 'Web']
      .map(l => l + ': item').join('\n'),                                       // 8 lanes
  ];
  for(const doc of cases){
    const model = parse('title: T\ndate: 2026-07-14\n' + doc);
    const y0 = 214, y1 = 968;
    const body = renderGridBody(model, ctx, y0, y1);
    const box = gridNestedBox(body);
    assert.ok(box.x >= M - 0.5 && box.x + box.w <= (W - M) + 0.5, 'nested chart overruns horizontally: ' + JSON.stringify(box));
    assert.ok(box.y >= y0 - 0.5 && box.y + box.h <= y1 + 0.5, 'nested chart overruns vertically: ' + JSON.stringify(box));
  }
});

test('grid suppresses the inner chart\'s title and date — neither double-prints', () => {
  const model = parse('title: Unique Grid Title\ndate: 2026-07-14\nNOW\nCore: A');
  const svg = renderDeck({...model, style: 'grid'}, ctx);
  const titleHits = (svg.match(/Unique Grid Title/g) || []).length;
  assert.equal(titleHits, 1, 'the deck frame prints the title once; the inner chart must not print it again');
  const dateHits = (svg.match(/2026-07-14/g) || []).length;
  assert.equal(dateHits, 1, 'the deck frame prints the date once; the inner chart must not print it again');
});

test('grid: default style for a time-axis doc embeds the chart (no explicit style: needed)', () => {
  const model = parse('horizons: monthly from Jul 2026 x4\nJul 2026\nCore: A\nAug 2026\nCore: B');
  assert.equal(model.timeAxis, true);
  const svg = renderDeck(model, ctx);
  assert.match(svg, /<svg[^>]*\sx="/);
});

test('grid containment: an empty board does not crash', () => {
  const model = parse('title: T\ndate: 2026-07-14\nstyle: grid');
  const svg = renderDeck(model, ctx);
  assert.match(svg, /^<svg/);
});
