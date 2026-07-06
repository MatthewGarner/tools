/* Every shipped page/module/stylesheet must be in the service worker's PRECACHE
   list, or the installed app silently loses offline support for that file the
   day it ships. Walks the same directories the generator does. */
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync, readdirSync, statSync} from 'node:fs';
import {join} from 'node:path';
import {Script} from 'node:vm';

const ROOT = new URL('..', import.meta.url).pathname;
const KEEP = ['fermi', 'rank', 'roadmap', 'why', 'tree', 'map', 'gauge', 'flow', 'timeline', 'assets'];

function walk(dir, out = []){
  for(const f of readdirSync(join(ROOT, dir))){
    if(f === 'tests' || f === 'node_modules') continue;
    const rel = dir + '/' + f;
    if(statSync(join(ROOT, rel)).isDirectory()) walk(rel, out);
    else if(/\.(js|css|html|png)$/.test(f) && !f.endsWith('.test.mjs'))
      out.push(('/' + rel).replace('/index.html', '/'));
  }
  return out;
}

test('sw.js precaches every shipped file (regenerate the list when this fails)', () => {
  const sw = readFileSync(join(ROOT, 'sw.js'), 'utf8');
  const listed = new Set([...sw.matchAll(/'(\/[^']*)'/g)].map(m => m[1]));
  const missing = KEEP.flatMap(d => walk(d)).filter(u => !listed.has(u));
  assert.deepEqual(missing, [], 'missing from PRECACHE: ' + missing.join(', '));
  assert.ok(listed.has('/') && listed.has('/manifest.webmanifest'));
});

/* gen-sw patches sw.js in place, so a merge conflict outside the PRECACHE block
   survives regeneration — shipped broken once (2026-07-06): the regex scan above
   passed while the worker failed evaluation on every page. Actually parse it. */
test('sw.js compiles as a script', () => {
  const sw = readFileSync(join(ROOT, 'sw.js'), 'utf8');
  assert.ok(!sw.includes('<<<<<<<'), 'sw.js contains merge conflict markers');
  new Script(sw, {filename: 'sw.js'});   // throws on any syntax error
});
