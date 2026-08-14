/* Dense Board navigation is view state, never roadmap source. The window is
   anchored on an authored focus: when present, otherwise the first horizon
   with work, and its start is always clamped after ordinary text edits. */
export const BOARD_WINDOW_SIZE = 3;
export const BOARD_MIN_COLUMN_WIDTH = 220;
export const BOARD_GAP = 24;
export const BOARD_SIDE_INSET = 48;

export function boardCapacityFor(width, horizonCount){
  const available = Math.max(0, Number(width) || 0) - BOARD_SIDE_INSET + BOARD_GAP;
  const capacity = Math.floor(available / (BOARD_MIN_COLUMN_WIDTH + BOARD_GAP));
  return Math.max(1, Math.min(Math.max(1, horizonCount || 1), capacity || 1));
}

function anchorIndex(model){
  if(model.focus){
    const wanted = model.focus.toLowerCase();
    const named = model.horizons.findIndex(h => h.toLowerCase() === wanted);
    if(named >= 0) return named;
  }
  const occupied = model.horizons.findIndex((_, h) => model.items.some(item => item.h === h));
  return occupied < 0 ? 0 : occupied;
}

export function resolveBoardWindow(model, requestedStart, size = BOARD_WINDOW_SIZE){
  const capacity = Math.max(1, Math.floor(size) || BOARD_WINDOW_SIZE);
  const maxStart = Math.max(0, model.horizons.length - capacity);
  const requested = Number.isInteger(requestedStart) ? requestedStart : anchorIndex(model);
  const start = Math.max(0, Math.min(maxStart, requested));
  const end = Math.min(model.horizons.length, start + capacity);
  return {start, end, capacity, indices: Array.from({length: end - start}, (_, i) => start + i),
    hasPrevious: start > 0, hasNext: end < model.horizons.length};
}
