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

export function parse(text){
  const model = {title:'', dateStr:null, horizons:[...DEFAULT_HORIZONS],
    lanes:[], items:[], warnings:[], wip:6, fade:true, palette:'ocean', accent:null};
  let currentH = -1;
  const preHeader = [];   // line numbers skipped before the first horizon header
  const lines = text.split(/\r?\n/);
  for(let ln = 0; ln < lines.length; ln++){
    let line = lines[ln].trim();
    if(!line || line.startsWith('//')) continue;

    const config = line.match(/^(title|date|horizons|wip|fade|palette|accent)\s*:\s*(.*)$/i);
    if(config){
      const key = config[1].toLowerCase(), val = config[2].trim();
      if(key === 'title') model.title = val;
      else if(key === 'date') model.dateStr = val;
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
      else {
        const gen = genHorizons(val);
        const hs = gen || val.split(',').map(s => s.trim()).filter(Boolean);
        if(hs.length >= 2 && hs.length <= 8) model.horizons = hs;
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
      const ck = line.match(/^(title|date|horizons|wip|fade|palette|accent)\s+\S/i);
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

    if(!line) continue;
    if(!model.lanes.includes(lane)) model.lanes.push(lane);
    model.items.push({lane, h: currentH, title: line, note, status, url, srcLine: ln});
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
