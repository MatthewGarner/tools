import {test} from 'node:test';
import assert from 'node:assert/strict';
import {parse, genHorizons} from '../parse.js';

test('title, custom horizons, items, lane/status/note parsing', () => {
  const m = parse([
    'title: Trading Roadmap',
    'horizons: Q3, Q4, 2027',
    '// a comment',
    'Q3',
    'Trading: Auto-bidder v2 [doing] -- capture evening spread',
    'Trading: BM optimiser [badtag]',
    'Data: Forecast recal [risk]',
    'No-lane item',
    'Q4',
    'Trading: Degradation-aware dispatch',
    '2027',
    'Data: Weather ensembles [done]',
  ].join('\n'));
  assert.equal(m.title, 'Trading Roadmap');
  assert.deepEqual(m.horizons, ['Q3', 'Q4', '2027']);
  assert.equal(m.items.length, 6);
  const first = m.items[0];
  assert.equal(first.lane, 'Trading');
  assert.equal(first.status, 'doing');
  assert.equal(first.note, 'capture evening spread');
  assert.equal(first.title, 'Auto-bidder v2');
  assert.ok(m.warnings.some(w => w.includes('badtag')), 'unknown tag warned');
  assert.equal(m.lanes[m.lanes.length - 1], '', 'unnamed lane sorts last');
});

test('orphan line before any header warns and skips', () => {
  const m = parse('stray item\nNOW\nreal item');
  assert.equal(m.warnings.length, 1);
  assert.equal(m.items.length, 1);
});

test('items record srcLine', () => {
  const m = parse('title: X\n\nNOW\nA: first\n// c\nB: second');
  assert.equal(m.items[0].srcLine, 3);
  assert.equal(m.items[1].srcLine, 5);
});

test('horizon generators: quarterly with year wrap', () => {
  assert.deepEqual(genHorizons('quarterly from Q3 2026 x4'),
    ['Q3 2026', 'Q4 2026', 'Q1 2027', 'Q2 2027']);
});

test('horizon generators: monthly with year wrap and full names', () => {
  assert.deepEqual(genHorizons('monthly from Nov 2026 x4'),
    ['Nov 2026', 'Dec 2026', 'Jan 2027', 'Feb 2027']);
  assert.deepEqual(genHorizons('monthly from august 2026 x2'), ['Aug 2026', 'Sep 2026']);
});

test('horizon generators: invalid spec returns null', () => {
  assert.equal(genHorizons('quarterly from Quux x4'), null);
  assert.equal(genHorizons('weekly from Aug 2026 x4'), null);
});

test('generator works inside parse, wip/fade configs honoured', () => {
  const m = parse('horizons: quarterly from Q3 2026 x4\nwip: off\nfade: off\nQ3 2026\nA: item one\nQ1 2027\nB: far item');
  assert.equal(m.horizons.length, 4);
  assert.equal(m.wip, 0);
  assert.equal(m.fade, false);
});

test('wip default 6; numeric wip parsed; bad wip warns', () => {
  assert.equal(parse('NOW\nx').wip, 6);
  assert.equal(parse('wip: 9\nNOW\nx').wip, 9);
  const m = parse('wip: many\nNOW\nx');
  assert.equal(m.wip, 6);
  assert.ok(m.warnings.some(w => w.includes('wip')));
});

test('horizons: too few names warns and keeps defaults', () => {
  const m = parse('horizons: OnlyOne\nNOW\nx');
  assert.deepEqual(m.horizons, ['Now', 'Next', 'Later']);
  assert.equal(m.warnings.length, 1);
});

test('link extraction: -> url with note and status combos', () => {
  const m = parse('NOW\nCore: Big item [doing] -- some note -> https://jira.example/PROJ-42\nplain -> https://x.io\nno link here');
  assert.equal(m.items[0].url, 'https://jira.example/PROJ-42');
  assert.equal(m.items[0].note, 'some note');
  assert.equal(m.items[0].status, 'doing');
  assert.equal(m.items[0].title, 'Big item');
  assert.equal(m.items[1].url, 'https://x.io');
  assert.equal(m.items[2].url, null);
});
