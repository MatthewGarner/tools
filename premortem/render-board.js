/* The Facts / Assumptions / Beliefs board — Cutler's second front door onto the
   same doc. Facts are certainties (no promote); assumptions and beliefs carry a
   confidence range and a "promote to risk" button that flips the question from
   "how sure are we this holds?" to "how likely is it to break, and what does it
   cost?" — the promoted entry lands kind:'risk' in the register. Every user
   string through esc(); risks are NOT shown here (they live in the register). */
import {esc} from '../assets/svg.js';

const COLS = [
  ['fact', 'Facts', 'What we actually know — verified, not hoped'],
  ['assumption', 'Assumptions', 'Taken as true to move — but unverified'],
  ['belief', 'Beliefs', 'What we think will happen — our hypotheses'],
];
const article = w => /^[aeiou]/i.test(w) ? 'an' : 'a';

/* promotingId (optional) opens the inline promote form on one card. */
export function renderBoard(doc, now = new Date(), promotingId = null){
  const entries = doc.entries || [];
  const cols = COLS.map(([kind, label, hint]) => {
    const cards = entries.filter(e => e.kind === kind)
      .map(e => card(e, kind, e.id === promotingId)).join('');
    return '<section class="bcol" data-col="' + kind + '">' +
      '<h3 class="bcolh">' + label + '</h3>' +
      '<p class="bcolhint">' + hint + '</p>' +
      '<div class="bcards">' + cards + '</div>' +
      '<input class="badd" type="text" data-add-kind="' + kind + '" ' +
        'placeholder="Add ' + article(kind) + ' ' + kind + ' — press Enter" aria-label="Add ' + article(kind) + ' ' + kind + '">' +
      '</section>';
  }).join('');
  return '<div class="board">' + cols + '</div>' +
    '<p class="boardverdict">' + verdict(entries) + '</p>';
}

function card(e, kind, promoting){
  const promotable = kind !== 'fact';
  const conf = Array.isArray(e.p) ? e.p : null;
  const head = '<div class="bchead"><span class="bctext" data-id="' + e.id + '">' + esc(e.text) + '</span>' +
    '<button class="bcdel" data-boarddel="' + e.id + '" aria-label="Delete">×</button></div>';
  if(!promotable)
    return '<div class="bcard fact" data-id="' + e.id + '">' + head + '</div>';
  if(promoting){
    // p flips meaning: likelihood it BREAKS. Pre-fill from the inverse of the
    // confidence-it-holds range when we have one.
    const pf = conf ? [100 - conf[1], 100 - conf[0]] : [null, null];
    return '<div class="bcard promoting" data-id="' + e.id + '">' + head +
      '<div class="promoteform">' +
      '<p class="pfhint">If this is wrong: how likely, and what does it cost?</p>' +
      '<span class="scin"><label>likelihood wrong</label>' +
      '<input type="number" min="0" max="100" data-promotep="lo" data-id="' + e.id + '" value="' + (pf[0] ?? '') + '">–' +
      '<input type="number" min="0" max="100" data-promotep="hi" data-id="' + e.id + '" value="' + (pf[1] ?? '') + '">%</span>' +
      '<span class="scin"><label>impact</label>' +
      '<input type="number" min="0" data-promoteimpact="lo" data-id="' + e.id + '" value="">–' +
      '<input type="number" min="0" data-promoteimpact="hi" data-id="' + e.id + '" value=""></span>' +
      '<div class="pfbtns"><button class="btn primary" data-promoteok="' + e.id + '">Add to register</button>' +
      '<button class="btn" data-promotecancel="' + e.id + '">Cancel</button></div>' +
      '</div></div>';
  }
  return '<div class="bcard" data-id="' + e.id + '">' + head +
    '<span class="bconf"><label>confidence it holds</label>' +
    '<input type="number" min="0" max="100" data-conf="lo" data-id="' + e.id + '" value="' + (conf ? conf[0] : '') + '">–' +
    '<input type="number" min="0" max="100" data-conf="hi" data-id="' + e.id + '" value="' + (conf ? conf[1] : '') + '">%</span>' +
    '<button class="btn bcpromote" data-promote="' + e.id + '">Promote to risk →</button>' +
    '</div>';
}

function verdict(entries){
  const shaky = entries.filter(e => e.kind === 'assumption' || e.kind === 'belief').length;
  const facts = entries.filter(e => e.kind === 'fact').length;
  if(!shaky && !facts) return 'Empty board. Capture what you know, what you\'re assuming, and what you merely believe — then promote the shaky ones that would hurt if wrong.';
  if(!shaky) return facts + ' fact' + (facts === 1 ? '' : 's') + ' and nothing taken on faith — either this plan is unusually certain, or the assumptions are still hiding.';
  return shaky + ' assumption' + (shaky === 1 ? '' : 's') + ' &amp; belief' + (shaky === 1 ? '' : 's') +
    ' on the board — the ones that would hurt if wrong belong in the register. Promote them.';
}
