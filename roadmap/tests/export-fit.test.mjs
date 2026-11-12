import {test} from 'node:test';
import assert from 'node:assert/strict';
import {parse} from '../parse.js';
import {renderChapterPages} from '../chapter-svg.js';
import {layoutChapter} from '../chapter-layout.js';

const measure = (text, font) => String(text || '').length * (Number(/([\d.]+)px/.exec(font)?.[1]) || 18) * .53;
const ctx = {measure, today:'2026-09-04'};
const sentences = n => Array.from({length:n}, (_, i) => `Sentence number ${i + 1} explains one more part of the reasoning.`).join(' ');
const cards = svg => [...svg.matchAll(/<g[^>]*data-key="([^"]*)"[^>]*data-source-index="(\d+)"[^>]*?(?:data-fragment="(\d+)\/(\d+)")?[^>]*>/g)];

test('S1: items that fit a slide whole are never split, even when long', () => {
  const long = `${'A deliberately long initiative title that wraps over several lines and says a great deal '.repeat(2)}`.trim();
  const src = 'style: grid\nNow\n' + [1, 2, 3].map(i => `Core: ${long} ${i} -- ${sentences(4)}`).join('\n');
  const out = renderChapterPages(parse(src), ctx);
  assert.equal(out.complete, true);
  assert.equal(out.pages.join('').includes('data-fragment='), false, 'no fragment marker: nothing was cut');
  for(const page of out.plan.pages) for(const item of page.model.items) assert.equal(item.export.fragment, undefined);
});

test('S1: a too-big item is cut at a sentence, parts are consecutive slides, each says so in words', () => {
  for(const style of ['grid', 'board', 'register', 'focus']){
    const src = `style: ${style}\nNow\nCore: One huge item -- ${sentences(60)}\nCore: Small neighbour`;
    const out = renderChapterPages(parse(src), ctx);
    assert.equal(out.complete, true, style);
    const parts = out.plan.pages.map((p, slide) => ({slide, items: p.model.items.filter(i => i.export.fragment)})).filter(p => p.items.length);
    assert.ok(parts.length >= 2, style + ' needs more than one slide for the huge item');
    for(const p of parts) assert.equal(p.items.length, 1, style + ': two parts of one item never share a slide');
    assert.deepEqual(parts.map(p => p.slide), parts.map((_, i) => parts[0].slide + i), style + ': parts sit on consecutive slides');
    const notes = parts.flatMap(p => p.items.map(i => i.export.fragment.note));
    for(const note of notes.slice(0, -1)) assert.match(note, /\.$/, style + ': non-final parts end on a sentence');
    assert.equal(notes.join(' '), sentences(60), style + ': every sentence appears once, in order');
    const svg = out.pages.join('').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');   // wrapped lines read as one phrase
    assert.match(svg, /Continues on the next slide/); assert.match(svg, /Continued /);
  }
});

test('S3/S4: one scale for the set, in range, and the last slide is not an orphan', () => {
  const items = Array.from({length:14}, (_, i) => `Lane ${i % 3}: Item ${i + 1} with a medium sized title for the slide -- some commentary on item ${i + 1} that wraps a little`).join('\n');
  const out = renderChapterPages(parse('style: grid\nNow\n' + items), ctx);
  assert.equal(out.complete, true);
  const scales = new Set(out.pages.map(svg => /data-scale="([\d.]+)"/.exec(svg)[1]));
  assert.equal(scales.size, 1, 'one scale across the set');
  assert.ok(out.scale >= .88 && out.scale <= 1.35);
  if(out.pages.length > 1){
    const last = out.plan.pages.at(-1);
    const g = layoutChapter(last.model, {...ctx, slide:true, sourceModel:parse('style: grid\nNow\n' + items), scale:out.scale, windowSize:out.plan.windowSize});
    assert.ok(last.model.items.length >= 3 || (g.inkBottom - g.bodyTop) >= (g.bodyBottom - g.bodyTop) / 3 - .5, 'last slide carries three cards or a third of the body');
  }
});

test('S4: a short plan is composed up to fill its slide, a long one never drops below 0.88', () => {
  const short = renderChapterPages(parse('style: grid\nNow\nCore: One\nCore: Two\nCore: Three'), ctx);
  assert.equal(short.pages.length, 1);
  assert.ok(short.scale > 1.2, 'short plan scales up: ' + short.scale);
  assert.doesNotMatch(short.pages[0], />1 of 1</);
});

test('S6: furniture carries the plan\'s own words and "2 of 4" only when there are several slides', () => {
  const src = 'style: grid\nhorizons: Alpha, Beta\nAlpha\n' + Array.from({length:30}, (_, i) => `Core: Alpha item ${i} with enough words to take some room on the slide -- note ${i}`).join('\n');
  const out = renderChapterPages(parse(src), ctx);
  assert.ok(out.pages.length > 1);
  out.pages.forEach((svg, i) => {
    assert.match(svg, new RegExp(`>${i + 1} of ${out.pages.length}<`));
    assert.doesNotMatch(svg, /Theme group|Item part|Featured horizon|Supporting horizons|Page \d+ of/);
  });
  assert.match(out.pages[1].replace(/<[^>]+>/g, '|'), /Alpha, continued\|/);
});
