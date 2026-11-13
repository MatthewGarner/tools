// Audit harness: rank (WSJF rank-stability Monte Carlo, flip analysis, knife-edge, ranking diff).
// Run: node dev/engine-audit/rank/run.mjs   (about 30-90 s: 400,000-run references and 200-seed sweeps)
// A check tagged [DEFECT] proves a confirmed defect and FAILS today. Everything else is a covered-and-correct PASS
// (or a modelling question recorded as a PASS that demonstrates the behaviour).
import {check, done, rng, polar, xorshift, boxMuller, mean, sd} from './lib.mjs';
import {simulate, verdictCopy, flipAnalysis, flipCopy, perRowKnife, sigmaW, orderDiff, orderDiffCopy, sliderScale, parsePaste, NSIM, SEED} from '../../../rank/engine.js';
import {rankResultRows, pctStr} from '../../../rank/render.js';
import {EXAMPLES, DEFAULT_CRITERIA, DEFAULT_EFFORT} from '../../../rank/examples.js';
import {STARTER} from '../../../rank/starter.js';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';

const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const appSrc = readFileSync(ROOT + 'rank/app.js', 'utf8');
const mk = (items, {k = 3, ww = 50, sw = 1, w = DEFAULT_CRITERIA.map(c => c.w)} = {}) => ({
  criteria: DEFAULT_CRITERIA.map((c, i) => ({name: c.name, w: w[i]})), effort: {...DEFAULT_EFFORT},
  items: items.map(r => ({name: r[0], s: r.slice(1, 4), e: r[4]})), k, ww, sw});
const ALL = [...EXAMPLES.map(e => ({name: e.name, st: mk(e.items, {k: e.k})})), {name: 'Start your own', st: mk(STARTER.items, {k: STARTER.k})}];
const pctNum = p => Math.round(p * 100);
const RUNS = 'needs more runs, awaiting the owner';
const Phi = z => { const t = 1 / (1 + 0.2316419 * Math.abs(z)), d = 0.3989422804014327 * Math.exp(-z * z / 2);
  const p = d * t * (0.31938153 + t * (-0.356563782 + t * (1.781477937 + t * (-1.821255978 + t * 1.330274429)))); return z > 0 ? 1 - p : p; };

// ---------- contract transcription ----------------------------------------------------------
// Saved links store inputs only (criteria [name, w], effort, items [name, 3 scores, effort], k, ww, sw).
// Their printed figures depend on: NSIM 4000, SEED 0x5EED, mulberry32, a polar normal whose spare carries
// across runs, and this draw order per run: one normal per criterion (always, even when ww = 0), then for
// each VALID item in list order one uniform per criterion score and one for effort (always, even when
// sw = 0); a stable sort (ties go to the earlier row); ranks 5 %/50 %/95 % by cumulative count.
function refSim(state, seed = SEED, nsim = NSIM){
  const items = state.items.filter(it => it.s.every(v => isFinite(v)) && isFinite(it.e)), n = items.length;
  if(n < 2) return null;
  const u = rng(seed), g = polar(u), cl = v => Math.max(1, Math.min(10, v));
  const sg = Math.log(1 + Math.max(0, state.ww || 0) / 100) / 1.6448536, sw = Math.max(0, state.sw || 0);
  const counts = items.map(() => new Array(n).fill(0)), sc = new Array(n);
  for(let r = 0; r < nsim; r++){
    const ws = state.criteria.map(c => Math.max(0, c.w || 0) * Math.exp(sg * g()));
    items.forEach((it, i) => { let b = 0; for(let c = 0; c < ws.length; c++) b += ws[c] * cl(it.s[c] + (u() * 2 - 1) * sw); sc[i] = b / cl(it.e + (u() * 2 - 1) * sw); });
    const ord = items.map((_, i) => i).sort((a, b) => sc[b] - sc[a]); ord.forEach((i, pos) => counts[i][pos]++);
  }
  const k = Math.max(1, Math.min(n, Math.round(state.k)));
  return counts.map(c => { let cum = 0, lo = 0, md = 0, hi = n - 1, a = false, b = false;
    for(let r = 0; r < n; r++){ cum += c[r]; if(!a && cum >= nsim * .05){ lo = r; a = true; } if(!b && cum >= nsim * .5){ md = r; b = true; } if(cum >= nsim * .95){ hi = r; break; } }
    return {p10: lo, med: md, p90: hi, ptop: c.slice(0, k).reduce((s, v) => s + v, 0) / nsim}; });
}
// independent reference: different generator (xorshift + Box-Muller), many runs, ties split evenly
function refPtop(state, N, seed){
  const u = xorshift(seed), g = boxMuller(u), items = state.items, n = items.length, cl = v => Math.max(1, Math.min(10, v));
  const sg = sigmaW(state.ww), k = state.k, top = new Float64Array(n), sc = new Float64Array(n);
  for(let r = 0; r < N; r++){
    const ws = state.criteria.map(c => Math.max(0, c.w) * Math.exp(sg * g()));
    for(let i = 0; i < n; i++){ let b = 0; for(let c = 0; c < ws.length; c++) b += ws[c] * cl(items[i].s[c] + (u() * 2 - 1) * state.sw); sc[i] = b / cl(items[i].e + (u() * 2 - 1) * state.sw); }
    for(let i = 0; i < n; i++){ let above = 0, eq = 0; for(let j = 0; j < n; j++){ if(sc[j] > sc[i]) above++; else if(sc[j] === sc[i]) eq++; }
      const slots = Math.max(0, Math.min(eq, k - above)); top[i] += slots / eq; }
  }
  return [...top].map(v => v / N);
}

// =============================================================================================
// 1. CONTRACT
// =============================================================================================
{
  let exact = true;
  for(const {st} of ALL) for(const variant of [st, {...st, ww: 0}, {...st, sw: 0}, {...st, ww: 0, sw: 0}, {...st, k: 1}]){
    const e = simulate(variant), r = refSim(variant);
    if(!e.stats.every((s, i) => s.p10 === r[i].p10 && s.med === r[i].med && s.p90 === r[i].p90 && s.ptop === r[i].ptop)) exact = false;
  }
  check('C1 contract: an own-code transcription (seed 0x5EED, mulberry32, carried polar spare, per run one normal per criterion then per valid item one uniform per score and one for effort, stable sort, 5/50/95 % cumulative ranks) reproduces every P(top-k) and rank band bit-for-bit for all 4 built-ins x 5 settings incl. ww = 0 and sw = 0', exact);
  check('C2 constants: NSIM 16000 (4x), SEED 0x5EED; the page text, the copy-as-markdown footer and the control text all read the run count from the constant (the article embed, untouched, still says 4,000: info line)', NSIM === 16000 && SEED === 0x5EED && /NSIM_TEXT \+ ' simulations/.test(appSrc) && !/4,000/.test(appSrc) && !/4,000/.test(readFileSync(ROOT + 'rank/index.html', 'utf8')));
  console.log(`   info: the article embed definition still says "4,000 simulations": ${/4,000 simulations/.test(readFileSync(ROOT + 'embed/definitions/rank.js', 'utf8'))} (embed/ is not touched in this pass)`);
  const l = simulate(ALL[0].st);
  const hand = [46 / 4, 38 / 4, 38 / 5, 37 / 5, 24 / 7];
  check('C3 base WSJF scores by hand for the Lantern example (3V+2T+1R)/effort = 11.5, 9.5, 7.6, 7.4, 3.43 and the base order follows them', hand.every((v, i) => Math.abs(l.baseScore[i] - v) < 1e-12) && l.baseOrder.join() === '0,1,2,3,4');
  check('C4 sigmaW: a ±50 % weight wobble is a log-normal factor whose 5 %..95 % interval is exactly x1/1.5..x1.5', Math.abs(Math.exp(1.6448536 * sigmaW(50)) - 1.5) < 1e-12);
}

// =============================================================================================
// 2. ARITHMETIC: references and invariants
// =============================================================================================
const SEEDS = Array.from({length: 200}, (_, i) => 3000 + i * 104729);
const BEFORE = [];
for(const {name, st} of ALL){
  const e = simulate(st), ref = refPtop(st, 400000, 7);
  const zs = e.stats.map((s, i) => (s.ptop - ref[i]) / Math.sqrt(Math.max(1e-6, ref[i] * (1 - ref[i])) / NSIM));
  const zmax = Math.max(...zs.map(Math.abs));
  check(`A1 ${name}: every P(top-${st.k}) agrees with a 400,000-run reference on a different generator (|z| < 4)`, zmax < 4, e.stats.map((s, i) => s.name.split(' ')[0] + ' ' + s.ptop.toFixed(4) + '/' + ref[i].toFixed(4)).join(', '));
  check(`A2 ${name}: P(top-k) sums to exactly k over the items, every band is ordered p5 <= median <= p95`, Math.abs(e.stats.reduce((t, s) => t + s.ptop, 0) - e.k) < 1e-9 && e.stats.every(s => s.p10 <= s.med && s.med <= s.p90));
  const runs200 = SEEDS.map(seed => simulate(st, {seed})), runs = runs200.slice(0, 40);   // the rule: over 40 seeds
  const sds = e.stats.map((s, i) => sd(runs.map(r => 100 * r.stats[i].ptop)));
  const w = sds.indexOf(Math.max(...sds));
  console.log(`   info: ${name}: seed sd of printed P(top-k) per item (pp): ${sds.map(v => v.toFixed(2)).join(', ')}`);
  check(`N1 ${name}: the printed P(top-${st.k}) (whole percent) has a seed-to-seed sd (40 seeds) of at most half a point`, sds[w] <= .5, `worst ${e.stats[w].name} sd ${sds[w].toFixed(2)} pp, printed values across 40 seeds ${Math.min(...runs.map(r => pctNum(r.stats[w].ptop)))}%..${Math.max(...runs.map(r => pctNum(r.stats[w].ptop)))}%`, {known: sds[w] > .5 && RUNS});
  const bandSd = Math.max(...e.stats.flatMap((s, i) => ['p10', 'med', 'p90'].map(k => sd(runs.map(r => r.stats[i][k])))));
  const changed = runs.filter(r => r.stats.some((s, i) => s.p10 !== e.stats[i].p10 || s.med !== e.stats[i].med || s.p90 !== e.stats[i].p90)).length;
  check(`N2 ${name}: the printed rank bands (median and 90 % range) do not change with the seed in more than 5 % of 40 seeds`, changed <= 2, `${changed} of 40 seeds print a different band somewhere (largest band sd ${bandSd.toFixed(2)} ranks)`, {known: changed > 10 && RUNS});
  const vc = r => verdictCopy(r.stats, r.k, {setShare: r.setShare});
  /* RK-9 now prints the percentage for an item between the 85% line and 99%, which is the same noisy figure the rows print (RK-2): the verdict's wording is compared with those percentages masked */
  const heads = new Set(runs.map(r => (vc(r).headline + vc(r).body).replace(/\d+% of reasonable weightings/g, 'N% of reasonable weightings')));
  console.log(`   info: ${name}: distinct verdict texts across 40 seeds, UNMASKED: ${new Set(runs.map(r => vc(r).headline + vc(r).body)).size}; across 200 seeds: ${new Set(runs200.map(r => vc(r).headline + vc(r).body)).size}`);
  check(`N3 ${name}: the verdict headline and body are the same at every seed (percentages inside "in N% of reasonable weightings" masked, see RK-9)`, heads.size === 1, `${heads.size} distinct verdict texts across 200 seeds`, {known: heads.size > 1 && RUNS});
  const fc = flipCopy(flipAnalysis(st), st.ww), kn = perRowKnife(st);
  BEFORE.push({example: name, k: e.k, verdict: verdictCopy(e.stats, e.k, {setShare: e.setShare}).headline, flip: fc.text,
    rows: e.baseOrder.map((i, pos) => ({pos: pos + 1, name: e.stats[i].name, score: +e.baseScore[i].toFixed(4), median: e.stats[i].med + 1, range: (e.stats[i].p10 + 1) + '-' + (e.stats[i].p90 + 1), ptop: e.stats[i].ptop, printed: pctStr(e.stats[i].ptop), knife: kn[i]}))});
}
{
  const st = ALL[0].st, e = simulate(st);
  const zero = simulate({...st, ww: 0, sw: 0});
  check('A3 with no wobble (ww 0, sw 0) every P(top-k) is exactly 0 or 1 and matches the base order', zero.stats.every(s => s.ptop === (zero.baseOrder.indexOf(s.i) < zero.k ? 1 : 0)));
  const scaled = simulate({...st, criteria: st.criteria.map(c => ({...c, w: c.w * 7}))});
  check('A4 weight scale invariance: multiplying every weight by 7 leaves every P(top-k) and band identical', JSON.stringify(scaled.stats) === JSON.stringify(e.stats));
  let mono = true; for(let k = 1; k < 5; k++){ const a = simulate({...st, k}), b = simulate({...st, k: k + 1}); if(!a.stats.every((s, i) => s.ptop <= b.stats[i].ptop)) mono = false; }
  check('A5 P(top-k) never falls when k grows (same seed)', mono);
  const kn = simulate({...st, k: 5});
  check('A6 k = n gives every item P(top-k) = 1', kn.stats.every(s => s.ptop === 1));
  const sym = simulate(mk([['A', 6, 6, 6, 5], ['B', 6, 6, 6, 5], ['C', 2, 2, 2, 9]], {k: 1, sw: 1}));
  check('A7 two identical rows with score wobble split first place evenly (within 4 sd)', Math.abs(sym.stats[0].ptop - sym.stats[1].ptop) < 4 * Math.sqrt(.5 / NSIM), `${sym.stats[0].ptop} vs ${sym.stats[1].ptop}`);
  const h = simulate({...st, criteria: st.criteria.map((c, i) => ({...c, w: i ? c.w : c.w + 1e-4}))});
  check('H1 a hairline change (Value weight 3 -> 3.0001) leaves every printed P(top-k) unchanged (the draw stream does not depend on values)', h.stats.every((s, i) => pctStr(s.ptop) === pctStr(e.stats[i].ptop)));
  const pu = rng(11), moved = [];
  for(let t = 0; t < 6 && !moved.length; t++){
    const perm = st.items.map((_, i) => i).sort(() => pu() - .5), ps = simulate({...st, items: perm.map(i => st.items[i])});
    perm.forEach((orig, pos) => { const a = pctStr(e.stats[orig].ptop), b = pctStr(ps.stats[pos].ptop); if(a !== b) moved.push(e.stats[orig].name + ' ' + a + ' -> ' + b + ' (order ' + perm.join('') + ')'); });
  }
  check('H2 listing the same initiatives in a different order prints the same P(top-k) for each (up to 6 shuffles tried)', moved.length === 0, moved.join(', ') + ' [reason: each row\'s draws are tied to its list position]', {known: moved.length > 0 && RUNS});
  for(const {name: exName, st: exSt} of ALL.slice(0, 3)){
    /* RK-4 measured over 200 shuffles of each built-in backlog: how many orderings move some printed P(top-k)? */
    const pu = rng(99), exE = simulate(exSt); let movedOrders = 0, maxShift = 0;
    for(let t = 0; t < 200; t++){
      const perm = exSt.items.map((_, i) => i).sort(() => pu() - .5), ps = simulate({...exSt, items: perm.map(i => exSt.items[i])});
      let any = false;
      perm.forEach((orig, pos) => { if(pctStr(exE.stats[orig].ptop) !== pctStr(ps.stats[pos].ptop)) any = true; maxShift = Math.max(maxShift, 100 * Math.abs(exE.stats[orig].ptop - ps.stats[pos].ptop)); });
      if(any) movedOrders++;
    }
    check(`H2b ${exName}: no ordering of the same initiatives changes any printed P(top-k) (200 shuffles)`, movedOrders === 0, `${movedOrders} of 200 orderings change some printed figure; largest shift ${maxShift.toFixed(2)} pp [each row's draws are tied to its list position]`, {known: movedOrders > 0 && maxShift < 3 && 'order dependence (RK-4): needs per-item sub-streams, awaiting the owner'});
  }
}

// =============================================================================================
// 3. WORDS
// =============================================================================================
{
  // ties manufacture a winner
  const tie = mk([['Alpha', 6, 6, 6, 5], ['Beta', 6, 6, 6, 5], ['Gamma', 2, 2, 2, 9]], {k: 1, sw: 0});
  const t = simulate(tie), v = verdictCopy(t.stats, t.k, {setShare: t.setShare});
  check('W1 two identical rows with score wobble 0 are not reported as one settled winner', !(t.stats[0].ptop === 1 && /settled/.test(v.headline) && !/Nothing/.test(v.headline)), `Alpha P(top-1) ${pctStr(t.stats[0].ptop)}, Beta ${pctStr(t.stats[1].ptop)}; verdict "${v.headline}" [stable sort gives every tie to the upper row]`);
  const prop = mk([['Small', 2, 2, 2, 1], ['Double', 4, 4, 4, 2], ['Gamma', 2, 2, 2, 9]], {k: 1, sw: 0});
  const tp = simulate(prop);
  check('W1b rows with proportional scores (2,2,2 / 1 and 4,4,4 / 2: equal WSJF under every weighting) are not split 100/0', !(tp.stats[0].ptop === 1), `Small ${pctStr(tp.stats[0].ptop)}, Double ${pctStr(tp.stats[1].ptop)}`);
  // more settled items than places
  const eight = mk(Array.from({length: 8}, (_, i) => ['Item ' + (i + 1), 6, 6, 6, 5]), {k: 7, sw: 1});
  const ei = simulate(eight), ev = verdictCopy(ei.stats, ei.k, {setShare: ei.setShare});
  check('W2 "The top k is settled" is not printed when more than k items clear 85 % (8 interchangeable items, 7 places: each misses the cut about 1 run in 8)', !/^The top 7 is settled/.test(ev.headline), `"${ev.headline}" with P(top-7) ${ei.stats.map(s => pctStr(s.ptop)).join(', ')}`);
  const one = verdictCopy([{name: 'A', ptop: .97}, {name: 'B', ptop: .6}, {name: 'C', ptop: .11}, {name: 'D', ptop: .11}, {name: 'E', ptop: .11}, {name: 'F', ptop: .1}], 2);
  check('W3 a "genuine tie" names at least two contenders (here only B sits in the 15-85 % band)', !/a genuine tie between B —/.test(one.body), `"${one.body.trim()}"`);
  const bd = verdictCopy([{name: 'A', ptop: .97}, {name: 'B', ptop: .8496}, {name: 'C', ptop: .1834}], 2);
  check('W4 an item printed as "85%" is not simultaneously called unsettled (0.8496 prints 85 % but sits below the 85 % bar)', !(pctStr(.8496) === '85%' && bd.contested.some(s => s.name === 'B')), `pctStr(0.8496) = "${pctStr(.8496)}"; verdict "${bd.headline}"; contested list "B (${pctStr(.8496)})"`);
  const kn = simulate({...ALL[0].st, k: 5}), kv = verdictCopy(kn.stats, kn.k, {setShare: kn.setShare});
  check('W5 with capacity equal to the whole list the verdict does not call the ranking "settled" (every item is in the top 5 by definition)', !/settled/.test(kv.headline) || /Nothing/.test(kv.headline), `"${kv.headline}${kv.body}"`);
  const over = verdictCopy([{name: 'A', ptop: .86}, {name: 'B', ptop: .6}, {name: 'C', ptop: .54}], 2);
  check('W6 an 86 % item is not described as making the cut "under any reasonable weights" (it misses 14 % of reasonable weightings)', !/under any reasonable weights/.test(over.body), `"${over.body.trim().slice(0, 60)}..."`);
  // ±ww label vs the interval it stands for
  const frag = mk([['Anchor', 10, 1, 1, 1], ['Rival', 1, 9, 1.2, 1], ['Low', 1, 1, 1, 9]], {k: 1, sw: 0});
  const fa = flipAnalysis(frag), fc = flipCopy(fa, 50);
  const tail = Phi(Math.log(fa.easiest.newWeight / 3) / sigmaW(50));
  check('W7 "inside the ±50% you already call reasonable" is said only of reweightings inside the wobble\'s own 90 % interval (x1/1.5 = a 33 % cut at most)', !(fc.tone === 'fragile' && fa.easiest.newWeight / 3 < 1 / 1.5), `"${fc.text}" — a ${Math.abs(fa.easiest.pct).toFixed(0)} % cut has probability ${(100 * tail).toFixed(1)} % under the wobble`);
  check('W7b the copy-as-markdown footer "Weights perturbed ±50%" describes an interval that is -33 %/+50 % (recorded with W7; label only)', !/Weights perturbed ±/.test(appSrc), 'app.js: "_Weights perturbed ±" + w + "%, scores ±" + s');
  // tie at the top: zero-size flip
  const tied = mk([['Alpha', 6, 6, 6, 1], ['Beta', 8, 3, 6, 1], ['Low', 1, 1, 1, 9]], {k: 1});
  const tc = flipCopy(flipAnalysis(tied), 50);
  check('W8 a tie for first place is not described as a weight change of 0 % ("cut Value\'s weight 0% (3 → 3)")', !/0% \(3 → 3\)/.test(tc.text), `"${tc.text}"`);
  const near = flipCopy({top: {name: 'A'}, easiest: {criterion: 'Value', delta: 1.509, newWeight: 4.509, pct: 50.3, rivalName: 'B'}}, 50);
  check('W9 a reweighting that rounds to the wobble itself is not called "well beyond" it (50.3 % vs ±50 %)', !/50%, well beyond the ±50%/.test(near.text), `"${near.text}"`);
  // clamping disagreement between the table and the flip line
  const hot = mk([['Hot', 20, 1, 1, 1], ['Steady', 10, 10, 10, 1], ['Low', 1, 1, 1, 9]], {k: 1});
  const hs = simulate(hot), hf = flipAnalysis(hot);
  check('W10 the flip line\'s leader is the table\'s #1 when a score sits outside 1-10 (a paste or a link can put one there)', hf.top.name === hs.stats[hs.baseOrder[0]].name, `table #1 "${hs.stats[hs.baseOrder[0]].name}" (simulation clamps 20 -> 10); flip line: "${flipCopy(hf, 50).text}"`);
  const pasted = parsePaste('Hot, 20, 1, 1, 1\nSteady, 10, 10, 10, 1\nHalf, 5, 5, 5, 0.5');
  check('W10b the app\'s paste import clamps scores to 1-10 (it stores what it reads)', pasted.items.every(it => it.s.every(v => v >= 1 && v <= 10) && it.e >= 1 && it.e <= 10), `parsePaste stores ${pasted.items.map(it => it.name + ' [' + it.s.join(',') + '] / ' + it.e).join('; ')}`);
  const knifeHot = perRowKnife(mk([['Hot', 20, 1, 1, 2], ['Steady', 9, 9, 9, 3], ['Low', 1, 1, 1, 9]], {k: 1}));
  const simHot = simulate(mk([['Hot', 20, 1, 1, 2], ['Steady', 9, 9, 9, 3], ['Low', 1, 1, 1, 9]], {k: 1}));
  console.log(`   info: knife-edge reads raw 20 while the table uses 10: knife ${knifeHot.join(',')}; table order ${simHot.baseOrder.map(i => simHot.stats[i].name).join(' > ')}`);
  // damaged link: a short row
  const broken = {criteria: DEFAULT_CRITERIA.map(c => ({...c})), effort: {...DEFAULT_EFFORT}, k: 2, ww: 50, sw: 1,
    items: [{name: 'Damaged', s: [5, 5, 5], e: NaN}, {name: 'North', s: [9, 9, 9], e: 2}, {name: 'South', s: [3, 3, 3], e: 8}, {name: 'West', s: [6, 2, 6], e: 3}]};
  const br = simulate(broken), bk = perRowKnife(broken), html = rankResultRows(br, bk);
  const idxs = [...html.matchAll(/data-item-idx="(\d+)"/g)].map(m => +m[1]);
  const wrong = br.stats.filter(s => broken.items[s.i].name !== s.name).map(s => `stats "${s.name}" carries data-item-idx ${s.i} = state row "${broken.items[s.i].name}"`);
  check('W11 a link with one damaged row: each result row\'s data-item-idx (used for knife-edge, rename and live re-sort) points at its own initiative', wrong.length === 0, wrong.join('; '));
  // ranking diff
  const A = Array.from({length: 25}, (_, i) => 'Item ' + i), B = A.slice(); [B[10], B[11]] = [B[11], B[10]];
  const d = orderDiff(A, B), dc = orderDiffCopy(d);
  check('W12 ranking diff: an order with one swapped pair out of 300 does not print "agree on 100%"', !/agree on 100%/.test(dc), `"${dc}"`);
  let tauOk = true; const u = rng(5);
  for(let t = 0; t < 200; t++){ const n = 2 + Math.floor(u() * 12), a = Array.from({length: n}, (_, i) => 'x' + i), b = a.slice().sort(() => u() - .5);
    let c = 0, dd = 0; for(let i = 0; i < n; i++) for(let j = i + 1; j < n; j++){ const s = (i - j) * (b.indexOf(a[i]) - b.indexOf(a[j])); if(s > 0) c++; else dd++; }
    const r = orderDiff(a, b); if(Math.abs(r.tau - (c - dd) / (n * (n - 1) / 2)) > 1e-12) tauOk = false; }
  check('W13 Kendall tau equals a brute-force pair count on 200 random permutations', tauOk);
  const ci = orderDiff(['Alpha', 'beta ', 'Gamma'], ['GAMMA', 'Beta', 'alpha', 'Delta']);
  check('W14 ranking diff matches titles case- and space-insensitively and lists one-sided items', ci.common.length === 3 && ci.onlyB.length === 1 && ci.tau === -1);
  // knife-edge against an independent brute force
  let kOk = true;
  for(const {st} of ALL){ const kn2 = perRowKnife(st), base = st.items.map((it, i) => i).sort((a, b) => sc(st, st.criteria.map(c => c.w), b) - sc(st, st.criteria.map(c => c.w), a));
    const flags = st.items.map(() => false);
    st.criteria.forEach((c, ci) => { for(const m of [.9, 1.1]){ const w = st.criteria.map(x => x.w); w[ci] *= m;
      const o = st.items.map((it, i) => i).sort((a, b) => sc(st, w, b) - sc(st, w, a)); o.forEach((it, pos) => { if(base[pos] !== it){ flags[it] = true; flags[base[pos]] = true; } }); } });
    if(flags.join() !== kn2.join()) kOk = false; }
  function sc(st, w, i){ const it = st.items[i]; return w.reduce((a, x, c) => a + x * it.s[c], 0) / it.e; }
  check('W15 knife-edge flags equal a brute-force "rank changes under a ±10 % nudge of one weight" on all built-ins', kOk);
  check('W16 pctStr never prints a flat 0 % or 100 %: 1 -> ">99%", 0 -> "<1%", 0.996 -> ">99%", 0.004 -> "<1%"', pctStr(1) === '>99%' && pctStr(0) === '<1%' && pctStr(.996) === '>99%' && pctStr(.004) === '<1%');
  const md = /lines\.push\('\| ' \+ \(pos\+1\) \+ ' \| ' \+ s\.name \+ ' \| '/.test(appSrc);
  check('W17 copy-as-markdown escapes "|" in initiative names (a name like "Search | v2" splits the table row)', !md, 'app.js writes s.name into the table cell unescaped');
  check('Q1 recorded (RK-Q1): the effort column\'s weight is stored in links but never used (effort is a plain divisor)', !/effort\.w/.test(readFileSync(ROOT + 'rank/engine.js', 'utf8')));
  const top10 = []; { const uu = rng(1); for(let i = 0; i < 200000; i++) top10.push(Math.max(1, Math.min(10, 10 + (uu() * 2 - 1)))); }
  check('Q2 recorded (RK-Q2): score wobble is a uniform ±sw then clipped to 1-10, so a 10 averages 9.75 under ±1 (biased toward the middle), and it is a full range while the weight wobble is a 90 % interval', Math.abs(mean(top10) - 9.75) < .01, `mean of a wobbled 10: ${mean(top10).toFixed(3)}`);
  const huge = simulate({...ALL[0].st, sw: 100});
  check('Q3 recorded (RK-Q3): a link may carry sw = 100 or ww = 10000 (the UI clamps to 5 and 200, the link reader does not); sw = 100 turns every score into a coin flip between 1 and 10', huge.stats[0].ptop < .9, `Lantern at sw 100: Resume position P(top-3) ${pctStr(huge.stats[0].ptop)}`);
  const sl = sliderScale([3, 2, 1]);
  check('S1 slider scale: max = 2x the largest weight, step a 1/2/5 x 10^n', sl.max === 6 && Math.abs(sl.step - .1) < 1e-12);
}

console.log('\nBEFORE-VALUES (built-ins at default weights 3/2/1, ww 50, sw 1, seed 0x5EED, 4000 runs):');
for(const b of BEFORE) console.log(JSON.stringify(b));
done();
