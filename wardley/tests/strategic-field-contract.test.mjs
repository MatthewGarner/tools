import {test} from 'node:test';
import assert from 'node:assert/strict';
import {parse} from '../parse.js';
import {layoutMap} from '../layout.js';
import {renderMap, GEOM} from '../render.js';

const ctx = {
  colors: {card:'#fff', border:'#d6d9d7', ink:'#182022', muted:'#667074', accent:'#1f4fd8',
    bg:'#f7f8f6', err:'#b3403a'},
  measure: text => String(text).length * 7,
  today: '2026-08-21',
};
const render = (src, intent = 'native', opts = {}) => {
  const model = parse(src);
  return renderMap(model, layoutMap(model, {measure:ctx.measure, intent, geom:GEOM}), {...ctx, intent}, {intent, ...opts});
};
const source = `title: Lantern platform
anchor: Reading
Recommendations @ custom
Catalogue DB @ commodity
Analytics pipeline
Reading -> Recommendations -> Catalogue DB
Reading -> Analytics pipeline`;

test('Strategic Field makes a single neutral evolution ruler and names vertical order as dependency projection', () => {
  const svg = render(source);
  assert.match(svg, /data-wardley-strategic-field/);
  assert.match(svg, /data-evolution-ruler/);
  assert.match(svg, /DEPENDENCY PROJECTION/);
  assert.ok(!svg.includes('VISIBLE ↑'), 'the source has no measured visibility value');
  assert.equal((svg.match(/data-stage-colour/g) || []).length, 0, 'evolution is not encoded as decorative stage colour');
});

test('every rendered component carries its exact authored evolution position while palette stays a single document rule', () => {
  const model = parse(source);
  const layout = layoutMap(model, {measure:ctx.measure, intent:'native', geom:GEOM});
  const svg = renderMap(model, layout, {
    ...ctx,
    colors: {...ctx.colors, accent:'#7b4a18'},
  }, {intent:'native'});
  assert.match(svg, /data-evolution-pin="" data-authored-x="0\.375"/, 'the named custom stage resolves to its exact authored coordinate');
  assert.match(svg, /data-document-accent=""[^>]*stroke="#7b4a18"/);
  assert.equal((svg.match(/#7b4a18/g) || []).length, 1, 'accent has one restrained document role');
  const accentY = +svg.match(/data-document-accent=""[^>]*y1="([\d.]+)"/)[1];
  const metricY = +svg.match(/<text x="56" y="([\d.]+)" font-size="12"[^>]*>3 components/)[1];
  assert.ok(accentY <= metricY - 12, 'the rule uses the title/metadata gutter rather than striking the metric text');
});

test('phone Strategic Ledger keeps source-order rows and exposes factual dependency context', () => {
  const svg = render(source, 'live-narrow');
  assert.match(svg, /data-strategic-ledger/);
  const lines = [...svg.matchAll(/data-strategic-row="(\d+)"/g)].map(m => +m[1]);
  assert.deepEqual(lines, [...lines].sort((a, b) => a - b));
  assert.match(svg, /NEEDS · Catalogue DB/);
  assert.match(svg, /NEEDED BY · Reading/);
  assert.match(svg, /CUSTOM · 0\.38/);
});

test('Copy PNG is exhaustive or explicitly refuses; it never selects a dependency spine', () => {
  const svg = render(source, 'presentation');
  for(const label of ['Reading', 'Recommendations', 'Catalogue DB', 'Analytics pipeline']) assert.ok(svg.includes(label));
  assert.match(svg, /data-strategic-inventory/);
  assert.ok(!svg.includes('DEPENDENCY SPINE'));
  const dense = 'title: Dense\nanchor: Need\n' + Array.from({length:30}, (_, i) =>
    'Capability with a deliberately long strategic name ' + (i + 1) + ' @ custom').join('\n');
  assert.match(render(dense, 'presentation'), /data-wardley-presentation-refusal/);
});

test('comparison facts remain textual across the presentation projection', () => {
  const prev = parse('anchor: Need\nCore @ custom\nOld cache @ product\nNeed -> Core -> Old cache');
  const cur = parse('anchor: Need\nCore @ product\nFresh cache @ genesis\nNeed -> Core -> Fresh cache');
  const layout = layoutMap(cur, {measure:ctx.measure, intent:'presentation', geom:GEOM});
  const svg = renderMap(cur, layout, {...ctx, intent:'presentation'}, {intent:'presentation', compare:{prev, label:'March'}});
  assert.match(svg, /data-strategic-diff/);
  assert.match(svg, /WAS CUSTOM · 0\.38 → PRODUCT · 0\.63/);
  assert.match(svg, /NEW · Fresh cache/);
  assert.match(svg, /DROPPED · Old cache/);
});
