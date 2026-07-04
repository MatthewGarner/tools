/* Pure line rewrites for edit-in-place on the tree diagram. No DOM.
   Each apply() replaces exactly one component of one source line. */
import {parseMoney} from './parse.js';

export const validators = {
  prob(v){
    const s = v.trim();
    if(/^rest$/i.test(s)) return true;
    const r = parseMoney(s);
    return r !== null && r.lo >= 0 && r.hi <= 1;
  },
  value(v){ return parseMoney(v.trim()) !== null; },
  label(v){
    const s = v.trim();
    return s.length > 0 && !/[[\]\n]/.test(s) && !s.startsWith('?');
  },
};

export const applies = {
  prob(line, _oldRaw, newRaw){
    return line.replace(/\(p=[^)]*\)/i, '(p=' + newRaw.trim() + ')');
  },
  value(line, oldRaw, newRaw){
    const i = line.lastIndexOf(oldRaw);
    if(i < 0) return line;
    return line.slice(0, i) + newRaw.trim() + line.slice(i + oldRaw.length);
  },
  label(line, oldRaw, newRaw){
    const start = line.search(/\S/);
    if(start < 0 || !line.slice(start).startsWith(oldRaw)) return line;
    return line.slice(0, start) + newRaw.trim() + line.slice(start + oldRaw.length);
  },
};
