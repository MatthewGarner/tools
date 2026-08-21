import {test} from 'node:test';
import assert from 'node:assert/strict';
import {parse, parseDate} from '../parse.js';
import {timelineDiff, timelineDiffView} from '../diff.js';
import {render} from '../render.js';

const ctx = {
  colors: {card:'#ffffff', border:'#c7ced9', ink:'#202124', muted:'#69707a', accent:'#2255cc', bg:'#f4f6fb', err:'#bc3127',
    status:{done:'#187a3e', doing:'#2255cc', risk:'#9a6a00', blocked:'#bc3127'}},
  measure: text => String(text).length * 7,
  today: parseDate('2026-07-06'),
};
const twelve = `title: Reading release
App: Sync engine rewrite 2026-08 .. 2026-10
App: Offline downloads 2026-09 .. 2026-11 [risk]
App: Reading reminders 2026-11 .. 2027-01
Marketing: Launch story 2026-08 [done]
Marketing: Subscriber campaign 2026-10 .. 2026-12
Marketing: Editorial preview 2026-09 .. 2026-10
Compliance: Privacy review 2026-08 .. 2026-09 [fixed]
Compliance: Regional approval 2026-10 .. 2026-12
Platform: Search index 2026-08 .. 2026-10
Platform: Shelf curation 2026-09 .. 2026-11
Platform: Device handoff 2026-11 .. 2027-01
Reader migration 2026-12 .. 2027-02`;

const count = (svg, pattern) => (svg.match(pattern) || []).length;
const p50Ys = svg => [...svg.matchAll(/data-ms="p50"[^>]*(?:cy|y1)="([\d.]+)"/g)].map(m => +m[1]);

test('Field is the one physical grammar for desktop, phone, native SVG and Copy PNG', () => {
  for(const [intent, extra] of [['live-wide', {}], ['live-narrow', {width:390}], ['native', {}], ['presentation', {}]]){
    const svg = render(parse(twelve), {...ctx, intent, ...extra}, null, {intent, edit:intent.startsWith('live')});
    assert.match(svg, /data-direction="field"/);
    assert.match(svg, new RegExp('data-intent="' + intent + '"'));
    assert.equal(count(svg, /data-field-item=/g), 12);
    assert.equal(count(svg, /data-ms="p50"/g), 12);
    assert.doesNotMatch(svg, /data-mode="(?:sparse|panels|decision-cut)"/);
    assert.doesNotMatch(svg, /NaN|Infinity|undefined/);
  }
});

test('Copy PNG keeps the ordinary twelve-milestone plan on one complete 16:9 field', () => {
  const svg = render(parse(twelve), {...ctx, intent:'presentation'}, null, {intent:'presentation'});
  assert.match(svg, /width="1920" height="1080"/);
  assert.match(svg, /12 MILESTONES · COMPLETE SET/);
  assert.equal(count(svg, /data-field-item=/g), 12);
  assert.ok(Math.max(...p50Ys(svg)) < 950, 'a forecast mark must not enter the presentation footer');
});

test('comparison preserves an old P50–P90 field before showing its moved replacement', () => {
  const oldDoc = 'Grid: Energisation 2027-02-15 .. 2027-04-15\nBuild: FID 2026-09 .. 2026-10';
  const newDoc = 'Grid: Energisation 2027-03-15 .. 2027-06-01\nBuild: FID 2026-09 .. 2026-10\nBuild: Commissioning 2027-05 .. 2027-08';
  const diff = timelineDiffView(timelineDiff(parse(oldDoc), parse(newDoc)), 'June pack');
  const svg = render(parse(newDoc), ctx, diff);
  assert.equal(count(svg, /data-ms="ghost"/g), 3, 'the changed item retains its old P50, P90 cap and interval');
  assert.match(svg, /\+4 wks/);
  assert.match(svg, /SINCE JUNE PACK · 1 SLIPPED · 1 NEW/);
  assert.match(svg, />NEW</);
});

test('state is carried by exact marks and words, not ornamental colour', () => {
  const doc = `today: 2026-08-01
Past gate 2026-07-15 [fixed]
Landed 2026-07-20 [done]
Uncertain review 2026-09 .. 2026-10 [risk]`;
  const svg = render(parse(doc), {...ctx, today:parseDate('2026-08-01')});
  assert.match(svg, />OVERDUE</);
  assert.match(svg, /data-ms="p50"[^>]*data-mskey="\|past gate"[^>]*stroke="#bc3127"/);
  assert.match(svg, /data-ms="p50"[^>]*data-mskey="\|landed"[^>]*fill="#187a3e"/);
  assert.match(svg, /fill="#202124">RISK</);
  assert.doesNotMatch(svg, /data-ms="p50"[^>]*data-mskey="\|uncertain review"[^>]*fill="#bc3127"/);
});

test('decision leads remain a factual mark across every output', () => {
  const doc = 'today: 2026-08-01\nLease ends 2027-02-28 [fixed] [lead: 6w]\nFit-out: Construction complete 2026-09 .. 2026-12';
  for(const [intent, extra] of [['live-wide', {}], ['live-narrow', {width:390}], ['native', {}], ['presentation', {}]]){
    const svg = render(parse(doc), {...ctx, intent, ...extra}, null, {intent});
    assert.match(svg, /data-lrm/);
    assert.match(svg, /Decision clock/);
  }
});

test('editing keeps the field quiet at rest while exposing complete, 44px routes', () => {
  const doc = 'App: Beta 2026-08 .. 2026-09\nMarketing: Story 2026-09 .. 2026-10\nLaunch 2026-11 [fixed]';
  const svg = render(parse(doc), ctx, null, {intent:'live-wide', edit:true});
  assert.equal(count(svg, /data-edit="cardmenu"/g), 3);
  for(const kind of ['label', 'dates', 'setlane', 'note'])
    assert.equal(count(svg, new RegExp('data-edit="' + kind + '"', 'g')), 3, kind + ' route missing');
  assert.equal(count(svg, /data-edit="status"[^>]*role="button"/g), 3, 'three keyboard status routes missing');
  for(const lane of ['App', 'Marketing'])
    assert.match(svg, new RegExp('data-edit="additem"[^>]*data-lane="' + lane + '"[\\s\\S]{0,300}?height="44"'));
  assert.equal(count(svg, /data-empty-control=""/g), 3);
  assert.equal(count(svg, /<rect data-edit="status"[^>]*data-hit=""[^>]*aria-hidden="true"[^>]*width="44" height="44"/g), 3,
    'each timing mark owns a real 44px coarse-pointer target');
  assert.equal(count(svg, /data-hit=""/g), 9, 'three rows, three timing marks, two named lanes, and one global add target');
});

test('phone Field gives a long title measured breathing room before its isolated track', () => {
  const doc = 'App: A long operational milestone whose detailed name must wrap cleanly on a phone 2026-08 .. 2026-10';
  const svg = render(parse(doc), {...ctx, width:360}, null, {intent:'live-narrow', edit:true});
  assert.match(svg, /data-narrow=""/);
  const hit = /data-edit="cardmenu"[\s\S]*?data-hit=""[^>]*height="([\d.]+)"/.exec(svg);
  assert.ok(hit && +hit[1] >= 112, 'every wrapped authored line receives real card height');
  assert.equal(count(svg, /data-ms="p50"/g), 1);
  assert.equal(count(svg, /data-ms="p90"/g), 1);
});

test('phone card menus retain the real remove route, not only the visible action label', () => {
  const svg = render(parse('App: Beta 2026-08 .. 2026-09'), {...ctx, width:360}, null,
    {intent:'live-narrow', edit:true});
  assert.match(svg, /data-edit="removeitem"[^>]*data-line="0"[^>]*pointer-events="none"/,
    'the danger action must resolve to the model-owned remove target on a phone');
});
