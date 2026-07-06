/* Static dev server that applies the SAME headers vercel.json ships (CSP
   included), so the browser suites prove CSP compatibility locally.
   Usage: node dev/serve.mjs [port]   (default 8087, prints "serving") */
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {readFileSync} from 'node:fs';
import {extname, join, normalize} from 'node:path';
import {fileURLToPath} from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const PORT = Number(process.argv[2]) || 8087;
const HEADERS = Object.fromEntries(
  JSON.parse(readFileSync(join(ROOT, 'vercel.json'), 'utf8'))
    .headers[0].headers.map(h => [h.key, h.value]));
const MIME = {'.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript',
  '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png',
  '.json': 'application/json', '.webmanifest': 'application/manifest+json'};

createServer(async (req, res) => {
  let p = normalize(new URL(req.url, 'http://x').pathname).replace(/^(\.\.[/\\])+/, '');
  if(p.endsWith('/')) p += 'index.html';
  try{
    const data = await readFile(join(ROOT, p));
    res.writeHead(200, {'Content-Type': MIME[extname(p)] || 'application/octet-stream', ...HEADERS});
    res.end(data);
  }catch(e){
    res.writeHead(404, HEADERS);
    res.end('not found');
  }
}).listen(PORT, () => console.log('serving ' + ROOT + ' on ' + PORT + ' with production headers'));
