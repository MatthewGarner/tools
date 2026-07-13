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
export function revealIn(container, spec = {}){
  if(motionStill()) return;
  const svg = container.querySelector('svg'); if(!svg) return;
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

/* One helper owns {lastSvg, mode} + the memoized swap, so per-tool wiring is
   ~3 lines and the fire-once state machine can't drift. mode: first paint
   reveals, every paint after flips; pass mode:'none' for theme/relayout;
   paint.reveal() re-arms a reveal (example load); paint.reset() forces the next
   paint even if the string repeats (theme re-render). onSwap runs synchronously
   after the swap, before motion (e.g. timeline applies zoom so applyFlip reads
   final-scale rects). */
export function mountMotion(container){
  let lastSvg = '', mode = 'reveal';
  function paint(svg, spec = {}, {flipAttr, scale, onSwap, mode: force} = {}){
    if(svg === lastSvg) return;
    const m = force || mode;
    const flipState = (m === 'flip' && flipAttr) ? captureFlip(container, flipAttr) : null;
    container.innerHTML = svg; lastSvg = svg;
    if(onSwap) onSwap();
    if(m === 'reveal') revealIn(container, spec);
    else if(flipState) applyFlip(container, flipAttr, flipState, {scale: (scale ? scale() : 1)});
    mode = 'flip';
    return container;
  }
  paint.reveal = () => { mode = 'reveal'; };
  paint.reset = () => { lastSvg = ''; };
  return paint;
}
