/* Engine-audit fixes: the words and exports (TR-5, TR-7, TR-10). */
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {parse} from '../parse.js';
import {evaluate} from '../engine.js';
import {render, treeVerdictParts} from '../render.js';
import {sharePct} from '../format.js';

const CTX = {colors: {card: '#fff', border: '#ddd', ink: '#222', muted: '#667', accent: '#08c', bg: '#f7f8f6', err: '#b33', brandText: '#D62015'},
  measure: t => String(t).length * 7, today: '2026-11-13'};
const texts = svg => [...svg.matchAll(/>([^<>]+)</g)].map(x => x[1].replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&')).join(' | ');
const SEAM = 'On midpoints, Bold edges ahead; across your full ranges, Safe still wins.';
const BOLD = 'R\n  Bold: 10k to 1M\n  Safe: 450k';

/* ---------- TR-5: the exported picture says what the page says ---------- */
test('TR-5: when the midpoint story and the simulation differ, the exported flip list carries the seam line and labels itself as the midpoint call', () => {
  const m = parse(BOLD), r = evaluate(m);
  for(const intent of ['native']){
    const t = texts(render(m, r, {...CTX, intent}));
    assert.match(t, /WHAT WOULD FLIP THE MIDPOINT CALL/);
    const flat = t.replace(/ \| /g, ' ');   // the picture is sized to its content, so a long sentence may wrap
    assert.ok(flat.includes(SEAM), intent + ': ' + t.slice(t.indexOf('WHAT WOULD')));
    assert.ok(flat.indexOf(SEAM) < flat.indexOf('Bold matters'), 'the explanation comes before the list it explains');
  }
  const narrow = texts(render(m, r, {...CTX, intent: 'live-narrow', width: 390}));
  assert.ok(narrow.replace(/ \| /g, ' ').includes(SEAM) && /WHAT WOULD FLIP THE MIDPOINT CALL/.test(narrow), 'the export-shaped narrow picture too');
});

test('TR-5: the live page already has its own seam line, so the live picture only labels the list', () => {
  const m = parse(BOLD), r = evaluate(m);
  const t = texts(render(m, r, {...CTX, intent: 'live-wide', edit: true}));
  assert.match(t, /WHAT WOULD FLIP THE MIDPOINT CALL/);
  assert.ok(!t.includes(SEAM));
});

test('TR-5: when both stories agree the list is unlabelled and carries no seam', () => {
  const m = parse('Bid\n  Submit bid: -150k\n    Outcome\n      Win (p=0.3-0.45): 2M to 5M\n      Lose (p=rest): 0\n  No bid: 0'), r = evaluate(m);
  const t = texts(render(m, r, {...CTX, intent: 'native'}));
  assert.match(t, /WHAT WOULD FLIP THIS \|/);
  assert.ok(!/MIDPOINT/.test(t) && !/edges ahead/.test(t));
});

test('TR-5: the slide still carries the disagreement, and every flip is printed in words with all its boundaries', () => {
  const m = parse(BOLD), r = evaluate(m);
  const slide = texts(render(m, r, {...CTX, intent: 'presentation'}));
  assert.match(slide, /Monte Carlo recommends Safe/);
  const nm = parse('R\n  A\n    Z (p=0.8): 100\n    X (p=0.2): 60\n    Rest (p=rest): 0\n  B: 85');
  const t = texts(render(nm, evaluate(nm), {...CTX, intent: 'native'}));
  assert.ok(t.includes('flips if p(X) < 0.08 or > 0.48'), t.slice(t.indexOf('WHAT WOULD')));
});

/* ---------- TR-7: a coin toss is worded as one ---------- */
const results = (aShare, aMean = 100, bMean = 99) => {
  const m = parse('R\n  A: 1\n  B: 2'), [a, b] = m.root.children;
  return {m, a, b, r: {policy: new Map([[m.root, a]]), stats: new Map([[m.root, {mean: aMean, p10: 0, p90: 0}], [a, {mean: aMean, p10: 0, p90: 0}], [b, {mean: bMean, p10: 0, p90: 0}]]),
    headToHead: [{a: 'A', b: 'B', aNode: a, bNode: b, aShare}], flips: [], warnings: []}};
};

test('TR-7: a head-to-head share of 45% to 55% between the top two is too close to call, naming both', () => {
  for(const share of [0.45, 0.5, 0.55]){
    const {m, r} = results(share);
    const v = treeVerdictParts(m, r);
    assert.match(v.line, /^A and B are too close to call/, share + ': ' + v.line);
    assert.ok(v.line.includes('£100'), 'the figure stays as computed: ' + v.line);
    assert.ok(!/^Choose/.test(v.line));
  }
  for(const share of [0.4499, 0.5501, 0.9]){
    const {m, r} = results(share);
    assert.match(treeVerdictParts(m, r).line, /^Choose A — expected value £100/, String(share));
  }
});

test('TR-7: the share is read from the pair that is top two by expected value, whichever order the pair is stored in', () => {
  const {m, a, b, r} = results(0.5);
  r.headToHead = [{a: 'B', b: 'A', aNode: b, bNode: a, aShare: 0.5}];
  assert.match(treeVerdictParts(m, r).line, /too close to call/);
  const three = parse('R\n  A: 1\n  B: 2\n  C: 3');
  const [x, y, z] = three.root.children;
  const stats = new Map([[three.root, {mean: 10}], [x, {mean: 10}], [y, {mean: 9}], [z, {mean: 1}]]);
  const rr = {policy: new Map([[three.root, x]]), stats, flips: [], warnings: [],
    headToHead: [{aNode: x, bNode: y, a: 'A', b: 'B', aShare: 0.9}, {aNode: x, bNode: z, a: 'A', b: 'C', aShare: 0.5}]};
  assert.match(treeVerdictParts(three, rr).line, /^Choose A/, 'a coin toss with the third-placed option is not the top two');
});

test('TR-7: an authored verdict still wins, and a real near-tie reads as one with the same draws', () => {
  const m = parse('verdict: We go with the range\nR\n  Ranged: 100k to 200k\n  Fixed: 144451'), r = evaluate(m);
  assert.equal(treeVerdictParts(m, r).line, 'We go with the range');
  const tie = parse('R\n  Ranged: 100k to 200k\n  Fixed: 144451'), tr = evaluate(tie);
  const v = treeVerdictParts(tie, tr).line;
  assert.match(v, /^(Ranged and Fixed|Fixed and Ranged) are too close to call — expected value £/);
  assert.match(texts(render(tie, tr, {...CTX, intent: 'native'})), /too close to call/);
});

/* ---------- TR-10: a counted share never prints a flat 0% or 100% ---------- */
test('TR-10: sharePct is whole percent from 1% to 99%, "<1%" and ">99%" outside, exact only when nothing is uncertain', () => {
  assert.equal(sharePct(0.9981, false), '>99%');
  assert.equal(sharePct(0.0019, false), '<1%');
  assert.equal(sharePct(0.85, false), '85%');
  assert.equal(sharePct(0.01, false), '1%');
  assert.equal(sharePct(0.99, false), '99%');
  assert.equal(sharePct(0.9949, false), '>99%');
  assert.equal(sharePct(0.005, false), '<1%');
  assert.equal(sharePct(1, false), '>99%');
  assert.equal(sharePct(0, false), '<1%');
  assert.equal(sharePct(1, true), '100%');
  assert.equal(sharePct(0, true), '0%');
  assert.equal(sharePct(0.5, true), '50%');
});

test('TR-10: the verdict evidence and the slide win rate print the honest share', () => {
  const m = parse('R\n  A: 1050 to 1250\n  B: 800 to 1000'), r = evaluate(m);
  const native = texts(render(m, r, {...CTX, intent: 'native'}));
  assert.match(native.replace(/ \| /g, ' '), /higher expected value than B in >99% of simulations/);
  assert.ok(!/in 100% of simulations/.test(native));
  const slide = texts(render(m, r, {...CTX, intent: 'presentation'}));
  assert.ok(/\| <1% \|/.test(slide) || /<1%/.test(slide), 'B wins a fraction of a percent: ' + slide);
  assert.ok(!/\| 0% \|/.test(slide));
  const flat = parse('R\n  A: 10\n  B: 5'), fr = evaluate(flat);
  assert.match(texts(render(flat, fr, {...CTX, intent: 'native'})).replace(/ \| /g, ' '), /in 100% of simulations/, 'with nothing uncertain, all of them is all of them');
});
