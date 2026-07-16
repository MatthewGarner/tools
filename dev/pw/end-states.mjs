/* Shared END-STATE legibility gate — one table + one measurement, used by BOTH
   mobile.mjs (Blink/iPhone metrics) and webkit.mjs (real Safari). Lives here so the
   two suites can't drift (the tool lists drifted exactly that way until
   dev/tool-dirs.mjs; two lists silently forgot wardley).

   The gap it closes: every other phone check only sees a tool's FIRST render. A tool
   whose payoff is a distinct END-STATE reached by interaction (signal-vs-noise's
   "collapse" verdict artefact) was ungated — its collapse once shrank its footnote to
   ~6px on a phone and passed EVERY suite because none drove it there. We jump straight
   to the end-state via URL state and assert its SMALLEST on-screen text clears a floor:
   a 760px artefact shrink-to-fit into a 348px pane drops 11.5px type to ~5px, and the
   minFont assertion is the ONLY check that catches it (h-scroll/overflow both pass a
   shrink-to-fit — proved by Fable). */

const b64 = o => Buffer.from(JSON.stringify(o)).toString('base64');

/* Each entry: which origin ('T' tools | 'E' energy), the path+hash that lands on the
   end-state, the container to measure, and a READY selector that proves the end-state
   (not the first render) is what's on screen — a future engine change that silently
   filtered the URL calls would otherwise leave us measuring a legible-looking grid.
   Only SVG end-states that a shrink-to-fit can wreck belong here: duel/premortem are
   HTML (CSS-px-fixed, shrink-to-fit impossible); gauge needs the relay. */
export const END_STATES = [
  {name: 'signal-vs-noise', origin: 'T',
    path: '/signal-vs-noise/#' + b64({seed: 42, calls: [{person: 3, quarter: 3}, {person: 5, quarter: 4}]}),
    sel: '#stage', readySel: '#endcard:not([hidden])'},
];

export const LEGIBLE_FLOOR = 8;   // separates the bug class (~4–5px) from designed fine print (~9–10px); NOT a design bar

/* Measure the smallest on-screen text px in `sel`'s SVG. On-screen px = user-space
   font-size × the SVG's display scale; `text, tspan` so a tspan's own font-size (e.g.
   roadmap's ↗ glyph) isn't hidden behind its parent. Returns enough to assert render,
   fit and legibility; degenerate states (no svg / unlaid-out / no text) fail loud. */
export async function measureEndState(page, sel, readySel){
  return page.evaluate(({s, r}) => {
    const el = document.querySelector(s), svg = el && el.querySelector('svg');
    const ready = r ? !!document.querySelector(r) : true;
    if(!el || !svg) return {hasSvg: false, ready};
    const box = svg.getBoundingClientRect();
    const vb = svg.viewBox && svg.viewBox.baseVal;
    // min(sx,sy) is the effective scale under `meet` letterboxing; house CSS is
    // width:100%/height:auto so sx===sy, but this stays correct if a tool ever pins both
    const sx = vb && vb.width ? box.width / vb.width : 1;
    const sy = vb && vb.height ? box.height / vb.height : sx;
    const scale = Math.min(sx, sy);
    let minFont = Infinity;
    for(const t of svg.querySelectorAll('text, tspan')){
      if(!t.textContent.trim()) continue;
      const fs = parseFloat(getComputedStyle(t).fontSize) || 0;
      if(fs) minFont = Math.min(minFont, fs * scale);
    }
    return {hasSvg: true, ready, minFont: minFont === Infinity ? null : minFont,
      sw: el.scrollWidth, cw: el.clientWidth,
      docSW: document.documentElement.scrollWidth, vw: document.documentElement.clientWidth};
  }, {s: sel, r: readySel});
}

/* Assert one end-state through a suite's own `ok` (mobile.mjs + webkit.mjs share this).
   Surfaces reached by click rather than URL (the bets quadrant) aren't END_STATES entries;
   they call measureEndState directly and assert legibility inline. */
export async function assertEndState(page, ok, name, m, sel){
  ok(m.hasSvg, `${name}: end-state renders an artefact in ${sel}`);
  if(!m.hasSvg) return;
  ok(m.ready, `${name}: end-state is the payoff artefact, not the first render`);
  ok(m.docSW <= m.vw + 1, `${name}: end-state — no page-level h-scroll (${m.docSW} <= ${m.vw})`);
  ok(m.sw <= m.cw + 2, `${name}: end-state — ${sel} no horizontal overflow (${Math.round(m.sw)} <= ${m.cw})`);
  ok(m.minFont != null && m.minFont >= LEGIBLE_FLOOR,
    `${name}: end-state smallest text stays legible (${m.minFont != null ? m.minFont.toFixed(1) : '?'}px >= ${LEGIBLE_FLOOR}) — a shrink-to-fit fails here`);
}
