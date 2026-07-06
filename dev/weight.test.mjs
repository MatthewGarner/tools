/* Bloat tripwires: (a) each page's real load — html + css + its full module
   graph — stays under budget; (b) every shipped .js file is reachable from
   some page (orphans fail). Budgets are ~25% above today's actuals: they trip
   on creep, not on honest features. */
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync, readdirSync, statSync} from 'node:fs';
import {join} from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname;
const read = p => readFileSync(join(ROOT, p), 'utf8');
const size = p => statSync(join(ROOT, p)).size;

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
function moduleGraph(entry, seen = new Set()){
  if(seen.has(entry)) return seen;
  seen.add(entry);
  const dir = entry.split('/').slice(0, -1).join('/');
  const src = read(entry);
  for(const m of src.matchAll(/(?:import[^'"]*|from\s*|import\()\s*['"]([^'"]+)['"]/g)){
    if(m[1].endsWith('.js')) moduleGraph(resolveRef(dir, m[1]), seen);
  }
  return seen;
}
function pageLoad(page){
  const dir = page.split('/').slice(0, -1).join('/');
  const html = read(page);
  const files = new Set([page]);
  for(const m of html.matchAll(/<script[^>]*src="([^"]+)"/g))
    moduleGraph(resolveRef(dir, m[1]), files);
  for(const m of html.matchAll(/<link rel="stylesheet" href="([^"]+)"/g))
    files.add(resolveRef(dir, m[1]));
  return files;
}

const PAGES = {
  'home/index.html': 40_000,
  'fermi/index.html': 120_000, 'rank/index.html': 90_000, 'flow/index.html': 90_000,
  'roadmap/index.html': 480_000, 'why/index.html': 470_000, 'tree/index.html': 470_000,
  'map/index.html': 480_000, 'gauge/index.html': 470_000, 'timeline/index.html': 470_000,
  'energy/index.html': 40_000, 'energy/risk/index.html': 470_000, 'energy/cycles/index.html': 470_000,
};

test('per-page load stays under budget', () => {
  for(const [page, budget] of Object.entries(PAGES)){
    const bytes = [...pageLoad(page)].reduce((a, f) => a + size(f), 0);
    assert.ok(bytes <= budget, page + ': ' + bytes + ' bytes > budget ' + budget);
  }
});

test('no orphaned shipped modules', () => {
  const reachable = new Set();
  for(const page of Object.keys(PAGES)) for(const f of pageLoad(page)) reachable.add(f);
  ['home/sw.js', 'energy/sw.js', 'assets/pwa.js'].forEach(f => reachable.add(f));
  const orphans = [];
  const DIRS = ['fermi', 'rank', 'roadmap', 'why', 'tree', 'map', 'gauge', 'flow', 'timeline', 'energy', 'home', 'assets'];
  for(const d of DIRS){
    (function walk(dir){
      for(const f of readdirSync(join(ROOT, dir))){
        if(f === 'tests' || f === 'node_modules') continue;
        const rel = dir + '/' + f;
        if(statSync(join(ROOT, rel)).isDirectory()) walk(rel);
        else if(f.endsWith('.js') && !f.endsWith('.test.mjs') && !reachable.has(rel)) orphans.push(rel);
      }
    })(d);
  }
  assert.deepEqual(orphans, [], 'unreachable shipped modules: ' + orphans.join(', '));
});
