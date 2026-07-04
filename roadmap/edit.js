/* Pure text mutations for drag-and-drop (spec §3). No DOM.
   Text stays the source of truth: a drop is exactly one line move. */

/* moveItem(text, model, srcLine, {h, lane, beforeLine}) → {text, cursorLine} | null
   - model: parse(text) result (supplies horizons + item srcLines)
   - srcLine: 0-based line index of the item being moved
   - target.h: horizon index; target.lane: lane name ('' = laneless)
   - target.beforeLine: srcLine of the card to insert before, or null = end of cell
   Returns null for out-of-range input or a drop that changes nothing. */
export function moveItem(text, model, srcLine, target){
  const lines = text.split(/\r?\n/);
  if(srcLine < 0 || srcLine >= lines.length) return null;
  const raw = lines[srcLine];

  const laneM = raw.trim().match(/^([^[\]]+?)\s*:\s+(.*)$/);
  const currentLane = laneM ? laneM[1].trim() : '';
  const body = laneM ? laneM[2].trim() : raw.trim();
  const laneChanged = target.lane !== currentLane;
  const newLine = laneChanged
    ? (target.lane ? target.lane + ': ' + body : body)
    : raw;   // lane unchanged → byte-preserve the original line

  /* insertion point, in ORIGINAL line coordinates ("insert before index …") */
  let insertBefore;
  if(target.beforeLine != null){
    insertBefore = target.beforeLine;
  } else {
    const cellItems = model.items.filter(i => i.h === target.h && i.lane === target.lane);
    const lastInCell = cellItems.length ? Math.max(...cellItems.map(i => i.srcLine)) : -1;
    if(lastInCell === srcLine) return null;   // already the last card of this cell
    if(lastInCell >= 0){
      insertBefore = lastInCell + 1;
    } else {
      const hName = model.horizons[target.h];
      if(hName === undefined) return null;
      const headerIdx = lines.findIndex(l =>
        l.trim().replace(/:$/, '').toLowerCase() === hName.toLowerCase());
      if(headerIdx < 0) return null;
      insertBefore = headerIdx + 1;
    }
  }

  /* no-op: same position and same content */
  if(!laneChanged && (insertBefore === srcLine || insertBefore === srcLine + 1)) return null;

  lines.splice(srcLine, 1);
  const idx = insertBefore > srcLine ? insertBefore - 1 : insertBefore;
  lines.splice(idx, 0, newLine);
  return {text: lines.join('\n'), cursorLine: idx};
}
