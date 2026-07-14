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

test('several pre-header lines collapse into one warning', () => {
  const m = parse('one\ntwo\nthree\nNOW\nItem');
  const pre = m.warnings.filter(w => w.includes('before any horizon header'));
  assert.equal(pre.length, 1);
  assert.ok(pre[0].includes('lines 1–3'));
  assert.ok(pre[0].includes('skipped'));
});

test('a single pre-header line keeps the per-line message without a fake ellipsis', () => {
  const m = parse('stray\nNOW\nItem');
  const pre = m.warnings.filter(w => w.includes('before any horizon header'));
  assert.equal(pre.length, 1);
  assert.ok(pre[0].includes('"stray"'));
  assert.ok(!pre[0].includes('…'));
});

test('config key missing its colon gets a did-you-mean', () => {
  const m = parse('title Habitat\nNOW\nItem');
  assert.ok(m.warnings.some(w => w.includes('did you mean "title:"')));
  assert.ok(!m.warnings.some(w => w.includes('before any horizon header')));
});

test('near-miss horizon header gets a did-you-mean', () => {
  const m = parse('NOWW\nItem under it');
  assert.ok(m.warnings.some(w => w.includes('did you mean "Now"')));
});

test('colon-suffixed near-miss header mid-document gets a did-you-mean', () => {
  const m = parse('NOW\nItem one\nNEXTT:\nItem two');
  assert.ok(m.warnings.some(w => w.includes('did you mean "Next"')));
  assert.ok(!m.items.some(i => i.title.includes('NEXTT')));
});

test('a bare item title one letter from a horizon is NOT flagged mid-document', () => {
  const m = parse('NOW\nNew');
  assert.ok(!m.warnings.some(w => w.includes('did you mean')));
  assert.equal(m.items[0].title, 'New');
});

/* ---- deck export styles: the `style:` key + the time-axis flag ---- */

test('style: selects a deck composition, defaults to null (app picks)', () => {
  assert.equal(parse('title: T\nNOW\nCore: A').style, null, 'absent → the app decides');
  assert.equal(parse('style: register\nNOW\nCore: A').style, 'register');
  assert.equal(parse('STYLE:  Focus \nNOW\nCore: A').style, 'focus', 'case/space tolerant, like palette:');
});

test('style: an unknown value soft-warns and falls back (never a hard error)', () => {
  const m = parse('style: banana\nNOW\nCore: A');
  assert.equal(m.style, null, 'falls back rather than passing junk to the renderer');
  assert.match(m.warnings[0], /line 1/);
  assert.match(m.warnings[0], /board|focus|register|grid/, 'the warning lists the options');
  assert.equal(m.items.length, 1, 'the rest of the doc still parses');
});

test('style: a missing colon is caught by the near-miss list, not silently made an item', () => {
  const m = parse('style focus\nNOW\nCore: A');
  assert.match(m.warnings[0], /missing colon/);
  assert.equal(m.items.length, 1, 'the "style focus" line is skipped, not filed as an item');
});

test('timeAxis: true only when the horizons are TIME-generated (quarterly or monthly)', () => {
  assert.equal(parse('horizons: quarterly from Q3 2026 x4\nQ3 2026\nCore: A').timeAxis, true);
  assert.equal(parse('horizons: monthly from Jul 2026 x3\nJUL 2026\nCore: A').timeAxis, true,
    'months count as a time axis, exactly like quarters');
  assert.equal(parse('horizons: Now, Next, Later\nNOW\nCore: A').timeAxis, false);
  assert.equal(parse('NOW\nCore: A').timeAxis, false, 'the default horizons are not a time axis');
});

test('timeAxis: recomputed per horizons line — a later manual list must clear it (last wins)', () => {
  const m = parse('horizons: monthly from Jul 2026 x3\nhorizons: Now, Next, Later\nNOW\nCore: A');
  assert.deepEqual(m.horizons, ['Now', 'Next', 'Later'], 'last horizons line wins');
  assert.equal(m.timeAxis, false, 'a sticky flag would lie about the axis actually in use');
});
