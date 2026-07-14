/* Pure line rewrites for edit-in-place on the roadmap diagram. No DOM. */
import {parse} from './parse.js';
import {moveItem} from './edit.js';

export const STATUSES = ['done', 'doing', 'risk', 'blocked'];

export const validators = {
  title(v){ const s = v.trim(); return s.length > 0 && !/[[\]\n]/.test(s) && !s.includes(' -- '); },
  note(v){ return !/[\n[\]]/.test(v) && !v.includes(' -- '); },
};

export const applies = {
  title(line, oldRaw, newRaw){
    const i = line.indexOf(oldRaw);
    if(i < 0) return line;
    return line.slice(0, i) + newRaw.trim() + line.slice(i + oldRaw.length);
  },
  note(line, oldRaw, newRaw){
    const i = line.lastIndexOf(oldRaw);
    if(i < 0) return line;
    return line.slice(0, i) + newRaw.trim() + line.slice(i + oldRaw.length);
  },
  status(line, _oldRaw, newRaw){
    return line.replace(/\[[^\]]+\]/, '[' + newRaw + ']');
  },
};

/* ---- add/remove items (S1) ---- */

/* New items land at the end of their horizon's section (after its last item,
   else right after the horizon header), lane-prefixed when a lane is given. */
export function addItemLine(text, lane, horizonName){
  const model = parse(text);
  const hIdx = model.horizons.findIndex(h => h.toLowerCase() === String(horizonName).toLowerCase());
  const inH = model.items.filter(i => i.h === hIdx);
  if(inH.length){
    return {afterLine: Math.max(...inH.map(i => i.srcLine))};
  }
  const lines = text.split(/\r?\n/);
  for(let i = 0; i < lines.length; i++){
    const t = lines[i].trim().replace(/:$/, '');
    if(t.toLowerCase() === String(horizonName).toLowerCase()) return {afterLine: i};
  }
  return {afterLine: lines.length - 1};
}

/* Only lines that parse as items may be removed. */
export function removeItemLine(text, srcLine){
  return parse(text).items.some(i => i.srcLine === srcLine);
}

/* ---- card-menu "Move to…" (phone replacement for drag, S3) ---- */

/* Rewrite the item at srcLine so it sits under targetHorizon instead of its
   current one — same lane, appended at the end of that horizon's lane-cell
   (or right after the header when the lane has no items there yet). Reuses
   moveItem (drag's own engine) rather than a second horizon-rewrite: the
   card-menu path and the drag path stay a single source of truth. Returns
   the new full text, or null when srcLine isn't an item, targetHorizon
   doesn't resolve, or targetHorizon IS the item's current horizon (the menu
   marks that row `on`; picking it is a no-op, not an error). */
export function moveHorizon(text, srcLine, targetHorizon){
  const model = parse(text);
  const item = model.items.find(i => i.srcLine === srcLine);
  if(!item) return null;
  const hIdx = model.horizons.findIndex(h => h.toLowerCase() === String(targetHorizon).toLowerCase());
  if(hIdx < 0 || hIdx === item.h) return null;
  const r = moveItem(text, model, srcLine, {h: hIdx, lane: item.lane, beforeLine: null});
  return r ? r.text : null;
}

/* ---- config keys the UI can commit: style: (the picker) and headline: (the field) ---- */

/* Rewrite (or insert, or with an empty value REMOVE) a config line. parse.js
   treats config keys as last-wins across the WHOLE document (the key is
   recognised no matter where it sits), so a naive prepend beside an existing
   later line would be silently masked by that later line — this always finds
   and rewrites whichever line actually wins. With no existing line, it lands in
   the config block: right before the first horizon header (after title:/
   horizons:/etc — never blindly at line 0). */
export function setConfigKey(text, key, value){
  const v = String(value == null ? '' : value).trim();
  const line = key + ': ' + v;
  if(!text.trim()) return v ? line : text;
  const model = parse(text);
  const lines = text.split(/\r?\n/);
  const re = new RegExp('^' + key + '\\s*:', 'i');
  const hits = [];
  for(let i = 0; i < lines.length; i++)
    if(re.test(lines[i].trim())) hits.push(i);
  if(hits.length){
    /* Clearing deletes EVERY matching line, not just the winner: delete the last
       of two and an earlier one takes over, so the value the author just cleared
       comes straight back (and the field, resyncing, refills itself). Setting a
       value rewrites only the winner — the others were already dead. */
    if(!v) for(let i = hits.length - 1; i >= 0; i--) lines.splice(hits[i], 1);
    else lines[hits[hits.length - 1]] = line;
    return lines.join('\n');
  }
  if(!v) return text;
  let at = lines.length;
  for(let i = 0; i < lines.length; i++){
    const t = lines[i].trim().replace(/:$/, '');
    if(!t || t.startsWith('//')) continue;
    if(model.horizons.some(h => h.toLowerCase() === t.toLowerCase())){ at = i; break; }
  }
  lines.splice(at, 0, line);
  return lines.join('\n');
}
export const setStyle = (text, style) => setConfigKey(text, 'style', style);
/* Newlines would forge extra DSL lines out of one field; the deck wraps to two
   lines by itself, so a headline is always exactly one source line. */
export const setHeadline = (text, headline) =>
  setConfigKey(text, 'headline', String(headline || '').replace(/[\r\n]+/g, ' '));
