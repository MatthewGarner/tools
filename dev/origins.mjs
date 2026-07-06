/* Single source of truth for the energy origin's path map. vercel.json's
   host-conditioned rewrites, serve.mjs's local emulation and gen-sw's energy
   precache list all derive from this table (origins.test.mjs enforces).
   Deliberately NO catch-all: /assets/* must keep resolving unrewritten.
   Every new energy tool adds one prefix row here + the matching vercel.json
   rewrite (the test tells you the exact shape). */
export const ENERGY_HOST = 'energy.matthewgarner.me';

export const ENERGY_ROUTES = [
  {from: '/risk/', to: '/energy/risk/'},
  {from: '/icons/', to: '/energy/icons/'},
  {from: '/', to: '/energy/', exact: true},
  {from: '/sw.js', to: '/energy/sw.js', exact: true},
  {from: '/manifest.webmanifest', to: '/energy/manifest.webmanifest', exact: true},
];

/* energy-origin request path → repo path; unmapped paths pass through (/assets/…) */
export function toRepoPath(p){
  for(const r of ENERGY_ROUTES){
    if(r.exact){ if(p === r.from) return r.to; }
    else if(p.startsWith(r.from)) return r.to + p.slice(r.from.length);
  }
  return p;
}

/* repo path → URL as served on the energy origin; null = repo file not exposed
   there (an energy/ file with no route — the precache test will surface it) */
export function toOriginUrl(repo){
  if(!repo.startsWith('/energy/')) return repo;
  for(const r of ENERGY_ROUTES){
    if(r.exact){ if(repo === r.to) return r.from; }
    else if(repo.startsWith(r.to)) return r.from + repo.slice(r.to.length);
  }
  return null;
}

/* the vercel.json rewrite entries this table implies (test asserts equality) */
export function vercelRewrites(){
  return ENERGY_ROUTES.map(r => ({
    source: r.exact ? r.from : r.from + ':path*',
    has: [{type: 'host', value: ENERGY_HOST}],
    destination: r.exact ? r.to : r.to + ':path*',
  }));
}
