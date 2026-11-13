/* Run count and speed (RK-2, RK-3, RK-4). The draw order is unchanged: the first 4,000 of the
   16,000 runs are the draws the tool has always made. */
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {simulate, NSIM, NSIM_TEXT} from '../engine.js';
import {EXAMPLES, DEFAULT_CRITERIA, DEFAULT_EFFORT} from '../examples.js';
import {STARTER} from '../starter.js';
import {mulberry32, gaussian} from '../../assets/series.js';

const mk = (items, k, extra = {}) => ({criteria: DEFAULT_CRITERIA.map(c => ({...c})), effort: {...DEFAULT_EFFORT},
  items: items.map(r => ({name: r[0], s: r.slice(1, 4), e: r[4]})), k, ww: 50, sw: 1, ...extra});
const BUILT_INS = [...EXAMPLES.map(e => [e.name, mk(e.items, e.k)]), ['Start your own', mk(STARTER.items, STARTER.k)]];

/* the documented draw order, transcribed with the shared primitives, comparator sort and string set keys */
function reference(state, nsim, seed = 0x5EED){
  const items = state.items.filter(it => it.s.every(v => isFinite(v)) && isFinite(it.e)), n = items.length, nc = state.criteria.length;
  const rand = mulberry32(seed), gauss = gaussian(rand), cl = v => Math.max(1, Math.min(10, v));
  const sg = Math.log(1 + Math.max(0, state.ww || 0) / 100) / 1.6448536, sw = Math.max(0, state.sw || 0);
  const counts = items.map(() => new Array(n).fill(0)), sc = new Array(n), order = Array.from({length: n}, (_, i) => i);
  const k = Math.max(1, Math.min(n, Math.round(state.k))), sets = new Map();
  for(let r = 0; r < nsim; r++){
    const ws = state.criteria.map(c => Math.max(0, c.w || 0) * Math.exp(sg * gauss()));
    for(let i = 0; i < n; i++){
      let b = 0; for(let c = 0; c < nc; c++) b += ws[c] * cl(items[i].s[c] + (rand() * 2 - 1) * sw);
      sc[i] = b / cl(items[i].e + (rand() * 2 - 1) * sw);
    }
    order.sort((a, b) => sc[b] - sc[a]);
    for(let p = 0; p < n;){
      let t = p + 1; while(t < n && sc[order[t]] === sc[order[p]]) t++;
      if(t === p + 1) counts[order[p]][p]++;
      else for(let a = p; a < t; a++) for(let b = p; b < t; b++) counts[order[a]][b] += 1 / (t - p);
      p = t;
    }
    if(!(k < n && sc[order[k - 1]] === sc[order[k]])){ const key = order.slice(0, k).sort((a, b) => a - b).join(','); sets.set(key, (sets.get(key) || 0) + 1); }
  }
  return {counts, setShare: Math.max(0, ...sets.values()) / nsim};
}

test('every sampled figure comes from NSIM = 16,000 runs, named from the constant', () => {
  assert.equal(NSIM, 16000);
  assert.equal(NSIM_TEXT, '16,000');
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  assert.doesNotMatch(html, /4,000/);
  assert.equal((html.match(/data-runs>16,000</g) || []).length, 2);
  const app = readFileSync(new URL('../app.js', import.meta.url), 'utf8');
  assert.match(app, /NSIM_TEXT \+ ' simulations/);
  assert.doesNotMatch(app, /4,000|4000/);
  const r = simulate(BUILT_INS[0][1]);
  assert.ok(Math.abs(r.stats.reduce((t, s) => t + s.ptop, 0) - r.k) < 1e-9, 'P(top-k) still sums to k');
});

test('the first 4,000 runs are the draws the tool has always made: the figures at nsim 4000 are bit for bit the old figures', () => {
  const at4000 = name => { const st = BUILT_INS.find(b => b[0] === name)[1]; return simulate(st, {nsim: 4000}).stats.map(s => [s.p10, s.med, s.p90, s.ptop]); };
  assert.deepEqual(at4000('Lantern feature backlog'), [[0,0,1,1],[0,1,2,0.96075],[1,2,3,0.5605],[1,3,3,0.47875],[4,4,4,0]]);
  assert.deepEqual(at4000('Ops & infra backlog'), [[1,3,4,0.36975],[1,3,4,0.35425],[5,5,6,0],[0,1,4,0.801],[5,6,6,0],[0,0,2,0.973],[1,2,4,0.502]]);
  assert.deepEqual(at4000('Classic product backlog'), [[1,3,3,0.398],[0,1,3,0.94425],[5,5,5,0],[0,2,3,0.68375],[4,4,4,0],[0,0,2,0.974]]);
});

test('the allocation-free engine equals a comparator-sort transcription, tie rule and set count included', () => {
  const states = [
    ...BUILT_INS.map(b => b[1]),
    mk([['A', 6, 6, 6, 5], ['B', 6, 6, 6, 5], ['C', 2, 2, 2, 9]], 1, {sw: 0, ww: 0}),                                   // exact ties
    mk([['A', 9, 9, 9, 1], ['B', 5, 5, 5, 4], ['C', 5, 5, 5, 4], ['D', 5, 5, 5, 4], ['E', 1, 1, 1, 9]], 2, {sw: 0}),    // a tie straddling the cut
    mk(Array.from({length: 60}, (_, i) => ['I' + i, 1 + (i * 7) % 10, 1 + (i * 3) % 10, 1 + (i * 5) % 10, 1 + (i * 11) % 10]), 20),   // more items than a bitmask holds
    {...mk([['Damaged', 5, 5, 5, NaN], ['North', 9, 9, 9, 2], ['South', 3, 3, 3, 8], ['West', 6, 2, 6, 3]], 2)},
  ];
  for(const st of states){
    const got = simulate(st, {nsim: 1500}), ref = reference(st, 1500);
    got.stats.forEach((s, j) => {
      const row = ref.counts[j], n = row.length;
      let cum = 0, p10 = 0, med = 0, p90 = n - 1, a = false, b = false;
      for(let r = 0; r < n; r++){ cum += row[r]; if(!a && cum >= 1500 * .05){ p10 = r; a = true; } if(!b && cum >= 1500 * .5){ med = r; b = true; } if(cum >= 1500 * .95){ p90 = r; break; } }
      assert.deepEqual([s.p10, s.med, s.p90, s.ptop], [p10, med, p90, row.slice(0, got.k).reduce((t, v) => t + v, 0) / 1500]);
    });
    assert.equal(got.setShare, ref.setShare);
  }
});

test('a full recompute stays in the interactive budget while a weight slider is dragged', () => {
  const big = {criteria: [1, 2, 3, 4, 5].map(i => ({name: 'C' + i, w: i})), effort: {name: 'E', w: 1}, k: 5, ww: 50, sw: 1,
    items: Array.from({length: 20}, (_, i) => ({name: 'I' + i, s: [1, 2, 3, 4, 5].map(c => 1 + (i * c * 7) % 10), e: 1 + (i * 3) % 10}))};
  const median = st => { for(let i = 0; i < 4; i++) simulate(st); const t = []; for(let i = 0; i < 5; i++){ const a = performance.now(); simulate(st); t.push(performance.now() - a); } return t.sort((x, y) => x - y)[2]; };
  /* targets: under ~12 ms for the built-ins and ~30 ms for 20 items x 5 criteria on the audit Mac; the guard allows 3x for a loaded CI runner */
  for(const [name, st] of BUILT_INS) assert.ok(median(st) < 36, name);
  assert.ok(median(big) < 90, '20 items x 5 criteria');
});
