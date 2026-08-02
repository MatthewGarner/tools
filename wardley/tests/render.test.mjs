import {test} from 'node:test';
import assert from 'node:assert/strict';
import {parse} from '../parse.js';
import {layoutMap} from '../layout.js';
import {renderMap, toMarkdown} from '../render.js';

const ctx = {
  colors: {card: '#fff', border: '#ddd', ink: '#222', muted: '#667', accent: '#08c',
    bg: '#f7f8f6', err: '#b33',
    status: {done: '#1D7A3E', doing: '#0C7FAE', risk: '#9A6A00', blocked: '#B3403A'}},
  palette: ['#4C8DAE', '#5E9E6F', '#B5885A', '#8B7BB8'],
  measure: t => t.length * 7,
};

const SRC = `title: Habitat platform
anchor: Habit tracking
Streak engine @ custom
User DB @ 0.83
Push gateway
Habit tracking -> Streak engine -> User DB
Streak engine -> Push gateway`;

const draw = (src = SRC, opts = {}, c = ctx) => {
  const m = parse(src);
  return renderMap(m, layoutMap(m), c, opts);
};

/* minimal wellformedness: every attribute is quoted and balanced, no bare
   attributes. Same tag grammar as dev/svg-wellformed.test.mjs — EITHER quote
   character is XML-legal, and the shared verdict block (assets/verdict.js)
   emits single-quoted values so it can splice into any renderer's convention. */
const TAG = /^<[a-zA-Z][\w:-]*((\s+[\w:-]+=("[^"<]*"|'[^'<]*'))*)\s*\/?>$/;
function wellFormed(svg){
  for(const m of svg.matchAll(/<[a-zA-Z][^>]*>/g))
    assert.match(m[0], TAG, 'bare or malformed attribute in ' + m[0]);
}

/* Swiss 6c: the plane is FLAT — hairline stage boundaries, stage names under
   the axis as its tick labels, and the value chain named in-plane by
   VISIBLE ↑ / INVISIBLE. The four tinted terrain washes are gone. */
test('board: flat plane, stage labels under the axis, axis micros, metrics, readout', () => {
  const s = draw();
  assert.match(s, /^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg" width="1200"/);
  assert.ok(s.includes('Habitat platform'));
  assert.ok(s.includes('3 components'));                  // header metrics line
  assert.equal((s.match(/fill="[^"]{7}14"/g) || []).length, 0, 'no terrain washes left');
  /* every stage name is a centred uppercase micro with ABSOLUTE tracking */
  for(const w of ['GENESIS', 'CUSTOM', 'PRODUCT', 'COMMODITY'])
    assert.match(s, new RegExp('text-anchor="middle" font-weight="700" letter-spacing="1.8"[^>]*>' + w + '<'), w);
  /* …and they all share one baseline, below the axis line */
  const ys = [...s.matchAll(/<text x="[\d.]+" y="([\d.]+)" font-size="10" text-anchor="middle"/g)].map(m => +m[1]);
  assert.equal(ys.length, 4);
  assert.equal(new Set(ys).size, 1, 'stage labels sit on one baseline');
  const axis = +s.match(/<line x1="\d+" y1="([\d.]+)" x2="\d+" y2="[\d.]+" stroke="[^"]*"\/>/)[1];
  assert.ok(ys[0] > axis, 'stage labels sit BELOW the axis, not in a top strip');
  assert.match(s, /letter-spacing="1\.8"[^>]*>VISIBLE ↑</);
  assert.match(s, /letter-spacing="1\.8"[^>]*>INVISIBLE</);
  assert.ok(!s.includes('closer to the user need'), 'the sentence-case axis caption is retired');
  assert.match(s, /map|discovery|execution/);             // readout verdict present
  wellFormed(s);
  assert.ok(!s.includes('NaN'));
});

test('component pills carry drag + edit hooks with srcLines', () => {
  const s = draw();
  assert.ok(s.includes('data-drag="evo"'));
  assert.match(s, /data-edit="name"[^>]*data-line="2"/);
  assert.match(s, /data-edit="stage"[^>]*data-raw="custom"/);
  assert.match(s, /data-edit="anchor"[^>]*data-line="1"/);
});

test('hostile names are escaped everywhere', () => {
  const s = draw('anchor: A\n<img src=x> @ custom\nA -> <img src=x>');
  assert.ok(!s.includes('<img'));
  assert.ok(s.includes('&lt;img'));
  wellFormed(s);
});

test('ghosts render dashed', () => {
  const s = draw();
  assert.match(s, /data-name="Push gateway"[^>]*>[^]*?stroke-dasharray/);
});

test('edges draw behind pills; cycle edges dashed', () => {
  const s = draw('anchor: N\nA @ custom\nB @ product\nN -> A -> B\nB -> A');
  assert.ok((s.match(/class="edge/g) || []).length >= 3);
  assert.match(s, /class="edge dropped"/);
});

test('compare: arrow for moved, NEW ring, dropped ghost, counted headline', () => {
  const prev = parse(`anchor: Habit tracking
Streak engine @ 0.30
Old thing @ product
Habit tracking -> Streak engine
Habit tracking -> Old thing`);
  const cur = parse(`anchor: Habit tracking
Streak engine @ 0.55
Fresh thing @ genesis
Habit tracking -> Streak engine
Habit tracking -> Fresh thing`);
  const s = renderMap(cur, layoutMap(cur), ctx, {compare: {prev, label: 'March'}});
  assert.ok(s.includes('Since March: 1 drifted right · 1 new · 1 dropped'));
  assert.match(s, /class="drift-arrow"/);
  assert.ok(s.includes('NEW'));
  assert.match(s, /class="ghost dropped-ghost"/);
  assert.ok(s.includes('Old thing'));
  wellFormed(s);
});

test('compare: tiny drift under epsilon is not a move', () => {
  const prev = parse('anchor: A\nB @ 0.50\nA -> B');
  const cur = parse('anchor: A\nB @ 0.51\nA -> B');
  const s = renderMap(cur, layoutMap(cur), ctx, {compare: {prev, label: 'x'}});
  assert.ok(!s.includes('drift-arrow'));
  assert.ok(s.includes('Since x: no changes'));
});

test('markdown groups by stage, lists ghosts, carries the live link', async () => {
  const {toMarkdown} = await import('../render.js');
  const m = parse(SRC);
  const md = toMarkdown(m, layoutMap(m), 'https://example.com/#z');
  assert.match(md, /\*\*custom\*\*: Streak engine/);
  assert.match(md, /unplaced: Push gateway/);
  assert.match(md, /example\.com/);
  assert.match(md, /3 dependencies/);
});

test('readout: names the load-bearing custom component as the biggest bet', async () => {
  const {mapReadout} = await import('../render.js');
  const m = parse(`anchor: Need
Core engine @ custom
App A @ product
App B @ product
Need -> App A -> Core engine
Need -> App B -> Core engine`);
  const r = mapReadout(m, layoutMap(m));
  assert.match(r.verdict, /Core engine/);
  assert.match(r.verdict, /load-bearing/);
  assert.equal(r.fig, '2 things need it');       // the ONE key figure, verbatim in the line
  assert.ok(r.verdict.includes(r.fig));
});

test('readout: composition verdict when nothing is load-bearing left of product', async () => {
  const {mapReadout} = await import('../render.js');
  const exec = parse('anchor: N\nA @ product\nB @ commodity\nN -> A -> B');
  assert.match(mapReadout(exec, layoutMap(exec)).verdict, /execution map/);
  assert.equal(mapReadout(exec, layoutMap(exec)).fig, '');   // no single number to quote
  const disco = parse('anchor: N\nA @ genesis\nB @ custom\nN -> A\nN -> B');
  assert.match(mapReadout(disco, layoutMap(disco)).verdict, /discovery/);
});

test('readout: flags ghosts and dropped loops by name', async () => {
  const {mapReadout} = await import('../render.js');
  const m = parse('anchor: N\nA @ custom\nB @ custom\nGhosty\nN -> A -> B\nB -> A\nN -> Ghosty');
  const r = mapReadout(m, layoutMap(m));
  assert.ok(r.flags.some(f => f.includes('unplaced')));
  assert.ok(r.flags.some(f => f.includes('loop') && f.includes('B') && f.includes('A')));
});

/* ---- the in-SVG verdict block (assets/verdict.js anatomy) ---- */
const brandCtx = {...ctx, colors: {...ctx.colors, brandText: '#D62015'}};
/* a load-bearing bet — the verdict shape that carries a key figure */
const BET_SRC = `anchor: Need
Core engine @ custom
App A @ product
App B @ product
Need -> App A -> Core engine
Need -> App B -> Core engine`;

test('readout band: VERDICT kicker + one 24px display line, key figure in brand ink', () => {
  const s = draw(BET_SRC, {}, brandCtx);
  assert.ok(s.includes('>VERDICT<'), 'literal uppercase micro label (no CSS transform in an export)');
  assert.ok(s.includes("letter-spacing=\"1.8\""), 'absolute tracking on the 10px micro');
  assert.ok(s.includes("font-size=\"24\" font-weight=\"700\" letter-spacing=\"-0.36\""), '24px display line');
  const tspans = s.match(/<tspan class="vfig" fill="#D62015">/g) || [];
  assert.equal(tspans.length, 1, 'exactly ONE brand-inked figure');
  assert.ok(s.includes(">2 things need it</tspan>"), 'and it is the load-bearing count');
});

test('readout band: brandText is optional — a ctx without it falls back to ink', () => {
  const s = draw();                       // the shared ctx carries no brandText
  assert.ok(!s.includes('undefined'), 'no undefined colour leaks into the export');
  assert.ok(s.includes('>VERDICT<'));
});

test('readout band: a wrapped verdict grows the artefact instead of colliding', () => {
  const long = `anchor: A very long user need that will not fit on one display line at all
Core engine with a deliberately long component name @ custom
App A @ product
App B @ product
A very long user need that will not fit on one display line at all -> App A -> Core engine with a deliberately long component name
A very long user need that will not fit on one display line at all -> App B -> Core engine with a deliberately long component name`;
  const h = src => +draw(src, {}, brandCtx).match(/height="(\d+)"/)[1];
  const short = `anchor: N
Core @ custom
App A @ product
App B @ product
N -> App A -> Core
N -> App B -> Core`;
  assert.ok(h(long) > h(short), 'the taller verdict block pushes the band height out');
});

/* ---- narrow relayout (width-aware, ctx.width < 520) ---- */
const narrowCtx = {...ctx, width: 390};

test('narrow: depth-grouped cards with evolution strips, no wide plane', () => {
  const s = draw(SRC, {}, narrowCtx);
  assert.ok(s.includes('data-track=""'));                          // per-card strip track
  assert.equal((s.match(/data-drag="evo"/g) || []).length, 3);     // every component draggable
  assert.ok(s.includes('needs Streak engine'));                    // needs-lines replace edges
  assert.ok(!s.includes('GENESIS'));                               // no wide terrain labels
  assert.match(s, /width="390"/);
  assert.match(s, /map|discovery|execution|load-bearing/);         // readout still present
  wellFormed(s);
  assert.ok(!s.includes('NaN'));
});

test('narrow: ghost card is dashed and invites placement', () => {
  const s = draw(SRC, {}, narrowCtx);
  assert.match(s, /stroke-dasharray[^>]*>[^]*?Push gateway/);
  assert.match(s, /unplaced/);
});

test('narrow: hostile names escaped, name edit hooks live', () => {
  const s = draw('anchor: A\n<img src=x> @ custom\nA -> <img src=x>', {}, narrowCtx);
  assert.ok(!s.includes('<img'));
  assert.ok(s.includes('data-edit="name"'));
  wellFormed(s);
});

test('wide render ignores ctx.width above the threshold (exports stay pinned)', () => {
  const wide = draw(SRC, {}, {...ctx, width: 900});
  assert.ok(wide.includes('GENESIS'));
  assert.match(wide, /width="1200"/);
});

/* ---- edit gating: add zones + component menus (Task 4) ---- */
test('edit gating: zones/markers only under opts.edit; default output unchanged', () => {
  const plain = draw();
  assert.ok(!plain.includes('data-edit="additem"') && !plain.includes('componentmenu'));
  const edit = draw(SRC, {edit: true});
  assert.equal((edit.match(/data-edit="additem"/g) || []).length, 4);     // one per stage
  assert.match(edit, /data-edit="additem" data-stage="custom"/);
  assert.equal((edit.match(/componentmenu/g) || []).length, 3);           // one per component
  wellFormed(edit);
});
test('narrow edit: add-card before the readout divider; markers after strip groups', () => {
  const s = draw(SRC, {edit: true}, narrowCtx);
  assert.match(s, /Add component/);
  assert.ok(s.indexOf('Add component') < s.search(/execution|discovery|load-bearing/), 'add-card before the readout verdict');
  const cardMarker = s.indexOf('componentmenu');
  const stripEnd = s.indexOf('</g>', s.indexOf('data-strip=""'));
  assert.ok(cardMarker > stripEnd, 'marker painted after the strip group');
  wellFormed(s);
});
test('ghost add pill never carries data-drag', () => {
  const edit = draw(SRC, {edit: true});
  assert.ok(!/data-edit="additem"[^>]*data-drag|data-drag[^>]*data-edit="additem"/.test(edit));
});
test('edit+compare: add-zones clear the compare ghost pills too', () => {
  // a snapshot whose dropped chain reaches a DEEPER row than any current pill:
  // the zone must sit below the ghost, not just below current nodes
  const prev = parse('anchor: N\nA @ custom\nDeep @ 0.15\nN -> A -> Deep');
  const cur = parse('anchor: N\nA @ custom\nN -> A');
  const s = renderMap(cur, layoutMap(cur), {...ctx, palette: ctx.palette},
    {edit: true, compare: {prev, label: 'Jan'}});
  const plusY = [...s.matchAll(/<text x="[\d.]+" y="([\d.]+)"[^>]*>＋<\/text>/g)].map(m => +m[1]);
  // the dropped-ghost pill (Deep) is the lowest thing on the plane; its centre
  // is the ghost text y — the zone row must sit below it
  const ghostY = [...s.matchAll(/<text x="[\d.]+" y="([\d.]+)"[^>]*>Deep<\/text>/g)].map(m => +m[1]);
  assert.equal(ghostY.length, 1);
  assert.ok(plusY[0] - ghostY[0] >= 30, 'zone row clears the compare ghost pill');
});
test('add-zones sit as one row below the lowest pill in a crowded column', () => {
  // two commodity components at the same x → collision spread nudges one down;
  // a fixed-y zone used to collide with it (User DB in the default example)
  const doc = 'anchor: N\nAlpha @ 0.85\nBravo @ 0.85\nN -> Alpha\nN -> Bravo';
  const s = draw(doc, {edit: true});
  const plusY = [...s.matchAll(/<text x="[\d.]+" y="([\d.]+)"[^>]*>＋<\/text>/g)].map(m => +m[1]);
  assert.equal(plusY.length, 4);                                    // one per stage
  assert.ok(plusY.every(y => Math.abs(y - plusY[0]) < 0.01), 'zones share one baseline');
  const pillY = [...s.matchAll(/<text x="[\d.]+" y="([\d.]+)"[^>]*data-edit="name"[^>]*>(?:Alpha|Bravo)<\/text>/g)].map(m => +m[1]);
  assert.equal(pillY.length, 2);
  // text y is the pill CENTRE; a clear pill-height gap below the lowest pill
  assert.ok(plusY[0] - Math.max(...pillY) >= 30, 'zone row clears the lowest pill');
});

/* ---------- `verdict:` on the artefact (2026-07-31) ---------- */
test('verdict: off drops the band; authored text replaces it', () => {
  const off = renderMap(parse('verdict: off\n' + SRC), layoutMap(parse('verdict: off\n' + SRC)), ctx);
  assert.ok(!off.includes('VERDICT'));
  const src2 = 'verdict: Buy the gateway, build the engine\n' + SRC;
  const authored = renderMap(parse(src2), layoutMap(parse(src2)), ctx);
  assert.ok(authored.includes('VERDICT'));
  assert.ok(authored.includes('Buy the gateway, build the engine'));
});

test('verdict: off must not leave a bare **** in the markdown export', () => {
  const off = parse('verdict: off\n' + SRC);
  const md = toMarkdown(off, layoutMap(off), 'https://x');
  assert.ok(!md.includes('****'), md.split('\n').slice(0, 4).join(' | '));
  const auth = parse('verdict: Buy the gateway\n' + SRC);
  assert.ok(toMarkdown(auth, layoutMap(auth), 'https://x').includes('**Buy the gateway**'));
});
