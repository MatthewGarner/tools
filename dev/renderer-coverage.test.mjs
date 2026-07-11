/* Meta-test: every SVG renderer on disk must be exercised by dev/injection.test.mjs.
   CLAUDE.md states the invariant in prose ("every renderer must pass
   dev/injection.test.mjs — new renderers get added to its corpus loop"); this makes
   it self-enforcing. Discovers renderers via top-level render(dot)js files, plus
   nested energy/<tool>/render(dot)js ones, under the repo root, reads
   injection.test.mjs as source text, and fails naming any renderer file that isn't
   reached by an import(...)/from '...' specifier there. */
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync, readdirSync, statSync} from 'node:fs';
import {join} from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname;
const EXCLUDE = new Set(['node_modules', 'vendor']);

/* Renderers deliberately excluded from the injection corpus. Empty today — every
   renderer added since (fermi driver/cashflow, flow) is covered. Adding a path here
   requires a comment explaining why the corpus can't reach it (e.g. no text surface
   at all, or genuinely dead code slated for removal) — an empty reason is not enough. */
const ALLOW = new Set([
  // 'tool/render-example.js' — reason required here before adding an entry
]);

const isDir = rel => statSync(join(ROOT, rel)).isDirectory();
const renderersIn = dir => readdirSync(join(ROOT, dir))
  .filter(f => /^render.*\.js$/.test(f) && !EXCLUDE.has(f))
  .map(f => dir + '/' + f);

function discoverRenderers(){
  const out = [];
  for(const top of readdirSync(ROOT)){
    if(EXCLUDE.has(top) || top.startsWith('.') || !isDir(top)) continue;
    out.push(...renderersIn(top));
    if(top === 'energy'){
      for(const sub of readdirSync(join(ROOT, top))){
        const rel = top + '/' + sub;
        if(EXCLUDE.has(sub) || !isDir(rel)) continue;
        out.push(...renderersIn(rel));
      }
    }
  }
  return out.sort();
}

/* Same relative-import resolver as weight.test.mjs's moduleGraph, so a renderer's
   repo-relative path (e.g. 'fermi/render-driver.js') matches however the test
   file's import specifier is written (e.g. '../fermi/render-driver.js'). */
function resolveRef(fromDir, ref){
  if(ref.startsWith('/')) return ref.slice(1);
  const parts = (fromDir + '/' + ref).split('/');
  const out = [];
  for(const part of parts){
    if(part === '.' || part === '') continue;
    else if(part === '..') out.pop();
    else out.push(part);
  }
  return out.join('/');
}

function importedRenderers(){
  const src = readFileSync(join(ROOT, 'dev/injection.test.mjs'), 'utf8');
  const out = new Set();
  for(const m of src.matchAll(/(?:import\(|from\s+)\s*['"]([^'"]+\.js)['"]/g))
    out.add(resolveRef('dev', m[1]));
  return out;
}

test('every renderer on disk is exercised by dev/injection.test.mjs (or explicitly, reasoned-ly allowed)', () => {
  const renderers = discoverRenderers();
  assert.ok(renderers.length > 0, 'discovery found no renderers — the walk itself is broken');
  const imported = importedRenderers();
  const missing = renderers.filter(r => !imported.has(r) && !ALLOW.has(r));
  assert.deepEqual(missing, [],
    'renderer(s) not in the injection corpus (dev/injection.test.mjs): ' + missing.join(', '));
});

test('ALLOW does not list a renderer that could just be covered', () => {
  const renderers = new Set(discoverRenderers());
  const stale = [...ALLOW].filter(a => !renderers.has(a));
  assert.deepEqual(stale, [], 'ALLOW entries pointing at files that no longer exist: ' + stale.join(', '));
});
