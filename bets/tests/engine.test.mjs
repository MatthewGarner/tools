import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {parse} from '../parse.js';
import {simulate, verdictCopy, verdictParts, markdown, scenarioReading, OUTCOME_SCENARIOS} from '../engine.js';

/* Fixture engineered so each audit arm is isolated (Fable review):
   - Near cert  odds 90-100 → certainty via lo≥90 (near-certain WIN)
   - Width nine odds 40-49  → a tight MID band: no longer certainty (over-precision ≠ certainty)
   - Edge ok    odds 89-99  → certainty must NOT fire (lo 89 < 90, hi 99 > 10)
   - Sure loser → LOSES AT P50 + NO KILL
   - Coin flip  → the one bet WITH a kill: (nothing flags) */
const SRC = `title: T
unit: £k
G
  Sure loser: stake 100, odds 10-20%, payoff 50-80
  Coin flip: stake 50, odds 45-55%, payoff 100-120
    kill: flips stop landing
  Near cert: stake 10, odds 90-100%, payoff 30-40
  Width nine: stake 20, odds 40-49%, payoff 60-100
  Edge ok: stake 20, odds 89-99%, payoff 60-100`;

const model = parse(SRC);
const byName = {};
for(const g of model.groups) for(const b of g.bets) byName[b.name] = b.srcLine;
const auditsOf = (sim, name) => sim.bets.get(byName[name]).audits;
const evOf = (sim, name) => sim.bets.get(byName[name]).ev;

test('EV bands: sure loser median < 0, near-cert > 0; seeded-deterministic', () => {
  const a = simulate(model), b = simulate(model);
  assert.ok(evOf(a, 'Sure loser').p50 < 0, 'sure loser loses at P50');
  assert.ok(evOf(a, 'Near cert').p50 > 0, 'near cert wins at P50');
  assert.ok(evOf(a, 'Sure loser').p10 < evOf(a, 'Sure loser').p90, 'band ordered');
  assert.deepEqual(a.portfolio, b.portfolio, 'deterministic under the same seed');
});

test('audits: each arm isolated, order = kill, certainty, loses', () => {
  const s = simulate(model);
  assert.deepEqual(auditsOf(s, 'Sure loser'), ['NO KILL CRITERION', 'LOSES AT P50']);
  assert.deepEqual(auditsOf(s, 'Coin flip'), []);                                   // has a kill, sound odds, positive EV
  assert.deepEqual(auditsOf(s, 'Near cert'), ['NO KILL CRITERION', 'ODDS IMPLY CERTAINTY']);  // lo≥90
  assert.deepEqual(auditsOf(s, 'Width nine'), ['NO KILL CRITERION']);               // tight MID band no longer stamps
  assert.deepEqual(auditsOf(s, 'Edge ok'), ['NO KILL CRITERION']);                  // 89-99: neither extreme
});

test('ODDS IMPLY CERTAINTY fires only at the extremes, never a tight mid-band (Fable M4)', () => {
  const auditsOfDoc = odds => {
    const m = parse(`G\n  X: stake 10, odds ${odds}, payoff 100-120\n    kill: k`);
    return simulate(m).bets.get(m.groups[0].bets[0].srcLine).audits;
  };
  const stamps = odds => auditsOfDoc(odds).includes('ODDS IMPLY CERTAINTY');
  assert.equal(stamps('48-53%'), false, 'coin-flip 48-53 must NOT stamp (was a false red stamp)');
  assert.equal(stamps('50-50%'), false, 'point 50 must NOT stamp (old width-0 bug)');
  assert.equal(stamps('40-80%'), false, 'wide mid never stamps');
  assert.equal(stamps('92-96%'), true, 'near-certain win stamps (hi extreme)');
  assert.equal(stamps('95-95%'), true, 'point 95 stamps');
  assert.equal(stamps('3-7%'), true, 'near-certain loss stamps (lo extreme — old rule missed a wide one)');
});

test('portfolio: pLoss in (0,1); histogram 40 bins summing to nsim', () => {
  const s = simulate(model, {nsim: 4000});
  assert.ok(s.portfolio.pLoss > 0 && s.portfolio.pLoss < 1);
  assert.equal(s.portfolio.histogram.length, 40);
  const total = s.portfolio.histogram.reduce((t, bin) => t + bin[2], 0);   // bin = [x0, x1, count]
  assert.equal(total, 4000, 'every sim lands in a bin (edges clamp)');
  assert.ok(s.portfolio.p10 < s.portfolio.p50 && s.portfolio.p50 < s.portfolio.p90);
});

test('valid legacy documents preserve the independent portfolio and EV bytes for a fixed seed', () => {
  const legacy = parse(`G
  A: stake 10-20, odds 30-50%, payoff 40-80
  B: stake 15, odds 60%, payoff 30`);
  const s = simulate(legacy, {seed: 48879, nsim: 128});
  const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
  assert.equal(hash(s.portfolio), '187e3e1964cfac641d085d0e8278a5303364d263adb871f8b7d42125355991be');
  assert.equal(hash([...s.bets].map(([line, record]) => [line, record.ev])),
    'c56978e5c45ae973086ea3f6169c1e6b1aa16f4cfd865e13f9050c405e970c82');
  assert.strictEqual(s.scenarios.independent, s.portfolio, 'legacy portfolio is the independent scenario alias');
  assert.equal(s.scenarios.declared, 'independent');
});

test('paired scenarios: two equal 50% bets lose near 25% independently and 50% under shared outcomes', () => {
  const m = parse(`G
  A: stake 25, odds 50%, payoff 100
  B: stake 25, odds 50%, payoff 100`);
  const s = simulate(m, {seed: 12345, nsim: 40000});
  assert.ok(Math.abs(s.scenarios.independent.pLoss - 0.25) < 0.015,
    `independent loss rate ${s.scenarios.independent.pLoss}`);
  assert.ok(Math.abs(s.scenarios.shared.pLoss - 0.50) < 0.015,
    `shared loss rate ${s.scenarios.shared.pLoss}`);
  for(const record of s.bets.values())
    assert.deepEqual(record.ev, {p10: 25, p50: 25, p90: 25}, 'scenario pairing never changes per-Bet EV');
});

test('a one-Bet portfolio is exactly paired between equivalent scenarios', () => {
  const s = simulate(parse(`G\n  Only: stake 20-40, odds 30-70%, payoff 80-160`), {seed: 9, nsim: 1000});
  assert.deepEqual(s.scenarios.shared, s.scenarios.independent);
});

test('invalid terms are excluded rather than reordered/clamped into the outcome', () => {
  const valid = parse(`G\n  Sound: stake 10, odds 50%, payoff 30`);
  const mixed = parse(`G
  Broken stake: stake 20-10, odds 50%, payoff 30
  Broken odds: stake 10, odds -20-120%, payoff 30
  Broken payoff: stake 10, odds 50%, payoff -30
  Sound: stake 10, odds 50%, payoff 30`);
  const a = simulate(valid, {seed: 77, nsim: 512});
  const b = simulate(mixed, {seed: 77, nsim: 512});
  assert.deepEqual(b.portfolio, a.portfolio, 'unscoreable rows consume no simulation draws or outcome');
  assert.deepEqual(b.scenarios.shared, a.scenarios.shared);
  const records = [...b.bets.values()];
  assert.deepEqual(records.slice(0, 3).map(r => r.scoreable), [false, false, false]);
  assert.equal(records[3].scoreable, true);
  const md = markdown(mixed, b);
  assert.match(md, /\| G \| Broken odds \| 10 \| — \| 30 \| NOT SCORED \| — \|/,
    'unscoreable terms stay visibly unscored in the text export');
  assert.doesNotMatch(md, /—%/);
});

test('all-invalid portfolio makes both outcome scenarios explicitly unavailable', () => {
  const m = parse(`G\n  Invalid: stake 20-10, odds 50%, payoff 30`);
  const s = simulate(m, {seed: 2, nsim: 64});
  assert.equal(s.scoreableCount, 0);
  assert.equal(s.portfolio, null);
  assert.equal(s.scenarios.independent, null);
  assert.equal(s.scenarios.shared, null);
  assert.equal(s.concentration, null);
  assert.equal(scenarioReading(s, 'shared').available, false);
  assert.match(markdown(m, s), /Not available — no scoreable bets/);
  assert.doesNotMatch(markdown(m, s), /P\(loses money\).*0%/);
});

test('valid all-zero portfolio remains a finite scored result', () => {
  const s = simulate(parse(`G\n  Zero: stake 0, odds 0-100%, payoff 0`), {seed: 2, nsim: 64});
  assert.equal(s.scoreableCount, 1);
  for(const scenario of [s.scenarios.independent, s.scenarios.shared]){
    for(const key of ['p10', 'p50', 'p90', 'pLoss']) assert.ok(Number.isFinite(scenario[key]), `${key} finite`);
    assert.equal(scenario.histogram.reduce((n, bin) => n + bin[2], 0), 64);
  }
});

test('scenarioReading supplies declared labels and Median outcome terminology', () => {
  const s = simulate(parse(`G\n  A: stake 25, odds 50%, payoff 100`), {nsim: 32});
  assert.equal(OUTCOME_SCENARIOS.independent, 'Independent baseline');
  assert.equal(OUTCOME_SCENARIOS.shared, 'Shared-outcome stress');
  const reading = scenarioReading(s, 'shared');
  assert.equal(reading.label, 'Shared-outcome stress');
  assert.equal(reading.medianOutcome, reading.portfolio.p50);
});

test('concentration: named at ≥40% stake share, null below', () => {
  const named = simulate(model);                       // Sure loser is 100/200 = 50%
  assert.equal(named.concentration.name, 'Sure loser');
  assert.equal(named.concentration.srcLine, 4);
  assert.ok(Math.abs(named.concentration.share - 0.5) < 0.001);
  const flat = simulate(parse(`G\n  A: stake 25, odds 30-50%, payoff 40-90\n  B: stake 25, odds 30-50%, payoff 40-90\n  C: stake 25, odds 30-50%, payoff 40-90\n  D: stake 25, odds 30-50%, payoff 40-90`));
  assert.equal(flat.concentration, null, 'no bet ≥40% → null');
});

test('concentration identity ignores an invalid giant and survives duplicate visible names', () => {
  const m = parse(`G
  Sound: stake 1000, odds 150%, payoff 3000
  Sound: stake 80, odds 50%, payoff 100
  Sound: stake 20, odds 50%, payoff 100`);
  const s = simulate(m);
  assert.deepEqual(s.concentration, {name: 'Sound', srcLine: 3, share: 0.8});
});

test('verdict copy quotes P(loses money) as a percentage', () => {
  const s = simulate(model);
  const v = verdictCopy(s.portfolio, {kill: 4, certainty: 2, loses: 1});
  assert.match(v, /\d+%/);
  assert.match(v, /los/i);
});

test('verdictParts names P(loses money) as the key figure, verbatim in the line', () => {
  const s = simulate(model);
  const {line, fig} = verdictParts(s.portfolio, {kill: 4, certainty: 2, loses: 1});
  assert.match(fig, /^\d+%$/);
  assert.ok(line.includes(fig), 'the figure must appear verbatim in the line');
  assert.equal(line, verdictCopy(s.portfolio, {kill: 4, certainty: 2, loses: 1}),
    'verdictCopy stays the plain line the markdown/poster exports consume');
});

test('markdown carries the honest table, paired assumptions and Median outcome terminology', () => {
  const s = simulate(model);
  const md = markdown(model, s, 'https://x/bets/#abc');
  assert.match(md, /Sure loser/);
  assert.match(md, /NO KILL CRITERION/);
  assert.match(md, /£k/);
  assert.match(md, /Independent baseline/);
  assert.match(md, /Shared-outcome stress/);
  assert.match(md, /EV P10–P90 \(P50\)/);
  assert.match(md, /flips stop landing/);
  assert.match(md, /Concentration:/);
  assert.match(md, /Only realised win\/loss outcomes share one common draw/);
  assert.match(md, /ranges remain independently sampled/);
  assert.match(md, /Median outcome/);
  assert.match(md, /\[Open in bets\]\(https:\/\/x\/bets\/#abc\)/);
  assert.doesNotMatch(md, /net EV/i);
});

test('markdown escapes authored text for heading, table, prose and link contexts', () => {
  const source = `title: <img src=x> \\*prefixed* *title* [link] \`tick\` | end
unit: <b>£|k</b> \\ *unit*
<section> \\ *group* | \`g\`
  <img> \\ *bet* [x] | \`b\`: stake 10, odds 40-60%, payoff 20
    kill: <script>x</script> \\ *kill* | \`k\``;
  const hostile = parse(source), md = markdown(hostile, simulate(hostile), 'https://x/bets/(receipt)');
  assert.doesNotMatch(md, /<(?:img|script|b|section)\b/i);
  for(const escaped of ['&lt;img', '\\*title\\*', '\\[link\\]', '\\`tick\\`', '\\|k', '&lt;script&gt;'])
    assert.ok(md.includes(escaped), `missing escaped receipt fact ${escaped}`);
  assert.ok(md.includes('\\'.repeat(3) + '*prefixed\\*'), 'source backslash must escape before Markdown syntax');
  assert.match(md, /\[Open in bets\]\(https:\/\/x\/bets\/%28receipt%29\)/);
  assert.doesNotMatch(md, /(^|[^\\])\*title\*/);
});
