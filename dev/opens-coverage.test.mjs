/* Meta-test (the renderer-coverage pattern): every card-menu row that names an
   edit-in-place kind — `opens: '<kind>'` — must name a kind the SAME tool
   actually registers in its attachEditInPlace kinds map. A row naming an
   unwired kind is a dead control: since the unset-field fallback (2026-08-05,
   b35f2de) it announces rather than silently no-ops, but it still does
   nothing — and nothing but this file would catch it before a user does.

   Two shared modules imply kinds without an `opens:` literal in the tool dir:
   assets/verdict-edit.js's menu opens 'verdictedit' for every importer of
   verdictMenuRows, and assets/edit-in-place.js's cardMenu() builds a
   Rename… row that opens 'label'. Both are added to the importer's demand set.

   The registration check is a word-boundary scan of the tool's app.js for the
   kind as an object key — loose on purpose (a full parse would be a second
   parser to drift); a false PASS needs the exact kind name as a key outside
   the kinds map, which no tool does today. */
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync, readdirSync} from 'node:fs';
import {join} from 'node:path';
import {TOOL_DIRS, ENERGY_TOOL_DIRS} from './tool-dirs.mjs';

const ROOT = new URL('..', import.meta.url).pathname;

/* kinds a dir may demand without registering — name: reason (empty today; a
   new exception needs its why written here, not a silent skip) */
const ALLOW = {};

const dirs = [...TOOL_DIRS, ...ENERGY_TOOL_DIRS.map(d => 'energy/' + d)];

function jsFiles(dir){
  return readdirSync(join(ROOT, dir), {withFileTypes: true})
    .filter(e => e.isFile() && e.name.endsWith('.js'))
    .map(e => join(dir, e.name));
}

test('every opens: row names a kind its tool registers', () => {
  for(const dir of dirs){
    const files = jsFiles(dir).map(f => ({f, src: readFileSync(join(ROOT, f), 'utf8')}));
    const app = files.find(x => x.f.endsWith('/app.js'));
    const demanded = new Map();   // kind -> first file demanding it
    for(const {f, src} of files){
      for(const m of src.matchAll(/opens:\s*'([a-z-]+)'/g))
        if(!demanded.has(m[1])) demanded.set(m[1], f);
      if(/\bverdictMenuRows\b/.test(src) && !demanded.has('verdictedit'))
        demanded.set('verdictedit', f + ' (via assets/verdict-edit.js)');
      if(/\bcardMenu\(/.test(src) && !demanded.has('label'))
        demanded.set('label', f + ' (via cardMenu Rename…)');
    }
    if(!demanded.size) continue;
    assert.ok(app, dir + ' demands eip kinds but has no app.js to register them');
    for(const [kind, from] of demanded){
      if(kind in ALLOW) continue;
      const registered = new RegExp("(^|[{,\\s'])" + kind + "'?\\s*:", 'm').test(app.src);
      assert.ok(registered,
        dir + ': menu row opens \'' + kind + '\' (' + from + ') but app.js never ' +
        'registers that kind — the row is a dead control');
    }
  }
});

test('the ALLOW set only names kinds that are really demanded', () => {
  const all = new Set();
  for(const dir of dirs)
    for(const {src} of jsFiles(dir).map(f => ({src: readFileSync(join(ROOT, f), 'utf8')})))
      for(const m of src.matchAll(/opens:\s*'([a-z-]+)'/g)) all.add(m[1]);
  for(const kind of Object.keys(ALLOW))
    assert.ok(all.has(kind), 'ALLOW lists "' + kind + '" but no tool demands it — stale entry');
});
