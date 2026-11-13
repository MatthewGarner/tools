/* Bets DSL → model. Grammar (2-space indents, `//` comments):
     title:/unit:/palette:/accent:   config, before the first group
     Group name                       indent 0 (not a config key)
       Bet name: stake N, odds N-N%, payoff N-N    indent 2
         kill: free text [by YYYY-MM-DD]           indent 4
   Point values parse as [v, v]; ranges accept - or –. Soft, line-numbered
   warnings only (never throws); srcLine on every group/bet/kill. Invalid
   numeric ranges stay unscored instead of being silently reordered/clamped.
   Every bet also receives a group-qualified occurrenceKey for snapshot diffs:
   visible duplicate names remain distinct without pretending the DSL has a
   durable authored id. */

const CONFIG = new Set(['title', 'unit', 'palette', 'accent']);
/* One number reader for stake, payoff and odds. The loose pattern only finds
   the shape ("30-50", "30–50%", "120", "1,000-2,500"); readNumber then insists
   each end is a real number: digits with at most one decimal point, and commas
   only as thousands separators in groups of three. */
const RANGE = /^(-?[\d.,]+)\s*(?:[-–]\s*(-?[\d.,]+))?\s*(%?)$/;
const PLAIN_NUMBER = /^(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d*)?$|^\.\d+$/;

export function readNumber(token){
  const text = String(token ?? '').trim(), negative = text.startsWith('-'), body = negative ? text.slice(1) : text;
  if(!PLAIN_NUMBER.test(body)) return null;
  const value = Number(body.replace(/,/g, ''));
  return Number.isFinite(value) ? (negative ? -value : value) : null;
}

/* {lo, hi, isRange, percent, text} or null. `text` is the authored wording of the
   value (ends joined by an en dash, no % sign) so surfaces can show it as written. */
export function readRange(raw){
  const m = String(raw ?? '').trim().match(RANGE);
  if(!m) return null;
  const lo = readNumber(m[1]), hi = m[2] === undefined ? lo : readNumber(m[2]);
  if(lo === null || hi === null) return null;
  return {lo, hi, isRange: m[2] !== undefined, percent: m[3] === '%',
    text: m[2] === undefined ? m[1] : m[1] + '–' + m[2]};
}

/* attribute separator: a comma, unless it sits between two digits (a thousands
   separator, or a malformed number that is reported rather than split in two) */
function splitAttrs(text){
  const out = [];
  let cur = '';
  for(let i = 0; i < text.length; i++){
    const ch = text[i];
    if(ch === ',' && !(/\d/.test(text[i - 1] || '') && /\d/.test(text[i + 1] || ''))){ out.push(cur); cur = ''; }
    else cur += ch;
  }
  out.push(cur);
  return out;
}

export function parse(text){
  const model = {title: '', unit: '', palette: '', accent: '', groups: [], warnings: []};
  const warn = (line, msg) => model.warnings.push({line, msg});
  const lines = String(text ?? '').split('\n');
  let seenGroup = false, curGroup = null, curBet = null;

  lines.forEach((raw, i) => {
    const srcLine = i + 1;
    const noComment = raw.replace(/\s*\/\/.*$/, '');
    if(!noComment.trim()) return;                       // blank or comment-only
    const indent = noComment.match(/^ */)[0].length;
    const body = noComment.trim();

    if(indent >= 4){                                    // kill child
      const m = body.match(/^kill:\s*(.*)$/i);
      if(!m){ warn(srcLine, 'Indented line is not a `kill:` — ignored.'); return; }
      if(!curBet){ warn(srcLine, '`kill:` has no bet above it — ignored.'); return; }
      curBet.kill = parseKill(m[1], srcLine, warn);
      return;
    }

    if(indent >= 2){                                    // bet
      if(!curGroup){                                    // bet before any group → implicit "Bets"
        warn(srcLine, 'Bet before any group — put it under a group heading; filed under "Bets".');
        curGroup = {name: 'Bets', srcLine, bets: []};
        model.groups.push(curGroup);
        seenGroup = true;
      }
      curBet = parseBet(body, srcLine, warn);
      curGroup.bets.push(curBet);
      return;
    }

    // indent 0 — config key or group heading
    const cfg = body.match(/^([A-Za-z][\w-]*)\s*:\s*(.*)$/);
    if(cfg && CONFIG.has(cfg[1].toLowerCase())){
      if(seenGroup){ warn(srcLine, 'Config key after the first group is ignored — put `' + cfg[1] + ':` at the top.'); return; }
      model[cfg[1].toLowerCase()] = cfg[2].trim();
      return;
    }
    if(cfg && !seenGroup){                              // known-shape config line, unknown key
      warn(srcLine, 'Unknown config key `' + cfg[1] + '` — ignored.');
      return;
    }
    // otherwise: a group heading (strip a trailing colon if present)
    curGroup = {name: body.replace(/:\s*$/, ''), srcLine, bets: []};
    curBet = null;
    seenGroup = true;
    model.groups.push(curGroup);
  });

  assignOccurrenceKeys(model);
  return model;
}

function parseBet(body, srcLine, warn){
  const bet = {name: '', stake: null, odds: null, payoff: null, kill: null, srcLine, authored: {}};
  const colon = body.indexOf(':');
  if(colon < 0){ bet.name = body; warn(srcLine, 'Bet has no `: stake …, odds …, payoff …` — name only.'); return bet; }
  bet.name = body.slice(0, colon).trim();
  const attrs = splitAttrs(body.slice(colon + 1));
  const seen = new Set(), invalid = new Set();
  for(const a of attrs){
    const mm = a.trim().match(/^(stake|odds|payoff)\s+(.+)$/i);
    if(!mm){ if(a.trim()) warn(srcLine, 'Unrecognised attribute `' + a.trim() + '` — expected stake/odds/payoff.'); continue; }
    const key = mm[1].toLowerCase(), raw = mm[2].trim(), read = readRange(raw), val = read && [read.lo, read.hi];
    if(seen.has(key)){
      invalid.add(key);
      bet[key] = null;
      warn(srcLine, capitalize(key) + ' is declared more than once — this bet is excluded from simulation.');
      continue;
    }
    seen.add(key);
    if(!val){
      invalid.add(key);
      warn(srcLine, 'Could not read a valid ' + key + ' range from `' + raw +
        '` (a number needs digits and at most one decimal point; commas only as thousands separators) — this bet is excluded from simulation.');
      continue;
    }
    if(val[0] > val[1]){
      invalid.add(key);
      warn(srcLine, capitalize(key) + ' range must run low to high — this bet is excluded from simulation.');
      continue;
    }
    if((key === 'stake' || key === 'payoff') && val[0] < 0){
      invalid.add(key);
      warn(srcLine, capitalize(key) + ' cannot be negative — this bet is excluded from simulation.');
      continue;
    }
    if(key === 'odds' && (val[0] < 0 || val[1] > 100)){
      invalid.add(key);
      warn(srcLine, 'Odds must stay within 0–100% — this bet is excluded from simulation.');
      continue;
    }
    if(key !== 'odds' && read.percent) warn(srcLine, 'A % sign on ' + key + ' is ignored — ' + key + ' is an amount, only odds take a %.');
    if(key === 'odds' && !read.percent && val[1] <= 1 && val[1] > 0)
      warn(srcLine, 'Odds `' + raw + '` were read as ' + val[0] + '%' + (read.isRange ? '–' + val[1] + '%' : '') +
        '; write ' + scaled(val[0]) + (read.isRange ? '-' + scaled(val[1]) : '') + '% for ' + scaled(val[0]) +
        (read.isRange ? ' to ' + scaled(val[1]) : '') + ' percent.');
    if(!invalid.has(key)){ bet[key] = val; bet.authored[key] = read.text; }
  }
  for(const k of ['stake', 'odds', 'payoff']) if(!seen.has(k)) warn(srcLine, 'Bet `' + bet.name + '` is missing ' + k + '.');
  return bet;
}

const capitalize = s => s.charAt(0).toUpperCase() + s.slice(1);
const scaled = v => String(Math.round(v * 1e6) / 1e4);   // 0.3 -> "30"

function realDate(iso){
  const [y, mo, d] = iso.split('-').map(Number), t = new Date(Date.UTC(y, mo - 1, d));
  return t.getUTCFullYear() === y && t.getUTCMonth() === mo - 1 && t.getUTCDate() === d;
}

function parseKill(s, srcLine, warn){
  const text = s.trim();
  const m = text.match(/^(.*?)\s+by\s+(\d{4}-\d{2}-\d{2})$/);   // an ISO-shaped date is a `by`
  if(m && !realDate(m[2])) warn(srcLine, 'Kill date ' + m[2] + ' is not a real calendar date — check the day and month.');
  return m ? {text: m[1].trim(), by: m[2], srcLine} : {text, by: null, srcLine};
}

const identityPart = value => String(value ?? '').toLowerCase().replace(/\s+/g, ' ').trim();

/* No authored IDs are introduced by this hardening pass. Instead, identity is
   the visible group occurrence + visible bet occurrence inside that group.
   Adding an unrelated line therefore does not retag existing bets, while two
   identically named bets can never overwrite one another in a Map. */
function assignOccurrenceKeys(model){
  const groupSeen = new Map();
  for(const group of model.groups){
    const groupName = identityPart(group.name);
    const groupOccurrence = (groupSeen.get(groupName) || 0) + 1;
    groupSeen.set(groupName, groupOccurrence);
    const betSeen = new Map();
    for(const bet of group.bets){
      const betName = identityPart(bet.name);
      const betOccurrence = (betSeen.get(betName) || 0) + 1;
      betSeen.set(betName, betOccurrence);
      bet.occurrenceKey = JSON.stringify([groupName, groupOccurrence, betName, betOccurrence]);
    }
  }
}
