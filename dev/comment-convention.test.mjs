/* The `//` comment convention, pinned across every DSL parser that takes an
   authored config value. Two rules, found divergent in review (2026-08-02):
   a comment needs a BOUNDARY (start of line or whitespace) — so a URL's //
   never splits a value — and a trailing comment on a config line is a comment,
   never part of the value the artefact prints. */
import {test} from 'node:test';
import assert from 'node:assert/strict';

const CASES = [
  ['timeline', '../timeline/parse.js', d => d],
  ['tree', '../tree/parse.js', d => d],
  ['gauge', '../gauge/parse.js', d => d],
  ['map', '../map/parse.js', d => d],
  ['wardley', '../wardley/parse.js', d => d],
  ['energy/cycles', '../energy/cycles/parse.js', d => d],
  ['energy/risk', '../energy/risk/parse.js', d => d],
];

test('verdict: values drop trailing comments but keep URLs, in every parser', async () => {
  for(const [name, path] of CASES){
    const {parse} = await import(path);
    const commented = parse('verdict: Ship it // secretly unsure');
    assert.equal(commented.verdict, 'Ship it',
      name + ': a trailing comment leaked into the verdict: ' + JSON.stringify(commented.verdict));
    const url = parse('verdict: See https://example.com/plan');
    assert.equal(url.verdict, 'See https://example.com/plan',
      name + ': a URL was split at its //: ' + JSON.stringify(url.verdict));
  }
});

test('roadmap headline/story follow the same convention', async () => {
  const {parse} = await import('../roadmap/parse.js');
  const m = parse('headline: We hold // hedge\nstory: See https://example.com/why\nNOW\nCore: A');
  assert.equal(m.headline, 'We hold');
  assert.equal(m.story, 'See https://example.com/why');
});
