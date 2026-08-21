/* Discovery-narrative diff (parked V2, built 2026-07-06): flatten the tree to
   keyed entries, diff via the shared core, and phrase what changed the way a
   discovery review would say it. Pure. */
import {diffItems} from '../assets/snapshots.js';

export function flattenWhy(model){
  const out = [];
  const walk = (nodes, parentKey = 'root') => {
    const occurrences = new Map();
    for(const n of nodes){
      /* A structural path survives insertions above it. The sibling occurrence
         keeps duplicate labels distinct without pretending label copy alone is
         identity. A true rename has no stable DSL identity, so remains an
         honest add/drop rather than a potentially false move. */
      const signature = diffItems.norm(n.kind + '|' + n.label);
      const occurrence = occurrences.get(signature) || 0;
      occurrences.set(signature, occurrence + 1);
      const key = parentKey + '/' + n.kind + ':' + n.label + '#' + occurrence;
      out.push({key, label: n.label, kind: n.kind, state: n.status || '', node: n});
      walk(n.children || [], key);
    }
  };
  walk(model.outcomes || []);
  return out;
}

export function whyDiff(oldModel, model){
  const oldItems = flattenWhy(oldModel), currentItems = flattenWhy(model);
  const result = diffItems(oldItems, currentItems, {key: e => e.key, state: e => e.state});
  result.keyFor = new Map(currentItems.map(item => [item.node, diffItems.norm(item.key)]));
  result.sourceKeyFor = new Map(currentItems.map(item => [item.kind + '|' + item.node.srcLine + '|' + item.label, diffItems.norm(item.key)]));
  return result;
}

const plural = (n, w) => n + ' ' + (n === 1 ? w
  : w.endsWith('y') ? w.slice(0, -1) + 'ies'
  : /(s|x|z|ch|sh)$/.test(w) ? w + 'es' : w + 's');

export function whyNarrative(d, since){
  if(!d.any) return 'Since ' + since + ': no changes to the tree.';
  const bits = [];
  const addBits = ['outcome', 'opportunity', 'solution', 'assumption']
    .map(k => { const n = d.added.filter(e => e.kind === k).length; return n ? plural(n, k) : null; })
    .filter(Boolean);
  if(addBits.length) bits.push(addBits.join(' + ') + ' added');
  const moves = [...d.moved.values()];
  const sol = moves.filter(m => m.item.kind === 'solution');
  sol.slice(0, 2).forEach(m => bits.push(m.item.label + ' ' + m.from + ' → ' + m.to));
  if(sol.length > 2) bits.push('+' + (sol.length - 2) + ' more solution ' + (sol.length - 2 === 1 ? 'move' : 'moves'));
  const broken = moves.filter(m => m.item.kind === 'assumption' && m.to === 'broken').length;
  if(broken) bits.push(plural(broken, 'assumption') + ' broken');
  const otherA = moves.filter(m => m.item.kind === 'assumption' && m.to !== 'broken').length;
  if(otherA) bits.push(plural(otherA, 'assumption') + ' re-statused');
  if(d.dropped.length) bits.push(plural(d.dropped.length, 'branch') + ' dropped');
  return 'Since ' + since + ': ' + bits.join(' · ') + '.';
}

/* What renderOst consumes: badge per card node + the dropped labels. */
export function whyDiffView(d, since){
  const added = new Set(d.added.map(e => diffItems.norm(e.key)));
  const badge = node => {
    const k = d.keyFor.get(node) || d.sourceKeyFor.get(node.kind + '|' + node.srcLine + '|' + node.label);
    if(added.has(k)) return {kind: 'new', label: 'NEW'};
    const mv = d.moved.get(k);
    if(mv && node.kind === 'solution') return {kind: 'moved', label: 'was ' + mv.from};
    return null;
  };
  return {badge, dropped: d.dropped.map(e => e.label), narrative: whyNarrative(d, since), since};
}
