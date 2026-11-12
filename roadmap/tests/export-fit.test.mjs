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
  assert.match(out.pages[1].replace(/<[^>]+>/g, '|'), /Core \(continued\)\|/);
});

test('S5: a comparison\'s dropped-work slides carry the same furniture as the set\'s own slides', () => {
  for(const style of ['grid', 'focus', 'register']){
    const m = {...parse('style: ' + style + '\ntitle: Lantern\nheadline: Retention first\nNow\n' + Array.from({length: 10}, (_, i) => `Core: Item ${i}`).join('\n')), style};
    const out = renderChapterPages(m, {...ctx, diff: {since: 'Baseline', any: true, badge: () => null, dropped: ['Retired one', 'Retired two']}});
    assert.ok(out.plan.pages.some(p => p.dropped) && out.pages.length > 1);
    const kicker = svg => /<text\b[^>]*font-size="([\d.]+)"/.exec(svg)?.[1];   // the first text of the title block
    const footer = svg => /<text x="([\d.]+)" y="[\d.]+"[^>]*text-anchor="end"/.exec(svg)?.[1];
    assert.equal(new Set(out.pages.map(kicker)).size, 1, style + ': one kicker size');
    assert.equal(new Set(out.pages.map(footer)).size, 1, style + ': one footer position');
  }
});

/* ---- round 2 (F1-F4): written against the stress documents the contact sheets showed ---- */
import {readFileSync} from 'node:fs';
const fixture = name => parse(readFileSync(new URL(`../../dev/fixtures/export-stress/roadmap/${name}.txt`, import.meta.url), 'utf8'));
const railOf = (page, model, out) => layoutChapter(page.model, {...ctx, slide: true, sourceModel: model, scale: out.scale, windowSize: out.plan.windowSize, compactItems: model.items.length}).panels.some(p => p.role === 'rail');

test('F1: Focus places a supporting horizon whole, and a slide with nothing for the rail has no rail', () => {
  const m = {...fixture('example'), style: 'focus'};
  const out = renderChapterPages(m, ctx);
  assert.deepEqual(out.plan.pages.map(p => p.horizons), [['Now', 'Next'], ['Later']]);
  assert.deepEqual(out.plan.pages.map(p => railOf(p, m, out)), [true, false]);
  assert.deepEqual(out.plan.pages.map(p => p.scope[0]), ['Now and Next', 'Later']);
  // no horizon is split between a rail and the next slide
  const home = new Map();
  out.plan.pages.forEach((p, i) => p.model.items.forEach(item => { const h = p.horizons[item.h]; home.set(h, new Set([...(home.get(h) || []), i])); }));
  for(const [h, slides] of home) assert.equal(slides.size, 1, `${h} is on ${slides.size} slides`);
});

test('F2: "continued" is attached to the name and only where that name began earlier', () => {
  for(const name of ['example', 'every-feature', 'uneven', 'dense']) for(const style of ['grid', 'board', 'focus', 'register']){
    const out = renderChapterPages({...fixture(name), style}, ctx);
    out.plan.pages.forEach((p, i) => {
      const label = p.scope[0] || '';
      assert.doesNotMatch(label, /, continued|^Continued/, `${name}/${style} slide ${i + 1}: ${label}`);
      if(i === 0) assert.doesNotMatch(label, /continued/, `${name}/${style}: nothing is continued on slide 1`);
    });
  }
  const reg = renderChapterPages({...fixture('example'), style: 'register'}, ctx);
  assert.equal(reg.plan.pages[1].scope[0], 'Later', 'Later begins on slide 2 and is not "continued"');
});

test('F3: Board columns flow independently, so no column is empty while it has cards on a later slide', () => {
  const m = {...fixture('uneven'), style: 'board'};
  const out = renderChapterPages(m, ctx);
  const cols = out.plan.pages.map(p => new Set(p.model.items.map(i => p.horizons[i.h])));
  assert.ok(cols[0].has('Next') && cols[0].has('Someday'), 'slide 1 shows Next and Someday, which have items');
  for(const h of ['Next', 'Someday']) assert.equal(cols.filter(c => c.has(h)).length, 1, h + ' appears once');
  assert.ok(out.pages.length <= 3, 'uneven board in three slides or fewer');
});

test('F4: Grid keeps plan order, shows up to five horizons whole, and leaves no thin slide', () => {
  const m = {...fixture('every-feature'), style: 'grid'};
  for(const titlesOnly of [false, true]){
    const out = renderChapterPages(m, {...ctx, titlesOnly});
    assert.ok(out.plan.pages.every(p => p.horizons.length === 5), 'five quarters on every slide');
    const order = out.plan.pages.flatMap(p => (p.lanes || []).filter(l => p.model.items.some(i => i.lane === l)));
    const plan = [...new Set(m.items.map(i => i.lane))];
    assert.deepEqual(order, plan.filter(l => order.includes(l)), 'lanes in plan order');
    assert.ok(out.plan.pages.every(p => !p.orphan), 'no thin slide in the set');
  }
});
