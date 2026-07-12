/* Bets DSL → model. Grammar (2-space indents, `//` comments):
     title:/unit:/palette:/accent:   config, before the first group
     Group name                       indent 0 (not a config key)
       Bet name: stake N, odds N-N%, payoff N-N    indent 2
         kill: free text [by YYYY-MM-DD]           indent 4
   Point values parse as [v, v]; ranges accept - or –. Soft, line-numbered
   warnings only (never throws); srcLine on every group/bet/kill. */

const CONFIG = new Set(['title', 'unit', 'palette', 'accent']);
const RANGE = /^(-?[\d.]+)\s*(?:[-–]\s*(-?[\d.]+))?%?$/;   // "30-50", "30–50", "120" (point)

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
      curBet.kill = parseKill(m[1], srcLine);
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

  return model;
}

function parseBet(body, srcLine, warn){
  const bet = {name: '', stake: null, odds: null, payoff: null, kill: null, srcLine};
  const colon = body.indexOf(':');
  if(colon < 0){ bet.name = body; warn(srcLine, 'Bet has no `: stake …, odds …, payoff …` — name only.'); return bet; }
  bet.name = body.slice(0, colon).trim();
  const attrs = body.slice(colon + 1).split(',');
  for(const a of attrs){
    const mm = a.trim().match(/^(stake|odds|payoff)\s+(.+)$/i);
    if(!mm){ if(a.trim()) warn(srcLine, 'Unrecognised attribute `' + a.trim() + '` — expected stake/odds/payoff.'); continue; }
    const key = mm[1].toLowerCase(), val = parseRange(mm[2].trim());
    if(!val){ warn(srcLine, 'Could not read a number range from `' + mm[2].trim() + '`.'); continue; }
    bet[key] = val;
  }
  for(const k of ['stake', 'odds', 'payoff']) if(!bet[k]) warn(srcLine, 'Bet `' + bet.name + '` is missing ' + k + '.');
  if(bet.odds && (bet.odds[0] < 0 || bet.odds[1] > 100)) warn(srcLine, 'Odds should be within 0–100%.');
  return bet;
}

function parseRange(s){
  const m = s.match(RANGE);
  if(!m) return null;
  const lo = parseFloat(m[1]);
  const hi = m[2] === undefined ? lo : parseFloat(m[2]);
  if(Number.isNaN(lo) || Number.isNaN(hi)) return null;
  return [lo, hi];
}

function parseKill(s, srcLine){
  const text = s.trim();
  const m = text.match(/^(.*?)\s+by\s+(\d{4}-\d{2}-\d{2})$/);   // only a real ISO date is a `by`
  return m ? {text: m[1].trim(), by: m[2], srcLine} : {text, by: null, srcLine};
}
