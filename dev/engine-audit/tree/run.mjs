// Audit harness: tree (decision trees, Monte Carlo rollback). Run: node dev/engine-audit/tree/run.mjs  (about 30-60 s)
// Plain node, no dependencies. A check tagged [DEFECT] proves a confirmed defect and FAILS today; everything else is a
// covered-and-correct PASS. "recorded" checks pass when the behaviour they document (a modelling question) is demonstrated.
import {readFileSync} from 'node:fs';
import {check, done, rng} from './lib.mjs';
import {parse, parseMoney} from '../../../tree/parse.js';
import {evaluate, evalDet, loadBearing, sliderExtent, flipAlong, refMid} from '../../../tree/engine.js';
import {render, treeVerdictParts} from '../../../tree/render.js';
import {decisionComparisonProjection} from '../../../tree/comparison.js';
import {pricedCopy, seamCopy, shiftRange, formatRange, formatMoney, formatP, flipCopy, sharedStep} from '../../../tree/format.js';
import {fmt, quantile} from '../../../assets/series.js';
import {STARTER} from '../../../tree/starter.js';

const ROOT = new URL('../../../', import.meta.url);
const read = p => readFileSync(new URL(p, ROOT), 'utf8');
const EXAMPLES = [...read('tree/app.js').matchAll(/\{name: '([^']+)', src:\n`([^`]+)`\}/g)].map(m => ({name: m[1], src: m[2]}));
const CTX = {colors: {card: '#fff', border: '#ddd', ink: '#222', muted: '#667', accent: '#08c', bg: '#f7f8f6', err: '#b33', brandText: '#D62015'},
  measure: t => String(t).length * 7, today: '2026-11-13'};
const texts = svg => [...svg.matchAll(/>([^<>]+)</g)].map(x => x[1].replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&')).join(' | ');
const svgOf = (m, r, intent = 'native') => render(m, r, {...CTX, intent});

// ---------- independent reference maths ------------------------------------------------------------
const Z90 = 1.6448536269514722;                    // own constant (Phi^-1(0.95)); the engine uses 1.6448536
const lnMean = (lo, hi) => { const mu = (Math.log(lo) + Math.log(hi)) / 2, s = (Math.log(hi) - Math.log(lo)) / (2 * Z90); return Math.exp(mu + s * s / 2); };
const lnSd = (lo, hi) => { const mu = (Math.log(lo) + Math.log(hi)) / 2, s = (Math.log(hi) - Math.log(lo)) / (2 * Z90); return Math.sqrt((Math.exp(s * s) - 1) * Math.exp(2 * mu + s * s)); };
const rangeMean = r => r.lo === r.hi ? r.lo : r.lo > 0 ? lnMean(r.lo, r.hi) : (r.lo + r.hi) / 2;
// E[clamp(X, 0, 1)] for the probability law (log-normal if lo > 0 else normal) by 20001-point quadrature over z
function clampedMean(r){
  if(r.lo === r.hi) return Math.min(1, Math.max(0, r.lo));
  let s = 0, w = 0;
  for(let i = -10000; i <= 10000; i++){ const z = i / 1000, d = Math.exp(-z * z / 2);
    const x = r.lo > 0 ? Math.exp((Math.log(r.lo) + Math.log(r.hi)) / 2 + z * (Math.log(r.hi) - Math.log(r.lo)) / (2 * Z90)) : (r.lo + r.hi) / 2 + z * (r.hi - r.lo) / (2 * Z90);
    s += d * Math.min(1, Math.max(0, x)); w += d; }
  return s / w;
}
// own normal generator: mulberry32 (lib copy) + Box-Muller (not the engine's polar method)
function normalGen(seed){ const u = rng(seed); let spare = null;
  return () => { if(spare !== null){ const s = spare; spare = null; return s; }
    const a = Math.sqrt(-2 * Math.log(1 - u())), b = 2 * Math.PI * u(); spare = a * Math.sin(b); return a * Math.cos(b); }; }
const drawRange = (r, g) => r.lo === r.hi ? r.lo : r.lo > 0
  ? Math.exp((Math.log(r.lo) + Math.log(r.hi)) / 2 + g() * (Math.log(r.hi) - Math.log(r.lo)) / (2 * Z90))
  : (r.lo + r.hi) / 2 + g() * (r.hi - r.lo) / (2 * Z90);
const mean = a => { let s = 0; for(const v of a) s += v; return s / a.length; };
const sd = a => { const m = mean(a); let s = 0; for(const v of a) s += (v - m) ** 2; return Math.sqrt(s / (a.length - 1)); };
const sharedStepOf = (a, b) => { const m = Math.max(Math.abs(a), Math.abs(b)); return m > 0 ? Math.pow(10, Math.floor(Math.log10(m)) - 2) : 1; };   // the printed step of a sampled P10/P90 pair
const step3 = v => { const a = Math.abs(v); if(a === 0) return 1; const u = a >= 1e12 ? 1e12 : a >= 1e9 ? 1e9 : a >= 1e6 ? 1e6 : a >= 1e3 ? 1e3 : 1; return Math.pow(10, Math.floor(Math.log10(a / u)) - 2) * u; };

// ---------- independent reference rollback, written from the DSL + engine header semantics ----------
// point values only. chance: explicit p clamped to [0,1]; with rest: if explicit sum > 1 normalise explicit and rest = 0,
// else rest = 1 - sum; without rest: normalise if sum > 0, else no outcome contributes (EV = own). decision: own + max child
// (first wins ties). leaf: own. The reference walks the PARSED structure but recomputes everything itself.
function refEval(node, out = new Map(), probs = new Map()){
  const own = node.value ? node.value.lo : 0;
  let v;
  if(!node.children.length) v = own;
  else if(node.kind === 'decision'){
    const vals = node.children.map(c => refEval(c, out, probs));
    let bi = 0; for(let i = 1; i < vals.length; i++) if(vals[i] > vals[bi]) bi = i;
    out.set('pick:' + node.srcLine, bi); v = own + vals[bi];
  } else {
    const vals = node.children.map(c => refEval(c, out, probs));
    const raw = node.children.map(c => c.p === 'rest' ? null : Math.min(1, Math.max(0, c.p.lo)));
    const ri = raw.indexOf(null); let sum = raw.reduce((a, b) => a + (b ?? 0), 0);
    let ps;
    if(ri >= 0){ ps = raw.map(x => x ?? 0); if(sum > 1) ps = ps.map(x => x / sum), sum = 1; ps[ri] = 1 - sum; }
    else ps = sum > 0 ? raw.map(x => x / sum) : raw.map(() => 0);
    ps.forEach((p, i) => probs.set(node.children[i], p));
    v = own + ps.reduce((a, p, i) => a + p * vals[i], 0);
  }
  out.set(node, v);
  return v;
}
// random point-valued tree as DSL text
function randTreeText(r, {maxDepth = 4, ranged = false} = {}){
  const lines = [], money = () => { const v = Math.round((r() - 0.4) * 2000) * 1000; return String(v); };
  const rangeTxt = () => { const a = Math.round(r() * 900 + 100) * 1000, b = a + Math.round(r() * 900 + 1) * 1000; return r() < 0.3 ? (-b) + ' to ' + (-a) : a + ' to ' + b; };
  let id = 0;
  function node(depth, indent, prob){
    const label = 'N' + (id++);
    const leaf = depth >= maxDepth || (depth > 0 && r() < 0.35);
    let line = ' '.repeat(indent) + label + (prob ? ' (p=' + prob + ')' : '');
    if(leaf) line += ': ' + (ranged && r() < 0.5 ? rangeTxt() : money());
    else if(r() < 0.25) line += ': ' + money();
    lines.push(line);
    if(leaf) return;
    const k = 1 + Math.floor(r() * 3) + (depth === 0 ? 1 : 0), chance = depth > 0 && r() < 0.6;
    const useRest = chance && r() < 0.5;
    for(let i = 0; i < k; i++){
      let p = null;
      if(chance){ if(useRest && i === k - 1) p = 'rest'; else p = ranged && r() < 0.4 ? (Math.round(r() * 40) / 100) + '-' + (Math.round(r() * 40 + 41) / 100) : String(Math.round(r() * 10) / 10); }
      node(depth + 1, indent + 2, p);
    }
  }
  node(0, 0, null);
  return lines.join('\n');
}
const allNodes = root => { const out = []; (function w(n){ out.push(n); n.children.forEach(w); })(root); return out; };

console.log('== Tree engine audit ==  examples found in tree/app.js: ' + EXAMPLES.map(e => e.name).join(', '));
check('E0 both built-in examples were extracted from tree/app.js', EXAMPLES.length === 2, EXAMPLES.length + ' examples');

// =============================================================================================
// 1. PARSER
// =============================================================================================
{
  const pm = s => JSON.stringify(parseMoney(s));
  check('P1 parseMoney reads points, suffixes, currency signs, commas and "to" ranges', pm('£2M') === '{"lo":2000000,"hi":2000000}' && pm('-150k') === '{"lo":-150000,"hi":-150000}'
    && pm('2M-5M') === '{"lo":2000000,"hi":5000000}' && pm('-1M to -0.5M') === '{"lo":-1000000,"hi":-500000}' && pm('1,250') === '{"lo":1250,"hi":1250}' && pm('5M to 2M') === '{"lo":2000000,"hi":5000000}');
  check('P2 DSL.md shared convention "a range (30-50, or 30–50 with an en-dash)": tree reads an en-dash range', parseMoney('2M–5M') !== null, 'parseMoney("2M–5M") = ' + pm('2M–5M'));
  check('P3 the minus sign the tree itself prints ("−£150k", U+2212) reads back as a value', parseMoney('−150k') !== null, 'parseMoney("−150k") = ' + pm('−150k'));
  console.log('   info: parseMoney silently refuses "1e6" -> ' + pm('1e6') + ', "5." -> ' + pm('5.') + ', "+5" -> ' + pm('+5') + ', "50%" -> ' + pm('50%'));
  const en = parse('Root\n  A: 2M–5M\n  B: 1M');
  check('P2b an en-dash value is not silently replaced by 0 (A: 2M–5M)', en.root.children[0].value.hi !== 0, 'A parsed as label "' + en.root.children[0].label + '" value ' + JSON.stringify(en.root.children[0].value) + '; warnings: ' + en.warnings.join(' / '));

  // a time or ratio in a label is read as the payoff
  const t = parse('Root\n  Meet at 10:30\n    Go (p=0.5): 100k\n    Stay (p=rest): 0\n  Skip: 20k');
  const meet = t.root.children[0];
  check('P4 a label containing a colon-number ("Meet at 10:30") is not silently read as a payoff of 30', meet.value === null, 'label "' + meet.label + '", value ' + JSON.stringify(meet.value) + ', warnings ' + JSON.stringify(t.warnings));

  // percent probabilities read as probabilities; an unreadable one is warned and never makes a decision (TR-1)
  const pc = parse('Root\n  Launch\n    Works (p=40%): 1M\n    Fails (p=60%): -500k\n  Hold: 100k');
  const r = evaluate(pc), launch = pc.root.children[0];
  console.log('   info: "Works (p=40%) / Fails (p=60%)": Launch kind ' + launch.kind + ', Launch EV ' + fmt(r.stats.get(launch).mean) + ', rec ' + r.policy.get(pc.root).label + '; warnings ' + JSON.stringify(pc.warnings));
  check('P5 unreadable probabilities on every sibling (p=40% / p=60%) do not turn the chance node into a decision that picks the best outcome', launch.kind === 'chance', 'Launch became a "' + launch.kind + '" node: EV ' + fmt(r.stats.get(launch).mean) + ' (the 1M outcome is CHOSEN); a chance reading at 0.4/0.6 gives ' + fmt(0.4 * 1e6 - 0.6 * 5e5));
  check('P5a ...and p=40% / p=60% read as 0.4 / 0.6 with no warning', pc.warnings.length === 0 && Math.abs(pc.root.children[0].children[0].p.lo - 0.4) < 1e-12 && Math.abs(r.stats.get(launch).mean - 100000) < 1e-6, JSON.stringify(pc.warnings));
  const unread = parse('Root\n  Launch\n    Works (p=likely): 1M\n    Fails (p=unlikely): -500k\n  Hold: 100k');
  check('P5b ...and a genuinely unreadable probability on every sibling still warns for each, naming its line, and the node stays a chance node', unread.warnings.filter(w => /unreadable probability/.test(w)).length === 2 && unread.warnings.some(w => w.includes('line 3')) && unread.root.children[0].kind === 'chance', JSON.stringify(unread.warnings));

  // DSL.md example parses clean and evaluates
  const dsl = read('DSL.md'), blk = dsl.slice(dsl.indexOf('```dsl tool=tree') + 16); const src = blk.slice(0, blk.indexOf('```')).trim();
  const dm = parse(src), dr = evaluate(dm);
  check('P6 DSL.md tree example parses with no warnings and recommends Submit bid at 0.4*900k + 0.6*(-150k) = 270k', !dm.warnings.length && dr.policy.get(dm.root).label === 'Submit bid' && Math.abs(dr.stats.get(dm.root).mean - 270000) < 1e-6, fmt(dr.stats.get(dm.root).mean));
  const sm = parse(STARTER), sr = evaluate(sm);
  check('P7 starter parses and evaluates without warnings', !sm.warnings.length && !sr.warnings.length, JSON.stringify([...sm.warnings, ...sr.warnings]));

  // hostile inputs never throw
  const hostile = ['', '   \n\n', 'Only', '__proto__: 5\n  constructor (p=0.5): 1\n  toString (p=rest): 2', 'A\n B\n   C: 1', 'A\n  B (p=-0.5): 1\n  C (p=1.5): 2',
    'A\n  B (p=rest): 1\n  C (p=rest): 2', 'A\n  B (p=0): 1\n  C (p=0): 2', 'A\n' + Array.from({length: 60}, (_, i) => ' '.repeat(2 * (i + 1)) + 'L' + i).join('\n') + ': 5',
    'Root\n' + Array.from({length: 300}, (_, i) => '  O' + i + ': ' + i + 'k').join('\n'), 'A\n  B: 1e308 to 9b\n  C: 99999999999999b', 'R\n  X (p=0.5): 1\n  Y (p=0.5): 2\n  Z: 3', 'A: 5\nB: 6\nC (p=0.5): 1'];
  let threw = null, nan = null;
  for(const h of hostile){ try{ const m = parse(h); const res = evaluate(m, {sims: 400}); if(m.root){ const svg = svgOf(m, res); if(/NaN|undefined/.test(svg)) nan = nan || h.slice(0, 40); render(m, res, {...CTX, intent: 'presentation'}); render(m, res, {...CTX, intent: 'live-narrow', width: 360}); } } catch(e){ threw = threw || (h.slice(0, 30) + ' -> ' + e.message); } }
  check('P8 hostile inputs (empty, single node, __proto__ labels, odd indent, negative/over-1 p, two rests, all-zero p, 60-deep, 300-wide, huge numbers, chance root) never throw', threw === null, threw || '');
  check('P9 ...and no rendering prints NaN or undefined', nan === null, nan || '');
  const zeros = parse('Root\n  A\n    B (p=0): 1M\n    C (p=0): 2M\n  D: 10'), zr = evaluate(zeros, {sims: 1000});
  check('P10 all-zero probabilities warn ("no outcome contributed in 1000 of 1000 sampled worlds")', zr.warnings.some(w => /1000 of 1000/.test(w)), zr.warnings.join(' / '));
  const two = parse('R\n  A\n    X (p=rest): 1\n    Y (p=rest): 2\n  B: 0');
  check('P11 a second p=rest is rejected with a warning and given p=0', two.warnings.some(w => /second p=rest/.test(w)) && two.root.children[0].children[1].p.hi === 0);
  const imp = parse('Win (p=0.5): 10\nLose (p=rest): 0');
  check('P12 a chance root made of several top-level lines carrying p= is not labelled "Decision" (TR-16); a decision root still is', imp.root.implicit && imp.root.kind === 'chance' && imp.root.label !== 'Decision' && parse('A: 10\nB: 20').root.label === 'Decision', imp.root.kind + ' "' + imp.root.label + '"');
  const sum98 = parse('R\n  A\n    X (p=0.49): 1\n    Y (p=0.49): 2\n  B: 0'), s98 = evaluate(sum98, {sims: 100});
  const sum981 = parse('R\n  A\n    X (p=0.49): 1\n    Y (p=0.491): 2\n  B: 0'), s981 = evaluate(sum981, {sims: 100});
  check('P13 the "probabilities sum to X — normalised" warning boundary: |sum-1| > 0.02 warns, 0.981 does not; at exactly 0.98 the float 1-0.98 = 0.020000000000000018 makes it warn "sum to 0.98"', s98.warnings.length === 1 && s981.warnings.length === 0, JSON.stringify(s98.warnings));
}

// =============================================================================================
// 2. POINT-VALUED TREES ARE EXACT: engine == independent reference rollback (500 random trees)
// =============================================================================================
{
  const r = rng(20261113); let bad = null, n = 0, checkedNodes = 0, effBad = null, detBad = null;
  for(let t = 0; t < 500; t++){
    const txt = randTreeText(r), m = parse(txt); if(!m.root) continue;
    const res = evaluate(m, {sims: 64}); const ref = new Map(), probs = new Map(); refEval(m.root, ref, probs); n++;
    for(const node of allNodes(m.root)){
      checkedNodes++;
      const s = res.stats.get(node), want = ref.get(node);
      if(!s || Math.abs(s.mean - want) > 1e-6 * Math.max(1, Math.abs(want)) || s.p10 !== s.p90){ bad = bad || {txt, node: node.label, got: s && s.mean, want}; }
      if(probs.has(node) && Math.abs((res.effectiveProbability.get(node) ?? NaN) - probs.get(node)) > 1e-9) effBad = effBad || {txt, node: node.label, got: res.effectiveProbability.get(node), want: probs.get(node)};
      if(node.kind === 'decision' && node.children.length){ const pick = res.policy.get(node), want2 = node.children[ref.get('pick:' + node.srcLine)];
        if(pick !== want2 && Math.abs(ref.get(pick) - ref.get(want2)) > 1e-9) bad = bad || {txt, node: node.label, policy: pick.label, want: want2.label}; }
    }
    if(m.root.kind === 'decision'){ const d = evalDet(m); const want = ref.get(m.root); if(Math.abs(Math.max(...d.values) - want) > 1e-6 * Math.max(1, Math.abs(want))) detBad = detBad || {txt, det: d.values, want}; }
  }
  check('R1 random point-valued trees (' + n + ' trees, ' + checkedNodes + ' nodes): every node mean, P10 = P90, and every decision pick equal the independent rollback', bad === null, bad ? JSON.stringify(bad).slice(0, 400) : '');
  check('R2 ...every effective probability equals the reference (clamp, rest, normalise, all-zero)', effBad === null, effBad ? JSON.stringify(effBad).slice(0, 400) : '');
  check('R3 ...and the midpoint rollback (evalDet) best value equals the reference root value', detBad === null, detBad ? JSON.stringify(detBad).slice(0, 400) : '');
  // effective probabilities sum to one wherever anything contributes
  let sumBad = null;
  for(let t = 0; t < 200; t++){ const m = parse(randTreeText(r, {ranged: true})); const res = evaluate(m, {sims: 500});
    for(const node of allNodes(m.root)) if(node.kind === 'chance'){ const s = node.children.reduce((a, c) => a + res.effectiveProbability.get(c), 0); const zero = res.noOutcome.get(node) || 0;
      if(Math.abs(s - (1 - zero / 500)) > 1e-9) sumBad = sumBad || {s, zero}; } }
  check('R4 effective probabilities at every chance node sum to (1 - share of no-outcome worlds), 200 random ranged trees', sumBad === null, JSON.stringify(sumBad));
}

// =============================================================================================
// 3. INVARIANTS
// =============================================================================================
{
  const r = rng(77); let scaleBad = null, orderBad = null;
  for(let t = 0; t < 150; t++){
    const txt = randTreeText(r, {ranged: true}), m = parse(txt), res = evaluate(m, {sims: 2000});
    // scale every money figure by 3 (log-normal and normal both scale exactly with the same draws)
    const scaled = txt.replace(/(:\s*)(-?\d+)( to (-?\d+))?$/gm, (all, c, a, _, b) => c + (3 * a) + (b !== undefined ? ' to ' + (3 * b) : ''));
    const m2 = parse(scaled), res2 = evaluate(m2, {sims: 2000});
    const a = res.stats.get(m.root).mean, b = res2.stats.get(m2.root).mean;
    if(Math.abs(b - 3 * a) > 1e-6 * Math.max(1, Math.abs(3 * a))) scaleBad = scaleBad || {txt, a, b};
  }
  check('I1 expected value is linear in payoffs: multiplying every payoff by 3 multiplies every root EV by exactly 3 (150 random ranged trees, same seed)', scaleBad === null, scaleBad ? JSON.stringify(scaleBad).slice(0, 300) : '');
  for(let t = 0; t < 300; t++){
    const m = parse(randTreeText(r)); if(m.root.kind !== 'decision') continue;
    const res = evaluate(m, {sims: 32}), ref = new Map(); refEval(m.root, ref);
    const rev = m.root.children.slice().reverse(); const before = ref.get(res.policy.get(m.root));
    m.root.children = rev; const res2 = evaluate(m, {sims: 32}); const after = res2.stats.get(res2.policy.get(m.root)).mean;
    if(Math.abs(before - after) > 1e-6 * Math.max(1, Math.abs(before))) orderBad = orderBad || {before, after};
  }
  check('I2 order invariance (point trees): reversing the root options leaves the recommended value unchanged', orderBad === null, JSON.stringify(orderBad));

  // shift invariance: subtract a constant from every payoff -> the recommendation should not change
  const base = parse('Root\n  Venture: 1k to 100k\n  Safe: 30k'), b = evaluate(base);
  const shifted = parse('Root\n  Venture: -49k to 50k\n  Safe: -20k'), s = evaluate(shifted);
  console.log('   info: Venture 1k..100k vs Safe 30k: Venture EV ' + fmt(b.stats.get(base.root.children[0]).mean) + ' (exact log-normal mean ' + fmt(lnMean(1e3, 1e5)) + ') -> ' + b.policy.get(base.root).label
    + '; subtract 50k from every payoff: Venture EV ' + fmt(s.stats.get(shifted.root.children[0]).mean) + ' vs Safe -20k -> ' + s.policy.get(shifted.root).label);
  check('I3 shift invariance: subtracting the same 50k from every payoff does not change which option is recommended (1k..100k vs 30k)', b.policy.get(base.root).label === s.policy.get(shifted.root).label,
    'recommendation flips from ' + b.policy.get(base.root).label + ' to ' + s.policy.get(shifted.root).label + ': a range with lo > 0 is log-normal (mean ' + fmt(lnMean(1e3, 1e5)) + ', not the midpoint 50.5k), a range touching 0 or below is normal', {known: true, reason: 'TR-2: distribution rule kept (a modelling question)'});
  // continuity at lo = 0
  const evA = src => { const m = parse(src); return evaluate(m).stats.get(m.root.children[0]).mean; };
  const e0 = evA('R\n  A: 0 to 100k\n  B: 0'), e1 = evA('R\n  A: 1 to 100k\n  B: 0'), e2 = evA('R\n  A: 1k to 100k\n  B: 0');
  console.log('   info: EV of a payoff "0 to 100k" ' + fmt(e0) + ', "1 to 100k" ' + fmt(e1) + ' (exact ' + fmt(lnMean(1, 1e5)) + '), "1k to 100k" ' + fmt(e2) + ' (exact ' + fmt(lnMean(1e3, 1e5)) + ')');
  check('I4 continuity: moving a range\'s low end from 0 to 1 (out of 100k) moves its EV by under 5 %', Math.abs(e1 - e0) / e0 < 0.05, 'EV ' + fmt(e0) + ' -> ' + fmt(e1) + ' (' + (100 * (e1 - e0) / e0).toFixed(0) + ' %)', {known: true, reason: 'TR-2: distribution rule kept (a modelling question)'});
  // EV above the stated range
  const wide = parse('R\n  A: 0.001 to 100\n  B: 0'), wr = evaluate(wide), wa = wr.stats.get(wide.root.children[0]);
  check('I5 the expected value of a payoff stated as "0.001 to 100" lies within its stated 90 % range', wa.mean <= 100, 'prints EV ' + fmt(wa.mean) + ' (exact log-normal mean ' + fmt(lnMean(0.001, 100)) + '), above the stated top of 100', {known: true, reason: 'TR-2: distribution rule kept (a modelling question)'});
}

// =============================================================================================
// 4. SAMPLED FIGURES: exactness where closed forms exist, bias and seed noise of printed figures
// =============================================================================================
{
  // single log-normal leaf: engine mean vs exact (sampling error only)
  const m = parse('R\n  A: 2M to 5M\n  B: 0'), r = evaluate(m), a = r.stats.get(m.root.children[0]);
  const ex = lnMean(2e6, 5e6), se = lnSd(2e6, 5e6) / 100;
  check('S1 a log-normal leaf 2M..5M: engine mean within 4 standard errors of the exact mean ' + fmt(ex), Math.abs(a.mean - ex) < 4 * se, fmt(a.mean) + ' vs ' + fmt(ex) + ' (' + ((a.mean - ex) / se).toFixed(2) + ' SE)');
  const z = Z90, mu = (Math.log(2e6) + Math.log(5e6)) / 2, s = (Math.log(5e6) - Math.log(2e6)) / (2 * z);
  const exQ = [Math.exp(mu - 1.2815515655446004 * s), Math.exp(mu + 1.2815515655446004 * s)], st2 = sharedStepOf(exQ[0], exQ[1]);
  const runs2 = Array.from({length: 40}, (_, i) => { const mm = parse('R\n  A: 2M to 5M\n  B: 0'); return evaluate(mm, {seed: 1000 + 7 * i}).stats.get(mm.root.children[0]); }), evs2 = runs2.map(x => x.mean);
  const S2ok = evs2.every(v => v === evs2[0] && Math.abs(v - ex) < 1e-6 * ex) && sd(runs2.map(x => x.p10)) <= st2 / 2 && sd(runs2.map(x => x.p90)) <= st2 / 2;
  check('S2 ...its expected value is the exact mean, identical at all 40 seeds, and the sd of its P10/P90 over 40 seeds is at most half the shared printed step (' + fmt(st2) + ')', S2ok, fmt(a.mean) + '; ' + fmt(a.p10) + '/' + fmt(a.p90) + ' vs ' + fmt(exQ[0]) + '/' + fmt(exQ[1]));

  // built-in examples: exact means by closed form; quantiles and head-to-head by a 400k-draw independent reference
  const bid = EXAMPLES[0], bm = parse(bid.src), br = evaluate(bm);
  const pW = {lo: 0.3, hi: 0.45}, vW = {lo: 2e6, hi: 5e6};
  const bidExact = -150e3 + clampedMean(pW) * rangeMean(vW);
  const bidEng = br.stats.get(bm.root).mean;
  console.log('   info: Bid or no bid: engine EV ' + bidEng.toFixed(0) + ', exact ' + bidExact.toFixed(0) + ' (' + (100 * (bidEng - bidExact) / bidExact).toFixed(2) + ' %); effective p(Win) ' + br.effectiveProbability.get(bm.root.children[0].children[0].children[0]).toFixed(4) + ' vs exact ' + clampedMean(pW).toFixed(4) + ' (authored midpoint 0.375)');
  check('S3 Bid or no bid: printed EV ' + fmt(bidEng) + ' equals the exact EV printed at 3 s.f. (' + fmt(bidExact) + ')', fmt(bidEng) === fmt(bidExact));
  // p*V is log-normal: exact P10/P90 of the Submit bid EV
  const muP = (Math.log(0.3) + Math.log(0.45)) / 2, sP = (Math.log(0.45) - Math.log(0.3)) / (2 * z), muV = (Math.log(2e6) + Math.log(5e6)) / 2, sV = (Math.log(5e6) - Math.log(2e6)) / (2 * z);
  const sPV = Math.hypot(sP, sV), q = k => -150e3 + Math.exp(muP + muV + k * 1.2815515655446004 * sPV);
  const bs = br.stats.get(bm.root);
  const stB = sharedStepOf(q(-1), q(1)), S4ok = Math.abs(bs.p10 - q(-1)) <= stB && Math.abs(bs.p90 - q(1)) <= stB;
  check('S4 Bid or no bid: printed P10 ' + fmt(bs.p10) + ' / P90 ' + fmt(bs.p90) + ' within one shared printed step (' + fmt(stB) + ') of the exact quantiles (' + fmt(q(-1)) + ' / ' + fmt(q(1)) + ')', S4ok, 'P10 ' + bs.p10.toFixed(0) + ' vs ' + q(-1).toFixed(0) + ', P90 ' + bs.p90.toFixed(0) + ' vs ' + q(1).toFixed(0));
  // bias check: mean of 40 seeds of the Bid EV against the exact mean (no bias, only noise)
  const bidSeeds = Array.from({length: 40}, (_, i) => { const m = parse(bid.src); return evaluate(m, {seed: 500 + i}).stats.get(m.root).mean; });
  check('S4b Bid or no bid: no bias, only noise: the 40-seed average EV is within 3 standard errors of the exact EV', Math.abs(mean(bidSeeds) - bidExact) < 3 * sd(bidSeeds) / Math.sqrt(40), (mean(bidSeeds) - bidExact).toFixed(0) + ' off, SE ' + (sd(bidSeeds) / Math.sqrt(40)).toFixed(0));

  const bb = EXAMPLES[1], m2 = parse(bb.src), r2 = evaluate(m2);
  const [build, buy, none] = m2.root.children;
  const buildExact = -550e3 + clampedMean({lo: 0.5, hi: 0.7}) * lnMean(1.5e6, 2.5e6) + (1 - clampedMean({lo: 0.5, hi: 0.7})) * lnMean(8e5, 1.2e6);
  const buyExact = -250e3 + clampedMean({lo: 0.6, hi: 0.8}) * lnMean(1e6, 1.6e6) + (1 - clampedMean({lo: 0.6, hi: 0.8})) * lnMean(2e5, 6e5);
  check('S5 Build vs buy: Build EV ' + fmt(r2.stats.get(build).mean) + ' and Buy EV ' + fmt(r2.stats.get(buy).mean) + ' equal the exact EVs at 3 s.f. (' + fmt(buildExact) + ', ' + fmt(buyExact) + ')', fmt(r2.stats.get(build).mean) === fmt(buildExact) && fmt(r2.stats.get(buy).mean) === fmt(buyExact),
    '(TR-6) Build ' + r2.stats.get(build).mean.toFixed(0) + ' vs ' + buildExact.toFixed(0) + '; Buy ' + r2.stats.get(buy).mean.toFixed(0) + ' vs ' + buyExact.toFixed(0));
  // reference MC for quantiles and head-to-head
  const g = normalGen(99), N = 400000, B = new Float64Array(N), U = new Float64Array(N); let wins = 0;
  for(let i = 0; i < N; i++){
    const pb = Math.min(1, drawRange({lo: 0.5, hi: 0.7}, g)); B[i] = drawRange({lo: -7e5, hi: -4e5}, g) + pb * drawRange({lo: 1.5e6, hi: 2.5e6}, g) + (1 - pb) * drawRange({lo: 8e5, hi: 1.2e6}, g);
    const pu = Math.min(1, drawRange({lo: 0.6, hi: 0.8}, g)); U[i] = -250e3 + pu * drawRange({lo: 1e6, hi: 1.6e6}, g) + (1 - pu) * drawRange({lo: 2e5, hi: 6e5}, g);
    if(B[i] > U[i]) wins++;
  }
  const Bs = Float64Array.from(B).sort(), share = wins / N;
  const h = r2.headToHead.find(x => x.aNode === build && x.bNode === buy);
  check('S6 Build vs buy: printed P10 ' + fmt(r2.stats.get(build).p10) + ' / P90 ' + fmt(r2.stats.get(build).p90) + ' within one shared printed step of a 400k-draw reference (' + fmt(quantile(Bs, 0.1)) + ' / ' + fmt(quantile(Bs, 0.9)) + ')',
    (() => { const st = sharedStepOf(quantile(Bs, 0.1), quantile(Bs, 0.9)); return Math.abs(r2.stats.get(build).p10 - quantile(Bs, 0.1)) <= st && Math.abs(r2.stats.get(build).p90 - quantile(Bs, 0.9)) <= st; })(),
    'P10 ' + r2.stats.get(build).p10.toFixed(0) + ' vs ' + quantile(Bs, 0.1).toFixed(0) + ', P90 ' + r2.stats.get(build).p90.toFixed(0) + ' vs ' + quantile(Bs, 0.9).toFixed(0));
  check('S7 Build vs buy: "higher expected value than Buy vendor product in ' + Math.round(h.aShare * 100) + '% of simulations" matches the reference ' + (100 * share).toFixed(1) + ' % to the printed whole percent', Math.round(h.aShare * 100) === Math.round(share * 100), 'engine ' + (100 * h.aShare).toFixed(2) + ' %, reference ' + (100 * share).toFixed(2) + ' %');

  // seed noise of every printed figure on the examples
  const SEEDS = Array.from({length: 40}, (_, i) => 1000 + 7 * i);
  for(const ex of EXAMPLES){
    const acc = {};
    const add = (k, v) => (acc[k] = acc[k] || []).push(v);
    for(const seed of SEEDS){ const m = parse(ex.src), res = evaluate(m, {seed});
      add('root EV', res.stats.get(m.root).mean); add('root P10', res.stats.get(m.root).p10); add('root P90', res.stats.get(m.root).p90);
      m.root.children.forEach(c => add('EV ' + c.label, res.stats.get(c).mean));
      res.headToHead.forEach(x => add('h2h% ' + x.a + '/' + x.b, 100 * x.aShare));
      add('rec ' + res.policy.get(m.root).label, 1); }
    const pairStep = sharedStepOf(mean(acc['root P10']), mean(acc['root P90']));
    const worst = Object.entries(acc).filter(([k]) => !k.startsWith('rec')).map(([k, v]) => { const st = k.startsWith('h2h') ? 1 : /^root P(10|90)$/.test(k) ? pairStep : step3(mean(v)); return [k, sd(v) / st, sd(v), st]; }).sort((a, b) => b[1] - a[1]);
    console.log('   info: ' + ex.name + ' seed sd / printed step: ' + worst.map(([k, r]) => k + ' ' + r.toFixed(2)).join(', ') + '; recommendation over 40 seeds: ' + Object.keys(acc).filter(k => k.startsWith('rec')).join(', '));
    check('S8 ' + ex.name + ': the recommendation is identical on all 40 seeds', Object.keys(acc).filter(k => k.startsWith('rec')).length === 1);
    const over = worst.filter(w => w[1] > 0.5);
    check('S9 ' + ex.name + ': over 40 seeds the sd of every printed sampled figure is at most half its printed step (P10/P90 on one shared step, expected values 3 s.f., head-to-head whole percent)', over.length === 0, over.map(([k, r, s, st]) => k + ' sd ' + fmt(s) + ' vs step ' + fmt(st) + ' (' + r.toFixed(2) + ')').join('; '));
  }

  // Monte Carlo noise picks the recommendation when two options are close
  const exA = lnMean(1e5, 2e5), close = Math.round(exA * 0.999);
  const cm = 'R\n  Ranged: 100k to 200k\n  Fixed: ' + close; let wrong = 0;
  for(const seed of SEEDS){ const m = parse(cm), res = evaluate(m, {seed}); if(res.policy.get(m.root).label !== 'Ranged') wrong++; }
  const m0 = parse(cm), r0 = evaluate(m0);
  console.log('   info: "Ranged 100k to 200k" (exact mean ' + exA.toFixed(0) + ') vs "Fixed ' + close + '": default seed recommends ' + r0.policy.get(m0.root).label + '; ' + wrong + ' of 40 seeds recommend Fixed');
  check('S10 the recommendation is the option with the higher exact EV even when the margin (0.1 %) is below Monte Carlo noise: 100k..200k vs a point 0.1 % below its exact mean', r0.policy.get(m0.root).label === 'Ranged',
    'default seed recommends ' + r0.policy.get(m0.root).label + ' (EV ' + fmt(r0.stats.get(m0.root).mean) + ' printed beside an alternative at ' + fmt(close) + '); ' + wrong + '/40 seeds choose the lower-EV option; the verdict gives no sign the call is a coin toss');
  check('S10b across 40 seeds the near-tie recommendation is always the higher-exact-EV option (it is not decided by Monte Carlo noise)', wrong === 0, wrong + '/40 seeds recommend the option whose exact EV is 0.1 % lower');

  // very wide log-normal: EV seed noise
  const wideAcc = SEEDS.map(seed => { const m = parse('R\n  A: 1k to 1b\n  B: 0'); return evaluate(m, {seed}).stats.get(m.root.children[0]).mean; });
  console.log('   info: "1k to 1b": exact mean ' + fmt(lnMean(1e3, 1e9)) + '; printed EV over 40 seeds ranges ' + fmt(Math.min(...wideAcc)) + ' .. ' + fmt(Math.max(...wideAcc)));
  check('S11 a very wide payoff ("1k to 1b") prints an EV within 10 % of its exact mean on the default seed', (() => { const m = parse('R\n  A: 1k to 1b\n  B: 0'); const v = evaluate(m).stats.get(m.root.children[0]).mean; return Math.abs(v / lnMean(1e3, 1e9) - 1) < 0.1; })(),
    'seed range ' + fmt(Math.min(...wideAcc)) + '..' + fmt(Math.max(...wideAcc)) + ' vs exact ' + fmt(lnMean(1e3, 1e9)));

  // probability means differ from the authored midpoint
  const pz = parse('R\n  A\n    Hit (p=0-0.2): 1M\n    Miss (p=rest): 0\n  B: 0'), pr = evaluate(pz), hit = pz.root.children[0].children[0];
  console.log('   info: p=0-0.2 is normal then clamped: effective ' + pr.effectiveProbability.get(hit).toFixed(4) + ' (exact ' + clampedMean({lo: 0, hi: 0.2}).toFixed(4) + ') vs authored midpoint 0.1; p=0.9-1: effective '
    + (() => { const m = parse('R\n  A\n    Hit (p=0.9-1): 1M\n    Miss (p=rest): 0\n  B: 0'); return evaluate(m).effectiveProbability.get(m.root.children[0].children[0]).toFixed(4); })() + ' (exact ' + clampedMean({lo: 0.9, hi: 1}).toFixed(4) + ')');
  check('S12 recorded: an authored probability range is a 90 % interval (log-normal when lo > 0, normal otherwise) clamped to [0,1], so its effective weight is not its midpoint (p=0-0.2 -> ' + clampedMean({lo: 0, hi: 0.2}).toFixed(4) + ')', Math.abs(clampedMean({lo: 0, hi: 0.2}) - 0.1) > 0.001);
}

// =============================================================================================
// 5. FLIPS, PRICED INSISTENCE, MIDPOINT vs MONTE CARLO
// =============================================================================================
{
  // threshold is printed in pre-normalisation units
  const src = 'R\n  Pilot\n    Adopt (p=0.3): 1M\n    Reject (p=0.7): 0\n  Wait: 350k';
  const m = parse(src), res = evaluate(m), f = res.flips.find(x => x.label === 'Adopt');
  const svg = texts(svgOf(m, res));
  const printed = (svg.match(/flips if p\(Adopt\) ([<>]) ([\d.]+)/) || []).slice(1);
  // independent: Adopt's normalised probability q at which 1M*q = 350k is 0.35
  check('F1 "flips if p(Adopt) > t": the printed t is the probability at which the call flips (0.35, since 1M x 0.35 = 350k)', printed[1] === '0.35', 'prints "flips if p(Adopt) ' + printed.join(' ') + '": the raw input before the silent renormalisation against Reject (p=0.7); at p(Adopt)=0.38 the normalised probability is ' + (0.38 / 1.08).toFixed(3));
  const ext = sliderExtent({kind: 'prob', line: 2}, m), copy = pricedCopy({winnerLabel: 'Wait', kind: 'prob', label: 'Adopt', currency: '£', x: 0.3, boundary: ext.flips.above, trackLo: 0, trackHi: 1});
  check('F1b the priced-insistence slider line names the probability at which the call flips (35%)', /above 35%/.test(copy), copy);

  // non-monotone flip with a rest sibling: every boundary is listed (TR-8)
  const nm = parse('R\n  A\n    Z (p=0.8): 100\n    X (p=0.2): 60\n    Rest (p=rest): 0\n  B: 85'), nr = evaluate(nm);
  const fx = nr.flips.find(x => x.label === 'X'), fl = flipAlong(nm, {kind: 'prob', line: 3}, {lo: 0, hi: 1});
  check('F2 a probability whose effect is non-monotone (X between a high sibling and a zero rest) lists every flip: boundaries at ' + fl.boundaries.map(b => b.toFixed(3)).join(' and '), fx.boundaries.length === fl.boundaries.length && fl.boundaries.every((b, i) => Math.abs(b - fx.boundaries[i]) < 1e-6) && texts(svgOf(nm, nr)).includes(flipCopy(fx)),
    'prints "' + flipCopy(fx) + '"');

  // out-of-domain probabilities: midpoint story does not clamp, Monte Carlo does
  const od = parse('R\n  A\n    Up (p=0.5): 100\n    Down (p=-0.2): -100\n  B: 150'), orr = evaluate(od);
  const det = evalDet(od);
  console.log('   info: Up p=0.5 / Down p=-0.2 (warned): Monte Carlo A EV ' + orr.stats.get(od.root.children[0]).mean + ' (Down clamped to 0), midpoint story A value ' + det.values[0].toFixed(1) + ' (unclamped: (50 + 20) / 0.3); MC rec ' + orr.policy.get(od.root).label + ', midpoint rec ' + det.rec.label);
  check('F3 an out-of-range probability (p=-0.2, warned) is treated the same by the midpoint story as by the Monte Carlo (clamped)', det.values[0] === orr.stats.get(od.root.children[0]).mean,
    'midpoint values A ' + det.values[0] + ' vs MC ' + orr.stats.get(od.root.children[0]).mean + '; seam prints "' + seamCopy(det.rec?.label, orr.policy.get(od.root).label) + '"; flips are computed on the unclamped story');

  // seam: midpoint vs MC can disagree; the flips list is midpoint-based but carries no midpoint label
  const sm = parse('R\n  Bold: 10k to 1M\n  Safe: 450k'), sr = evaluate(sm), sd2 = evalDet(sm);
  const seam = seamCopy(sd2.rec.label, sr.policy.get(sm.root).label), stext = texts(svgOf(sm, sr));
  console.log('   info: Bold 10k..1M vs Safe 450k: MC rec ' + sr.policy.get(sm.root).label + ' (Bold EV ' + fmt(sr.stats.get(sm.root.children[0]).mean) + '), midpoint rec ' + sd2.rec.label + ' (505k); seam "' + seam + '"');
  check('F4 when the midpoint story and the Monte Carlo disagree (Bold 10k..1M vs Safe 450k), the exported "WHAT WOULD FLIP THIS" list says it is about the midpoint story', !/WHAT WOULD FLIP THIS/.test(stext) || /midpoint/i.test(stext),
    'native SVG: "' + (stext.match(/WHAT WOULD FLIP THIS[^]*$/) || [''])[0].slice(0, 160) + '"; the verdict above it says "Choose ' + sr.policy.get(sm.root).label + '" and the flip line is relative to ' + sd2.rec.label + '; the seam line is page-only');
  check('F4b the page seam line appears for that disagreement', seam.length > 0, seam);

  // examples: flips, seam, and closest-flip agree with hand working
  const bm = parse(EXAMPLES[0].src), br = evaluate(bm);
  check('F5 Bid or no bid: the only flip is p(Win) < 0.04 (hand: 150k / 3.5M midpoint = 0.0429)', br.flips.length === 1 && Math.abs(br.flips[0].threshold - 150 / 3500) < 1e-6 && br.flips[0].direction === '<');
  const bb = parse(EXAMPLES[1].src), bbr = evaluate(bb);
  const hand = (780e3 + 550e3 - 1e6 * 1) / (2e6 - 1e6);   // p at which -550k + p*2M + (1-p)*1M = 780k
  check('F6 Build vs buy: p(On time) flip at ' + hand.toFixed(4) + ' (hand) and an On time payoff flip within 1.5M..2.5M (hand: 1.55M)', Math.abs(bbr.flips[0].threshold - hand) < 1e-6 && bbr.flips[1].kind === 'payoff');
  const cp = decisionComparisonProjection(bb, bbr);
  check('F7 Build vs buy: no seam (both stories pick Build in-house) and the slide\'s closest flip is p(On time) at 0.33, outside the authored 0.5-0.7', !cp.modelDisagreement && cp.closestFlip.kind === 'prob' && Math.abs(cp.closestFlip.threshold - 0.33) < 1e-6 && !cp.closestFlip.insideAuthoredRange);

  // format round trips
  let rt = null; const rr = rng(5);
  for(let i = 0; i < 2000; i++){ const v = (rr() - 0.5) * 10 ** (1 + Math.floor(rr() * 10)); const back = parseMoney(formatMoney(v)); if(!back || Math.abs(back.lo - v) > 1e-6 * Math.max(1, Math.abs(v)) + 1e-6 * (Math.abs(v) >= 1e9 ? 1e9 : Math.abs(v) >= 1e6 ? 1e6 : Math.abs(v) >= 1e3 ? 1e3 : 1)) rt = rt || {v, s: formatMoney(v), back}; }
  check('F8 formatMoney -> parseMoney round-trips 2000 random values to the 6-decimal mantissa', rt === null, JSON.stringify(rt));
  const sh = shiftRange({lo: 0.1, hi: 0.5}, 0.95, true);
  check('F9 shiftRange keeps a probability\'s midpoint and shrinks its width against the bound', Math.abs((sh.lo + sh.hi) / 2 - 0.95) < 1e-12 && sh.hi <= 1);
  const shm = shiftRange({lo: 1e3, hi: 1e5}, 2e4);
  check('F10 recorded: a slider commit that moves a positive range below zero silently switches its law from log-normal to normal (1k..100k shifted to midpoint 20k gives ' + formatRange(shm) + ')', shm.lo < 0);
}

// =============================================================================================
// 6. PRINTED WORDS ON EVERY SURFACE
// =============================================================================================
{
  // head-to-head share rounds to 100 %
  const hh = parse('R\n  A: 1050 to 1250\n  B: 800 to 1000'), hr = evaluate(hh), h = hr.headToHead[0], t = texts(svgOf(hh, hr));
  const pr = (t.match(/in (\S+)% of simulations/) || [])[1];
  console.log('   info: A 1050..1250 vs B 800..1000: A beats B in ' + (100 * h.aShare).toFixed(2) + ' % of simulations; printed "' + pr + '%"');
  check('W1 "higher expected value than B in N% of simulations" never prints a flat 100% for a share that is not 100%', pr === '>99' && h.aShare < 1, 'true share ' + (100 * h.aShare).toFixed(2) + ' %, printed ' + pr + '%');
  const pres = texts(render(hh, hr, {...CTX, intent: 'presentation'}));
  const wr = (pres.match(/WIN RATE VS RECOMMENDATION[^]*?\| (\d+%) \|/g) || []);
  check('W2 the slide\'s "WIN RATE VS RECOMMENDATION" never prints a flat 0% for an option that sometimes wins', /<1%/.test(pres) && !(/\| 0% \|/.test(pres)), 'B wins ' + (100 * (1 - h.aShare)).toFixed(2) + ' % but prints 0%');

  // verdict line and metrics agree with the engine on both examples
  for(const ex of EXAMPLES){
    const m = parse(ex.src), r = evaluate(m), vp = treeVerdictParts(m, r), st = r.stats.get(m.root), rec = r.policy.get(m.root);
    check('W3 ' + ex.name + ': verdict "' + vp.line + '" names the policy option and prints the root mean', vp.line === 'Choose ' + rec.label + ' — expected value £' + fmt(st.mean));
    const t2 = texts(svgOf(m, r));
    const leaves = allNodes(m.root).filter(n => !n.children.length).length, nodes = allNodes(m.root).length;
    check('W4 ' + ex.name + ': SVG counts "' + m.root.children.length + ' OPTIONS · ' + leaves + ' OUTCOMES · ' + nodes + ' NODES" match the tree', t2.includes(m.root.children.length + ' OPTIONS · ' + leaves + ' OUTCOMES · ' + nodes + ' NODES'));
  }
  // implicit root counts as a node
  const im = parse('A: 10\nB: 20'), ir = evaluate(im), it = texts(svgOf(im, ir));
  const cards = (svgOf(im, ir).match(/data-tree-node=/g) || []).length, printedNodes = +((it.match(/(\d+) NODES/) || [])[1]);
  check('W5 two top-level lines ("A: 10", "B: 20"): the printed node count equals the node cards drawn (the synthetic "Decision" root is drawn and counted)', printedNodes === cards, printedNodes + ' NODES printed, ' + cards + ' cards drawn');
  // "1M" for 1.00M: 3 s.f. figures drop trailing zeros
  check('W6 recorded: fmt drops trailing zeros, so an EV of 1,001,234 prints "1M" beside "1.07M" (looks like a round authored number)', fmt(1001234) === '1M');
  // midpoint vs MC label on cards: chance-outcome leaves under the chosen option print "EXPECTED" not "ALTERNATIVE"
  const bm = parse(EXAMPLES[0].src), br = evaluate(bm), bt = texts(svgOf(bm, br));
  check('W7 Bid or no bid: the Win leaf card prints its own payoff mean ("EXPECTED £3.29M" = exact ' + fmt(lnMean(2e6, 5e6)) + ')', bt.includes('Win | p=0.3–0.45 | £2M … £5M | EXPECTED £' + fmt(lnMean(2e6, 5e6))));
  // the explanatory sentence under the verdict
  check('W8 the verdict\'s P10/P90 are of the recommended option\'s expected value under parameter uncertainty, and the page says so ("compares model assumptions, not the probability of a successful outcome")', /This compares model assumptions, not the probability/.test(bt.replace(/ \| /g, ' ')));
  // authored verdict removes evidence sentence
  const av = parse('verdict: We bid\n' + EXAMPLES[0].src.split('\n').filter(l => !/^verdict/.test(l)).join('\n')), avr = evaluate(av);
  check('W9 an authored verdict replaces the line and drops the P10/P90 evidence sentence', !/P10 /.test(texts(svgOf(av, avr))) && texts(svgOf(av, avr)).includes('We bid'));
}

// =============================================================================================
// 7. BEFORE-VALUES of the built-in examples (default seed 0x5EED, 10,000 sims)
// =============================================================================================
for(const ex of EXAMPLES){
  const m = parse(ex.src), r = evaluate(m), vp = treeVerdictParts(m, r), t = texts(svgOf(m, r));
  console.log('   before: ' + ex.name + ' :: ' + vp.line + ' :: ' + (t.match(/P10 [^|]*/) || [''])[0].trim() + ' :: options ' + m.root.children.map(c => c.label + ' ' + fmt(r.stats.get(c).mean) + ' [' + fmt(r.stats.get(c).p10) + '..' + fmt(r.stats.get(c).p90) + ']').join('; ')
    + ' :: flips ' + r.flips.map(f => f.kind === 'prob' ? 'p(' + f.label + ') ' + f.direction + ' ' + f.threshold.toFixed(2) : f.label + ' payoff').join('; ') + ' :: warnings ' + (m.warnings.length + r.warnings.length));
}
// TR-2/TR-3: words only. The warning names the node; nothing about the draws changed.
{
  const w1 = parse('R\n  A: 0.001 to 100\n  B: 0'), w2 = parse('R\n  Wide: 1k to 1b\n  B: 0'), ok1 = parse('R\n  A: 1k to 1M\n  B: 0');
  const warned = m => [...m.warnings, ...evaluate(m).warnings].filter(x => /rare extremes/.test(x));
  check('T2 a positive range wider than 1,000x warns once, naming the node (0.001 to 100, 1k to 1b); a narrower one does not', warned(w1).length === 1 && warned(w1)[0].includes('"A"') && warned(w2).length === 1 && warned(w2)[0].includes('"Wide"') && warned(ok1).length === 0, JSON.stringify([warned(w1), warned(w2)]));
}
// TR-7: a head-to-head share between 45% and 55% reads as too close to call, naming both, with the same figures
{
  const tie = parse('R\n  Ranged: 100k to 200k\n  Fixed: 144451'), tr = evaluate(tie), line = treeVerdictParts(tie, tr).line, h = tr.headToHead[0];
  check('T7 near-tie (Ranged 100k..200k vs Fixed 144451): the verdict says the two are too close to call, naming both (share ' + (100 * h.aShare).toFixed(0) + '%)', /^Ranged and Fixed are too close to call — expected value £/.test(line) && h.aShare >= 0.45 && h.aShare <= 0.55, line);
}
// TR-5: the exported picture carries the midpoint label and the seam sentence
{
  const sm = parse('R\n  Bold: 10k to 1M\n  Safe: 450k'), sr = evaluate(sm), t = texts(svgOf(sm, sr));
  check('T5 Bold 10k..1M vs Safe 450k: the native SVG says "WHAT WOULD FLIP THE MIDPOINT CALL" and carries the seam sentence', /WHAT WOULD FLIP THE MIDPOINT CALL/.test(t) && t.includes(seamCopy('Bold', 'Safe')), t.slice(t.indexOf('WHAT WOULD')).slice(0, 200));
}
{
  const src = 'R\n  A: -100k to -200k\n    Out\n      Hi (p=0.4): 2M to 5M\n      Lo (p=rest): 100k to 900k\n  B: -50k\n    Out2\n      Hi (p=0.5): 1M to 2M\n      Lo (p=0.5): 0 to 600k\n  C: 0';
  const rows = Array.from({length: 40}, (_, i) => { const m = parse(src), r = evaluate(m, {seed: 1000 + 7 * i}), row = []; (function w(n){ row.push(r.stats.get(n).mean, r.policy.get(n)?.label); n.children.forEach(w); })(m.root); return JSON.stringify(row); });
  check('S9b every expected value (and the policy) is identical at every one of 40 seeds when all probabilities are points', rows.every(x => x === rows[0]), rows[0].slice(0, 120));
}
check('B1 before-values recorded for both examples (see "before:" lines)', true);
done();
