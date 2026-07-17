import {test} from 'node:test';
import assert from 'node:assert/strict';
import {parse} from '../parse.js';
import {simulate} from '../engine.js';
import {render, toMarkdown} from '../render.js';

const ctx = {colors: {card: '#fff', border: '#ddd', ink: '#222', muted: '#667',
  accent: '#C05621', bg: '#f7f8f6', err: '#b33', track: '#edf0ee', status: {}},
  measure: t => t.length * 7};
const FULL = 'title: T\nbattery: 100MW / 200MWh\nspread: 35..85\ncharge: 15..45\nsecond: 35..60%\ndrift: -4..0 %/yr\nrte: 86..90%\nfade: 0.006..0.012 %/cycle\ncalendar: 1.0..1.8 %/yr\ncycles: 6000 over 15yr\naugment: 120..180 £/kWh';
const sim = src => { const m = parse(src); return {m, o: simulate(m, {seed: 1, n: 800})}; };

test('three bands render; shared £/MWh axis; state strip labels present', () => {
  const {m, o} = sim(FULL);
  const svg = render(m, o, ctx);
  assert.ok(svg.startsWith('<svg'));
  for(const frag of ['THE CYCLE PRICE', 'THE SECOND CYCLE', 'THE ASSET LIFE',
    '£/MWh', 'SoH', 'cycles left', 'days a year clear'])
    assert.ok(svg.includes(frag), 'missing: ' + frag);
});

test('ghost bands when second/augment absent', () => {
  const {m, o} = sim(FULL.replace('second: 35..60%\n', '').replace('augment: 120..180 £/kWh', ''));
  const svg = render(m, o, ctx);
  assert.ok(svg.includes('add second:'), 'second ghost hint');
  assert.ok(svg.includes('add augment:'), 'augment ghost hint');
});

test('empty state: incomplete model renders nothing', () => {
  const m = parse('spread: 35..85');
  assert.equal(render(m, simulate(m), ctx), '');
});

test('edit mode marks the fields; XML stays well-formed', () => {
  const {m, o} = sim(FULL);
  const svg = render(m, o, ctx, {edit: true});
  for(const f of ['mw', 'mwh', 'spreadLo', 'spreadHi', 'fadeLo', 'fadeHi', 'budget', 'years'])
    assert.ok(svg.includes("data-field='" + f + "'"), 'missing field ' + f);
  const TAG = /^<[a-zA-Z][\w:-]*((\s+[\w:-]+=("[^"<]*"|'[^'<]*'))*)\s*\/?>$/;
  for(const tag of svg.match(/<[^!/][^>]*>/g) || []) assert.match(tag, TAG, 'malformed ' + tag.slice(0, 100));
});

test('narrow + edit: per-band ⋯ card menus and ghost ＋ capsules; wide/non-edit stay clean', () => {
  const NARROW = {...ctx, width: 360};
  const {m, o} = sim(FULL);
  const full = render(m, o, NARROW, {edit: true});
  // three band menus, each carrying its data-band
  for(const band of ['price', 'second', 'life'])
    assert.ok(full.includes('data-band="' + band + '"'), 'missing band menu ' + band);
  assert.equal((full.match(/data-edit="cardmenu"/g) || []).length, 3, 'exactly three ⋯ menus');
  assert.ok(full.includes('data-menu=""'), 'card menu entry point present');
  // ghost bands become one-tap addkey capsules carrying the right key
  const {m: mg, o: og} = sim(FULL.replace('second: 35..60%\n', '').replace('augment: 120..180 £/kWh', ''));
  const ghost = render(mg, og, NARROW, {edit: true});
  assert.ok(ghost.includes('data-edit="addkey"') && ghost.includes('data-key="second"'), 'second add capsule');
  assert.ok(ghost.includes('data-key="augment"'), 'augment add capsule');
  assert.ok(!ghost.includes('add second:'), 'ghost prompt text replaced by capsule on phone');
  // the golden paths carry NONE of this
  assert.ok(!render(m, o, {...ctx, width: 360}).includes('data-edit'), 'narrow non-edit stays clean');
  assert.ok(!render(m, o, ctx, {edit: true}).includes('data-menu'), 'wide edit has no card menu (goldens)');
  assert.ok(!render(mg, og, ctx, {edit: true}).includes('data-edit="addkey"'), 'wide edit keeps the ghost prompt');
});

test('markdown carries all three verdicts', () => {
  const {m, o} = sim(FULL);
  const md = toMarkdown(m, o);
  assert.match(md, /Cycles are worth/);
  assert.match(md, /second cycle earns/);
  assert.match(md, /Augment in years|never pays|coin flip/);
});
