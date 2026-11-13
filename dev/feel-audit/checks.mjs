/* Check registry and the stated expectations. A check is a measured value held to an
   expectation; `known` marks a check that the 2026-11-13 audit confirmed as a defect,
   so a fix can be shown red (known FAIL) then green (PASS, and the known tag removed). */
export const BAR = {
  paint: {normal: 100, cpu4x: 200},          // input -> next paint, ms
  settleView: {normal: 350, cpu4x: 900},     // view switch fully settled, ms
  settleEdit: {normal: 350, cpu4x: 1000},    // an edit commit visibly applied, ms
  keyRender: {normal: 200, cpu4x: 500},      // keystroke -> artefact updated, ms
  menuOpen: {normal: 50, cpu4x: 150},        // popover on screen after the click, ms
  feedback: 100,                             // every click acknowledged within, ms
  longTask: 50,
  tap: 44,
  inputFont: 16,
};

/* Checks confirmed as defects by the 2026-11-13 audit (findings.json ids in comments).
   'id' tags every location; 'id@where' tags locations whose where-string contains it. */
export const KNOWN = new Set([
  'load.example.cls', 'load.dense.cls',                                   // F01
  'load.example.replacements', 'load.dense.replacements',                 // F02
  'rail.open.layoutprops', 'rail.open.rerenders', 'rail.open.dropped',    // F05
  'rail.open.focus@timeline', 'rail.open.focus@roadmap',                  // F06, F07
  'eip.commit.focus', 'menu.commit.focus',                                // F08, F09
  'add.focus@roadmap', 'remove.focus',                                    // F10, F11
  'inspect.escape.focus@timeline/desktop', 'inspect.open.rerenders@timeline/desktop', // F12, F13
  'drag.dropgap', 'drag.glide', 'drag.frames',                            // F14, F15, F35
  'view.transition@roadmap',                                              // F16
  'menu.open.motion', 'add.motion',                                       // F18 (+ no entrance for added items)
  'disclosure.escape', 'disclosure.outside',                              // F19
  'disclosure.onscreen@phone', 'snapshot.feedback@phone',                 // F20
  'disclosure.onscreen@timeline/desktop',                                 // F21
  'copy.png.double', 'copy.md.label',                                     // F22, F23, F24
  'eip.invalid.visible',                                                  // F25
  'keyboard.tiny@timeline',                                               // F26
  'hover.silent',                                                         // F27
  'touch.dbltapzoom', 'touch.select@timeline', 'touch.targets@timeline',  // F28, F29, F30
  'touch.hoveronly@timeline',                                             // F31
  'menu.commit.settle@timeline',                                          // F32
  'deck.open.paint@timeline',                                             // F33
  'view.dense.longtask@timeline',                                         // F34
  'whatif.motion',                                                        // F37 (intermittent)
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
