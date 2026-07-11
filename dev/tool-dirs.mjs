/* Single source of truth for the tools-origin tool directories. gen-sw's
   precache walk, pwa-precache.test's coverage check, weight.test's orphan
   check and smoke.mjs's landing sweep all derive from this — before it
   existed the list was copy-pasted ~4× and silently drifted (two lists
   forgot 'wardley', so the precache and orphan guards couldn't see the
   newest tool). Add a new tools-origin tool here in ONE place.
   Energy tools live under energy/ and are walked separately (never add
   'energy' here — the tools origin redirects /energy/* away). */
export const TOOL_DIRS = ['fermi', 'rank', 'roadmap', 'why', 'tree', 'map', 'gauge', 'flow', 'timeline', 'wardley'];
