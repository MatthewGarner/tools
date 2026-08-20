/* Meta-test: every design token the SHIPPED JS reads at runtime must be declared
   in every theme block of the sheet that owns it.

   The trap this closes: getComputedStyle().getPropertyValue() returns '' for a
   token that doesn't exist — no throw, no warning. assets/app-common.js's
   themeColors() feeds those values straight into ctx.colors, and the renderers
   emit them into fill="…"/stroke="…". So renaming or dropping a token makes every
   renderer emit fill="" in the browser, while nothing in the node gate notices:
   dev/golden.mjs uses invented colours rather than tokens (#fff/#ddd/#222, not the
   shipped #F4F4F1/#D9D9D5/#111111), so the goldens stay byte-identical; injection
   and svg-wellformed scan renderer output built from those same invented colours.
   Measured before writing this: blanking ctx.colors yields 5-19 empty fill/stroke
   attributes per renderer.

   PER BLOCK, not per file. tokens.css declares the same set four times — :root
   (light), the prefers-color-scheme dark @media, and the two explicit [data-theme]
   overrides that let the viewer's choice beat the media query. A rename applied to
   one block only still resolves everywhere else, so a file-level "is it defined
   anywhere" check would pass while exactly one theme rendered blank. That is the
   realistic drift, so it is the one asserted against.

   The read set is DERIVED from the JS, not listed here: themeColors()'s own body
   plus any direct getPropertyValue('--x') elsewhere. A new token read is therefore
   covered the moment it is written, the same self-enforcing shape as
   renderer-coverage and starter. */
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync, readdirSync, statSync} from 'node:fs';
import {join} from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname;
const SKIP = new Set(['node_modules', '.git', '.Codex', '.claude', 'vendor', 'dev', 'tests']);

function shippedJs(dir = ROOT, out = []){
  for(const name of readdirSync(dir)){
    if(SKIP.has(name)) continue;
    const p = join(dir, name);
    if(statSync(p).isDirectory()) shippedJs(p, out);
    else if(name.endsWith('.js')) out.push(p);
  }
  return out;
}

/* The body of a function, by balancing braces from its declaration. Cheaper than
   a parser and exact enough here; indexOf('\n}') would end the body early at any
   nested block that happens to close at column 0. */
function functionBody(src, decl){
  const at = src.indexOf(decl);
  if(at < 0) return '';
  let i = src.indexOf('{', at), depth = 0;
  for(let j = i; j < src.length; j++){
    if(src[j] === '{') depth++;
    else if(src[j] === '}' && --depth === 0) return src.slice(i, j);
  }
  return '';
}

/* Tokens read from the DOCUMENT's computed style. Two shapes in the wild:
   fermi/roadmap call getPropertyValue('--accent2'/'--accent') directly, while
   themeColors() aliases getPropertyValue to a local and calls it per field.

   Inside themeColors the extraction takes EVERY token-name literal in the body
   rather than matching the alias's call shape. Matching `g(` — the obvious
   version, and the one written first — couples this test to an identifier name:
   one extra level of indirection (`const g2 = g; … g2('--muted')`) drops a token
   from the read set with nothing failing, and the count backstop below has too
   little margin to notice a single loss. Over-covering is the safe direction: a
   token named in the body but not read would only demand it exist. */
function tokensReadAtRuntime(){
  const found = new Set();
  for(const file of shippedJs()){
    const src = readFileSync(file, 'utf8');
    for(const m of src.matchAll(/getPropertyValue\(\s*['"](--[a-z0-9-]+)['"]\s*\)/g)) found.add(m[1]);
    const body = functionBody(src, 'export function themeColors');
    for(const m of body.matchAll(/['"](--[a-z0-9-]+)['"]/g)) found.add(m[1]);
  }
  return found;
}

/* Declaration blocks, by selector. The regex is deliberately flat — it does not
   model @media nesting, so a wrapped block reports its inner selector. That is
   fine here: what matters is that FOUR blocks each declare the full set, not
   which one is which. `n` guards against matching a rule that merely uses tokens. */
function themeBlocks(file, n){
  return [...readFileSync(join(ROOT, file), 'utf8').matchAll(/([^{}]+)\{([^{}]*)\}/g)]
    .map(m => {
      const values = new Map([...m[2].matchAll(/(--[a-z0-9-]+)\s*:\s*([^;}]+)(?:;|$)/g)]
        .map(x => [x[1], x[2].trim()]));
      return {
        sel: m[1].trim().replace(/\s+/g, ' ').split('*/').pop().trim(),
        tokens: new Set(values.keys()),
        values,
      };
    })
    .filter(b => b.tokens.size >= n);
}

test('every token the shipped JS reads is declared in all four tokens.css theme blocks', () => {
  const read = [...tokensReadAtRuntime()].sort();
  /* Backstop only — it catches a gross extraction failure (themeColors renamed or
     moved), not a single dropped token, which is why the extraction above is written
     not to drop one in the first place. */
  assert.ok(read.length >= 20, 'expected the runtime read set to be found; got ' + read.length +
    ' — the extraction above has drifted from how themeColors() is written');
  const blocks = themeBlocks('assets/tokens.css', 10);
  assert.equal(blocks.length, 4, 'tokens.css should carry exactly four theme blocks ' +
    '(:root light, the dark @media, and both [data-theme] overrides); found ' + blocks.length +
    '. If the sheet still looks right, the flat regex above has been confused by nesting ' +
    'or braces it cannot model — a new at-rule block (@supports) re-declaring the token ' +
    'set counts as an extra block, and a brace PAIR inside a comment matches as its own ' +
    'and strands the real declarations. Both fail loudly here rather than passing.');
  for(const block of blocks){
    const missing = read.filter(t => !block.tokens.has(t));
    assert.deepEqual(missing, [], block.sel + ' does not declare ' + missing.join(' ') +
      ' — getPropertyValue returns \'\' for those, so this theme renders fill=""');
  }
});

test('the four tokens.css theme blocks declare identical token sets', () => {
  const blocks = themeBlocks('assets/tokens.css', 10);
  const first = [...blocks[0].tokens].sort();
  for(const block of blocks.slice(1))
    assert.deepEqual([...block.tokens].sort(), first,
      block.sel + ' declares a different set from the first block — a token added to one ' +
      'theme and not the others resolves blank in the themes that missed it');
});

test('energy.css overrides the same tokens in every theme block, and invents none', () => {
  const blocks = themeBlocks('assets/energy.css', 3);
  assert.equal(blocks.length, 4, 'energy.css should mirror tokens.css\'s four-block shape; ' +
    'found ' + blocks.length);
  const first = [...blocks[0].tokens].sort();
  for(const block of blocks.slice(1))
    assert.deepEqual([...block.tokens].sort(), first,
      'energy ' + block.sel + ' overrides a different set from the first block');
  /* energy.css deliberately declares a SUBSET (the ember accent + brand); it is an
     override sheet, so the assertion is the other direction from tokens.css's. */
  const base = themeBlocks('assets/tokens.css', 10)[0].tokens;
  for(const token of first)
    assert.ok(base.has(token), 'energy.css overrides ' + token + ', which tokens.css never ' +
      'declares — on the tools origin that token would resolve to \'\'');
});

/* Every theme custom property is a colour except the deliberately polymorphic
   box-shadow slot. This exclusion makes a newly added theme token fail as a
   colour until it is either given a valid colour or consciously classified. */
const NON_COLOR_THEME_TOKENS = new Set(['--shadow']);

function validColor(value){
  if(value === 'transparent') return true;
  if(/^#[0-9a-f]{3,4}$/i.test(value) || /^#[0-9a-f]{6}([0-9a-f]{2})?$/i.test(value)) return true;
  const m = value.match(/^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)(?:\s*,\s*([\d.]+))?\s*\)$/i);
  if(!m) return false;
  if(value.toLowerCase().startsWith('rgba') !== (m[4] != null)) return false;
  const channels = m.slice(1, 4).map(Number);
  const alpha = m[4] == null ? 1 : Number(m[4]);
  return channels.every(n => Number.isFinite(n) && n >= 0 && n <= 255) &&
    Number.isFinite(alpha) && alpha >= 0 && alpha <= 1;
}

function resolvedThemes(overrides){
  const base = themeBlocks('assets/tokens.css', 10);
  if(!overrides) return base;
  const extra = themeBlocks(overrides, 3);
  return base.map((block, i) => ({
    sel: 'energy ' + block.sel,
    values: new Map([...block.values, ...extra[i].values]),
  }));
}

for(const [label, file] of [['tools', null], ['energy', 'assets/energy.css']]){
  test(label + ' colour tokens have valid CSS colour values in every resolved theme', () => {
    for(const block of resolvedThemes(file)){
      for(const [token, value] of block.values){
        if(NON_COLOR_THEME_TOKENS.has(token)) continue;
        assert.ok(validColor(value), block.sel + ' has invalid ' + token + ': ' + value);
      }
    }
  });
}

function rgb(hex){
  const raw = hex.slice(1);
  const six = raw.length === 3 ? [...raw].map(c => c + c).join('') : raw.slice(0, 6);
  return [0, 2, 4].map(i => parseInt(six.slice(i, i + 2), 16) / 255);
}

function luminance(hex){
  const linear = rgb(hex).map(v => v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4);
  return .2126 * linear[0] + .7152 * linear[1] + .0722 * linear[2];
}

function contrast(a, b){
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + .05) / (lo + .05);
}

/* These are tokens used as normal-size HTML text on the shared page surfaces.
   Deliberately exclude chart/mark colours: WCAG text contrast is not the right
   contract for decorative SVG geometry. brand-on/brand is the primary button. */
const SURFACE_TEXT = [
  '--ink', '--muted', '--accent-ink', '--brand-text', '--err', '--st-done',
  '--st-done-ink', '--st-doing-ink', '--st-risk-ink', '--st-blocked-ink',
];

for(const [label, file] of [['tools', null], ['energy', 'assets/energy.css']]){
  test(label + ' semantic text colours meet WCAG AA on their actual surfaces', () => {
    for(const block of resolvedThemes(file)){
      for(const foreground of SURFACE_TEXT){
        for(const surface of ['--bg', '--card']){
          const fg = block.values.get(foreground);
          const bg = block.values.get(surface);
          assert.match(fg, /^#[0-9a-f]{6}$/i, foreground + ' must be an opaque six-digit hex');
          assert.match(bg, /^#[0-9a-f]{6}$/i, surface + ' must be an opaque six-digit hex');
          const ratio = contrast(fg, bg);
          assert.ok(ratio >= 4.5, block.sel + ' ' + foreground + ' on ' + surface +
            ' is ' + ratio.toFixed(2) + ':1; normal text requires 4.5:1');
        }
      }
      const brandOn = block.values.get('--brand-on');
      const brand = block.values.get('--brand');
      assert.match(brandOn, /^#[0-9a-f]{6}$/i, '--brand-on must be an opaque six-digit hex');
      assert.match(brand, /^#[0-9a-f]{6}$/i, '--brand must be an opaque six-digit hex');
      const button = contrast(brandOn, brand);
      assert.ok(button >= 4.5, block.sel + ' --brand-on on --brand is ' +
        button.toFixed(2) + ':1; primary-button text requires 4.5:1');
    }
  });
}
