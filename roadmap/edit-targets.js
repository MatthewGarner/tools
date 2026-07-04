/* Pure line rewrites for edit-in-place on the roadmap diagram. No DOM. */

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
