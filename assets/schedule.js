/* Shared typing-latency scheduling (extracted 2026-07-11): the debounced-
   input -> rAF-batched-refresh pipeline copy-pasted across the DSL shells
   (keystroke -> debounce(120ms) -> single-flight rAF -> render). Both
   primitives are cancel-and-replace, not queue: a burst of calls collapses
   to one eventual execution, matching what every shell hand-rolled with its
   own debTimer/rafId variables.

   Each shell's hash-write timer is a THIRD, separate concern (background
   URL persistence, off the visible render path) and is deliberately not
   folded in here where it shares one timer across two different delays
   (a typing-triggered 400ms write and a collapse-toggle 100ms write) —
   that shape doesn't fit a single fixed-ms debounced() instance, so those
   shells keep their local clearTimeout/setTimeout for it. Where a shell's
   hash-write is a single clean fixed-delay call site, `debounced` covers it
   fine — see flow/app.js. */

export function debounced(fn, ms){
  let t = null;
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
}

export function rafBatched(fn){
  let id = 0;
  return (...args) => { cancelAnimationFrame(id); id = requestAnimationFrame(() => fn(...args)); };
}
