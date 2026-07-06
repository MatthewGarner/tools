/* Single source of truth for the two-origin path map. vercel.json's rewrites,
   serve.mjs's emulation and gen-sw's precache lists all derive from this table
   (origins.test.mjs enforces).

   Production facts baked in (2026-07-06):
   - Vercel serves the FILESYSTEM before rewrites: a rewrite whose source path
     collides with a real file never fires. So the tools root trio lives in
     home/ (no root index.html/sw.js/manifest.webmanifest), served back by the
     unconditioned FALLBACK rows — previews (*.vercel.app) match no host and
     get the fallback too, i.e. previews behave as the tools origin.
   - `:path*` does not match the bare trailing-slash URL, so prefix routes
     emit an exact `/x/` row alongside `/x/:path*` (vercelRewrites does this).
   - Deliberately NO catch-all: /assets/* (and tool dirs) resolve unrewritten.
   Every new energy tool adds one prefix row here + the matching vercel.json
   rows (the test prints the exact shape). */
export const ENERGY_HOST = 'energy.matthewgarner.me';
export const TOOLS_HOST = 'tools.matthewgarner.me';

export const ENERGY_ROUTES = [
  {from: '/risk/', to: '/energy/risk/'},
  {from: '/icons/', to: '/energy/icons/'},
  {from: '/', to: '/energy/', exact: true},
  {from: '/sw.js', to: '/energy/sw.js', exact: true},
  {from: '/manifest.webmanifest', to: '/energy/manifest.webmanifest', exact: true},
];

/* the tools origin's (and previews') view of the relocated root trio */
export const FALLBACK_ROUTES = [
  {from: '/', to: '/home/', exact: true},
  {from: '/sw.js', to: '/home/sw.js', exact: true},
  {from: '/manifest.webmanifest', to: '/home/manifest.webmanifest', exact: true},
];

function applyRoutes(routes, p){
  for(const r of routes){
    if(r.exact){ if(p === r.from) return r.to; }
    else if(p.startsWith(r.from)) return r.to + p.slice(r.from.length);
  }
  return p;
}

/* energy-origin request path → repo path; unmapped paths pass through (/assets/…) */
export function toRepoPath(p){ return applyRoutes(ENERGY_ROUTES, p); }

/* tools-origin (and preview) request path → repo path */
export function toToolsPath(p){ return applyRoutes(FALLBACK_ROUTES, p); }

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

/* the vercel.json rewrite entries the tables imply (test asserts equality):
   host-conditioned energy rows first (prefix routes get an exact `/x/` row
   AND a `/x/:path*` row), then the unconditioned fallback trio */
export function vercelRewrites(){
  const energy = ENERGY_ROUTES.flatMap(r => {
    const has = [{type: 'host', value: ENERGY_HOST}];
    if(r.exact) return [{source: r.from, has, destination: r.to}];
    return [
      {source: r.from, has, destination: r.to},
      {source: r.from + ':path*', has, destination: r.to + ':path*'},
    ];
  });
  const fallback = FALLBACK_ROUTES.map(r => ({source: r.from, destination: r.to}));
  return [...energy, ...fallback];
}
