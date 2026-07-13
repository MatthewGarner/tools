import {test} from 'node:test';
import assert from 'node:assert/strict';
import {posterSvg} from '../poster.js';

const colors = {bg: '#f7f8f6', ink: '#222222', muted: '#667777', border: '#dddddd', grid: 'rgba(70,110,140,.10)'};
const measure = t => t.length * 7;                 // deterministic, matches golden ctx
const CHART = '<svg xmlns="http://www.w3.org/2000/svg" width="200" height="120" viewBox="0 0 200 120"><rect width="200" height="120" fill="#fff"/></svg>';
const base = {chart: CHART, verdict: 'Next up ships in Q3', name: 'Milestone timeline',
  date: '2026-07-13', metrics: ['12 milestones', 'last by Mar 2027'], accent: '#0a6c94', colors, measure};

test('root svg is double-quoted, integer-sized, chartW + 2*margin wide', () => {
  const out = posterSvg(base);
  const m = out.match(/^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg" width="(\d+)" height="(\d+)"/);
  assert.ok(m, 'root must open with double-quoted integer width/height for svgToCanvas');
  assert.equal(+m[1], 200 + 112);                  // margin 56 each side
  assert.ok(+m[2] > 120);                          // taller than the chart (hero + footer)
});

test('embeds the chart verbatim inside a translate group', () => {
  const out = posterSvg(base);
  assert.ok(out.includes('<g transform="translate(56 '), 'chart placed via translate');
  assert.ok(out.includes(CHART), 'chart embedded unchanged');
});

test('hero verdict and footer parts are present', () => {
  const out = posterSvg(base);
  assert.ok(out.includes('>Next up ships in Q3</text>'), 'hero line');
  assert.ok(out.includes('Milestone timeline'), 'footer name');
  assert.ok(out.includes('2026-07-13'), 'footer date');
  assert.ok(out.includes('12 milestones'), 'footer metric');
});

test('taller when the verdict wraps to two lines', () => {
  const one = posterSvg({...base, verdict: 'Short'});
  const two = posterSvg({...base, verdict: 'A much longer verdict sentence that will wrap across two lines at this width for sure'});
  const h = s => +s.match(/height="(\d+)" viewBox/)[1];
  assert.ok(h(two) > h(one), 'wrapped verdict grows the poster height');
});

test('no verdict → no hero text, still valid', () => {
  const out = posterSvg({...base, verdict: ''});
  assert.ok(out.startsWith('<svg'));
  assert.ok(!out.includes('font-size="28"'), 'hero omitted when verdict empty');
});

test('escapes hostile verdict/name/metric strings', () => {
  const out = posterSvg({...base, verdict: '<script>alert(1)</script>', name: '"><img src=x onerror=alert(1)>', metrics: ['a & b < c']});
  assert.ok(!/<script/i.test(out.replace(/&lt;script/gi, '')), 'no raw <script>');
  assert.ok(!/<img/i.test(out.replace(/&lt;img/gi, '')), 'no raw <img>');
});
