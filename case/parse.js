/* /case DSL → model. The binder layer: config + exhibit lines, soft
   line-numbered warnings, srcLine on every node. An exhibit reuses roadmap's
   link grammar — `[Lane:] Label -> url [// note]` — so nothing new to learn.
   URLs are allowlisted to the suite's own tools (relative /tool/ paths or the
   two full origins, http(s) only): anything else still renders, as a dead
   (ghost) exhibit, never a live link. */
import {PALETTE_NAMES} from '../assets/series.js';

const STATUSES = ['open', 'decided', 'parked'];

/* the tools each origin serves — the pill name derives from the path segment.
   Kept as a literal (not an import of dev/tool-dirs.mjs, which is dev-only and
   never shipped); dev/case-allowlist.test.mjs pins it to TOOL_DIRS so it can't
   drift when a tool ships. */
export const SUITE_TOOLS = ['fermi', 'rank', 'roadmap', 'why', 'tree', 'map', 'gauge', 'flow',
  'timeline', 'wardley', 'alarm', 'duel', 'premortem', 'bets', 'signal-vs-noise', 'case', 'paths'];
export const ENERGY_TOOLS = ['cycles', 'risk', 'frequency', 'merit-order', 'intraday'];

/* → {tool, live} — tool is the pill name ('' when nothing derivable) */
export function classifyUrl(url){
  const u = String(url || '');
  let path = null, energy = false;
  const mTools = u.match(/^https:\/\/tools\.matthewgarner\.me(\/.*)$/i);
  const mEnergy = u.match(/^https:\/\/energy\.matthewgarner\.me(\/.*)$/i);
  if(mTools) path = mTools[1];
  else if(mEnergy){ path = mEnergy[1]; energy = true; }
  else if(u.startsWith('/')) path = u;
  else return {tool: '', live: false};
  const seg = (path.match(/^\/([a-z-]+)\//i) || [])[1];
  if(!seg) return {tool: '', live: false};
  const lc = seg.toLowerCase();
  if(!energy && SUITE_TOOLS.includes(lc)) return {tool: lc, live: true};
  if(energy && ENERGY_TOOLS.includes(lc)) return {tool: lc, live: true};
  return {tool: lc, live: false};
}

export function parse(text){
  const model = {title: '', question: '', status: 'open', verdict: null,
    palette: null, accent: null, exhibits: [], lanes: [], warnings: [], srcLines: {}};
  const lines = String(text ?? '').split(/\r?\n/);
  const warn = (ln, msg) => model.warnings.push('line ' + (ln + 1) + ': ' + msg);

  for(let ln = 0; ln < lines.length; ln++){
    const line = lines[ln].trim();
    if(!line || line.startsWith('//')) continue;

    const config = line.match(/^(title|question|status|verdict|palette|accent)\s*:\s*(.*)$/i);
    if(config){
      const key = config[1].toLowerCase();
      const val = config[2].replace(/(^|\s)\/\/.*$/, '').trim();   // trailing comments are comments here too
      if(key === 'title') model.title = val;
      else if(key === 'question') model.question = val;
      else if(key === 'verdict') model.verdict = config[2].replace(/(^|\s)\/\/.*$/, '').trim();   // raw; assets/verdict.js owns off/empty
      else if(key === 'status'){
        if(STATUSES.includes(val.toLowerCase())) model.status = val.toLowerCase();
        else warn(ln, 'unknown status "' + val + '" — options: ' + STATUSES.join(', '));
      } else if(key === 'palette'){
        if(PALETTE_NAMES.includes(val.toLowerCase())) model.palette = val.toLowerCase();
        else warn(ln, 'unknown palette "' + val + '" — options: ' + PALETTE_NAMES.join(', '));
      } else if(/^#[0-9a-fA-F]{6}$/.test(val)) model.accent = val;
      else warn(ln, 'accent wants a 6-digit hex like #C05621');
      model.srcLines[key] = ln;
      continue;
    }

    /* exhibit: [Lane:] Label -> url [// note] — note peeled FIRST (a URL's //
       never splits: the comment needs a whitespace boundary) */
    let body = line, note = '';
    const cm = body.match(/\s\/\/\s?(.*)$/);
    if(cm){ note = cm[1].trim(); body = body.slice(0, cm.index).trim(); }
    const linkM = body.match(/\s->\s+(\S+)\s*$/);
    if(!linkM){
      warn(ln, 'an exhibit needs a link — write it as "Label -> url" (paste the tool URL after ->)');
      continue;
    }
    const url = linkM[1];
    let head = body.slice(0, linkM.index).trim();
    let lane = '';
    const laneM = head.match(/^([^:]+):\s*(.*)$/);   // \s* not \s+: "Money: -> url" is an EMPTY label (warned), not a label called "Money:"
    if(laneM){ lane = laneM[1].trim(); head = laneM[2].trim(); }
    if(!head){ warn(ln, 'an exhibit needs a label before its ->'); continue; }
    const {tool, live} = classifyUrl(url);
    if(!live) warn(ln, 'not a suite tool URL — kept as a dead exhibit (link one of the tools, e.g. /fermi/#…)');
    model.exhibits.push({lane, label: head, url, note, tool, live, srcLine: ln});
    if(lane && !model.lanes.includes(lane)) model.lanes.push(lane);
  }

  const vRaw = model.verdict == null ? '' : String(model.verdict).trim();
  if(model.status === 'decided' && (vRaw === '' || vRaw.toLowerCase() === 'off'))
    model.warnings.push('a decided case states its verdict — add a verdict: line (or set status: open)');
  return model;
}
