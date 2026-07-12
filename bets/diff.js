/* Snapshot compare (2026-07-12, deferred from v1): bets are keyed by name;
   the "state" that counts as a move is stake/odds/payoff plus whether a kill
   criterion exists — any change there is a MOVED bet. The headline calls that
   composite "odds moved" as the user-facing shorthand for "a number changed",
   even on the rare case only the kill flag flipped (no visible "was …" then —
   documented tradeoff, not a bug). Pure: no DOM, no resimulation — the
   portfolio ghost band's resimulation of the snapshot model is app.js's job
   (memoised there), threaded into ctx.compare as `prevSim` alongside this
   view. Mirrors map/diff.js's split (raw diffItems() result -> a render-
   shaped view); wardley recomputes prev geometry inside render instead, but a
   Monte-Carlo resim is too costly to redo on every keystroke unmemoised. */
import {diffItems} from '../assets/snapshots.js';

const key = b => b.name.toLowerCase();
const state = b => JSON.stringify([b.stake, b.odds, b.payoff, !!b.kill]);
const flatten = model => model.groups.flatMap(g => g.bets.map(b => ({...b, group: g.name})));

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
     headline     — 'Since <label>: N new · M killed · odds moved on K.'
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
  if(diff.moved.size) bits.push('odds moved on ' + diff.moved.size);
  const headline = 'Since ' + label + ': ' + (bits.length ? bits.join(' · ') : 'no change') + '.';
  return {newKeys, movedFields, killed: diff.dropped, headline, any: diff.any};
}
