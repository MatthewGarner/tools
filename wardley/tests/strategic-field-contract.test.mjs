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

test('dependency relationships are direct straight lines between value-chain nodes', () => {
  const svg = render('anchor: Need\nCapability @ product\nNeed -> Capability');
  const edge = svg.match(/<path class="edge" d="([^"]+)"/);
  assert.ok(edge, 'the dependency remains a visible map relationship');
  assert.match(edge[1], /^M [\d.]+ [\d.]+ L [\d.]+ [\d.]+$/, 'a Wardley relationship is one direct line, not a routed curve');
  assert.doesNotMatch(edge[1], /\b[CSQTA]\b/, 'the line contains no curve or arc command');
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
  const metricY = +svg.match(/<text x="56" y="([\d.]+)" font-size="12"[^>]*>horizontal positions are current claims/)[1];
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

test('direct numeric positions, tied ghost source order, and diagnostics remain exact in every factual projection', () => {
  const numeric = `anchor: Need
Core @ 0.3333
Need -> Core`;
  const numericModel = parse(numeric), numericLayout = layoutMap(numericModel, {measure:ctx.measure, intent:'native', geom:GEOM});
  for(const intent of ['native', 'live-narrow', 'presentation']){
    const svg = renderMap(numericModel, numericLayout, {...ctx, intent}, {intent});
    assert.match(svg, /CUSTOM · 0\.3333/, intent + ' keeps a direct numeric source claim exact');
  }
  const tied = render('anchor: Need\nNeed -> Zed ghost -> Alpha ghost', 'live-narrow');
  assert.ok(tied.indexOf('Need') < tied.indexOf('Zed ghost') && tied.indexOf('Zed ghost') < tied.indexOf('Alpha ghost'),
    'edge-created ghosts sharing a source line preserve edge-segment order');
  const invalid = parse('anchor: Need\nA @ bespoke\nNeed -> A -> B');
  const invalidLayout = layoutMap(invalid, {measure:ctx.measure, intent:'native', geom:GEOM});
  const native = renderMap(invalid, invalidLayout, {...ctx, intent:'native'}, {intent:'native'});
  const presentation = renderMap(invalid, invalidLayout, {...ctx, intent:'presentation'}, {intent:'presentation'});
  assert.match(native, /line 2: unknown stage &quot;bespoke&quot;/);
  assert.match(presentation, /line 3: undeclared &quot;B&quot; — added as a ghost/);
});

test('duplicate user needs are rejected as retained source diagnostics rather than silently collapsing', () => {
  const model = parse('anchor: Same need\nanchor: Same need\nA @ custom\nSame need -> A');
  assert.equal(model.anchors.length, 1, 'first declaration owns the shared user-need identity');
  assert.match(model.warnings.join('\n'), /line 2: duplicate anchor "Same need" — first declaration wins/);
  const layout = layoutMap(model, {measure:ctx.measure, intent:'presentation', geom:GEOM});
  const svg = renderMap(model, layout, {...ctx, intent:'presentation'}, {intent:'presentation'});
  assert.match(svg, /line 2: duplicate anchor &quot;Same need&quot; — first declaration wins/);
});

test('phone title and ruler targets meet the coarse 44px floor without competing, and desktop menus avoid other claims', () => {
  const phone = render(source, 'live-narrow', {edit:true});
  const track = phone.match(/<rect data-track=""[^>]*height="([\d.]+)"/);
  const titleHit = phone.match(/<rect data-title-hit=""[^>]*width="([\d.]+)" height="([\d.]+)"/);
  assert.ok(track && +track[1] >= 44, 'ruler hit plane is finger-sized');
  assert.ok(titleHit && +titleHit[1] >= 44 && +titleHit[2] >= 44, 'title hit plane is finger-sized');
  const crowded = render('anchor: Need\nAlpha @ 0.20\nBravo @ 0.30\nNeed -> Alpha\nNeed -> Bravo', 'native', {edit:true});
  const menus = [...crowded.matchAll(/data-menu-for="([^"]+)"[^>]*><rect data-hit="" x="([\d.]+)" y="([\d.]+)" width="([\d.]+)" height="([\d.]+)"/g)];
  const planes = [...crowded.matchAll(/class="strategic-label-plane" x="([\d.]+)" y="([\d.]+)" width="([\d.]+)" height="([\d.]+)"/g)].map(m => m.slice(1).map(Number));
  for(const menu of menus){
    const [x,y,w,h] = menu.slice(2).map(Number);
    assert.ok(planes.every(([px,py,pw,ph]) => x + w <= px || px + pw <= x || y + h <= py || py + ph <= y),
      'a contextual menu never sits over an unrelated field label');
  }
});

test('wide edit planes remain physically separate and comparison retains exact direct-coordinate changes', () => {
  const wide = render(source, 'native', {edit:true});
  const titlePlane = wide.match(/<rect data-title-hit=""[^>]*data-raw="Recommendations"[^>]*x="([\d.]+)" y="([\d.]+)" width="([\d.]+)" height="([\d.]+)"/);
  const stagePlane = wide.match(/<rect data-stage-hit=""[^>]*data-raw="custom"[^>]*x="([\d.]+)" y="([\d.]+)" width="([\d.]+)" height="([\d.]+)"/);
  assert.ok(titlePlane && stagePlane, 'the title and evolution planes are both emitted for a placed component');
  const [, tx, ty, tw, th] = titlePlane.map(Number);
  const [, sx, sy, sw, sh] = stagePlane.map(Number);
  assert.ok(tw >= 44 && th >= 44 && sw >= 44 && sh >= 44, 'both direct actions satisfy the same physical target floor');
  assert.ok(+tx + +tw <= +sx || +sx + +sw <= +tx || +ty + +th <= +sy || +sy + +sh <= +ty,
    'rename and evolution targets never compete for the same part of a live component');

  const prev = parse('anchor: Need\nCore @ 0.3333\nNeed -> Core');
  const cur = parse('anchor: Need\nCore @ 0.3349\nNeed -> Core');
  const layout = layoutMap(cur, {measure:ctx.measure, intent:'presentation', geom:GEOM});
  const diff = renderMap(cur, layout, {...ctx, intent:'presentation'}, {intent:'presentation', compare:{prev, label:'Before'}});
  assert.match(diff, /WAS CUSTOM · 0\.3333 → CUSTOM · 0\.3349 · Core/,
    'a precise authored movement remains visible even below a visually convenient rounding threshold');
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
