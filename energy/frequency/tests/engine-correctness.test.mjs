/* Engine-correctness audit, 2026-11-12 (Frequency). Each test failed before its fix. */
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {simulate, verdict, fmtHz} from '../engine.js';
import {paramsFromControls} from '../state.js';
import {assumptionLines, toMarkdown, renderTrace} from '../render.js';
import {buildTraceScene} from '../scene.js';

const run = c => { const p = paramsFromControls(c); return {p, r: simulate(p)}; };

test('FREQ-1: one Hz/s formatter: verdict, tile text, SVG label and markdown agree at 0.075 Hz/s', () => {
  const {p, r} = run({inertia: 200, trip: 0.6, dr: 0, dm: 0, dc: 0, gfm: 0});   // 50*0.6/(2*200) = 0.075 exactly
  assert.equal(fmtHz(r.rocof), '0.08');
  assert.match(verdict(r, p), /falls at 0\.08 Hz\/s/);
  assert.equal(buildTraceScene(r, p).rocof.label, 'RoCoF 0.08 Hz/s');
  assert.match(toMarkdown(r, p), /RoCoF 0\.08 Hz\/s/);
  assert.match(renderTrace(r, p, {}), /RoCoF 0\.08 Hz\/s/);
  const b = run({inertia: 200, trip: 1.4, dr: 0, dm: 0, dc: 0, gfm: 0});          // 0.175
  assert.equal(fmtHz(b.r.rocof), '0.18');
});

test('FREQ-2: the verdict names the inertia its RoCoF used when grid-forming adds some', () => {
  const {p, r} = run({inertia: 80, trip: 1.8, dr: 0.5, dm: 0.5, dc: 1.5, gfm: 20});
  assert.match(verdict(r, p), /on a 100 GVA·s grid \(80 synchronous \+ 20 grid-forming\)/);
  const plain = run({inertia: 90, trip: 1.8, dr: 0, dm: 0, dc: 0, gfm: 0});
  assert.match(verdict(plain.r, plain.p), /on a 90 GVA·s grid/);
  assert.doesNotMatch(verdict(plain.r, plain.p), /grid-forming/);
});

test('FREQ-3: with no response service the assumptions line says the 1 GW grid-forming basis is a minimum', () => {
  const none = assumptionLines(run({inertia: 80, trip: 1.8, dr: 0, dm: 0, dc: 0, gfm: 40}).p).join(' ');
  assert.match(none, /grid-forming basis: 1 GW minimum/);
  assert.doesNotMatch(none, /capacity basis 1 GW/);
  const some = assumptionLines(run({inertia: 80, trip: 1.8, dr: 0.5, dm: 0.5, dc: 1.5, gfm: 20}).p).join(' ');
  assert.match(some, /grid-forming capacity basis 2\.5 GW/);
});
