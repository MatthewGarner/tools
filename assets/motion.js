/* Signature motion (2026-07-13): a shared, golden-safe DOM/CSS layer applied
   AFTER the renderer's SVG string is inserted — never baked into the string.
   Brief ink/trace accents + FLIP (glide on edit) + one reduced-motion gate.
   Spec: docs/superpowers/specs/2026-07-13-signature-motion-design.md */
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
export const motionStill = () => reducedMotion.matches || document.hidden;

function onceEnd(el, fn){ el.addEventListener('animationend', fn, {once: true}); }

function inkClone(el, len, index){
  const accent = el.cloneNode(true);
  for(const node of [accent, ...accent.querySelectorAll('*')]){
    node.removeAttribute('id');
    for(const attr of [...node.attributes]) if(attr.name.startsWith('data-')) node.removeAttribute(attr.name);
  }
  accent.setAttribute('aria-hidden', 'true');
  accent.style.setProperty('--mo-len', (len + 2).toFixed(1));
  accent.style.setProperty('--mo-i', index);
  accent.style.setProperty('--mo-width', getComputedStyle(el).strokeWidth || el.getAttribute('stroke-width') || '1px');
  accent.classList.add('mo-draw');
  el.after(accent);
  onceEnd(accent, () => accent.remove());
  return accent;
}

/* Reveal: only authored hero strokes (spec.draw) draw on. All other SVG content
   remains in its authored, readable state from the first frame. getTotalLength is
   a geometry read (not a layout reflow). Never dash-draws an already-dashed element. */
export function revealIn(container, spec = {}, onPlay){
  if(container._moIO){ container._moIO.disconnect(); container._moIO = null; }
  for(const accent of container.querySelectorAll('.mo-draw')) accent.remove();
  if(reducedMotion.matches){ if(onPlay) onPlay(); return; }   // instant, no animation, count as revealed
  const svg = container.querySelector('svg'); if(!svg){ if(onPlay) onPlay(); return; }
  const sources = (spec.draw ? [...svg.querySelectorAll(spec.draw)] : [])
    .filter(el => el.getTotalLength && !el.getAttribute('stroke-dasharray'))
    .slice(0, 12);
  const drawn = [];
  sources.forEach((el, i) => {
    const L = el.getTotalLength(); if(!L) return;
    drawn.push(inkClone(el, L, i));
  });
  // With no trace to animate, settle the ink accent immediately and let subsequent
  // paints use FLIP. There is no reason to visibility-gate already-readable content.
  if(!drawn.length){
    container.classList.add('mo-go');
    if(onPlay) onPlay();
    return;
  }
  // The trace is applied paused; adding .mo-go unpauses it once the artefact is in
  // view. The rest of the SVG remains readable while a below-fold trace is waiting.
  container.classList.remove('mo-go');
  let played = false;
  const play = () => { if(played) return; played = true; container.classList.add('mo-go'); if(onPlay) onPlay(); };
  container._moIO = observeFullyInView(container, play);
}

/* Fire cb once the element is as fully in view as the viewport allows — the whole
   thing if it fits, or filling the viewport if it's taller — and, failing that, as
   soon as a meaningful part of it has been on screen for a beat. Horizontal panning
   is ignored (a wide diagram is "seen" even when it pans).

   Liveness still matters for a trace accent: an element that never unpauses leaves
   its transient clone unfinished. Two rules keep those accents from being stranded:
     - Geometry is measured on every scroll/resize frame, never inferred from IO
       threshold crossings. A crossing list only samples the ratios it happens to
       cross, so a normal scroll can skip clean over the fully-in-view band and the
       reveal never fires. IO is kept only as the cheap "it's near the viewport"
       trigger.
     - An element can be permanently UNABLE to be fully in view — a board below the
       fold on a page with nothing left to scroll — so the dwell below plays it
       anyway. ENOUGH is deliberately LOW: any higher threshold just leaves a band
       where a board the user is looking at stays blank, and 0.6 still stranded
       /bets/ on a 1100×520 window (49% of itself, 32% of the screen — under both).
       There is no "safe" high threshold, only the size of the hole.
   A genuinely off-screen element never plays WITHIN THE FIRST SECONDS — after
   DEADLINE it plays regardless (mostly unseen). The deadline arms only once the
   element HAS a box, so a view behind a tab (bets Quadrant, premortem's phases) keeps
   its reveal for the moment it's first shown. */
const ENOUGH = 0.15, DWELL = 420, DEADLINE = 3000;
function observeFullyInView(el, cb){
  let io = null, ro = null;                             // declared before stop() can name them
  let done = false, timer = 0, queued = false, dl = 0;
  /* null until IO first reports. It is a VETO, never a precondition: only an explicit
     "zero intersection" holds the reveal back. Requiring a positive IO report before
     playing would re-create the stranding bug on any browser or moment where the
     callback doesn't arrive. Safe because threshold 0 is in the list, so becoming
     visible ALWAYS reports and clears the veto. */
  let clipped = null;
  const fire = () => { if(done) return; done = true; stop(); cb(); };
  const stop = () => {
    done = true;                                        // also neutralises a check() already queued on rAF
    clearTimeout(timer); timer = 0;
    clearTimeout(dl); dl = 0;
    io && io.disconnect(); ro && ro.disconnect();
    removeEventListener('scroll', schedule, true); removeEventListener('resize', schedule);
  };
  /* How much of the element you can see, measured against the most this viewport
     could ever show of it — its own height, or the viewport if it's taller. This is
     a viewport measurement only: it can't see an ancestor's overflow clip, so a
     container scrolled out of its own scrolling pane still reads as "visible". IO
     CAN see that (its intersection rect is clipped by the ancestor chain), so its
     isIntersecting is kept as a veto below — and the arm-time check is held one
     frame so IO has reported before the veto is first consulted. */
  const seen = () => {
    const r = el.getBoundingClientRect();
    const vh = innerHeight || document.documentElement.clientHeight;
    const vis = Math.min(r.bottom, vh) - Math.max(r.top, 0);
    const most = Math.min(r.height, vh);
    return (r.height <= 0 || vis <= 0 || most <= 0 || vh <= 0) ? 0 : vis / most;
  };
  const check = () => {
    queued = false;
    if(done) return;
    /* liveness deadline: from the first frame the element HAS a box, it may sit
       hidden for at most DEADLINE ms — then it plays even off-screen (see above) */
    if(!dl && el.getBoundingClientRect().width > 0) dl = setTimeout(fire, DEADLINE);
    if(clipped === true) { clearTimeout(timer); timer = 0; return; }   // IO says an ancestor hides it
    const ratio = seen();
    if(ratio >= 1 - 0.002) return fire();               // as fully in view as it can be → now
    if(ratio >= ENOUGH){ if(!timer) timer = setTimeout(fire, DWELL); }  // on screen, can't get fuller → soon
    else { clearTimeout(timer); timer = 0; }            // off-screen → stay hidden (the promise)
  };
  const schedule = () => { if(!queued && !done){ queued = true; requestAnimationFrame(check); } };
  io = typeof IntersectionObserver !== 'undefined' ? new IntersectionObserver(entries => {
    clipped = !entries[entries.length - 1].isIntersecting;   // sees ancestor overflow clips; rect maths can't
    schedule();
  }, {threshold: [0, 0.25, 0.5, 0.75, 1]}) : null;
  ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(schedule) : null;
  if(io) io.observe(el);
  addEventListener('scroll', schedule, {passive: true, capture: true});   // capture: catches scrolls in any pane
  addEventListener('resize', schedule);
  /* an element armed while it has no box — a view behind a tab (bets Board⇄Quadrant,
     premortem's phases) — gets neither scroll nor resize when it's finally shown */
  ro && ro.observe(el);
  /* Settle the load state — but a frame late, ON PURPOSE. rAF callbacks run BEFORE
     the frame's intersection step, so a plain schedule() here would run the first
     check with clipped still null; a clipped-but-rect-fully-visible element would
     then fire immediately and play its reveal unseen, straight past the veto. One
     extra frame lets IO deliver its initial entry first. This can only ever DELAY
     the reveal by a frame, never withhold it — check() still runs unconditionally. */
  if(io) requestAnimationFrame(schedule); else schedule();
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
/* The verdict figure gets one brief ink accent: on first reveal only, every .vfig
   tspan starts at its parent text's ink (an inline STYLE override — style beats
   the brand fill ATTRIBUTE) and settles to brand as the reveal finishes.
   Liveness by construction: the source string is ALWAYS brand; if motion never
   fires the un-overridden fig is already correct with zero JS. The short clear
   starts the transition alongside the trace, so the
   240ms fill transition runs alongside the trace and stays within the shared
   300ms first-render envelope. */
function armFigSettle(container){
  if(reducedMotion.matches) return [];
  const figs = [...container.querySelectorAll('.vfig')];
  for(const t of figs){
    const p = t.closest('text');
    const ink = p && p.getAttribute('fill');
    if(ink) t.style.fill = ink;
  }
  return figs;
}
const settleFigs = figs => { if(figs.length) setTimeout(() => figs.forEach(t => t.style.removeProperty('fill')), 20); };

export function mountMotion(container){
  let lastSvg = '', revealed = false;
  function paint(svg, spec = {}, {flipAttr, scale, onSwap, mode: force} = {}){
    if(svg === lastSvg) return;
    if(!revealed){                                       // arm/re-arm until the reveal plays
      container.innerHTML = svg; lastSvg = svg;
      if(onSwap) onSwap();
      const figs = armFigSettle(container);
      revealIn(container, spec, () => { revealed = true; settleFigs(figs); });   // reduced-motion → plays instantly
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
