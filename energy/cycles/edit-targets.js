/* Pure text rewrites for /cycles edit-in-place. Fields address the 1st or 2nd
   number on a key's line; on single-value lines the Lo field edits the lone
   number (the renderer only emits Hi targets for real ranges). */
const N = '-?\\d+(?:\\.\\d+)?';
export const validators = {num: v => /^-?\d+(\.\d+)?$/.test(v.trim())};

/* field → [key, which] ; which: 0 = first number on the line, 1 = second */
const FIELDS = {
  mw: ['battery', 0], mwh: ['battery', 1],
  spreadLo: ['spread', 0], spreadHi: ['spread', 1],
  chargeLo: ['charge', 0], chargeHi: ['charge', 1],
  secondLo: ['second', 0], secondHi: ['second', 1],
  driftLo: ['drift', 0], driftHi: ['drift', 1],
  rteLo: ['rte', 0], rteHi: ['rte', 1],
  fadeLo: ['fade', 0], fadeHi: ['fade', 1],
  calLo: ['calendar', 0], calHi: ['calendar', 1],
  budget: ['cycles', 0], years: ['cycles', 1],
  augLo: ['augment', 0], augHi: ['augment', 1],
  discLo: ['discount', 0], discHi: ['discount', 1],
};

export function editField(line, field, value){
  const spec = FIELDS[field];
  if(!spec) return line;
  const [key, which] = spec;
  if(!new RegExp('^\\s*' + key + '\\s*:', 'i').test(line)) return line;
  let i = -1;
  return line.replace(new RegExp(N, 'g'), m => (++i === which) ? value.trim() : m);
}
