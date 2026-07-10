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
  const capY = +svg.match(/<text x="54" y="([\d.]+)"[^>]*>discharge/)[1];
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
  assert.equal(labelCount(wide), r.flat.changeovers.length, 'wide: no crowding at full width');
  assert.equal(tickCount(narrow), r.flat.changeovers.length, 'narrow: ticks are never dropped');
  assert.ok(labelCount(narrow) < r.flat.changeovers.length, 'narrow: crowded labels are dropped');
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
