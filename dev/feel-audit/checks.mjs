/* Check registry and the stated expectations. A check is a measured value held to an
   expectation; `known` marks a check that the 2026-11-13 audit confirmed as a defect,
   so a fix can be shown red (known FAIL) then green (PASS, and the known tag removed). */
export const BAR = {
  paint: {normal: 100, cpu4x: 200},          // input -> next paint, ms
  settleView: {normal: 350, cpu4x: 900},     // view switch fully settled, ms
  settleEdit: {normal: 350, cpu4x: 1000},    // an edit commit visibly applied, ms
  commit: {normal: 50, cpu4x: 200},          // a discrete commit (Enter, menu pick, drop) -> the artefact repainted, ms
  pick: {normal: 100, cpu4x: 400},           // a menu pick -> artefact settled, ms
  keyRender: {normal: 200, cpu4x: 500},      // keystroke -> artefact updated, ms
  menuOpen: {normal: 50, cpu4x: 150},        // popover on screen after the click, ms
  feedback: 100,                             // every click acknowledged within, ms
  longTask: 50,
  tap: 44,
  inputFont: 16,
};

/* Checks confirmed as defects by the 2026-11-13 audit that are still open after the fix pass (the rest were fixed, passed, and
   lost their tag). 'id' tags every location; 'id@where' tags locations whose where-string contains it. */
export const KNOWN = new Set([
  'add.motion',                       // an added item has no entrance (the audit's F18 note; no ruling asked for one)
  'deck.open.paint@timeline',         // F33: one 80ms task building the deck pages before the dialog paints (left, under 100ms)
  'view.dense.longtask@timeline',     // F34: one 55-60ms task rendering the dense document (left; it is the renderer, not the FLIP)
]);

export function registry(){
  const rows = [];
  const check = (id, where, label, measured, pass, expected) => {
    const known = KNOWN.has(id) || [...KNOWN].some(k => { const [kid, kw] = k.split('@'); return kw && kid === id && where.includes(kw); });
    const row = {id, where, label, measured, expected, pass: !!pass, known};
    rows.push(row);
    const tag = row.pass ? 'PASS' : 'FAIL';
    console.log(`${tag}${row.known ? ' [known]' : ''} ${id} ${where} — ${label} | measured: ${fmt(measured)} | expected: ${expected}`);
    return row.pass;
  };
  const note = (id, where, label, measured) => {
    rows.push({id, where, label, measured, expected: 'recorded', pass: true, note: true});
    console.log(`NOTE ${id} ${where} — ${label} | ${fmt(measured)}`);
  };
  return {rows, check, note};
}

export const fmt = v => typeof v === 'string' ? v : JSON.stringify(v);
