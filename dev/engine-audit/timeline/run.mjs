// Audit harness: timeline. Run: node dev/engine-audit/timeline/run.mjs   (about 10-20 s)
// Plain node, no dependencies. A check tagged {known:true} documents a CONFIRMED DEFECT and FAILS today.
import {readFileSync} from 'node:fs';
import {check, done, rng} from './lib.mjs';
import {parse, parseDate, parseLead, fmtDay, dayToISO} from '../../../timeline/parse.js';
import {mergeBias, laneFits, fixedDeadline, passedDeadline, laneVsDeadline, normCdf, jointAt} from '../../../timeline/mergebias.js';
import {timingFacts} from '../../../timeline/timing.js';
import {decisionLead, leadDuration, leadReceipt, primaryDecisionLead, leadSubline} from '../../../timeline/lrm.js';
import {timelineDiff, timelineDiffView} from '../../../timeline/diff.js';
import {premortemHandoff} from '../../../timeline/handoff.js';
import {inspectorHTML} from '../../../timeline/inspector.js';
import {render, timelineReadout, timelineVerdict, toMarkdown} from '../../../timeline/render.js';
import {markFigure} from '../../../assets/verdict-core.js';
import {STARTER} from '../../../timeline/starter.js';

const DAY = 86400000;
const ROOT = new URL('../../../', import.meta.url);
const read = p => readFileSync(new URL(p, ROOT), 'utf8');

// ---------- independent reference maths --------------------------------------------------------
// Phi by Taylor series (|x| < 3) and Lentz continued fraction for the upper tail beyond; good to ~1e-15.
const SQ2PI = Math.sqrt(2 * Math.PI);
function Qtail(x){                                  // P(Z > x), x >= 0
  if(x < 3){
    let term = x, sum = x, n = 0;
    while(Math.abs(term) > 1e-18 && n < 500){ n++; term *= x * x / (2 * n + 1); sum += term; }
    return 0.5 - Math.exp(-x * x / 2) / SQ2PI * sum;
  }
  let f = 0; for(let k = 200; k >= 1; k--) f = k / (x + f);
  return Math.exp(-x * x / 2) / SQ2PI / (x + f);
}
const Phi = x => x < 0 ? Qtail(-x) : 1 - Qtail(x);
const Z90 = 1.2815515655446004;                      // Phi^-1(0.90), full precision
const utcDay = (y, m, d) => Math.round(Date.UTC(y, m - 1, d) / DAY);
const BASE = parseDate('2026-10-01');
const iso = d => dayToISO(d);
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const refFmt = day => { const [y, m, d] = iso(day).split('-').map(Number); return d + ' ' + MON[m - 1] + ' ' + y; };
// a lane = {p50, sp} in day numbers; reference joint = product of exact normal CDFs
// survival 1 - Phi, and a lane's chance of being done by D GIVEN it was not done by `today` (the spec's TL-Q5 rule);
// with no `today` it is the plain normal. Independent of the tool: series / continued fraction above.
const Surv = z => z >= 0 ? Qtail(z) : 1 - Qtail(-z);
const refLane = (l, D, today) => {                      // a lane = {p50, sp} or {items: [{p50, sp}, ...]}: done when its slowest open item is, so survival = the largest
  const its = l.items || [l], S = x => Math.max(...its.map(i => Surv((x - i.p50) / (i.sp / Z90))));
  return today === undefined ? 1 - S(D) : D <= today ? 0 : 1 - S(D) / S(today);
};
const refJoint = (lanes, D, today) => lanes.reduce((p, l) => p * refLane(l, D, today), 1);
const toolJoint = (lanes, D, today) => jointAt(lanes.map(l => ({p50: l.p50, sigma: l.sp / 1.2815515655446004, items: (l.items || [l]).map(i => ({p50: i.p50, sigma: i.sp / 1.2815515655446004}))})), D, today);
function bruteD80(lanes, f, today){                         // first whole day >= nominal reaching 0.80, day-by-day
  let D = Math.max(...lanes.map(l => l.p50));
  while(f(lanes, D, today) < 0.80){ D++; if(D > 1e7) throw new Error('runaway'); }
  return D;
}
// the duration rule of the spec, written out independently: whole weeks as weeks, under 28 days as days, else the nearest week
const refDur = d => { const a = Math.abs(d); const pl = (n, u) => n + ' ' + u + (n === 1 ? '' : 's'); return a === 0 ? '0 days' : a % 7 === 0 ? pl(a / 7, 'week') : a < 28 ? pl(a, 'day') : pl(Math.round(a / 7), 'week'); };
const pcRef = p => { const r = Math.round(p * 100); return r >= 100 ? '>99%' : r <= 0 ? '<1%' : r + '%'; };
const laneText = lanes => lanes.map((l, i) => `L${i + 1}: item ${iso(l.p50)} .. ${iso(l.p50 + l.sp)}`).join('\n');
const M = t => parse(t);
const T0 = parseDate('2026-09-05');
const ctx = {
  colors: {card: '#ffffff', border: '#dddddd', ink: '#222222', muted: '#66777a', accent: '#0088cc', bg: '#f7f8f6', err: '#b3403a',
    status: {done: '#1D7A3E', doing: '#0C7FAE', risk: '#9A6A00', blocked: '#B3403A'}, brand: '#E2231A', brandText: '#D62015'},
  measure: t => t.length * 7,
};
const words = svg => [...svg.matchAll(/<text[^>]*>([^<]*)<\/text>/g)].map(m => m[1]).join(' | ');
const R = (text, today = T0, intent = 'native') => { const m = M(text); return render(m, {...ctx, today, intent}); };
const line = (text, today = T0) => timelineVerdict(M(text), today).line;
const ro = (text, today = T0) => timelineReadout(M(text), today);

// ======================================================================================
// A. Dates: parse, day numbers, format, round trip
// ======================================================================================
{
  let bad = 0, n = 0, badFmt = 0, badRound = 0;
  for(let day = utcDay(1970, 1, 1); day <= utcDay(2100, 12, 31); day++){
    const s = iso(day); n++;
    if(parseDate(s) !== day) bad++;
    if(parseDate(s.slice(0, 7)) !== utcDay(+s.slice(0, 4), +s.slice(5, 7), 15)) bad++;
    if(fmtDay(day) !== refFmt(day)) badFmt++;
    if(fmtDay(day, {month: true}) !== MON[+s.slice(5, 7) - 1] + ' ' + s.slice(0, 4)) badFmt++;
    if(iso(parseDate(iso(day))) !== s) badRound++;
  }
  check('A1 parseDate == Date.UTC/86400000 for every day 1970..2100, and bare month = its 15th', bad === 0, `${n} days, ${bad} wrong`);
  check('A2 fmtDay matches an independent formatter for every day 1970..2100 (day and month forms)', badFmt === 0, `${badFmt} wrong`);
  check('A3 parse -> dayToISO round trip, every day', badRound === 0);
  check('A4 days before 1970 are negative integers (1969-12-31 = -1)', parseDate('1969-12-31') === -1);
  const inval = ['2027-02-29', '1900-02-29', '2100-02-29', '2026-04-31', '2026-02-30', '2026-13-01', '2026-00-10', '2026-01-00', '2026-1-05', '26-01-01', ''];
  const valid = {'2028-02-29': utcDay(2028, 2, 29), '2000-02-29': utcDay(2000, 2, 29), '2026-12-31': utcDay(2026, 12, 31), '2026-01': utcDay(2026, 1, 15)};
  check('A5 invalid calendar dates (non-leap 29 Feb, 31 Apr, month 13/00, day 00, short fields) are rejected', inval.every(s => parseDate(s) === null), inval.filter(s => parseDate(s) !== null).join(','));
  check('A6 valid leap days (2028, 2000) and year end accepted', Object.entries(valid).every(([s, d]) => parseDate(s) === d));
  const y2 = parseDate('0050-03-10'), want50 = (() => { const d = new Date(0); d.setUTCFullYear(50, 2, 10); return Math.round(d.getTime() / DAY); })();
  check('TL-1 a four-digit year below 0100 is read as that year (or rejected), not as 19xx (Date.UTC two-digit-year rule)', y2 === want50 || y2 === null,
    `"0050-03-10" parsed to ${y2 === null ? null : iso(y2)}; "0000-01-01" prints "${fmtDay(parseDate('0000-01-01'))}"`);
  const w = M('x 2026-9-5\ny 2026-10-01 - 2026-12-01\nq 2026-10-01 ish\nB: z 2026-10 .. 2026-11-31').warnings;
  const wl = new Set(w.map(s => s.match(/^line (\d+)/)[1]));
  check('A7 loosely written dates produce a line-numbered warning and are dropped, never mis-read', wl.size === 4 && M('x 2026-9-5\ny 2026-10-01 - 2026-12-01\nq 2026-10-01 ish').items.length === 0, w.join(' || '));
  { const m = M('Launch 2026-9-5 .. 2026-10-02'), it = m.items[0];
    check('TL-25 a loosely written first date ("2026-9-5") is reported as unreadable, not silently absorbed into the label while the second date becomes the milestone',
      !it || !/2026-9-5/.test(it.label) || m.warnings.some(x => /read|unreadable|not a date/i.test(x)),
      `label "${it && it.label}", p50 ${it && iso(it.p50)}, single=${it && it.single}; warnings: ${m.warnings.join(' || ')}`); }
  // lead grammar
  const leads = {'6w': 42, '6W': 42, '6 w': 42, '10d': 10, '1w': 7, '7d': 7, '0w': null, '1.5w': null, 'w': null, '-3d': null, '6': null, '99999999999999999999w': null};
  check('A8 parseLead grammar (d/w, case, spaces; rejects 0, decimals, negatives, unsafe integers)', Object.entries(leads).every(([s, v]) => parseLead(s) === v),
    Object.entries(leads).filter(([s, v]) => parseLead(s) !== v).map(([s]) => s).join(','));
}

// ======================================================================================
// B. normCdf (A&S 7.1.26), Z_P90, and whether the error ever reaches a printed figure
// ======================================================================================
{
  let maxe = 0, zmax = 0, outOfRange = 0, nonMono = 0, asym = 0, prev = -1;
  for(let z = -40; z <= 40; z += 0.0005){
    const v = normCdf(z), e = Math.abs(v - Phi(z));
    if(e > maxe){ maxe = e; zmax = z; }
    if(!(v >= 0 && v <= 1)) outOfRange++;
    if(v < prev - 1e-15) nonMono++; prev = v;
    if(Math.abs(v + normCdf(-z) - 1) > 1e-15) asym++;
  }
  check('B1 normCdf absolute error vs series/continued-fraction reference <= 1.5e-7 on [-40,40]', maxe <= 1.5e-7, `max ${maxe.toExponential(2)} at z=${zmax.toFixed(4)} (A&S bound on erf is 1.5e-7; on the CDF it is half that)`);
  check('B2 normCdf stays inside [0,1], is monotone and symmetric (z and -z sum to 1)', outOfRange === 0 && nonMono === 0 && asym === 0, `outOfRange ${outOfRange} nonMono ${nonMono} asym ${asym}`);
  const tails = [-3, -4, -5, -6, -7, -8].map(z => [z, normCdf(z), Phi(z)]);
  check('B3 lower tail is positive and within 1.5e-7 absolute (but NOT relative: -6 sigma is off by 0.4 %) ', tails.every(([, a, b]) => a >= 0 && Math.abs(a - b) < 1.5e-7),
    tails.map(([z, a, b]) => `${z}: ${a.toExponential(3)} vs ${b.toExponential(3)}`).join('; '));
  // Z_P90: recover the constant from a lane's sigma
  const m = M('A: a 2026-10-01 .. 2030-10-01\nB: b 2026-10-01 .. 2030-10-01'), fit = laneFits(m).lanes[0];
  const Z = (fit.p90 - fit.p50) / fit.sigma;
  check('B4 Z_P90 equals Phi^-1(0.90) = 1.2815515655446 (not Z90 = 1.6449 of 95 %): Phi(Z) = 0.9', Math.abs(Phi(Z) - 0.9) < 1e-9 && Math.abs(Z - Z90) < 1e-9, `Z = ${Z}`);
  check('B5 a lane reaches exactly its P90 date with probability 0.90 (tool CDF within 1e-7)', Math.abs(normCdf((fit.p90 - fit.p50) / fit.sigma) - 0.9) < 1e-7);
}
{ // the approximation error CAN change a printed percentage: two lanes, deadline, 0.43499998 exact, 0.43500005 in the tool
  const lanes = [{p50: BASE + 103, sp: 16}, {p50: BASE + 108, sp: 84}], D = BASE + 114;
  const text = laneText(lanes) + '\nGate ' + iso(D) + ' [fixed]', today = BASE - 30;
  const mb = mergeBias(M(text), today), exact = refJoint(lanes, D, today);
  const out = line(text, today);
  check('TL-2 the printed joint percentage equals the exact one (A&S error flips 43 % to 44 %)', out.includes(pcRef(exact)) && Math.abs(mb.pAll - exact) < 1e-6,
    `exact ${(exact * 100).toFixed(6)}%  tool ${(mb.pAll * 100).toFixed(6)}%  prints: ${out}`);
}
{ // d80 can move one whole day
  const lanes = [{p50: BASE + 41, sp: 118}, {p50: BASE + 46, sp: 141}];
  const mb = mergeBias(M(laneText(lanes)), BASE - 30), refD = bruteD80(lanes, refJoint, BASE - 30), toolD = bruteD80(lanes, toolJoint, BASE - 30);
  check('B6 the d80 bisection equals a day-by-day scan using the tool\'s OWN joint (bisection is sound)', mb.d80 === toolD, `d80 ${iso(mb.d80)} scan ${iso(toolD)}`);
  check('TL-3 the quoted 80% date is the first day the EXACT joint reaches 0.80 (tool is one day late here)', mb.d80 === refD,
    `tool ${iso(mb.d80)}, exact first day ${iso(refD)}; exact joint on ${iso(refD)} = ${refJoint(lanes, refD, BASE - 30).toFixed(9)}, tool joint = ${toolJoint(lanes, refD, BASE - 30).toFixed(9)}`);
}

// ======================================================================================
// C. jointAt / d80 / pAll sweeps against slow references
// ======================================================================================
{
  const r = rng(20261113);
  let n = 0, badP = 0, badD = 0, flipD = 0, badBr = 0, badMin = 0, badLaneP = 0, badNomHalf = 0, worstP = 0;
  for(let i = 0; i < 1500; i++){
    const K = 2 + Math.floor(r() * 7), lanes = [];
    for(let k = 0; k < K; k++) lanes.push({p50: BASE + Math.floor(r() * 400), sp: 1 + Math.floor(r() * 300)});
    const text = laneText(lanes), mb = mergeBias(M(text), BASE - 60);
    n++;
    const nominal = Math.max(...lanes.map(l => l.p50));
    const pe = Math.abs(mb.pAll - refJoint(lanes, nominal, BASE - 60)); worstP = Math.max(worstP, pe);
    if(pe > 1e-9) badP++;
    if(mb.byDate !== nominal || mb.pAll > 0.5 + 1e-9) badNomHalf++;
    const D = bruteD80(lanes, toolJoint, BASE - 60);
    if(mb.d80 !== D) badD++;
    if(mb.d80 !== bruteD80(lanes, refJoint, BASE - 60)) flipD++;
    if(!(toolJoint(lanes, mb.d80, BASE - 60) >= 0.8 && toolJoint(lanes, mb.d80 - 1, BASE - 60) < 0.8)) badBr++;
    const minLane = Math.min(...lanes.map(l => refLane(l, nominal, BASE - 60)));
    if(mb.pAll > minLane + 1e-9 || mb.pAll < 0 || mb.pAll > 1) badMin++;
    mb.laneP.forEach((p, k) => { if(Math.abs(p - refLane(lanes[k], nominal, BASE - 60)) > 1e-9) badLaneP++; });
  }
  check('C1 pAll at the nominal date equals the exact product of normal CDFs (1500 seeded inputs)', badP === 0, `worst abs gap ${worstP.toExponential(2)}`);
  check('C2 d80 equals the day-by-day scan over the tool\'s own joint (1500 inputs)', badD === 0, `${badD} differ`);
  check('C3 the quoted d80 reaches 0.80 and the day before does not (tool joint)', badBr === 0);
  check('C4 d80 equals the day-by-day scan over the EXACT joint (random sweep; the one-day miss needs a ~1e-7 coincidence)', flipD === 0, `${flipD} differ of 1500`);
  check('C5 joint never above its smallest member, always in [0,1]', badMin === 0);
  check('C6 per-lane laneP equals the exact lane probability', badLaneP === 0);
  check('C7 with no deadline byDate is the latest P50 and pAll <= 0.5 (that lane sits at Phi(0))', badNomHalf === 0);
}
{ // monotone in the date, bounded, and jointAt == product
  const r = rng(5); let bad = 0, badProd = 0;
  for(let i = 0; i < 300; i++){
    const lanes = Array.from({length: 2 + Math.floor(r() * 5)}, () => ({p50: Math.floor(r() * 300), sigma: 1 + r() * 100}));
    let prev = -1;
    for(let D = -100; D < 900; D += 7){ const p = jointAt(lanes, D); if(p < prev - 1e-15 || p < 0 || p > 1) bad++; prev = p; }
    const D = Math.floor(r() * 400), want = lanes.reduce((p, l) => p * Phi((D - l.p50) / l.sigma), 1);
    if(Math.abs(jointAt(lanes, D) - want) > 7.1e-8 * lanes.length) badProd++;
  }
  check('C8 jointAt is monotone non-decreasing in the date and stays in [0,1]', bad === 0, `${bad} violations`);
  check('C9 jointAt equals the product of exact CDFs (within 7.1e-8 per lane)', badProd === 0);
}
{ // hundreds of lanes: bracket expansion and no runaway
  const r = rng(77); let bad = 0, badBr = 0, worst = 0;
  for(const K of [40, 150, 166, 170, 300, 600]){
    const lanes = Array.from({length: K}, () => ({p50: BASE + Math.floor(r() * 120), sp: 1 + Math.floor(r() * 60)}));
    const t0 = Date.now(), mb = mergeBias(M(laneText(lanes)), BASE - 60), ms = Date.now() - t0; worst = Math.max(worst, ms);
    if(mb.d80 !== bruteD80(lanes, toolJoint, BASE - 60)) bad++;
    if(!(toolJoint(lanes, mb.d80, BASE - 60) >= 0.8)) badBr++;
  }
  check('C10 d80 correct with 40..600 lanes (bracket expansion engages beyond ~166 lanes)', bad === 0 && badBr === 0, `${bad} wrong, slowest ${worst} ms`);
}
{ // deadline mode: pAll at the deadline, gap sign vs wording
  const r = rng(31); let n = 0, badP = 0, badTxt = 0, badGap = 0;
  for(let i = 0; i < 800; i++){
    const K = 2 + Math.floor(r() * 4), lanes = [];
    for(let k = 0; k < K; k++) lanes.push({p50: BASE + Math.floor(r() * 200), sp: 3 + Math.floor(r() * 150)});
    const nominal = Math.max(...lanes.map(l => l.p50)), D = nominal + Math.floor(r() * 160) - 40;
    const text = laneText(lanes) + '\nGate ' + iso(D) + ' [fixed]', today = BASE - 40;
    const mb = mergeBias(M(text), today); n++;
    if(!mb.deadline || mb.byDate !== D) { badP++; continue; }
    if(Math.abs(mb.pAll - refJoint(lanes, D, today)) > 1e-9) badP++;
    const gap = mb.d80 - D, ln = line(text, today);
    if(gap > 0 && !/needs .* past it|needs/.test(ln)) badGap++;
    if(gap < 0 && !/inside it/.test(ln)) badGap++;
    if(gap === 0 && !/deadline day/.test(ln)) badGap++;
    if(!ln.includes(fmtDay(mb.d80))) badTxt++;
  }
  check('C11 deadline mode: byDate is the fixed date and pAll equals the exact joint there (800 inputs)', badP === 0, `${badP} wrong of ${n}`);
  check('C12 deadline wording names the right side of 80 % (needs / inside it / on the deadline day) and the d80 date', badGap === 0 && badTxt === 0);
}

// ======================================================================================
// D. laneFits: which item stands for a lane
// ======================================================================================
{
  const f = t => laneFits(M(t), BASE - 100);
  let r = f('A: early 2026-11-01 .. 2026-12-01\nA: late 2026-12-01 .. 2026-12-20\nB: b 2026-12-01 .. 2026-12-10');
  check('D1 a lane is fitted from its latest open item (max P50)', r.lanes.find(l => l.name === 'A').p50 === parseDate('2026-12-01'));
  r = f('A: x 2026-12-01 .. 2026-12-10\nA: y 2026-12-01 .. 2026-12-24\nB: b 2026-11-01 .. 2026-11-20');
  check('D2 P50 ties resolve to the larger P90', r.lanes.find(l => l.name === 'A').p90 === parseDate('2026-12-24'));
  r = f('A: x 2026-12-01 .. 2026-12-10\nA: y 2027-01-10 [done]\nA: z 2027-02-01 [fixed]\nB: b 2026-11-01 .. 2026-11-20');
  check('D3 [done] and [fixed] items never stand for a lane (the open ranged item does)', r.lanes.length === 2 && r.lanes.find(l => l.name === 'A').p50 === parseDate('2026-12-01'));
  r = f('A: y 2027-01-10 [done]\nB: b 2026-11-01 .. 2026-11-20');
  check('D4 a lane of only done items is absent from the joint and not counted as excluded', r.lanes.length === 1 && r.excludedSingle === 0);
  r = f('A: s 2026-12-01\nB: same 2026-11-05 .. 2026-11-05\nC: b 2026-11-01 .. 2026-11-20');
  check('D5 single-date and same-day-range lanes are excluded and counted', r.lanes.length === 1 && r.excludedSingle === 2, `excluded ${r.excludedSingle}`);
  const today = parseDate('2026-11-20');
  r = laneFits(M('A: a 2026-10-01 .. 2026-11-20\nB: b 2026-10-01 .. 2026-11-19\nC: c 2026-12-01 .. 2026-12-20'), today);
  check('D6 stale is strict: P90 == today is "due today", P90 < today is past', r.stale === 1, `stale ${r.stale}`);
  r = f('A: late 2026-12-01 .. 2026-12-20\nA: early 2026-11-01 .. 2027-03-01\nB: b 2026-12-01 .. 2026-12-31');
  const laneA = r.lanes.find(l => l.name === 'A');
  const openA = [parseDate('2026-12-20'), parseDate('2027-03-01')];
  check('TL-4 a lane is done when its slowest open ranged item is: the lane carries every open ranged item, and shows the latest item\'s P50/P90',
    laneA.items.length === 2 && laneA.p50 === parseDate('2026-12-01') && laneA.p90 === parseDate('2026-12-20'), `lane A shows p50 ${iso(laneA.p50)} p90 ${iso(laneA.p90)}, carries ${laneA.items.length} items`);
  { // size of that error on a concrete plan
    const m = M('A: late 2026-12-01 .. 2026-12-20\nA: early 2026-11-01 .. 2027-03-01\nB: b 2026-12-01 .. 2026-12-31');
    const mb = mergeBias(m, BASE - 100);
    const A1 = {p50: parseDate('2026-12-01'), sp: 19}, A2 = {p50: parseDate('2026-11-01'), sp: 120}, B = {p50: parseDate('2026-12-01'), sp: 30};
    const before = bruteD80([A1, B], refJoint, BASE - 100), after = bruteD80([{...A1, items: [A1, A2]}, B], refJoint, BASE - 100);
    check('TL-4 worked example: the long-tailed early item now binds the 80% date (25 Dec 2026 on the latest item alone, 23 Jan 2027 on the lane)', mb.d80 === after && iso(before) === '2026-12-25' && iso(after) === '2027-01-23',
      `latest item only ${iso(before)}; lane (min rule) ${iso(after)}; tool ${iso(mb.d80)}; joint at the nominal date ${(mb.pAll * 100).toFixed(1)}% either way (the late item binds there)`);
  }
  // unlaned items form ONE lane
  r = f('x 2026-10-01 .. 2026-12-01\ny 2026-11-01 .. 2027-01-01');
  check('TL-Q3 (by design) unlaned milestones are ONE lane: a flat list is usually a sequence, and reading each line as a parallel lane would print an alarming joint for it', r.lanes.length === 1, `fitted ${r.lanes.length} lane(s): ${r.lanes.map(l => l.name).join(', ')}`);
  r = f('App: a 2026-10-01 .. 2026-12-01\napp: b 2026-11-01 .. 2027-01-01');
  check('TL-20 lane names compare case-insensitively like Compare\'s identity does ("App" and "app" are one lane; first spelling shown)', r.lanes.length === 1 && r.lanes[0].name === 'App',
    `${r.lanes.length} lanes in the joint; timelineDiff identity folds case`);
  check('D7 zero lanes and one lane: no merge verdict, no throw', mergeBias(M(''), T0) === null && mergeBias(M('A: a 2026-10 .. 2026-12'), T0) === null);
}

// ======================================================================================
// E. Deadlines and today
// ======================================================================================
{
  const m = M('A: a 2026-10-01 .. 2026-12-01\nB: b 2026-11-01 .. 2027-01-01\nEarly 2026-11-20 [fixed]\nLate 2027-02-01 [fixed]\nTie 2027-02-01 [fixed]\nGone 2026-08-01 [fixed]\nGoner 2026-08-20 [fixed]');
  const d = fixedDeadline(m, T0), p = passedDeadline(m, T0);
  check('E1 the deadline is the LATEST future fixed date, ties to document order, count disclosed', d.label === 'Late' && d.day === parseDate('2027-02-01') && d.count === 3, JSON.stringify(d));
  check('E2 the passed deadline is the latest fixed date already gone', p.label === 'Goner', JSON.stringify(p));
  const mb = mergeBias(m, T0);
  check('E3 with a deadline, byDate is the deadline and "passed" is suppressed; text discloses "latest of 3 fixed dates"', mb.byDate === d.day && mb.passed === null && /latest of 3 fixed dates/.test(ro('A: a 2026-10-01 .. 2026-12-01\nB: b 2026-11-01 .. 2027-01-01\nEarly 2026-11-20 [fixed]\nLate 2027-02-01 [fixed]\nTie 2027-02-01 [fixed]')));
  const m2 = M('A: a 2026-10-01 .. 2026-12-01\nB: b 2026-11-01 .. 2027-01-01\nGone 2026-08-20 [fixed]'), mb2 = mergeBias(m2, T0);
  check('E4 a passed fixed date with ranged work open is named, with days since', mb2.passed.label === 'Gone' && mb2.passed.agoDays === T0 - parseDate('2026-08-20') && /fixed Gone passed 16 days ago/.test(ro('A: a 2026-10-01 .. 2026-12-01\nB: b 2026-11-01 .. 2027-01-01\nGone 2026-08-20 [fixed]')), ro('A: a 2026-10-01 .. 2026-12-01\nB: b 2026-11-01 .. 2027-01-01\nGone 2026-08-20 [fixed]').slice(-80));
  // deadline equal to today
  const tx = 'A: a 2026-10-01 .. 2026-12-01\nB: b 2026-11-01 .. 2027-01-01\nToday gate 2026-09-05 [fixed]';
  const mbt = mergeBias(M(tx), T0), svg = R(tx);
  const saysPassed = mbt.passed && /passed/.test(ro(tx)), chartOverdue = /OVERDUE/.test(words(svg));
  check('E5 a fixed date equal to today is still the deadline (0 days left), not passed', mbt.deadline && mbt.deadline.day === T0 && mbt.passed === null);
  check('TL-5 a fixed date equal to today is either passed in BOTH readout and chart, or in neither (readout "passed 0 days ago" vs chart no OVERDUE)', !!saysPassed === chartOverdue,
    `readout tail: "${ro(tx).match(/·[^ ]* fixed.*?ago/)?.[0] || ''}", chart OVERDUE: ${chartOverdue}`);
  // one lane vs deadline
  const one = 'A: a 2026-10-01 .. 2026-12-01\nGate 2026-12-15 [fixed]', lv = laneVsDeadline(M(one), T0);
  const exact = refLane({p50: parseDate('2026-10-01'), sp: parseDate('2026-12-01') - parseDate('2026-10-01')}, parseDate('2026-12-15'), T0);
  check('E6 one ranged lane + a deadline: probability equals the exact conditional normal', Math.abs(lv.p - exact) < 1e-6 && /A clears the fixed Gate \(15 Dec 2026\) ≈ \d+% — one lane, a planning estimate\./.test(line(one)), `${lv.p.toFixed(4)} vs ${exact.toFixed(4)}; ${ro(one).slice(0, 100)}`);
  check('E7 laneVsDeadline is silent with two ranged lanes, no deadline, or a lane whose median is already past', laneVsDeadline(M(one + '\nB: b 2026-10-01 .. 2026-11-01'), T0) === null && laneVsDeadline(M('A: a 2026-10-01 .. 2026-12-01'), T0) === null && laneVsDeadline(M(one), parseDate('2026-10-02')) === null);
  const ex = 'A: a 2026-10-01 .. 2026-12-01\nS: single 2026-12-10\nGate 2026-12-15 [fixed]';
  check('TL-18 one-lane-vs-deadline sentence discloses a lane it left out (single-date lane not counted)', /not counted/.test(ro(ex)), ro(ex).slice(0, 170));
  // freshness guard
  const allPast = 'A: a 2026-01-01 .. 2026-02-01\nB: b 2026-03-01 .. 2026-04-01\nGate 2026-12-15 [fixed]';
  check('E8 an all-overdue plan with a future deadline makes no merge claim (no ">99% clear it")', mergeBias(M(allPast), T0) === null);
  check('TL-21 an entirely past plan (every ranged lane at or past its P50, still open) leads with that and asks for new dates, naming how many are past P90', /^All 2 ranged lanes have reached their P50 finish and are still open \(2 past their P90\) — they need new dates\.$/.test(line('A: a 2026-01 .. 2026-02\nB: b 2026-03 .. 2026-04')),
    `verdict: "${line('A: a 2026-01 .. 2026-02\nB: b 2026-03 .. 2026-04')}"`);
  const st = 'A: x 2026-06 .. 2026-07\nA: y 2026-11 .. 2026-12\nB: z 2026-11 .. 2027-01';
  check('TL-22 an open earlier item of a lane whose P90 has passed is reported (stale counts only a lane\'s latest item)', /past (its|their) P90|overdue/i.test(ro(st)), `readout: ${ro(st).slice(0, 220)}`);
}

// ======================================================================================
// F. Wording at thresholds
// ======================================================================================
{
  // saturation: 12 lanes, deadline = nominal => 0.5 * product(...) tiny
  const many = Array.from({length: 12}, (_, i) => `L${i}: a 2026-10-01 .. 2026-11-01`).join('\n');
  const lo = line(many + '\nGate 2026-10-01 [fixed]', BASE - 60);  // deadline <= p50 → <1%
  check('F1 a tiny joint prints "<1%" and never "≈ <1%"', /clear it <1%;/.test(lo) && !/≈ </.test(lo), lo);
  const hi = line('A: a 2026-10-01 .. 2026-10-10\nB: b 2026-10-01 .. 2026-10-10\nGate 2027-10-01 [fixed]', BASE - 60);
  check('F2 a saturated joint prints ">99%" and never "≈ >99%"', /clear it >99%;/.test(hi) && !/≈ >/.test(hi), hi);
  const hiFig = timelineVerdict(M('A: a 2026-10-01 .. 2026-10-10\nB: b 2026-10-01 .. 2026-10-10\nGate 2027-10-01 [fixed]'), BASE - 60);
  check('F3 the highlighted figure is found verbatim in the line', hiFig.line.includes(hiFig.fig) && hiFig.fig === '>99%');
  // rounding at .5: pc boundaries by construction via many one-parameter probes (exact joint within 0.5 %)
  const r = rng(404); let found = {under: null, over: null, equal: null}, tries = 0;
  while(tries++ < 400000 && !(found.under && found.over)){
    const lanes = [{p50: BASE + Math.floor(r() * 60), sp: 5 + Math.floor(r() * 400)}, {p50: BASE + Math.floor(r() * 60), sp: 5 + Math.floor(r() * 400)}];
    const nominal = Math.max(...lanes.map(l => l.p50)), D = nominal + Math.floor(r() * 60);
    const ex = refJoint(lanes, D, BASE - 60); if(Math.round(ex * 100) !== 80) continue;
    const text = laneText(lanes) + '\nGate ' + iso(D) + ' [fixed]', mb = mergeBias(M(text), BASE - 60), gap = mb.d80 - D;
    if(gap > 0 && !found.under) found.under = {text, ex, ln: line(text, BASE - 60), gap};
    if(gap < 0 && !found.over) found.over = {text, ex, ln: line(text, BASE - 60), gap};
  }
  check('F4 when the joint rounds to 80 % but is below it, the line says "just under 80%" and the exact joint really is < 0.80', !!found.under && /just under 80%/.test(found.under.ln) && found.under.ex < 0.8, found.under && `${found.under.ln} (exact ${found.under.ex.toFixed(5)})`);
  check('F5 when it rounds to 80 % but is at or above it, the line says "just over 80%" and the exact joint is >= 0.80', !!found.over && /just over 80%/.test(found.over.ln) && found.over.ex >= 0.8, found.over && `${found.over.ln} (exact ${found.over.ex.toFixed(5)})`);
  // gap words
  const g1 = 'A: a 2026-10-01 .. 2026-10-31\nB: b 2026-10-01 .. 2026-10-31';
  const mbg = mergeBias(M(g1), BASE - 60);
  const days = mbg.d80 - mbg.byDate;
  check('F6 internal form prints "(+N weeks)" for the d80 gap; singular for 1', new RegExp('\\+' + (days < 7 ? days + ' days?' : Math.round(days / 7) + ' weeks?')).test(line(g1, BASE - 60)), `gap ${days} days → ${line(g1, BASE - 60)}`);
  let s = line('A: a 2026-10-01 .. 2026-10-31\nB: b 2026-10-01 .. 2026-10-31\nGate 2026-11-24 [fixed]', BASE - 60);
  console.log('   info: ' + s);
  // singular/plural of lanes
  const t1 = ro('A: a 2026-10-01 .. 2026-10-31\nB: b 2026-10-01 .. 2026-10-31\nC: c 2026-12-10\n', BASE - 60), t2 = ro('A: a 2026-10-01 .. 2026-10-31\nB: b 2026-10-01 .. 2026-10-31\nC: c 2026-12-10\nD: d 2026-12-11\n', BASE - 60);
  check('F7 "1 single-date lane not counted" / "2 single-date lanes not counted" singular and plural', /1 single-date lane not counted/.test(t1) && /2 single-date lanes not counted/.test(t2));
  const sa = ro('A: a 2026-10-01 .. 2026-10-31\nB: b 2026-11-20 .. 2026-12-31', parseDate('2026-11-05')), sb = ro('A: a 2026-10-01 .. 2026-10-31\nB: b 2026-10-02 .. 2026-10-30\nC: c 2026-11-20 .. 2026-12-31', parseDate('2026-11-05'));
  check('F8 "1 lane past its P90 — re-estimate it" / "2 lanes past their P90 — re-estimate them"', /1 lane past its P90 — re-estimate it/.test(sa) && /2 lanes past their P90 — re-estimate them/.test(sb), `${sa.match(/· .*P90[^.]*/)?.[0]} | ${sb.match(/· .*P90[^.]*/)?.[0]}`);
}
{ // week rounding in words (wk): 7..10 days all "1 week"
  const rows = [];
  for(const g of [1, 6, 7, 8, 10, 11, 13, 14, 17, 18, 21]){
    // internal form: craft two identical lanes whose d80 gap we can read back, search spread
    for(let sp = 1; sp < 120; sp++){
      const t = `A: a ${iso(BASE)} .. ${iso(BASE + sp)}\nB: b ${iso(BASE)} .. ${iso(BASE + sp)}`, mb = mergeBias(M(t), BASE - 60);
      if(mb.d80 - mb.byDate === g){ rows.push([g, line(t, BASE - 60).match(/\(\+[^)]*\)/)[0]]); break; }
    }
  }
  console.log('   info: d80 gap days → printed: ' + rows.map(([g, w]) => `${g}d→${w}`).join('  '));
  const tenDay = rows.find(([g]) => g === 10);
  check('TL-17 a 10-day gap is not printed as "1 week" (rounding error 30 %; 7, 8, 9 and 10 days all read the same)', !!tenDay && tenDay[1] === '(+10 days)', tenDay ? `10 days prints ${tenDay[1]}` : 'no 10-day case found');
}

// ======================================================================================
// G. Decision lead / last responsible moment
// ======================================================================================
{
  const r = rng(8); let bad = 0, badDay = 0;
  for(let i = 0; i < 2000; i++){
    const ev = utcDay(2025, 1, 1) + Math.floor(r() * 1500), lead = 1 + Math.floor(r() * 120), wk = r() < .5;
    const text = `Ev ${iso(ev)} [fixed] [lead: ${wk ? Math.ceil(lead / 7) + 'w' : lead + 'd'}]`;
    const it = M(text).items[0], n = wk ? Math.ceil(lead / 7) * 7 : lead;
    const want = Math.round((Date.UTC(...iso(ev).split('-').map((x, k) => k === 1 ? +x - 1 : +x)) - n * DAY) / DAY);
    const l = decisionLead(it, ev - 200);
    if(l.day !== want) badDay++;
    if(!(fmtDay(l.day) === refFmt(want))) bad++;
  }
  check('G1 decide-by date = event date minus lead, equal to Date.UTC arithmetic across year ends and 29 Feb (2000 cases)', bad === 0 && badDay === 0);
  const it = M('Ev 2026-12-15 [fixed] [lead: 6w]').items[0], day = it.p50 - 42;
  const st = t => decisionLead(it, t).state;
  check('G2 state: closed before today, "today" on the day, open after', st(day + 1) === 'closed' && st(day) === 'today' && st(day - 1) === 'open' && decisionLead(it).state === null);
  const table = {1: '1 day', 2: '2 days', 6: '6 days', 7: '1 week', 10: '10 days', 11: '11 days', 14: '2 weeks', 21: '3 weeks', 24: '24 days', 25: '25 days', 28: '4 weeks', 31: '4 weeks', 33: '5 weeks'};
  const bad2 = [];
  for(const [d, want] of Object.entries(table)){
    const t = leadReceipt(it, day + (+d)).text, got = t.match(/It closed (.*) ago\./)?.[1];
    if(got !== want) bad2.push(`${d}d → ${got} (want ${want})`);
  }
  check('G3 "It closed N ago" uses the one duration rule: whole weeks as weeks, under 28 days as days, else the nearest week; singular for 1', bad2.length === 0, bad2.join('; '));
  check('G4 due-today and open wording', /It is due today\./.test(leadReceipt(it, day).text) && !/closed|due today/.test(leadReceipt(it, day - 5).text));
  const durs = {7: '1 week', 14: '2 weeks', 10: '10 days', 1: '1 day', 42: '6 weeks'};
  check('G5 leadDuration singular/plural and week folding', Object.entries(durs).every(([d, w]) => leadDuration(+d) === w));
  check('G6 [lead] on a forecast is ignored with a warning; started on a fixed event is ignored with a warning', /only belongs on a \[fixed\]/.test(M('X 2026-10 .. 2026-12 [lead: 6w]').warnings.join()) && /not a \[fixed\]/.test(M('X 2026-10-10 [fixed] [started: 2026-09-01]').warnings.join()));
  // primary clock ordering
  const m = M('A 2026-10-10 [fixed] [lead: 2w]\nB 2026-09-20 [fixed] [lead: 1w]\nC 2026-09-10 [fixed] [lead: 1w]\nD 2026-09-08 [fixed] [lead: 1w]');
  const pl = primaryDecisionLead(m, T0);   // today 2026-09-05. B decide 09-13 open; C decide 08-27 closed; D 08-18 closed; A 09-26 open
  check('G7 closed clock outranks open; among closed the most recently closed leads', pl.it.label === 'C', pl.it.label);
  // an event that has already happened
  const past = 'Old event 2026-06-01 [fixed] [lead: 6w]\nA: a 2026-10 .. 2026-12\nB: b 2026-11 .. 2027-01';
  const pv = timelineVerdict(M(past), T0).line;
  check('TL-15 an event already past does not raise a "Decision window closed" alarm that leads the verdict', !/Decision window closed/.test(pv), pv);
  const lead = M('E 2027-01-01 [fixed] [lead: 99999999999w]\nA: x 2026-10 .. 2026-12');
  const lv = timelineVerdict(lead, T0).line, svg = R('E 2027-01-01 [fixed] [lead: 99999999999w]\nA: x 2026-10 .. 2026-12');
  check('TL-14 an absurd lead is rejected at parse (decide-by date is a real date; no "NaN undefined NaN")', !/NaN|undefined/.test(lv + svg), lv);
}

// ======================================================================================
// H. timingFacts and the inspector
// ======================================================================================
{
  const f = (t, today) => timingFacts(M(t).items[0], today);
  const S = parseDate('2026-08-24'), P = parseDate('2026-10-12'), N = parseDate('2026-09-07');
  let x = f('A: w 2026-10-12 .. 2026-11-16 [started: 2026-08-24]', N);
  check('H1 open: elapsed = today - start (14 d), P50 duration = P50 - start (49 d), P90 duration (84 d)', x.valid && x.elapsedDays === N - S && x.elapsedDays === 14 && x.p50DurationDays === 49 && x.p90DurationDays === 84, JSON.stringify(x));
  x = f('A: w 2026-09-20 [done] [started: 2026-08-24]', N);
  check('H2 done after today is invalid ("Completion is after today")', !x.valid && /Completion is after today/.test(x.issue));
  x = f('A: w 2026-09-04 [done] [started: 2026-08-24]', N);
  check('H3 done: elapsed ends at the finish date (11 d), not today', x.valid && x.elapsedDays === 11 && x.p90DurationDays === 11);
  x = f('A: w 2026-10-12 .. 2026-11-16 [started: 2026-09-20]', N);
  check('H4 a start after today yields no durations and says so', !x.valid && x.elapsedDays === null && /after today/.test(x.issue));
  x = f('A: w 2026-09-30 .. 2026-11-16 [started: 2026-10-05]', parseDate('2026-10-06'));
  check('H5 a start after P50 yields no durations', !x.valid && /after P50/.test(x.issue));
  check('H6 [started] on a fixed event is dropped by the parser; timingFacts also refuses', M('E 2026-10-10 [fixed] [started: 2026-09-01]').items[0].started === null && timingFacts({status: 'fixed', started: 5, p50: 9, p90: 9}, 7).issue === 'A fixed event has no work start');
  // 29 February in a span
  x = f('A: w 2028-03-10 .. 2028-04-10 [started: 2028-02-20]', parseDate('2028-03-01'));
  check('H7 elapsed days across 29 February 2028 = 10 (20 Feb → 1 Mar in a leap year)', x.elapsedDays === 10, `${x.elapsedDays}`);
  // inspector wording
  const T = parseDate('2026-09-05');
  let h = inspectorHTML(M('A: w 2026-09-05 [started: 2026-09-05]').items[0], T);
  check('TL-9 a zero-length span is not printed as "0 weeks"', !/0 weeks/.test(h), (h.match(/<dd>[^<]*weeks[^<]*<\/dd>/g) || []).join(' '));
  h = inspectorHTML(M('A: w 2026-10 .. 2026-12').items[0], T);
  const dd = h => (h.match(/<dd>[^<]*<\/dd>/g) || []).map(s => s.replace(/<\/?dd>/g, ''));
  check('H8 inspector: month-only dates written with ".." print month precision', dd(h).join('|') === 'Oct 2026|Dec 2026', dd(h).join('|'));
  h = inspectorHTML(M('A: w 2026-10 – 2026-12').items[0], T);
  check('TL-10 inspector: month-only dates written with an en dash print month precision too (as the chart does)', dd(h).join('|') === 'Oct 2026|Dec 2026', dd(h).join('|'));
  const svgEn = words(R('A: w 2026-10 – 2026-12'));
  check('H9 the chart prints month precision for the en-dash range (so the inspector disagrees with the chart)', /Finish Oct 2026 – Dec 2026/.test(svgEn), svgEn.match(/Finish[^|]*/)?.[0]);
  const rev = 'X 2026-12-05 .. 2026-10', rsvg = words(R(rev));
  check('TL-11 reversed range: each end keeps the precision the author gave it (2026-10 is month-only, 2026-12-05 has a day) in the chart and inspector',
    /Finish Oct 2026 – 5 Dec 2026/.test(rsvg) && dd(inspectorHTML(M(rev).items[0], T)).join('|') === 'Oct 2026|5 Dec 2026',
    `chart: ${rsvg.match(/Finish[^|]*/)?.[0]}; inspector: ${dd(inspectorHTML(M(rev).items[0], T)).join('|')}`);
  h = inspectorHTML(M('A: w 2026-10 .. 2026-12 [started: 2026-08-24]').items[0], T);
  check('H10 inspector: month-only dates make the calendar duration "Approximately"', /Approximately 7 weeks at P50/.test(h) || /Approximately/.test(h), (h.match(/Approximately[^<]*/) || [''])[0]);
}

// ======================================================================================
// I. Snapshot comparison
// ======================================================================================
{
  const v = (a, b) => timelineDiffView(timelineDiff(M(a), M(b)), 'then');
  let d = v('A: x 2026-10-01 .. 2026-12-01\nA: y 2026-10-01 .. 2026-12-01', 'A: x 2026-10-15 .. 2026-12-01\nA: y 2026-10-01 .. 2026-12-01');
  check('I1 a 14-day slip is "1 slipped (worst x +2 weeks)" and the other item is untouched', /1 slipped \(worst x \+2 weeks\)/.test(d.sinceLine) && d.slips.length === 1, d.sinceLine);
  d = v('A: x 2026-10-01 .. 2026-12-01', 'A: x 2026-09-17 .. 2026-12-01');
  check('I2 a 14-day pull-in counts as "pulled in" (not slipped)', /1 pulled in/.test(d.sinceLine) && d.slips[0].days === -14, d.sinceLine);
  d = v('A: x 2026-10-01 .. 2026-12-01', 'A: x 2026-10-01 .. 2026-12-20');
  check('I3 a pure P90 move out is "1 range widened"', /1 range widened/.test(d.sinceLine));
  d = v('A: x 2026-10-01 .. 2026-12-01', 'A: x 2026-10-04 .. 2026-12-01');
  check('TL-6 a 3-day slip is not printed as "+0 wks"', !/\+0 wks/.test(d.sinceLine), d.sinceLine);
  const md = toMarkdown(M('A: x 2026-10-04 .. 2026-12-01'), timelineDiffView(timelineDiff(M('A: x 2026-10-01 .. 2026-12-01'), M('A: x 2026-10-04 .. 2026-12-01')), 'then'), '', T0);
  check('TL-6b the Markdown export does not say "slipped +0 weeks" either', !/\+0 weeks/.test(md), (md.match(/- x slipped.*/) || [''])[0]);
  d = v('A: x 2026-10-01 .. 2026-12-01 [risk]', 'A: x 2026-10-01 .. 2026-12-01');
  check('TL-7 a change that Compare detects (status risk → forecast) is not summarised as "nothing moved"', !(d.any && /nothing moved/.test(d.sinceLine)), `any=${d.any}: ${d.sinceLine}`);
  d = v('A: x 2026-10-01 .. 2026-12-01', 'A: x 2026-10-01 .. 2026-11-01');
  check('TL-8 pulling a P90 IN is not called "widened"', !/widened/.test(d.sinceLine), d.sinceLine);
  d = v('A: x 2026-10-01 .. 2026-12-01', 'A: x 2026-10-01 [done]');
  check('TL-8b marking a range [done] on its P50 date is not called "1 range widened"', !/widened/.test(d.sinceLine), d.sinceLine);
  d = v('A: x 2026-10-01 .. 2026-12-01\nA: gone 2026-11 .. 2026-12', 'A: x 2026-10-01 .. 2026-12-01\nA: fresh 2026-11 .. 2026-12');
  check('I4 new and dropped items are counted and the dropped label kept', /1 new/.test(d.sinceLine) && /1 dropped/.test(d.sinceLine) && d.dropped[0] === 'gone');
  d = v('A: x 2026-10-01 .. 2026-12-01\nA: x 2026-10-01 .. 2026-12-01', 'A: x 2026-10-01 .. 2026-12-01\nA: x 2026-10-08 .. 2026-12-01');
  check('I5 repeated labels in one lane are compared by occurrence (second one slipped, first untouched)', d.slips.length === 1 && d.slips[0].days === 7, d.sinceLine);
  d = v('A: x 2026-10-01 .. 2026-12-01', 'A: x 2026-10-01 .. 2026-12-01 // a new note');
  check('I6 a note-only edit is not a move', !d.any && /nothing moved/.test(d.sinceLine));
  d = v('A: x 2026-10-01 .. 2026-12-01', 'a:  X   2026-10-01 .. 2026-12-01');
  check('I7 identity folds case and runs of spaces', !d.any);
  d = v('A: x 2026-10-01 .. 2026-12-01', 'B: x 2026-10-01 .. 2026-12-01');
  check('I8 moving a milestone to another lane is a drop plus a new milestone (documented)', d.dropped.length === 1 && d.newKeys.size === 1);
  const sorted = v('A: a 2026-10-01 .. 2026-12-01\nA: b 2026-10-01 .. 2026-12-01\nA: c 2026-10-01 .. 2026-12-01', 'A: a 2026-10-15 .. 2026-12-01\nA: b 2026-12-01 .. 2026-12-20\nA: c 2026-09-01 .. 2026-12-01');
  check('I9 "worst" is the largest absolute LATE slip, not the largest pull-in', /worst b \+/.test(sorted.sinceLine) && /1 pulled in/.test(sorted.sinceLine), sorted.sinceLine);
}

// ======================================================================================
// J. Hand-off to Premortem, and which "today" each surface uses
// ======================================================================================
{
  const text = 'title: Lantern — launch\nA: a 2026-10-01 .. 2026-12-01\nB: b 2026-11-01 .. 2027-01-01\nGate 2027-02-01 [fixed]';
  const h = premortemHandoff(M(text), T0, '/timeline/#x');
  check('J1 hand-off question names the deadline date and the title; null with fewer than two ranged lanes', h && h.question === 'It’s 1 Feb 2027 and Lantern — launch slipped. Why?' && premortemHandoff(M('A: a 2026-10 .. 2026-12'), T0) === null, h && h.question);
  const h2 = premortemHandoff(M('A: a 2026-10-01 .. 2026-12-01\nB: b 2026-11-01 .. 2027-01-01'), T0);
  check('J2 with no deadline and no title the question uses the nominal date and "the plan"', h2.question === 'It’s 1 Nov 2026 and the plan slipped. Why?', h2.question);
  // today consistency
  const clock = parseDate('2027-06-01');        // stand-in for the real clock the app passes
  const tx = 'today: 2026-09-05\nA: a 2026-10-01 .. 2026-12-01\nB: b 2026-11-01 .. 2027-01-01';
  const m = M(tx), page = timelineVerdict(m, m.today).line, md = toMarkdown(m, null, '', clock).split('\n')[2];
  const app = read('timeline/app.js');
  check('TL-12a Markdown copy uses the same "today" as the page (model.today when authored)', md === '**' + page + '**', `page: ${page}  |  markdown: ${md}`);
  check('TL-12b the Premortem button/hand-off uses the same "today" as the page', premortemHandoff(m, clock) !== null, `app.js passes todayDay() (the clock) not model.today: hidden/changed when the clock is past the authored today`);
  check('TL-12c app.js passes model.today ?? todayDay() to every verdict consumer (toMarkdown, premortemHandoff, editing placeholder)',
    !/toMarkdown\(model, currentDiff\(\), location\.href, todayDay\(\)\)/.test(app) && !/premortemHandoff\(model, todayDay\(\)/.test(app),
    'app.js lines: toMarkdown(..., todayDay()), premortemHandoff(model, todayDay()) x2, timelineVerdict(model, todayDay()) x2');
  const emb = read('embed/definitions/timeline.js');
  check('TL-12d the article embed summary uses the model\'s own today like its figure does', !/timelineVerdict\(m,c\.today\)/.test(emb), 'embed/definitions/timeline.js: summary = timelineVerdict(m, c.today); figure = render(m, c) which prefers m.today');
  check('J3 the page itself (readout and render) uses model.today ?? clock', /effToday\(\)\)/.test(app) && /todayDay = \(\) => localDay\(\)/.test(app) && /const today = model\.today \?\? ctx\.today/.test(read('timeline/render.js')));
  check('TL-23 "today" is the viewer\'s local calendar day, not the UTC day (app.js reads timeline/clock.js, which turns local year/month/day into a day number; browser-checked in a UTC+13 and a UTC-8 zone)', !/Math\.floor\(Date\.now\(\) \/ 86400000\)/.test(app) && /localDay/.test(app) && /getFullYear/.test(read('timeline/clock.js')),
    'between local midnight and UTC midnight (up to 13 h ahead of UTC) the page is a day behind the viewer');
}

// ======================================================================================
// K. Same quantity, same words: Markdown, chart, readout
// ======================================================================================
{
  const text = 'today: 2026-09-05\nA: a 2026-10 .. 2026-12\nB: b 2026-11 .. 2027-01';
  const md = toMarkdown(M(text), null, '', T0), svg = words(R(text));
  check('TL-16 Markdown writes a month-only date as the month the chart does ("Oct 2026"), not an invented "15 Oct 2026"', /\| Oct 2026 \| Dec 2026 \|/.test(md) && /Finish Oct 2026 – Dec 2026/.test(svg),
    `chart: ${svg.match(/Finish Oct 2026 – Dec 2026/)?.[0]}; markdown row: ${md.split('\n').find(l => l.startsWith('| a'))}`);
  const pipe = toMarkdown(M('A: x | y 2026-10 .. 2026-12 // note | here'), null, '', T0).split('\n').filter(l => l.startsWith('| x'));
  check('TL-13 a "|" in a label or note does not break the Markdown table row', pipe.length === 1 && pipe[0].split(/(?<!\\)\|/).length === 9, pipe[0]);
  check('K1 Markdown carries the same verdict line the page shows (model has no today: key)', toMarkdown(M('A: a 2026-10-01 .. 2026-12-01\nB: b 2026-11-01 .. 2027-01-01'), null, '', T0).includes(line('A: a 2026-10-01 .. 2026-12-01\nB: b 2026-11-01 .. 2027-01-01')));
  check('K2 Markdown row for done/fixed/no-range prints "done"/"fixed"/"no range" in the P90 column', (() => { const t = toMarkdown(M('D 2026-08-01 [done]\nF 2026-12-01 [fixed]\nS 2026-12-02'), null, '', T0); return /\| done \|/.test(t) && /\| fixed \|/.test(t) && /\| no range \|/.test(t); })());
  const sd = line('A: a 2026-10-05 .. 2026-10-05\nB: b 2026-11-01 .. 2027-01-01');
  check('TL-19 a same-day range ("P50 5 Oct, could slip to 5 Oct") is not worded as a slip risk, and warns like a single date does', !/could slip to 5 Oct 2026/.test(sd) && M('A: a 2026-10-05 .. 2026-10-05').warnings.length > 0,
    `verdict: ${sd}; warnings: ${M('A: a 2026-10-05 .. 2026-10-05').warnings.length}`);
  let fv = null;                                      // scan a gate date whose joint prints "≈ 5%" with a "15%" in the gate's own label: the shared markFigure splits on the FIRST "5%"
  for(let g = parseDate('2026-08-01'); g < parseDate('2026-10-01') && !fv; g++){
    const v = timelineVerdict(M(`A: a 2026-10-01 .. 2026-12-01\nB: b 2026-10-01 .. 2026-12-01\nQ3 15% rollout ${iso(g)} [fixed]`), parseDate('2026-06-01'));
    if(/≈ 5%;/.test(v.line)) fv = v;
  }
  const fig = fv ? markFigure(fv.line, fv.fig) : [{t: '', fig: false}];
  check('TL-24 the highlighted figure is the probability, not the "5%" inside "15%" earlier in the line', !!fv && fig.find(f => f.fig).t.endsWith('5%') && fig[0].t.includes('clear it'), fv ? 'figure "' + fv.fig + '" in: ' + fv.line : 'no 5% case found');
}

// ======================================================================================
// L. Built-in examples and the starter: every printed figure recomputed independently
// ======================================================================================
{
  const src = read('timeline/app.js'), a = src.indexOf('const EXAMPLES = ['), b = src.indexOf('\n];', a) + 3;
  const EX = new Function(src.slice(a, b).replace('const EXAMPLES =', 'return'))();
  EX.push({name: 'Starter', src: STARTER});
  const sumOf = ex => ex.name;
  for(const ex of EX){
    for(const clock of ['2026-09-05', '2026-11-13']){
      const m = M(ex.src), today = m.today ?? parseDate(clock), v = timelineVerdict(m, today), full = timelineReadout(m, today);
      // independent lane grouping: latest open item per lane by (p50, p90), ranged only
      const open = new Map();
      for(const it of m.items){ if(it.status === 'done' || it.status === 'fixed') continue; const k = it.lane.toLowerCase().replace(/\s+/g, ' ').trim(); if(!open.has(k)) open.set(k, []); open.get(k).push(it); }
      const lanes = [...open.values()].map(its => ({latest: its.reduce((c, it) => it.p50 > c.p50 || (it.p50 === c.p50 && it.p90 > c.p90) ? it : c), its}))
        .filter(({latest}) => !latest.single && latest.p90 > latest.p50)
        .map(({latest, its}) => ({p50: latest.p50, sp: latest.p90 - latest.p50, items: its.filter(i => !i.single && i.p90 > i.p50).map(i => ({p50: i.p50, sp: i.p90 - i.p50}))}));
      const fixed = m.items.filter(i => i.status === 'fixed' && i.p50 >= today).sort((x, y) => y.p50 - x.p50)[0];
      const nominal = Math.max(...lanes.map(l => l.p50)), D = fixed ? fixed.p50 : nominal;
      const pAll = refJoint(lanes, D, today), d80 = bruteD80(lanes, refJoint, today), ok = [];
      if(lanes.length >= 2){
        ok.push(['percent', full.includes(pcRef(pAll))], ['d80 date', full.includes(refFmt(d80))], ['lane count', full.includes(lanes.length + ' ranged lanes')]);
        const gap = d80 - D; ok.push(['gap side', !fixed ? /\(\+\d+ (days?|weeks?)\)/.test(full) : gap > 0 ? /past it/.test(full) : gap < 0 ? /inside it|\(\+/.test(full) || /inside/.test(full) : /deadline day/.test(full)]);
        ok.push(['gap words', fixed ? full.includes(refDur(Math.abs(gap))) : true]);
      }
      const decide = m.items.filter(i => i.status === 'fixed' && i.leadDays).map(i => refFmt(i.p50 - i.leadDays));
      for(const d of decide) ok.push(['decide-by ' + d, full.includes(d)]);
      const widest = m.items.filter(i => !i.single).reduce((x, y) => (y.p90 - y.p50) > (x.p90 - x.p50) ? y : x);
      ok.push(['widest whisker', full.includes(widest.label + ' — ' + refDur(widest.p90 - widest.p50) + ' between') || (widest.p90 - widest.p50) < 7]);
      const next = m.items.filter(i => i.status !== 'done' && i.p50 >= today).sort((x, y) => x.p50 - y.p50)[0];
      ok.push(['next up', !next || full.includes('Next up: ' + next.label)]);
      ok.push(['no warnings', m.warnings.length === 0]);
      ok.push(['fig inside line', !v.fig || v.line.includes(v.fig)]);
      ok.push(['no NaN', !/NaN|undefined|Infinity/.test(full + R(ex.src, today) + toMarkdown(m, null, '', today))]);
      const failed = ok.filter(([, g]) => !g).map(([k]) => k);
      check(`L ${sumOf(ex)} @ ${clock}: every printed figure and claim matches an independent recomputation`, failed.length === 0, failed.join(', ') || `${pcRef(pAll)} by ${refFmt(D)}, 80% ${refFmt(d80)}, ${lanes.length} lanes`);
    }
  }
}

// ======================================================================================
// M. Edges: nothing throws, nothing prints NaN, and what is said is checked above
// ======================================================================================
{
  const cases = {
    empty: '', commentsOnly: '// nothing\n', oneLane: 'A: a 2026-10 .. 2026-12', allDone: 'A: a 2026-01-01 [done]\nB: b 2026-02-01 [done]', allFixed: 'A: a 2026-10-01 [fixed]\nB: b 2026-11-01 [fixed]',
    sameDay: 'A: a 2026-10-05 .. 2026-10-05\nB: b 2026-10-05 .. 2026-10-05', reversed: 'A: a 2026-12 .. 2026-10\nB: b 2027-01 .. 2026-11',
    farApart: 'A: a 2000-01-01 .. 2099-12-31\nB: b 2026-10-01 .. 2026-10-02', leapEnd: 'A: a 2028-02-28 .. 2028-03-01\nB: b 2028-02-29 .. 2028-03-02\nG 2028-03-05 [fixed]',
    yearEnd: 'A: a 2026-12-30 .. 2027-01-02\nB: b 2026-12-31 .. 2027-01-03', twoFixed: 'A: a 2026-10 .. 2026-12\nB: b 2026-11 .. 2027-01\nG1 2027-02-01 [fixed]\nG2 2027-03-01 [fixed]',
    tie: 'A: a 2026-10 .. 2026-12\nB: b 2026-10 .. 2026-12', junk: 'zzz\n::\n2026-13-45\nA: 2026-10 .. \n[fixed]\n// c\nA: ok 2026-10 .. 2026-12',
    pastEvent: 'E 2026-01-01 [fixed] [lead: 6w]\nA: a 2026-10 .. 2026-12\nB: b 2026-11 .. 2027-01',
    manyLanes: Array.from({length: 300}, (_, i) => `L${i}: a 2026-10-01 .. 2026-1${i % 3}-20`).join('\n'),
  };
  for(const [k, t] of Object.entries(cases)){
    let err = '', out = '';
    try{
      const m = M(t);
      out = [timelineReadout(m, T0), JSON.stringify(timelineVerdict(m, T0)), toMarkdown(m, null, '', T0), R(t, T0, 'native'), R(t, T0, 'presentation'), R(t, T0, 'live-narrow'),
        JSON.stringify(premortemHandoff(m, T0)), ...m.items.map(i => inspectorHTML(i, T0))].join('\n');
    }catch(e){ err = e.message; }
    check(`M ${k}: parse, readout, verdict, Markdown, three renders, hand-off, inspector run without error or NaN/undefined/Infinity`, !err && !/NaN|undefined|Infinity/.test(out), err || (out.match(/.{20}(NaN|undefined|Infinity).{20}/) || [''])[0]);
  }
  const one = M('A: a 2026-10 .. 2026-12');
  check('M1 a single lane produces no merge-risk claim and no hand-off', mergeBias(one, T0) === null && premortemHandoff(one, T0) === null);
  const allFixed = timelineVerdict(M(cases.allFixed), T0);
  console.log(`   info: all-fixed verdict "${allFixed.line}"; all-done verdict "${timelineVerdict(M(cases.allDone), T0).line}"; empty verdict "${timelineVerdict(M(''), T0).line}"`);
  const dm = M(cases.twoFixed), r2 = timelineReadout(dm, T0);
  check('M2 two fixed dates: measured against the later one and says so', /latest of 2 fixed dates/.test(r2) && /Mar 2027|1 Mar 2027/.test(r2));
  const pj = M(cases.junk);
  check('M3 each of the five unparseable lines produces a line-numbered warning; the valid line survives', pj.items.some(i => i.label === 'ok') && new Set(pj.warnings.map(w => w.match(/^line (\d+)/)[1])).size >= 5, pj.warnings.join(' || '));
}

// ======================================================================================
// N. Saved state: arbitrary shared-link text never breaks the model invariants
// ======================================================================================
{
  const r = rng(1234), pieces = ['A', 'B: ', 'lane: ', '2026-10', '2026-10-05', '2026-02-30', '..', ' – ', ' — ', '[fixed]', '[done]', '[risk]', '[lead: 6w]', '[lead: 0d]', '[started: 2026-09-01]', '// n', 'today: 2026-09-05', 'today: 9999-12-31', 'verdict: x 5%', 'verdict: off', 'title: T', '\n', '\n', ' ', 'x', '0000-01-01', '9999-12-31', '[', ']', ':', '|', '1e9', '2026-1-1'];
  let bad = 0, thrown = 0, msg = '';
  for(let i = 0; i < 3000; i++){
    let t = ''; for(let k = 0, n = 3 + Math.floor(r() * 25); k < n; k++) t += pieces[Math.floor(r() * pieces.length)];
    try{
      const m = M(t);
      for(const it of m.items){
        if(!Number.isInteger(it.p50) || !Number.isInteger(it.p90) || it.p90 < it.p50 || (it.single && it.p90 !== it.p50) || (it.started !== null && !Number.isInteger(it.started))) { bad++; msg = t; }
      }
      const today = m.today ?? T0;
      timelineReadout(m, today); timelineVerdict(m, today); toMarkdown(m, null, '', today); premortemHandoff(m, today);
      const mb = mergeBias(m, today);
      if(mb && !(mb.pAll >= 0 && mb.pAll <= 1 && mb.d80 > mb.byDate - 1e9 && Number.isInteger(mb.d80))) { bad++; msg = t; }
    }catch(e){ thrown++; msg = e.message + ' :: ' + JSON.stringify(t); }
  }
  check('N1 3000 fuzzed documents: items satisfy p50 <= p90, integer days; readout/verdict/Markdown/hand-off never throw; pAll in [0,1]', bad === 0 && thrown === 0, `${bad} invariant breaks, ${thrown} throws ${msg ? '(e.g. ' + msg.slice(0, 160) + ')' : ''}`);
  const sp = parse('today: 2026-09-05\nA: x 2026-10 .. 2026-12 [started: 2026-09-20]\nB: y 2026-10-10 [done] [started: 2026-12-01]');
  check('N2 a start after today (authored today) and a start after completion each warn', sp.warnings.some(w => /after today/.test(w)) && sp.warnings.some(w => /after completion/.test(w)), sp.warnings.join(' || '));
}

// ======================================================================================
// O. Informational: modelling assumptions the page does not state (printed, not asserted)
// ======================================================================================
{
  const ex = 'today: 2026-09-05\nApp: Beta cut 2026-09-18 .. 2026-10-02\nApp: Store review 2026-10-19 .. 2026-11-16\nAssurance: Privacy audit 2026-10-12 .. 2026-11-23\nLaunch: Campaign ready 2026-11-02 .. 2026-11-16\nLaunch: Launch forecast 2026-11-20 .. 2026-12-11\nLaunch: Conference 2026-12-15 [fixed]';
  const m = M(ex), fits = laneFits(m, m.today).lanes, D = parseDate('2026-12-15');
  const ind = refJoint(fits.map(l => ({p50: l.p50, sp: l.p90 - l.p50})), D);
  const como = Math.min(...fits.map(l => Phi((D - l.p50) / l.sigma)));
  const ln = fits.map(l => { const a = l.p50 - m.today, b = l.p90 - m.today, mu = Math.log(a), s = (Math.log(b) - Math.log(a)) / Z90; return Phi((Math.log(D - m.today) - mu) / s); }).reduce((p, x) => p * x, 1);
  console.log(`   info (TL-Q1/Q2) App launch example vs the 15 Dec fixed date: independent normal ${(ind * 100).toFixed(1)}% (printed); fully correlated normal (min lane) ${(como * 100).toFixed(1)}%; independent lognormal on days-from-today ${(ln * 100).toFixed(1)}%`);
  const lanesLate = 'A: a 2026-08-20 .. 2026-10-20\nB: b 2026-10-01 .. 2026-12-01\nGate 2026-12-15 [fixed]';
  const mm = M(lanesLate), fl = laneFits(mm, T0).lanes, la = fl[0];
  const A = {p50: la.p50, sp: la.p90 - la.p50}, Bl = {p50: fl[1].p50, sp: fl[1].p90 - fl[1].p50};
  const unconditional = Phi((D - la.p50) / la.sigma), conditional = refLane(A, D, T0);
  check('TL-Q5 a lane past its median but not its P90 is conditioned on "not finished yet": A by 15 Dec reads lower than the plain normal, and the whole-plan figure is the conditional product', mergeBias(mm, T0).laneP.length === 2 && Math.abs(mergeBias(mm, T0).pAll - refJoint([A, Bl], mergeBias(mm, T0).byDate, T0)) < 1e-9 && conditional < unconditional,
    `lane A by 15 Dec: plain ${(unconditional * 100).toFixed(1)}% -> conditional ${(conditional * 100).toFixed(1)}%; whole plan prints ${pcRef(mergeBias(mm, T0).pAll)} (was 94%)`);
  check('O1 (record) the tool\'s lane fit is a symmetric normal in calendar days: a P50..P90 pair puts P10 as far before P50 as P90 is after it', Math.abs(normCdf(-(1.2815515655)) - 0.1) < 1e-6);
}

// ======================================================================================
// P. The lane model proved against references that share no code with it (spec, Part 3 A)
// ======================================================================================
{ // P1: the minimum rule against a brute-force reference: random lanes of 1 to 3 open ranged items, with today inside the plan
  const r = rng(424242); let n = 0, badP = 0, badD = 0, worst = 0;
  for(let i = 0; i < 600; i++){
    const K = 2 + Math.floor(r() * 3), lanes = [], text = [];
    for(let k = 0; k < K; k++){
      const its = []; for(let j = 0, J = 1 + Math.floor(r() * 3); j < J; j++) its.push({p50: BASE + Math.floor(r() * 300), sp: 30 + Math.floor(r() * 250)});
      lanes.push(its); its.forEach((it, j) => text.push(`L${k}: i${j} ${iso(it.p50)} .. ${iso(it.p50 + it.sp)}`));
    }
    const today = BASE + Math.floor(r() * 250), refLanes = lanes.map(its => ({...its.reduce((a, b) => b.p50 > a.p50 || (b.p50 === a.p50 && b.sp > a.sp) ? b : a), items: its}));
    const mb = mergeBias(M(text.join('\n')), today); if(!mb) continue; n++;
    const e = Math.abs(mb.pAll - refJoint(refLanes, mb.byDate, today)); worst = Math.max(worst, e); if(e > 1e-9) badP++;
    if(mb.d80 !== bruteD80(refLanes, refJoint, today)) badD++;
  }
  check('P1 the minimum rule: pAll and the 80% date equal a brute-force reference (independent normal, per-item survival, conditional on today) over 600 random plans', badP === 0 && badD === 0, `${n} plans, worst gap ${worst.toExponential(2)}, ${badD} date mismatches`);
}
{ // P2: the conditional against numerical integration of the normal density, lanes 0, 1, 5, 20 and 60 standard deviations late
  const integ = (zT, zD) => { const f = u => Math.exp(-(u * u / 2 + u * zT)), sim = (a, b, n) => { const h = (b - a) / n; let t = f(a) + f(b); for(let i = 1; i < n; i++) t += f(a + i * h) * (i % 2 ? 4 : 2); return t * h / 3; };
    return sim(0, zD - zT, 20000) / sim(0, 60 / (Math.max(zT, 0) + 1) + 12, 200000); };
  let worst = 0, n = 0;
  for(const late of [0, 1, 5, 20, 60]) for(const frac of [0.05, 0.25, 0.5, 1, 2, 5]){
    const sp = 40, sigma = sp / Z90, p50 = BASE, today = p50 + Math.round(late * sigma), D = today + Math.max(1, Math.round(frac * sigma / (late + 1)));
    const mb = mergeBias(M(`A: a ${iso(p50)} .. ${iso(p50 + sp)}\nB: b ${iso(today + 400)} .. ${iso(today + 500)}\nGate ${iso(D)} [fixed]`), today);
    const zT = (today - p50) / sigma, zD = (D - p50) / sigma, want = integ(zT, zD), got = mb.laneP[0];
    worst = Math.max(worst, Math.abs(got - want)); n++;
  }
  check('P2 conditional probability = integral of the normal density from today to D over its tail beyond today, for lanes 0, 1, 5, 20 and 60 standard deviations late', worst < 1e-7, `${n} cases, worst gap ${worst.toExponential(2)}`);
}
{ // P3: invariants of the conditional lane probability, never NaN, however late
  let bad = 0, n = 0;
  for(const late of [-5, -1, 0, 0.5, 1, 3, 5, 10, 20, 40, 60, 100, 300, 1000]){
    const sigma = 11, lane = {p50: BASE, sigma, items: [{p50: BASE, sigma}]}, today = BASE + Math.round(late * sigma);
    let prev = -1;
    for(let D = today - 30; D <= today + 600; D += 5){
      const p = jointAt([lane], D, today), un = jointAt([lane], D);
      n++; if(!(p >= 0 && p <= 1) || Number.isNaN(p) || p < prev - 1e-15 || p > un + 1e-15) bad++; prev = p;
    }
  }
  check('P3 conditional joint: in [0,1], non-decreasing in the date, never NaN, never above the unconditional value (14 lateness levels up to 1000 sigma)', bad === 0, `${bad} violations in ${n} points`);
}
{ // P4: double-precision normal: the old 7e-8 absolute error and the 0.4 % relative tail error are gone
  let maxA = 0, maxR = 0;
  for(let z = -8; z <= 8; z += 0.001){ const e = Math.abs(normCdf(z) - Phi(z)); maxA = Math.max(maxA, e); if(z <= -2) maxR = Math.max(maxR, e / Phi(z)); }
  check('P4 normCdf: absolute error below 1e-13 on [-8, 8] and relative error below 1e-11 in the lower tail', maxA < 1e-13 && maxR < 1e-11, `abs ${maxA.toExponential(2)}, lower-tail relative ${maxR.toExponential(2)}`);
}
{ // by-design rulings that are KEPT: each states its rule
  const six = ro('A: a 2026-10-01 .. 2026-12-01\nB: b 2026-11-01 .. 2027-01-01\nC: c 2026-12-10');
  check('TL-Q6 (by design) a lane whose latest item is a single date stays out of the joint; the full readout says so and the short form says "ranged lanes"', /1 single-date lane not counted/.test(six) && /all 2 ranged lanes by/.test(line('A: a 2026-10-01 .. 2026-12-01\nB: b 2026-11-01 .. 2027-01-01\nC: c 2026-12-10')));
  const html = read('timeline/index.html');
  check('TL-Q1/Q2 (by design) the page says the lanes are independent and each is a normal curve through P50 and P90', /independent/.test(html) && /normal curve through its P50 and P90/.test(html));
  check('TL-Q4 (by design) a bare month means its 15th; a sentence quoting one prints "mid-Nov 2026", a computed date prints as a day; the syntax reference says so', parseDate('2026-11') === parseDate('2026-11-15') && /mid-Nov 2026/.test(line('A: a 2026-11 .. 2026-12\nB: b 2026-11 .. 2026-12')) && /80% needs \d+ \w{3} 20\d\d/.test(line('A: a 2026-11 .. 2026-12\nB: b 2026-11 .. 2026-12')) && /bare month means its 15th/.test(html));
  check('TL-Q7 (by design) a past fixed external event stays marked OVERDUE on the chart', /OVERDUE/.test(words(R('Gone 2026-08-01 [fixed]\nA: a 2026-10 .. 2026-12'))));
}

done();
