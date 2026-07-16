/* Pure text rewrites for /bets edit-in-place. No DOM.
   Every function returns [{line, text}] replacements the app dispatches
   through CodeMirror (undoable, text stays the source of truth) — same
   applyLineOps/lineOpsChanges pipeline as wardley/gauge. `text: null` deletes
   the line, matching wardley's removeComponent convention.

   IMPORTANT: bets/parse.js's srcLine is 1-BASED (`srcLine = i + 1`), unlike
   wardley's 0-based srcLine — every function here takes the 1-based srcLine
   (as it appears on the model / data-line) and converts to the 0-based
   `line` index the ops need. The VALUE rewrites (stake/odds/payoff/kill) are
   line-local (no parse() needed); the STRUCTURE rewrites (rename/remove/add
   — the phone card menu + ＋ capsules, mobile-input stage) parse first so a
   stale/mistargeted srcLine degenerates to a no-op null, never a mangled
   document. addBetLine/addGroupLine return {afterLine, newLine, select} for
   insertAndSelect (timeline's addItemLine convention); the rest return the
   applyLineOps [{line, text}] shape (text: null deletes). */
import {parse} from './parse.js';

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

/* ---------------- structure rewrites (rename / remove / add) ---------------- */

/* a bet or group name lives before the first ':' on its line — a colon inside
   it would re-split the attrs (or read as a config key), '//' would start a
   comment. One rule serves both (validators.name === validators.group). */
const cleanName = v => {
  const s = String(v ?? '').trim();
  return s.length > 0 && !s.includes('\n') && !s.includes(':') && !s.includes('//');
};
export const validators = {name: cleanName, group: cleanName};

const findBet = (model, srcLine) => {
  for(const g of model.groups) for(const b of g.bets) if(b.srcLine === srcLine) return b;
  return null;
};

/* last 0-based index of a bet's block: the bet line plus the contiguous run of
   ≥4-indented child lines under it (kill + any indented comments). A blank
   line or a shallower indent ends the block. */
function betBlockEnd(lines, idx){
  let end = idx;
  while(end + 1 < lines.length && lines[end + 1].trim() &&
        lines[end + 1].match(/^ */)[0].length >= 4) end++;
  return end;
}

/* Rewrite a bet's name (the span before the first ':'), keeping indent, attrs
   and any trailing comment. Parse-verified: a srcLine that isn't a bet is a
   no-op null, as is a structure-breaking new name. */
export function renameBet(text, srcLine, oldName, newName){
  const name = String(newName ?? '').trim();
  if(!cleanName(name)) return null;
  if(!findBet(parse(text), srcLine)) return null;
  const lines = text.split(/\r?\n/);
  const idx = srcLine - 1;
  const [code, comment] = splitComment(lines[idx]);
  const indent = code.match(/^ */)[0];
  const colon = code.indexOf(':');
  const rest = colon < 0 ? '' : code.slice(colon);
  return [{line: idx, text: indent + name + rest + comment}];
}

/* Delete a bet's whole block: its line + the contiguous ≥4-indented children
   (kill + indented comments). A kill child that parse still attributes to
   this bet but sits past a shallower interruption is caught via the model —
   the interrupting line itself (a user comment) is conservatively kept. */
export function removeBet(text, srcLine){
  const bet = findBet(parse(text), srcLine);
  if(!bet) return null;
  const lines = text.split(/\r?\n/);
  const idx = srcLine - 1;
  const ops = [];
  for(let i = idx; i <= betBlockEnd(lines, idx); i++) ops.push({line: i, text: null});
  if(bet.kill && !ops.some(o => o.line === bet.kill.srcLine - 1))
    ops.push({line: bet.kill.srcLine - 1, text: null});
  return ops;
}

/* A new bet lands after the target group's last bet block (kill children
   included), or right under the heading when the group is empty. The
   placeholder parses warning-free and renders mid-board. */
export function addBetLine(text, groupSrcLine){
  const g = parse(text).groups.find(gr => gr.srcLine === groupSrcLine);
  if(!g) return null;
  const lines = text.split(/\r?\n/);
  let after = groupSrcLine - 1;                       // 0-based heading index
  if(g.bets.length) after = betBlockEnd(lines, g.bets[g.bets.length - 1].srcLine - 1);
  return {afterLine: after, newLine: '  New bet: stake 50, odds 40-60%, payoff 100-200', select: 'New bet'};
}

/* A new group heading closes the document — after the last non-blank line,
   so trailing whitespace never strands it. */
export function addGroupLine(text){
  const lines = String(text ?? '').split(/\r?\n/);
  let after = 0;
  for(let i = 0; i < lines.length; i++) if(lines[i].trim()) after = i;
  return {afterLine: after, newLine: 'New group', select: 'New group'};
}

export const kinds = {
  stake:  {validate: v => parseRange(v) !== null},
  odds:   {validate: v => parseRange(v) !== null},
  payoff: {validate: v => parseRange(v) !== null},
  kill:   {validate: () => true},
  name:     {validate: validators.name},
  addbet:   {validate: validators.name},
  addgroup: {validate: validators.group},
};
