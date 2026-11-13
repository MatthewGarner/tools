/* Run count, unconditional draw order and printing to what the runs support (BT-2, BT-3). */
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {parse} from '../parse.js';
import {simulate, markdown, NSIM, stepFor} from '../engine.js';
import {renderBoard} from '../render.js';
import {renderQuadrant} from '../render-quadrant.js';
import {renderBetsPresentation} from '../render-presentation.js';
import {atStep, pv, evv, NSIM_TEXT} from '../format.js';
import {mulberry32, gaussian, quantile, Z90} from '../../assets/series.js';
import {STARTER} from '../starter.js';

const ROOT = new URL('../../', import.meta.url);
const LANTERN = [...readFileSync(new URL('bets/app.js', ROOT), 'utf8').matchAll(/\{name: '([^']+)', src:\n`([\s\S]*?)`\}/g)][0][2];
const COLORS = new Proxy({status: {risk: '#a60'}}, {get: (t, k) => k in t ? t[k] : '#123456'});
const measure = (s, f) => String(s).length * ((/(\d+(?:\.\d+)?)px/.exec(f || '') || [0, 12])[1] * 0.55);
const CTX = {colors: COLORS, measure};
const text = svg => [...svg.matchAll(/<text[^>]*>([\s\S]*?)<\/text>|<desc[^>]*>([\s\S]*?)<\/desc>/g)].map(m => (m[1] ?? m[2]).replace(/<[^>]+>/g, '')).join(' | ');

/* ---------- the documented draw order, transcribed with the shared primitives and full sorts ---------- */
function reference(model, seed = 0xBE75, nsim = NSIM){
  const rand = mulberry32(seed), gauss = gaussian(rand);
  const bets = model.groups.flatMap(g => g.bets).filter(b => b.stake && b.odds && b.payoff);
  const draw = (r, dist) => {                        // ALWAYS one normal; a point value discards it
    const z = gauss(); let [lo, hi] = r;
    if(lo === hi) return lo;
    if(dist === 'logn' && lo > 0){ const mu = (Math.log(lo) + Math.log(hi)) / 2, sg = (Math.log(hi) - Math.log(lo)) / (2 * Z90); return Math.exp(mu + sg * z); }
    return (lo + hi) / 2 + (hi - lo) / (2 * Z90) * z;
  };
  const ind = [], sh = [], ev = bets.map(() => []);
  for(let i = 0; i < nsim; i++){
    let a = 0, c = 0, shared = null;
    bets.forEach((b, j) => {
      const p = Math.min(100, Math.max(0, draw(b.odds, 'norm'))) / 100, pay = Math.max(0, draw(b.payoff, 'logn')), stk = Math.max(0, draw(b.stake, 'logn'));
      ev[j].push(p * pay - stk);
      const d = rand(); if(shared === null) shared = d;
      a += (d < p ? pay : 0) - stk; c += (shared < p ? pay : 0) - stk;
    });
    ind.push(a); sh.push(c);
  }
  const q = arr => { const s = arr.slice().sort((x, y) => x - y); return {p10: quantile(s, .1), p50: quantile(s, .5), p90: quantile(s, .9), pLoss: s.filter(v => v < 0).length / nsim}; };
  return {ind: q(ind), sh: q(sh), ev: ev.map(q), bets};
}
const MODELS = {
  lantern: LANTERN,
  starter: STARTER,
  mixed: 'G\n  A: stake 10-30, odds 20-40%, payoff 50-90\n  Bad: stake 5, odds 140%, payoff 9\n  C: stake 0-12, odds 50, payoff 0-40\n  D: stake 7, odds 30%, payoff 25',
};
for(const [name, src] of Object.entries(MODELS)){
  test('the engine is the documented draw order, quantile for quantile (' + name + ')', () => {
    const m = parse(src), e = simulate(m), r = reference(m);
    for(const k of ['p10', 'p50', 'p90', 'pLoss']){
      assert.equal(e.portfolio[k], r.ind[k], 'independent ' + k);
      assert.equal(e.scenarios.shared[k], r.sh[k], 'shared ' + k);
    }
    r.bets.forEach((b, j) => {
      const rec = e.bets.get(b.srcLine);
      for(const k of ['p10', 'p50', 'p90']) assert.equal(rec.ev[k], r.ev[j][k], b.name + ' EV ' + k);
    });
  });
}

/* ---------- run count ---------- */
test('every sampled figure comes from NSIM = 40,000 runs, and every surface names the count from the constant', () => {
  assert.equal(NSIM, 40000);
  assert.equal(NSIM_TEXT, '40,000');
  const m = parse(LANTERN), s = simulate(m);
  assert.equal(s.portfolio.runs, NSIM);
  const board = text(renderBoard(m, s, CTX)), narrow = text(renderBoard(m, s, {...CTX, width: 390}));
  assert.match(board, /40,000 SIMULATIONS/);
  assert.match(narrow, /INDEPENDENT OUTCOMES — 40,000 RUNS/);
  assert.match(text(renderQuadrant(m, s, CTX)), /40,000 SIMULATIONS/);
  assert.match(text(renderBetsPresentation(m, s, {...CTX, intent: 'presentation'})), /40,000 SIMULATIONS/);
  const html = readFileSync(new URL('bets/index.html', ROOT), 'utf8');
  assert.doesNotMatch(html, /4,000/, 'the page text does not carry a hand-written run count');
  assert.match(html, /data-runs>40,000</);
  assert.match(readFileSync(new URL('bets/app.js', ROOT), 'utf8'), /NSIM_TEXT/);
  assert.equal(s.portfolio.histogram.reduce((t, b) => t + b[2], 0), 4000, 'the histogram is a picture of the first 4,000 runs');
});

/* ---------- BT-3: a hairline edit cannot move later draws ---------- */
test('BT-3 widening a point to a hairline range moves no printed figure by a step', () => {
  const a = simulate(parse(LANTERN)), b = simulate(parse(LANTERN.replace('stake 80,', 'stake 80-80.0001,')));
  for(const sc of ['independent', 'shared']){
    const x = a.scenarios[sc], y = b.scenarios[sc];
    assert.equal(x.step, y.step);
    for(const k of ['p10', 'p50', 'p90']) assert.ok(Math.abs(x[k] - y[k]) < x.step, sc + ' ' + k + ' ' + x[k] + ' vs ' + y[k]);
    assert.ok(Math.abs(x.pLoss - y.pLoss) < 0.005, sc + ' P(loss)');
    assert.equal(!!x.split, !!y.split);
    if(x.split) for(const k of ['lo', 'hi']) assert.ok(Math.abs(x.split[k] - y.split[k]) < x.step, sc + ' split ' + k);
  }
  for(const [line, rec] of a.bets) for(const k of ['p10', 'p50', 'p90']) assert.ok(Math.abs(rec.ev[k] - b.bets.get(line).ev[k]) < rec.ev.step, 'EV ' + k);
  const printed = s => text(renderBoard(parse(s), simulate(parse(s)), CTX));
  assert.equal(printed(LANTERN), printed(LANTERN.replace('stake 80,', 'stake 80-80.0001,')).replace(/80–80\.0001/, '80'), 'the printed board is the same text');
});
test('BT-3 the number of draws per scoreable bet never depends on a value being a point', () => {
  const point = simulate(parse('G\n  A: stake 10, odds 50%, payoff 30\n  B: stake 5-9, odds 20-40%, payoff 40-80'));
  const range = simulate(parse('G\n  A: stake 10-10.0001, odds 50-50.0001%, payoff 30-30.0001\n  B: stake 5-9, odds 20-40%, payoff 40-80'));
  for(const k of ['p10', 'p50', 'p90']) assert.ok(Math.abs(point.bets.get(3).ev[k] - range.bets.get(3).ev[k]) < 1e-3, 'the second bet sees the same draws either way: ' + k);
});

/* ---------- printing to what the runs support ---------- */
test('portfolio outcomes share one step: a tenth of the power of ten of the largest', () => {
  assert.equal(stepFor([-384, 9.7, 789, 387, -360], 10), 10);
  assert.equal(stepFor([-52.3, 119.6, 185], 10), 10);
  assert.equal(stepFor([5, 2], 10), 0.1);
  assert.equal(stepFor([0, 0], 10), 1);
  const pf = {p10: -359.71, p50: 9.74, p90: 387.92, step: 10};
  assert.deepEqual([pf.p10, pf.p50, pf.p90].map(v => pv(pf, v)), ['−360', '+10', '+390']);
  assert.equal(pv({step: 10}, 3), '0', 'a value that rounds to zero prints 0');
  assert.equal(pv({step: 10}, -3), '0');
  assert.equal(pv({step: 0.1}, -0.34), '−0.3');
});
test('a bet\'s EV trio shares a step of a hundredth of the power of ten of the largest', () => {
  assert.equal(stepFor([68.7, 113.3, 168.9], 100), 1);
  const ev = {p10: 68.73, p50: 113.26, p90: 168.91, step: 1};
  assert.deepEqual([ev.p10, ev.p50, ev.p90].map(v => evv(ev, v)), ['+69', '+113', '+169']);
  assert.equal(evv({step: 0.01}, 0.126), '+0.13');
});
test('the engine puts one portfolio step on both scenarios and one EV step on each bet', () => {
  const s = simulate(parse(LANTERN));
  assert.equal(s.portfolio.step, 10);
  assert.equal(s.scenarios.shared.step, 10);
  assert.equal(s.bets.get(5).ev.step, 1);
});
test('every surface prints the same stepped figures (board, quadrant, slide, Markdown, alt text)', () => {
  const m = parse(LANTERN), s = simulate(m);
  const all = text(renderBoard(m, s, CTX)) + text(renderQuadrant(m, s, CTX)) + text(renderBetsPresentation(m, s, {...CTX, intent: 'presentation'})) + markdown(m, s, '');
  const ind = s.portfolio;
  assert.match(all, /MEDIAN OUTCOME \+10 · P10 −360 · P90 \+390/);
  assert.match(markdown(m, s, ''), /Median outcome \*\*\+10 £k\*\* \[−360 to \+390\]/);
  assert.match(all, /EV P10 \| EV P50 \| EV P90/);
  /* a bet whose largest EV is 29 has step 0.1 (a hundredth of 10): its trio prints one decimal, on every surface */
  assert.match(text(renderBoard(m, s, CTX)), /Publisher storefront pilot \| 60 \| 15–25% \| 250–450 \| −11\.1 \| \+6\.5 \| \+29\.4/);
  assert.match(markdown(m, s, ''), /−11\.1 to \+29\.4 \(\+6\.5\)/);
  for(const k of ['p10', 'p50', 'p90']) assert.equal(pv(ind, ind[k]), pv(ind, Math.round(ind[k] / 10) * 10));
});

/* ---------- speed: it runs on every keystroke ---------- */
test('a full recompute of the Lantern example stays in the interactive budget', () => {
  const m = parse(LANTERN);
  for(let i = 0; i < 3; i++) simulate(m);
  const t = [];
  for(let i = 0; i < 5; i++){ const a = performance.now(); simulate(m); t.push(performance.now() - a); }
  t.sort((x, y) => x - y);
  /* target ~25 ms on the audit Mac (22-26 ms measured); the guard allows 3x for a loaded CI runner */
  assert.ok(t[2] < 75, 'median of 5: ' + t[2].toFixed(1) + ' ms');
});
