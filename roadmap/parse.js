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
   construction. */
export function activeCount(model, h){
  return model.items.filter(i => i.h <= h && h <= i.h + Math.max(1, i.span || 1) - 1).length;
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

export function parse(text){
  const model = {title:'', dateStr:null, headline:'', horizons:[...DEFAULT_HORIZONS],
    lanes:[], items:[], warnings:[], wip:6, fade:true, palette:'ocean', accent:null,
    style:null, timeAxis:false};
  let currentH = -1;
  const preHeader = [];   // line numbers skipped before the first horizon header
  const lines = text.split(/\r?\n/);
  for(let ln = 0; ln < lines.length; ln++){
    let line = lines[ln].trim();
    if(!line || line.startsWith('//')) continue;

    const config = line.match(/^(title|date|headline|horizons|wip|fade|palette|accent|style)\s*:\s*(.*)$/i);
    if(config){
      const key = config[1].toLowerCase(), val = config[2].trim();
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
      const ck = line.match(/^(title|date|headline|horizons|wip|fade|palette|accent|style)\s+\S/i);
      if(ck) model.warnings.push('line ' + (ln+1) + ': ' + snippet(line) + ' — did you mean "' + ck[1].toLowerCase() + ':"? (missing colon) — skipped');
      else preHeader.push(ln + 1);
      continue;
    }
    let lane = '';
    const laneMatch = line.match(/^([^[\]]+?)\s*:\s+(.*)$/);
    if(laneMatch){ lane = laneMatch[1].trim(); line = laneMatch[2].trim(); }

    let status = null;
    line = line.replace(/\[([^\]]+)\]/g, (m, tag) => {
      const s = STATUS_ALIASES[tag.trim().toLowerCase()];
      if(s) status = s;
      else model.warnings.push('line ' + (ln+1) + ': unknown status [' + tag + '] — ignored (use done / doing / risk / blocked)');
      return '';
    }).trim();

    let url = null;
    const linkMatch = line.match(/\s->\s+(\S+)\s*$/);
    if(linkMatch){ url = linkMatch[1]; line = line.slice(0, linkMatch.index).trim(); }

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
      span, declaredSpan, spanEnd, srcLine: ln});
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
  return model;
}
