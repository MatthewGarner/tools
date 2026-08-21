/*
  Field contract — written from timeline/CONTEXT.md before the renderer is
  changed. These assertions deliberately name user-visible meaning (a forecast,
  an authored note, an exhaustive export) rather than SVG element types or a
  layout implementation. `data-field-*` is the renderer's semantic interface:
  it makes the same vocabulary addressable to motion, accessibility and tests.
*/
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {parse, parseDate} from '../parse.js';
import {timelineDiff, timelineDiffView} from '../diff.js';
import {render, toMarkdown} from '../render.js';

const ctx = {
  colors: {card:'#fff', border:'#d7d7d2', ink:'#202124', muted:'#69707a', accent:'#2255cc', bg:'#f7f7f5', err:'#bc3127',
    status:{done:'#187a3e', doing:'#2255cc', risk:'#9a6a00', blocked:'#bc3127'}},
  measure: text => String(text).length * 7,
  today: parseDate('2026-07-06'),
};
const complete = `title: Reading release
palette: ember
verdict: Keep the public launch inside the review window.
App: Sync engine rewrite 2026-08 .. 2026-10 // migrate the offline queue before beta
App: Offline downloads 2026-09 .. 2026-11 [risk]
Marketing: Launch story 2026-08 [done]
Compliance: Privacy review 2026-08 .. 2026-09 [fixed] [lead: 3w]
Reader migration 2026-12 .. 2027-02`;
const intents = [
  ['live-wide', {}], ['live-narrow', {width:390}], ['native', {}], ['presentation', {}],
];
const renderIntent = (doc, intent, extra = {}, diff = null, edit = false) =>
  render(parse(doc), {...ctx, intent, ...extra}, diff, {intent, edit});
const count = (svg, re) => (svg.match(re) || []).length;

test('every projection identifies itself as the same Field and exposes each authored timing fact', () => {
  for(const [intent, extra] of intents){
    const svg = renderIntent(complete, intent, extra, null, intent.startsWith('live'));
    assert.match(svg, /data-field="timeline"/);
    assert.match(svg, /data-field-palette="ember"/);
    assert.equal(count(svg, /data-field-item=/g), 5, intent + ' keeps every milestone');
    assert.equal(count(svg, /data-field-timing="forecast"/g), 3, intent + ' preserves forecasts');
    assert.equal(count(svg, /data-field-timing="fixed"/g), 1, intent + ' preserves fixed facts');
    assert.equal(count(svg, /data-field-state="done"/g), 1, intent + ' preserves completion');
    assert.doesNotMatch(svg, /NaN|Infinity|undefined/);
  }
});

test('palette, note and verdict are visible authored facts in all artefacts, including Markdown', () => {
  for(const [intent, extra] of intents){
    const svg = renderIntent(complete, intent, extra);
    assert.match(svg, /migrate the offline queue before beta/, intent + ' shows the authored note');
    assert.match(svg, /data-field-note=/, intent + ' marks the note as a factual secondary line');
    assert.match(svg, /Keep the public launch inside the review window\./, intent + ' shows the authored verdict');
  }
  const off = parse(complete.replace('verdict: Keep the public launch inside the review window.', 'verdict: off'));
  assert.doesNotMatch(render(off, ctx), />VERDICT</, 'verdict: off removes only the receipt');
  assert.match(toMarkdown(parse(complete), null, 'https://example.test/timeline', ctx.today), /migrate the offline queue before beta/);
});

test('comparison keeps duplicate occurrences distinct and treats a lane move as an honest drop plus new item', () => {
  const oldDoc = `Build: Approval 2026-08 .. 2026-09
Build: Approval 2026-10 .. 2026-11
Grid: Move me 2026-12 .. 2027-01`;
  const shifted = `Build: Approval 2026-08-08 .. 2026-09
Build: Approval 2026-10 .. 2026-12
Ops: Move me 2026-12 .. 2027-01`;
  const diff = timelineDiff(parse(oldDoc), parse(shifted));
  assert.equal(diff.moved.size, 2, 'both duplicate occurrences retain their own history');
  assert.equal(diff.added.length, 1, 'a lane move is new work in its new portfolio lane');
  assert.equal(diff.dropped.length, 1, 'a lane move remains visible as leaving its former lane');
});

test('comparison distinguishes changed P50, changed P90 and a former fixed fact without relying on colour', () => {
  const oldDoc = `Forecast P50 shift 2026-09 .. 2026-11
Forecast P90 shift 2026-09 .. 2026-11
External gate 2026-10-01 [fixed]`;
  const newDoc = `Forecast P50 shift 2026-10 .. 2026-11
Forecast P90 shift 2026-09 .. 2026-12
External gate 2026-10 .. 2026-12`;
  const diff = timelineDiffView(timelineDiff(parse(oldDoc), parse(newDoc)), 'August review');
  const svg = renderIntent(newDoc, 'live-wide', {}, diff);
  assert.match(svg, /data-field-history="p50"/, 'old P50 remains intelligible');
  assert.match(svg, /data-field-history="p90"/, 'old P90 remains intelligible');
  assert.match(svg, /data-field-history="fixed"/, 'a former fixed fact is not rewritten as a forecast');
  assert.match(svg, /data-field-history-inert=""/, 'historic geometry is never an edit target');
});

test('the field carries date facts separately from geometry across short, multi-year and state edge cases', () => {
  const doc = `today: 2026-08-01
Near today 2026-08-01 .. 2026-08-02
Far horizon 2029-11 .. 2030-04
Done point 2026-07-20 [done]
Overdue external fact 2026-07-15 [fixed]
Risk forecast 2026-09 .. 2026-11 [risk]`;
  for(const [intent, extra] of intents){
    const svg = renderIntent(doc, intent, extra);
    assert.equal(count(svg, /data-field-p50-day=/g), 5, intent + ' carries all P50 date facts');
    assert.equal(count(svg, /data-field-p90-day=/g), 5, intent + ' carries all P90 date facts');
    assert.match(svg, /data-field-state="overdue"/, intent + ' names factual lateness');
    assert.match(svg, /data-field-state="risk"/, intent + ' names forecast risk');
    assert.match(svg, /data-field-state="done"/, intent + ' names completion');
    assert.doesNotMatch(svg, /data-field-state="risk"[^>]*#bc3127/, 'risk is not painted as an overdue fact');
  }
});

test('Copy PNG is either one complete 16:9 Field or an explicit safe refusal — never a partial selection', () => {
  const ordinary = renderIntent(complete, 'presentation');
  assert.match(ordinary, /data-copy-field="complete"/);
  assert.match(ordinary, /5 MILESTONES · COMPLETE SET/);
  const dense = 'title: Dense\n' + Array.from({length:40}, (_, i) =>
    `Lane ${i % 4}: A deliberately descriptive forecast ${i} 202${6 + Math.floor(i / 12)}-0${i % 8 + 1} .. 202${6 + Math.floor(i / 12)}-1${i % 2 + 1} // a note that must remain present in export`).join('\n');
  const refused = renderIntent(dense, 'presentation');
  assert.match(refused, /data-copy-field="unavailable"/);
  assert.match(refused, /COPY PNG UNAVAILABLE.*DOWNLOAD SVG/);
  assert.equal(count(refused, /data-field-item=/g), 0, 'a refusal cannot masquerade as a partial Field');
});

test('live Field controls are keyboard routes, with a complete add route and no interaction on history', () => {
  const oldDoc = 'App: Beta 2026-08 .. 2026-09';
  const newDoc = 'App: Beta 2026-09 .. 2026-10';
  const diff = timelineDiffView(timelineDiff(parse(oldDoc), parse(newDoc)), 'baseline');
  const svg = renderIntent(newDoc, 'live-wide', {}, diff, true);
  assert.equal(count(svg, /data-edit="cardmenu"[^>]*role="button"/g), 1);
  assert.match(svg, /data-edit="additem"[^>]*data-lane="App"/);
  assert.match(svg, /data-edit="additem"[^>]*data-lane=""/);
  assert.doesNotMatch(svg, /data-field-history[^>]*data-edit=/);
});
