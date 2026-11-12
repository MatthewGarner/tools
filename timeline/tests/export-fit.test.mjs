import {test} from 'node:test';
import assert from 'node:assert/strict';
import {parse} from '../parse.js';
import {observatoryPages} from '../observatory.js';
import {render} from '../render.js';

const measure = (text, font) => String(text || '').length * (Number(/([\d.]+)px/.exec(font)?.[1]) || 16) * .53;
const ctx = {measure, today: Math.floor(Date.parse('2026-09-05') / 86400000)};
const texts = svg => [...svg.matchAll(/<text\b([^>]*)>([^<]*)<\/text>/g)].map(m => ({attrs: m[1], text: m[2], x: +/\bx="([\d.]+)"/.exec(m[1])?.[1], y: +/\by="([\d.]+)"/.exec(m[1])?.[1]}));
const busy = n => 'title: Busy programme\n' + Array.from({length: n}, (_, i) => `Lane ${i % 4}: Outcome ${i} 2026-10 .. 2027-03 // Commentary for outcome ${i}`).join('\n');

test('A1/A2: one uniform month step, the year on its own line under the first tick and each January', () => {
  const svg = render(parse('today: 2026-09-05\nA 2026-09-10 .. 2027-03-20\nB 2027-04-01 .. 2027-06-30'), {...ctx, intent: 'native'});
  const ticks = texts(svg).filter(t => /data-axis="tick"/.test(t.attrs));
  const years = texts(svg).filter(t => /data-axis="year"/.test(t.attrs));
  const M = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const idx = ticks.sort((a, b) => a.x - b.x).map(t => M.indexOf(t.text));
  assert.ok(idx.length > 6 && idx.every(i => i >= 0), 'month names only: ' + ticks.map(t => t.text));
  for(let i = 1; i < idx.length; i++) assert.equal((idx[i] - idx[i - 1] + 12) % 12, 1, 'no month dropped: ' + ticks.map(t => t.text));
  assert.deepEqual(years.map(t => t.text), ['2026', '2027'], 'first tick and the January carry the year');
  assert.ok(ticks.every(t => !/\d{4}/.test(t.text)), 'no month label carries a year');
});

test('A3: the Today label has its own line, at least 6px clear of the axis labels', () => {
  const t = texts(render(parse('today: 2026-09-05\nA 2026-09-10 .. 2027-03-20'), {...ctx, intent: 'native'}));
  const today = t.find(x => /data-axis="today"/.test(x.attrs));
  const axis = t.filter(x => /data-axis="(tick|year)"/.test(x.attrs));
  const lowest = Math.max(...axis.map(x => x.y));
  const size = +/font-size="([\d.]+)"/.exec(today.attrs)[1];
  assert.ok(today.y - size - lowest >= 6, `today ${today.y} vs axis ${lowest}`);
});

test('A4: a range that starts and ends on one day prints one date', () => {
  const svg = render(parse('today: 2026-09-05\nA 2026-10-15 .. 2026-10-15'), {...ctx, intent: 'native'});
  const all = texts(svg).map(t => t.text).join(' | ');
  assert.doesNotMatch(all, /15 Oct 2026 – 15 Oct 2026/);
});

test('A5: a long lane name wraps inside the label column and never reaches a gridline', () => {
  const name = 'Platform reliability, sync and storage infrastructure programme';
  const svg = render(parse(`today: 2026-09-05\n${name}: A 2026-10 .. 2027-03`), {...ctx, intent: 'native'});
  const grid = [...svg.matchAll(/<line x1="([\d.]+)"[^>]*stroke-dasharray="2 4"/g)].map(m => +m[1]);
  const lane = texts(svg).filter(t => /font-weight="600"/.test(t.attrs) && /^[A-Z ,]+$/.test(t.text));
  assert.ok(lane.length > 1, 'the name wraps onto several lines');
  for(const t of lane) assert.ok(t.x + t.text.length * 14 * .6 < Math.min(...grid), 'inside the label column: ' + t.text);
});

test('S1/S3/S4/S6: slides carry one scale, an unorphaned last slide, plain footers, and nothing is cut that fits', () => {
  const deck = observatoryPages(parse(busy(23)), ctx);
  assert.equal(deck.complete, true);
  assert.ok(deck.pages.length > 1);
  const scales = new Set(deck.pages.map(p => /data-scale="([\d.]+)"/.exec(p.svg)[1]));
  assert.equal(scales.size, 1);
  assert.ok(deck.scale >= .88 && deck.scale <= 1.35);
  deck.pages.forEach((p, i) => {
    assert.match(p.svg, new RegExp(`>${i + 1} of ${deck.pages.length}<`));
    assert.doesNotMatch(p.svg, /Page \d+ of|Item part|Theme group/);
    assert.equal(p.svg.includes('data-fragment='), false, 'every item fits a slide whole, so none is cut');
  });
  const last = deck.pages.at(-1).svg;
  const rows = (last.match(/data-field-item=/g) || []).length;
  const top = +/data-body-top="([\d.]+)"/.exec(last)[1], limit = +/data-body-bottom="([\d.]+)"/.exec(last)[1], end = +/data-content-bottom="([\d.]+)"/.exec(last)[1];
  assert.ok(rows >= 3 || end - top >= (limit - top) / 3 - .5, `last slide: ${rows} rows, fill ${(end - top) / (limit - top)}`);
});

test('S1: only an item too big for a slide is continued, and it says so in words on each part', () => {
  const note = Array.from({length: 400}, (_, i) => `word${i}`).join(' ');
  const deck = observatoryPages(parse(`Long item 2026-10 .. 2027-03 // ${note}`), ctx);
  assert.ok(deck.pages.length > 1);
  const flat = deck.pages.map(p => p.svg.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' '));
  assert.match(flat[0], /Continues on the next slide/);
  assert.match(flat.at(-1), /Continued/);
  deck.pages.forEach(p => assert.equal((p.svg.match(/data-field-item=/g) || []).length, 1, 'parts of one item never share a slide'));
});

test('S4: a short timeline is composed up to fill its slide', () => {
  const deck = observatoryPages(parse('today: 2026-09-05\nA 2026-10 .. 2026-12\nB 2027-01 .. 2027-03'), ctx);
  assert.equal(deck.pages.length, 1);
  assert.ok(deck.scale > 1.2, 'scale ' + deck.scale);
  assert.doesNotMatch(deck.pages[0].svg, />1 of 1</);
});
