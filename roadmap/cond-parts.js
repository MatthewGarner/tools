/* Pure label/colour helpers for conditional bets (A3) — shared by every
   roadmap surface (chart, board, register, focus, deck). No SVG-string
   building here: each renderer already owns an incompatible capsule()
   builder (render.js vs deck-parts.js), so this module hands back plain
   {kind, label} / [col, inkCol] data and lets the caller paint it with its
   own primitives, same division of labour as STATUS_LABEL in parse.js.

   Every helper treats a missing bet/cond/worldState as ABSENT — /why's
   render-map builds items without these fields (spec §1), and a bet-free
   roadmap doc has them explicitly null (parse.js always bakes worldState).
   So `cardTag` returns null for every item on such a doc, and nothing new
   paints — that IS the byte-identity gate, distributed per item rather
   than a single flag. `anyBet` is exported too, for callers that want one
   cheap top-level guard as defence in depth. */

export function anyBet(model){
  return !!(model && model.items && model.items.some(i => i.bet || i.cond));
}

/* The single informational tag a card carries: dropped beats a bet
   declaration beats an unresolved condition — the single-strongest-state
   rule, extended from opacity to tag choice (an item rarely carries more
   than one anyway: a self-condition is dropped at parse time). Returns
   null for a plain item. `label` is plain text — every caller esc()s at
   the point of emission, matching every other capsule label already in
   this codebase. */
export function cardTag(model, it){
  if(!it) return null;
  if(it.worldState === 'dropped' && it.dropReason){
    const word = it.dropReason.effective === 'won' ? 'won'
      : it.dropReason.effective === 'lost' ? 'lost' : 'never ran';
    return {kind: 'dropped', label: 'dropped — ' + it.dropReason.display + ' ' + word};
  }
  if(it.bet){
    const nameLc = it.bet.name.toLowerCase();
    const b = model && model.bets ? model.bets[nameLc] : null;
    const eff = b ? b.effective : 'unresolved';
    if(eff === 'won') return {kind: 'bet-won', label: it.bet.name + ' · won'};
    if(eff === 'lost') return {kind: 'bet-lost', label: it.bet.name + ' · lost'};
    if(eff === 'moot') return {kind: 'bet-moot', label: it.bet.name + ' · never ran'};
    return {kind: 'bet-open', label: 'BET ' + it.bet.name};
  }
  if(it.worldState === 'cond' && it.cond){
    return {kind: 'cond', label: (it.cond.when === 'unless' ? 'unless ' : 'if ') + it.cond.name};
  }
  return null;
}

/* Colour for a tag capsule — every pairing reuses tokens already validated
   and shipped elsewhere in this codebase (status pills, the register's own
   muted DROPPED capsule): won/lost ride the existing done/blocked status
   colours (always paired with the word won/lost, never colour-alone);
   dropped/moot/cond stay muted grey, matching the register's shipped
   dropped-row treatment; an open bet uses the accent (a fork point is the
   most "look here" state on the board, same register as a NEW badge). */
export function tagColors(tag, C){
  if(!tag) return null;
  switch(tag.kind){
    case 'bet-won': return [C.status.done, C.statusInk.done];
    case 'bet-lost': return [C.status.blocked, C.statusInk.blocked];
    case 'bet-open': return [C.accent, C.accentInk];
    case 'dropped':
    case 'bet-moot':
    case 'cond':
    default: return [C.muted, C.muted];
  }
}

/* Card opacity: single strongest state wins outright — dropped, then cond,
   then the column's certainty fade — NEVER multiplied together (a cond item
   in a faded later column paints at the flat cond opacity, not cond*fade). */
export const DROPPED_OPACITY = 0.4;
export const COND_OPACITY = 0.65;
export function stateOpacity(it, certFade){
  if(it && it.worldState === 'dropped') return DROPPED_OPACITY;
  if(it && it.worldState === 'cond') return COND_OPACITY;
  return certFade;
}
