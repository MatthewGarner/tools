/* Pure interaction predicates used around SVG replacement and callout focus. */

export function calloutOwnsFocus(pop, active){
  return Boolean(pop && active && (active === pop || (typeof pop.contains === 'function' && pop.contains(active))));
}

export function findPlantTarget(root, name){
  if(!root || !name) return null;
  return [...root.querySelectorAll('g[data-plant]')].find(el => el.dataset.plant === name) || null;
}

/* A read-only callout must stay within the viewport rather than ending below
   the fold. Return a fixed-position anchor below when it fits, otherwise above. */
export function calloutPosition(anchor, size, viewport, pad = 8, gap = 6){
  const x = Math.max(pad, Math.min(anchor.left, viewport.width - size.width - pad));
  const below = anchor.bottom + gap;
  const y = below + size.height <= viewport.height - pad
    ? below : Math.max(pad, anchor.top - size.height - gap);
  return {x: Math.round(x), y: Math.round(y)};
}
