/* Static dev server that applies the headers vercel.json ships (CSP included),
   adding only explicit local article origins to embed framing permission.
   Usage: node dev/serve.mjs [port]              (default 8087, prints "serving")
          node dev/serve.mjs [port] --origin=energy   serves the repo AS the
   energy origin: request paths map through origins.mjs exactly as vercel.json's
   host-conditioned rewrites do in production. */
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {extname, join, normalize} from 'node:path';
import {fileURLToPath} from 'node:url';
import {toRepoPath, toToolsPath, energyRedirectSources, toolRedirectSources} from './origins.mjs';
import {responseHeaders} from './response-headers.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const PORT = process.argv[2] === undefined ? 8087 : Number(process.argv[2]);
if(!Number.isInteger(PORT) || PORT < 0 || PORT > 65535) throw new Error('Invalid server port');
const ORIGIN_ENERGY = process.argv.includes('--origin=energy');
/* when launched by dev/pw/run.mjs: if the parent is SIGKILLed we reparent to pid
   1 (launchd/init) — poll for that and self-exit so no zombie server squats the
   port for the next run (a different worktree). unref so it never holds the loop. */
if(process.argv.includes('--exit-with-parent')){
  const parent = process.ppid;   // reparenting to ANYTHING (pid 1, or a subreaper on Linux/containers) means the launcher died
  setInterval(() => { if(process.ppid !== parent) process.exit(0); }, 2000).unref();
}
const MIME = {'.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript',
  '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png',
  '.woff2':'font/woff2', '.json': 'application/json', '.webmanifest': 'application/manifest+json'};
const ENERGY_REDIR = new Set(energyRedirectSources());   /* bare tool path → trailing-slash */
const TOOL_REDIR = new Set(toolRedirectSources());       /* bare tool path → trailing-slash */

const server = createServer(async (req, res) => {
  const requestURL=new URL(req.url,'http://x');
  let p = normalize(requestURL.pathname).replace(/^(\.\.[/\\])+/, '');
  const HEADERS = responseHeaders(p, {local:true});
  if(ORIGIN_ENERGY && ENERGY_REDIR.has(p)){   /* emulate vercel.json's no-slash redirect */
    res.writeHead(308, {Location: p + '/' + requestURL.search, ...HEADERS});
    res.end();
    return;
  }
  if(TOOL_REDIR.has(p)){
    res.writeHead(308, {Location: p + '/' + requestURL.search, ...HEADERS});
    res.end();
    return;
  }
  if(p.startsWith('/lab/dist/')){res.writeHead(308,{Location:p.replace('/lab/dist/','/lab/')+requestURL.search,...HEADERS});res.end();return;}
  p = ORIGIN_ENERGY ? toRepoPath(p) : toToolsPath(p);   /* previews = tools shape */
  if(p.endsWith('/')) p += 'index.html';
  try{
    const data = await readFile(join(ROOT, p));
    res.writeHead(200, {'Content-Type': MIME[extname(p)] || 'application/octet-stream', ...HEADERS});
    res.end(data);
  }catch(e){
    res.writeHead(404, {'Content-Type':'text/html',...HEADERS});
    res.end(await readFile(join(ROOT,'404.html')));
  }
});
server.listen(PORT, () => {
  const port = server.address().port;
  console.log('serving ' + ROOT + ' on ' + port + (ORIGIN_ENERGY ? ' as energy origin' : '') + ' with production headers and local embed parents');
  process.send?.({port});
});
