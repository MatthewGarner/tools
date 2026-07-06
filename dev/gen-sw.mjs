/* Regenerates sw.js's PRECACHE from the filesystem. Run after adding any
   shipped file: node dev/gen-sw.mjs   (dev/pwa-precache.test.mjs enforces). */
import {readFileSync, writeFileSync, readdirSync, statSync} from 'node:fs';
import {join} from 'node:path';
import {createHash} from 'node:crypto';

const ROOT = new URL('..', import.meta.url).pathname;
const KEEP = ['fermi', 'rank', 'roadmap', 'why', 'tree', 'map', 'gauge', 'flow', 'timeline', 'assets'];

function walk(dir, out = []){
  for(const f of readdirSync(join(ROOT, dir)).sort()){
    if(f === 'tests' || f === 'node_modules') continue;
    const rel = dir + '/' + f;
    if(statSync(join(ROOT, rel)).isDirectory()) walk(rel, out);
    else if(/\.(js|css|html|png)$/.test(f) && !f.endsWith('.test.mjs'))
      out.push(('/' + rel).replace('/index.html', '/'));
  }
  return out;
}

const urls = [...new Set(['/', '/manifest.webmanifest', ...KEEP.flatMap(d => walk(d))])].sort();
const hash = createHash('sha256').update(urls.join('\n')).digest('hex').slice(0, 10);
const sw = readFileSync(join(ROOT, 'sw.js'), 'utf8')
  .replace(/const CACHE = 'tools-[^']*';/, "const CACHE = 'tools-" + hash + "';")
  .replace(/const PRECACHE = \[[^\]]*\];/, 'const PRECACHE = [\n  ' +
    urls.map(u => "'" + u + "'").join(',\n  ') + '\n];');
writeFileSync(join(ROOT, 'sw.js'), sw);
console.log('sw.js: ' + urls.length + ' urls, cache tools-' + hash);
