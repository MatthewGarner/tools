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
   marks that row `on`; picking it is a no-op, not an error).

   moveItem (edit.js) requires a literal header line for an empty target
   cell — with no items AND no header it returns null, a silent no-op. That
   is exactly the register's synthesised empty horizons (default Now/Next/
   Later with only NOW ever written) and the card-menu "Move to…" list,
   which offers every horizon regardless of whether it has a header. Ensure
   the header first (ensureHorizonHeader is a no-op when it already exists —
   appends at the END, so no existing srcLine shifts, and model/hIdx, both
   resolved before the ensure, stay valid without a re-parse). */
export function moveHorizon(text, srcLine, targetHorizon){
  const model = parse(text);
  const item = model.items.find(i => i.srcLine === srcLine);
  if(!item) return null;
  const hIdx = model.horizons.findIndex(h => h.toLowerCase() === String(targetHorizon).toLowerCase());
  if(hIdx < 0 || hIdx === item.h) return null;
  const withHeader = ensureHorizonHeader(text, model, hIdx);
  const r = moveItem(withHeader, model, srcLine, {h: hIdx, lane: item.lane, beforeLine: null});
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
/* the focus style's lens — which horizon is the hero */
export const setFocus = (text, name) => setConfigKey(text, 'focus', name);
/* Newlines would forge extra DSL lines out of one field; the deck wraps to two
   lines by itself, so a headline is always exactly one source line. */
export const setHeadline = (text, headline) =>
  setConfigKey(text, 'headline', String(headline || '').replace(/[\r\n]+/g, ' '));

/* ---- span edits (the three drag gestures) ---- */

/* Rewrite the `xN` token on one line.
   Operate ONLY on the head of the line — the part before ` -- note` / ` -> url`.
   parse strips the note BEFORE the token, so a note may legitimately END in "x2"
   ("Core: A -- twice weekly x2"): a whole-line regex would delete it out of the
   user's note on every right-edge drag. */
export function setSpan(text, srcLine, span){
  const n = Math.max(1, Math.floor(span));
  const lines = text.split(/\r?\n/);
  if(srcLine < 0 || srcLine >= lines.length) return text;
  const line = lines[srcLine];
  const cut = [line.search(/\s--\s/), line.search(/\s->\s/)].filter(i => i >= 0);
  const at = cut.length ? Math.min(...cut) : line.length;
  let head = line.slice(0, at), tail = line.slice(at);
  head = head.replace(/\s+x\d+\s*$/i, '');            // drop any existing token
  lines[srcLine] = (n > 1 ? head.trimEnd() + ' x' + n : head.trimEnd()) + tail;
  return lines.join('\n');
}

/* The MIDDLE drag. With xN the token is part of the line, so moving the line moves
   the duration with it — this is the SHIPPED moveHorizon (edit-targets.js:62), which
   already does the horizon-name → {h, lane} translation and returns string | null.
   The name exists to pin the duration-preserving guarantee with a test. */
export function moveItemKeepingSpan(text, srcLine, horizonName){
  return moveHorizon(text, srcLine, horizonName) || text;
}

/* The LEFT edge: move the start, hold the END still.
   Uses declaredSpan, NOT span: span is clamped to the board, so an off-board `x6`
   painted 4 wide would be rewritten as x3 when dragged one column right — silently
   shortening work the author said runs past the edge. */
export function setSpanStart(text, srcLine, newH, model){
  const it = model.items.find(i => i.srcLine === srcLine);
  if(!it) return text;
  const declared = Math.max(1, it.declaredSpan || it.span || 1);
  const declaredEnd = it.h + declared - 1;
  const start = Math.max(0, Math.min(newH, declaredEnd));    // never past its own end
  if(start === it.h) return text;
  const r = moveItem(text, model, srcLine, {h: start, lane: it.lane, beforeLine: null});
  if(!r) return text;
  /* moveItem hands back the item's NEW line index — no re-find, so two items with
     the same title in one lane cannot cross-wire */
  return setSpan(r.text, r.cursorLine, declaredEnd - start + 1);
}

/* ---- register cell edits (2026-07-15) ---- */

/* Exported so a later validator (the register "lane" cell edit) can reuse the
   same config-key collision list rather than a second, driftable copy. */
export const CONFIG_KEYS = /^(title|date|headline|horizons|wip|fade|palette|accent|style|focus)$/i;

/* peel the head of a line — the part before ` -- note` / ` -> url` — the same cut
   setSpan uses, so an inserted token/prefix lands in the right place. */
function headCut(line){
  const cut = [line.search(/\s--\s/), line.search(/\s->\s/)].filter(i => i >= 0);
  const at = cut.length ? Math.min(...cut) : line.length;
  return [line.slice(0, at), line.slice(at)];
}
function replaceLineAt(lines, i, v){ const out = [...lines]; out[i] = v; return out.join('\n'); }

/* Rewrite / insert / clear the "Lane: " prefix on one line, keeping status/note/xN. */
export function setLane(text, srcLine, lane){
  const lines = text.split(/\r?\n/);
  if(srcLine < 0 || srcLine >= lines.length) return text;
  const raw = lines[srcLine];
  const name = String(lane).trim();
  if(name && (CONFIG_KEYS.test(name) || /[[\]]/.test(name) || name.startsWith('//') || name.includes(': ')))
    return text;
  /* split off any existing "Lane: " prefix (the char class parse uses, no brackets) */
  const m = raw.match(/^([^[\]]+?)\s*:\s+(.*)$/);
  const body = m ? m[2] : raw;
  if(!name){
    /* clearing: refuse if the remaining body still contains ": " — parse would re-lane it */
    if(/: /.test(body)) return text;
    return replaceLineAt(lines, srcLine, body);
  }
  return replaceLineAt(lines, srcLine, name + ': ' + body);
}

/* Insert " -- note" on a note-less line (honours token order: AFTER any xN, before
   -> url). parse peels xN from the end of the title LAST, so the on-source order is
   "Title xN -- note" — headCut only cuts at " -- "/" -> ", so xN rides along inside
   `head` for free; do not also strip it here (that would land the note BEFORE xN,
   which parse would then read as note = "note xN", silently destroying the span). */
export function addNote(text, srcLine, note){
  const n = String(note).trim();
  if(!n || /[\n[\]]/.test(n) || n.includes(' -- ')) return text;
  const lines = text.split(/\r?\n/);
  if(srcLine < 0 || srcLine >= lines.length) return text;
  const line = lines[srcLine];
  if(/\s--\s/.test(line)) return text;   // already has a note — not this function's job
  const [head, tail] = headCut(line);    // head KEEPS any xN; tail begins at " -> url"
  return replaceLineAt(lines, srcLine, head.trimEnd() + ' -- ' + n + tail);
}

/* Insert "[status]" on a status-less line. Status sits BEFORE xN on the source
   ("Core: A [risk] x2"), so unlike addNote this one does peel the token off the
   head and re-append it after the inserted bracket. */
export function addStatus(text, srcLine, status){
  if(!STATUSES.includes(status)) return text;
  const lines = text.split(/\r?\n/);
  if(srcLine < 0 || srcLine >= lines.length) return text;
  const line = lines[srcLine];
  if(/\[[^\]]+\]/.test(line)) return text;   // already has a status
  const [head, tail] = headCut(line);
  const xm = head.match(/\s+x\d+\s*$/i);
  const stem = xm ? head.slice(0, xm.index) : head;
  const xtok = xm ? head.slice(xm.index) : '';
  return replaceLineAt(lines, srcLine, stem.trimEnd() + ' [' + status + ']' + xtok + tail);
}

/* Ensure a horizon's header line exists. Appends "HorizonName" at the END if
   absent — register row order is by model horizon index, so source position is
   irrelevant; existing srcLines are unshifted, so a re-parse keeps them valid.
   Needed because moveItem/addItemLine both require a literal header line for an
   otherwise-empty target horizon (the common default Now/Next/Later case where
   only NOW is ever written). */
export function ensureHorizonHeader(text, model, h){
  const name = model.horizons[h];
  const has = text.split(/\r?\n/).some(l => l.trim().replace(/:$/, '').toLowerCase() === name.toLowerCase());
  return has ? text : text.replace(/\s*$/, '') + '\n' + name;
}
