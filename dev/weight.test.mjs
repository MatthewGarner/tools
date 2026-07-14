/* Bloat tripwires: (a) each page's real load — html + css + its full module
   graph — stays under budget; (b) every shipped .js file is reachable from
   some page (orphans fail). Budgets are ~25% above today's actuals: they trip
   on creep, not on honest features. */
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync, readdirSync, statSync} from 'node:fs';
import {join} from 'node:path';
import {TOOL_DIRS} from './tool-dirs.mjs';

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
  /* new Worker(new URL('./x.js', import.meta.url)) — a module Worker's script
     is a real load-time dependency (the browser fetches it) even though it's
     not a static import; the cycles perf fix (2026-07-12) is the first of
     these. Match it explicitly so a future worker doesn't need an orphan
     exception. */
  for(const m of src.matchAll(/new\s+Worker\(\s*new\s+URL\(\s*['"]([^'"]+)['"]/g))
    if(m[1].endsWith('.js')) moduleGraph(resolveRef(dir, m[1]), seen);
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
  'alarm/index.html': 90_000,
  'duel/index.html': 90_000,   /* no editor/CodeMirror — pure engine + render + app shell */
  'premortem/index.html': 100_000,   /* register core + store + wizard + 2 renderers + app */
  /* roadmap 480k -> 495k (2026-07-14): it is the first tool to ship a SECOND
     renderer — render-deck.js, the 16:9 export compositions. Eager, not lazy:
     app.js needs its effectiveStyle() to light the right picker chip on every
     render, so it is in the first-load graph by design. */
  'roadmap/index.html': 495_000,
  /* why 470k -> 473k (2026-07-14, roadmap spans Task 4): why/render-map.js delegates
     to roadmap/render.js, so the span mark (drawSpanItem's cap/range-label/cut-edge)
     is an honest shared-code cost why pays too, even though /why can never itself
     parse a span (it never sets timeAxis). Actual load ~471.4k, headroom ~1.6k. */
  'why/index.html': 473_000, 'tree/index.html': 470_000,
  'map/index.html': 480_000, 'gauge/index.html': 470_000, 'timeline/index.html': 470_000,
  'wardley/index.html': 480_000,
  'bets/index.html': 480_000,
  'energy/index.html': 40_000, 'energy/risk/index.html': 470_000, 'energy/cycles/index.html': 470_000,
  'energy/frequency/index.html': 470_000, 'energy/merit-order/index.html': 470_000,
  /* raised 100k -> 106k (a11y batch, 2026-07): the shared renderStack() module
     it pulls in grew real bytes (tabindex/role/aria-label on every data-plant
     block) and app.js gained a small popover focus-trap import + keydown
     handler — an honest feature cost, not creep; actual load ~102.2k. */
  /* Raised 120k → 126k (2026-07-14), consciously. intraday is the heaviest page — it
     carries BOTH the merit-order renderer and the shared motion layer — so it's the
     one that trips first when a shared module grows. Two deliberate growths pushed it
     580B over: assets/motion.js 9.1k → 11.6k (the reveal gate rewrite, which fixed six
     tools shipping blank), and the shared component-CSS/exampleChips extraction. Both
     bought correctness or de-duplication, neither is fat to trim. Headroom now ~5.4k;
     next tightest page is flow at 3.4k, so this is intraday-specific, not suite bloat. */
  'energy/intraday/index.html': 126_000,
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
  const DIRS = [...TOOL_DIRS, 'energy', 'home', 'assets'];   // was missing 'wardley' — the orphan check couldn't see the newest tool
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
