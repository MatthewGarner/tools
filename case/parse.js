/* /case DSL → model. The binder layer: config + exhibit lines, soft
   line-numbered warnings, srcLine on every node. An exhibit reuses roadmap's
   link grammar — `[Lane:] Label -> url [// note]` — so nothing new to learn.
   URLs are allowlisted to the suite's own tools (relative /tool/ paths or the
   two full origins, http(s) only): anything else still renders, as a dead
   (ghost) exhibit, never a live link. */
import {PALETTE_NAMES} from '../assets/series.js';

const STATUSES = ['open', 'decided', 'parked'];
export const CONFIG_KEYS = ['title', 'question', 'status', 'verdict', 'palette', 'accent', 'headline', 'decision', 'unresolved', 'owner', 'date', 'review-by', 'reconsider', 'constraints', 'view', 'font', 'theme'];
export const BLOCK_FIELDS = {
  option: ['value', 'requires', 'downside', 'reconsider'],
  claim: ['basis', 'detail', 'qualification', 'assumptions', 'url'],
  review: ['date', 'change', 'implication', 'decision', 'url', 'previous'],
};
const ENUMS = {status: STATUSES, view: ['brief', 'compare', 'review'], font: ['chapter', 'dm-sans'], theme: ['system', 'light', 'dark']};
const commentValue = value => value.replace(/(^|\s)\/\/.*$/, '').trim();
export function validDate(value){
  if(!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(value + 'T00:00:00Z');
  return Number.isFinite(date.valueOf()) && date.toISOString().slice(0, 10) === value;
}

/* A reference is navigation, never evidence validation. A non-empty hash may
   carry a model; only the receiving tool can establish that it is meaningful. */
export function classifyReference(value){
  const raw = String(value || '');
  const invalid = {safe: false, kind: 'invalid', tool: '', capture: 'none'};
  if(!raw || /[\s\u0000-\u001f\u007f\\]/.test(raw) || raw.startsWith('//')) return invalid;
  let url;
  try{ url = new URL(raw, 'https://tools.matthewgarner.me'); }catch{ return invalid; }
  if(!['http:', 'https:'].includes(url.protocol) || url.username || url.password) return invalid;
  if(!raw.startsWith('/') && !/^https?:\/\//i.test(raw)) return invalid;
  const local = raw.startsWith('/');
  const suite = ['https://tools.matthewgarner.me', 'https://energy.matthewgarner.me'].includes(url.origin);
  const tool = url.pathname.match(/^\/([a-z-]+)\/$/)?.[1] || '';
  const allowed = url.origin === 'https://energy.matthewgarner.me' ? ENERGY_TOOLS : SUITE_TOOLS;
  const rawPath = local ? raw.split(/[?#]/)[0] : raw.replace(/^https?:\/\/[^/]+/i, '').split(/[?#]/)[0];
  if(local || suite){
    if(!suite || !allowed.includes(tool) || rawPath !== url.pathname || url.search) return invalid;
    const hash = url.hash.slice(1);
    return {safe: true, kind: 'tool', tool, capture: !hash || hash === 'eyJ2IjoxfQ' ? 'missing' : 'unverified'};
  }
  return {safe: true, kind: 'external', tool: '', capture: 'external'};
}

/* the tools each origin serves — the pill name derives from the path segment.
   Kept as a literal (not an import of dev/tool-dirs.mjs, which is dev-only and
   never shipped); dev/case-allowlist.test.mjs pins it to TOOL_DIRS so it can't
   drift when a tool ships. */
export const SUITE_TOOLS = ['fermi', 'rank', 'roadmap', 'why', 'tree', 'map', 'gauge', 'flow',
  'timeline', 'wardley', 'alarm', 'duel', 'premortem', 'bets', 'signal-vs-noise', 'case', 'paths', 'proxy'];
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
    palette: null, accent: null, headline: '', decision: '', unresolved: '', owner: '', date: '', reviewBy: '', reconsider: '', constraints: '', view: 'brief', font: 'chapter', theme: 'system', options: [], claims: [], reviews: [], exhibits: [], lanes: [], warnings: [], srcLines: {}};
  const lines = String(text ?? '').split(/\r?\n/);
  const warn = (ln, msg) => model.warnings.push('line ' + (ln + 1) + ': ' + msg);

  let block = null;
  for(let ln = 0; ln < lines.length; ln++){
    const line = lines[ln].trim();
    if(!line || line.startsWith('//')) continue;

    if(/^\s+/.test(lines[ln]) && block){
      const field = line.match(/^([a-z-]+)\s*:\s*(.*)$/i);
      if(!field || !BLOCK_FIELDS[block.kind].includes(field[1].toLowerCase())){
        warn(ln, 'unknown ' + block.kind + ' field'); continue;
      }
      const key = field[1].toLowerCase(), value = commentValue(field[2]);
      block.fields[key] = ln;
      if(key === 'basis' && value && !['observation', 'assumption', 'model', 'judgement'].includes(value)){
        warn(ln, 'basis wants observation, assumption, model or judgement'); continue;
      }
      if(key === 'date' && value && !validDate(value)){ warn(ln, 'date wants a real YYYY-MM-DD date'); continue; }
      block[key] = value;
      if(key === 'url' || key === 'previous'){
        const reference = classifyReference(value);
        block[key === 'url' ? 'reference' : 'previousReference'] = reference;
        if(value && !reference.safe) warn(ln, 'unsafe or malformed reference — kept as text, never a live link');
      }
      continue;
    }
    block = null;
    const start = line.match(/^(option|claim|review)\s+([a-z][a-z0-9_-]*)\s*:\s*(.*)$/i);
    if(start){
      const kind = start[1].toLowerCase(), id = start[2], label = commentValue(start[3]);
      const collection = model[kind === 'option' ? 'options' : kind === 'claim' ? 'claims' : 'reviews'];
      if(collection.some(node => node.id === id)){ warn(ln, 'duplicate ' + kind + ' id "' + id + '" — use a unique id'); continue; }
      block = {kind, id, label, srcLine: ln, fields: {}, ...Object.fromEntries(BLOCK_FIELDS[kind].map(key => [key, '']))};
      if(kind !== 'option') block.reference = classifyReference('');
      if(kind === 'review') block.previousReference = classifyReference('');
      collection.push(block);
      if(!label) warn(ln, kind + ' needs a label');
      continue;
    }
    const config = line.match(/^([a-z-]+)\s*:\s*(.*)$/i);
    // New review config names also occur as old exhibit lanes (Decision: ...).
    // An exhibit-shaped value keeps that legacy meaning rather than consuming its URL.
    const legacyLane = config && !['title', 'question', 'status', 'verdict', 'palette', 'accent'].includes(config[1].toLowerCase()) && /\s->\s+\S+(?:\s+\/\/.*)?$/.test(config[2]);
    if(config && !legacyLane && CONFIG_KEYS.includes(config[1].toLowerCase())){
      const key = config[1].toLowerCase(), val = commentValue(config[2]);
      const property = key === 'review-by' ? 'reviewBy' : key;
      if(ENUMS[key]){
        if(ENUMS[key].includes(val.toLowerCase())) model[property] = val.toLowerCase();
        else warn(ln, 'unknown ' + key + ' "' + val + '" — options: ' + ENUMS[key].join(', '));
      }else if(key === 'palette'){
        if(PALETTE_NAMES.includes(val.toLowerCase())) model.palette = val.toLowerCase();
        else warn(ln, 'unknown palette "' + val + '" — options: ' + PALETTE_NAMES.join(', '));
      }else if(key === 'accent'){
        if(/^#[0-9a-fA-F]{6}$/.test(val)) model.accent = val;
        else warn(ln, 'accent wants a 6-digit hex like #C05621');
      }else if((key === 'date' || key === 'review-by') && val && !validDate(val)) warn(ln, key + ' wants a real YYYY-MM-DD date');
      else model[property] = val;
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
  if(model.status === 'decided' && (model.options.length || model.claims.length || model.reviews.length) && !model.decision)
    model.warnings.push('state the authorised scope in decision:; decided does not mean every open question is resolved');
  return model;
}
