import {test} from 'node:test';
import assert from 'node:assert/strict';
import {runDay, DAY_DEFAULTS} from '../day.js';
import {renderDay, buildDayVerdict} from '../render-day.js';
import {MERIT_PALETTE} from '../../merit-order/render.js';

const ctx = {width: 900, height: 420,
  colors: {ink: '#1b2733', muted: '#66727e', accent: '#C05621', grid: '#e3e7ea', card: '#ffffff'},
  palette: MERIT_PALETTE.light};

test('renderDay: fleet on ⇒ ghost raw polyline + solid flat polyline + storage bars', () => {
  const r = runDay({...DAY_DEFAULTS, fleetGW: 6});
  const svg = renderDay(r, {...DAY_DEFAULTS, fleetGW: 6}, ctx);
  assert.match(svg, /^<svg /);
  assert.match(svg, /data-raw-shape=''/);
  assert.match(svg, /data-flat-shape=''/);
  assert.match(svg, /stroke-dasharray/, 'raw ghost is dashed');
  assert.match(svg, /data-charge=''/);
  assert.match(svg, /data-discharge=''/);
});

test('renderDay: zero fleet ⇒ one shape only, no bars', () => {
  const r = runDay({...DAY_DEFAULTS, fleetGW: 0});
  const svg = renderDay(r, DAY_DEFAULTS, ctx);
  assert.doesNotMatch(svg, /data-raw-shape/, 'no ghost when nothing flattened it');
  assert.doesNotMatch(svg, /data-charge/);
});

test('renderDay: cursor draws the scrub line at the given hour', () => {
  const r = runDay(DAY_DEFAULTS);
  assert.match(renderDay(r, DAY_DEFAULTS, ctx, {cursor: 18}), /data-cursor='18'/);
  assert.doesNotMatch(renderDay(r, DAY_DEFAULTS, ctx), /data-cursor/);
});

test('buildDayVerdict: names the price-setting fuel at peak and trough (changeover readout)', () => {
  const p = {...DAY_DEFAULTS, fleetGW: 0};
  const v = buildDayVerdict(runDay(p), p);
  assert.match(v, /gas sets the £\d+ peak/, 'gas (the CCGT bands) named as the peak price-setter');
  assert.match(v, /Waste\/CHP the £\d+ floor/, 'the overnight-trough setter is named too');
  assert.match(v, /from \d\d:00/, 'plateau timing retained');
  assert.doesNotMatch(v, /CCGT \d\d%/, 'gas bands collapse to "gas" in the readout, not "CCGT 54%"');
});

test('buildDayVerdict: quotes the spread, and the flattening when a fleet works', () => {
  const p0 = {...DAY_DEFAULTS, fleetGW: 0};
  const v0 = buildDayVerdict(runDay(p0), p0);
  assert.match(v0, /spread/i);
  assert.match(v0, /£\d+/);
  const p6 = {...DAY_DEFAULTS, fleetGW: 6};
  const r6 = runDay(p6);
  const v6 = buildDayVerdict(r6, p6);
  assert.match(v6, /£\d+ → £\d+/, 'raw → flattened spread');
  assert.match(v6, /per MW/, 'the fleet’s own margin is quoted');
  assert.ok(r6.droppedGWh > 0, 'fixture: 6 GW drops trades at GB defaults');
  assert.match(v6, /walking away from [\d.]+ GWh/, 'abandoned trades are quoted');
});

test('renderDay: dropped trades ghost as dashed bars when the back-off bites', () => {
  const p = {...DAY_DEFAULTS, fleetGW: 6};
  const svg = renderDay(runDay(p), p, ctx);
  assert.match(svg, /data-dropped=''/);
});

/* ---- review fixes: wrapped export verdict, narrow mode, clamps, contract ---- */

// same char-width heuristic the renderer falls back to — passing it in ctx makes
// the bounds assertions self-consistent with the renderer's own wrap/clamp maths
const meas = (t, font) => parseFloat(font) * 0.55 * t.length;
const ctxAt = w => ({width: w, height: 420, colors: ctx.colors, palette: ctx.palette, measure: meas});

test('renderDay: root carries the tool marker', () => {
  const svg = renderDay(runDay(DAY_DEFAULTS), DAY_DEFAULTS, ctx);
  assert.match(svg, /^<svg [^>]*data-tool='intraday'/);
});

test('renderDay: identical inputs give identical strings (app.js memoises on it)', () => {
  const p = {...DAY_DEFAULTS, fleetGW: 6};
  const r = runDay(p);
  assert.equal(renderDay(r, p, ctxAt(900), {cursor: 9}), renderDay(r, p, ctxAt(900), {cursor: 9}));
  assert.equal(renderDay(r, p, ctx, {forExport: true}), renderDay(r, p, ctx, {forExport: true}));
});

test('renderDay: forExport wraps the verdict into its own band and grows the canvas', () => {
  const p = {...DAY_DEFAULTS, fleetGW: 6};
  const r = runDay(p);
  const svg = renderDay(r, p, ctxAt(900), {forExport: true});
  const g = svg.match(/<g data-verdict=''>(.*?)<\/g>/);
  assert.ok(g, 'verdict rides in its own marked group');
  const lines = [...g[1].matchAll(/<text[^>]*>([^<]*)<\/text>/g)].map(m => m[1]);
  assert.ok(lines.length >= 2, `verdict wraps to multiple lines (got ${lines.length})`);
  assert.equal(lines.join(' '), buildDayVerdict(r, p), 'wrapped lines rejoin to the exact verdict');
  const h = svg.match(/^<svg width="900" height="(\d+)"/);
  assert.ok(h, 'root height stays a double-quoted integer');
  assert.ok(+h[1] > 420, 'canvas grows to hold the verdict band');
  assert.match(svg, new RegExp(`viewBox='0 0 900 ${h[1]}'`), 'viewBox tracks the grown height');
  // verdict band sits BELOW the strip caption, not on top of it
  const capY = +svg.match(/<text x="116" y="([\d.]+)"[^>]*>discharge/)[1];
  const firstVy = +g[1].match(/<text x="[\d.]+" y="([\d.]+)"/)[1];
  assert.ok(firstVy > capY + 10, `verdict (y=${firstVy}) clears the caption baseline (y=${capY})`);
});

function assertInBounds(svg, who){
  const vb = svg.match(/viewBox='0 0 (\d+) (\d+)'/);
  const W = +vb[1], H = +vb[2];
  const inX = (v, tag) => assert.ok(v >= -1 && v <= W + 1, `${who}: x ${v} outside [0,${W}] in ${tag.slice(0, 100)}`);
  const inY = (v, tag) => assert.ok(v >= -1 && v <= H + 1, `${who}: y ${v} outside [0,${H}] in ${tag.slice(0, 100)}`);
  const attrsOf = tag => Object.fromEntries([...tag.matchAll(/([\w-]+)=(?:"([^"]*)"|'([^']*)')/g)].map(m => [m[1], m[2] ?? m[3]]));
  for(const tag of svg.match(/<[^!/][^>]*>/g)){
    const a = attrsOf(tag);
    if(tag.startsWith('<line')){ inX(+a.x1, tag); inX(+a.x2, tag); inY(+a.y1, tag); inY(+a.y2, tag); }
    else if(tag.startsWith('<rect')){ inX(+a.x, tag); inX(+a.x + +a.width, tag); inY(+a.y, tag); inY(+a.y + +a.height, tag); }
    else if(tag.startsWith('<polyline'))
      for(const pt of a.points.trim().split(/\s+/)){ const [px, py] = pt.split(','); inX(+px, tag); inY(+py, tag); }
  }
  for(const m of svg.matchAll(/(<text[^>]*)>([^<]*)<\/text>/g)){
    const a = attrsOf(m[1] + '>');
    const w = meas(m[2], a['font-size'] + 'px x');
    const x0 = a['text-anchor'] === 'end' ? +a.x - w : a['text-anchor'] === 'middle' ? +a.x - w / 2 : +a.x;
    inX(x0, m[0]); inX(x0 + w, m[0]); inY(+a.y, m[0]);
  }
}

test('renderDay: every coordinate and text line stays inside the viewBox at 900 and 360', () => {
  for(const width of [900, 360]) for(const fleetGW of [0, 6]) for(const opts of [{}, {cursor: 23}, {forExport: true}]){
    const p = {...DAY_DEFAULTS, fleetGW};
    assertInBounds(renderDay(runDay(p), p, ctxAt(width), opts), `w=${width} fleet=${fleetGW} ${JSON.stringify(opts)}`);
  }
});

test('renderDay: right-edge changeover label flips to end anchor (h23 Imports, full width too)', () => {
  const svg = renderDay(runDay(DAY_DEFAULTS), DAY_DEFAULTS, ctxAt(900));
  assert.match(svg, /<text[^>]*text-anchor="end"[^>]*fill="#C05621">Imports<\/text>/,
    'the hour-23 Imports label anchors end so it cannot overflow the canvas');
});

test('renderDay: narrow mode drops crowded changeover labels but keeps every tick line', () => {
  const p = {...DAY_DEFAULTS, fleetGW: 6};
  const r = runDay(p);
  const tickCount = svg => [...svg.matchAll(/<line[^>]*stroke='#C05621'[^>]*\/>/g)].length;
  const labelCount = svg => [...svg.matchAll(/<text[^>]*fill="#C05621"[^>]*>[^<]*<\/text>/g)].length;
  const wide = renderDay(r, p, ctxAt(900));
  const narrow = renderDay(r, p, ctxAt(360));
  assert.equal(tickCount(wide), r.flat.changeovers.length, 'wide: one tick per changeover');
  assert.equal(labelCount(wide), r.flat.changeovers.length, 'wide: full width keeps every label (staggers, never drops)');
  assert.equal(tickCount(narrow), r.flat.changeovers.length, 'narrow: ticks are never dropped');
  assert.ok(labelCount(narrow) < r.flat.changeovers.length, 'narrow: crowded labels are dropped');
});

/* Regression: at stock GB defaults + a 6 GW fleet, the hour-7/hour-8 changeover
   pair ("Imports" → "CCGT 60%") sit close enough that their measured extents
   collide on one row at full width — production screenshot confirmed the two
   phrases running together as "Imports CCGT 60%" (2026-07-10, intraday-desktop-
   1440-light-fleet6.png). Unlike the narrow branch, full width has room to keep
   both: the second label of a colliding pair drops to a second row (+12px)
   instead of being dropped outright. */
test('renderDay: full width staggers a colliding changeover pair onto two rows instead of dropping', () => {
  const p = {...DAY_DEFAULTS, fleetGW: 6};
  const r = runDay(p);
  const collidingPair = r.flat.changeovers.findIndex((c, i) =>
    i > 0 && c.to !== r.flat.changeovers[i - 1].to && (() => {
      const prev = r.flat.changeovers[i - 1];
      const wPrev = meas(prev.to, '10px x'), wCur = meas(c.to, '10px x');
      const xAt = h => 116 + (h / 23) * (900 - 116 - 32);   // PLOT_L 116 (wide) / M.r 32 — shares renderStack's edges
      return xAt(c.h) + 3 - (xAt(prev.h) + 3 + wPrev) < 6;   // measured gap under the 6px clearance
    })());
  assert.ok(collidingPair > 0, 'fixture: stock defaults + 6 GW fleet produce a colliding pair at width 900');

  const svg = renderDay(r, p, ctxAt(900));
  const ys = [...svg.matchAll(/<text x="[\d.]+" y="([\d.]+)"[^>]*fill="#C05621">([^<]*)<\/text>/g)]
    .map(m => ({y: +m[1], text: m[2]}));
  const prevY = ys.find(t => t.text === r.flat.changeovers[collidingPair - 1].to)?.y;
  const curY = ys.find(t => t.text === r.flat.changeovers[collidingPair].to)?.y;
  assert.ok(prevY != null && curY != null, 'both colliding labels are present (never dropped at full width)');
  assert.notEqual(curY, prevY, `colliding pair lands on two distinct rows (prev y=${prevY}, cur y=${curY})`);
  assert.equal(curY, prevY + 12, 'the later label of a colliding pair drops exactly one row (+12px)');
});

/* Bounds-scan, non-narrow: extends the narrow same-row overlap check (below)
   to full width — two labels sharing the SAME row (identical y) must never
   overlap; labels on different rows are allowed to overlap in x since the
   12px row offset keeps them visually separate. */
test('renderDay: full width never overlaps two labels sharing the same row', () => {
  for(const width of [900, 1440]) for(const p of [
    {...DAY_DEFAULTS, fleetGW: 6},
    {...DAY_DEFAULTS, fleetGW: 10, fleetH: 2},   // "Big fleet" preset
  ]){
    const r = runDay(p);
    const svg = renderDay(r, p, ctxAt(width));
    const boxes = [...svg.matchAll(/<text x="([\d.]+)" y="([\d.]+)" font-size="10"( text-anchor="end")?[^>]*fill="#C05621">([^<]*)<\/text>/g)]
      .map(m => { const w = meas(m[4], '10px x'); const x = +m[1]; const y = +m[2];
        return m[3] ? {y, l: x - w, r: x} : {y, l: x, r: x + w}; });
    const byRow = new Map();
    for(const b of boxes){ if(!byRow.has(b.y)) byRow.set(b.y, []); byRow.get(b.y).push(b); }
    for(const [y, row] of byRow){
      row.sort((a, b) => a.l - b.l);
      for(let i = 1; i < row.length; i++)
        assert.ok(row[i].l >= row[i - 1].r, `w=${width} row y=${y}: label ${i} (${JSON.stringify(row[i])}) overlaps ${JSON.stringify(row[i - 1])}`);
    }
  }
});

/* Regression: a first cut at this suppression compared raw tick x-positions
   with a flat 30px threshold and missed this exact case — the LAST changeover
   (h23) sits on the right plot edge and flips to text-anchor='end', so it
   grows LEFTWARD over its neighbour instead of rightward; two ticks 53px apart
   (well past the old 30px gate) still garbled into unreadable overlapping text
   in production (bigFleet preset, iPhone-13-width pricewrap, 2026-07-10). The
   fix measures each label's real anchor-aware left/right extent instead. */
test('renderDay: narrow mode never overlaps an end-anchored label with its neighbour', () => {
  const p = {...DAY_DEFAULTS, fleetGW: 10, fleetH: 2};   // the "Big fleet" preset shape
  const r = runDay(p);
  assert.ok(r.flat.changeovers.length >= 4, 'fixture: several changeovers, including one near the right edge');
  const svg = renderDay(r, p, ctxAt(340));   // iPhone-13 pricewrap's real measured width
  const boxes = [...svg.matchAll(/<text x="([\d.]+)" y="[\d.]+" font-size="10"( text-anchor="end")?[^>]*fill="#C05621">([^<]*)<\/text>/g)]
    .map(m => { const w = meas(m[3], '10px x'); const x = +m[1]; return m[2] ? [x - w, x] : [x, x + w]; });
  assert.ok(boxes.length >= 2, 'fixture: crowding leaves at least two labels to compare');
  for(let i = 1; i < boxes.length; i++)
    assert.ok(boxes[i][0] >= boxes[i - 1][1], `label ${i} (${boxes[i]}) overlaps label ${i - 1} (${boxes[i - 1]})`);
});

/* ---- design fixes: strip salience floor + y-axis headroom (E82 task 7 review) ---- */

test('renderDay: storage strip enforces a minimum visible height on any non-zero bar', () => {
  // fixture: the "Big fleet" preset. Hour 0's kept charge is 0.588 GWh — at the
  // strip's own barScale that's a 1.18px raw sliver (a "speck" against the
  // 40px strip), so the render must float it up to the 2px floor.
  const p = {...DAY_DEFAULTS, fleetGW: 10, fleetH: 2};
  const r = runDay(p);
  assert.ok(r.sched.charge[0] > 0 && r.sched.charge[0] < 1, 'fixture: hour 0 charge is small but non-zero');
  const stripH = 40;
  const barScale = (stripH / 2) / Math.max(...r.planSched.charge, ...r.planSched.discharge, 0.1);
  const rawPx = r.sched.charge[0] * barScale;
  assert.ok(rawPx < 2, `fixture must genuinely exercise the floor (raw ${rawPx}px < 2px)`);

  const svg = renderDay(r, p, ctx);
  const heights = [...svg.matchAll(/<rect data-(?:charge|discharge)=''[^>]*height='([\d.]+)'/g)].map(m => +m[1]);
  assert.ok(heights.length > 0, 'fixture: some kept storage bars render');
  for(const h of heights) assert.ok(h >= 1.9, `every kept bar meets the ~2px floor (got ${h})`);
});

test('renderDay: dropped-trade ghosts stack flush on top of the (possibly floored) kept bar', () => {
  const p = {...DAY_DEFAULTS, fleetGW: 6};
  const r = runDay(p);
  const svg = renderDay(r, p, ctx);
  // every kept rect's y + height must equal (within rounding) some dropped rect's y,
  // OR the kept rect sits flush against the strip midline — either way, no gap/overlap
  const rects = tag => [...svg.matchAll(new RegExp(`<rect data-${tag}=''[^>]*x='([\\d.]+)'[^>]*y='([\\d.]+)'[^>]*width='([\\d.]+)'[^>]*height='([\\d.]+)'`, 'g'))]
    .map(m => ({x: +m[1], y: +m[2], w: +m[3], h: +m[4]}));
  const kept = [...rects('discharge'), ...rects('charge')];
  const dropped = rects('dropped');
  assert.ok(kept.length > 0 && dropped.length > 0, 'fixture: both kept and dropped bars present');
  for(const g of dropped){
    // find a kept bar sharing this ghost's x column (same hour)
    const partner = kept.find(k => Math.abs(k.x - g.x) < 0.5);
    if(!partner) continue;   // ghost with no kept bar this hour (fully dropped) — nothing to check flush against
    const touchesTop = Math.abs((g.y + g.h) - partner.y) < 0.2;
    const touchesBottom = Math.abs(g.y - (partner.y + partner.h)) < 0.2;
    assert.ok(touchesTop || touchesBottom, `ghost (y=${g.y},h=${g.h}) stacks flush against its kept bar (y=${partner.y},h=${partner.h})`);
  }
});

test('renderDay: a labelled gridline sits at or above the data peak (y-axis headroom)', () => {
  // fixture: the "Big fleet" preset peaks around £92 — an unpadded 25-wide step
  // grid would stop labelling at £75 and leave the true peak floating with no
  // reference line above it.
  const p = {...DAY_DEFAULTS, fleetGW: 10, fleetH: 2};
  const r = runDay(p);
  const dataMax = Math.max(...r.raw.prices, ...r.flat.prices);
  assert.ok(dataMax > 75, 'fixture: the peak clears the old fixed £75 top label');
  const svg = renderDay(r, p, ctx);
  const gridLabels = [...svg.matchAll(/>£(-?\d+)</g)].map(m => +m[1]);
  assert.ok(gridLabels.length > 0, 'fixture: grid labels render');
  assert.ok(Math.max(...gridLabels) >= dataMax, `top grid label (£${Math.max(...gridLabels)}) sits at/above the data peak (£${dataMax.toFixed(1)})`);
});

test('renderDay: an exact-multiple data max still gets a flush top label (no double-counted gridline)', () => {
  const r = runDay(DAY_DEFAULTS);
  const dataMax = Math.max(...r.raw.prices, ...r.flat.prices, 10);
  const step = dataMax > 150 ? 50 : 25;
  const padded = Math.ceil(dataMax / step) * step;
  const svg = renderDay(r, DAY_DEFAULTS, ctx);
  const gridLabels = [...svg.matchAll(/>£(-?\d+)</g)].map(m => +m[1]);
  assert.equal(Math.max(...gridLabels), padded, 'top label is exactly the padded step, not one step further');
});

// the flat line is drawn as N coloured segments inside <g data-flat-shape=''>;
// count the <line> children to know how many hour-steps were drawn
const flatSegCount = svg => {
  const g = svg.match(/<g data-flat-shape=''>(.*?)<\/g>/)[1];
  return [...g.matchAll(/<line /g)].length;
};

/* Spec restoration G1: "the price shape draws itself" — during Play, the flat
   line (and the raw ghost) must truncate to hours ≤ upTo, and changeover labels
   ahead of the cursor stay hidden (the tick lines don't — only the text is
   suppressed, per spec). The storage strip is untouched by upTo. */
test('renderDay: upTo=6 truncates the flat line to 6 segments (points h0..h6) and hides changeover labels beyond h6', () => {
  const p = {...DAY_DEFAULTS, fleetGW: 6};
  const r = runDay(p);
  const svg = renderDay(r, p, ctx, {upTo: 6});

  assert.equal(flatSegCount(svg), 6, 'flat line stops at hour 6 (segments h0→h1 … h5→h6)');
  const rawPts = svg.match(/data-raw-shape='' points='([^']*)'/)[1].trim().split(/\s+/);
  assert.equal(rawPts.length, 7, 'raw ghost also truncates to hour 6');

  const beyond = r.flat.changeovers.filter(c => c.h > 6);
  assert.ok(beyond.length > 0, 'fixture: at least one changeover falls after hour 6');
  for(const c of beyond)
    assert.doesNotMatch(svg, new RegExp(`fill="#C05621">${c.to}</text>`), `no label for the ${c.to} changeover at h${c.h} (beyond upTo)`);

  const within = r.flat.changeovers.filter(c => c.h <= 6);
  if(within.length > 0)
    assert.match(svg, new RegExp(`fill="#C05621">${within[0].to}</text>`), 'a changeover at/before upTo still gets its label');
});

test('renderDay: without upTo the flat line always carries all 23 hour-step segments', () => {
  const r = runDay(DAY_DEFAULTS);
  const svg = renderDay(r, DAY_DEFAULTS, ctx);
  assert.equal(flatSegCount(svg), 23, 'no upTo ⇒ full day drawn (scrubbing/export behaviour unchanged)');
});

test('renderDay: narrow mode thins the hour axis and shortens the strip caption', () => {
  const p = {...DAY_DEFAULTS, fleetGW: 6};
  const svg = renderDay(runDay(p), p, ctxAt(360));
  assert.match(svg, />12:00</);
  assert.doesNotMatch(svg, />06:00</, 'narrow keeps only every-12h hour labels');
  assert.match(svg, />dashed = abandoned</);
  assert.doesNotMatch(svg, /planned then abandoned/, 'narrow drops the long caption');
  const wide = renderDay(runDay(p), p, ctxAt(900));
  assert.match(wide, />06:00</);
  assert.match(wide, /planned then abandoned/);
});

/* ---- design pass (review3): house anatomy, taught surface, marginal-hue line ---- */

test('renderDay: the in-plane letterspaced title rides on screen too (B1)', () => {
  const svg = renderDay(runDay(DAY_DEFAULTS), DAY_DEFAULTS, ctx);
  assert.match(svg, /letter-spacing="\.08em"[^>]*>INTRADAY PRICE — £\/MWh across 24 h<\/text>/);
});

test('renderDay: forExport adds the page bg + chart card, a date (only with ctx.today) and a metrics line (B1)', () => {
  const p = {...DAY_DEFAULTS, fleetGW: 6};
  const r = runDay(p);
  const svg = renderDay(r, p, {...ctxAt(900), today: '10 Jul 2026'}, {forExport: true});
  assert.match(svg, /<rect x='0' y='0' width='900'[^>]*fill='#[0-9a-fA-F]{6}'\/>/, 'page bg rect');
  assert.match(svg, /<rect x='100'[^>]*rx='8' fill='#[0-9a-fA-F]{6}' stroke='#[0-9a-fA-F]{6}'\/>/, 'chart-card rect (plot-left − 16 = 100)');
  assert.match(svg, /text-anchor="end"[^>]*>10 Jul 2026<\/text>/, 'date top-right when ctx.today is a string');
  assert.match(svg, /spread £\d+ · trough \d\d:00 · peak \d\d:00 · fleet 6 GW/, 'metrics line (fleet term present)');
  const noDate = renderDay(r, p, ctxAt(900), {forExport: true});
  assert.doesNotMatch(noDate, /10 Jul 2026/, 'no date (deterministic) without ctx.today');
  const noFleet = renderDay(runDay(DAY_DEFAULTS), DAY_DEFAULTS, ctxAt(900), {forExport: true});
  assert.match(noFleet, /spread £\d+ · trough \d\d:00 · peak \d\d:00<\/text>/, 'metrics omits the fleet term at 0');
});

test('renderDay: night + solar washes teach the daylight window and move with sunrise/sunset (B2)', () => {
  const summer = {...DAY_DEFAULTS, sunrise: 5, sunset: 21};
  const s = renderDay(runDay(summer), summer, ctx);
  const solarFill = MERIT_PALETTE.light.solar + '1F';   // validated solar hue at low alpha — no new hue
  const nightFill = ctx.colors.muted + '12';            // validated muted at low alpha
  assert.ok(s.includes(`fill='${solarFill}'`), 'a solar-hue wash marks the daylight window');
  assert.ok(s.includes(`fill='${nightFill}'`), 'a muted wash marks the night');
  assert.match(s, />SOLAR WINDOW</);
  assert.match(s, />NIGHT</);
  const nightW = svg => +svg.match(new RegExp(`<rect x='116'[^>]*width='([\\d.]+)'[^>]*fill='${nightFill}'`))[1];
  const winter = {...DAY_DEFAULTS, sunrise: 8, sunset: 16};
  const w = renderDay(runDay(winter), winter, ctx);
  assert.ok(nightW(w) > nightW(s), `a later sunrise widens the pre-dawn night wash (${nightW(w)} > ${nightW(s)})`);
});

test('renderDay: the price line is segmented and coloured by the marginal fuel family (S5)', () => {
  const svg = renderDay(runDay(DAY_DEFAULTS), DAY_DEFAULTS, ctx);
  const g = svg.match(/<g data-flat-shape=''>(.*?)<\/g>/)[1];
  const cols = [...g.matchAll(/stroke='(#[0-9a-fA-F]{6})'/g)].map(m => m[1].toLowerCase());
  assert.equal(cols.length, 23, 'one segment per hour-step');
  assert.ok(new Set(cols).size >= 3, `segments carry ≥3 distinct family hues (got ${new Set(cols).size})`);
  assert.ok(cols.includes(MERIT_PALETTE.light.biomass.toLowerCase()), 'a £75 Biomass segment takes the biomass hue');
  assert.ok(cols.includes(MERIT_PALETTE.light.thermal[0].toLowerCase()), 'a £83 CCGT-60% segment takes the top thermal step');
  assert.match(g, /stroke-width='2.5'/, 'the price line is 2.5px');
});

test('renderDay: changeover verticals are short top ticks and the cursor is an ink dashed line (S5)', () => {
  const svg = renderDay(runDay(DAY_DEFAULTS), DAY_DEFAULTS, ctx, {cursor: 12});
  // a changeover tick spans only ~12px from the plot top (M.t=34 → 46), not the full plot
  const tick = svg.match(/<line x1='[\d.]+' y1='34' x2='[\d.]+' y2='(\d+)' stroke='#C05621'/);
  assert.ok(tick, 'a changeover tick starts at the plot top');
  assert.equal(+tick[1], 46, 'the tick is a short 12px mark (34 → 46), not a full-height vertical');
  assert.match(svg, /data-cursor='12'[^>]*stroke='#1b2733' stroke-width='1.5' stroke-dasharray='2 3'/, 'cursor is ink + dashed');
});

test('renderDay: fleet 0 drops the reserved strip band and shrinks the canvas (P2)', () => {
  const p0 = {...DAY_DEFAULTS, fleetGW: 0};
  const svg0 = renderDay(runDay(p0), p0, ctx);
  const h0 = +svg0.match(/^<svg width="900" height="(\d+)"/)[1];
  const p6 = {...DAY_DEFAULTS, fleetGW: 6};
  const svg6 = renderDay(runDay(p6), p6, ctx);
  const h6 = +svg6.match(/^<svg width="900" height="(\d+)"/)[1];
  assert.ok(h0 < h6, `fleet-0 canvas (${h0}) is shorter than fleet-6 (${h6}) — no reserved strip`);
  assert.doesNotMatch(svg0, /discharge ↑/, 'no strip caption at fleet 0');
  assert.match(svg6, /discharge ↑/, 'the strip caption returns with a fleet');
});

test('renderDay: the plot-left matches renderStack (116 wide / 44 narrow) so the two cards line up (S1)', () => {
  const wide = renderDay(runDay(DAY_DEFAULTS), DAY_DEFAULTS, ctxAt(900));
  assert.match(wide, /<line x1='116' y1='[\d.]+' x2='868'/, 'wide plot runs 116 → 868 (W − 32)');
  const narrow = renderDay(runDay(DAY_DEFAULTS), DAY_DEFAULTS, ctxAt(360));
  assert.match(narrow, /<line x1='44' y1='[\d.]+' x2='328'/, 'narrow plot runs 44 → 328');
});

/* ---- verdict branches (B3/B4/S2/S3) ---- */

test('buildDayVerdict: empty book — a fleet that finds nothing worth trading (B3a)', () => {
  const p = {...DAY_DEFAULTS, trough: 30, peak: 47, solarPeak: 2, sunrise: 8, sunset: 16, fleetGW: 4};
  const r = runDay(p);
  assert.ok(r.dischargedGWh <= 0.05, 'fixture: the 4 GW fleet trades nothing (spread thinner than the round-trip loss)');
  const v = buildDayVerdict(r, p);
  assert.match(v, /finds nothing worth trading/);
  assert.match(v, /thinner than the round-trip loss/);
  assert.match(v, new RegExp(`the day's spread \\(£${Math.round(r.raw.spread)}\\)`));
  assert.doesNotMatch(v, /flattens|leaves/);
});

test('buildDayVerdict: verb honesty — a fleet that trades without moving the spread "leaves" it (B4)', () => {
  const p = {...DAY_DEFAULTS, fleetGW: 0.5};
  const r = runDay(p);
  assert.ok(r.dischargedGWh > 0.05, 'fixture: the 0.5 GW fleet does trade');
  assert.equal(Math.round(r.raw.spread), Math.round(r.flat.spread), 'fixture: it does not move the headline spread');
  const v = buildDayVerdict(r, p);
  assert.match(v, new RegExp(`leaves the day's spread at £${Math.round(r.raw.spread)}`));
  assert.doesNotMatch(v, /→/, 'no false "flattens X → Y" when the spread is unchanged');
  assert.doesNotMatch(v, /flattens/);
});

test('buildDayVerdict: a real flattening still reads "flattens X → Y" (smoke regex survives)', () => {
  const p = {...DAY_DEFAULTS, fleetGW: 6};
  const r = runDay(p);
  assert.ok(Math.round(r.raw.spread) - Math.round(r.flat.spread) >= 1, 'fixture: 6 GW materially flattens the spread');
  assert.match(buildDayVerdict(r, p), /flattens the day's spread £\d+ → £\d+/);
});

test('buildDayVerdict: the fleet margin is quoted "per MW per day" (S3)', () => {
  const p = {...DAY_DEFAULTS, fleetGW: 6};
  assert.match(buildDayVerdict(runDay(p), p), /per MW per day/);
});

test('buildDayVerdict: a flat-topped peak/trough reads "from hh:00" (plateau, S2)', () => {
  const r = runDay(DAY_DEFAULTS);   // £92 peak spans 17:00–21:00, £20 trough 03:00–04:00
  const v = buildDayVerdict(r, DAY_DEFAULTS);
  assert.match(v, /£92 peak from 17:00/);
  assert.match(v, /£20 floor from 03:00/);
});

test('buildDayVerdict: a single-hour extreme still reads "at hh:00" (non-plateau branch)', () => {
  const spike = {raw: {spread: 50, prices: [10, 30, 60, 30, 15], troughHour: 0, peakHour: 2,
    hours: [{marginal: 'Wind'}, {marginal: 'Biomass'}, {marginal: 'CCGT 60%'}, {marginal: 'Biomass'}, {marginal: 'Wind'}]}};
  const v = buildDayVerdict(spike, {fleetGW: 0});
  assert.match(v, /gas sets the £60 peak at 02:00/);
  assert.match(v, /Wind the £10 floor at 00:00/);
});

/* ---- state-of-charge lane ----
   The bars are per-hour flows; soc is their integral. The lane is scaled to the
   fleet's CAPACITY, not to the day's own peak — that's the whole point of drawing
   it: on a normal day the shape only offers one profitable cycle, so the tank
   never fills, and a peak-scaled ribbon would hide exactly that by drawing a full
   tank every day. These tests pin that decision. */
test('soc lane: drawn when a fleet trades, with the tank-usage fact on it', () => {
  const p = {...DAY_DEFAULTS, fleetGW: 6};
  const r = runDay(p);
  const svg = renderDay(r, p, ctx);
  assert.match(svg, /data-soc=''/, 'the ribbon area');
  assert.match(svg, /data-soc-line=''/, 'the ribbon line');
  assert.match(svg, /state of charge/);
  const cap = p.fleetGW * p.fleetH;
  const peak = Math.max(...r.sched.soc);
  assert.ok(peak < cap, 'fixture premise: this day does NOT fill the tank');
  assert.match(svg, new RegExp('of ' + cap + ' GWh'), 'names the capacity, not just the peak');
  assert.match(svg, new RegExp(Math.round(peak / cap * 100) + '% of the tank'));
});

test('soc lane: scaled to CAPACITY, not to the day\'s peak (never flatters the asset)', () => {
  const p = {...DAY_DEFAULTS, fleetGW: 6};
  const r = runDay(p);
  const svg = renderDay(r, p, ctx);
  const line = svg.match(/data-soc-line='' points='([^']+)'/)[1];
  const ys = line.split(' ').map(pt => +pt.split(',')[1]);
  const top = Math.min(...ys), bottom = Math.max(...ys);   // svg y grows downward
  const cap = p.fleetGW * p.fleetH;
  const frac = Math.max(...r.sched.soc) / cap;             // 43% on the default day
  /* the ribbon's peak must sit at ~frac of the lane height, NOT at the lane's top:
     a peak-scaled ribbon would put `top` at the very top of the lane */
  const laneH = bottom - top;
  assert.ok(laneH > 0, 'the ribbon has vertical extent');
  const impliedLane = laneH / frac;                        // full-lane height implied by the drawn peak
  assert.ok(impliedLane > laneH * 1.5,
    'peak reaches only ' + Math.round(frac * 100) + '% of the tank, so it must NOT touch the top of the lane');
});

test('soc lane: absent when no fleet trades (canvas does not reserve an empty lane)', () => {
  const p = {...DAY_DEFAULTS, fleetGW: 0};
  const svg = renderDay(runDay(p), p, ctx);
  assert.ok(!svg.includes("data-soc=''"), 'no ribbon');
  assert.ok(!svg.includes('state of charge'), 'no caption');
});
