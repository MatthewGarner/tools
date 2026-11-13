/* Engine-correctness audit, 2026-11-12 (spec 2026-11-12-engine-correctness-spec.md, Risk).
   Each test names the finding it guards; every one failed on the code before the fix. */
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {parse} from '../parse.js';
import {simulate, fmtUnit, verdict} from '../engine.js';

// closed forms (independent of the engine)
const erfc = x => { const z = Math.abs(x), t = 1 / (1 + 0.5 * z);
  const r = t * Math.exp(-z * z - 1.26551223 + t * (1.00002368 + t * (0.37409196 + t * (0.09678418 + t * (-0.18628806 + t * (0.27886807 + t * (-1.13520398 + t * (1.48851587 + t * (-0.82215223 + t * 0.17087277)))))))));
  return x >= 0 ? r : 2 - r; };
const Phi = x => 0.5 * erfc(-x / Math.SQRT2);
const Z95 = 1.6448536269514722;
const LN = (lo, hi) => ({mu: (Math.log(lo) + Math.log(hi)) / 2, s: (Math.log(hi) - Math.log(lo)) / (2 * Z95)});
const call = (mu, s, K) => { const d2 = (mu - Math.log(K)) / s; return Math.exp(mu + s * s / 2) * Phi(d2 + s) - K * Phi(d2); };
const put = (mu, s, K) => call(mu, s, K) - (Math.exp(mu + s * s / 2) - K);
const mean = a => { let t = 0; for(const v of a) t += v; return t / a.length; };
const sim = (t, o) => simulate(parse(t), o);

test('RISK-1: a toll with a fee "beats merchant" when m < T - fee', () => {
  const {mu, s} = LN(60, 180);
  const r = sim('merchant: 60..180\ntoll: 95 fee 10').rows[1];
  const want = Phi((Math.log(85) - mu) / s);
  assert.ok(Math.abs(r.bind.p - want) < 0.002, `toll bind ${r.bind.p} vs P(m<85) ${want}`);
  // floor and insure keep their own thresholds
  const o = sim('merchant: 60..180\nfloor: 70 fee 5\ninsure: premium 6 attach 65');
  assert.ok(Math.abs(o.rows[1].bind.p - Phi((Math.log(70) - mu) / s)) < 0.002);
  assert.ok(Math.abs(o.rows[2].bind.p - Phi((Math.log(65) - mu) / s)) < 0.002);
});

test('RISK-3: Risk carries no sampling error: seed is ignored and figures match the closed forms', () => {
  const t = 'merchant: 60..180\nfloor: 70 share 60% fee 5\ntoll: 95\ninsure: premium 6 attach 65 limit 30';
  const a = sim(t, {seed: 1}), b = sim(t, {seed: 99});
  for(let i = 0; i < a.rows.length; i++){
    assert.equal(a.rows[i].p10, b.rows[i].p10, 'p10 depends on seed');
    assert.equal(a.rows[i].p50, b.rows[i].p50);
    if(a.rows[i].trade) assert.equal(a.rows[i].trade.upsideSold, b.rows[i].trade.upsideSold, 'upside sold depends on seed');
  }
  const {mu, s} = LN(60, 180);
  const [m, fl, tl, ins] = a.rows;
  const near = (x, y, tol, w) => assert.ok(Math.abs(x - y) <= tol * Math.max(1, Math.abs(y)), `${w}: ${x} vs ${y}`);
  near(m.p50, Math.exp(mu), 1e-3, 'merchant P50');
  near(m.p10, Math.exp(mu - 1.2815515655446 * s), 1e-3, 'merchant P10');
  near(m.p90, Math.exp(mu + 1.2815515655446 * s), 1e-3, 'merchant P90');
  near(mean(m.sorted), Math.exp(mu + s * s / 2), 2e-3, 'merchant mean');
  near(fl.trade.upsideSold, 0.4 * call(mu, s, 70), 2e-3, 'floor upside sold');
  near(fl.trade.downsideBought, put(mu, s, 70), 2e-3, 'floor protection');
  near(tl.trade.upsideSold, call(mu, s, 95), 2e-3, 'toll upside sold');
  near(ins.trade.downsideBought, put(mu, s, 65) - put(mu, s, 35), 2e-3, 'insure payout');
});

test('RISK-2: a value of 1000 or more in a £k unit prints as £m, never "kk"', () => {
  assert.equal(fmtUnit(2500, '£k/MW/yr'), '£2.5m/MW/yr');
  assert.match(fmtUnit(-2500, '£k/MW/yr'), /2\.5m\/MW\/yr$/);
  assert.doesNotMatch(fmtUnit(-2500, '£k/MW/yr'), /kk/);
  assert.equal(fmtUnit(95, '£k/MW/yr'), '£95k/MW/yr');
  assert.equal(fmtUnit(1500000, '£/MW/yr'), '£1.5M/MW/yr');   // unchanged: no k in the unit
});

test('RISK-4: the verdict calls the P10 gap a "bad year (P10)", not "worst-year"', () => {
  const s = sim('merchant: 60..180\nfloor: 70 share 60% fee 5');
  const v = verdict(s.rows[1], '£k/MW/yr');
  assert.match(v, /bad year \(P10\)/);
  assert.doesNotMatch(v, /worst/);
});

test('RISK-5: whole-word keys, fractions read as percent with a warning, no silent clamp or drop', () => {
  let p = parse('merchant: 60..180\nfloor: 70 share 0.6');
  assert.equal(p.structures[0].params.share, 0.6);
  assert.ok(p.warnings.some(w => /fraction/.test(w) && /60%/.test(w)), 'fraction warning: ' + p.warnings);
  p = parse('merchant: 60..180\ntoll: 95 coffee 5');
  assert.equal(p.structures[0].params.fee, 0, '"coffee 5" must not be a fee');
  p = parse('merchant: 60..180\nfloor: 70 fee 5%');
  assert.equal(p.structures[0].params.fee, 5);
  assert.ok(p.warnings.some(w => /fee/.test(w) && /not percent/.test(w)), 'fee % warning: ' + p.warnings);
  p = parse('merchant: 60..180\ntoll: 95 fee -5');
  assert.equal(p.structures[0].params.fee, 0);
  assert.ok(p.warnings.some(w => /negative fee/.test(w)), 'negative fee warning');
  p = parse('merchant: 60..180\ninsure: premium -6 attach 65');
  assert.equal(p.structures[0].params.premium, 0);
  assert.ok(p.warnings.some(w => /negative premium/.test(w)), 'negative premium warning');
  p = parse('merchant: 60..180\ninsure: 5 premium 6 attach 65');
  assert.ok(p.warnings.some(w => /leading number/.test(w)), 'dropped leading number warning');
  p = parse('merchant: 60..180\nfloor: 70 share 60%');
  assert.equal(p.structures[0].params.share, 0.6);
  assert.deepEqual(p.warnings, [], 'a plain 60% stays quiet');
});

test('RISK-6: a merchant range reaching zero warns and reports the tail check as unavailable', () => {
  const m = parse('merchant: 0..100\nfloor: 10');
  assert.ok(m.warnings.some(w => /lognormal/.test(w) && /zero/.test(w)), 'warning: ' + m.warnings);
  const r = simulate(m).rows[1];
  assert.equal(r.bind.sensitive, null, 'not "not sensitive"');
  assert.match(verdict(r, '£k'), /tail-shape check unavailable/);
  const ok = simulate(parse('merchant: 20..400\nfloor: 60')).rows[1];
  assert.equal(typeof ok.bind.sensitive, 'boolean');
});

test('RISK-Q1: "same maths, different labels" example has equal expected pay across its structures', () => {
  const src = readFileSync(new URL('../app.js', import.meta.url), 'utf8');
  const ex = [...src.matchAll(/\{name: '([^']+)', src:\s*\n`([^`]*)`\}/g)].find(x => x[1] === 'Optimiser fees');
  assert.ok(ex, 'example found');
  const o = simulate(parse(ex[2]));
  const e = o.rows.slice(1).map(r => mean(r.sorted));
  assert.ok(Math.max(...e) - Math.min(...e) < 0.05, 'E[pay] ' + e.map(x => x.toFixed(3)).join(' / '));
});
