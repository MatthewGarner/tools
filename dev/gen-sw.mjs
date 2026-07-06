/* Regenerates both service workers' PRECACHE from the filesystem — sw.js (tools
   origin) and energy/sw.js (energy origin, URLs mapped through origins.mjs).
   Run after adding any shipped file: node dev/gen-sw.mjs
   (dev/pwa-precache.test.mjs enforces). */
import {readFileSync, writeFileSync, readdirSync, statSync} from 'node:fs';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {Script} from 'node:vm';
import {toOriginUrl} from './origins.mjs';

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

function patch(file, prefix, urls){
  const hash = createHash('sha256').update(urls.join('\n')).digest('hex').slice(0, 10);
  const sw = readFileSync(join(ROOT, file), 'utf8')
    .replace(new RegExp("const CACHE = '" + prefix + "-[^']*';"),
      "const CACHE = '" + prefix + '-' + hash + "';")
    .replace(/const PRECACHE = \[[^\]]*\];/, 'const PRECACHE = [\n  ' +
      urls.map(u => "'" + u + "'").join(',\n  ') + '\n];');
  /* in-place patching means anything broken outside the two replaced regions
     (e.g. merge conflict markers) would be written back — refuse instead */
  new Script(sw, {filename: file});
  writeFileSync(join(ROOT, file), sw);
  console.log(file + ': ' + urls.length + ' urls, cache ' + prefix + '-' + hash);
}

const urls = [...new Set(['/', '/manifest.webmanifest', ...KEEP.flatMap(d => walk(d))])].sort();
patch('home/sw.js', 'tools', urls);

/* energy origin worker: same walk, mapped through the origin's path table.
   (KEEP must NOT gain 'energy' — the tools origin redirects /energy/* away.) */
const eUrls = [...new Set(['/', '/manifest.webmanifest',
  ...['energy', 'assets', 'roadmap/vendor'].flatMap(d => walk(d))
    .map(f => toOriginUrl(f))
    .filter(u => u !== null && u !== '/sw.js' && u !== '/manifest.webmanifest')])].sort();
patch('energy/sw.js', 'energy', eUrls);
