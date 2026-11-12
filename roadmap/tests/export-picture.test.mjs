import {test} from 'node:test';
import assert from 'node:assert/strict';
import {parse} from '../parse.js';
import {renderChapter, chapterColors, chapterContrast} from '../chapter-svg.js';

const measure = (text, font) => String(text || '').length * (Number(/([\d.]+)px/.exec(font)?.[1]) || 18) * .53;
const ctx = {measure, today: '2026-11-12'};
const grid = parse('style: grid\nhorizons: quarterly from Q3 2026 x4\nQ3 2026\nInfra: Sync engine rewrite x2 [doing]\nApp: Curated shelves [done]\nQ4 2026\nApp: Reading reminders\nQ1 2027\nInfra: E-reader sync');
const lines = svg => [...svg.matchAll(/<line x1="([\d.]+)" y1="([\d.]+)" x2="([\d.]+)" y2="([\d.]+)" stroke="([^"]+)"/g)].map(m => ({x1: +m[1], y1: +m[2], x2: +m[3], y2: +m[4], stroke: m[5]}));
const size = svg => { const m = /<svg[^>]*width="([\d.]+)"[^>]*height="([\d.]+)"/.exec(svg); return [+m[1], +m[2]]; };

test('E4: small light-theme inks reach 4.6:1 on every surface they sit on; dark is unchanged', () => {
  for(const accent of [undefined, '#254C3D', '#663B59']){
    const c = chapterColors({accent}, {});
    for(const [name, ink] of [['muted', c.muted], ['accent', c.accent], ...Object.entries(c.status)])
      for(const surface of ['bg', 'tint', 'band']) assert.ok(chapterContrast(ink, c[surface]) >= 4.6, `${accent} ${name} on ${surface}: ${chapterContrast(ink, c[surface]).toFixed(2)}`);
  }
  const dark = chapterColors({}, {dark: true});
  assert.equal(dark.muted, '#B8BDB8');
  assert.deepEqual(dark.status, {doing: '#93A8FF', risk: '#D2AE5B', blocked: '#EE9B94', done: '#80BD94'});
});

test('P1/P2: the time grid closes its last column, rules end at the content edge, margins are equal', () => {
  const svg = renderChapter({...grid}, ctx), [w] = size(svg), l = lines(svg);
  const horiz = l.filter(x => x.y1 === x.y2 && x.x2 - x.x1 > w / 2), vert = l.filter(x => x.x1 === x.x2);
  const right = Math.max(...horiz.map(x => x.x2)), left = Math.min(...horiz.map(x => x.x1));
  assert.equal(left, 34);
  assert.equal(w - right, left, 'right margin equals left margin');
  assert.ok(vert.some(x => Math.abs(x.x1 - right) <= 1), 'the last column has its closing rule');
});

test('G1: Today is a label with a short tick in the header band; no rule runs through the cards', () => {
  const svg = renderChapter({...grid}, ctx), l = lines(svg);
  const accent = l.filter(x => x.x1 === x.x2 && x.stroke !== l[0].stroke);
  assert.equal(accent.length, 1, 'one tick');
  assert.ok(accent[0].y2 - accent[0].y1 <= 14, 'a tick, not a line: ' + (accent[0].y2 - accent[0].y1));
  const firstCard = Math.min(...[...svg.matchAll(/<g[^>]*data-key[^>]*><rect[^>]*y="([\d.]+)"/g)].map(m => +m[1]));
  assert.ok(accent[0].y2 < firstCard, 'ends above the first row');
});

test('P1: a picture is sized to its content, in whole pixels, with no band of empty paper', () => {
  for(const style of ['grid', 'board', 'focus', 'register']){
    const svg = renderChapter({...grid, style}, ctx), [, h] = size(svg);
    assert.equal(h, Math.round(h), style + ' height is whole');
    const texts = [...svg.matchAll(/<text[^>]*\by="([\d.]+)"/g)].map(m => +m[1]);
    const rows = [...svg.matchAll(/<rect[^>]*\by="([\d.]+)"[^>]*height="([\d.]+)"/g)].map(m => +m[1] + +m[2]).filter(v => v < h);
    assert.ok(h - Math.max(...texts, ...rows) < 120, `${style}: ${h - Math.max(...texts, ...rows)}px under the last paint`);
  }
});

test('hairlines sit on n + .5 so they are one crisp pixel at 1x', () => {
  const l = lines(renderChapter({...grid}, ctx));
  for(const x of l) assert.ok(x.x1 === x.x2 ? x.x1 % 1 === .5 : x.y1 % 1 === .5, JSON.stringify(x));
});

test('Register metadata shares its title baseline', () => {
  const svg = renderChapter({...grid, style: 'register'}, ctx);
  const t = [...svg.matchAll(/<text x="([\d.]+)" y="([\d.]+)"[^>]*>(Curated shelves|Done|App)</g)].map(m => ({text: m[3], y: +m[2], x: +m[1]}));
  const title = t.find(x => x.text === 'Curated shelves'), meta = t.find(x => x.text === 'App');
  assert.ok(title && meta);
  assert.equal(meta.y, title.y, 'workstream baseline equals the title baseline');
});
