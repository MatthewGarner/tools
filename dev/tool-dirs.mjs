/* Single source of truth for the tools-origin tool directories. gen-sw's
   precache walk, pwa-precache.test's coverage check, weight.test's orphan
   check and smoke.mjs's landing sweep all derive from this — before it
   existed the list was copy-pasted ~4× and silently drifted (two lists
   forgot 'wardley', so the precache and orphan guards couldn't see the
   newest tool). Add a new tools-origin tool here in ONE place.
   Energy tools live under energy/ and are walked separately (never add
   'energy' here — the tools origin redirects /energy/* away). */
export const TOOL_DIRS = ['fermi', 'rank', 'roadmap', 'why', 'tree', 'map', 'gauge', 'flow', 'timeline', 'wardley', 'alarm', 'duel', 'premortem', 'bets', 'signal-vs-noise', 'case', 'paths'];

/* Binders sit APART from the instrument numbering (Matt, 2026-08-02): /case is
   an optional layer that BINDS instruments rather than being one — its kicker
   reads "CASE FILE — {status}", home shows it as a distinct binder band below
   the numbered index, and scaffold/kicker-index treat it as the documented
   exception (INSTRUMENTS == TOOL_DIRS minus BINDERS). */
export const BINDERS = ['case'];

/* Canonical instrument numbering — the "INSTRUMENT NN — EPITHET" kicker above
   every tool's h1 (Swiss 6b, 2026-07-30). The numbers are WAYFINDING LABELS
   only: they never appear in a URL, a filename or a route, so renumbering is a
   copy change, not a migration. Kept here rather than in prose because the set
   has to stay contiguous and collision-free across 15 pages —
   dev/scaffold.test.mjs asserts every tool paints exactly its own number.
   Energy tools take the E-series and are out of 6b's scope (Phase 6c). */
export const INSTRUMENTS = {
  roadmap: '01', timeline: '02', bets: '03', rank: '04', duel: '05',
  map: '06', tree: '07', why: '08', wardley: '09', premortem: '10',
  fermi: '11', gauge: '12', alarm: '13', flow: '14', 'signal-vs-noise': '15', paths: '16',
};

/* Single source of truth for the energy-origin tool directories (energy/<dir>/).
   Before this existed the count/list was hand-copied per suite (smoke.mjs's
   "five tool cards" check, pwa.mjs's cache.match chain) — add a new energy tool
   here in ONE place. Energy tools live under energy/ on disk but are served at
   the origin root (energy.matthewgarner.me/<dir>/) via dev/origins.mjs's route
   table — keep that table's ENERGY_ROUTES in sync too. */
export const ENERGY_TOOL_DIRS = ['cycles', 'risk', 'frequency', 'merit-order', 'intraday'];

/* The energy origin's E-series numbering — same job as INSTRUMENTS above (the
   "INSTRUMENT E5 — EPITHET" kicker), and the same promise: WAYFINDING LABELS
   only, never a URL, filename or route. The order is the reading order the
   masthead nav prints, and it runs from the asset outwards: the battery's own
   life budget (E1), the contract wrapped around it (E2), the grid it answers
   to in seconds (E3), the market that prices it (E4), and one whole trading
   day where all four meet (E5). dev/scaffold.test.mjs asserts every energy page
   paints its own number in the kicker AND lists the full series, in this order,
   in its masthead nav — so the row can't drift page to page. */
export const ENERGY_INSTRUMENTS = {
  cycles: 'E1', risk: 'E2', frequency: 'E3', 'merit-order': 'E4', intraday: 'E5',
};
