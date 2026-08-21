/* Slip compare (#91's reason to exist): a parsed identity includes a duplicate
   occurrence within its lane. State carries timing AND kind, so a former fixed
   fact remains visible when it becomes an estimate. The view gives the Field
   historic geometry + receipts. Pure. */
import {diffItems} from '../assets/snapshots.js';

const keyed = m => m.items.map(it => ({
  key: it.identity || (it.lane + '|' + it.label), label: it.label,
  state: [it.p50, it.p90, it.status || '', it.single ? 'point' : 'range'].join(','),
  p50: it.p50, p90: it.p90, status: it.status || '', single: !!it.single,
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
    const [p50, p90, oldStatus = '', oldKind = 'range'] = String(from).split(',');
    const oldP50 = Number(p50), oldP90 = Number(p90);
    const slipDays = item.p50 - oldP50;
    const history = [];
    if(oldP50 !== item.p50) history.push('p50');
    if(oldP90 !== item.p90) history.push('p90');
    if(oldStatus === 'fixed' && item.status !== 'fixed') history.push('fixed');
    if(oldStatus !== 'fixed' && item.status === 'fixed') history.push('forecast');
    byKey.set(k, {oldP50, oldP90, oldStatus, oldKind, history, slipDays});
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
