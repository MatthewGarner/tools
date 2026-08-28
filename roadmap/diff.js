/* Roadmap comparison is pure and source-derived. Duplicate visible titles are
   deliberately ambiguous because the DSL has no stable ID that could justify a
   moved badge; additions and removals remain visible without inventing identity. */
import {diffItems} from '../assets/snapshots.js';

const flatHorizon = model => model.items.map(item => ({
  title: item.title,
  state: String(model.horizons[item.h] ?? '?'),
}));

const duplicateTitles = model => {
  const seen = new Set(), duplicates = new Set();
  for(const item of model.items){
    const key = diffItems.norm(item.title);
    if(seen.has(key)) duplicates.add(key);
    else seen.add(key);
  }
  return duplicates;
};

export function roadmapDiff(oldModel, model, since){
  const ambiguous = new Set([...duplicateTitles(oldModel), ...duplicateTitles(model)]);
  const diff = diffItems(flatHorizon(oldModel), flatHorizon(model), {
    key: entry => entry.title,
    state: entry => entry.state,
  });
  const added = new Set(diff.added.map(entry => diffItems.norm(entry.title)));
  const badge = item => {
    const key = diffItems.norm(item.title);
    if(ambiguous.has(key)) return null;
    if(added.has(key)) return {kind:'new', label:'New'};
    const moved = diff.moved.get(key);
    return moved ? {kind:'moved', label:'was ' + moved.from} : null;
  };
  return {
    badge,
    added: diff.added.map(entry => entry.title),
    dropped: diff.dropped.map(entry => entry.title),
    since: String(since || 'Selected baseline'),
    any: diff.any,
    ambiguous: ambiguous.size ? [...ambiguous] : null,
  };
}
