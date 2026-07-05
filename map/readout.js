/* Zone membership → advice + verdict sentences + copy-for-doc markdown. Pure. */
import {zoneFor} from './zones.js';

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
  const verdict = def ? def.verdict(stats) : genericVerdict(stats);

  const zones = resolved.zones
    .map(z => ({zone: z, items: byId.get(z.id) || [],
      advice: (def && def.advice[z.name]) || null}))
    .filter(e => e.zone.kind === 'rule' ? true
      : e.zone.kind === 'cell' ? (!e.zone.anonymous || e.items.length > 0)
      : e.items.length > 0);
  return {zones, unplaced, flagged, verdict};
}

function genericVerdict(st){
  if(!st.placed) return 'Nothing placed yet — drag items onto the map.';
  let top = null, n = 0;
  for(const [name, items] of st.byZone)
    if(name !== 'unzoned' && items.length > n){ top = name; n = items.length; }
  if(!top) return st.placed + ' item' + (st.placed === 1 ? '' : 's') + ' mapped — no named zones yet.';
  return n + ' of ' + st.placed + ' item' + (st.placed === 1 ? '' : 's') + ' sit in ' + top + '.';
}

export function toMarkdown(ro, model){
  const out = ['## ' + (model.title || 'Map'), '', ro.verdict, ''];
  for(const e of ro.zones){
    if(!e.items.length && !e.advice) continue;   // ro.zones already hides empty anonymous cells
    out.push('**' + e.zone.name + '** (' + e.items.length + ')');
    for(const it of e.items){
      const meta = it.fields.map(f => f.key + ': ' + f.val).join(' · ');
      out.push('- ' + it.label + (meta ? ' — ' + meta : ''));
    }
    out.push('');
  }
  if(ro.unplaced.length){
    out.push('**Unplaced** (' + ro.unplaced.length + ')');
    for(const it of ro.unplaced) out.push('- ' + it.label);
    out.push('');
  }
  if(ro.flagged.length){
    out.push('**Flags**');
    for(const f of ro.flagged) out.push('- ' + f.item.label + ' — ' + f.msg);
  }
  return out.join('\n').replace(/\n{3,}/g, '\n\n').trim() + '\n';
}
