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

/* Tokens read from the DOCUMENT's computed style. Two shapes in the wild:
   themeColors() aliases getPropertyValue to `g` and calls g('--card'), while
   fermi/roadmap call getPropertyValue('--accent2'/'--accent') directly. */
function tokensReadAtRuntime(){
  const found = new Set();
  for(const file of shippedJs()){
    const src = readFileSync(file, 'utf8');
    for(const m of src.matchAll(/getPropertyValue\(\s*'(--[a-z0-9-]+)'\s*\)/g)) found.add(m[1]);
    const at = src.indexOf('export function themeColors');
    if(at < 0) continue;
    const body = src.slice(at, src.indexOf('\n}', at));
    for(const m of body.matchAll(/g\(\s*'(--[a-z0-9-]+)'\s*\)/g)) found.add(m[1]);
  }
  return found;
}

/* Declaration blocks, by selector. The regex is deliberately flat — it does not
   model @media nesting, so a wrapped block reports its inner selector. That is
   fine here: what matters is that FOUR blocks each declare the full set, not
   which one is which. `n` guards against matching a rule that merely uses tokens. */
function themeBlocks(file, n){
  return [...readFileSync(join(ROOT, file), 'utf8').matchAll(/([^{}]+)\{([^{}]*)\}/g)]
    .map(m => ({
      sel: m[1].trim().replace(/\s+/g, ' ').split('*/').pop().trim(),
      tokens: new Set([...m[2].matchAll(/(--[a-z0-9-]+)\s*:/g)].map(x => x[1])),
    }))
    .filter(b => b.tokens.size >= n);
}

test('every token the shipped JS reads is declared in all four tokens.css theme blocks', () => {
  const read = [...tokensReadAtRuntime()].sort();
  assert.ok(read.length >= 20, 'expected the runtime read set to be found; got ' + read.length +
    ' — the extraction above has drifted from how themeColors() is written');
  const blocks = themeBlocks('assets/tokens.css', 10);
  assert.equal(blocks.length, 4, 'tokens.css should carry exactly four theme blocks ' +
    '(:root light, the dark @media, and both [data-theme] overrides); found ' + blocks.length);
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
