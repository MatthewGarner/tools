/* Pure text rewrites for /timeline edit-in-place. No DOM; the text is the model. */
import {parse, parseDate, STATUSES} from './parse.js';

const CONFIG_LINE = /^(title|palette|accent|today)\s*:/i;
const DATE_RE = /\d{4}-\d{2}(?:-\d{2})?/;

export const validators = {
  label(v){
    const s = v.trim();
    return s.length > 0 && !s.includes('\n') && !s.startsWith('//') &&
      !DATE_RE.test(s) && !CONFIG_LINE.test(s) && !s.includes('[');
  },
  dates(v){
    const parts = v.trim().split(/\s*(?:\.\.|–|—)\s*/).filter(Boolean);
    if(parts.length < 1 || parts.length > 2) return false;
    return parts.every(p => parseDate(p) !== null);
  },
  /* a lane is a bare prefix — no brackets (would look like a status), no date,
     no comment marker, and no ": " (parse would re-split it into a nested lane) */
  lane(v){
    const s = v.trim();
    return s.length > 0 && !s.includes('\n') && !/[[\]]/.test(s) &&
      !DATE_RE.test(s) && !s.includes('//') && !s.includes(': ') && !CONFIG_LINE.test(s + ':');
  },
  /* a note is free text after // — anything but a newline (parse peels the note
     off FIRST, so a stray [ or : inside it can't confuse the status/lane passes) */
  note(v){ return !v.includes('\n'); },
};

export function editLabel(line, oldRaw, newRaw){
  const i = line.indexOf(oldRaw);
  if(i < 0) return line;
  return line.slice(0, i) + newRaw.trim() + line.slice(i + oldRaw.length);
}

export function editDates(line, oldRaw, newRaw){
  const i = line.indexOf(oldRaw);
  if(i < 0) return line;
  return line.slice(0, i) + newRaw.trim() + line.slice(i + oldRaw.length);
}

/* SET a milestone's status to an explicit value (the generalisation of the old
   cycleStatus's strip+insert — a coarse tap picks the value from a marked list
   rather than blind-stepping; a fine click still steps because edit-in-place
   hands us the next value from the cycle array). '' clears the tag; an unknown
   value is a no-op.
   Comment-aware: the [tag] lands before the // note, never inside it. Both the
   FINE instant-step (edit-in-place hands us the cycled-to value) and the COARSE
   picker (the picked value) route here, so one setter serves both. */
export function setStatus(line, status){
  const st = String(status || '');
  if(st && !STATUSES.includes(st)) return line;
  const stripped = line.replace(/\s*\[[^\]]+\]/, '');
  if(!st) return stripped;
  const noteM = stripped.match(/\s*\/\/.*$/);
  const head = noteM ? stripped.slice(0, noteM.index) : stripped;
  const tail = noteM ? stripped.slice(noteM.index) : '';
  return head.replace(/\s*$/, '') + ' [' + st + ']' + tail;
}

/* Rewrite / insert / clear the "Lane: " prefix on one milestone line, keeping
   the label, dates, status and note. Comment-aware (a // note may itself hold a
   ':'); "New lane…" just writes a fresh prefix — a lane exists the moment one
   item carries it. An invalid name (bracket / date / ': ') is a no-op. */
export function setLane(line, newLane){
  const name = String(newLane).trim();
  if(name && !validators.lane(name)) return line;
  const noteM = line.match(/\s*\/\/.*$/);
  const head = (noteM ? line.slice(0, noteM.index) : line).trimEnd();
  const tail = noteM ? line.slice(noteM.index) : '';
  const laneM = head.match(/^([^:]+):\s*(.*)$/);
  const body = (laneM && !DATE_RE.test(laneM[1])) ? laneM[2] : head.trimStart();
  return (name ? name + ': ' + body : body) + tail;
}

/* Rewrite / add / clear the "// note" tail on one milestone line. An empty
   newNote strips the note; a line with no note yet grows one. oldNote is
   accepted for a symmetric signature with editLabel/editDates (the note is
   found positionally, so it isn't needed to locate the edit). */
export function editNote(line, oldNote, newNote){
  const n = String(newNote).trim();
  const noteM = line.match(/\s*\/\/.*$/);
  const head = (noteM ? line.slice(0, noteM.index) : line).trimEnd();
  return n ? head + ' // ' + n : head;
}

/* new milestones land after the last item (else after the config block),
   dated one month either side of today so they render mid-plot, unmissable.
   With a lane, the new line is lane-prefixed and lands after THAT lane's
   last item (document order); a lane with no items falls back to the
   unprefixed, whole-document behaviour below. */
export function addItemLine(text, todayISO, lane){
  const model = parse(text);
  const ym = todayISO.slice(0, 7);
  const plus = m => {
    const [y, mo] = ym.split('-').map(Number);
    const d = new Date(Date.UTC(y, mo - 1 + m, 1));
    return d.toISOString().slice(0, 7);
  };
  if(lane){
    const laneItems = model.items.filter(i => i.lane === lane);
    if(laneItems.length){
      const newLine = lane + ': New milestone ' + plus(1) + ' .. ' + plus(3);
      return {afterLine: laneItems[laneItems.length - 1].srcLine, newLine, select: 'New milestone'};
    }
  }
  const newLine = 'New milestone ' + plus(1) + ' .. ' + plus(3);
  if(model.items.length)
    return {afterLine: model.items[model.items.length - 1].srcLine, newLine, select: 'New milestone'};
  const lines = text.split(/\r?\n/);
  let last = -1;
  for(let i = 0; i < lines.length; i++){
    const t = lines[i].trim();
    if(!t || t.startsWith('//')) continue;
    if(CONFIG_LINE.test(t)) last = i;
    else break;
  }
  return {afterLine: Math.max(0, last), newLine, select: 'New milestone'};
}

export function removeItemLine(text, srcLine){
  return parse(text).items.some(i => i.srcLine === srcLine);
}
