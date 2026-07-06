/* The energy origin's path map has one source of truth: origins.mjs. vercel.json's
   rewrites, serve.mjs's emulation and gen-sw's energy precache all derive from it —
   this test makes three-way drift a failure, not a production surprise. */
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {ENERGY_HOST, toRepoPath, toOriginUrl, vercelRewrites} from './origins.mjs';

const ROOT = new URL('..', import.meta.url).pathname;
const vercel = JSON.parse(readFileSync(ROOT + 'vercel.json', 'utf8'));

test('vercel.json carries exactly the rewrites origins.mjs defines', () => {
  const hosted = (vercel.rewrites || []).filter(r =>
    (r.has || []).some(h => h.type === 'host' && h.value === ENERGY_HOST));
  assert.deepEqual(hosted, vercelRewrites());
});

test('tools origin redirects /energy/* to the energy origin', () => {
  const r = (vercel.redirects || []).find(r => r.source === '/energy/:path*');
  assert.ok(r, 'missing /energy/:path* redirect');
  assert.deepEqual(r.has, [{type: 'host', value: 'tools.matthewgarner.me'}]);
  assert.equal(r.destination, 'https://' + ENERGY_HOST + '/:path*');
});

test('toRepoPath maps energy-origin paths and passes shared paths through', () => {
  assert.equal(toRepoPath('/'), '/energy/');
  assert.equal(toRepoPath('/risk/'), '/energy/risk/');
  assert.equal(toRepoPath('/risk/app.js'), '/energy/risk/app.js');
  assert.equal(toRepoPath('/sw.js'), '/energy/sw.js');
  assert.equal(toRepoPath('/manifest.webmanifest'), '/energy/manifest.webmanifest');
  assert.equal(toRepoPath('/icons/icon-192.png'), '/energy/icons/icon-192.png');
  assert.equal(toRepoPath('/assets/series.js'), '/assets/series.js');
});

test('toOriginUrl inverts toRepoPath for exposed files', () => {
  for(const p of ['/', '/risk/', '/risk/app.js', '/sw.js', '/manifest.webmanifest',
                  '/icons/icon-192.png', '/assets/tokens.css'])
    assert.equal(toOriginUrl(toRepoPath(p)), p);
  assert.equal(toOriginUrl('/energy/unrouted-dir/x.js'), null);
});
