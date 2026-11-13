import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {parse} from '../parse.js';
import {simulate} from '../engine.js';
import {renderQuadrant, layoutBubbles, fanOut, lineSegments, labelPlan, prep, boxesOverlap} from '../render-quadrant.js';

const COLORS = {ink: '#141b21', muted: '#5b6670', accent: '#c05621', accentInk: '#8e4a1e',
  bg: '#f7f8f6', card: '#ffffff', border: '#e2e5e1', err: '#b3403a', track: '#e7e9e5',
  status: {done: '#1d7a3e', doing: '#2b6cb0', risk: '#9a6a00', blocked: '#b3403a'},
  statusInk: {done: '#1c753c', doing: '#245e98', risk: '#8e6200', blocked: '#a83a34'}};
const measure = (s, font) => { const m = /(\d+(?:\.\d+)?)px/.exec(font || ''); return String(s).length * (m ? +m[1] : 12) * 0.55; };
const CTX = {colors: COLORS, measure};
const twelve = parse(readFileSync(new URL('../../dev/export-audit-instruments/docs/bets/g2-twelve.txt', import.meta.url), 'utf8'));
const twelveSim = simulate(twelve);

/* XB-10: bets with identical figures fan out on a small ring so none is hidden */
test('fanOut: coincident bubbles take distinct places on one ring; whiskers stay on the true point', () => {
  const items = [0, 1, 2, 3, 4].map(i => ({cx: 100, cy: 100, hx0: 80, hx1: 120, vy0: 130, vy1: 70, radius: 12, id: 'B0' + i}));
  fanOut(items);
  const spots = new Set(items.map(it => it.cx.toFixed(2) + '|' + it.cy.toFixed(2)));
  assert.equal(spots.size, 5);
  for(const it of items){
    assert.equal(it.tx, 100); assert.equal(it.ty, 100);
    const d = Math.hypot(it.cx - 100, it.cy - 100);
    assert.ok(d > 12 && d < 60, 'a small ring, not scattered: ' + d);
  }
  const lone = fanOut([{cx: 1, cy: 2, radius: 10}])[0];
  assert.equal(lone.cx, 1); assert.ok(!lone.fanned);
});

test('twelve bets with the same figures show twelve separate bubbles', () => {
  const svg = renderQuadrant(twelve, twelveSim, CTX);
  const centres = [...svg.matchAll(/<circle data-key="B\d+" cx="([\d.]+)" cy="([\d.]+)"/g)].map(m => m[1] + '|' + m[2]);
  assert.equal(centres.length, 12);
  assert.ok(new Set(centres).size >= 10, 'bubbles are not drawn on top of each other');
});

test('lineSegments: a line stops at a box lying across it and resumes beyond it', () => {
  const segs = lineSegments(100, 0, 100, 200, [{x: 90, y: 50, w: 30, h: 20}], 2);
  assert.deepEqual(segs, [[100, 0, 100, 48], [100, 72, 100, 200]]);
  assert.deepEqual(lineSegments(100, 0, 100, 200, [{x: 200, y: 50, w: 30, h: 20}]), [[100, 0, 100, 200]]);
  assert.deepEqual(lineSegments(0, 10, 100, 10, [{x: 40, y: 0, w: 20, h: 40}], 0), [[0, 10, 40, 10], [60, 10, 100, 10]]);
});

/* XB-5: a label is clear of every whisker; a bet with no clear place wears its number */
test('labelPlan on the built-in kind of portfolio keeps labels off whiskers', () => {
  const model = parse('title: t\nG\n  Alpha: stake 100, odds 30-70%, payoff 200-400\n  Beta: stake 60, odds 20-50%, payoff 150-300\n  Gamma: stake 80, odds 55-90%, payoff 100-250');
  const sim = simulate(model), P = prep(model, sim);
  const geo = {plotX0: 92, plotY0: 130, plotX1: 926, plotY1: 530, dark: false, rMin: 10, rMax: 30, nameSize: 12.5, microSize: 10, tickSize: 9.5, padX: 16, padTop: 16};
  const items = layoutBubbles(P, sim, geo);
  const plan = labelPlan(items, {...geo, zeroY: 330}, measure);
  assert.equal(plan.length, 3);
  for(const p of plan.filter(x => !x.unplaced))
    for(const it of items){
      const wh = [{x: it.hx0, y: it.ty - 1.5, w: it.hx1 - it.hx0, h: 3}, {x: it.tx - 1.5, y: it.vy1, w: 3, h: it.vy0 - it.vy1}];
      for(const w of wh) assert.ok(!boxesOverlap(p.box, w), p.name + ' sits on a whisker of ' + it.name);
    }
});

test('a crowded plane numbers every bet and names them in a key below the plot, at full width', () => {
  const svg = renderQuadrant(twelve, twelveSim, CTX);
  assert.match(svg, /data-quadrant-key=""/);
  const plot = Math.max(...[...svg.matchAll(/data-allocation-guide="" x1="([\d.]+)"/g)].map(m => +m[1]));
  assert.ok(plot > 800, 'the plot keeps the full width (the 90% guide is at ' + plot + ')');
});
