import {test} from 'node:test';
import assert from 'node:assert/strict';
import {parse, parseDate} from '../parse.js';
import {render, ticks, timelineReadout, posterVerdict} from '../render.js';
import {mergeBias} from '../mergebias.js';

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

test('edit: lane add zone clears the dates/note line, not just the label line', () => {
  /* short label + long note: the dates/note sub-line renders wider than the
     label line — the zone must anchor past the sub-line, never on top of it */
  const doc = 'Grid: FID 2026-07-10 [done] // pending DNO confirmation of connection date';
  const svg = render(parse(doc), ctx, null, {edit: true});
  const sub = svg.match(/<text data-edit="dates"[^>]*x="([\d.]+)"[^>]*>([^<]+)<\/text>/);
  assert.ok(sub, 'dates/note line not found');
  const datesRight = parseFloat(sub[1]) + ctx.measure(sub[2]);   // same stub the renderer measured with
  const zone = svg.match(/data-lane="Grid"[\s\S]*?<rect x="([\d.]+)"/);
  assert.ok(zone, 'lane add zone hit rect not found');
  assert.ok(parseFloat(zone[1]) >= datesRight,
    'zone must start past the rendered dates/note line: ' + zone[1] + ' vs ' + datesRight);
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

/* ---------- merge-bias readout ---------- */
const MERGE_DOC = `title: Programme — merge risk
Grid: Energisation 2027-02 .. 2027-06
Build: Commissioning 2027-03 .. 2027-08
Consents: DCO 2027-01 .. 2027-05`;

test('merge readout: ≥2 ranged lanes → verdict leads with Merge risk', () => {
  const m = parse(MERGE_DOC);
  assert.match(timelineReadout(m, ctx.today), /^Merge risk: 3 ranged lanes/);
});

test('posterVerdict is the merge sentence only (no operational bits)', () => {
  const v = posterVerdict(parse(MERGE_DOC), ctx.today);
  assert.match(v, /Merge risk/);
  assert.doesNotMatch(v, /Next up|Widest whisker/);
});

test('merge SVG carries TWO readout rows (short merge + operational)', () => {
  const svg = render(parse(MERGE_DOC), ctx);
  assert.match(svg, /Merge risk: all 3 ranged lanes/);   // short in-chart form (c): "ranged", matches the joint
  assert.match(svg, /Next up:/);                          // the operational row still present
  assert.doesNotMatch(svg, /NaN|undefined/);
});

test('short form counts RANGED lanes, not every lane — single-date lanes are not in the joint (c)', () => {
  // 3 ranged + 1 single-date completion: the chart shows 4 lanes, the joint fits 3
  const doc = MERGE_DOC + '\nOps: Handover 2027-09';
  assert.match(render(parse(doc), ctx), /Merge risk: all 3 ranged lanes/);
});

test('stale-lane flag: a fitted lane past its P90 is named in the prose form only (a)', () => {
  // today 2026-07-06: A finished 2026-01..2026-03 (P90 past) and is still open; B is ahead
  const doc = 'title: Stale\nA: Finish 2026-01 .. 2026-03\nB: Launch 2026-11 .. 2027-02';
  assert.match(timelineReadout(parse(doc), ctx.today), /1 lane past its P90 — re-estimate it/);
  assert.doesNotMatch(render(parse(doc), ctx), /past its P90/);   // short stays terse (the whisker shows it)
});

test('<1% rounding: a probability model never prints a bare 0% (b)', () => {
  const doc = 'title: Nine\n' + Array.from({length: 9}, (_, i) => `L${i}: Finish 2027-01 .. 2027-04`).join('\n');
  assert.match(timelineReadout(parse(doc), ctx.today), /together <1%\./);   // full form, plain text
  const svg = render(parse(doc), ctx);
  assert.match(svg, /&lt;1%/);                          // short form, XML-escaped (never a raw <1% mid-attr)
  assert.doesNotMatch(svg, /≈ &lt;1%/);                 // ≈ dropped when the value is already an inequality
  assert.doesNotMatch(svg, /\b0%/);
});

test('non-merge doc: no Merge risk, unchanged single-row readout', () => {
  assert.doesNotMatch(timelineReadout(parse(DOC), ctx.today), /Merge risk/);
  assert.doesNotMatch(render(parse(DOC), ctx), /Merge risk/);
});

test('[fixed] renders clean: no ±?, ink diamond, no whisker', () => {
  const svg = render(parse('Ofgem decision 2026-12-01 [fixed]\nBuild 2026-09 .. 2026-11'), ctx);
  assert.doesNotMatch(svg, /±\?/, 'a fixed date claims no spread');
  /* anchor on the fixed item's OWN diamond. `svg.includes(ctx.colors.ink)` would
     pass on ANY render — every label <text> is already ink — so it pins nothing. */
  assert.match(svg, /data-ms="p50" data-mskey="\|ofgem decision"[^>]*fill="#222222"/);
  assert.doesNotMatch(svg, /data-ms="p50" data-mskey="\|build"[^>]*fill="#222222"/,
    'an ordinary milestone stays on the accent');
  assert.equal((svg.match(/data-ms="whisker"/g) || []).length, 1, 'only the ranged item gets a whisker');
});

test('a BARE single date still gets ±? — the nag survives', () => {
  const svg = render(parse('Vendor selection 2026-11\nBuild 2026-09 .. 2026-11'), ctx);
  assert.match(svg, /±\?/);
});

const MERGE = 'today: 2026-07-06\n' +
  'Grid: Energisation 2027-02 .. 2027-06\nBuild: Commissioning 2027-03 .. 2027-08\n' +
  'Consents: DCO 2027-01 .. 2027-05';
const rd = src => timelineReadout(parse(src), parseDate('2026-07-06'));

test('deadline verdict: names the fixed date and reports the joint against it', () => {
  const t = rd(MERGE + '\nOfgem decision 2027-04-01 [fixed]');
  assert.match(t, /^Fixed date: Ofgem decision, 1 Apr 2027\./);
  assert.match(t, /ranged lanes clear it together/);
  assert.match(t, /past it\./, 'a tight deadline reports d80 past it');
});

test('deadline verdict: a comfortable deadline says INSIDE it', () => {
  const t = rd(MERGE + '\nLong stop 2029-01-01 [fixed]');
  assert.match(t, /inside it\./);
  assert.doesNotMatch(t, /past it/);
});

test('deadline verdict: d80 landing on the deadline reads without contradiction', () => {
  // two-step: learn the plan's own d80, then pin the fixed date to it
  const d80 = mergeBias(parse(MERGE), parseDate('2026-07-06')).d80;
  const iso = new Date(d80 * 86400000).toISOString().slice(0, 10);
  const t = rd(MERGE + '\nGate ' + iso + ' [fixed]');
  assert.match(t, /80% joint confidence lands on the deadline day\./);
  assert.doesNotMatch(t, /0 (days|weeks)/);
});

test('HONESTY: a far-off deadline never prints a bare 100%', () => {
  const t = rd(MERGE + '\nLong stop 2035-01-01 [fixed]');   // ≫ 8.5σ ⇒ normCdf returns exactly 1
  assert.match(t, />99%/);
  assert.doesNotMatch(t, /(?<![\d.>])100%/);
});

test('HONESTY: an impossible deadline never prints a bare 0%', () => {
  const t = rd(MERGE + '\nGate 2026-07-20 [fixed]');
  assert.match(t, /<1%/);
  assert.doesNotMatch(t, /(?<![\d.<])0%/);
  assert.doesNotMatch(t, /≈ <1%/, 'never approximates an inequality');
});

test('near 80%: the verdict says which side of the line it is on', () => {
  // pin the gate one day either side of the plan's own d80. jointAt moves ~0.3
  // points/day here, so both round to 80% — exactly the case where a bare "≈ 80%"
  // next to "80% needs three more weeks" reads as a contradiction.
  const d80 = mergeBias(parse(MERGE), parseDate('2026-07-06')).d80;
  const iso = d => new Date(d * 86400000).toISOString().slice(0, 10);
  assert.match(rd(MERGE + '\nGate ' + iso(d80 - 1) + ' [fixed]'), /clear it together just under 80%/);
  assert.match(rd(MERGE + '\nGate ' + iso(d80 + 1) + ' [fixed]'), /clear it together just over 80%/);
});

test('the in-chart row clips a long fixed label; the full readout keeps it', () => {
  const long = 'Ofgem determination on capacity market rules';   // 43 chars
  const src = MERGE + '\n' + long + ' 2027-04-01 [fixed]';
  const clip = long.slice(0, 30).trimEnd() + '…';
  assert.ok(render(parse(src), ctx).includes('Fixed: ' + clip + ' 1 Apr 2027'),
    'the single non-wrapping <text> row would otherwise clip off the plot');
  assert.ok(rd(src).startsWith('Fixed date: ' + long + ','), 'the prose form keeps the whole label');
});

test('the non-deadline merge sentence is untouched', () => {
  const t = rd(MERGE);
  assert.match(t, /^Merge risk: 3 ranged lanes must all land by /);
  assert.match(t, /even the last is a coin flip/);
});
