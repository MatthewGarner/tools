/* Engine-correctness audit, 2026-11-12 (Cycles). Each test failed on the code before its fix. */
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {parse, complete} from '../parse.js';
import {simulate, simKey, verdict, RUN} from '../engine.js';
import {render, toMarkdown} from '../render.js';

const HEAD = 'battery: 100MW / 200MWh\nrte: 90\ncalendar: 1\n';
const M = t => parse(t);
const K = (1 / 0.9 - 1) * 20;

test('CYC-1: "a year later forgoes" = v(best) - max(0, v(best+1)) on the search\'s own basis, >= 0, no per-year label', () => {
  // closed form: spread 50 charge 20 rte 90 fade 0 calendar 2 augment 8 £/kWh discount 8, 10 years
  const m = M(HEAD.replace('calendar: 1', 'calendar: 2') + 'spread: 50\ncharge: 20\nfade: 0\ncycles: 1000000 over 10yr\naugment: 8\ndiscount: 8');
  const o = simulate(m, {seed: 3, n: 20});
  const d = .08, H = 10, R = 365 * (50 - K), E0 = 200, cal = .02, aug = 8000;
  const A = n => { let s = 0; for(let j = 1; j <= n; j++) s += (1 + d) ** -j; return s; };
  const v = ys => ys * (E0 * R * cal * A(H - ys) - E0 * cal * aug) / (1 + d) ** ys;
  let best = 0, by = -1; for(let ys = 1; ys < H; ys++) if(v(ys) > best){ best = v(ys); by = ys; }
  const want = v(by) - Math.max(0, by + 1 < H ? v(by + 1) : 0);
  assert.ok(want > 0);
  assert.ok(Math.abs(o.augment.forgoneP50 - want) < 1e-6 * want, `forgone ${o.augment.forgoneP50} vs ${want}`);
  const line = verdict('augment', o);
  assert.match(line, /a year later forgoes £[\d.]+k? \(P50\)/);
  assert.doesNotMatch(line, /forgoes[^.]*\/yr/);
});

test('CYC-2: the two "in 10" figures sum to 10 (pill and markdown)', () => {
  const m = M(HEAD + 'spread: 35..85\ncharge: 15..45\nfade: 0.01\ncycles: 6000 over 15yr');
  const o = simulate(m, {seed: 1, n: 200});
  for(const share of [0.05, 0.15, 0.25, 0.35, 0.45, 0.55, 0.65, 0.95]){
    const o2 = {...o, threshold: {...o.threshold, bindingShare: share}};
    const pill = render(m, o2, {colors: {bg: '#fff', ink: '#000', muted: '#666', card: '#fff', border: '#ccc', accent: '#c05621', err: '#b00'}, measure: s => s.length * 7}).match(/warranty (\d+)\/10 · wear (\d+)\/10/);
    assert.equal(+pill[1] + +pill[2], 10, `share ${share}: ${pill[0]}`);
    const md = toMarkdown(m, o2).match(/warranty (\d+)% · wear (\d+)%/);
    assert.equal(+md[1] + +md[2], 100, `share ${share}: ${md[0]}`);
  }
});

test('CYC-3: simKey ignores `verdict:` text', () => {
  const base = HEAD + 'spread: 35..85\ncharge: 15..45\nfade: 0.01\ncycles: 6000 over 15yr';
  assert.equal(simKey(M(base)), simKey(M(base + '\nverdict: my own line')));
  assert.notEqual(simKey(M(base)), simKey(M(base.replace('6000', '5000'))));
});

test('CYC-4: parse refuses what the fixed point cannot solve; simulate returns null, never throws', () => {
  const body = 'rte: 90\ncalendar: 1\nspread: 35..85\ncharge: 15..45\nfade: 0.01\n';
  for(const [txt, re] of [
    ['battery: 100MW / 0MWh\n' + body + 'cycles: 6000 over 15yr', /MWh above 0/],
    ['battery: 100MW / 200MWh\n' + body + 'cycles: 6000 over 0yr', /at least 1 year/],
    ['battery: 100MW / 200MWh\n' + body + 'cycles: 6000 over 0.4yr', /at least 1 year/]]){
    const m = M(txt);
    assert.equal(complete(m), false, txt);
    assert.ok(m.warnings.some(w => re.test(w)), 'warning for ' + txt + ': ' + m.warnings);
    assert.equal(simulate(m), null);
    assert.equal(simKey(m), null);
  }
  assert.equal(complete(M('battery: 100MW / 200MWh\n' + body + 'cycles: 6000 over 15yr')), true);
});

test('CYC-4: a model error in the worker is reported, not thrown (so the app can keep the worker)', async () => {
  let got = null;
  globalThis.self = {postMessage: m => { got = m; }};
  await import('../sim-worker.js?cyc4');
  globalThis.self.onmessage({data: {model: {missing: [], refused: [], battery: null}, seed: 1, n: 5, reqId: 7}});
  assert.equal(got.reqId, 7);
  assert.equal(typeof got.error, 'string');
  const app = readFileSync(new URL('../app.js', import.meta.url), 'utf8');
  assert.match(app, /error !== undefined\) return modelError/);
  const fn = app.slice(app.indexOf('function modelError')); assert.doesNotMatch(fn.slice(0, fn.indexOf('\n}\n')), /markWorkerDead/);
});

test('CYC-5: unit words are read; fractions read as percent with a warning; every clamp warns', () => {
  const base = 'battery: 100MW / 200MWh\ncalendar: 1\nfade: 0.01\ncycles: 6000 over 15yr\n';
  let m = M(base + 'spread: 35..85\nrte: 90\naugment: 150 £/MWh');
  assert.equal(m.augment.lo, 150);
  m = M(base + 'spread: 35..85\nrte: 90\naugment: 150 £/kWh');
  assert.equal(m.augment.lo, 150000);
  m = M(base + 'spread: 35..85\nrte: 90\naugment: 150');
  assert.equal(m.augment.lo, 150000, 'augment defaults to £/kWh');
  m = M(base + 'spread: 0.035..0.085 £/kWh\ncharge: 0.02 £/kWh\nrte: 90');
  assert.deepEqual([m.spread.lo, m.spread.hi, m.charge.lo], [35, 85, 20]);
  m = M(base + 'spread: 35..85 £/yr\nrte: 90');
  assert.ok(m.warnings.some(w => /spread: unrecognised unit/.test(w)), m.warnings);
  m = M(base + 'spread: 35..85\nrte: 0.9');
  assert.equal(m.rte.lo, 0.9);
  assert.ok(m.warnings.some(w => /rte 0\.9 read as a fraction \(90%\)/.test(w)), m.warnings);
  m = M(base + 'spread: 35..85\nrte: 40..90');
  assert.ok(m.warnings.some(w => /rte below 50%/.test(w)), m.warnings);
  m = M(base + 'spread: 35..85\nrte: 90..100');
  assert.ok(m.warnings.some(w => /caps it at 99\.9%/.test(w)), m.warnings);
  // the starter and the examples stay quiet
  const quiet = M('battery: 100MW / 200MWh\nspread: 30..80\ncharge: 15..40\ndrift: -4..0\nrte: 85..90\nfade: 0.006..0.012\ncalendar: 1.0..1.8\ncycles: 6000 over 15yr');
  assert.deepEqual(quiet.warnings, []);
  assert.equal(quiet.fade.lo, 0.00006, 'fade 0.006 stays 0.006 %');
});

test('CYC-6: when nothing binds (price £0) the verdict says so', () => {
  const m = M('battery: 100MW / 200MWh\nrte: 90\ncalendar: 0\nspread: 35..85\ncharge: 15..45\nfade: 0\ncycles: 6000 over 15yr');
  const line = verdict('threshold', simulate(m, {seed: 1, n: 50}));
  assert.match(line, /nothing binds/);
  assert.doesNotMatch(line, /wear cost setting the bar/);
});

test('CYC-Q1: the year-1 figures say "in year 1"', () => {
  const m = M(HEAD + 'spread: 35..85\ncharge: 15..45\nsecond: 35..60\nfade: 0.01\ncycles: 3000 over 15yr');
  const o = simulate(m, {seed: 1, n: 100});
  assert.match(verdict('threshold', o), /each in year 1 \(P10/);
  assert.match(verdict('second', o), /of wear in year 1/);
});

test('CYC-Q2: one run constant shared by app, worker and render', () => {
  assert.deepEqual({...RUN}, {seed: 1, n: 5000});
  for(const f of ['../app.js', '../sim-worker.js', '../render.js']){
    const src = readFileSync(new URL(f, import.meta.url), 'utf8');
    assert.match(src, /RUN/, f);
    assert.doesNotMatch(src, /n: 5000|1 \^ 0x9e3779b9|seed: 1,/, f + ' still carries a literal');
  }
});
