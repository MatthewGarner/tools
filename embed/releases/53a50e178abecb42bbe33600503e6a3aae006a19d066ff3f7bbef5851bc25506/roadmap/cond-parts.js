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

/* E9 honest counts: the shared "F + M conditional" label body, where F is
   the settled/unconditional share of an activeCount and M is its condCount
   (the caller passes both numbers, computed via parse.js's activeCount/
   condCount — this module stays render-primitive-only, no model walking).
   M === 0 returns the PLAIN count as a string — byte-identical to every
   count label that predates this slice, which is the whole point: a
   bet-free (or cond-free-at-this-column) doc never sees new text. board/
   focus/register share this exact "conditional" wording; render.js's grid
   uses its own tighter "COND" form (narrower columns, sometimes phone-width). */
export function condCountLabel(activeN, condN){
  if(!condN) return String(activeN);
  return (activeN - condN) + ' + ' + condN + ' conditional';
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

/* E1 board outcome zones (S3, Rev A): within a column, an OPEN non-cycle
   bet's [if]/[unless] riders group into "if so"/"if not" washes instead of
   riding the flat byLane order. Membership is by STATE, never by token: an
   item qualifies only when worldState==='cond' AND its cond names a bet
   that is CURRENTLY open (effective==='unresolved') and not sitting in a
   condition cycle. That excludes, on purpose: a [done][if x] item
   (worldState is null — done outranks the fork, stateOf() in parse.js),
   any dropped item (worldState is 'dropped', never 'cond'), and a cycle
   bet's own cond items (worldState is still 'cond', but the bet carries
   .cycle — its capsule already explains the state, so it stays in the
   live flow rather than getting a zone nobody can resolve). `list` is the
   column's already byLane-sorted item array; returns {live, zones} where
   `zones` holds ONLY bets that actually have >=1 member in THIS column,
   in srcLine (declaration) order — an empty half (no [if] or no [unless]
   member here) is simply an empty array on that side, so the caller skips
   painting it (empty half-zones don't paint). */
export function splitColumnZones(model, list){
  const bets = (model && model.bets) || {};
  const openBets = Object.keys(bets).map(k => bets[k])
    .filter(b => b.effective === 'unresolved' && !b.cycle)
    .sort((a, b) => a.srcLine - b.srcLine);
  const openNames = new Set(openBets.map(b => b.name.toLowerCase()));
  const isZoneMember = it => it.worldState === 'cond' && it.cond && openNames.has(it.cond.name.toLowerCase());
  const live = list.filter(it => !isZoneMember(it));
  const zones = [];
  for(const bet of openBets){
    const nameLc = bet.name.toLowerCase();
    const mine = it => isZoneMember(it) && it.cond.name.toLowerCase() === nameLc;
    const ifItems = list.filter(it => mine(it) && it.cond.when === 'if');
    const unlessItems = list.filter(it => mine(it) && it.cond.when === 'unless');
    if(ifItems.length || unlessItems.length) zones.push({bet, ifItems, unlessItems});
  }
  return {live, zones};
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

/* E10 (S4): the register's `group: outcome` lens — a pure REGROUPING over
   the same row list registerRows() already produces (h/lane/srcLine order is
   preserved WITHIN each section). Sections, in painting order:
     - EITHER WAY: unconditional in the current world (worldState === null) —
       includes bet-declaring items themselves and any item whose own cond
       already resolved to null (won/if or lost-unless).
     - per OPEN, non-cycle bet (srcLine — declaration order): ONLY IF <bet>
       PAYS OFF ([if] members, worldState==='cond') then ONLY IF IT DOESN'T
       ([unless] members) — membership by STATE not token, same rule
       splitColumnZones (S3) already established for the board.
     - IN A CONDITION CYCLE: cond items whose bet is stuck in a cycle — only
       emitted when non-empty (most docs never have one).
     - NOT NEEDED: worldState === 'dropped' (resolved-world casualties), last,
       muted — the register's existing dropped-row treatment already handles
       the visual weight; this section only handles ORDER.
   Empty sections are omitted outright (the caller never paints a bare
   header). Returns [{kind, label, items}] — `kind` doubles as the tint
   lookup key (outcomeSectionTint) so the two never drift apart. */
export function registerOutcomeGroups(model, rows){
  const bets = (model && model.bets) || {};
  const betList = Object.keys(bets).map(k => bets[k]);
  const openBets = betList.filter(b => b.effective === 'unresolved' && !b.cycle)
    .sort((a, b) => a.srcLine - b.srcLine);
  const cycleNames = new Set(betList.filter(b => b.cycle).map(b => b.name.toLowerCase()));
  const isCond = it => it.worldState === 'cond' && it.cond;

  const groups = [];
  const eitherWay = rows.filter(it => it.worldState === null);
  if(eitherWay.length) groups.push({kind: 'either', label: 'Either way', items: eitherWay});
  for(const bet of openBets){
    const nameLc = bet.name.toLowerCase();
    const mine = it => isCond(it) && it.cond.name.toLowerCase() === nameLc;
    const ifItems = rows.filter(it => mine(it) && it.cond.when === 'if');
    const unlessItems = rows.filter(it => mine(it) && it.cond.when === 'unless');
    if(ifItems.length) groups.push({kind: 'pays', label: 'Only if ' + bet.display + ' pays off', items: ifItems});
    if(unlessItems.length) groups.push({kind: 'not-pays', label: "Only if it doesn't", items: unlessItems});
  }
  const cycleItems = rows.filter(it => isCond(it) && cycleNames.has(it.cond.name.toLowerCase()));
  if(cycleItems.length) groups.push({kind: 'cycle', label: 'In a condition cycle', items: cycleItems});
  const notNeeded = rows.filter(it => it.worldState === 'dropped');
  if(notNeeded.length) groups.push({kind: 'not-needed', label: 'Not needed', items: notNeeded, muted: true});
  return groups;
}

/* Section header tint, by kind — reusing the same validated status-pill
   fill/ink pairs the board's zone washes (S3) already ride: pays-off tracks
   the done family, doesn't tracks blocked, cycle/not-needed/either stay
   neutral muted (no fork tension to signal). Callers paint a thin coloured
   rule at ~5% alpha under a letterspaced label — never a full wash — since
   a register row is already dense; see render-register.js. */
export function outcomeSectionTint(kind, C){
  switch(kind){
    case 'pays': return [C.status.done, C.statusInk.done];
    case 'not-pays': return [C.status.blocked, C.statusInk.blocked];
    case 'cycle':
    case 'not-needed': return [C.muted, C.muted];
    default: return [C.border, C.muted];   // 'either'
  }
}

/* E6 (S5, Rev A): the focus hero "hinges on" chain — walks an item's OWN
   condition up through the bet it names, to THAT bet's declaring item, to
   ITS OWN condition, and so on, root-first. NEW code (not a lift of
   rootResolvedBet, which walks dropReason and only makes sense for an
   already-dropped item — a link here can be a currently-OPEN fork). Each
   bet's declaring item is found via model.bets[nameLc].itemIndex, and the
   walk carries its OWN `visited` set (never the baked `b.cycle` flag) so a
   self-referential or mutually-referential chain terminates even before
   deriveWorld's own cycle detection would have caught it — belt and braces,
   cheap on any real doc (chains are short). Returns [] for an item with no
   cond (the common case) or one whose cond parse.js already nulled (a
   dangling "no such bet" condition, buildBets already warned). Each link is
   {name, display, when, state}; `state` prefers 'in a cycle' over the raw
   effective reading — a cycle bet reads unresolved forever, but the cycle
   is the more useful fact for a reader following the chain. */
export function betChain(model, it){
  const chain = [];
  const bets = (model && model.bets) || {};
  const items = (model && model.items) || [];
  const visited = new Set();
  let cond = it && it.cond;
  while(cond){
    const nameLc = cond.name.toLowerCase();
    if(visited.has(nameLc)) break;   // own cycle-guard, independent of b.cycle
    visited.add(nameLc);
    const b = bets[nameLc];
    if(!b) break;   // dangling condition — parse.js would already have nulled it
    const state = b.cycle ? 'in a cycle'
      : b.effective === 'won' ? 'paid off'
      : b.effective === 'lost' ? "didn't pay off"
      : b.effective === 'moot' ? 'never ran'
      : 'open';
    chain.unshift({name: b.name, display: b.display, when: cond.when, state});
    const declaring = items[b.itemIndex];
    cond = declaring ? declaring.cond : null;
  }
  return chain;
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
