/* Signature motion (2026-07-13): a shared, golden-safe DOM/CSS layer applied
   AFTER the renderer's SVG string is inserted — never baked into the string.
   Reveal (draw-then-fill) + FLIP (glide on edit) + one reduced-motion gate.
   Spec: docs/superpowers/specs/2026-07-13-signature-motion-design.md */
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
export const motionStill = () => reducedMotion.matches || document.hidden;

function onceEnd(el, fn){ el.addEventListener('animationend', fn, {once: true}); }
function clean(el, cls){ el.classList.remove(cls); el.style.removeProperty('--mo-len'); el.style.removeProperty('--mo-i'); }

/* Reveal: hero strokes (spec.draw) draw on; the SVG's other top-level children
   fade+settle group-staggered behind them. getTotalLength is a geometry read
   (not a layout reflow). Never dash-draws an already-dashed element. */
export function revealIn(container, spec = {}, onPlay){
  if(reducedMotion.matches){ if(onPlay) onPlay(); return; }   // instant, no animation, count as revealed
  const svg = container.querySelector('svg'); if(!svg){ if(onPlay) onPlay(); return; }
  const drawn = (spec.draw ? [...svg.querySelectorAll(spec.draw)] : [])
    .filter(el => el.getTotalLength && !el.getAttribute('stroke-dasharray'))
    .slice(0, 12);
  drawn.forEach((el, i) => {
    const L = el.getTotalLength(); if(!L) return;
    el.style.setProperty('--mo-len', (L + 2).toFixed(1));
    el.style.setProperty('--mo-i', i);
    el.classList.add('mo-draw');
    onceEnd(el, () => clean(el, 'mo-draw'));
  });
  const drawnSet = new Set(drawn);
  // when hero strokes draw, hold the fades back ~0.4s so the draw leads; when
  // there's nothing to draw, start the fades immediately (no blank pause).
  container.style.setProperty('--mo-fade-base', drawn.length ? '.4s' : '0s');
  const hold = spec.hold ? new Set(svg.querySelectorAll(spec.hold)) : new Set();
  const kids = [...svg.children].filter(el => el.nodeName !== 'defs' && el.nodeName !== 'style');
  // the first full-bleed <rect fill> (no rx) is the backdrop — it appears
  // instantly; fading/rising it would slide the whole plate and show the page
  // through. spec.hold opts extra surfaces (cards/lanes) out of the rise too.
  const backdrop = kids.find(el => el.nodeName === 'rect' && el.getAttribute('fill') && !el.getAttribute('rx'));
  kids.filter(el => el !== backdrop && !drawnSet.has(el) && !hold.has(el))
    .forEach((el, i) => {
      el.style.setProperty('--mo-i', i % 8);
      el.classList.add('mo-fade');
      onceEnd(el, () => clean(el, 'mo-fade'));
    });
  // The animation is applied PAUSED (css: .mo-draw/.mo-fade animation-play-state:
  // paused). It only plays once the WHOLE element is in view — never off-screen.
  // Adding .mo-go to the container unpauses. Re-arm disconnects the prior observer.
  if(container._moIO) container._moIO.disconnect();
  container.classList.remove('mo-go');
  let played = false;
  const play = () => { if(played) return; played = true; container.classList.add('mo-go'); if(onPlay) onPlay(); };
  container._moIO = observeFullyInView(container, play);
}

/* Fire cb once the element is as fully in view as the viewport allows: the whole
   thing if it fits, or filling the viewport if it's taller. Horizontal panning is
   ignored (a wide diagram is "seen" even when it pans).

   Liveness is the hard part, and getting it wrong ships blank boards (2026-07-13:
   map/gauge/cycles on a laptop, five more on a phone). Two rules keep content from
   ever being stranded at opacity 0:
     - Geometry is measured on every scroll/resize frame, not inferred from IO
       threshold crossings. A crossing list only samples the ratios it happens to
       cross, so a normal scroll can skip clean over the fully-in-view band and the
       reveal never fires. IO is kept purely as the cheap "it's near the viewport"
       trigger.
     - An element can be permanently UNABLE to satisfy the gate — a board below the
       fold on a page with nothing left to scroll. So once it has been mostly on
       screen for a moment, it plays anyway. The user is looking at it; a late
       reveal beats an invisible one. It still never plays while off-screen, which
       is the promise that matters. */
const MOSTLY = 0.6, DWELL = 420;   // ≥60% of what the viewport could show, for 420ms
function observeFullyInView(el, cb){
  let done = false, timer = 0, queued = false;
  const fire = () => { if(done) return; done = true; stop(); cb(); };
  const stop = () => {
    clearTimeout(timer); timer = 0;
    io && io.disconnect(); ro && ro.disconnect();
    removeEventListener('scroll', schedule, true); removeEventListener('resize', schedule);
  };
  /* seen = the visible fraction of the most this viewport could ever show of it */
  const seen = () => {
    const r = el.getBoundingClientRect();
    const vh = innerHeight || document.documentElement.clientHeight;
    const vis = Math.min(r.bottom, vh) - Math.max(r.top, 0);
    const most = Math.min(r.height, vh);                 // fits ⇒ its height; taller ⇒ the viewport
    return (r.height <= 0 || vis <= 0 || most <= 0) ? 0 : vis / most;
  };
  const check = () => {
    queued = false;
    if(done) return;
    const ratio = seen();
    if(ratio >= 1 - 0.002) return fire();               // as fully in view as it can be → now
    if(ratio >= MOSTLY){ if(!timer) timer = setTimeout(fire, DWELL); }   // can't fill the fold → soon
    else { clearTimeout(timer); timer = 0; }            // off-screen (or barely on) → stay hidden
  };
  const schedule = () => { if(!queued && !done){ queued = true; requestAnimationFrame(check); } };
  const io = typeof IntersectionObserver !== 'undefined' ? new IntersectionObserver(schedule, {threshold: [0, 0.25, 0.5, 0.75, 1]}) : null;
  const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(schedule) : null;
  if(io) io.observe(el);
  addEventListener('scroll', schedule, {passive: true, capture: true});   // capture: catches scrolls in any pane
  addEventListener('resize', schedule);
  /* an element armed while it has no box — a view behind a tab (bets Board⇄Quadrant,
     premortem's phases) — gets neither scroll nor resize when it's finally shown */
  ro && ro.observe(el);
  schedule();                                            // and settle the load state
  return {disconnect: stop};
}

/* FLIP: capture keyed rects before the swap; after, invert+release. Two-pass
   (all reads, then all writes) so a re-render forces one layout, not one per
   element. scale divides screen-px deltas into local px (zoom workspaces). */
export function captureFlip(container, attr){
  const m = new Map();
  for(const el of container.querySelectorAll('[' + attr + ']')) m.set(el.getAttribute(attr), el.getBoundingClientRect());
  return m;
}
export function applyFlip(container, attr, old, {scale = 1} = {}){
  if(motionStill() || !old) return;
  const moves = [];
  for(const el of container.querySelectorAll('[' + attr + ']')){          // PASS 1: reads
    const prev = old.get(el.getAttribute(attr)); if(!prev) continue;
    const now = el.getBoundingClientRect();
    const dx = (prev.left - now.left) / scale, dy = (prev.top - now.top) / scale;
    if(Math.abs(dx) >= 1 || Math.abs(dy) >= 1) moves.push([el, dx, dy]);
  }
  for(const [el, dx, dy] of moves){                                       // PASS 2: writes
    el.classList.add('mo-flip'); el.style.transition = 'none';
    el.style.transform = 'translate(' + dx + 'px,' + dy + 'px)';
  }
  if(moves.length) requestAnimationFrame(() => requestAnimationFrame(() => {
    for(const [el] of moves){ el.style.transition = ''; el.style.transform = ''; }
  }));
}

/* One helper owns {lastSvg, revealed} + the memoized swap, so per-tool wiring is
   ~3 lines and the state machine can't drift. The reveal stays ARMED until it
   actually plays (the element is scrolled fully into view) — so an edit to a
   below-the-fold diagram before you reach it re-arms rather than loses the
   reveal. Once played, paints FLIP (on a settle) or plain-swap (mode:'none' for
   theme/relayout/mid-drag). paint.reveal() re-arms (example load); paint.reset()
   forces the next paint even if the string repeats. onSwap runs synchronously
   after the swap, before motion (timeline applies zoom so applyFlip reads
   final-scale rects). */
export function mountMotion(container){
  let lastSvg = '', revealed = false;
  function paint(svg, spec = {}, {flipAttr, scale, onSwap, mode: force} = {}){
    if(svg === lastSvg) return;
    if(!revealed){                                       // arm/re-arm until the reveal plays
      container.innerHTML = svg; lastSvg = svg;
      if(onSwap) onSwap();
      revealIn(container, spec, () => { revealed = true; });   // reduced-motion → plays instantly
      return container;
    }
    const m = force || 'flip';                           // revealed: flip on settle, else plain swap
    const flipState = (m === 'flip' && flipAttr) ? captureFlip(container, flipAttr) : null;
    container.innerHTML = svg; lastSvg = svg;
    if(onSwap) onSwap();
    if(flipState) applyFlip(container, flipAttr, flipState, {scale: (scale ? scale() : 1)});
    return container;
  }
  paint.reveal = () => { revealed = false; };
  paint.reset = () => { lastSvg = ''; };
  return paint;
}
