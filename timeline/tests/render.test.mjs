import {test} from 'node:test';
import assert from 'node:assert/strict';
import {parse, parseDate} from '../parse.js';
import {render, ticks} from '../render.js';

const ctx = {
  colors: {card: '#ffffff', border: '#dddddd', ink: '#222222', muted: '#66777a',
    accent: '#0088cc', bg: '#f7f8f6', err: '#b3403a',
    status: {done: '#1D7A3E', doing: '#0C7FAE', risk: '#9A6A00', blocked: '#B3403A'}},
  measure: t => t.length * 7,
  today: parseDate('2026-07-06'),
};
const DOC = `title: Storage site — programme
Grid: Connection offer 2026-08 .. 2026-10
Grid: Energisation 2027-02-15 .. 2027-06-01 [risk] // DNO dependent
Build: FID 2026-06-30 [done]
Build: Vendor selection 2026-11`;

test('ticks: monthly under two years, quarterly beyond', () => {
  const m = ticks(parseDate('2026-07-01'), parseDate('2027-03-01'));
  assert.ok(m.length >= 8 && m.length <= 10);
  assert.match(m[0].label, /^[A-Z][a-z]{2} \d{4}$/);
  const q = ticks(parseDate('2026-01-01'), parseDate('2029-06-01'));
  assert.ok(q.every(t => /^Q[1-4] \d{4}$/.test(t.label)));
});

test('every milestone renders: solid P50 diamond, whisker + open P90 diamond for ranges', () => {
  const svg = render(parse(DOC), ctx);
  assert.equal((svg.match(/data-ms="p50"/g) || []).length, 4);
  assert.equal((svg.match(/data-ms="p90"/g) || []).length, 2);   // done + single have no whisker
  assert.match(svg, /data-ms="whisker"/);
  assert.doesNotMatch(svg, /NaN|Infinity|undefined/);
});

test('status colours: done uses st-done, risk uses err; single date gets ±?', () => {
  const svg = render(parse(DOC), ctx);
  assert.match(svg, /data-ms="p50"[^>]*fill="#1D7A3E"/);
  assert.match(svg, /data-ms="p50"[^>]*fill="#b3403a"/);
  assert.match(svg, /±\?/);
});

test('today line present and labelled; lanes render as bands', () => {
  const svg = render(parse(DOC), ctx);
  assert.match(svg, /data-today/);
  assert.match(svg, />TODAY</); // stronger today marker: a filled flag pill
  assert.match(svg, />GRID</);
  assert.match(svg, />BUILD</);
});

test('readout: next milestone up + widest whisker named in weeks', () => {
  const svg = render(parse(DOC), ctx);
  assert.match(svg, /Next up: Connection offer — P50 Aug 2026, could slip to Oct 2026/);
  assert.match(svg, /Widest whisker: Energisation — 15 weeks/);
});

test('readout: a same-month range switches to day grain instead of repeating the month', () => {
  const svg = render(parse('X 2026-08-14 .. 2026-08-28'), ctx);
  assert.match(svg, /Next up: X — P50 14 Aug 2026, could slip to 28 Aug 2026/);
});

test('edit hooks: label, dates, status, add and remove affordances', () => {
  const svg = render(parse(DOC), ctx, null, {edit: true});
  assert.match(svg, /data-edit="label" data-line="1" data-raw="Connection offer"/);
  assert.match(svg, /data-edit="dates" data-line="1" data-raw="2026-08 \.\. 2026-10"/);
  assert.match(svg, /data-edit="status" data-line="1"/);
  assert.match(svg, /data-edit="additem"/);
  assert.match(svg, /data-edit="removeitem" data-line="4"/);
  const plain = render(parse(DOC), ctx);
  assert.doesNotMatch(plain, /data-edit/);
});

test('edit: one ghost add zone per NAMED lane, none for the unnamed lane, none without edit', () => {
  const svg = render(parse(DOC), ctx, null, {edit: true});
  const zones = [...svg.matchAll(/data-edit="additem" data-lane="([^"]*)"/g)].map(m => m[1]);
  assert.deepEqual(zones.sort(), ['Build', 'Grid']);
  const plain = render(parse(DOC), ctx);
  assert.doesNotMatch(plain, /data-lane/);
});

test('edit: each lane add zone carries an explicit invisible hit rect ≥44px tall', () => {
  const svg = render(parse(DOC), ctx, null, {edit: true});
  for(const lane of ['Grid', 'Build']){
    const i = svg.indexOf('data-lane="' + lane + '"');
    assert.ok(i >= 0, lane + ' zone missing');
    const nearby = svg.slice(i, i + 400);
    assert.match(nearby, /<rect[^>]*height="44"[^>]*fill-opacity="0"/);
  }
});

test('edit: lane add zone esc\'s a hostile lane name and skips the unnamed lane', () => {
  const doc = 'X 2026-08 .. 2026-09\n"><script>: Y 2026-08 .. 2026-09';
  const svg = render(parse(doc), ctx, null, {edit: true});
  const zones = [...svg.matchAll(/data-edit="additem" data-lane="([^"]*)"/g)].map(m => m[1]);
  assert.deepEqual(zones, ['&quot;&gt;&lt;script&gt;']);
  assert.doesNotMatch(svg, /<script>/);
});

test('edit: per-lane add zone clamps to the plot right edge when content runs long', () => {
  const longLabel = 'A'.repeat(300);
  const doc = 'Grid: ' + longLabel + ' 2026-08 .. 2026-08';
  const svg = render(parse(doc), ctx, null, {edit: true});
  const band = svg.match(/<rect x="([\d.]+)" y="[\d.]+" width="([\d.]+)"[^>]*rx="8"/);
  assert.ok(band, 'lane band rect not found');
  const rightEdge = parseFloat(band[1]) + parseFloat(band[2]);
  const zone = svg.match(/data-lane="Grid"[\s\S]*?<rect x="([\d.]+)"[^>]*width="([\d.]+)"[^>]*height="44"/);
  assert.ok(zone, 'lane add zone hit rect not found');
  const zoneRight = parseFloat(zone[1]) + parseFloat(zone[2]);
  assert.ok(zoneRight <= rightEdge + 0.5,
    'zone must not overflow the plot right edge: ' + zoneRight + ' vs ' + rightEdge);
});

test('markdown: table, no-range flag, slip list when comparing', async () => {
  const {toMarkdown} = await import('../render.js');
  const md = toMarkdown(parse(DOC), null, 'https://x.test/t');
  assert.match(md, /\| Vendor selection \| Build \| 15 Nov 2026 \| no range \|/);
  assert.match(md, /x\.test/);
});

test('deterministic given a fixed today; slide variant scales', () => {
  const a = render(parse(DOC), ctx);
  assert.equal(a, render(parse(DOC), ctx));
  const slide = render(parse(DOC), {...ctx, slide: true});
  assert.notEqual(a, slide);
  assert.doesNotMatch(slide, /NaN/);
});

test('empty model renders a placeholder-free minimal svg without crashing', () => {
  const svg = render(parse('title: X'), ctx);
  assert.match(svg, /<svg/);
  assert.doesNotMatch(svg, /NaN/);
});
