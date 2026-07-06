import {test} from 'node:test';
import assert from 'node:assert/strict';
import {parse} from '../parse.js';
import {resolve} from '../zones.js';
import {readout} from '../readout.js';
import {render} from '../render.js';
import {mapDiff, mapDiffView} from '../diff.js';

const OLD = 'preset: assumptions\nA @ 20,80 :: test: interview\nB @ 70,60\nC @ 40,90\nD';
const NEW = 'preset: assumptions\nA @ 25,40\nB @ 70,60\nD @ 50,50\nE @ 10,10';

const ctx = {
  colors: {card: '#ffffff', border: '#dddddd', ink: '#222222', muted: '#66777a', accent: '#0088cc',
    bg: '#f7f8f6', err: '#b3403a',
    status: {done: '#1D7A3E', doing: '#0C7FAE', risk: '#9A6A00', blocked: '#B3403A'}},
  measure: t => t.length * 7,
};
const rig = src => { const m = parse(src); const r = resolve(m); return {m, r, ro: readout(m, r)}; };

test('mapDiff view: ghosts, tray placements, new labels, dropped, since line', () => {
  const v = mapDiffView(mapDiff(parse(OLD), parse(NEW)), 'last review');
  assert.equal(v.ghosts.length, 1);                       // A moved
  assert.deepEqual(v.ghosts[0].from, [20, 80]);
  assert.deepEqual(v.ghosts[0].to, [25, 40]);
  assert.ok(v.newLabels.has('e'));
  assert.deepEqual(v.dropped, ['C']);
  assert.match(v.sinceLine, /^Since last review: 1 moved · 1 placed from the tray · 1 new \(E\) · 1 dropped\.$/);
});

test('no drift → says so', () => {
  const v = mapDiffView(mapDiff(parse(OLD), parse(OLD)), 'x');
  assert.equal(v.any, false);
  assert.match(v.sinceLine, /no drift/);
});

test('render with diff: ghost trail, NEW ring, since line, dropped strip', () => {
  const {m, r, ro} = rig(NEW);
  const v = mapDiffView(mapDiff(parse(OLD), parse(NEW)), 'last review');
  const svg = render(m, r, ro, ctx, v);
  assert.match(svg, /stroke-dasharray="3 4"/);            // trail
  assert.match(svg, />NEW<\/text>/);
  assert.match(svg, /Since last review/);
  assert.match(svg, /DROPPED SINCE/);
  assert.match(svg, /line-through/);
  assert.doesNotMatch(svg, /NaN|undefined/);
});

test('no-diff render is untouched by the feature', () => {
  const {m, r, ro} = rig(NEW);
  const plain = render(m, r, ro, ctx);
  assert.doesNotMatch(plain, />NEW<\/text>|DROPPED SINCE|Since /);
  assert.equal(plain, render(m, r, ro, ctx, null));
});
