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

test('E3: every font-family ends in a generic family; the picture carries a title and a description', () => {
  for(const intent of ['native', 'presentation']){
    const svg = render(parse('title: Northstar\ntoday: 2026-09-05\nA 2026-10 .. 2026-12'), {...ctx, intent});
    for(const m of svg.matchAll(/font-family="([^"]+)"/g)) assert.match(m[1], /, (sans-serif|serif)$/, m[1]);
    assert.match(svg, /<title>Northstar<\/title><desc>/);
  }
});

test('register rows are tall enough for their wrapped date columns, at every scale', () => {
  const src = 'today: 2026-09-05\n' + Array.from({length: 14}, (_, i) => `Lane ${i % 3}: Outcome ${i} 2026-10-1${i % 9} .. 2027-0${1 + i % 8}-2${i % 8}`).join('\n');
  const deck = observatoryPages(parse('style: register\n' + src), ctx);
  for(const page of deck.pages) for(const g of page.svg.matchAll(/<g data-field-item="[^"]*"[^>]*>([\s\S]*?)<\/g>/g)){
    const rect = /<rect[^>]*\by="([\d.]+)"[^>]*height="([\d.]+)"/.exec(g[1]);
    const bottom = +rect[1] + +rect[2];
    for(const t of g[1].matchAll(/<text[^>]*\by="([\d.]+)"/g)) assert.ok(+t[1] <= bottom, `a text baseline ${t[1]} is below its row bottom ${bottom}`);
  }
});

/* ---- round 2 (F2, F5, F6, F7): the stress documents the contact sheets showed ---- */
import {readFileSync} from 'node:fs';
const doc = name => parse(readFileSync(new URL(`../../dev/fixtures/export-stress/timeline/${name}.txt`, import.meta.url), 'utf8'));
const rowsPerLane = deck => deck.pages.map(p => { const n = new Map(); for(const m of p.svg.matchAll(/data-field-item="([^"|]*)\|/g)) n.set(m[1], (n.get(m[1]) || 0) + 1); return n; });

test('F5: a split lane leaves at least two rows on each side; a lane of three or fewer is never split', () => {
  for(const [name, style] of [['example-2', 'review'], ['example-2', 'field'], ['extreme-dates', 'field'], ['extreme-dates', 'review']]){
    const deck = observatoryPages({...doc(name), style}, {...ctx, today: Math.floor(Date.parse('2026-11-12') / 86400000)});
    const per = rowsPerLane(deck);
    const lanes = new Set(per.flatMap(n => [...n.keys()]));
    for(const lane of lanes){
      const at = per.map((n, i) => n.has(lane) ? i : -1).filter(i => i >= 0);
      if(at.length > 1) for(const i of at) assert.ok(per[i].get(lane) >= 2, `${name}/${style}: ${lane} has ${per[i].get(lane)} row on slide ${i + 1}`);
    }
  }
});

test('F6: one scale for row text, axis and Today labels; a date in a register column never wraps', () => {
  const deck = observatoryPages({...doc('example'), style: 'register'}, {...ctx, today: Math.floor(Date.parse('2026-11-12') / 86400000)});
  const svg = deck.pages[0].svg;
  const sizeOf = re => [...svg.matchAll(re)].map(m => +m[1]);
  const axis = sizeOf(/<text[^>]*font-size="([\d.]+)"[^>]*data-axis="tick"/g), rowText = sizeOf(/data-field-item[\s\S]*?<text[^>]*font-size="([\d.]+)"/g);
  assert.ok(axis.length && rowText.length);
  assert.equal(new Set([...axis, rowText[0]]).size, 1, 'axis labels and row text share one size: ' + [...axis, rowText[0]]);
  const texts = [...svg.matchAll(/<text[^>]*>([^<]*)<\/text>/g)].map(m => m[1]);
  for(let i = 0; i + 1 < texts.length; i++) assert.ok(!(/^\d{1,2}$/.test(texts[i]) && /^[A-Z][a-z]{2} \d{4}$/.test(texts[i + 1])), `a date wraps: ${texts[i]} / ${texts[i + 1]}`);
});

test('F7: the legend lists every mark drawn, pinned across the set', () => {
  const deck = observatoryPages({...doc('example-2'), style: 'field'}, {...ctx, today: Math.floor(Date.parse('2026-11-12') / 86400000)});
  for(const page of deck.pages){
    assert.match(page.svg, /data-ms="lrm"|Decide by/);
    assert.match(page.svg.replace(/<[^>]+>/g, '|'), /Decide by/, 'the Decide by triangle is in the legend');
  }
  const plain = observatoryPages({...doc('minimal'), style: 'field'}, ctx);
  assert.doesNotMatch(plain.pages[0].svg.replace(/<[^>]+>/g, '|'), /Decide by|Previous forecast/, 'a mark that is not drawn is not listed');
});

test('F2: "continued" sits on the lane that began on an earlier slide', () => {
  const deck = observatoryPages({...doc('uneven'), style: 'field'}, {...ctx, today: Math.floor(Date.parse('2026-11-12') / 86400000)});
  deck.pages.forEach((p, i) => { const f = p.svg.match(/<text[^>]*data-axis="scope"[^>]*>([^<]*)<\/text>/)?.[1] || ''; assert.doesNotMatch(f, /, continued/); if(i === 0) assert.doesNotMatch(f, /continued/); });
});

import {checkSlideSet} from '../../dev/pw/export-checks.mjs';

test('H2: on a register slide a date shares the baseline of its milestone title', () => {
  for(const name of ['example', 'every-feature']){
    const deck = observatoryPages({...doc(name), style: 'register'}, {...ctx, today: Math.floor(Date.parse('2026-11-12') / 86400000)});
    const r = checkSlideSet(deck.pages.map(p => p.svg), {tool: 'timeline', style: 'register'}).find(c => c.check === 'slides:register-baseline');
    assert.ok(r.pass, name + ' ' + JSON.stringify(r.values));
  }
});

test('H3: every-feature as a register splits no lane 1 + n: the scale comes down instead', () => {
  const deck = observatoryPages({...doc('every-feature'), style: 'register'}, {...ctx, today: Math.floor(Date.parse('2026-11-12') / 86400000)});
  const per = rowsPerLane(deck);
  const at = per.map((n, i) => n.has('launch') ? i : -1).filter(i => i >= 0);
  assert.ok(at.length === 1 || at.every(i => per[i].get('launch') >= 2), 'launch rows per slide: ' + per.map(n => n.get('launch') || 0));
  assert.ok(deck.scale >= .88, 'the scale stays in range: ' + deck.scale);   // the real-font case (2 slides at 0.91) is the gate's: its KNOWN exception for this set is gone
});
