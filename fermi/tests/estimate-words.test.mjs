/* What the estimate page says about its results (FM-2, 6, 7, 9, 12, 13, 17, 18, 19, Q5, Q9, 25).
   Sentences only: nothing here reads or changes the random stream. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {tokenize, parse, collectVars, simulateModel, computeSensitivity, distMedian, traceDraws, evalNode} from '../engine.js';
import {quantile} from '../../assets/series.js';
import {renderDriverTree} from '../render-driver.js';
import {histLayout} from '../histlayout.js';
import {topDrivers, leverHint, treeHeadline, leverLine, verdictSentence, shareAbove, evenOdds,
  invalidNote, unmeasuredNote, underflowNote, arithmeticSentence, waitingMessage, suffixWarnings,
  distOverrideNotes, estimateMethod, rangeAria, nothingPlausible} from '../words.js';

const build = (f, v) => {
  const ast = parse(tokenize(f)), varNames = collectVars(ast, []);
  const ranges = Object.create(null), dists = Object.create(null);
  for(const n of varNames){ ranges[n] = v[n]; dists[n] = 'auto'; }
  return {ast, varNames, ranges, dists};
};
const colors = {card: '#fff', border: '#ddd', ink: '#222', muted: '#667', accent: '#08c', accent2: '#c62', err: '#b33'};
const sens = (...pairs) => pairs.map(([name, share]) => ({name, share, label: '×1.5'}));

test('FM-6: shares within 2 points of the top are a tie, named together', () => {
  assert.deepEqual(topDrivers(sens(['a', .226], ['b', .220], ['c', .08])), ['a', 'b']);
  assert.deepEqual(topDrivers(sens(['a', .40], ['b', .30])), ['a']);
  assert.deepEqual(topDrivers(sens(['a', .25], ['b', .24], ['c', .231])), ['a', 'b', 'c']);
  assert.deepEqual(topDrivers([]), []);
  // one dominance rule (words.dominantDriver): a share above one half and not tied. A tie at the
  // top is never "dominates", whatever the share, so the hint, the headline and the pour agree.
  const tied = leverHint(sens(['share_with_piano', .45], ['tunings_per_year', .44], ['x', .1]), '×4');
  assert.match(tied, /^No single input dominates/);
  assert.doesNotMatch(tied, /Pin /);
  const single = leverHint(sens(['households', .6], ['x', .1]), '×4');
  assert.match(single, /Pin households and the spread drops from ×4 to ×1\.5 — research it first\./);
  assert.match(leverHint(sens(['a', .2], ['b', .19]), '×4'), /^No single input dominates/);
  assert.match(treeHeadline(sens(['a', .45], ['b', .44]), '×4'), /^No single input dominates/);
  assert.match(treeHeadline(sens(['a', .55], ['b', .1]), '×4'), /Research a first — pinning it cuts the spread from ×4 to ×1\.5\./);
  assert.match(leverLine(sens(['a', .45], ['b', .44]), '×4'), /^No single input dominates — a and b are level at the top/);
  assert.match(leverLine(sens(['a', .45], ['b', .1]), '×4'), /^Biggest lever: a — knowing it exactly shrinks the spread from ×4 to ×1\.5\./);
});

test('FM-6: the tree marks every tied input and names them together', () => {
  const m = build('a * b * c', {a: [10, 40], b: [10, 40], c: [1, 1.01]});
  const run = simulateModel(m, {seed: 0x5EED, n: 20000}).sorted;
  const p10 = quantile(run, .1), p50 = quantile(run, .5), p90 = quantile(run, .9);
  const model = {...m, p10, p50, p90, ...computeSensitivity(m, {seed: 0x5EED, p10, p90})};
  assert.ok(Math.abs(model.sens[0].share - model.sens[1].share) < 0.02, 'a and b tie');
  const svg = renderDriverTree(model, {colors, measure: t => t.length * 7});
  const accented = [...svg.matchAll(/<rect data-node="var" data-name="(\w+)"[^>]*stroke="#08c"/g)].map(x => x[1]).sort();
  assert.deepEqual(accented, ['a', 'b']);
  assert.match(svg, /No single input dominates/);   // two equal drivers can never clear the 35% bar
});

test('FM-9: a variable used twice shows its share once in the tree', () => {
  const m = build('x * x * y', {x: [10, 40], y: [2, 8]});
  const run = simulateModel(m, {seed: 0x5EED, n: 20000}).sorted;
  const p10 = quantile(run, .1), p50 = quantile(run, .5), p90 = quantile(run, .9);
  const model = {...m, p10, p50, p90, ...computeSensitivity(m, {seed: 0x5EED, p10, p90})};
  const svg = renderDriverTree(model, {colors, measure: t => t.length * 7});
  const labels = [...svg.matchAll(/>(\d+)%<\/text>/g)].map(x => x[1]);
  assert.equal(labels.length, 2, 'one share for x, one for y: ' + labels);
});

test('FM-2: the headline claims four runs in five, not nine in ten', () => {
  const t = verdictSentence('3.1', '25', '80', 'tuners');
  assert.equal(t, '“Probably around 25 tuners — four runs in five land between 3.1 and 80.”');
  assert.doesNotMatch(t, /surprised|90%/);
  assert.equal(verdictSentence('3.1', '25', '80', ''), '“Probably around 25 — four runs in five land between 3.1 and 80.”');
});

test('FM-7: even odds is about P(>T), never the distance from P50', () => {
  const m = build('app_up * db_up * network_up * api_up',
    {app_up: [0.97, 0.999], db_up: [0.98, 0.9995], network_up: [0.99, 0.9999], api_up: [0.95, 0.999]});
  const s = simulateModel(m, {seed: 0x5EED, n: 20000}).sorted, p50 = quantile(s, .5);
  assert.ok(shareAbove(s, p50) > 0.49 && shareAbove(s, p50) < 0.51);
  assert.equal(evenOdds(s, p50), true);
  assert.equal(evenOdds(s, p50 * 1.019), false, 'within 2% of P50 but P(>T) is ' + shareAbove(s, p50 * 1.019));
  assert.equal(evenOdds(Float64Array.from([5, 5, 5]), 5), false);   // P(>5) = 0
  const wide = build('a * b', {a: [10, 1000], b: [10, 1000]});
  const w = simulateModel(wide, {seed: 1, n: 20000}).sorted;
  assert.equal(evenOdds(w, quantile(w, .5) * 1.1), true);          // far in value terms is fine when the spread is wide
  assert.equal(shareAbove(Float64Array.from([1, 2, 3, 4]), 2), 0.5);
});

test('FM-12: a sensitivity row that could not be measured is named', () => {
  const m = build('a / b', {a: [10, 40], b: [-3, 3]});
  const run = simulateModel(m, {seed: 0x5EED, n: 20000}).sorted;
  const r = computeSensitivity(m, {seed: 0x5EED, p10: quantile(run, .1), p90: quantile(run, .9)});
  assert.deepEqual(r.unmeasured, ['b']);
  assert.deepEqual(r.sens.map(s => s.name), ['a']);
  assert.equal(unmeasuredNote(['b']), 'No bar for b — pinning it leaves too few valid runs to measure.');
  assert.equal(unmeasuredNote(['b', 'c_d']), 'No bar for b, c d — pinning either leaves too few valid runs to measure.');
  const ok = build('a * b', {a: [10, 40], b: [2, 8]});
  assert.deepEqual(computeSensitivity(ok, {seed: 1, p10: 1, p90: 2}).unmeasured, []);
});

test('FM-13: any run left out for invalid maths is counted, whatever the share', () => {
  assert.equal(invalidNote(0, 20000), '');
  assert.match(invalidNote(152, 20000), /^152 of 20,000 runs \(0\.76%\) hit invalid maths and were left out\.$/);
  assert.match(invalidNote(3, 20000), /^3 of 20,000 runs \(<0\.1%\) hit invalid maths and were left out\.$/);
  assert.match(invalidNote(400, 20000), /\(2%\) hit invalid maths and were left out — a range probably crosses zero\.$/);
});

test('FM-18: a non-finite sum, a __proto__ name, a huge range and an underflow each behave', () => {
  assert.match(arithmeticSentence(Infinity), /doesn’t come to a number/);
  assert.doesNotMatch(arithmeticSentence(Infinity), /—\.|it comes to —/);
  assert.match(arithmeticSentence(42), /it comes to 42\./);
  const m = build('__proto__ * 2', Object.fromEntries([['__proto__', [10, 20]]]));
  assert.deepEqual(m.varNames, ['__proto__']);
  const run = simulateModel(m, {seed: 1, n: 200});
  assert.equal(run.sorted.length, 200);
  const med = quantile(run.sorted, .5);
  assert.ok(med > 25 && med < 35, 'P50 ' + med);
  const tr = traceDraws(m, {seed: 1, g: 20, order: ['__proto__']});
  assert.ok(tr.ok);
  assert.ok(Number.isFinite(distMedian(1e160, 1e170, 'logn')));
  assert.ok(Math.abs(distMedian(1e160, 1e170, 'logn') / Math.sqrt(1e160) / Math.sqrt(1e170) - 1) < 1e-9);
  assert.equal(distMedian(4, 9, 'logn'), 6);                          // ordinary inputs keep their exact value
  const tiny = build('a * b', {a: [1e-250, 1e-200], b: [1e-250, 1e-200]});
  const sorted = simulateModel(tiny, {seed: 1, n: 500}).sorted;
  assert.equal(quantile(sorted, .5), 0);
  assert.match(underflowNote(sorted, tiny.ranges, tiny.ast), /too small/);
  const ok = build('a * b', {a: [10, 40], b: [2, 8]});
  assert.equal(underflowNote(simulateModel(ok, {seed: 1, n: 500}).sorted, ok.ranges, ok.ast), '');
  const sub = build('a - a', {a: [10, 40]});
  assert.equal(underflowNote(simulateModel(sub, {seed: 1, n: 50}).sorted, sub.ranges, sub.ast), '');
});

test('FM-19: the hover share is a share of all runs', () => {
  const s = Float64Array.from(Array.from({length: 1000}, (_, i) => i + 100));
  const L = histLayout(s, {width: 440});
  assert.ok(L.total < s.length);
  const sum = L.bins.reduce((a, b) => a + b.shareAll, 0);
  assert.ok(Math.abs(sum - L.total / s.length) < 1e-9);
  for(const b of L.bins) assert.ok(Math.abs(b.shareAll - b.count / s.length) < 1e-12);
});

test('FM-15: the waiting message names the box it could not read', () => {
  const msg = waitingMessage([
    {name: 'households', lo: '', hi: '4M'},
    {name: 'share_with_piano', lo: '2%', hi: '8'},
    {name: 'a', lo: 'x', hi: ''}]);
  assert.equal(msg, 'Waiting on ranges for: households (low box empty); share_with_piano (low box “2%” can’t be read); a (low box “x” can’t be read, high box empty).');
});

test('FM-Q5: a one-letter suffix that is also an input warns', () => {
  const toks = tokenize('3m * m + 2k * x');
  const w = suffixWarnings({toks, ranges: [{name: 'x', lo: '3m', hi: '4M'}, {name: 'm', lo: '1', hi: '2'}], varNames: ['m', 'x']});
  assert.equal(w.length, 3);
  assert.match(w[0], /“3m” in the formula reads as 3 million, and m is also an input/);
  assert.ok(w.some(t => /in x’s range/.test(t) && /“3m”/.test(t)));
  assert.ok(w.some(t => /“4M”/.test(t)));
  assert.deepEqual(suffixWarnings({toks: tokenize('3m * x'), ranges: [{name: 'x', lo: '3m', hi: '4m'}], varNames: ['x']}), []);
});

test('FM-17: a uniform input is labelled a full range; a log-normal on zero says it runs as normal', () => {
  assert.equal(rangeAria('x', 'low', 'uni'), 'x low (full range)');
  assert.equal(rangeAria('x', 'high', 'auto'), 'x high (90% interval)');
  const notes = distOverrideNotes(['a', 'b', 'c'], {a: [0, 10], b: [1, 10], c: [-5, 5]}, {a: 'logn', b: 'logn', c: 'auto'});
  assert.deepEqual(notes, ['a is set to log-normal but its range reaches zero, so it runs as normal.']);
  assert.match(estimateMethod(['a', 'b', 'c'], {a: [1, 2], b: [1, 2], c: [-1, 1]}, {a: 'auto', b: 'uni', c: 'auto'}, 20000),
    /^Fit to each range: 1 log-normal, 1 normal, 1 uniform \(full range\) · 20,000 samples, good to two figures$/);
  // every range log-normal: the plain sentence is true as it stands
  assert.equal(estimateMethod(['a', 'b'], {a: [1, 2], b: [3, 9]}, {a: 'auto', b: 'logn'}, 20000),
    'Log-normal fit to each 90% range · 20,000 samples, good to two figures');
});

test('FM-Q9: "nothing plausible" says how far it looked', () => {
  assert.equal(nothingPlausible(1, '500', 3), 'Nothing plausible gets you to 500 — I looked as far as 3 half-widths of stretch, on one input or two together.');
  assert.match(nothingPlausible(-1, '500', 3), /^Nothing plausible keeps you under 500 — /);
});
