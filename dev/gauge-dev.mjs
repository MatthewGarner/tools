/* Local gauge stack: repo static files + the relay logic on an in-memory KV.
   Usage: node dev/gauge-dev.mjs [port]   (default 8090; prints "gauge dev listening") */
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {extname, join, normalize} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createSession, putResponse, getSession, reveal} from '../api/gauge/_lib.js';
import {memoryKv} from '../api/gauge/_kv.js';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const PORT = Number(process.argv[2]) || 8090;
const kv = memoryKv();
const MIME = {'.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript',
  '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.json': 'application/json'};

const routes = [
  {m: 'POST', re: /^\/api\/gauge$/, fn: (mm, body, ip) => createSession(kv, body, ip)},
  {m: 'GET', re: /^\/api\/gauge\/([0-9a-f]+)$/, fn: mm => getSession(kv, mm[1])},
  {m: 'PUT', re: /^\/api\/gauge\/([0-9a-f]+)\/response$/, fn: (mm, body, ip) => putResponse(kv, mm[1], body, ip)},
  {m: 'POST', re: /^\/api\/gauge\/([0-9a-f]+)\/reveal$/, fn: (mm, body) => reveal(kv, mm[1], body)},
];

createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  const route = routes.find(r => r.m === req.method && r.re.test(url.pathname));
  if(route){
    let body = null;
    try{
      const chunks = [];
      for await (const c of req) chunks.push(c);
      const raw = Buffer.concat(chunks).toString();
      if(raw) body = JSON.parse(raw);
    }catch(e){
      res.writeHead(400, {'Content-Type': 'application/json'});
      return res.end('{"error":"bad json"}');
    }
    const ip = (String(req.headers['x-forwarded-for'] || '').split(',')[0].trim()) || 'local';
    const out = await route.fn(url.pathname.match(route.re), body, ip);
    res.writeHead(out.status, {'Content-Type': 'application/json'});
    return res.end(JSON.stringify(out.body));
  }
  /* static */
  let p = normalize(url.pathname).replace(/^(\.\.[/\\])+/, '');
  if(p.endsWith('/')) p += 'index.html';
  try{
    const data = await readFile(join(ROOT, p));
    res.writeHead(200, {'Content-Type': MIME[extname(p)] || 'application/octet-stream'});
    res.end(data);
  }catch(e){
    res.writeHead(404); res.end('not found');
  }
}).listen(PORT, () => console.log('gauge dev listening on ' + PORT));
