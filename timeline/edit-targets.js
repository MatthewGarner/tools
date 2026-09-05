/* Pure text rewrites for /timeline edit-in-place. No DOM; the text is the model. */
import {parse, parseDate, parseLead, parseStarted, STATUSES, STYLES, FONTS} from './parse.js';

const CONFIG_LINE = /^(title|palette|accent|font|style|today|verdict)\s*:/i;
const DATE_RE = /\d{4}-\d{2}(?:-\d{2})?/;

export const validators = {
  label(v){
    const s = v.trim();
    return s.length > 0 && !s.includes('\n') && !s.startsWith('//') &&
      !DATE_RE.test(s) && !CONFIG_LINE.test(s) && !s.includes('[');
  },
  started(v){ return !/[\r\n]/.test(v) && (!v.trim() || parseStarted(v) !== null); },
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
  const date = line.match(DATE_RE);
  if(!date || date.index == null) return line;
  const head = line.slice(0, date.index);
  const lane = head.match(/^([^:]+):\s*/);
  const labelStart = lane ? lane[0].length : 0;
  const label = head.slice(labelStart).trimEnd();
  if(label !== oldRaw) return line;
  const separator = head.slice(labelStart + label.length);
  return head.slice(0, labelStart) + newRaw.trim() + separator + line.slice(date.index);
}

export function editDates(line, oldRaw, newRaw){
  if(!validators.dates(newRaw) || parse(line).items[0]?.rawDates !== oldRaw) return line;
  // Tags can precede or interrupt dates. Mask them before locating the finish
  // interval so a started date (or one in the note) is never mistaken for P50.
  const noteAt = line.indexOf('//'), body = noteAt < 0 ? line : line.slice(0, noteAt);
  const masked = body.replace(/\[[^\]]*\]/g, tag => ' '.repeat(tag.length));
  const dates = [...masked.matchAll(/\d{4}-\d{2}(?:-\d{2})?/g)].slice(0, 2);
  if(!dates.length) return line;
  const start = dates[0].index, end = dates.at(-1).index + dates.at(-1)[0].length;
  const tags = line.slice(start, end).match(/\[[^\]]*\]/g) || [];
  return line.slice(0, start) + newRaw.trim() + (tags.length ? ' ' + tags.join(' ') : '') + line.slice(end);
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
  /* A decision lead only has meaning with [fixed]. Do not leave a syntactically
     valid but semantically orphaned `[lead: …]` behind after a card-menu status
     edit; text remains the model, so the rewrite must make the changed state
     clear in the source as well as in the render. */
  const noteM = line.match(/\s*\/\/.*$/);
  const head = noteM ? line.slice(0, noteM.index) : line;
  const tail = noteM ? line.slice(noteM.index) : '';
  const compatible = st === 'fixed' ? head.replace(/\s*\[\s*started\s*:\s*[^\]]+\]/ig, '') : head;
  const withoutStatus = compatible.replace(/\s*\[\s*(?:done|risk|fixed)\s*\]/ig, '').trimEnd();
  const leadM = withoutStatus.match(/\s*(\[\s*lead\s*:\s*[^\]]+\])\s*$/i);
  const withoutLead = (leadM ? withoutStatus.slice(0, leadM.index) : withoutStatus).trimEnd();
  if(!st) return withoutLead + tail;
  if(st === 'fixed')
    return withoutLead + ' [fixed]' + (leadM ? ' ' + leadM[1].trim() : '') + tail;
  return withoutLead + ' [' + st + ']' + tail;
}

/* Set or clear the decision lead on a fixed external event. The parser owns the
   duration grammar; this rewrite only accepts that grammar and normalises the
   authored token. A lead on a forecast is deliberately a no-op: native editing
   must not create source which the canonical parser immediately rejects. */
export function setLead(line, value){
  const raw = String(value || '').trim();
  const noteM = line.match(/\s*\/\/.*$/);
  const head = (noteM ? line.slice(0, noteM.index) : line).trimEnd();
  const tail = noteM ? line.slice(noteM.index) : '';
  const withoutLead = head.replace(/\s*\[\s*lead\s*:\s*[^\]]+\]/ig, '').trimEnd();
  if(!raw) return withoutLead + tail;
  if(!/\[\s*fixed\s*\]/i.test(withoutLead) || parseLead(raw) === null) return line;
  const match = raw.match(/^(\d+)\s*(d|w)$/i);
  const canonical = match[1] + match[2].toLowerCase();
  return withoutLead + ' [lead: ' + canonical + ']' + tail;
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

/* Exact rendered identity of a milestone inserted from the artefact. Source
   lines in /timeline are 0-based, so a line inserted after `afterLine` renders
   at afterLine + 1. Keeping this as a pure companion to addItemLine prevents
   the app from guessing line conventions while it waits for the fresh SVG. */
export function addedItemTarget(add, label){
  return {kind: 'label', line: add.afterLine + 1,
    data: {raw: String(label || 'New milestone').trim() || 'New milestone'}};
}

export function removeItemLine(text, srcLine){
  return parse(text).items.some(i => i.srcLine === srcLine);
}

/* An actual start is an optional work fact. Keep comments literal, and never
   introduce a start on an external fixed event. Clearing also repairs bad tags. */
export function editStarted(line, value){
  const raw = String(value ?? '').trim();
  if(!validators.started(String(value ?? ''))) return line;
  const note = line.match(/\s*\/\/.*$/);
  const head = (note ? line.slice(0, note.index) : line).trimEnd();
  const tail = note ? line.slice(note.index) : '';
  if(raw && /\[\s*fixed\s*\]/i.test(head)) return line;
  const body = head.replace(/\s*\[\s*started\s*:[^\]]*\]/ig, '').trimEnd();
  return body + (raw ? ' [started: ' + raw + ']' : '') + tail;
}

/* The picker writes the same config as the source. Collapse all declarations
   so an earlier setting cannot reappear later; dated lane names are items. */
export function setConfig(text, key, value){
  key = String(key).toLowerCase();
  if(!/^(title|palette|accent|font|style|today|verdict)$/.test(key)) return text;
  let raw = String(value ?? '').trim();
  if(/[\r\n]/.test(raw)) return text;
  if(raw && key === 'style'){
    raw = raw.toLowerCase();
    if(!STYLES.includes(raw)) return text;
  }
  if(raw && key === 'font'){
    const font = FONTS.find(name => name.toLowerCase() === raw.toLowerCase());
    if(!font) return text;
    raw = font;
  }
  const model = parse(text), itemLines = new Set(model.items.map(item => item.srcLine));
  const lines = String(text).split(/\r?\n/), re = new RegExp('^' + key + '\\s*:', 'i');
  const hits = lines.map((line, index) => !itemLines.has(index) && re.test(line.trim()) ? index : -1).filter(index => index >= 0);
  if(hits.length){
    const last = hits.at(-1);
    return lines.flatMap((line, index) => hits.includes(index) ? index === last && raw ? [key + ': ' + raw] : [] : [line]).join('\n');
  }
  if(!raw) return text;
  if(!String(text).trim()) return key + ': ' + raw;
  lines.splice(model.items[0]?.srcLine ?? lines.length, 0, key + ': ' + raw);
  return lines.join('\n');
}
