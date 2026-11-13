/* Snapshot compare (2026-07-12, deferred from v1): bets are keyed by their
   parser-assigned group-qualified occurrence identity, never visible name
   alone. Two `Experiment` bets can therefore coexist without one silently
   overwriting the other in diffItems' Map.

   the "state" that counts as a move is stake/odds/payoff plus whether a kill
   criterion exists — any change there is a MOVED bet. The headline names the one
   field that moved ("stake moved on 2"), or says "inputs changed on N" when
   several fields moved or only the kill criterion did. Pure: no DOM, no resimulation — the
   portfolio ghost band's resimulation of the snapshot model is app.js's job
   (memoised there), threaded into ctx.compare as `prevSim` alongside this
   view. Mirrors map/diff.js's split (raw diffItems() result -> a render-
   shaped view); wardley recomputes prev geometry inside render instead, but a
   Monte-Carlo resim is too costly to redo on every keystroke unmemoised. */
import {diffItems} from '../assets/diff-items.js';

const key = b => b.occurrenceKey || JSON.stringify([(b.group || '').toLowerCase(), 1, b.name.toLowerCase(), 1]);
const state = b => JSON.stringify([b.stake, b.odds, b.payoff, !!b.kill]);
const flatten = model => model.groups.flatMap(g => g.bets.map(b => ({...b, group: g.name})));

/* identity is group + name, so the same name in two different groups is not a duplicate */
export function duplicateVisibleNames(model){
  const seen = new Map(), duplicates = [];
  const norm = value => String(value || '').toLowerCase().replace(/\s+/g, ' ').trim();
  for(const bet of flatten(model)){
    const name = norm(bet.group) + '\u0000' + norm(bet.name);
    if(seen.has(name)){
      if(!duplicates.some(item => item.name === name)) duplicates.push({name, first: seen.get(name), duplicate: bet});
    } else seen.set(name, bet);
  }
  return duplicates;
}

export function comparisonSafety(oldModel, model){
  const duplicates = [...duplicateVisibleNames(oldModel), ...duplicateVisibleNames(model)];
  return duplicates.length ? {
    safe: false,
    warning: 'Snapshot comparison paused: duplicate bet names can change identity when another duplicate is inserted. Rename duplicates before comparing.',
    line: duplicates[0].duplicate.srcLine,
  } : {safe: true, warning: '', line: null};
}

export function betsDiff(oldModel, model){
  return diffItems(flatten(oldModel), flatten(model), {key, state});
}

/* normalised lookup key for a CURRENT bet — matches the keys used inside
   the added/moved/dropped shapes above (diffItems normalises internally). */
export const betKey = b => diffItems.norm(key(b));

/* Shapes the raw diff for render.js:
     newKeys      — Set of normalised names that are new since the snapshot
     movedFields  — Map normalised name -> {stake?, odds?, payoff?}, each the
                    OLD value, only for fields that actually changed (a
                    kill-only change yields an empty object: counted in the
                    headline, nothing to show inline)
     killed       — the dropped bets themselves (whole, with `.group` set to
                    the lane they lived in at snapshot time) for ghost rows
     headline     — 'Since <label>: N new · M killed · stake moved on K.'
                    (zero clauses omitted)
     any          — true if there's anything to report at all               */
export function betsDiffView(diff, label){
  const newKeys = new Set(diff.added.map(betKey));
  const movedFields = new Map();
  for(const [k, {from, to}] of diff.moved){
    const [os, oo, op] = JSON.parse(from), [ns, no, np] = JSON.parse(to);
    const fields = {};
    if(JSON.stringify(os) !== JSON.stringify(ns)) fields.stake = os;
    if(JSON.stringify(oo) !== JSON.stringify(no)) fields.odds = oo;
    if(JSON.stringify(op) !== JSON.stringify(np)) fields.payoff = op;
    movedFields.set(k, fields);
  }
  const bits = [];
  if(diff.added.length) bits.push(diff.added.length + ' new');
  if(diff.dropped.length) bits.push(diff.dropped.length + ' killed');
  if(diff.moved.size){
    /* name what moved: one field across every moved bet, else a general "inputs changed" */
    const touched = new Set();
    for(const fields of movedFields.values()){
      const names = Object.keys(fields);
      if(!names.length) touched.add('other');
      for(const name of names) touched.add(name);
    }
    bits.push(touched.size === 1 && !touched.has('other')
      ? [...touched][0] + ' moved on ' + diff.moved.size : 'inputs changed on ' + diff.moved.size);
  }
  const headline = 'Since ' + label + ': ' + (bits.length ? bits.join(' · ') : 'no change') + '.';
  return {newKeys, movedFields, killed: diff.dropped, headline, any: diff.any};
}

/* A snapshot in a different unit cannot share the live ruler: the ghost band is not
   drawn, and the comparison line says why. */
export const sameUnit = (compare, model) => !compare || compare.previousUnit === undefined ||
  String(compare.previousUnit || '') === String(model && model.unit || '');
export const comparisonHeadline = (compare, model) => sameUnit(compare, model) ? compare.headline :
  compare.headline + ' The snapshot was in ' + (compare.previousUnit || 'no unit') + ', so its outcome band is not drawn.';
