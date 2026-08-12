import {test} from 'node:test';
import assert from 'node:assert/strict';
import {parse} from '../parse.js';
import {roadmapToMarkdown, markdownToRoadmapDsl} from '../markdown.js';

test('markdown export keeps the established plain-roadmap shape', () => {
  const model = parse('title: Habitat\nheadline: Learn first\nNOW\nCore: Probe [doing] -- Talk to users\nNEXT\nCore: Ship');
  assert.equal(roadmapToMarkdown(model, {href: 'https://tools.example/roadmap/#x'}),
    '## Habitat\n\n_Learn first_\n\n### Now\n\n- **Core:** Probe _(in progress)_ — Talk to users\n\n### Next\n\n- **Core:** Ship\n\n_[Live roadmap](https://tools.example/roadmap/#x)_');
});

test('markdown round-trips basis, generated horizons, conditional work, declared spans and safe links', () => {
  const src = `title: Conditional plan
horizons: monthly from Aug 2026 x3
basis: paths "Growth decisions"; answered pricing=yes@2026-08-03; assumed groups=no@2026-08-12

Aug 2026
Core: Long probe [bet: signal won] [doing] x6 -- Learn first -> https://example.test/probe?a=1

Sep 2026
Core: Scale path [if signal] [risk] -- Invest if it works -> http://example.test/scale
Core: Fallback [unless signal] [blocked]

Oct 2026
Core: Keep learning`;
  const before = parse(src);
  const markdown = roadmapToMarkdown(before, {href: 'https://tools.example/roadmap/'});

  assert.match(markdown, /\[bet: signal won\]/);
  assert.match(markdown, /\[if signal\]/);
  assert.match(markdown, /\[unless signal\]/);
  assert.match(markdown, /x6/, 'the authored span travels, not its board-clamped width');
  assert.match(markdown, / -> https:\/\/example\.test\/probe\?a=1/);
  assert.match(markdown, / -> http:\/\/example\.test\/scale/);
  assert.match(markdown, /`horizons: monthly from Aug 2026 x3`/);
  assert.match(markdown, /`basis: paths "Growth decisions"; answered pricing=yes@2026-08-03; assumed groups=no@2026-08-12`/);

  const dsl = markdownToRoadmapDsl(markdown);
  assert.match(dsl, /Long probe \[bet: signal won\] x6 \[doing\] -- Learn first -> https:\/\/example\.test\/probe\?a=1/);
  assert.match(dsl, /Scale path \[if signal\] \[risk\] -- Invest if it works -> http:\/\/example\.test\/scale/);
  assert.match(dsl, /Fallback \[unless signal\] \[blocked\]/);
  const after = parse(dsl);
  assert.deepEqual(after.horizons, before.horizons);
  assert.equal(after.timeAxis, true);
  assert.equal(after.items.length, before.items.length);
  assert.deepEqual(after.items.map(item => ({title:item.title, span:item.declaredSpan, cond:item.cond, url:item.url})),
    before.items.map(item => ({title:item.title, span:item.declaredSpan, cond:item.cond, url:item.url})));
  assert.deepEqual(after.basis && {source:after.basis.source, answered:after.basis.answered, assumed:after.basis.assumed},
    before.basis && {source:before.basis.source, answered:before.basis.answered, assumed:before.basis.assumed});
});

test('markdown export never emits a non-http(s) item URL from a malformed model', () => {
  const model = parse('NOW\nCore: Safe');
  model.items[0].url = 'javascript:alert(1)';
  assert.doesNotMatch(roadmapToMarkdown(model), /javascript:/i);
});

test('story is exported only when the caller says a comparison is active', () => {
  const model = parse('story: What changed\nNOW\nCore: A');
  assert.doesNotMatch(roadmapToMarkdown(model), /^> /m);
  assert.match(roadmapToMarkdown(model, {includeStory: true}), /^> What changed$/m);
});
