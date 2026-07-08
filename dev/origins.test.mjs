/* The two-origin path map has one source of truth: origins.mjs. vercel.json's
   rewrites, serve.mjs's emulation and gen-sw's precache lists all derive from
   it — this test makes drift a failure, not a production surprise.

   Two production facts this encodes (learned the hard way, 2026-07-06):
   - Vercel serves the FILESYSTEM before rewrites, so a rewrite whose source
     collides with a real file never fires. The tools root trio (/, /sw.js,
     /manifest.webmanifest) therefore lives in home/ and is served back by
     unconditioned fallback rewrites (which previews also get).
   - `:path*` sources do NOT match the bare trailing-slash URL, so every
     prefix route emits an exact `/x/` row alongside `/x/:path*`. */
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {ENERGY_HOST, toRepoPath, toToolsPath, toOriginUrl, vercelRewrites,
  vercelRedirects, energyRedirectSources} from './origins.mjs';

const ROOT = new URL('..', import.meta.url).pathname;
const vercel = JSON.parse(readFileSync(ROOT + 'vercel.json', 'utf8'));

test('vercel.json rewrites are exactly what origins.mjs defines, in order', () => {
  assert.deepEqual(vercel.rewrites, vercelRewrites());
});

test('energy rows precede the unconditioned fallback rows', () => {
  const rows = vercelRewrites();
  const lastEnergy = rows.map(r => !!r.has).lastIndexOf(true);
  const firstFallback = rows.map(r => !!r.has).indexOf(false);
  assert.ok(lastEnergy < firstFallback, 'fallback rows must come after all host-conditioned rows');
});

test('prefix routes emit both an exact trailing-slash row and a :path* row', () => {
  const sources = vercelRewrites().filter(r => r.has).map(r => r.source);
  assert.ok(sources.includes('/risk/') && sources.includes('/risk/:path*'));
  assert.ok(sources.includes('/cycles/') && sources.includes('/cycles/:path*'));
});

test('tools origin redirects /energy/* (including the bare slash form)', () => {
  const reds = (vercel.redirects || []).filter(r => r.source.startsWith('/energy'));
  assert.deepEqual(reds.map(r => r.source).sort(), ['/energy/', '/energy/:path*']);
  for(const r of reds){
    assert.deepEqual(r.has, [{type: 'host', value: 'tools.matthewgarner.me'}]);
    assert.ok(r.destination.startsWith('https://' + ENERGY_HOST + '/'));
  }
});

test('energy tool paths redirect bare → trailing-slash (no-slash asset-404 bug)', () => {
  // /risk, /cycles, /frequency — but NOT /icons (asset dir) or the exact rows
  assert.deepEqual(energyRedirectSources().slice().sort(), ['/cycles', '/frequency', '/risk']);
  const inVercel = (vercel.redirects || []).filter(r => energyRedirectSources().includes(r.source));
  assert.deepEqual(inVercel, vercelRedirects());
  for(const r of vercelRedirects()){
    assert.deepEqual(r.has, [{type: 'host', value: ENERGY_HOST}]);
    assert.equal(r.destination, r.source + '/');   // canonical trailing-slash form
  }
});

test('toRepoPath maps energy-origin paths and passes shared paths through', () => {
  assert.equal(toRepoPath('/'), '/energy/');
  assert.equal(toRepoPath('/risk/'), '/energy/risk/');
  assert.equal(toRepoPath('/risk/app.js'), '/energy/risk/app.js');
  assert.equal(toRepoPath('/cycles/'), '/energy/cycles/');
  assert.equal(toRepoPath('/cycles/app.js'), '/energy/cycles/app.js');
  assert.equal(toRepoPath('/sw.js'), '/energy/sw.js');
  assert.equal(toRepoPath('/manifest.webmanifest'), '/energy/manifest.webmanifest');
  assert.equal(toRepoPath('/icons/icon-192.png'), '/energy/icons/icon-192.png');
  assert.equal(toRepoPath('/assets/series.js'), '/assets/series.js');
});

test('toToolsPath serves the relocated root trio and passes everything else through', () => {
  assert.equal(toToolsPath('/'), '/home/');
  assert.equal(toToolsPath('/sw.js'), '/home/sw.js');
  assert.equal(toToolsPath('/manifest.webmanifest'), '/home/manifest.webmanifest');
  assert.equal(toToolsPath('/fermi/'), '/fermi/');
  assert.equal(toToolsPath('/assets/series.js'), '/assets/series.js');
});

test('toOriginUrl inverts toRepoPath for exposed files', () => {
  for(const p of ['/', '/risk/', '/risk/app.js', '/sw.js', '/manifest.webmanifest',
                  '/icons/icon-192.png', '/assets/tokens.css'])
    assert.equal(toOriginUrl(toRepoPath(p)), p);
  assert.equal(toOriginUrl('/energy/unrouted-dir/x.js'), null);
});
