/* Zone readout and portable Markdown. Pure. */
import {resolveVerdict} from '../assets/verdict.js';
import {zoneFor} from './zones.js';
import {comparisonSafety, mapDiff} from './diff.js';

export function readout(model, resolved){
  const placed = model.items.filter(i => i.x != null);
  const unplaced = model.items.filter(i => i.x == null);
  const byId = new Map();
  for(const it of placed){
    const z = zoneFor(resolved, it.x, it.y);
    if(!byId.has(z.id)) byId.set(z.id, []);
    byId.get(z.id).push(it);
  }
  const def = resolved.def;
  const sort = (def && def.sortItems) || ((a, b) => a.srcLine - b.srcLine);
  for(const items of byId.values()) items.sort(sort);

  const flagged = [];
  if(def) for(const it of placed){
    const msg = def.flag(it, zoneFor(resolved, it.x, it.y).name);
    if(msg) flagged.push({item: it, msg});
  }

  const byZone = new Map();   // name → items, for verdict templates
  for(const z of resolved.zones){
    const items = byId.get(z.id);
    if(items) byZone.set(z.name, items);
  }
  const stats = {placed: placed.length, total: model.items.length, byZone, flagged};
  const v = def ? def.verdict(stats) : genericVerdict(stats);

  const zones = resolved.zones
    .map(z => ({zone: z, items: byId.get(z.id) || [],
      advice: (def && def.advice[z.name]) || null}))
    .filter(e => e.zone.kind === 'rule' ? true
      : e.zone.kind === 'cell' ? (!e.zone.anonymous || e.items.length > 0)
      : e.items.length > 0);

  /* Metrics expose only facts computed here. */
  const occupied = zones.filter(e => e.items.length).length;
  const counts = [
    placed.length + ' of ' + model.items.length + ' placed',
    occupied + ' zone' + (occupied === 1 ? '' : 's') + ' occupied',
    flagged.length ? flagged.length + ' flagged' : '',
  ];

  /* Resolve the authored verdict once for every consumer. */
  const av = resolveVerdict(model.verdict, {line: v.line, fig: v.fig});
  return {
    zones, unplaced, flagged, verdict: av.line, verdictFig: av.fig, counts,
    axes: {x: resolved.x, y: resolved.y},
  };
}

function genericVerdict(st){
  if(!st.placed) return {line: 'Nothing placed yet — drag items onto the map.', fig: ''};
  let top = null, n = 0;
  for(const [name, items] of st.byZone)
    if(name !== 'unzoned' && items.length > n){ top = name; n = items.length; }
  if(!top) return {line: st.placed + ' item' + (st.placed === 1 ? '' : 's') + ' mapped — no named zones yet.',
    fig: String(st.placed)};
  const fig = n + ' of ' + st.placed;
  return {line: fig + ' item' + (st.placed === 1 ? '' : 's') + ' sit in ' + top + '.', fig};
}

function portableLiteral(value){
  return String(value ?? '')
    .replace(/[\p{Cc}\p{Cf}]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/([\\`*_{}\[\]|])/g, '\\$1');
}

/* Values remain literals in their heading, inline, or list context. */
const headingLiteral = value => portableLiteral(value) || 'Map';
const inlineLiteral = value => portableLiteral(value) || '—';
const listLiteral = value => portableLiteral(value) || '—';
const axisEnd = value => value == null || String(value).trim() === '' ? 'not specified' : inlineLiteral(value);
const position = item => item.x == null ? 'unplaced' : '@ ' + String(item.x) + ',' + String(item.y);

function comparisonMarkdown(baseline, current, label){
  const diff = mapDiff(baseline, current);
  const name = inlineLiteral(label || 'Selected baseline');
  const facts = [];
  for(const {from, to, item} of diff.moved.values()){
    const claim = listLiteral(item.label);
    if(from === '') facts.push('- Placed from unplaced: ' + claim + ' → @ ' + to);
    else if(to === '') facts.push('- Moved to unplaced: ' + claim + ' (was @ ' + from + ')');
    else facts.push('- Moved: ' + claim + ' · @ ' + from + ' → @ ' + to);
  }
  for(const item of diff.added)
    facts.push('- Added: ' + listLiteral(item.label) + (item.state ? ' · @ ' + item.state : ' · unplaced'));
  for(const item of diff.dropped)
    facts.push('- Dropped: ' + listLiteral(item.label) + (item.state ? ' · was @ ' + item.state : ' · was unplaced'));
  return [
    '### Comparison with ' + name,
    '',
    facts.length ? facts.join('\n') : '_No changes._',
  ];
}

export function toMarkdown(ro, model, {comparison = null} = {}){
  const x = ro.axes?.x || model.axes?.x || {label:'X', low:null, high:null};
  const y = ro.axes?.y || model.axes?.y || {label:'Y', low:null, high:null};
  const zonesByLine = new Map();
  for(const entry of ro.zones) for(const item of entry.items) zonesByLine.set(item.srcLine, entry.zone.name);
  const flagsByLine = new Map(ro.flagged.map(flag => [flag.item.srcLine, flag.msg]));
  const verdict = ro.verdict || (model.verdict != null ? 'Off' : '—');
  const out = [
    '## ' + headingLiteral(model.title || 'Map'),
    '',
    '**Method:** ' + inlineLiteral(model.preset || 'custom'),
    '**X axis:** ' + inlineLiteral(x.label || 'X') + ' (' + axisEnd(x.low) + ' → ' + axisEnd(x.high) + ')',
    '**Y axis:** ' + inlineLiteral(y.label || 'Y') + ' (' + axisEnd(y.low) + ' → ' + axisEnd(y.high) + ')',
    '**Verdict:** ' + inlineLiteral(verdict),
    '',
    '### Claims',
    '',
  ];
  if(!model.items.length) out.push('_No claims authored._');
  for(const item of model.items){
    const state = position(item);
    out.push('- **' + listLiteral(item.label) + '** — ' + state);
    out.push('  - Zone: ' + (item.x == null ? 'unplaced' : listLiteral(zonesByLine.get(item.srcLine) || 'unzoned')));
    if(item.fields.length){
      for(const field of item.fields)
        out.push('  - Field — ' + listLiteral(field.key) + ': ' + listLiteral(field.val));
    } else out.push('  - Fields: none');
    out.push('  - Flag: ' + (flagsByLine.has(item.srcLine) ? listLiteral(flagsByLine.get(item.srcLine)) : 'none'));
  }
  if(comparison?.model && comparisonSafety(comparison.model, model).safe){
    out.push('', ...comparisonMarkdown(comparison.model, model, comparison.label));
  }
  out.push('', '_Source: local Map source snapshot._');
  return out.join('\n').replace(/\n{3,}/g, '\n\n').trim() + '\n';
}
