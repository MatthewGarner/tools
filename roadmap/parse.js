/* Roadmap DSL → model. No DOM. */
export const DEFAULT_HORIZONS = ['Now', 'Next', 'Later'];
export const STATUS_ALIASES = {
  'done':'done', 'shipped':'done',
  'doing':'doing', 'in-progress':'doing', 'wip':'doing', 'started':'doing',
  'risk':'risk', 'at-risk':'risk',
  'blocked':'blocked', 'stuck':'blocked',
};
export const STATUS_LABEL = {done:'Done', doing:'In progress', risk:'At risk', blocked:'Blocked'};
export const PALETTE_NAMES = ['ocean', 'slate', 'ember', 'plum'];

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

export function genHorizons(spec){
  const m = spec.match(/^(monthly|quarterly)\s+from\s+(.+?)\s*x\s*(\d+)$/i);
  if(!m) return null;
  const n = Math.min(8, Math.max(2, parseInt(m[3], 10)));
  if(m[1].toLowerCase() === 'quarterly'){
    const q = m[2].match(/^Q([1-4])\s*(\d{4})$/i);
    if(!q) return null;
    let qi = parseInt(q[1], 10) - 1, yr = parseInt(q[2], 10);
    const out = [];
    for(let i = 0; i < n; i++){
      out.push('Q' + (qi + 1) + ' ' + yr);
      qi++; if(qi === 4){ qi = 0; yr++; }
    }
    return out;
  }
  const mm = m[2].match(/^([A-Za-z]+)\s+(\d{4})$/);
  if(!mm) return null;
  let mi = MONTHS.findIndex(x => mm[1].toLowerCase().startsWith(x.toLowerCase()));
  if(mi < 0) mi = MONTHS.findIndex(x => x.toLowerCase().startsWith(mm[1].toLowerCase().slice(0, 3)));
  if(mi < 0) return null;
  let yr = parseInt(mm[2], 10);
  const out = [];
  for(let i = 0; i < n; i++){
    out.push(MONTHS[mi] + ' ' + yr);
    mi++; if(mi === 12){ mi = 0; yr++; }
  }
  return out;
}

/* Continue the board's cadence past its last column, so an item that runs off the
   edge can still NAME its true end. 24 steps is far more than any board needs. */
export function horizonContinuation(horizons){
  const last = horizons[horizons.length - 1];
  const out = [];
  const q = String(last).match(/^Q([1-4])\s*(\d{4})$/i);
  if(q){
    let qi = parseInt(q[1], 10) - 1, yr = parseInt(q[2], 10);
    for(let i = 0; i < 24; i++){ qi++; if(qi === 4){ qi = 0; yr++; } out.push('Q' + (qi + 1) + ' ' + yr); }
    return out;
  }
  const mm = String(last).match(/^([A-Za-z]{3,})\s+(\d{4})$/);
  if(!mm) return null;
  let mi = MONTHS.findIndex(x => mm[1].toLowerCase().startsWith(x.toLowerCase()));
  if(mi < 0) return null;
  let yr = parseInt(mm[2], 10);
  for(let i = 0; i < 24; i++){ mi++; if(mi === 12){ mi = 0; yr++; } out.push(MONTHS[mi] + ' ' + yr); }
  return out;
}

/* edit distance ≤ 1 (one substitution, insertion, or deletion) — enough to
   catch header typos like NOWW or Q3 2027 without fuzzy-matching real items */
function near(a, b){
  a = a.toLowerCase(); b = b.toLowerCase();
  if(a === b) return true;
  const [s, t] = a.length <= b.length ? [a, b] : [b, a];
  if(t.length - s.length > 1) return false;
  if(s.length === t.length){
    let diff = 0;
    for(let i = 0; i < s.length; i++) if(s[i] !== t[i]) diff++;
    return diff <= 1;
  }
  let i = 0, j = 0, skipped = false;
  while(i < s.length && j < t.length){
    if(s[i] === t[j]){ i++; j++; }
    else if(!skipped){ skipped = true; j++; }
    else return false;
  }
  return true;
}

const snippet = s => '"' + s.slice(0, 30) + (s.length > 30 ? '…' : '') + '"';

/* deck export compositions (roadmap/render-deck.js). `style:` is null when unset —
   the app decides the default (grid for a time axis, board otherwise). */
export const DECK_STYLES = ['board', 'focus', 'register', 'grid'];

/* Items ACTIVE in a column: those whose span covers it. On a span-free doc this is
   exactly "items written in this column", so span-free behaviour is unchanged by
   construction. Dropped items (a bet resolved against their condition) leave WIP —
   the work isn't happening — UNLESS still marked [doing]: work in flight counts
   regardless of what the fork says, and that combination warns (parse/applyWorld). */
export function activeCount(model, h){
  return model.items.filter(i => i.h <= h && h <= i.h + Math.max(1, i.span || 1) - 1)
    .filter(i => i.worldState !== 'dropped' || i.status === 'doing')
    .length;
}

/* One plain sentence per breaching column. STATES THE FACT — the tool reports what
   is true and leaves the judgement to the author (the rule the deck headline set).
   app.js appends its own "(Raise or silence …)" hint to the list. */
export function wipBreaches(model){
  if(!(model.wip > 0)) return [];
  const out = [];
  for(let h = 0; h < model.horizons.length; h++){
    const n = activeCount(model, h);
    if(n > model.wip) out.push(model.horizons[h] + ' has ' + n + ' items in flight (wip: ' + model.wip + ').');
  }
  return out;
}

/* ---------- the verdict (Swiss 6b) ----------
   One quotable line + the ONE figure it turns on. /roadmap has no dates, so
   nothing here may claim one: the material is counts per horizon, the declared
   wip limit (spans included, via activeCount) and the [risk]/[blocked] flags.
   The first horizon IS the commitment — everything past it is shaped, not
   promised — and that is the mechanism every tier names.
   It never writes the deck's `headline:`: a headline is a claim the author
   makes to a room (about copy), this is the tool arguing on the page. */

const FLAGGED = new Set(['risk', 'blocked']);
const plural = (n, one, many) => n + ' ' + (n === 1 ? one : (many || one + 's'));
/* "n of t items": noun follows t, verb follows n; a one-item board is singular
   throughout, so "0 of 1 item SITS". */
const nOfT = (n, t, one, many) => n + ' of ' + t + ' ' + (t === 1 ? one : (many || one + 's'));
const vb = (n, t, sing, plur) => (n === 1 || t === 1) ? sing : plur;

export function roadmapMetrics(model){
  if(!model || !model.items || !model.items.length) return [];
  const lanes = model.lanes.filter(Boolean).length;
  const nBets = Object.keys(model.bets || {}).length;
  return [
    plural(model.items.length, 'item'),
    plural(model.horizons.length, 'horizon'),
    lanes ? plural(lanes, 'lane') : null,
    nBets ? plural(nBets, 'bet') : null,
    model.wip > 0 ? 'Wip limit ' + model.wip : null,
  ].filter(Boolean);
}

/* ---------- verdict tiers 2/3 (2026-08-09): resolved-bet aftermath + open fork ----------
   Both walk model.items/model.bets as baked by parse() (the text world) — never
   call applyWorld themselves except the fork tier's OWN diff, which is pure and
   throws its projections away immediately (never mutates model). */

/* A dropped item's dropReason names the bet it's conditioned on, but that bet
   may itself be MOOT (its own item dropped by something else) — walk up the
   chain to the resolved (won/lost) bet actually responsible, so a cascade of
   moot bets attributes every drop to the one bet that really answered.
   Returns null when the chain never reaches a resolved bet (shouldn't happen
   for an item that's actually dropped, but a cycle-guard costs nothing). */
function rootResolvedBet(model, nameLc, visited){
  visited = visited || new Set();
  if(visited.has(nameLc)) return null;
  visited.add(nameLc);
  const b = model.bets[nameLc];
  if(!b) return null;
  if(b.effective === 'won' || b.effective === 'lost') return nameLc;
  if(b.effective === 'moot'){
    const declaring = model.items[b.itemIndex];
    if(declaring && declaring.dropReason)
      return rootResolvedBet(model, declaring.dropReason.name.toLowerCase(), visited);
  }
  return null;
}

/* Tier 2 — aftermath: a resolved bet (won OR lost — both are quotable) whose
   resolution transitively dropped items. Moot bets never speak for themselves;
   their drops attribute to the resolved root that caused the moot cascade. */
function aftermathTier(model){
  const total = model.items.length;
  const counts = {};
  for(const it of model.items){
    if(it.worldState !== 'dropped' || !it.dropReason) continue;
    const root = rootResolvedBet(model, it.dropReason.name.toLowerCase());
    if(root) counts[root] = (counts[root] || 0) + 1;
  }
  const entries = Object.keys(counts).map(nameLc =>
    ({nameLc, n: counts[nameLc], srcLine: model.bets[nameLc].srcLine}));
  if(!entries.length) return null;
  entries.sort((a, b) => b.n - a.n || a.srcLine - b.srcLine);   // most dropped speaks; ties = earliest declared
  const {nameLc, n} = entries[0];
  const b = model.bets[nameLc];
  const kind = b.effective === 'won' ? 'fallback item' : 'item';   // a won bet's casualties are its own fallbacks
  /* the line embeds the fig verbatim — markFigure only colours a substring it
     can find, and a bare count ("3") could false-match a digit in a bet name */
  const fig = n + ' of ' + total;
  return {fig, line: 'The ' + b.display + ' bet ' + b.effective + ' — ' +
    nOfT(n, total, kind) + ' ' + vb(n, total, 'falls', 'fall') + ' away.'};
}

/* Tier 3 — fork: an unresolved bet (not moot — a bet nobody can answer yet
   isn't a live fork) with conditioned items. "Transitive" reach is measured by
   diffing the won/lost projections: whatever changes state between the two
   worlds genuinely turns on this bet, riders and moot-cascade fallbacks alike,
   without hand-rolling the cascade a second time. */
function forkTier(model){
  const total = model.items.length;
  const unresolved = Object.keys(model.bets).filter(nameLc => model.bets[nameLc].effective === 'unresolved');
  if(!unresolved.length) return null;
  const entries = unresolved.map(nameLc => {
    const won = applyWorld(model, {[nameLc]: 'won'});
    const lost = applyWorld(model, {[nameLc]: 'lost'});
    let n = 0;
    for(let i = 0; i < model.items.length; i++)
      if(won.items[i].worldState !== lost.items[i].worldState) n++;
    return {nameLc, n, srcLine: model.bets[nameLc].srcLine};
  }).filter(e => e.n > 0);
  if(!entries.length) return null;
  entries.sort((a, b) => b.n - a.n || a.srcLine - b.srcLine);   // most riders+fallbacks speaks; ties = earliest declared
  const {nameLc, n} = entries[0];
  const b = model.bets[nameLc];
  const fig = n + ' of ' + total;   // bare pair; the line's own nOfT prefix is what actually highlights
  return {fig, line: nOfT(n, total, 'item') + ' ' + vb(n, total, 'turns', 'turn') +
    ' on the ' + b.display + ' bet — the plan forks there, and says so.'};
}

export function roadmapVerdict(model){
  if(!model || !model.items || !model.items.length) return null;
  const first = model.horizons[0];

  /* 1 — a column over its declared wip limit: the limit is a plan the author
     already made, so breaking it outranks everything else. The worst column
     speaks; the warning list still names them all. */
  if(model.wip > 0){
    let worst = -1, worstN = 0;
    for(let h = 0; h < model.horizons.length; h++){
      const n = activeCount(model, h);
      if(n > model.wip && n > worstN){ worst = h; worstN = n; }
    }
    if(worst >= 0){
      const fig = worstN + ' of ' + model.wip;
      return {fig, line: model.horizons[worst] + ' is running ' + fig +
        ' — the WIP limit is the first thing this plan breaks.'};
    }
  }

  /* 2 — aftermath: a resolved bet (won or lost) whose resolution transitively
     dropped items — quotable in either direction, moot bets never speak. */
  const aftermath = aftermathTier(model);
  if(aftermath) return aftermath;

  /* 3 — fork: an unresolved bet with conditioned items still turning on it. */
  const fork = forkTier(model);
  if(fork) return fork;

  /* Dropped items (reality already answered) leave the flags and shape tiers —
     both the numerator and the denominator — else a resolved-away [risk] still
     reads as live trouble on a plan the text says isn't happening. */
  const live = model.items.filter(i => i.worldState !== 'dropped');
  const total = live.length;

  /* 4 — flags: inside the commitment they ARE the story, beyond it a warning. */
  const inFirst = live.filter(i => i.h === 0);
  const flaggedFirst = inFirst.filter(i => FLAGGED.has(i.status)).length;
  if(flaggedFirst){
    const fig = flaggedFirst + ' of ' + inFirst.length;
    return {fig, line: nOfT(flaggedFirst, inFirst.length, 'item') + ' in ' + first + ' ' +
      vb(flaggedFirst, inFirst.length, 'is', 'are') +
      " flagged — the risk sits inside what you've already committed."};
  }
  const flagged = live.filter(i => FLAGGED.has(i.status)).length;
  if(flagged){
    const fig = flagged + ' of ' + total;
    return {fig, line: nOfT(flagged, total, 'item') + ' ' + vb(flagged, total, 'is', 'are') +
      ' flagged, none in ' + first + ' — the trouble sits beyond the commitment.'};
  }

  /* 5 — otherwise the shape: how much is committed vs only shaped. */
  const n = inFirst.length;
  const fig = n + ' of ' + total;
  const head = nOfT(n, total, 'item') + ' ' + vb(n, total, 'sits', 'sit') + ' in ' + first;
  const tail = n === total ? ' — everything is committed and nothing is shaped.'
    : n === 0 ? ' — the whole plan is shaped, none of it committed.'
    : ' — the rest is shaped, not committed.';
  return {fig, line: head + tail};
}

export function parse(text){
  const model = {title:'', dateStr:null, headline:'', story:'', horizons:[...DEFAULT_HORIZONS],
    lanes:[], items:[], warnings:[], wip:6, fade:true, palette:'ocean', accent:null,
    style:null, focus:undefined, timeAxis:false, bets:{}, verdict:null};
  let currentH = -1;
  const preHeader = [];   // line numbers skipped before the first horizon header
  const lines = text.split(/\r?\n/);
  for(let ln = 0; ln < lines.length; ln++){
    let line = lines[ln].trim();
    if(!line || line.startsWith('//')) continue;

    const config = line.match(/^(title|date|headline|story|horizons|wip|fade|palette|accent|style|focus|verdict)\s*:\s*(.*)$/i);
    if(config){
      const key = config[1].toLowerCase(), val = config[2].replace(/(^|\s)\/\/.*$/, '').trim();   // trailing comments are comments here too
      /* A settings key and a lane prefix are the same shape (`X: y`), so a lane
         genuinely called "Headline" (or "Date", or "Style") is eaten as config —
         its items vanish from the board and, worse, its text would surface on the
         exported deck. Settings below the first header are always either that
         collision or a stray, so say what was read. Never fires for the UI, which
         writes into the config block above the first horizon. */
      if(currentH >= 0)
        model.warnings.push('line ' + (ln+1) + ': ' + snippet(line) + ' read as the ' + key +
          ': setting, not an item in a lane called "' + config[1] + '" — settings belong above the first horizon header');
      if(key === 'title') model.title = val;
      else if(key === 'date') model.dateStr = val;
      else if(key === 'headline') model.headline = val;
      /* the diff narrative — a claim about the CHANGE, where headline is a claim
         about the plan. Shown only while a comparison is active. */
      else if(key === 'story') model.story = val;
      else if(key === 'palette'){
        const p = val.toLowerCase();
        if(PALETTE_NAMES.includes(p)) model.palette = p;
        else model.warnings.push('line ' + (ln+1) + ': unknown palette "' + val + '" — options: ' + PALETTE_NAMES.join(', '));
      }
      else if(key === 'accent'){
        if(/^#[0-9a-fA-F]{6}$/.test(val)) model.accent = val;
        else model.warnings.push('line ' + (ln+1) + ': accent wants a 6-digit hex like #C05621');
      }
      else if(key === 'wip'){
        if(/^off$/i.test(val)) model.wip = 0;
        else if(/^\d+$/.test(val)) model.wip = parseInt(val, 10);
        else model.warnings.push('line ' + (ln+1) + ': wip wants a number or off — kept ' + model.wip);
      }
      else if(key === 'fade') model.fade = !/^off$/i.test(val);
      else if(key === 'style'){
        const st = val.toLowerCase();
        if(DECK_STYLES.includes(st)) model.style = st;
        else model.warnings.push('line ' + (ln+1) + ': unknown style "' + snippet(val) + '" — use ' + DECK_STYLES.join(' / '));
      }
      else if(key === 'focus') model.focus = val || undefined;
      else if(key === 'verdict') model.verdict = val;   // raw; assets/verdict.js owns what off/empty mean
      else {
        const gen = genHorizons(val);
        const hs = gen || val.split(',').map(s => s.trim()).filter(Boolean);
        if(hs.length >= 2 && hs.length <= 8){
          model.horizons = hs;
          /* recomputed per horizons line, never sticky: a later manual list must clear
             it, or the flag would claim a time axis the doc no longer uses (last wins) */
          model.timeAxis = !!gen;
        }
        else model.warnings.push('line ' + (ln+1) + ': horizons needs 2–8 names, or e.g. "quarterly from Q3 2026 x4" — kept ' + model.horizons.join('/'));
      }
      continue;
    }

    const asHeader = line.replace(/:$/, '').trim();
    const hIdx = model.horizons.findIndex(h => h.toLowerCase() === asHeader.toLowerCase());
    if(hIdx >= 0){ currentH = hIdx; continue; }

    /* near-miss header: a typo here silently misfiles everything below it, so
       flag it — but only where header intent is clear (before the first real
       header, or written with a trailing colon), never for ordinary items */
    const hNear = model.horizons.find(h => near(asHeader, h));
    if(hNear && (currentH < 0 || /:$/.test(line))){
      model.warnings.push('line ' + (ln+1) + ': ' + snippet(line) + ' — did you mean "' + hNear + '"? — skipped');
      continue;
    }

    /* item line */
    if(currentH < 0){
      const ck = line.match(/^(title|date|headline|story|horizons|wip|fade|palette|accent|style|focus|verdict)\s+\S/i);
      if(ck) model.warnings.push('line ' + (ln+1) + ': ' + snippet(line) + ' — did you mean "' + ck[1].toLowerCase() + ':"? (missing colon) — skipped');
      else preHeader.push(ln + 1);
      continue;
    }
    let lane = '';
    const laneMatch = line.match(/^([^[\]]+?)\s*:\s+(.*)$/);
    if(laneMatch){ lane = laneMatch[1].trim(); line = laneMatch[2].trim(); }

    let status = null, betTag = null, condTag = null;
    line = line.replace(/\[([^\]]+)\]/g, (m, tagRaw) => {
      const tag = tagRaw.trim();
      const s = STATUS_ALIASES[tag.toLowerCase()];
      if(s){ status = s; return ''; }   // status stays LAST-wins — deliberately unlike bet/cond below

      /* [bet: name] / [bet: name won|lost] — the fork itself. First bet token on
         a line wins; a second is a duplicate and warns rather than silently
         overwriting (a resolution must not be clobbered by a stray later token). */
      const betM = tag.match(/^bet\s*:\s*(.+)$/i);
      if(betM){
        const rest = betM[1].trim();
        const outM = rest.match(/^(\S+)\s+(\S+)$/);
        const name = outM ? outM[1] : rest;
        const outcomeWord = outM ? outM[2] : null;
        if(!/^[a-z0-9-]+$/i.test(name)){
          model.warnings.push('line ' + (ln+1) + ': bet name ' + snippet(name) +
            ' — use letters, numbers, hyphens only — [bet: …] ignored');
          return '';
        }
        const nameLc = name.toLowerCase();
        if(nameLc === 'won' || nameLc === 'lost'){
          model.warnings.push('line ' + (ln+1) + ': "' + name +
            '" is reserved (won/lost are outcomes, not names) — [bet: ' + name + '] ignored');
          return '';
        }
        let outcome = null;
        if(outcomeWord != null){
          const ow = outcomeWord.toLowerCase();
          if(ow === 'won' || ow === 'lost') outcome = ow;
          else model.warnings.push('line ' + (ln+1) + ': unknown outcome "' + outcomeWord +
            '" in [bet: ' + name + '] — kept unresolved');
        }
        if(betTag){
          model.warnings.push('line ' + (ln+1) + ': duplicate [bet: ' + name +
            '] on one line — first wins');
        } else {
          betTag = {name, outcome};
        }
        return '';
      }
      /* near-miss: [bet x] (missing colon) reads as a status typo otherwise —
         give it a bet-specific hint, never the done/doing/risk/blocked one. */
      const betNear = tag.match(/^bet\s+(\S.*)$/i);
      if(betNear){
        model.warnings.push('line ' + (ln+1) + ': [' + tag + '] — did you mean "[bet: ' +
          betNear[1].trim() + ']"? — ignored');
        return '';
      }

      /* [if name] / [unless name] — at most one condition per item; first wins. */
      const condM = tag.match(/^(if|unless)\s+(.+)$/i);
      if(condM){
        const when = condM[1].toLowerCase();
        const name = condM[2].trim();
        if(!/^[a-z0-9-]+$/i.test(name)){
          model.warnings.push('line ' + (ln+1) + ': condition name ' + snippet(name) +
            ' — use letters, numbers, hyphens only — [' + when + ' …] ignored');
          return '';
        }
        if(condTag){
          model.warnings.push('line ' + (ln+1) + ': second condition [' + tag +
            '] on this line ignored — first wins');
        } else {
          condTag = {name, when};
        }
        return '';
      }
      /* near-miss: [if: x] / [unless: x] (colon instead of space) */
      const condNear = tag.match(/^(if|unless)\s*:\s*(.+)$/i);
      if(condNear){
        model.warnings.push('line ' + (ln+1) + ': [' + tag + '] — did you mean "[' +
          condNear[1].toLowerCase() + ' ' + condNear[2].trim() + ']"? — ignored');
        return '';
      }

      model.warnings.push('line ' + (ln+1) + ': unknown status [' + tag + '] — ignored (use done / doing / risk / blocked)');
      return '';
    }).trim();

    /* self-condition: an item conditioning on the very bet it declares — the
       fork can never answer about itself, so the condition is dropped. */
    if(betTag && condTag && betTag.name.toLowerCase() === condTag.name.toLowerCase()){
      model.warnings.push('line ' + (ln+1) + ': item conditions on its own bet ("' +
        betTag.name + '") — condition dropped');
      condTag = null;
    }

    let url = null;
    const linkMatch = line.match(/\s->\s+(\S+)\s*$/);
    if(linkMatch){
      /* http(s) only: the rendered SVG is downloadable, and a file opened
         outside the site has no CSP to stop a javascript: href */
      if(/^https?:\/\//i.test(linkMatch[1])) url = linkMatch[1];
      else model.warnings.push('line ' + (ln+1) + ': link dropped — only http(s) URLs travel with the artefact');
      line = line.slice(0, linkMatch.index).trim();
    }

    let note = '';
    const noteMatch = line.match(/\s--\s+(.*)$/);
    if(noteMatch){ note = noteMatch[1].trim(); line = line.slice(0, noteMatch.index).trim(); }

    /* `xN` = span in COLUMNS. Parsed last, so [status], -> url and -- note have
       already been stripped off the end of the line. Time axis only: on now/next/
       later a duration is meaningless, so the token stays part of the title and
       says so (never silently eaten). /why never sets timeAxis, so /why can never
       parse a span. */
    let span = 1, declaredSpan = 1, spanEnd = null;
    const xM = line.match(/\s+x(\d+)\s*$/i);
    if(xM){
      if(model.timeAxis){
        span = declaredSpan = Math.max(1, parseInt(xM[1], 10));
        line = line.slice(0, xM.index).trim();
      } else if(parseInt(xM[1], 10) > 1){
        model.warnings.push('line ' + (ln+1) + ': ' + snippet(line) +
          ' — spans need a time axis (horizons: quarterly/monthly …); "' + xM[0].trim() +
          '" kept as part of the title');
      }
    }
    if(span > 1){
      const nHz = model.horizons.length;
      const declaredEnd = currentH + span - 1;
      if(declaredEnd > nHz - 1){
        const cont = horizonContinuation(model.horizons);
        const k = declaredEnd - nHz;
        /* the continuation walks 24 steps; past that there is simply no label —
           null, never undefined (the spanEnd contract is string | null) */
        spanEnd = (cont && k < cont.length) ? cont[k] : null;
        span = nHz - currentH;              // clamp the PAINTED width to the board
      }
    }

    if(!line) continue;
    if(!model.lanes.includes(lane)) model.lanes.push(lane);
    model.items.push({lane, h: currentH, title: line, note, status, url,
      span, declaredSpan, spanEnd, srcLine: ln,
      bet: betTag ? {name: betTag.name, outcome: betTag.outcome} : null,
      cond: condTag ? {name: condTag.name, when: condTag.when} : null});
  }
  if(preHeader.length === 1){
    const n = preHeader[0];
    model.warnings.push('line ' + n + ': ' + snippet(lines[n - 1].trim()) +
      ' appears before any horizon header (' + model.horizons.join(' / ') + ') — skipped');
  } else if(preHeader.length > 1){
    model.warnings.push('lines ' + preHeader[0] + '–' + preHeader[preHeader.length - 1] + ': ' +
      preHeader.length + ' lines appear before any horizon header (' + model.horizons.join(' / ') + ') — skipped');
  }
  /* unnamed lane renders last */
  if(model.lanes.includes('') && model.lanes.length > 1){
    model.lanes = model.lanes.filter(l => l !== '').concat(['']);
  }

  /* Assemble the bets map + every structural (world-independent) warning:
     duplicate/conflicting declarations, dangling conditions, horizon ordering,
     bets nothing conditions on. Then bake the TEXT world (assumed = {}) onto
     the model directly — activeCount and every renderer read worldState/
     effective straight off model.items/model.bets, never calling applyWorld
     themselves. This is also the ONLY place cascade/drop-derived warnings are
     appended: applyWorld() (below) recomputes states for a preview but never
     re-appends warnings, so a what-if preview can never disagree with the text
     world about what's wrong with the text (see deriveWorld's comment). */
  buildBets(model);
  const baked = deriveWorld(model, {});
  model.items = baked.items;
  model.bets = baked.bets;
  model.warnings.push(...baked.warnings);
  return model;
}

/* Structural bet/condition bookkeeping — independent of any world (resolved,
   assumed or otherwise). Mutates model.warnings and model.items[].cond (a
   dangling condition is dropped once warned) and sets model.bets to a plain
   {nameLc: {name, display, outcome, srcLine, itemIndex, h}} map, `outcome`
   being the WRITTEN resolution only (null when unresolved) — `effective`
   (which folds in cascade/assumed) is added later by deriveWorld. */
function buildBets(model){
  const rawBets = {};
  model.items.forEach((it, idx) => {
    if(!it.bet) return;
    const nameLc = it.bet.name.toLowerCase();
    (rawBets[nameLc] = rawBets[nameLc] || []).push(
      {name: it.bet.name, outcome: it.bet.outcome, srcLine: it.srcLine, itemIndex: idx});
  });

  const bets = {};
  for(const nameLc in rawBets){
    const entries = rawBets[nameLc];
    const resolutions = entries.filter(e => e.outcome);
    const bares = entries.filter(e => !e.outcome);
    let outcome = null;
    if(resolutions.length){
      const distinct = new Set(resolutions.map(e => e.outcome));
      if(distinct.size > 1){
        const last = resolutions[resolutions.length - 1];
        model.warnings.push('line ' + (last.srcLine + 1) + ': bet "' + entries[0].name +
          '" has conflicting resolutions (won and lost) — reads unresolved');
      } else {
        outcome = resolutions[0].outcome;   // a resolution beats a bare declaration, any order
      }
    }
    if(bares.length > 1){
      for(let k = 1; k < bares.length; k++){
        model.warnings.push('line ' + (bares[k].srcLine + 1) + ': duplicate [bet: ' + bares[k].name +
          '] — already declared at line ' + (bares[0].srcLine + 1) + ' — first wins');
      }
    }
    const canonical = entries[0];
    bets[nameLc] = {name: canonical.name, display: canonical.name, outcome,
      srcLine: canonical.srcLine, itemIndex: canonical.itemIndex, h: model.items[canonical.itemIndex].h};
  }
  model.bets = bets;

  const betNames = Object.keys(bets);
  const conditioned = new Set();
  model.items.forEach(it => {
    if(!it.cond) return;
    const nameLc = it.cond.name.toLowerCase();
    if(!bets[nameLc]){
      const suggestion = betNames.find(n => near(it.cond.name, bets[n].display));
      model.warnings.push('line ' + (it.srcLine + 1) + ': no bet named "' + it.cond.name + '"' +
        (suggestion ? ' — did you mean "' + bets[suggestion].display + '"?' : '') + ' — condition ignored');
      it.cond = null;
      return;
    }
    conditioned.add(nameLc);
    if(it.h === 0){
      model.warnings.push('line ' + (it.srcLine + 1) + ': ' + snippet(it.title) +
        ' is conditioned on "' + bets[nameLc].display + '" but sits in ' + model.horizons[0] +
        ' — a maybe in the commitment column');
    }
    if(it.h < bets[nameLc].h){
      model.warnings.push('line ' + (it.srcLine + 1) + ': ' + snippet(it.title) +
        ' is conditioned on "' + bets[nameLc].display + '", declared later (in ' +
        model.horizons[bets[nameLc].h] + ') — the condition sits in an earlier horizon than its bet');
    }
  });
  betNames.forEach(nameLc => {
    if(!conditioned.has(nameLc)){
      model.warnings.push('line ' + (bets[nameLc].srcLine + 1) + ': bet "' + bets[nameLc].display +
        '" — nothing conditions on it');
    }
  });
}

/* The shared cascade engine. Computes, for a given `assumed` (per-bet
   {nameLc: 'won'|'lost'} preview map, {} for the text-only world):
     - per-item worldState: null | 'cond' (ghosted, fork unresolved) | 'dropped'
     - per-item dropReason: null | {name, display, effective} for wording
     - per-bet effective: 'unresolved' | 'won' | 'lost' | 'moot'
   Rules: a WRITTEN resolution always wins, over both `assumed` and cascade.
   [done] outranks the fork — a done item is never cond/dropped. A cycle in the
   condition graph (a depends on b depends on a) can't be evaluated; it warns
   and every bet in it reads unresolved. Moot (own item dropped, transitively)
   is a distinct outcome from won/lost — a cascade never claims a resolution
   reality never produced. [if b] dependents of a moot b DROP (never ran);
   [unless b] fallbacks of a moot b are LIVE (b certainly didn't pay off, so
   the fallback world applies) — this is the one place if/unless truly diverge.
   Returns NEW items/bets (never mutates its inputs) plus a `warnings` array
   that the CALLER decides whether to keep: parse() bakes the text world
   (assumed={}) and appends these to model.warnings; the exported applyWorld()
   (previews) throws them away, so a what-if preview never disagrees with the
   text world about what's wrong with the text — only parse-time warnings ever
   reach the model, once. */
function deriveWorld(model, assumed){
  const worldWarnings = [];
  const bets = {};
  for(const k in model.bets) bets[k] = {...model.bets[k]};
  const items = model.items.map(it => ({...it}));
  const cache = {}, visiting = new Set();

  function effectiveOf(nameLc){
    if(Object.prototype.hasOwnProperty.call(cache, nameLc)) return cache[nameLc];
    const b = bets[nameLc];
    if(!b) return 'unresolved';
    if(visiting.has(nameLc)){
      worldWarnings.push('line ' + (b.srcLine + 1) + ': bet "' + b.display + '" sits in a condition cycle — reads unresolved');
      return 'unresolved';
    }
    visiting.add(nameLc);
    let result;
    if(b.outcome === 'won' || b.outcome === 'lost'){
      result = b.outcome;                                   // written beats assumed and cascade
    } else if(assumed && (assumed[nameLc] === 'won' || assumed[nameLc] === 'lost')){
      result = assumed[nameLc];
    } else {
      const st = stateOf(items[b.itemIndex]);
      result = st === 'dropped' ? 'moot' : 'unresolved';
    }
    visiting.delete(nameLc);
    cache[nameLc] = result;
    return result;
  }

  function stateOf(item){
    if(item.status === 'done') return null;                 // the past can't be conditional
    if(!item.cond) return null;
    const nameLc = item.cond.name.toLowerCase();
    const eff = effectiveOf(nameLc);
    if(item.cond.when === 'if'){
      if(eff === 'lost' || eff === 'moot') return 'dropped';
      if(eff === 'unresolved') return 'cond';
      return null;                                            // won
    }
    /* unless: the fallback runs whenever the bet did NOT pay off, including
       when it never ran at all (moot) — only a WON bet drops the fallback. */
    if(eff === 'won') return 'dropped';
    if(eff === 'unresolved') return 'cond';
    return null;                                              // lost or moot
  }

  for(const it of items){
    it.worldState = stateOf(it);
    it.dropReason = null;
    if(it.worldState === 'dropped' && it.cond){
      const nameLc = it.cond.name.toLowerCase();
      const b = bets[nameLc];
      it.dropReason = {name: it.cond.name, display: b ? b.display : it.cond.name, effective: effectiveOf(nameLc)};
    }
    if(it.status === 'doing' && it.worldState === 'dropped'){
      worldWarnings.push('line ' + (it.srcLine + 1) + ': [doing] item is dropped by its condition' +
        (it.cond ? ' ("' + it.cond.name + '")' : '') + ' — still in flight, so it still counts toward WIP');
    }
    if(it.status === 'done' && it.cond){
      const eff = effectiveOf(it.cond.name.toLowerCase());
      if(eff === 'unresolved' || eff === 'lost'){
        worldWarnings.push('line ' + (it.srcLine + 1) + ': [done] item is conditioned on bet "' +
          it.cond.name + '", which is ' + eff + ' — done outranks the fork, kept');
      }
    }
  }
  for(const nameLc in bets) bets[nameLc].effective = effectiveOf(nameLc);
  return {items, bets, warnings: worldWarnings};
}

/* Pure model → model: never mutates `model`. `assumed` is a per-bet preview
   map ({name: 'won'|'lost'}, any casing; {} or undefined = the text-only
   world) used by roadmap's what-if UI (later slice) to feed renderers/verdict/
   metrics/WIP a self-consistent projected world. Never appends warnings — see
   deriveWorld's comment. */
export function applyWorld(model, assumed){
  const a = {};
  if(assumed) for(const k in assumed) a[k.toLowerCase()] = assumed[k];
  const {items, bets} = deriveWorld(model, a);
  return {...model, items, bets, warnings: model.warnings};
}
