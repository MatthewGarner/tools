// energy/frequency/tests/engine-verdict.test.mjs
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {simulate, leverDeltas, verdict} from '../engine.js';

const P = {trip: 1.8, eSync: 90, load: 30, battMW: 1, dcMw: 1, eGfm: 15};

test('case 5/6 — the honest overlap: GFM flattens RoCoF AND lifts nadir; DC lifts nadir', () => {
  const d = leverDeltas(P);
  assert.ok(d.gfm.rocof < 0, 'grid-forming reduces RoCoF');
  assert.ok(d.gfm.nadir > 0, 'grid-forming also lifts the nadir (overlap)');
  assert.ok(d.dc.nadir > 0, 'DC lifts the nadir');
  assert.ok(Math.abs(d.dc.rocof) < 1e-6, 'DC does not change the initial RoCoF (it acts after the delay)');
});

test('DR vs DM at equal MW: DM (fast) lifts the nadir more than DR (slow)', () => {
  const d = leverDeltas({trip: 1.8, eSync: 80, load: 30, drMw: 0.5, dmMw: 0.5, battMW: 1});
  assert.ok(d.dm.nadir > d.dr.nadir, `DM should lift the nadir more than DR: dm=${d.dm.nadir} dr=${d.dr.nadir}`);
});

test('verdict — a non-empty string that quotes the RoCoF and nadir', () => {
  const r = simulate(P);
  const v = verdict(r, P);
  assert.equal(typeof v, 'string');
  assert.ok(v.includes('Hz/s'), 'quotes RoCoF');
  assert.ok(v.includes('Hz'), 'quotes a frequency');
});

test('verdict — shed branch names the load shedding when a weak grid trips big', () => {
  const p = {trip: 5, eSync: 40, load: 30};
  const r = simulate(p);
  const v = verdict(r, p);
  assert.ok(r.shedOccurred, 'this case should actually shed load');
  assert.ok(v.includes('Load shedding'), 'shed branch names it: ' + v);
});
