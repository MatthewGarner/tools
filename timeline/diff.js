/* Slip compare (#91's reason to exist): a parsed identity includes a duplicate
   occurrence within its lane. State carries timing AND kind, so a former fixed
   fact remains visible when it becomes an estimate. The view gives the Field
   historic geometry + receipts. Pure. */
import {diffItems} from '../assets/diff-items.js';
import {duration} from './duration.js';

const keyed = m => m.items.map(it => ({
  key: it.identity || (it.lane + '|' + it.label), label: it.label, lane: it.lane, note: it.note, rawDates: it.rawDates, month: it.month,
  state: [it.p50, it.p90, it.status || '', it.single ? 'point' : 'range', it.started ?? ''].join(','),
  p50: it.p50, p90: it.p90, status: it.status || '', single: !!it.single, started: it.started ?? null,
}));

export function timelineDiff(oldModel, model){
  return diffItems(keyed(oldModel), keyed(model), {key: e => e.key, state: e => e.state});
}

export function timelineDiffView(d, since){
  const byKey = new Map();
  const slips = [];
  let widened = 0, narrowed = 0, completed = 0, statusChanged = 0, startsChanged = 0;
  for(const [k, {from, item}] of d.moved){
    const [p50, p90, oldStatus = '', oldKind = 'range', oldStart = ''] = String(from).split(',');
    const oldP50 = Number(p50), oldP90 = Number(p90), oldStarted = oldStart === '' ? null : Number(oldStart);
    const slipDays = item.p50 - oldP50;
    const history = [];
    if(oldP50 !== item.p50) history.push('p50');
    if(oldP90 !== item.p90) history.push('p90');
    if(oldStatus === 'fixed' && item.status !== 'fixed') history.push('fixed');
    if(oldStatus !== 'fixed' && item.status === 'fixed') history.push('forecast');
    if(oldStarted !== item.started){ history.push('started'); startsChanged++; }
    byKey.set(k, {oldStarted, oldP50, oldP90, oldStatus, oldKind, history, slipDays});
    const nowDone = item.status === 'done' && oldStatus !== 'done';
    if(slipDays !== 0) slips.push({label: item.label, days: slipDays});
    else if(nowDone) completed++;                       // a range marked done: finished, not "narrowed"
    else if(item.p90 > oldP90) widened++;
    else if(item.p90 < oldP90) narrowed++;
    if(!nowDone && oldStatus !== item.status) statusChanged++;   // risk, fixed, forecast: a change in its own right
    if(nowDone && slipDays !== 0) completed++;
  }
  slips.sort((a, b) => Math.abs(b.days) - Math.abs(a.days));
  const late = slips.filter(s => s.days > 0), early = slips.filter(s => s.days < 0);
  const bits = [];
  if(late.length) bits.push(late.length + ' slipped (worst ' + late[0].label + ' +' + duration(late[0].days) + ')');
  if(early.length) bits.push(early.length + ' pulled in');
  if(widened) bits.push(widened + (widened === 1 ? ' range' : ' ranges') + ' widened');
  if(narrowed) bits.push(narrowed + (narrowed === 1 ? ' range' : ' ranges') + ' narrowed');
  if(completed) bits.push(completed + ' completed');
  if(statusChanged) bits.push(statusChanged + (statusChanged === 1 ? ' status change' : ' status changes'));
  if(startsChanged) bits.push(startsChanged + (startsChanged === 1 ? ' start changed' : ' starts changed'));
  if(d.added.length) bits.push(d.added.length + ' new');
  if(d.dropped.length) bits.push(d.dropped.length + ' dropped');
  const sinceLine = 'Since ' + since + ': ' + (bits.length ? bits.join(' · ') : d.any ? 'changed' : 'nothing moved') + '.';
  return {byKey, slips, sinceLine, since, any: d.any,
    newKeys: new Set(d.added.map(e => diffItems.norm(e.key))),
    dropped: d.dropped.map(e => e.label), droppedItems: d.dropped.map(e => ({...e}))};
}
