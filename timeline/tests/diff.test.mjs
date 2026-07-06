import {test} from 'node:test';
import assert from 'node:assert/strict';
import {parse, parseDate} from '../parse.js';
import {timelineDiff, timelineDiffView} from '../diff.js';
import {render} from '../render.js';

const OLD = `Grid: Offer 2026-08 .. 2026-10
Grid: Energisation 2027-02 .. 2027-04
Build: FID 2026-09 .. 2026-10
Build: Old thing 2026-12 .. 2027-01`;
const NEW = `Grid: Offer 2026-08 .. 2026-10
Grid: Energisation 2027-03-15 .. 2027-06-01
Build: FID 2026-09 .. 2026-12
Build: Commissioning 2027-05 .. 2027-08`;

const view = () => timelineDiffView(timelineDiff(parse(OLD), parse(NEW)), 'June pack');

test('slips: p50 moves in weeks, widened ranges counted separately', () => {
  const v = view();
  assert.equal(v.slips.length, 1);
  assert.equal(v.slips[0].label, 'Energisation');
  assert.ok(v.slips[0].days > 25 && v.slips[0].days < 35);   // 15 Feb → 15 Mar
  assert.match(v.sinceLine, /^Since June pack: 1 slipped \(worst Energisation \+4 wks\) · 1 range widened · 1 new · 1 dropped\.$/);
  assert.ok(v.newKeys.size === 1 && v.dropped.length === 1);
});

test('nothing moved says so', () => {
  const v = timelineDiffView(timelineDiff(parse(OLD), parse(OLD)), 'x');
  assert.match(v.sinceLine, /nothing moved/);
  assert.equal(v.any, false);
});

test('render with diff: ghost diamond, slip label, NEW, dropped strip, since line', () => {
  const ctx = {
    colors: {card: '#ffffff', border: '#dddddd', ink: '#222222', muted: '#66777a',
      accent: '#0088cc', bg: '#f7f8f6', err: '#b3403a',
      status: {done: '#1D7A3E', doing: '#0C7FAE', risk: '#9A6A00', blocked: '#B3403A'}},
    measure: t => t.length * 7,
    today: parseDate('2026-07-06'),
  };
  const svg = render(parse(NEW), ctx, view());
  assert.match(svg, /data-ms="ghost"/);
  assert.match(svg, /\+4 wks/);
  assert.match(svg, />NEW</);
  assert.match(svg, /DROPPED SINCE JUNE PACK/);
  assert.match(svg, /Since June pack/);
  assert.doesNotMatch(svg, /NaN|undefined/);
  const plain = render(parse(NEW), ctx);
  assert.doesNotMatch(plain, /ghost|NEW|DROPPED/);
});
