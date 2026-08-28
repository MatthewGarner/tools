import {test} from 'node:test';
import assert from 'node:assert/strict';
import {parse} from '../parse.js';
import {resolve} from '../zones.js';
import {readout} from '../readout.js';
import {render} from '../render.js';
import {renderMapPresentation} from '../render-presentation.js';
import {mapDiff, mapDiffView} from '../diff.js';

const ctx = {
  colors: {card:'#fff', border:'#d6d4cf', ink:'#171717', muted:'#73716d', accent:'#2457d6', accentInk:'#1c45aa', bg:'#f8f7f4',
    err:'#bf3029', brandText:'#d62015', status:{done:'#1D7A3E', doing:'#0C7FAE', risk:'#9A6A00', blocked:'#B3403A'}},
  measure: text => String(text).length * 7,
};
const source = `preset: assumptions
title: Lantern — launch assumptions

Readers finish the first book they start @ 30,90 :: test: watch 5 onboarding sessions
Push reminders feel caring, not naggy @ 35,75
Curated shelves save setup time @ 80,45
Legal sign-off on publisher licensing`;
const model = parse(source), resolved = resolve(model), ro = readout(model, resolved);

test('Zone Atlas has one quiet coordinate field and a factual decision margin', () => {
  const svg = render(model, resolved, ro, ctx);
  assert.match(svg, /data-map-layout="zone-atlas"/);
  assert.match(svg, /data-map-field="coordinates"/);
  assert.match(svg, /DECISION MARGIN/);
  assert.match(svg, /UNPLACED · 1/);
  assert.match(svg, /TEST FIRST/);
  assert.ok(!svg.includes('data-map-key'), 'the field does not relapse to a separate key-card dashboard');
  assert.ok(!/fill="#[0-9a-f]{3,6}"[^>]*opacity="0\.0[7-9]"/i.test(svg),
    'zones are named geometry, not tinted quadrants');
});

test('Zone Atlas phone is a source-order audit ledger, not a shrunken plane', () => {
  const svg = render(model, resolved, ro, {...ctx, width:390, edit:true});
  assert.match(svg, /data-map-layout="zone-atlas-phone"/);
  assert.match(svg, /SOURCE ORDER · PLACEMENT AUDIT/);
  assert.match(svg, /X · EVIDENCE — NONE TO STRONG/);
  assert.match(svg, /Y · IMPORTANCE — LOW TO HIGH/);
  assert.match(svg, /data-title-hit/);
  assert.match(svg, /data-position-hit/);
  assert.match(svg, /data-field-raw="watch 5 onboarding sessions"[^>]*data-key="test"/,
    'the phone ledger preserves the same quiet field-menu route');
  assert.ok(!svg.includes('data-map-field="coordinates"'));
});

test('Zone Atlas phone keeps the full authored item label in its source-order receipt', () => {
  const label = Array.from({length: 40}, (_, index) => 'word' + (index + 1)).join(' ');
  const m = parse(label + ' @ 30,70'), r = resolve(m);
  const phone = render(m, r, readout(m, r), {...ctx, width:390});
  assert.match(phone, /word1/);
  assert.match(phone, /word40/, 'a source-order receipt cannot silently truncate its authored item');
});

test('Zone Atlas phone gives rename and item-menu actions separate 44px routes', () => {
  const svg = render(model, resolved, ro, {...ctx, width:390, edit:true});
  const row = svg.match(/<g data-line="\d+"[^>]*data-edit="cardmenu"[\s\S]*?<rect data-title-hit=""[^>]*\/>/);
  assert.ok(row, 'expected one editable source row');
  const menu = row[0].match(/<rect data-hit="" x="([\d.]+)" y="([\d.]+)" width="([\d.]+)" height="([\d.]+)"/);
  const rename = row[0].match(/<rect data-title-hit="" x="([\d.]+)" y="([\d.]+)" width="([\d.]+)" height="([\d.]+)"/);
  assert.ok(menu && rename);
  assert.ok(+menu[3] >= 44 && +menu[4] >= 44 && +rename[3] >= 44 && +rename[4] >= 44);
  const overlap = Math.min(+menu[1] + +menu[3], +rename[1] + +rename[3]) > Math.max(+menu[1], +rename[1]) &&
    Math.min(+menu[2] + +menu[4], +rename[2] + +rename[4]) > Math.max(+menu[2], +rename[2]);
  assert.equal(overlap, false, 'the visible rename and menu actions cannot compete for the same touch area');
});

test('Zone Atlas keeps an authored field reachable through the quiet item menu', () => {
  const svg = render(model, resolved, ro, {...ctx, edit:true});
  assert.match(svg, /data-edit="cardmenu"[^>]*data-field-raw="watch 5 onboarding sessions"[^>]*data-key="test"/);
  assert.ok(!svg.includes('data-edit="field"'), 'the map does not add a second visual field just to preserve editability');
});

test('Zone Atlas presentation is complete or explicitly refuses — never a ranked selection', () => {
  const svg = renderMapPresentation(model, resolved, ro, ctx);
  assert.match(svg, /data-map-layout="zone-atlas-plate"/);
  assert.match(svg, /Readers finish the first book they start/);
  assert.match(svg, /Push reminders feel caring, not naggy/);
  assert.match(svg, /Curated shelves save setup time/);
  assert.match(svg, /Legal sign-off on publisher licensing/);
  assert.ok(!svg.includes('SELECTION ·'), 'export may not quietly suppress lower-ranked source');
  assert.ok(!svg.includes('FURTHER IN FULL SVG'));
});

test('Zone Atlas plate reserves clear header space for a wrapped title and its metrics', () => {
  const title = 'A deliberately long map title that takes two disciplined display lines while retaining a clean boundary before the coordinate field starts below it '.repeat(2).trim();
  const m = parse('title: ' + title + '\nA @ 20,80');
  const r = resolve(m), svg = renderMapPresentation(m, r, readout(m, r), ctx);
  assert.ok(svg, 'a two-line title remains a valid single plate');
  assert.equal((svg.match(/data-title-line=/g) || []).length, 2);
  const metricsY = +(svg.match(/<text x="100" y="([\d.]+)" font-size="14"/) || [])[1];
  const fieldY = +(svg.match(/<rect x="100" y="([\d.]+)" width="1160"/) || [])[1];
  assert.ok(metricsY < fieldY, 'metrics must sit above, never in, the coordinate field');
});

test('Zone Atlas presentation retains active snapshot facts rather than exporting a silent current state', () => {
  const before = parse('preset: assumptions\nA @ 20,80\nGone @ 70,20');
  const after = parse('preset: assumptions\nA @ 40,70\nNew evidence @ 70,20');
  const rr = resolve(after), diff = mapDiffView(mapDiff(before, after), 'Prior review');
  const svg = renderMapPresentation(after, rr, readout(after, rr), ctx, diff);
  assert.match(svg, /SINCE PRIOR REVIEW/);
  assert.match(svg, /NEW/);
  assert.match(svg, /WAS · GONE/);
  assert.match(svg, /MOVED · 1/);
  assert.match(svg, /stroke-dasharray="3 4"/);
});

test('Zone Atlas dark mode stays a quiet field with red reserved for the warning', () => {
  const dark = render(model, resolved, ro, {...ctx, dark:true, colors:{...ctx.colors,
    bg:'#121212', card:'#1a1a19', border:'#2e2e2c', ink:'#f4f4f1', muted:'#a7a7a3', accent:'#7c97ff', err:'#ff6b62'}});
  assert.match(dark, /data-map-layout="zone-atlas"/);
  assert.match(dark, /fill="#ff6b62">TEST FIRST</);
  assert.ok(!dark.includes('fill="#7c97ff"'), 'the inherited accent never becomes decorative map chrome');
});

test('Zone Atlas keeps one shared key figure in its verdict, not a colour system', () => {
  const svg = render(model, resolved, ro, ctx);
  assert.match(svg, /<tspan class="vfig" fill="#d62015">2 of 3<\/tspan>/);
});

test('Zone Atlas treats named-zone labels as placement obstacles', () => {
  const m = parse('zones: grid 2x2\nzone 1,1: One very long deliberate scenario name\nSignal @ 25,25');
  const r = resolve(m), svg = render(m, r, readout(m, r), {...ctx, edit:true});
  const zone = svg.match(/<text x="[\d.]+" y="([\d.]+)" text-anchor="middle"[^>]*>ONE VERY LONG DELIBERATE SCENARIO NAME<\/text>/);
  const signal = svg.match(/<text data-edit="label"[^>]*data-raw="Signal" x="[\d.]+" y="([\d.]+)"[^>]*>Signal<\/text>/);
  assert.ok(zone && signal);
  assert.ok(Math.abs(+zone[1] - +signal[1]) >= 15,
    'the item label must not print on the named-zone baseline');
});
