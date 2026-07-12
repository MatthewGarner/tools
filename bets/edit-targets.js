/* Pure text rewrites for /bets edit-in-place. No DOM.
   Every function returns [{line, text}] replacements the app dispatches
   through CodeMirror (undoable, text stays the source of truth) — same
   applyLineOps/lineOpsChanges pipeline as wardley/gauge. `text: null` deletes
   the line, matching wardley's removeComponent convention.

   IMPORTANT: bets/parse.js's srcLine is 1-BASED (`srcLine = i + 1`), unlike
   wardley's 0-based srcLine — every function here takes the 1-based srcLine
   (as it appears on the model / data-line) and converts to the 0-based
   `line` index the ops need. Every rewrite here is line-local (no parse()
   needed) — stake/odds/payoff/kill all resolve from their own srcLine. */

const KILL_BY = /^(.*?)\s+by\s+(\d{4}-\d{2}-\d{2})$/;   // mirrors parse.js's parseKill regex
const KILL_LINE = /^(\s*)kill:\s*(.*)$/i;

/* a line is code + optional trailing comment; rewrites act on the code and
   re-attach the comment untouched (mirrors wardley/edit-targets.js) */
function splitComment(line){
  const i = line.indexOf('//');
  return i === -1 ? [line, ''] : [line.slice(0, i).replace(/\s+$/, ''), '   ' + line.slice(i)];
}

/* "120" (point) or "100-200"/"100–200" (range), optional trailing % (ignored
   by the caller for non-percent attrs, same tolerance as parse.js's RANGE).
   Returns null on anything that doesn't parse. */
function parseRange(v){
  const m = String(v ?? '').trim().match(/^(-?[\d.]+)\s*(?:[-–]\s*(-?[\d.]+))?\s*%?$/);
  if(!m) return null;
  const lo = parseFloat(m[1]);
  const isRange = m[2] !== undefined;
  const hi = isRange ? parseFloat(m[2]) : lo;
  if(Number.isNaN(lo) || Number.isNaN(hi)) return null;
  return {lo, hi, isRange};
}

const clamp100 = n => Math.min(100, Math.max(0, n));
const fmtNum = n => String(n);
function formatRange({lo, hi, isRange}, percent){
  const suffix = percent ? '%' : '';
  return (isRange ? fmtNum(lo) + '-' + fmtNum(hi) : fmtNum(lo)) + suffix;
}

/* Replace ONLY `key`'s value span within the bet's attribute list (the part
   after the first `:` — scoped there so a name containing the word "stake"
   etc. can never collide, same boundary parseBet itself uses). Leaves the
   name, indent, other attributes and any trailing comment untouched. */
function rewriteAttr(key, percent){
  return function(text, srcLine, raw, value){
    const parsed = parseRange(value);
    if(!parsed) return null;
    const lines = text.split(/\r?\n/);
    const idx = srcLine - 1;
    if(idx < 0 || idx >= lines.length) return null;
    const [code, comment] = splitComment(lines[idx]);
    const colon = code.indexOf(':');
    if(colon < 0) return null;
    const head = code.slice(0, colon + 1), attrs = code.slice(colon + 1);
    const re = new RegExp('(' + key + ')(\\s+)([^,]*?)\\s*(?=,|$)', 'i');
    const m = re.exec(attrs);
    if(!m) return null;
    let {lo, hi, isRange} = parsed;
    if(percent){ lo = clamp100(lo); hi = clamp100(hi); }
    const newVal = formatRange({lo, hi, isRange}, percent);
    const start = m.index + m[1].length + m[2].length;
    const end = start + m[3].length;
    const newAttrs = attrs.slice(0, start) + newVal + attrs.slice(end);
    return [{line: idx, text: head + newAttrs + comment}];
  };
}

export const rewriteStake = rewriteAttr('stake', false);
export const rewriteOdds = rewriteAttr('odds', true);
export const rewritePayoff = rewriteAttr('payoff', false);

/* Rewrite a kill child line's free text. An empty/whitespace value DELETES
   the line (a bet with no active kill condition just has no child line —
   parse.js already treats a missing `kill:` as `bet.kill === null`).
   The existing `by YYYY-MM-DD` suffix survives unless the new text carries
   its own — so retyping just the condition doesn't silently drop the date. */
export function rewriteKill(text, srcLine, raw, value){
  const lines = text.split(/\r?\n/);
  const idx = srcLine - 1;
  if(idx < 0 || idx >= lines.length) return null;
  const [code, comment] = splitComment(lines[idx]);
  const m = code.match(KILL_LINE);
  if(!m) return null;
  const v = String(value ?? '');
  if(!v.trim()) return [{line: idx, text: null}];
  const indent = m[1];
  const newBody = v.trim();
  let finalBody = newBody;
  if(!KILL_BY.test(newBody)){
    const old = m[2].match(KILL_BY);
    if(old) finalBody = newBody + ' by ' + old[2];
  }
  return [{line: idx, text: indent + 'kill: ' + finalBody + comment}];
}

export const kinds = {
  stake:  {validate: v => parseRange(v) !== null},
  odds:   {validate: v => parseRange(v) !== null},
  payoff: {validate: v => parseRange(v) !== null},
  kill:   {validate: () => true},
};
