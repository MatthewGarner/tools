/* Pure line rewrites for edit-in-place on the roadmap diagram. No DOM. */
import {parse} from './parse.js';

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
