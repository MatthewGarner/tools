import {test} from 'node:test';
import assert from 'node:assert/strict';
import {parse} from '../parse.js';
import {layoutMap} from '../layout.js';
import {renderMap, toMarkdown, GEOM} from '../render.js';

const ctx = {
  colors: {card: '#fff', border: '#ddd', ink: '#222', muted: '#667', accent: '#08c',
    bg: '#f7f8f6', err: '#b33',
    status: {done: '#1D7A3E', doing: '#0C7FAE', risk: '#9A6A00', blocked: '#B3403A'}},
  palette: ['#4C8DAE', '#5E9E6F', '#B5885A', '#8B7BB8'],
  measure: t => t.length * 7,
};
const mapLayout = (model, intent = 'native') => layoutMap(model, {measure: ctx.measure, intent, geom: GEOM});


const SRC = `title: Lantern platform
anchor: Reading
Recommendations @ custom
Catalogue DB @ 0.83
Push gateway
Reading -> Recommendations -> Catalogue DB
Recommendations -> Push gateway`;

const draw = (src = SRC, opts = {}, c = ctx) => {
  const m = parse(src);
  return renderMap(m, mapLayout(m), c, opts);
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

/* Swiss Strategic Field: one quiet ruler and a truthful dependency projection;
   evolution is geometry and type, never a four-colour terrain. */
test('field: neutral ruler, dependency projection, metrics and factual readout', () => {
  const s = draw();
  assert.match(s, /^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg" data-wardley-strategic-field="" width="1200"/);
  assert.ok(s.includes('Lantern platform'));
  assert.ok(s.includes('3 components'));                  // header metrics line
  assert.ok(s.includes('data-evolution-ruler'));
  assert.ok(s.includes('DEPENDENCY PROJECTION'));
  assert.ok(!s.includes('VISIBLE ↑'), 'the DSL has no measured visibility value');
  /* every stage name is a centred uppercase micro on the one ruler */
  for(const w of ['GENESIS', 'CUSTOM', 'PRODUCT', 'COMMODITY'])
    assert.match(s, new RegExp('text-anchor="middle" font-size="10" font-weight="700" letter-spacing="1.3"[^>]*>' + w + '<'), w);
  /* …and they all share one baseline, beneath the ruler */
  const ys = [...s.matchAll(/<text x="[\d.]+" y="([\d.]+)" text-anchor="middle" font-size="10"/g)].map(m => +m[1]);
  assert.equal(ys.length, 4);
  assert.equal(new Set(ys).size, 1, 'stage labels sit on one baseline');
  assert.match(s, /has <tspan class="vfig"[^>]*>1 direct dependant/);
  assert.match(s, /horizontal positions are current claims/);
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

test('compare: receipt spells out moved, new and dropped claims', () => {
  const prev = parse(`anchor: Reading
Recommendations @ 0.30
Old thing @ product
Reading -> Recommendations
Reading -> Old thing`);
  const cur = parse(`anchor: Reading
Recommendations @ 0.55
Fresh thing @ genesis
Reading -> Recommendations
Reading -> Fresh thing`);
  const s = renderMap(cur, mapLayout(cur), ctx, {compare: {prev, label: 'March'}});
  assert.match(s, /data-strategic-diff/);
  assert.match(s, /WAS CUSTOM · 0\.30 → PRODUCT · 0\.55/);
  assert.match(s, /NEW · Fresh thing/);
  assert.match(s, /DROPPED · Old thing/);
  wellFormed(s);
});

test('compare: tiny drift under epsilon is not a move', () => {
  const prev = parse('anchor: A\nB @ 0.50\nA -> B');
  const cur = parse('anchor: A\nB @ 0.51\nA -> B');
  const s = renderMap(cur, mapLayout(cur), ctx, {compare: {prev, label: 'x'}});
  assert.ok(!s.includes('WAS '));
  assert.ok(s.includes('NO STRATEGIC CLAIMS CHANGED'));
});

test('markdown lists exact claims, ghosts and carries the live link', async () => {
  const {toMarkdown} = await import('../render.js');
  const m = parse(SRC);
  const md = toMarkdown(m, mapLayout(m), 'https://example.com/#z');
  assert.match(md, /\*\*Recommendations\*\* — CUSTOM · 0\.38/);
  assert.match(md, /\*\*Push gateway\*\* — UNPLACED/);
  assert.match(md, /example\.com/);
  assert.match(md, /3 dependencies/);
  assert.match(md, /not measured visibility/);
});

test('readout: names the direct-dependant fact without an implied recommendation', async () => {
  const {mapReadout} = await import('../render.js');
  const m = parse(`anchor: Need
Core engine @ custom
App A @ product
App B @ product
Need -> App A -> Core engine
Need -> App B -> Core engine`);
  const r = mapReadout(m, mapLayout(m));
  assert.match(r.verdict, /Core engine/);
  assert.match(r.verdict, /has 2 direct dependants/);
  assert.equal(r.fig, '2 direct dependants');
  assert.ok(r.verdict.includes(r.fig));
});

test('readout: describes the exact direct-dependant fact at every evolution position', async () => {
  const {mapReadout} = await import('../render.js');
  const exec = parse('anchor: N\nA @ product\nB @ commodity\nN -> A -> B');
  assert.match(mapReadout(exec, mapLayout(exec)).verdict, /A has 1 direct dependant/);
  assert.match(mapReadout(exec, mapLayout(exec)).verdict, /not a delivery forecast/);
  assert.equal(mapReadout(exec, mapLayout(exec)).fig, '1 direct dependant');
  const disco = parse('anchor: N\nA @ genesis\nB @ custom\nN -> A\nN -> B');
  assert.match(mapReadout(disco, mapLayout(disco)).verdict, /A has 1 direct dependant|B has 1 direct dependant/);
});

test('readout: flags ghosts and dropped loops by name', async () => {
  const {mapReadout} = await import('../render.js');
  const m = parse('anchor: N\nA @ custom\nB @ custom\nGhosty\nN -> A -> B\nB -> A\nN -> Ghosty');
  const r = mapReadout(m, mapLayout(m));
  assert.ok(r.flags.some(f => f.includes('unplaced')));
  assert.ok(r.flags.some(f => f.includes('LOOP') && f.includes('B') && f.includes('A')));
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

test('readout band: VERDICT kicker + a factual display line, key figure in field ink', () => {
  const s = draw(BET_SRC, {}, brandCtx);
  assert.ok(s.includes('>VERDICT<'), 'literal uppercase micro label (no CSS transform in an export)');
  assert.ok(s.includes("letter-spacing=\"1.8\""), 'absolute tracking on the 10px micro');
  assert.ok(s.includes("font-size=\"20\" font-weight=\"700\" letter-spacing=\"-0.3\""), '20px field display line');
  const tspans = s.match(/<tspan class="vfig" fill="#222">/g) || [];
  assert.equal(tspans.length, 1, 'exactly ONE factual figure');
  assert.ok(s.includes(">2 direct dependants</tspan>"), 'and it is the direct count');
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

test('narrow: source-order Strategic Ledger exposes complete dependency facts with evolution strips', () => {
  const s = draw(SRC, {}, narrowCtx);
  assert.ok(s.includes('data-track=""'));                          // per-card strip track
  assert.equal((s.match(/data-drag="evo"/g) || []).length, 3);     // every component draggable
  assert.match(s, /data-strategic-ledger/);
  assert.match(s, /NEEDS · Catalogue DB/);
  assert.match(s, /NEEDED BY · Reading/);
  assert.match(s, /FROM · Reading/);
  const rows = [...s.matchAll(/data-strategic-row="(\d+)"/g)].map(m => +m[1]);
  assert.deepEqual(rows, [...rows].sort((a,b) => a-b), 'phone DOM follows source order');
  assert.match(s, /width="390"/);
  assert.match(s, /direct dependant|No evolution/);                 // readout still present
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
test('narrow edit: add-card precedes the evidence band; menu and ruler hit planes never overlap', () => {
  const s = draw(SRC, {edit: true}, narrowCtx);
  assert.match(s, /ADD COMPONENT/);
  assert.ok(s.indexOf('ADD COMPONENT') < s.search(/direct dependant|No evolution/), 'add-card before the readout verdict');
  const track = s.match(/<rect data-track=""[^>]*x="([\d.]+)" y="([\d.]+)" width="([\d.]+)" height="([\d.]+)"/);
  const menu = s.match(/data-edit="componentmenu"[^>]*><rect data-hit="" x="([\d.]+)" y="([\d.]+)" width="([\d.]+)" height="([\d.]+)"/);
  assert.ok(track && menu, 'both thumb planes exist');
  const noOverlap = +track[1] + +track[3] <= +menu[1] || +menu[1] + +menu[3] <= +track[1] ||
    +track[2] + +track[4] <= +menu[2] || +menu[2] + +menu[4] <= +track[2];
  assert.ok(noOverlap, 'menu target cannot intercept the evolution ruler');
  wellFormed(s);
});
test('ghost add pill never carries data-drag', () => {
  const edit = draw(SRC, {edit: true});
  assert.ok(!/data-edit="additem"[^>]*data-drag|data-drag[^>]*data-edit="additem"/.test(edit));
});
test('edit+compare: add zones clear the dropped-claim receipt as well as the field', () => {
  // A deleted deep node is intentionally a factual receipt rather than a
  // colour ghost. It still has to clear the editable controls in physical SVG
  // space, not merely appear somewhere in the string.
  const prev = parse('anchor: N\nA @ custom\nDeep @ 0.15\nN -> A -> Deep');
  const cur = parse('anchor: N\nA @ custom\nN -> A');
  const s = renderMap(cur, mapLayout(cur), ctx,
    {edit: true, compare: {prev, label: 'Jan'}});
  const dropped = s.match(/<text x="[\d.]+" y="([\d.]+)"[^>]*>DROPPED · Deep<\/text>/);
  const fieldTop = +s.match(/data-dependency-projection="" transform="translate\(0 ([\d.]+)\)"/)[1];
  const addY = [...s.matchAll(/<text x="[\d.]+" y="([\d.]+)"[^>]*>ADD<\/text>/g)].map(m => +m[1]);
  assert.ok(dropped && addY.length === 4);
  assert.ok(Math.min(...addY) + fieldTop - +dropped[1] >= 30, 'add controls clear the dropped claim receipt');
});
test('add-zones sit as one row below the lowest pill in a crowded column', () => {
  // two commodity components at the same x → collision spread nudges one down;
  // a fixed-y zone used to collide with it (Catalogue DB in the default example)
  const doc = 'anchor: N\nAlpha @ 0.85\nBravo @ 0.85\nN -> Alpha\nN -> Bravo';
  const s = draw(doc, {edit: true});
  const plusY = [...s.matchAll(/<text x="[\d.]+" y="([\d.]+)"[^>]*>ADD<\/text>/g)].map(m => +m[1]);
  assert.equal(plusY.length, 4);                                    // one per stage
  assert.ok(plusY.every(y => Math.abs(y - plusY[0]) < 0.01), 'zones share one baseline');
  const pillY = [...s.matchAll(/<text x="[\d.]+" y="([\d.]+)"[^>]*data-edit="name"[^>]*>(?:Alpha|Bravo)<\/text>/g)].map(m => +m[1]);
  assert.equal(pillY.length, 2);
  // text y is the pill CENTRE; a clear pill-height gap below the lowest pill
  assert.ok(plusY[0] - Math.max(...pillY) >= 30, 'zone row clears the lowest pill');
});

/* ---------- `verdict:` on the artefact (2026-07-31) ---------- */
test('verdict: off drops the band; authored text replaces it', () => {
  const off = renderMap(parse('verdict: off\n' + SRC), mapLayout(parse('verdict: off\n' + SRC)), ctx);
  assert.ok(!off.includes('VERDICT'));
  const src2 = 'verdict: Buy the gateway, build the engine\n' + SRC;
  const authored = renderMap(parse(src2), mapLayout(parse(src2)), ctx);
  assert.ok(authored.includes('VERDICT'));
  assert.ok(authored.includes('Buy the gateway, build the engine'));
});

test('verdict: off must not leave a bare **** in the markdown export', () => {
  const off = parse('verdict: off\n' + SRC);
  const md = toMarkdown(off, mapLayout(off), 'https://x');
  assert.ok(!md.includes('****'), md.split('\n').slice(0, 4).join(' | '));
  const auth = parse('verdict: Buy the gateway\n' + SRC);
  assert.ok(toMarkdown(auth, mapLayout(auth), 'https://x').includes('**Buy the gateway**'));
});

test('dense wide map keeps every authored label at its position instead of replacing it with an ID key', () => {
  const components = Array.from({length: 18}, (_, i) => `Capability ${String(i + 1).padStart(2, '0')} @ ${((i % 4) + 1) / 5}`).join('\n');
  const src = 'title: Dense landscape\nanchor: Need\n' + components;
  const model=parse(src),layout=mapLayout(model),svg=renderMap(model,layout,ctx,{intent:'native'});
  assert.ok(!svg.includes('COMPONENT KEY · SOURCE ORDER'));
  assert.equal((svg.match(/data-evolution-pin/g)||[]).length,18);
  for(const name of ['Capability 01','Capability 09','Capability 18']) assert.ok(svg.includes(name));
});

test('long names render as two-line measured field cards', () => {
  const src='anchor: Need\nLong component for cohort onboarding @ custom\nNeed -> Long component for cohort onboarding';
  const model=parse(src),layout=mapLayout(model),svg=renderMap(model,layout,ctx,{intent:'native'});
  const placed=layout.nodes.find(item=>!item.anchor);
  assert.equal(placed.lines.length,2);
  assert.ok(placed.lines.every(line=>svg.includes(line)));
});

test('dependency loops are called out inside the map as well as the readout', () => {
  const src='anchor: Need\nA @ custom\nB @ product\nNeed -> A -> B\nB -> A';
  const model=parse(src),svg=renderMap(model,mapLayout(model),ctx,{intent:'native'});
  assert.ok(svg.includes('data-loop-callout="L01"'));
  assert.ok(svg.includes('DEPENDENCY LOOP'));
  assert.ok(svg.includes('DEPENDENCY LOOP'));
});

test('presentation is a fixed complete Strategic Field with every authored component', () => {
  const src=`title: Lantern landscape
anchor: Need
Experience @ genesis
App @ product
Engine @ custom
Database @ commodity
Gateway @ commodity
Analytics @ product
Need -> Experience -> App -> Engine -> Database
App -> Gateway
Experience -> Analytics`;
  const model=parse(src),layout=mapLayout(model,'presentation');
  const svg=renderMap(model,layout,ctx,{intent:'presentation'});
  assert.match(svg,/^<svg[^>]*width="1920" height="1080"/);
  assert.match(svg,/data-strategic-inventory="" data-components="6" data-dependencies="6"/);
  assert.ok(!svg.includes('DEPENDENCY SPINE'));
  for(const name of ['Experience','App','Engine','Database','Gateway','Analytics']) assert.ok(svg.includes(name));
  for(const x of ['GENESIS · 0.13','PRODUCT · 0.63','CUSTOM · 0.38','COMMODITY · 0.88']) assert.ok(svg.includes(x));
});

test('narrow ledger carries full labels and their source identity without a remote key', () => {
  const model=parse(SRC),layout=mapLayout(model,'live-narrow');
  const svg=renderMap(model,layout,narrowCtx,{intent:'live-narrow'});
  assert.ok(svg.includes('Recommendations')&&svg.includes('Push gateway'));
  assert.match(svg,/data-strategic-row="2"/);
  assert.match(svg,/data-strategic-row="4"/);
  assert.ok(!svg.includes('COMPONENT KEY'));
});
