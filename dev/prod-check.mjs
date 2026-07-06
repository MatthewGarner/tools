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

console.log(out.join('\n'));
process.exit(out.some(r => r.startsWith('FAIL')) ? 1 : 0);
