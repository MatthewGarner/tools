import {test} from 'node:test';
import assert from 'node:assert/strict';
import {DAY_DEFAULTS, runDay} from '../day.js';
import {renderDayStackExport, exportLayout} from '../render-export.js';
import {GB_TODAY} from '../../merit-order/technologies.js';
import {MERIT_PALETTE} from '../../merit-order/render.js';

const colors = {bg: '#f5f2ed', card: '#ffffff', border: '#d9d5ce', grid: '#e3e7ea',
  ink: '#1b2733', muted: '#66727e', accent: '#C05621'};
const measure = (s, font) => parseFloat(font) * .55 * s.length;
const snap = (params, hour) => ({result: runDay(params), params, hour,
  catalogue: GB_TODAY, date: '20 Aug 2026', colors, palette: MERIT_PALETTE.light, measure});

test('composite export is deterministic and carries both complete day and selected stack', () => {
  const s = snap({...DAY_DEFAULTS, fleetGW: 6}, 18);
  const a = renderDayStackExport(s), b = renderDayStackExport(s);
  assert.equal(a, b);
  assert.match(a, /^<svg[^>]+data-tool="intraday-day-stack"/);
  assert.match(a, /SELECTED HOUR · 18:00/);
  assert.match(a, /20 Aug 2026/);
  assert.match(a, /aria-label="Intraday day and merit-order stack at 18:00\. 20 Aug 2026 · 6 GW fleet\./);
  assert.match(a, /data-cursor='18'/);
  assert.match(a, /MARGINAL · sets the price/);
  assert.match(a, /E5 · INTRADAY/);
  assert.match(a, /THE TAKEAWAY/);
  assert.match(a, /flattens the day(?:&#39;|’)s spread|leaves the day(?:&#39;|’)s spread/);
  assert.equal((a.match(/<svg(?:\s|>)/g) || []).length, 3, 'composite has root plus two panel roots');
  assert.doesNotMatch(a, /undefined|null/);
});

test('raw and fleet snapshots preserve each selected hour across day and stack', () => {
  for(const [params, kind] of [
    [DAY_DEFAULTS, 'raw'],
    [{...DAY_DEFAULTS, fleetGW: 6}, 'fleet'],
  ]) for(const hour of [0, 12, 23]){
    const svg = renderDayStackExport(snap(params, hour));
    const hourLabel = String(hour).padStart(2, '0') + ':00';
    assert.match(svg, new RegExp(`SELECTED HOUR · ${hourLabel}`), `${kind} h${hour} header`);
    assert.match(svg, new RegExp(`data-cursor='${hour}'`), `${kind} h${hour} day cursor`);
    assert.match(svg, /MARGINAL · sets the price/, `${kind} h${hour} selected stack`);
    assert.match(svg, kind === 'raw' ? /no storage fleet/ : /6 GW fleet/, `${kind} h${hour} scenario`);
  }
});

test('composite layout grows from child content, stays inside its artboard and remains raster-safe', () => {
  const params = {...DAY_DEFAULTS, fleetGW: 0};
  const svg = renderDayStackExport(snap(params, 0));
  const root = svg.match(/^<svg[^>]*width="(\d+)" height="(\d+)"/);
  assert.ok(root);
  const width = Number(root[1]), height = Number(root[2]);
  assert.equal(width, 1200);
  assert.ok(height > 900 && height < 2500, `content-driven height ${height}`);
  assert.ok(width * height <= 3_000_000, 'artboard stays inside the shared PNG-raster budget');
  assert.equal(width * 2, 2400, 'the shared 2× raster remains below the side limit');
  assert.ok(height * 2 < 4096, 'the shared 2× raster remains below the side limit');
  const panels = [...svg.matchAll(/<svg x="(\d+)" y="(\d+)" width="(\d+)" height="(\d+)" viewBox="0 0 (\d+) (\d+)" preserveAspectRatio="xMinYMin meet">/g)]
    .map(m => ({x: Number(m[1]), y: Number(m[2]), width: Number(m[3]), height: Number(m[4]), viewWidth: Number(m[5]), viewHeight: Number(m[6])}));
  assert.equal(panels.length, 2, 'one nested root for the day and one for the selected stack');
  assert.ok(panels[0].y < panels[1].y, 'day panel appears before selected-hour stack');
  for(const panel of panels){
    assert.ok(panel.x >= 0 && panel.y >= 0, 'nested panel starts inside root');
    assert.ok(panel.x + panel.width <= width && panel.y + panel.height <= height, 'nested panel stays inside root');
    assert.equal(panel.width, panel.viewWidth);
    assert.equal(panel.height, panel.viewHeight);
  }
  assert.equal(exportLayout({width: 1120, height: 500}, {width: 1120, height: 600}).height, 1326);
});

test('custom catalogue labels remain in the selected-hour stack', () => {
  const catalogue = GB_TODAY.map(t => t.key === 'imports' ? {...t, label: 'Imports <deck>'} : t);
  const s = {...snap({...DAY_DEFAULTS, fleetGW: 2}, 3), catalogue};
  const svg = renderDayStackExport(s);
  assert.match(svg, /Imports &lt;deck&gt;/);
  assert.doesNotMatch(svg, /Imports <deck>/);
});

test('composite export refuses an incomplete snapshot before rendering a mixed artefact', () => {
  const good = snap(DAY_DEFAULTS, 3);
  assert.throws(() => renderDayStackExport({...good, hour: 24}), /complete day snapshot/);
  assert.throws(() => renderDayStackExport({...good, measure: null}), /complete day snapshot/);
});
