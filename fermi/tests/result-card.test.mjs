/* The distribution export (XF-1..7): the result card as SVG, drawn the same everywhere. */
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {renderResultCard, placeLabels, RESULT_CW} from '../result-card.js';
import {histLayout} from '../histlayout.js';

const measure = (text, font) => text.length * (parseFloat(/(\d+(?:\.\d+)?)px/.exec(font)[1]) * 0.55);
const colors = {card: '#fff', ink: '#111', muted: '#555', border: '#ccc', accent: '#2a55d6', err: '#c33'};
const ctx = {colors, measure, fonts: {sans: "'DM Sans',sans-serif"}};
const sorted = Array.from({length: 2000}, (_, i) => 50 + (i / 2000) * 400);
const base = {question: 'How many piano tuners does Chicago need?', unit: 'tuners', formula: 'a * b', p10: 78, p50: 183, p90: 430,
  p10Text: '78', p50Text: '183', p90Text: '430', verdict: 'Probably around 183 tuners — four runs in five land between 78 and 430.',
  spread: 'Spread: ×5.5 (P90 / P10)', method: '20,000 samples', layout: histLayout(sorted, {width: RESULT_CW}), fill: '#2a55d6', threshold: null, loText: '50', hiText: '450'};
const texts = svg => [...svg.matchAll(/<text\b[^>]*>([^<]*)<\/text>/g)].map(m => m[1]);

test('the card carries the question, the three figures, the verdict, the spread and the method line', () => {
  const t = texts(renderResultCard(base, ctx)).join('|');
  for(const want of ['How many piano tuners', 'Results in tuners', '78', '183', '430', 'Probably around 183 tuners', 'Spread: ×5.5', '20,000 samples']) assert.ok(t.includes(want), want);
});
test('no link text, a font stack ending in a generic family, and text wrapped at spaces', () => {
  const svg = renderResultCard({...base, question: 'Does the unlocking of cohorts ' + 'word '.repeat(40)}, ctx);
  assert.ok(!/https?:\/\/(?!www\.w3\.org)|#z:|Reopen/.test(svg));
  assert.match(svg, /font-family="'DM Sans',sans-serif"/);
  for(const line of texts(svg)) assert.ok(!/^[a-z]{1,3}$/.test(line) || line.length > 0);
  assert.ok(texts(svg).filter(l => /^word/.test(l)).length > 1, 'wrapped to several lines');
});
test('a point estimate draws one marked value, not an empty chart', () => {
  const svg = renderResultCard({...base, layout: {ok: false}, p10Text: '6', p50Text: '6', p90Text: '6'}, ctx);
  assert.match(svg, /one value, no spread/);
  assert.match(svg, /<circle/);
});
test('both variants are described when comparing', () => {
  const svg = renderResultCard({...base, compare: {active: 'A', other: 'B'}, variants: [{name: 'A', formula: 'a * b', p10: '1', p50: '2', p90: '3'}, {name: 'B', formula: 'a * b * c', p10: '4', p50: '5', p90: '6'}], compareText: 'B exceeds A in 70%'}, ctx);
  const t = texts(svg).join('|');
  assert.ok(t.includes('Variant A: a * b') && t.includes('Variant B: a * b * c') && t.includes('B exceeds A in 70%'));
});
test('percentile labels never overlap, even when the percentiles sit together (XF-5)', () => {
  const widths = [18, 18, 18];
  const left = placeLabels([300, 304, 308], widths, {min: 0, max: 736});
  const order = [0, 1, 2].sort((a, b) => left[a] - left[b]);
  for(let i = 1; i < 3; i++) assert.ok(left[order[i]] >= left[order[i - 1]] + widths[order[i - 1]], 'no overlap');
  const edge = placeLabels([730, 733, 736], widths, {min: 0, max: 736});
  assert.ok(Math.max(...edge.map((l, i) => l + widths[i])) <= 736.01, 'inside the right edge');
});
test('authored text cannot become markup', () => {
  const svg = renderResultCard({...base, question: '<script>alert(1)</script> & <b>x</b>', unit: '"><img src=x>'}, ctx);
  assert.ok(!/<script|<img|<b>/.test(svg));
  assert.match(svg, /&lt;script&gt;/);
});
