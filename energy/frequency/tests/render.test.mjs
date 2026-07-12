// energy/frequency/tests/render.test.mjs
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {simulate, verdict} from '../engine.js';
import {renderTrace, toMarkdown} from '../render.js';

const ctx = {
  colors: {card:'#fff', border:'#ddd', ink:'#111', muted:'#666', accent:'#C05621', bg:'#f7f8f6', err:'#b00', track:'#eee'},
  measure: (s, f) => s.length * 7,
};
const r = simulate({trip: 1.8, eSync: 90, load: 30, dcMw: 1, battMW: 1, eGfm: 15});

test('renderTrace: well-formed root with double-quoted integer width/height', () => {
  const svg = renderTrace(r, {trip:1.8, eSync:90}, ctx);
  assert.ok(svg.startsWith('<svg'), 'is an svg');
  assert.match(svg, /width="\d+" height="\d+"/, 'svgToCanvas can read the size');
  assert.ok(svg.trim().endsWith('</svg>'), 'closed');
});

test('renderTrace: no XML hazards (bare booleans / double-quoted font in double-quoted attr)', () => {
  const svg = renderTrace(r, {trip:1.8, eSync:90}, ctx);
  // Per-tag structural check (same technique as dev/svg-wellformed.test.mjs): every
  // opening/self-closing tag must decompose into name + well-formed attr="val"/attr='val'
  // pairs with no stray quote inside a value. NOTE: the brief's original assertion here —
  // assert.doesNotMatch(svg, /="[^"]*"[^"]*"/, ...) — is unsatisfiable by construction: it
  // flags ANY tag with two or more double-quoted attributes (e.g. even a bare
  // `<text x="10" y="20">` from the shared txt() helper matches it), so no SVG built with
  // txt() could ever pass it. Replaced with a check that verifies the real invariant.
  // A prior whole-string "no bare boolean attrs" regex lived here too, but it wasn't
  // quote-aware: once the root <svg role="img" aria-label="…"> carries real multi-word
  // prose (added for a11y), the regex's backtracking finds ordinary sentence words with
  // no following "=" and false-positives as a "bare attribute". The per-tag TAG check
  // below already catches a genuine bare attribute (it can't decompose into name=value
  // pairs and fails to match), so it alone is the robust version of this invariant.
  const TAG = /^<[a-zA-Z][\w:-]*((\s+[\w:-]+=("[^"<]*"|'[^'<]*'))*)\s*\/?>$/;
  for(const tag of svg.match(/<[^!/][^>]*>/g) || []){
    assert.match(tag, TAG, 'malformed tag: ' + tag.slice(0, 150));
  }
});

test('toMarkdown: contains the verdict text', () => {
  const md = toMarkdown(r, {trip:1.8, eSync:90});
  assert.ok(md.includes(verdict(r, {trip:1.8, eSync:90})));
});
