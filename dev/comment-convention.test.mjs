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
  /* Added 2026-08-16. The list had been hand-kept since 2026-08-02 and had
     silently missed every parser that gained `verdict:` after it was written —
     four of eleven. All four already conformed, so this is coverage, not repair;
     the assertion below is what stops the list drifting a second time. */
  ['case', '../case/parse.js', d => d],
  ['paths', '../paths/parse.js', d => d],
  ['proxy', '../proxy/parse.js', d => d],
  ['roadmap', '../roadmap/parse.js', d => d],
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

/* Coverage, so CASES cannot drift again. Membership is decided by BEHAVIOUR —
   feed every parser a bare `verdict:` line and see whether it keeps the value —
   rather than by grepping for the key, which would count a parser that merely
   mentions the word. A parser that cannot parse the line at all is not a verdict
   parser and is reported only if it also claims to be one. */
test('every parser that accepts verdict: is covered by CASES', async () => {
  const {TOOL_DIRS, ENERGY_TOOL_DIRS} = await import('./tool-dirs.mjs');
  const dirs = [...TOOL_DIRS, ...ENERGY_TOOL_DIRS.map(d => 'energy/' + d)];
  const listed = new Set(CASES.map(([name]) => name));
  const accepts = [];
  for(const dir of dirs){
    let model;
    try { ({parse: model} = await import('../' + dir + '/parse.js')); }
    catch { continue; }                      // no parser: calculators, teaching tools
    let out;
    try { out = model('verdict: Ship it'); } catch { continue; }
    if(out && out.verdict === 'Ship it') accepts.push(dir);
  }
  const missing = accepts.filter(d => !listed.has(d));
  assert.deepEqual(missing, [], 'these parsers accept verdict: but are not in CASES, so the ' +
    'convention is unasserted for them: ' + missing.join(' '));
  const stale = [...listed].filter(d => !accepts.includes(d));
  assert.deepEqual(stale, [], 'CASES lists parsers that no longer accept verdict:: ' + stale.join(' '));
});

test('roadmap headline/story follow the same convention', async () => {
  const {parse} = await import('../roadmap/parse.js');
  const m = parse('headline: We hold // hedge\nstory: See https://example.com/why\nNOW\nCore: A');
  assert.equal(m.headline, 'We hold');
  assert.equal(m.story, 'See https://example.com/why');
});
