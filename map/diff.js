/* Drift compare (parked V2, built 2026-07-06): positions are the honest fact,
   so the diff is keyed on labels with "x,y" (1dp) as the state. Pure. */
import {diffItems} from '../assets/snapshots.js';

const r1 = v => Math.round(v * 10) / 10;
const keyed = m => m.items.map(it => ({label: it.label,
  state: it.x != null ? r1(it.x) + ',' + r1(it.y) : '', x: it.x, y: it.y}));

export function mapDiff(oldModel, model){
  return diffItems(keyed(oldModel), keyed(model), {key: e => e.label, state: e => e.state});
}

export function mapDiffView(d, since){
  const ghosts = [];
  let placedFromTray = 0;
  for(const {from, to, item} of d.moved.values()){
    if(item.x == null) continue;                    // placed → tray: counted, not drawn
    if(from === ''){ placedFromTray++; continue; }  // tray → placed: no old position to ghost
    const [fx, fy] = String(from).split(',').map(Number);
    ghosts.push({label: item.label, from: [fx, fy], to: [item.x, item.y]});
  }
  const newLabels = new Set(d.added.map(e => diffItems.norm(e.label)));
  const bits = [];
  if(ghosts.length) bits.push(ghosts.length + ' moved');
  if(placedFromTray) bits.push(placedFromTray + ' placed from the tray');
  if(d.added.length){
    const names = d.added.map(e => e.label);
    bits.push(d.added.length + ' new' + (names.length <= 3 ? ' (' + names.join(', ') + ')' : ''));
  }
  if(d.dropped.length) bits.push(d.dropped.length + ' dropped');
  const sinceLine = 'Since ' + since + ': ' + (bits.length ? bits.join(' · ') : 'no drift') + '.';
  return {ghosts, newLabels, dropped: d.dropped.map(e => e.label), sinceLine, since, any: d.any};
}
