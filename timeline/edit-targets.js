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

/* status cycles '' → done → risk → '' on the P50 diamond */
export function cycleStatus(line, oldStatus){
  const order = ['', ...STATUSES];
  const next = order[(order.indexOf(oldStatus || '') + 1) % order.length];
  const stripped = line.replace(/\s*\[[^\]]+\]/, '');
  if(!next) return stripped;
  const noteM = stripped.match(/\s*\/\/.*$/);
  const head = noteM ? stripped.slice(0, noteM.index) : stripped;
  const tail = noteM ? stripped.slice(noteM.index) : '';
  return head.replace(/\s*$/, '') + ' [' + next + ']' + tail;
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
