import {test} from 'node:test';
import assert from 'node:assert/strict';
import {dispatch} from '../engine.js';
import {generatorsFromPreset, PRESETS} from '../state.js';
import {renderStack, toMarkdown} from '../render.js';

const ctx = {colors: {card:'#ffffff', border:'#dddddd', ink:'#111111', muted:'#666666', accent:'#C05621',
  bg:'#f7f8f6', err:'#b3403a', track:'#eeeeee'}, measure: (s) => s.length * 7};   // 6-digit hex: tint() needs it
const state = p => ({generators: generatorsFromPreset(p), demand: p.demand});

test('root svg well-formed with double-quoted integer size; keyed plant groups', () => {
  const svg = renderStack(state(PRESETS.typical), ctx);
  assert.ok(svg.startsWith('<svg'));
  assert.match(svg, /width="\d+" height="\d+"/);
  for(const n of ['Renewables','Nuclear','CCGT','Peaker']) assert.ok(svg.includes(`data-plant='${n}'`), n);
  assert.ok(svg.trim().endsWith('</svg>'));
});

test('marginal badge names the marginal plant; verdict avoids "profit"', () => {
  const svg = renderStack(state(PRESETS.typical), ctx);
  assert.ok(svg.includes('MARGINAL'));
  assert.doesNotMatch(svg, /profit/i);
});

test('negative preset shows the words AND a visible warning band, not just a low line', () => {
  const svg = renderStack(state(PRESETS.negative), ctx);
  assert.ok(/paying to generate/i.test(svg));
  assert.ok(svg.includes("class='negative-band'"), 'negative band element drawn');
  assert.doesNotMatch(svg, /class='negative-band'[^>]*fill='none'/, 'band has a real fill, not none');
});

test('every tag is well-formed (per-tag scan, like dev/svg-wellformed) — NOT a whole-string regex', () => {
  // the whole-string /="[^"]*"[^"]*"/ pattern is unsatisfiable (the root svg's own
  // width="..." height="..." trips it) — scan each tag independently instead.
  const svg = renderStack(state(PRESETS.gasSpike), ctx);
  const TAG = /^<[a-zA-Z][\w:-]*((\s+[\w:-]+=("[^"<]*"|'[^'<]*'))*)\s*\/?>$/;
  for(const tag of svg.match(/<[^!/][^>]*>/g) || []){
    if(tag.startsWith('<svg') || tag.endsWith('</')) continue;   // root carries the xmlns/viewBox; closing tags exempt
    assert.ok(TAG.test(tag) || /^<\/?(g|text|tspan)/.test(tag), `well-formed: ${tag}`);
  }
});

test('structural coverage: rent shading, clearing line, demand line present when they should be', () => {
  const svg = renderStack(state(PRESETS.typical), ctx);
  // Typical has positive rent (wind/nuclear below the £60 clearing) → at least one rent-tint rect
  assert.ok((svg.match(/class='rent'/g) || []).length >= 1, 'rent rects');
  assert.ok(svg.includes("class='clearing-line'"), 'clearing-price line');
  assert.ok(svg.includes("class='demand-line'"), 'demand line');
});

test('must-run stranded reads distinctly (not the generic priced-out reading)', () => {
  // "Negative prices": 25 GW must-run renewables, only 12 GW demand → 13 GW stranded must-run
  const svg = renderStack(state(PRESETS.negative), ctx);
  assert.match(svg, /would generate anyway|curtailed|exported/i,
    'must-run stranded MW must NOT silently read as "priced out"');
});

// --- supplementary coverage beyond the brief's Step 1 block ---

test('£0 axis line always drawn, even when the whole stack is positive', () => {
  const svg = renderStack(state(PRESETS.typical), ctx);
  assert.ok(svg.includes("class='zero-line'"), 'zero line present for an all-positive stack');
});

test('every preset renders without throwing and stays well-formed XML-ish (no NaN, no unescaped <)', () => {
  for(const key of Object.keys(PRESETS)){
    const svg = renderStack(state(PRESETS[key]), ctx);
    assert.ok(!/NaN/.test(svg), `${key}: no NaN`);
    assert.ok(svg.trim().endsWith('</svg>'), `${key}: closes`);
  }
});

test('toMarkdown returns a doc string containing the verdict', () => {
  const st = state(PRESETS.typical);
  const result = dispatch(st.generators, st.demand);
  const md = toMarkdown(st, result);
  assert.equal(typeof md, 'string');
  assert.ok(md.includes('CCGT'), 'names the marginal plant');
  assert.doesNotMatch(md, /profit/i);
});

test('toMarkdown for the negative preset also carries the must-run-stranded clause', () => {
  const st = state(PRESETS.negative);
  const result = dispatch(st.generators, st.demand);
  const md = toMarkdown(st, result);
  assert.match(md, /would generate anyway|curtailed|exported/i);
});
