/* Pure line rewrites for edit-in-place on the /why diagram. No DOM. */

export const SOLUTION_STATUSES = ['candidate', 'testing', 'delivering', 'shipped', 'parked'];
export const ASSUMPTION_CYCLE = ['untested', 'testing', 'holds', 'broken'];

export const validators = {
  label(v){
    const s = v.trim();
    return s.length > 0 && !/[[\]\n]/.test(s) && !s.startsWith('?') && !/^outcome\s*:/i.test(s);
  },
};

export const applies = {
  /* replace the [status] tag, or append one if the line has none (untested default) */
  status(line, _oldRaw, newRaw){
    if(/\[[^\]]+\]/.test(line)) return line.replace(/\[[^\]]+\]/, '[' + newRaw + ']');
    return line.replace(/\s*$/, '') + ' [' + newRaw + ']';
  },
  label(line, oldRaw, newRaw){
    const i = line.indexOf(oldRaw);
    if(i < 0) return line;
    return line.slice(0, i) + newRaw.trim() + line.slice(i + oldRaw.length);
  },
};
