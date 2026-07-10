import {test} from 'node:test';
import assert from 'node:assert/strict';
import {parse} from '../parse.js';
import {layoutMap} from '../layout.js';
import {renderMap} from '../render.js';

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

const draw = (src = SRC, opts = {}) => {
  const m = parse(src);
  return renderMap(m, layoutMap(m), ctx, opts);
};

/* minimal wellformedness: every tag's attributes are cleanly double-quoted,
   no bare attributes, quotes balance inside each tag */
function wellFormed(svg){
  for(const m of svg.matchAll(/<[a-zA-Z][^>]*>/g)){
    const tag = m[0];
    assert.equal((tag.match(/"/g) || []).length % 2, 0, 'unbalanced quotes in ' + tag);
    const stripped = tag.replace(/^<[a-zA-Z][-\w]*/, '').replace(/\s*\/?>$/, '')
      .replace(/\s+[-\w:]+="[^"<>]*"/g, '');
    assert.equal(stripped.trim(), '', 'bare or malformed attribute in ' + tag);
  }
}

test('board: terrain washes, stage labels, header metrics, readout, evolution caption', () => {
  const s = draw();
  assert.match(s, /^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg" width="1200"/);
  for(const w of ['GENESIS', 'CUSTOM', 'PRODUCT', 'COMMODITY']) assert.ok(s.includes(w), w);
  assert.ok(s.includes('Habitat platform'));
  assert.ok(s.includes('3 components'));                  // header metrics line
  assert.ok(s.includes('evolution'));
  assert.equal((s.match(/fill="[^"]{7}14"/g) || []).length, 4);   // four terrain washes
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
});

test('readout: composition verdict when nothing is load-bearing left of product', async () => {
  const {mapReadout} = await import('../render.js');
  const exec = parse('anchor: N\nA @ product\nB @ commodity\nN -> A -> B');
  assert.match(mapReadout(exec, layoutMap(exec)).verdict, /execution map/);
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
