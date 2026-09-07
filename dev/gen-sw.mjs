/* Generates content-addressed, complete static releases for both origins.
   Run after changing any shipped file: node dev/gen-sw.mjs. */
import {readFileSync, writeFileSync, readdirSync, statSync} from 'node:fs';
import {join} from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {Script} from 'node:vm';
import {toOriginUrl, toRepoPath, toToolsPath} from './origins.mjs';
import {TOOL_DIRS} from './tool-dirs.mjs';
import {generateWorker, integrity} from './sw-release.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
function walk(dir, out = []){
  for(const f of readdirSync(join(ROOT, dir)).sort()){
    if(f === 'tests' || f === 'node_modules') continue;
    const rel = dir + '/' + f;
    if(statSync(join(ROOT, rel)).isDirectory()) walk(rel, out);
    else if(/\.(js|css|html|png|woff2)$/.test(f) && !f.endsWith('.test.mjs'))
      out.push(('/' + rel).replace('/index.html', '/'));
  }
  return out;
}

export function workers(){
  return [
    {file: 'home/sw.js', prefix: 'tools', dirs: [...TOOL_DIRS, 'assets'], map: u => u, repo: toToolsPath},
    {file: 'energy/sw.js', prefix: 'energy', dirs: ['energy', 'assets', 'roadmap/vendor'], map: toOriginUrl, repo: toRepoPath},
  ].map(({file, prefix, dirs, map, repo}) => {
    const urls = [...new Set(['/', '/manifest.webmanifest', ...dirs.flatMap(d => walk(d))
      .map(map).filter(u => u !== null && u !== '/sw.js')])];
    const entries = urls.map(url => {
      const path = repo(url);
      return {url, integrity: integrity(readFileSync(join(ROOT, path.endsWith('/') ? path + 'index.html' : path)))};
    });
    return {file, source: generateWorker(prefix, entries), count: urls.length};
  });
}

if(process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href){
  for(const {file, source, count} of workers()){
    new Script(source, {filename: file});
    writeFileSync(join(ROOT, file), source);
    console.log(file + ': ' + count + ' integrity-checked urls');
  }
}
