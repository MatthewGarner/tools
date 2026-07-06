/* One-shot post-deploy probe (run after every prod confirm — the deploy ritual):
   headers, PWA plumbing, and a real relay round-trip against Upstash. The relay
   is the only piece that can rot invisibly. Usage: node dev/prod-check.mjs */
import {createHash, randomBytes} from 'node:crypto';

const BASE = 'https://tools.matthewgarner.me';
const out = [];
const check = (n, ok) => out.push((ok ? 'PASS ' : 'FAIL ') + n);

const home = await fetch(BASE + '/');
check('homepage 200', home.status === 200);
check('CSP header present', (home.headers.get('content-security-policy') || '').includes("script-src 'self'"));
check('nosniff', home.headers.get('x-content-type-options') === 'nosniff');
check('sw.js served', (await fetch(BASE + '/sw.js')).status === 200);
check('manifest served', (await fetch(BASE + '/manifest.webmanifest')).status === 200);

const hex = n => randomBytes(n).toString('hex');
const id = hex(16), key = hex(16);
const call = (m, p, b) => fetch(BASE + '/api/gauge' + p, {method: m,
  headers: b ? {'content-type': 'application/json'} : undefined,
  body: b ? JSON.stringify(b) : undefined}).then(r => r.status);
check('relay create', await call('POST', '', {id, keyHash: createHash('sha256').update(key).digest('hex'), names: false}) === 200);
check('relay submit', await call('PUT', '/' + id + '/response', {participantId: hex(8), values: [50]}) === 200);
check('relay reveal', await call('POST', '/' + id + '/reveal', {key}) === 200);
check('relay cleanup', await call('POST', '/' + id + '/end', {key}) === 200);

/* energy origin (fails until the DNS record + Vercel domain exist — that's the point) */
const EBASE = 'https://energy.matthewgarner.me';
try{
  const eh = await fetch(EBASE + '/');
  check('energy homepage 200', eh.status === 200);
  check('energy CSP header', (eh.headers.get('content-security-policy') || '').includes("script-src 'self'"));
  check('energy sw.js served', (await fetch(EBASE + '/sw.js')).status === 200);
  const em = await (await fetch(EBASE + '/manifest.webmanifest')).json();
  check('energy manifest is the energy app', em.short_name === 'Energy tools');
  check('energy /risk/ 200', (await fetch(EBASE + '/risk/')).status === 200);
  const red = await fetch('https://tools.matthewgarner.me/energy/', {redirect: 'manual'});
  check('tools /energy/* redirects to energy origin',
    (red.headers.get('location') || '').startsWith(EBASE));
}catch(e){ check('energy origin reachable (DNS live?)', false); }

console.log(out.join('\n'));
process.exit(out.some(r => r.startsWith('FAIL')) ? 1 : 0);
