/* Engine audit fixes (BT-1, 5-23): each test names the finding it guards. */
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {parse} from '../parse.js';
import {simulate, markdown} from '../engine.js';
import {renderBoard} from '../render.js';
import {renderQuadrant} from '../render-quadrant.js';
import {renderBetsPresentation} from '../render-presentation.js';
import {betsDiff, betsDiffView, comparisonSafety} from '../diff.js';
import {rewriteStake} from '../edit-targets.js';
import {STARTER} from '../starter.js';

const COLORS = {ink: '#141b21', muted: '#5b6670', accent: '#c05621', accentInk: '#8e4a1e',
  bg: '#f7f8f6', card: '#ffffff', border: '#e2e5e1', err: '#b3403a', track: '#e7e9e5',
  status: {done: '#1d7a3e', doing: '#2b6cb0', risk: '#9a6a00', blocked: '#b3403a'},
  statusInk: {done: '#1c753c', doing: '#245e98', risk: '#8e6200', blocked: '#a83a34'}};
const measure = (s, font) => { const m = /(\d+(?:\.\d+)?)px/.exec(font || ''); return String(s).length * (m ? +m[1] : 12) * 0.55; };
const CTX = {colors: COLORS, measure};
const text = svg => [...svg.matchAll(/<text[^>]*>([\s\S]*?)<\/text>/g)].map(m => m[1].replace(/<[^>]+>/g, '')
  .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')).join(' | ');
const ROOT = new URL('../../', import.meta.url);
const LANTERN = [...readFileSync(new URL('bets/app.js', ROOT), 'utf8').matchAll(/\{name: '([^']+)', src:\n`([\s\S]*?)`\}/g)][0][2];
const board = (src, extra = {}) => { const m = parse(src); return text(renderBoard(m, simulate(m), {...CTX, ...extra})); };

/* ---------- BT-1: a median in an empty stretch prints as a split ---------- */
test('BT-1 whenever the Lantern shared median is a split, every surface prints it as one; otherwise every surface prints the point', () => {
  const m = parse(LANTERN);
  const seeds = Array.from({length: 40}, (_, i) => 1000 + i * 7919);
  let splits = 0;
  for(const seed of seeds){
    const s = simulate(m, {seed}), pf = s.scenarios.shared;
    if(pf.split){
      splits++;
      assert.ok(pf.split.lo < pf.split.hi);
      assert.match(text(renderBoard(m, s, CTX)), /MEDIAN OUTCOME [−+]?\d+ or [−+]?\d+/, 'board receipt');
      assert.match(text(renderBoard(m, s, CTX)), /BELOW ZERO · MEDIAN [−+]?\d+ or [−+]?\d+/, 'outcome rail');
      assert.match(text(renderBetsPresentation(m, s, {...CTX, intent: 'presentation'})), /P50 [−+]?\d+ or [−+]?\d+/, 'slide');
      assert.match(text(renderQuadrant(m, s, CTX)), /MEDIAN OUTCOME [−+]?\d+ or [−+]?\d+/, 'quadrant');
      assert.match(markdown(m, s, ''), /median outcome split: about even odds of \*\*[−+]?\d+ or [−+]?\d+/i, 'markdown');
      assert.match(renderBoard(m, s, CTX), /median outcome split: about even odds of [−+]?\d+ or [−+]?\d+/, 'alt text');
      assert.match(renderBoard(m, s, CTX), /data-median-split/, 'two notches joined by a hairline');
    } else assert.doesNotMatch(text(renderBoard(m, s, CTX)), /SHARED-OUTCOME STRESS \| P\(LOSES MONEY\) \d+% \| MEDIAN OUTCOME [−+]?\d+ or/);
  }
  assert.ok(splits >= 20, 'the detector still finds the gap on at least half of 40 seeds (' + splits + ')');
  assert.ok(simulate(m).scenarios.shared.split, 'the default seed splits');
});

test('BT-1 a smooth distribution is not split, in either scenario', () => {
  const m = parse('G\n  A: stake 20-40, odds 15-30%, payoff 120-200\n  B: stake 30-60, odds 60-80%, payoff 70-120\n  C: stake 10-30, odds 10-25%, payoff 150-260\n  D: stake 40-80, odds 70-90%, payoff 90-150\n  E: stake 25-50, odds 20-35%, payoff 110-190');
  const s = simulate(m);
  assert.equal(s.portfolio.split, null);
  assert.equal(s.scenarios.shared.split, null);
  assert.ok(s.portfolio.splitSpan <= 3 && s.scenarios.shared.splitSpan <= 3, 'smooth: the runs pin the median down to within three steps');
  assert.doesNotMatch(text(renderBoard(m, s, CTX)), / or [−+]\d/);
});

/* ---------- BT-5: chance of a loss, counted from the runs ---------- */
test('BT-5 P(loses money) never prints a flat 0% or 100% for something possible', () => {
  const lo = parse('title: T\nunit: £k\nG\n  A: stake 10, odds 99.6%, payoff 100\n    kill: k');
  const hi = parse('title: T\nunit: £k\nG\n  A: stake 10, odds 0.2%, payoff 100\n    kill: k');
  const los = simulate(lo), his = simulate(hi);
  assert.ok(los.portfolio.pLoss < 0.005 && his.portfolio.pLoss > 0.995, 'the fixtures sit at the edges');
  for(const [m, s, want] of [[lo, los, '<1%'], [hi, his, '>99%']]){
    const t = text(renderBoard(m, s, CTX));
    assert.ok(t.includes('P(LOSES MONEY) ' + want), 'board prints ' + want);
    assert.ok(text(renderBoard(m, s, {...CTX, width: 390})).includes('P(LOSES MONEY) ' + want), 'narrow board');
    assert.ok(text(renderQuadrant(m, s, CTX)).includes('P(LOSES MONEY) ' + want), 'quadrant');
    assert.ok(text(renderBetsPresentation(m, s, {...CTX, intent: 'presentation'})).includes('P(LOSES MONEY) ' + want), 'slide');
    assert.ok(markdown(m, s, '').includes('P(loses money) **' + want + '**'), 'markdown');
    assert.ok(renderBoard(m, s, CTX).includes(want.replace('<', '&lt;').replace('>', '&gt;') + ' lose money'), 'alt text');
  }
});

test('BT-5 an exact 0% and 100% survive only when nothing is left to chance', () => {
  const none = parse('G\n  A: stake 10, odds 100%, payoff 50'), all = parse('G\n  A: stake 10, odds 0%, payoff 50');
  assert.ok(text(renderBoard(none, simulate(none), CTX)).includes('P(LOSES MONEY) 0%'));
  assert.ok(text(renderBoard(all, simulate(all), CTX)).includes('P(LOSES MONEY) 100%'));
  const near = parse('G\n  A: stake 10-11, odds 100%, payoff 50');
  assert.ok(text(renderBoard(near, simulate(near), CTX)).includes('P(LOSES MONEY) <1%'), 'ranges leave chance, so never a flat 0%');
});

test('BT-5 whole percent between 1% and 99%', () => {
  const t = board(LANTERN);
  assert.match(t, /P\(LOSES MONEY\) 48%/);
  assert.match(t, /P\(LOSES MONEY\) 54%/);
});

/* ---------- BT-6: no signed zero ---------- */
test('BT-6 a small non-zero figure keeps a digit instead of printing "−0"', () => {
  const t = board('title: T\nunit: £k\nG\n  B: stake 10, odds 50%, payoff 19.4\n    kill: k\n  C: stake 5, odds 50%, payoff 30\n    kill: k');
  assert.match(t, /−0\.30 \| −0\.30 \| −0\.30/, 'a small non-zero figure keeps the digits its step supports');
  assert.doesNotMatch(t, /−0 \|/);
});

/* ---------- BT-7: authored inputs as written ---------- */
test('BT-7 inputs print as written and the edit field is prefilled with the authored text', () => {
  const src = 'title: T\nunit: £k\nG\n  A: stake 0.5-2.5, odds 40-60%, payoff 19.4\n    kill: k';
  const m = parse(src), s = simulate(m);
  const wide = renderBoard(m, s, {...CTX, intent: 'live', edit: true});
  assert.match(text(wide), /0\.5–2\.5/);
  assert.match(text(wide), /19\.4/);
  assert.match(wide, /data-edit="stake" data-line="4" data-raw="0\.5–2\.5"/);
  assert.match(wide, /data-edit="payoff" data-line="4" data-raw="19\.4"/);
  const narrow = renderBoard(m, s, {...CTX, intent: 'live', edit: true, width: 390});
  assert.match(narrow, /data-edit="stake" data-line="4" data-raw="0\.5–2\.5"/);
  assert.match(text(renderQuadrant(m, s, CTX)), /0\.5–2\.5 @ 40–60% · pays 19\.4/);
  assert.match(text(renderBetsPresentation(m, s, {...CTX, intent: 'presentation'})), /0\.5–2\.5/);
  assert.match(markdown(m, s, ''), /0\.5–2\.5/);
  const ops = rewriteStake(src, 4, '0.5–2.5', '0.5-4');
  assert.match(ops[0].text, /stake 0\.5-4,/, 'editing only the top keeps the 0.5');
});

/* ---------- BT-8 ---------- */
test('BT-8 concentration: none for one bet, every bet over the line named, "one bet" only for exactly one', () => {
  const one = simulate(parse(STARTER));
  assert.equal(one.concentration, null);
  assert.doesNotMatch(board(STARTER), /carries the book/);
  const two = board('G\n  A: stake 50, odds 50%, payoff 120\n  B: stake 50, odds 50%, payoff 120');
  assert.match(two, /A \(50%\) and B \(50%\) each carry 40% or more of total stake/);
  assert.doesNotMatch(two, /one bet carries the book/);
  const lone = board('G\n  A: stake 80, odds 50%, payoff 120\n  B: stake 10, odds 50%, payoff 120\n  C: stake 10, odds 50%, payoff 120');
  assert.match(lone, /A is 80% of total stake — one bet carries the book/);
  const md = markdown(parse('G\n  A: stake 50, odds 50%, payoff 120\n  B: stake 50, odds 50%, payoff 120'),
    simulate(parse('G\n  A: stake 50, odds 50%, payoff 120\n  B: stake 50, odds 50%, payoff 120')), '');
  assert.match(md, /A \(50%\), B \(50%\) each carry 40% or more/);
});

/* ---------- BT-9, BT-10, BT-11, BT-14, BT-15 ---------- */
test('BT-9 the wide receipt keeps the whole shared-scenario condition', () => {
  assert.match(board(LANTERN), /If realised wins and losses move together; parameter ranges(?: \|)? stay independent/);
});
test('BT-10 the narrow quadrant describes the scenario the way the board does', () => {
  const m = parse(LANTERN), t = text(renderQuadrant(m, simulate(m), {...CTX, width: 400}));
  assert.doesNotMatch(t, /Whole portfolio moves together/);
  assert.match(t, /If realised wins and losses move(?: \|)? together; parameter ranges(?: \|)? stay independent/);
});
test('BT-11 no bare "ALL FIGURES" without a unit, on board and quadrant', () => {
  const src = 'title: T\nG\n  A: stake 10, odds 50%, payoff 30\n    kill: k', m = parse(src), s = simulate(m);
  assert.doesNotMatch(text(renderBoard(m, s, CTX)), /ALL FIGURES/);
  assert.doesNotMatch(text(renderQuadrant(m, s, CTX)), /ALL FIGURES/);
  assert.match(board('unit: £k\n' + src.slice(9)), /ALL FIGURES £K/);
});
test('BT-14 per-bet columns are headed EV on the board and the slide; bare P50 stays for the portfolio', () => {
  const m = parse(LANTERN), s = simulate(m);
  for(const t of [text(renderBoard(m, s, CTX)), text(renderBetsPresentation(m, s, {...CTX, intent: 'presentation'}))])
    assert.match(t, /EV P10 \| EV P50 \| EV P90/);
  assert.match(text(renderBoard(m, s, CTX)), /\| P50 [−+]\d+ \|/, 'portfolio outcomes keep P50');
});
test('BT-15 the narrow quadrant counts every bet and only lanes that hold bets', () => {
  const src = 'G\n  A: stake 10, odds 50%, payoff 30\n  Bad: stake 10\nEmpty\nOther\n  C: stake 10, odds 50%, payoff 30', m = parse(src);
  assert.match(text(renderQuadrant(m, simulate(m), {...CTX, width: 400})), /3 bets · 2 lanes/);
});

/* ---------- BT-12, BT-13, BT-23: comparison ---------- */
test('BT-12 the snapshot headline names what moved', () => {
  const was = parse('G\n  A: stake 10, odds 50%, payoff 30\n  B: stake 5, odds 50%, payoff 30');
  const head = now => betsDiffView(betsDiff(was, parse(now)), 'snap').headline;
  assert.match(head('G\n  A: stake 20, odds 50%, payoff 30\n  B: stake 5, odds 50%, payoff 30'), /stake moved on 1\./);
  assert.match(head('G\n  A: stake 10, odds 60%, payoff 30\n  B: stake 5, odds 50%, payoff 30'), /odds moved on 1\./);
  assert.match(head('G\n  A: stake 10, odds 50%, payoff 31\n  B: stake 5, odds 50%, payoff 30'), /payoff moved on 1\./);
  assert.match(head('G\n  A: stake 20, odds 60%, payoff 30\n  B: stake 5, odds 50%, payoff 30'), /inputs changed on 1\./);
  assert.match(head('G\n  A: stake 20, odds 50%, payoff 30\n  B: stake 6, odds 50%, payoff 30'), /stake moved on 2\./);
  assert.match(head('G\n  A: stake 20, odds 50%, payoff 30\n  B: stake 5, odds 55%, payoff 30'), /inputs changed on 2\./);
});
test('BT-13 the same bet name in two groups does not pause comparison; a repeat in one group does', () => {
  const two = parse('Growth\n  Pilot: stake 10, odds 50%, payoff 30\nPlatform\n  Pilot: stake 5, odds 50%, payoff 30');
  assert.equal(comparisonSafety(two, two).safe, true);
  const one = parse('Growth\n  Pilot: stake 10, odds 50%, payoff 30\n  Pilot: stake 5, odds 50%, payoff 30');
  assert.equal(comparisonSafety(one, one).safe, false);
});
test('BT-23 a snapshot in another unit draws no ghost band and says why', () => {
  const m = parse('title: T\nunit: £m\nG\n  A: stake 10, odds 50%, payoff 30\n    kill: k'), s = simulate(m);
  const prevModel = parse('title: T\nunit: £k\nG\n  A: stake 10, odds 50%, payoff 30\n    kill: k');
  const compare = {...betsDiffView(betsDiff(prevModel, m), 'snap'), prevSim: simulate(prevModel), previousUnit: '£k'};
  const t = text(renderBoard(m, s, {...CTX, compare}));
  assert.doesNotMatch(t, /SNAPSHOT P10–P90/);
  assert.match(t, /snapshot was in £k, so its outcome band is not drawn/);
  const same = text(renderBoard(m, s, {...CTX, compare: {...compare, previousUnit: '£m'}}));
  assert.match(same, /SNAPSHOT P10–P90/);
});

/* ---------- BT-22 ---------- */
test('BT-22 Markdown prints the board\'s figures', () => {
  const m = parse(LANTERN), s = simulate(m), md = markdown(m, s, '');
  assert.match(md, /Independent baseline: Median outcome \*\*\+10 £k\*\* \[−360 to \+390\]/);
  assert.match(md, /−11 to \+29 \(\+6\)/, 'Publisher EV row (stepped to its trio)');
  assert.match(md, /\| \+69 to \+167 \(\+113\) \|/, 'Referral EV row');
  assert.doesNotMatch(md, /[−+]\d+–[−+]\d+/, 'no dash between two signed numbers');
});

/* ---------- BT-16 to BT-21: the one number reader ---------- */
const warns = s => parse('G\n  A: ' + s).warnings.map(w => w.msg);
const bet = s => parse('G\n  A: ' + s).groups[0].bets[0];
test('BT-16 odds written as a fraction warn that they were read as percent', () => {
  const w = warns('stake 10, odds 0.3-0.5, payoff 30');
  assert.equal(w.length, 1);
  assert.match(w[0], /read as 0\.3%–0\.5%; write 30-50% for 30 to 50 percent/);
  assert.deepEqual(bet('stake 10, odds 0.3-0.5, payoff 30').odds, [0.3, 0.5], 'warn, do not reinterpret');
  assert.equal(warns('stake 10, odds 0.3-0.5%, payoff 30').length, 0, 'a % sign is deliberate');
  assert.equal(warns('stake 10, odds 30-50, payoff 30').length, 0);
});
test('BT-17 thousands separators in groups of three are read', () => {
  const b = bet('stake 1,000, odds 50%, payoff 3,000-4,500');
  assert.deepEqual(b.stake, [1000, 1000]);
  assert.deepEqual(b.payoff, [3000, 4500]);
  assert.equal(parse('G\n  A: stake 1,000, odds 50%, payoff 3,000').warnings.length, 0);
});
test('BT-18 a malformed number is a warning naming the line, and the bet is unscoreable', () => {
  for(const bad of ['stake 1.2.3', 'stake 1,5', 'stake 1,00', 'stake 12,34,5']){
    const m = parse('G\n  A: ' + bad + ', odds 50%, payoff 30'), w = m.warnings;
    assert.equal(m.groups[0].bets[0].stake, null, bad);
    assert.ok(w.length >= 1 && w[0].line === 2 && /Could not read a valid stake/.test(w[0].msg), bad);
    assert.equal(simulate(m).scoreableCount, 0, bad);
  }
});
test('BT-19 a % sign on stake or payoff warns', () => {
  assert.match(warns('stake 50%, odds 50%, payoff 30').join(), /% sign on stake/);
  assert.match(warns('stake 50, odds 50%, payoff 30%').join(), /% sign on payoff/);
});
test('BT-20 a non-finite value is refused and nothing prints NaN', () => {
  const src = 'title: T\nG\n  A: stake 10, odds 50%, payoff ' + '9'.repeat(400) + '\n  B: stake 10, odds 50%, payoff 30';
  const m = parse(src), s = simulate(m);
  assert.equal(m.groups[0].bets[0].payoff, null);
  assert.ok(m.warnings.some(w => w.line === 3));
  assert.doesNotMatch(renderBoard(m, s, CTX) + markdown(m, s, ''), /NaN|Infinity/);
});
test('BT-21 an impossible calendar date warns; a real one does not', () => {
  assert.match(parse('G\n  A: stake 1, odds 50%, payoff 2\n    kill: stop by 2026-02-31').warnings.map(w => w.msg).join(), /not a real calendar date/);
  assert.equal(parse('G\n  A: stake 1, odds 50%, payoff 2\n    kill: stop by 2028-02-29').warnings.length, 0);
});

/* ---------- BT-Q1: moving together can lower the chance of a loss ---------- */
test('BT-Q1 the page says when the shared scenario lowers the chance of a loss, and "widens the swing" only when the printed width is larger', () => {
  const narrower = 'G\n  A: stake 100, odds 90%, payoff 110\n  B: stake 100, odds 90%, payoff 110', m = parse(narrower), s = simulate(m);
  assert.ok(s.scenarios.shared.pLoss < s.portfolio.pLoss);
  assert.ok(Math.round(s.scenarios.shared.p90) - Math.round(s.scenarios.shared.p10) <= Math.round(s.portfolio.p90) - Math.round(s.portfolio.p10), 'fixture: the shared width is not larger');
  const stops = /Moving together lowers the chance of a loss here \(\d+% against \d+%\)\.(?! and)/;
  assert.match(text(renderBoard(m, s, CTX)), stops);
  assert.doesNotMatch(text(renderBoard(m, s, CTX)), /widens the swing/);
  assert.match(markdown(m, s, ''), stops);
  assert.match(text(renderBoard(m, s, {...CTX, width: 390})), /Moving together lowers the chance of a loss here/);
  /* wider: three likely wins; sharing the draw lowers P(loss) (14% against 37%) and stretches the range */
  const wider = parse('G\n  A: stake 100, odds 85%, payoff 130\n  B: stake 100, odds 85%, payoff 130\n  C: stake 100, odds 85%, payoff 130'), ws = simulate(wider);
  const [ind, sh] = [ws.portfolio, ws.scenarios.shared];
  if(Math.round(sh.pLoss * 100) < Math.round(ind.pLoss * 100) && Math.round(sh.p90) - Math.round(sh.p10) > Math.round(ind.p90) - Math.round(ind.p10)){
    assert.match(text(renderBoard(wider, ws, CTX)), /lowers the chance of a loss here \(\d+% against \d+%\) and widens the swing\./);
  } else assert.fail('fixture does not lower P(loss) and widen the range: ' + JSON.stringify([ind.pLoss, sh.pLoss, ind.p90 - ind.p10, sh.p90 - sh.p10]));
  const lantern = parse(LANTERN);
  assert.doesNotMatch(text(renderBoard(lantern, simulate(lantern), CTX)), /Moving together lowers/, 'silent when it does not');
});

/* ---------- BT-Q5: payoff is gross ---------- */
test('BT-Q5 DSL.md and the page state that payoff is gross', () => {
  assert.match(readFileSync(new URL('DSL.md', ROOT), 'utf8'), /Payoff is gross\*\*: it is what comes back on a win, before the\s+stake is taken off/);
  assert.match(readFileSync(new URL('bets/index.html', ROOT), 'utf8'), /payoff is gross: what comes back on a win, before the stake is taken off/);
  assert.equal(simulate(parse('G\n  A: stake 10, odds 100%, payoff 10')).portfolio.p50, 0, 'a win returns payoff, net payoff - stake');
});
