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

import {esc} from '../assets/svg.js';

export function anyBet(model){
  return !!(model && model.items && model.items.some(i => i.bet || i.cond));
}

/* The what-if click target (A4): the bet's OWN declaring item, but only
   when the bet carries no WRITTEN resolution. Reads `model.bets[nameLc]
   .outcome`, never `.effective` — deriveWorld/applyWorld never touch
   `outcome` (only `effective` folds in cascade/preview), so this test stays
   reliable even against an already-projected (what-if) model: a bet shown
   as "won" purely by preview is still previewable (cycles on), while a bet
   resolved in the TEXT is not (clicking its capsule is a no-op — so it gets
   no hit rect at all, per spec, rather than an inert one). Returns the
   lowercase bet name, or null. */
export function previewableBet(model, it){
  if(!it || !it.bet) return null;
  const nameLc = it.bet.name.toLowerCase();
  const b = model && model.bets ? model.bets[nameLc] : null;
  if(!b || b.outcome) return null;
  return nameLc;
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
   in a faded later column paints at the flat cond opacity, not cond*fade).
   `atRisk` (why's render-map only — roadmap's own parser never sets it) rides
   the same COND_OPACITY tier: a committed solution with a broken assumption
   is "falling out unless you act", the same half-committed register as an
   unresolved condition, never roadmap's `worldState`. */
export const DROPPED_OPACITY = 0.4;
export const COND_OPACITY = 0.65;
export function stateOpacity(it, certFade){
  if(it && it.worldState === 'dropped') return DROPPED_OPACITY;
  if(it && (it.worldState === 'cond' || it.atRisk)) return COND_OPACITY;
  return certFade;
}

/* The invisible what-if hit rect, sized to the tag capsule it sits under —
   emitted by the CALLER as a SIBLING painted AFTER (never inside) the
   card's own cardmenu <g>, exactly the data-span-edge discipline (render.js)
   and for the same reason: `closest('[data-edit]')` (edit-in-place) would
   otherwise resolve to the cardmenu ancestor and swallow the click before
   app.js's pointerdown handler ever sees data-whatif. Fine pointers only —
   app.js gates the gesture (coarse pointers never reach this check, same as
   the drag armer); keyboard-reachable regardless (tabindex + Enter/Space,
   the data-lens pattern). single-quoted XML-legal attrs throughout. */
export function whatifHitRect(nameLc, display, x, y, w, h){
  /* wording avoids the literal substring "if <name>" (a colon, not a space,
     separates "what-if" from the bet name) — the render-conditional suite
     greps live SVG for exactly that substring to prove a rail row carries
     NO cond capsule, and a hero's own what-if aria-label sitting right next
     to it would otherwise false-positive that check. */
  return "<rect data-whatif='" + esc(nameLc) + "' tabindex='0' role='button' aria-label='" +
    esc('what-if: ' + display + ' pays off / fails — cycles') +
    "' x='" + x + "' y='" + y + "' width='" + w + "' height='" + h + "' fill='transparent'/>";
}
