/* Where the P10 / P50 / P90 (and "0") labels under an exposure rule go. Pure: no DOM.
   The labels never overprint and never leave [x0, x1]: equal values share one label ("P10 · P50 −200"), a label that would
   run past an edge is anchored to that edge, a label that still collides drops to a second row, and the "0" marker (the
   least important) is left out rather than printed over another label.
   items: [{key, valueText, x}] in the order they should win a collision; zero: {x} or null.
   Returns {labels: [{text, x, anchor, row, key}], rows}. */
export function railLabels(items, {x0, x1, measure, font, gap = 6, zero = null, maxRows = 3}){
  const groups = [];
  for(const it of items){
    const same = groups.find(g => g.valueText === it.valueText);
    if(same){ same.keys.push(it.key); same.x = (same.x + it.x) / 2; }
    else groups.push({keys: [it.key], valueText: it.valueText, x: it.x, strong: !!it.strong});
  }
  const cands = groups.map(g => ({key: g.keys.join(' · '), text: g.keys.join(' · ') + ' ' + g.valueText, x: g.x}));
  if(zero && !groups.some(g => g.valueText === '0')) cands.push({key: 'zero', text: '0', x: zero.x, zero: true});
  for(const c of cands){
    const w = measure(c.text, font);
    let anchor = 'middle', x = c.x, left = x - w / 2;
    if(left < x0){ anchor = 'start'; x = x0; left = x0; }
    else if(x + w / 2 > x1){ anchor = 'end'; x = x1; left = x1 - w; }
    Object.assign(c, {w, anchor, x, left, right: left + w});
  }
  const placed = [], rowsUsed = [];
  const order = cands.slice().sort((a, b) => (a.zero ? 1 : 0) - (b.zero ? 1 : 0) || a.x - b.x);
  for(const c of order){
    let row = 0;
    const rows = c.zero ? 1 : maxRows;   // the marker belongs on its tick's own line: it is left out rather than moved
    for(; row < rows; row++)
      if(!placed.some(p => p.row === row && c.left < p.right + gap && c.right + gap > p.left)) break;
    if(row >= rows){ if(c.zero) continue; row = maxRows - 1; }   // a real label is never dropped (three labels always fit three rows)
    placed.push({...c, row});
    rowsUsed[row] = true;
  }
  return {labels: placed.sort((a, b) => a.x - b.x).map(({text, x, anchor, row, key, left, right}) => ({text, x, anchor, row, key, left, right})),
    rows: Math.max(1, rowsUsed.length)};
}

/* two labels of a set that still overlap (a fixture of last resort for the caller's own guard) */
export const overlapping = labels => labels.some((a, i) => labels.some((b, j) => j > i && a.row === b.row && a.left < b.right && a.right > b.left));
