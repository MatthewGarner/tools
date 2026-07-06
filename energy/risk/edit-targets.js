/* Pure text rewrites for /risk edit-in-place. No DOM; the text is the model. */
const N = '-?\\d+(?:\\.\\d+)?';
const FIELD_RE = {
  level:      new RegExp('(^\\s*floor\\s*:\\s*)(' + N + ')', 'i'),
  fixed:      new RegExp('(^\\s*toll\\s*:\\s*)(' + N + ')', 'i'),
  share:      new RegExp('(share\\s+)(' + N + ')(\\s*%)', 'i'),
  fee:        new RegExp('(fee\\s+)(' + N + ')', 'i'),
  premium:    new RegExp('(premium\\s+)(' + N + ')', 'i'),
  attach:     new RegExp('(attach\\s+)(' + N + ')', 'i'),
  limit:      new RegExp('(limit\\s+)(' + N + ')', 'i'),
  merchantLo: new RegExp('(^\\s*merchant\\s*:\\s*)(' + N + ')', 'i'),
  merchantHi: new RegExp('(\\.\\.\\s*)(' + N + ')'),
};

export const validators = {
  num: v => /^-?\d+(\.\d+)?$/.test(v.trim()),
};

export function editField(line, field, value){
  const re = FIELD_RE[field];
  if(!re || !re.test(line)) return line;
  return line.replace(re, (m, pre, old, post) => pre + value.trim() + (typeof post === 'string' ? post : ''));
}
