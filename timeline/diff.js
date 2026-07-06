/* Slip compare (#91's reason to exist): milestones keyed by lane|label, state =
   "p50,p90". The view gives the renderer ghosts + slip labels and the board
   pack its sentence. Pure. */
import {diffItems} from '../assets/snapshots.js';

const keyed = m => m.items.map(it => ({
  key: it.lane + '|' + it.label, label: it.label,
  state: it.p50 + ',' + it.p90, p50: it.p50, p90: it.p90,
}));

export function timelineDiff(oldModel, model){
  return diffItems(keyed(oldModel), keyed(model), {key: e => e.key, state: e => e.state});
}

const wk = days => {
  const w = Math.round(Math.abs(days) / 7);
  return w + (w === 1 ? ' wk' : ' wks');
};

export function timelineDiffView(d, since){
  const byKey = new Map();
  const slips = [];
  let widened = 0;
  for(const [k, {from, item}] of d.moved){
    const [oldP50, oldP90] = String(from).split(',').map(Number);
    const slipDays = item.p50 - oldP50;
    byKey.set(k, {oldP50, oldP90, slipDays});
    if(slipDays !== 0) slips.push({label: item.label, days: slipDays});
    else if(item.p90 !== oldP90) widened++;
  }
  slips.sort((a, b) => Math.abs(b.days) - Math.abs(a.days));
  const late = slips.filter(s => s.days > 0), early = slips.filter(s => s.days < 0);
  const bits = [];
  if(late.length) bits.push(late.length + ' slipped (worst ' + late[0].label + ' +' + wk(late[0].days) + ')');
  if(early.length) bits.push(early.length + ' pulled in');
  if(widened) bits.push(widened + (widened === 1 ? ' range' : ' ranges') + ' widened');
  if(d.added.length) bits.push(d.added.length + ' new');
  if(d.dropped.length) bits.push(d.dropped.length + ' dropped');
  const sinceLine = 'Since ' + since + ': ' + (bits.length ? bits.join(' · ') : 'nothing moved') + '.';
  return {byKey, slips, sinceLine, since, any: d.any,
    newKeys: new Set(d.added.map(e => diffItems.norm(e.key))),
    dropped: d.dropped.map(e => e.label)};
}
