import {test} from 'node:test';
import assert from 'node:assert/strict';
import {renderDistributions, renderBox} from '../render.js';

const ctx = {
  colors: {card: '#fff', border: '#ddd', ink: '#222', muted: '#667', accent: '#0C7FAE',
    accentInk: '#0A6C94', bg: '#f7f8f6', err: '#b33', track: '#e7e7e4'},
};

/* light well-formedness probe (the full XML scan is dev/svg-wellformed.test.mjs) */
function wellFormed(svg){
  assert.ok(svg.startsWith('<svg') && svg.endsWith('</svg>'), 'svg envelope');
  assert.ok(!/\bundefined\b|\bNaN\b/.test(svg), 'no undefined/NaN');
  const open = (svg.match(/<svg/g) || []).length, close = (svg.match(/<\/svg>/g) || []).length;
  assert.equal(open, close, 'balanced svg tags');
  // every attribute value opens and closes with a double quote (even count)
  assert.equal((svg.match(/"/g) || []).length % 2, 0, 'balanced attribute quotes');
}

test('distribution SVG: two curves, threshold handle, decodable XML', () => {
  const svg = renderDistributions({baseRate: 0.1, dprime: 2, t: 1}, ctx.colors, {w: 900, h: 220});
  assert.ok(svg.includes('data-drag="threshold"'));
  assert.equal((svg.match(/<path/g) || []).length >= 2, true);
  assert.ok(!svg.includes('NaN'));
  wellFormed(svg);
});
test('2×2 box carries all four counts and chips', () => {
  const h = renderBox({tp: 10, fp: 90, tn: 880, fn: 20}, ctx.colors);
  for(const n of ['10', '90', '880', '20']) assert.ok(h.includes(n));
  assert.match(h, /precision/i);
});
test('threshold handle carries a >=44px hit target', () => {
  const svg = renderDistributions({baseRate: 0.1, dprime: 2, t: 1}, ctx.colors, {w: 900, h: 220});
  assert.match(svg, /data-hit=""[^>]*width="44"/);
});
test('degenerate params never emit NaN', () => {
  for(const p of [{baseRate: 0.001, dprime: 0, t: -3}, {baseRate: 0.5, dprime: 4, t: 6}])
    assert.ok(!renderDistributions(p, ctx.colors, {w: 900, h: 220}).includes('NaN'));
});
