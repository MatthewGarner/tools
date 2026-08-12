/* /timeline DSL → model. No DOM. Dates live as integer days since the epoch
   (UTC), so the renderer and the slip differ do plain arithmetic. Soft
   line-numbered warnings, never hard errors; srcLine on every item. */
import {PALETTE_NAMES} from '../assets/series.js';

const DAY = 86400000;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export const STATUSES = ['done', 'risk', 'fixed'];

/* an item whose single date is a legitimate point, not false precision:
   [done] happened, [fixed] is an external fact nobody here controls. A BARE
   single date is neither — it keeps the ±? nag. One predicate, because render.js
   MEASURES this string in two places and DRAWS it in a third; disagreement
   reserves width for a mark that never appears. */
export const isPointDate = it => it.status === 'done' || it.status === 'fixed';

export function parseDate(s){
  const m = String(s).trim().match(/^(\d{4})-(\d{2})(?:-(\d{2}))?$/);
  if(!m) return null;
  const y = +m[1], mo = +m[2], d = m[3] ? +m[3] : 15;   // bare month → its 15th
  if(mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  const t = Date.UTC(y, mo - 1, d);
  const dt = new Date(t);
  if(dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d) return null;   // e.g. Feb 30
  return Math.round(t / DAY);
}
export const dayToISO = day => new Date(day * DAY).toISOString().slice(0, 10);
export function fmtDay(day, {month = false} = {}){
  const d = new Date(day * DAY);
  return (month ? '' : d.getUTCDate() + ' ') + MONTHS[d.getUTCMonth()] + ' ' + d.getUTCFullYear();
}

const DATE_RE = /\d{4}-\d{2}(?:-\d{2})?/;

export function parseLead(s){
  const m = String(s).trim().match(/^(\d+)\s*(d|w)$/i);
  if(!m) return null;
  const n = +m[1];
  if(!Number.isSafeInteger(n) || n < 1) return null;
  return n * (m[2].toLowerCase() === 'w' ? 7 : 1);
}

export function parse(text){
  const model = {title: '', palette: 'ocean', accent: null, today: null, verdict: null,
    lanes: [], items: [], warnings: []};
  const lines = String(text).split(/\r?\n/);
  const laneSet = new Set();

  for(let ln = 0; ln < lines.length; ln++){
    const line = lines[ln].trim();
    if(!line || line.startsWith('//')) continue;
    const warn = msg => model.warnings.push('line ' + (ln + 1) + ': ' + msg);

    /* a dated value means a milestone whose lane shares a config key's name —
       except today:, whose value IS a date, and verdict:, whose value is free
       prose. Both are exempt for the same reason: the guard exists to rescue a
       LANE that happens to be named like a key, and neither of these keys can be
       a lane. Without the verdict exemption a perfectly ordinary sentence in a
       DATE tool — "verdict: We ship by 2027-03" — was silently reparsed as a
       phantom milestone in a lane called "verdict", losing the verdict entirely
       (found in review, 2026-07-31). */
    const DATE_EXEMPT = /^(today|verdict)$/i;
    const config = line.match(/^(title|palette|accent|today|verdict)\s*:\s*(.*)$/i);
    if(config && !(DATE_RE.test(config[2]) && !DATE_EXEMPT.test(config[1]))){
      const key = config[1].toLowerCase(), val = config[2].replace(/(^|\s)\/\/.*$/, '').trim();   // trailing comments are comments here too
      if(key === 'title') model.title = val;
      else if(key === 'verdict') model.verdict = val;   // raw; assets/verdict.js owns what off/empty mean
      else if(key === 'palette'){
        const p = val.toLowerCase();
        if(PALETTE_NAMES.includes(p)) model.palette = p;
        else warn('unknown palette "' + val + '" — options: ' + PALETTE_NAMES.join(', '));
      } else if(key === 'accent'){
        if(/^#[0-9a-fA-F]{6}$/.test(val)) model.accent = val;
        else warn('accent wants a 6-digit hex like #C05621');
      } else {
        const d = parseDate(val);
        if(d === null) warn('today wants a date like 2026-07-06');
        else model.today = d;
      }
      continue;
    }

    /* item line: [Lane:] Label DATE [.. DATE] [status] [// note] */
    let body = line, note = null;
    const noteM = body.match(/\/\/(.*)$/);
    if(noteM){ note = noteM[1].trim() || null; body = body.slice(0, noteM.index).trim(); }

    let status = null, leadDays = null;
    body = body.replace(/\[([^\]]+)\]/g, (m, t) => {
      const tag = t.trim().toLowerCase();
      if(STATUSES.includes(tag)){
        if(status) warn('more than one status — using [' + status + ']');
        else status = tag;
      } else if(/^lead\s*:/i.test(tag)){
        const parsed = parseLead(tag.slice(tag.indexOf(':') + 1));
        if(parsed === null) warn('decision lead wants a positive duration like [lead: 6w]');
        else if(leadDays !== null) warn('more than one decision lead — using the first');
        else leadDays = parsed;
      } else warn('unknown tag [' + t.trim() + '] — use ' + STATUSES.join(' / ') + ' / lead: 6w');
      return '';
    }).trim();

    const firstDate = body.match(DATE_RE);
    if(!firstDate){
      const looksConfig = body.match(/^([a-z][a-z0-9_-]*)\s*:\s*\S/i);
      if(looksConfig && !body.slice(looksConfig[1].length + 1).trim().includes(' '))
        warn('unknown config "' + looksConfig[1] + '"');
      else warn('no date on this line — milestones need one (YYYY-MM or YYYY-MM-DD)');
      continue;
    }

    let head = body.slice(0, firstDate.index).trim();
    const dateText = body.slice(firstDate.index).trim();
    let lane = '';
    const laneM = head.match(/^([^:]+):\s*(.*)$/);
    if(laneM){ lane = laneM[1].trim(); head = laneM[2].trim(); }
    if(!head){ warn('missing label'); head = '(unnamed)'; }

    const dates = dateText.split(/\s*(?:\.\.|–|—)\s*/).map(s => s.trim()).filter(Boolean);
    let p50 = parseDate(dates[0]);
    let p90 = dates.length > 1 ? parseDate(dates[1]) : null;
    if(p50 === null){ warn('couldn’t read the date "' + dates[0] + '"'); continue; }
    if(dates.length > 1 && p90 === null){
      warn('couldn’t read the second date "' + dates[1] + '" — treating as a single date');
    }
    if(dates.length > 2) warn('more than two dates — using the first two');

    let single = p90 === null;
    if(single) p90 = p50;
    if(p90 < p50){
      warn('range reversed — swapped so P50 comes first');
      const t = p50; p50 = p90; p90 = t;
    }
    if(status === 'done' || status === 'fixed'){
      /* "earlier", not "first": the reversed-range swap above already ran, so a
         "2026-12 .. 2026-10" input genuinely keeps the earlier of the two. */
      if(!single) warn('[' + status + '] with a range — ' + (status === 'done'
        ? 'it happened on a date; using the earlier'
        : 'a fixed date has no spread; using the earlier'));
      p90 = p50;
      single = true;
    } else if(single){
      warn('"' + head.slice(0, 30) + '" has no range — a single date claims certainty ' +
        'nobody has (add ".. P90", or mark it [fixed])');
    }
    if(leadDays !== null && status !== 'fixed'){
      warn('[lead: …] only belongs on a [fixed] external event — ignored');
      leadDays = null;
    }

    if(!laneSet.has(lane)){ laneSet.add(lane); model.lanes.push(lane); }
    model.items.push({lane, label: head, p50, p90, rawDates: dateText, status, note, single, leadDays, srcLine: ln});
  }
  return model;
}
