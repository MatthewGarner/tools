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
   when the bet is unresolved IN THE TEXT WORLD. Takes `bets` — the TEXT-
   WORLD `model.bets` map (parse()'s own baked `.effective`, from the
   UNPROJECTED model, never a `applyWorld`-projected one) — deliberately NOT
   a full model, so a caller can never accidentally pass the projected
   model's bets by reusing the same variable name a render pass calls
   `model`. Reading the text-world map (rather than whatever preview is
   active) keeps the test stable across a click-cycle: a bet the text still
   calls unresolved stays previewable no matter what the CURRENT preview
   shows it as (won/lost), so the capsule can cycle round; a bet resolved in
   the TEXT, made MOOT by the cascade, or sitting in a condition CYCLE, is
   never previewable — a moot/cycle bet's own item is already dropped/
   unresolved-forever, so offering a world where it "pays off" is incoherent
   (review finding F2). Returns the lowercase bet name, or null. */
export function previewableBet(bets, it){
  if(!it || !it.bet) return null;
  const nameLc = it.bet.name.toLowerCase();
  const b = bets ? bets[nameLc] : null;
  if(!b || b.cycle || b.effective !== 'unresolved') return null;
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
    const word = it.dropReason.effective === 'won' ? 'paid off'
      : it.dropReason.effective === 'lost' ? "didn't" : 'never ran';
    return {kind: 'dropped', label: 'not needed — ' + it.dropReason.display + ' ' + word};
  }
  if(it.bet){
    const nameLc = it.bet.name.toLowerCase();
    const b = model && model.bets ? model.bets[nameLc] : null;
    const eff = b ? b.effective : 'unresolved';
    if(eff === 'won') return {kind: 'bet-won', label: it.bet.name + ' · paid off'};
    if(eff === 'lost') return {kind: 'bet-lost', label: it.bet.name + " · didn't"};
    if(eff === 'moot') return {kind: 'bet-moot', label: it.bet.name + ' · never ran'};
    return {kind: 'bet-open', label: 'bet: ' + it.bet.name};
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
   app.js's pointerdown handler ever sees data-whatif. CLICK is fine-pointer
   only — style.css's pointer-events:none default gates that (coarse pointers
   land on the card/menu instead, same as the drag armer) — but tabindex is a
   SEPARATE focus/keydown path that pointer-events can't gate: without the
   `coarse` flag below, a coarse-pointer device (an iPad with no attached
   keyboard, an iPhone under VoiceOver) still exposed an element promising
   "cycles" that nothing could actually reach, since CSS blocks its click and
   there's no hardware Enter key to fire the keydown either — VoiceOver
   announced an inert button (review F8). `coarse` (from ctx, computed once
   at render time by app.js's `matchMedia('(pointer: coarse)')`) omits
   tabindex/role/aria-label entirely on such a render — the rect still paints
   (geometry parity for anything depending on its presence) but is a plain,
   uninteresting shape to every assistive technology; the card menu's What-
   if… rows (A5) remain the coarse-pointer path, exactly as the fine-pointer-
   only click already assumed. A coarse device WITH a hardware keyboard loses
   Enter-cycling on the capsule, same trade the spec's coarse story takes
   everywhere else. single-quoted XML-legal attrs throughout. */
export function whatifHitRect(nameLc, display, x, y, w, h, coarse){
  /* wording avoids the literal substring "if <name>" (a colon, not a space,
     separates "what-if" from the bet name) — the render-conditional suite
     greps live SVG for exactly that substring to prove a rail row carries
     NO cond capsule, and a hero's own what-if aria-label sitting right next
     to it would otherwise false-positive that check. */
  const a11y = coarse ? '' : " tabindex='0' role='button' aria-label='" +
    esc('what-if: ' + display + " pays off / doesn't — cycles") + "'";
  return "<rect data-whatif='" + esc(nameLc) + "'" + a11y +
    " x='" + x + "' y='" + y + "' width='" + w + "' height='" + h + "' fill='transparent'/>";
}
